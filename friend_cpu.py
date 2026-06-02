# ==========================================
# 🤖 友人戦 CPU 自動進行モジュール (friend_cpu.py)
#
# 既存の cpu_turn / check_cpu_reaction / その他の CPU 関連ロジック (main.py 内) を
# 友人戦から呼び出して、CPU 席の自動進行を実現する。
#
# 設計の鍵:
#  - `game.friend_seat_types` ... ["human"/"cpu"] x 4
#  - `game.friend_cpu_levels`  ... 各席の難易度 (None / 0:よわい / 1:ふつう / 2:つよい)
#  - 各CPUアクションの直前に `patch_cpu_level()` で `game.cpu_level` を一時的に
#    その席の値に書き換え、 cpu_turn 等の既存ロジックがそのまま動くようにする。
#  - 各CPU席に乱数で cpu_personalities[seat] を割り当てる（友人戦開始時）
# ==========================================
import asyncio
import random
import contextlib
import traceback


# ==========================================
# CPU の応答ウェイト（秒）
# ==========================================
CPU_WAIT_TURN = 1.2         # ツモ→打牌の遅延
CPU_WAIT_CALL_SKIP = 0.4    # 副露スキップ
CPU_WAIT_CALL_DO = 1.0      # 副露宣言
CPU_WAIT_CHARLESTON = 1.5   # 第1/第2交換選択
CPU_WAIT_BETWEEN_TURNS = 0.3 # CPU同士の連続ターン間


def scaled_wait(game, base_seconds: float) -> float:
    """game.friend_speed_mult を反映したウェイト秒数を返す。"""
    try:
        mult = float(getattr(game, 'friend_speed_mult', 1.0) or 1.0)
        if mult <= 0:
            mult = 1.0
    except Exception:
        mult = 1.0
    return max(0.05, base_seconds / mult)


# ==========================================
# 席判定 / 難易度パッチ
# ==========================================
def is_cpu_seat(game, seat_idx: int) -> bool:
    types = getattr(game, 'friend_seat_types', None)
    if not types or seat_idx < 0 or seat_idx >= len(types):
        return False
    return types[seat_idx] == "cpu"


def get_cpu_level_for_seat(game, seat_idx: int) -> int:
    levels = getattr(game, 'friend_cpu_levels', None)
    if not levels or seat_idx < 0 or seat_idx >= len(levels):
        return 1
    lv = levels[seat_idx]
    if lv is None:
        return 1
    return int(lv)


@contextlib.contextmanager
def patch_cpu_level(game, seat_idx: int):
    """既存のCPUロジックは `game.cpu_level` を読むので、一時的に書き換える。"""
    original = getattr(game, 'cpu_level', 1)
    try:
        game.cpu_level = get_cpu_level_for_seat(game, seat_idx)
        yield
    finally:
        game.cpu_level = original


def init_cpu_personalities_for_friend_game(game):
    """友人戦開始時に、CPU席の cpu_personalities を乱数で設定。人間席は空文字。"""
    if not hasattr(game, 'cpu_personalities') or len(game.cpu_personalities) < 4:
        game.cpu_personalities = ["", "", "", ""]
    types = getattr(game, 'friend_seat_types', ["human"] * 4)
    for i in range(4):
        if types[i] == "cpu":
            game.cpu_personalities[i] = random.randint(1, 4)
        else:
            game.cpu_personalities[i] = ""
    print(f"[FRIEND_CPU] CPU性格設定: {game.cpu_personalities}")


# ==========================================
# 第1交換: CPU席の3枚選択（main.py の charleston 内のCPUロジックを抽出）
# ==========================================
def cpu_pick_charleston_tiles(game, seat_idx: int):
    """CPU席が交換で出す3枚を選んで返す（手牌からは抜かない）。"""
    from main import SEASON_TILES, TILE_NAMES
    from mahjong_logic import determine_target, evaluate_tile_dynamically

    with patch_cpu_level(game, seat_idx):
        try:
            target = determine_target(seat_idx, game.hands[seat_idx], game)
            game.cpu_targets[seat_idx] = target
            valid_candidates = [t for t in game.hands[seat_idx] if t not in SEASON_TILES]
            personality = game.cpu_personalities[seat_idx] if game.cpu_personalities[seat_idx] else random.randint(1, 4)
            scored = [
                (t, evaluate_tile_dynamically(t, game.hands[seat_idx], game, seat_idx, personality) + random.randint(0, 5))
                for t in valid_candidates
            ]
            scored.sort(key=lambda x: x[1])
            passed = []
            temp_hand = list(game.hands[seat_idx])
            for st in scored:
                if st[0] in temp_hand:
                    passed.append(st[0])
                    temp_hand.remove(st[0])
                if len(passed) == 3:
                    break
            # 3枚未満なら手牌の先頭で埋める（理論上発生しないが安全策）
            while len(passed) < 3:
                for t in game.hands[seat_idx]:
                    if t not in passed:
                        passed.append(t)
                        break
                if len(passed) < 3:
                    break
            return passed[:3]
        except Exception as e:
            print(f"[FRIEND_CPU] cpu_pick_charleston_tiles 失敗 (seat {seat_idx}): {e}")
            traceback.print_exc()
            return list(game.hands[seat_idx][:3])


