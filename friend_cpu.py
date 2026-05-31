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
    """
    from main import check_cpu_reaction
    with patch_cpu_level(game, cpu_idx):
        try:
            result = check_cpu_reaction(
                discarder_idx=discarder_idx, tile=tile,
                is_kakan=("true" if is_kakan else "false"),
                game=game
            )
            # check_cpu_reaction は cpu インデックスごとに辞書を返す
            per_cpu = None
            if isinstance(result, dict):
                per_cpu = result.get(str(cpu_idx), None)
                if per_cpu is None:
                    per_cpu = result.get(cpu_idx, None)
            if per_cpu is None:
                return {"action": "skip"}
            return per_cpu
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