# ==========================================
# 第2交換: 参加判断 + 3枚選択
# ==========================================
def cpu_should_join_second_charleston(game, seat_idx: int) -> bool:
    """CPU席が第2交換に参加するか。"""
    from main import should_cpu_participate_second_charleston
    with patch_cpu_level(game, seat_idx):
        try:
            result = should_cpu_participate_second_charleston(seat_idx, game=game)
            return bool(result.get("participate", False))
        except Exception as e:
            print(f"[FRIEND_CPU] cpu_should_join_second_charleston 失敗: {e}")
            return False


# ==========================================
# 副露判断
# ==========================================
def cpu_react_to_discard(game, discarder_idx: int, tile: str, cpu_idx: int, is_kakan: bool = False):
    """CPU席が他者の打牌に対してどう反応するか。
    返り値: {"action": "skip"/"ron"/"pon"/"kan"/"hanakan", ...}

    既存の check_cpu_reaction は副露・打牌まで一気に実行してしまうので、
    そのロジックを部分的に複製して「判断だけ」する。
    """
    from main import SEASON_TILES
    from mahjong_logic import (
        is_agari, get_waits_for_hand, determine_target,
        evaluate_tile_dynamically, get_visible_count
    )

    try:
        is_haitei = (len(game.wall) == 0)

        with patch_cpu_level(game, cpu_idx):
            # ===== ロン判定 =====
            if cpu_idx != discarder_idx:
                ctx = {
                    "winning_tile": tile, "is_tsumo": False, "is_haitei": is_haitei,
                    "is_joker_swap": False, "is_rinshan": False, "is_chankan": is_kakan,
                    "is_first_turn": game.is_first_turn[cpu_idx],
                    "any_meld_occurred": game.any_meld_occurred,
                    "is_dealer": game.dealer == cpu_idx, "discards_count": game.discards_count
                }
                data = {"closed_tiles": " ".join(game.hands[cpu_idx]), "melds": game.melds[cpu_idx], "win_context": ctx}
                if is_agari(data):
                    has_won_already = len(game.win_tiles[cpu_idx]) > 0
                    has_season_in_hand = any(t in SEASON_TILES for t in game.hands[cpu_idx]) or any(
                        t in SEASON_TILES for m in game.melds[cpu_idx] for t in m["tiles"]
                    )
                    is_pass = False
                    target = determine_target(cpu_idx, game.hands[cpu_idx], game)
                    personality = game.cpu_personalities[cpu_idx] if game.cpu_personalities[cpu_idx] else 1

                    if not has_won_already and has_season_in_hand:
                        is_hanari_zentan = (target == "全単")
                        jokers_count = sum(1 for t in game.hands[cpu_idx] + [tile] if t in SEASON_TILES)
                        is_hanari_qixing = (target == "七星不靠" and jokers_count == 1 and personality in [1, 2])
                        if (is_hanari_zentan or is_hanari_qixing) and len(game.wall) > 20:
                            is_pass = True
                        if target == "十三幺九":
                            waits = get_waits_for_hand(game.hands[cpu_idx], game.melds[cpu_idx])
                            if len(waits) < 13:
                                remaining = 0
                                for w in waits:
                                    visible = get_visible_count(w, game)
                                    remaining += max(0, 4 - visible - game.hands[cpu_idx].count(w))
                                if len(game.wall) >= 24 and remaining >= 3:
                                    is_pass = True
                        # つよい以外（よわい/ふつう）は欲張らず即和了
                        if game.cpu_level == 2 and len(game.wall) > 20:
                            waits = get_waits_for_hand(game.hands[cpu_idx], game.melds[cpu_idx])
                            if len(waits) < 27:
                                is_pass = True

                    if not is_pass:
                        return {"action": "ron"}

            # 槍槓中はポン/カン不可
            if is_kakan:
                return {"action": "skip"}

            # 海底中はポン/カン不可（ロンは可、上で済）
            if is_haitei:
                return {"action": "skip"}

            # 既に和了済みなら鳴かない
            if len(game.win_tiles[cpu_idx]) > 0:
                return {"action": "skip"}

            current_target = determine_target(cpu_idx, game.hands[cpu_idx], game)
            # 一色四歩高・十三幺九・七星不靠・全単狙いは鳴かない
            if current_target in ["十三幺九", "七星不靠", "全単"]:
                return {"action": "skip"}

            # ===== 花槓 (相手の打牌が季節牌で、 自分が2枚同種を持っている) =====
            if tile in SEASON_TILES:
                # 任意の手牌1枚で同種2枚持っているか確認
                for h_tile in set(game.hands[cpu_idx]):
                    if h_tile in SEASON_TILES:
                        continue
                    if game.hands[cpu_idx].count(h_tile) >= 2:
                        # 花槓宣言してよい (シンプルにOK)
                        return {"action": "hanakan", "season": tile, "tile": h_tile}
                return {"action": "skip"}

            # ===== ポン / 大明槓 =====
            count = game.hands[cpu_idx].count(tile)
            if count >= 2:
                # 鳴き見逃し（cpu_level に応じて）
                level = game.cpu_level
                if level == 0:
                    if random.random() < 0.5:
                        return {"action": "skip"}
                elif level == 1:
                    if random.random() < 0.2:
                        return {"action": "skip"}

                personality = game.cpu_personalities[cpu_idx] if game.cpu_personalities[cpu_idx] else 1
                temp_hand_with_meld = list(game.hands[cpu_idx])
                temp_hand_with_meld.extend([tile, tile])
                score_if_meld = evaluate_tile_dynamically(tile, temp_hand_with_meld, game, cpu_idx, personality)
                if score_if_meld > 80 or (count >= 3):
                    if count >= 3:
                        return {"action": "kan"}
                    else:
                        return {"action": "pon"}

            return {"action": "skip"}
    except Exception as e:
        print(f"[FRIEND_CPU] cpu_react_to_discard 失敗: {e}")
        traceback.print_exc()
        return {"action": "skip"}


# ==========================================
# 自分のターン処理（既存 cpu_turn を呼ぶ）
# ==========================================
def cpu_do_turn(game, seat_idx: int):
    """CPU席の1ターンを処理。
    返り値は cpu_turn そのまま（{"tsumo": bool, "discard": tile, ...}）。
    """
    from main import cpu_turn
    with patch_cpu_level(game, seat_idx):
        try:
            return cpu_turn(cpu_idx=seat_idx, game=game)
        except Exception as e:
            print(f"[FRIEND_CPU] cpu_do_turn 失敗 (seat {seat_idx}): {e}")
            traceback.print_exc()
            return {"error": str(e)}


def cpu_pick_discard_only(game, seat_idx: int):
    """副露直後で「ツモなし、打牌だけ」を行うケース用。
    手牌から評価値最低の牌を捨てて、 turn を進める。
    cpu_turn のような全機能（暗槓・花槓・和了等）は含まない。
    返り値: {"discard": tile}
    """
    from mahjong_logic import evaluate_tile_dynamically
    with patch_cpu_level(game, seat_idx):
        try:
            personality = game.cpu_personalities[seat_idx] if game.cpu_personalities[seat_idx] else random.randint(1, 4)
            scored = [
                (t, evaluate_tile_dynamically(t, game.hands[seat_idx], game, seat_idx, personality) + random.randint(0, 5))
                for t in game.hands[seat_idx]
            ]
            scored.sort(key=lambda x: x[1])
            discard = scored[0][0]
            # 実行: 手牌から削除、 河に追加、 turn 進行
            game.hands[seat_idx].remove(discard)
            game.discards[seat_idx].append(discard)
            game.is_first_turn[seat_idx] = False
            game.hands[seat_idx] = game.sort_hand(game.hands[seat_idx])
            game.turn = (seat_idx + 1) % 4
            game.just_drawn = -1
            game.last_discard_info = {"player": seat_idx, "tile": discard}
            game.discards_count += 1
            game.append_log("discard", player=seat_idx, tile=discard, tsumogiri=False)
            print(f"[FRIEND_CPU] 副露後打牌 seat {seat_idx}: {discard}")
            return {"discard": discard, "did_kakan": False, "did_joker_swap": False, "kakan_tile": ""}
        except Exception as e:
            print(f"[FRIEND_CPU] cpu_pick_discard_only 失敗 (seat {seat_idx}): {e}")
            traceback.print_exc()
            return {"error": str(e)}
        #デプロイ用コメント1