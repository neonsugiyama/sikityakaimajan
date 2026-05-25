# ==========================================
# 🤝 友人戦専用のサーバーロジック (friend_routes.py)
# ==========================================
# 設計方針:
# - CPU戦のREST API (/draw, /discard 等) は一切変更しない
# - 友人戦は /friend/* のエンドポイントを通して独立して動作する
# - GameState や評価関数などは main.py から import して再利用する
# - 対局中のリアルタイム同期は /friend/ws/{room_id} のWebSocketで行う

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from typing import Dict, List
import traceback

router = APIRouter(prefix="/friend")


# ==========================================
# 友人戦の対局中WS接続を管理するクラス
# ==========================================
class FriendGameConnections:
    """ロビーWSとは別に「対局中のWS」を管理する。
    ロビーWSは4人揃ったらゲーム画面に遷移するための仕組み。
    こちらは対局中のリアルタイム同期用。"""

    def __init__(self):
        # room_id → [WebSocket, WebSocket, WebSocket, WebSocket]（player_idx順）
        self.connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room_id: str, player_idx: int):
        await websocket.accept()
        if room_id not in self.connections:
            self.connections[room_id] = [None, None, None, None]
        self.connections[room_id][player_idx] = websocket
        print(f"[FRIEND WS] Room {room_id} に Player {player_idx} が接続")

    def disconnect(self, websocket: WebSocket, room_id: str):
        if room_id not in self.connections:
            return
        for i, conn in enumerate(self.connections[room_id]):
            if conn is websocket:
                self.connections[room_id][i] = None
                print(f"[FRIEND WS] Room {room_id} の Player {i} が切断")
                break
        if not any(self.connections[room_id]):
            del self.connections[room_id]
            print(f"[FRIEND WS] Room {room_id} の対局WS接続を全削除")
            # 対局WSが全切断 → ゲーム状態もクリーンアップ
            try:
                from main import lobby_manager
                if room_id in lobby_manager.games: del lobby_manager.games[room_id]
                if room_id in lobby_manager.charleston_selections: del lobby_manager.charleston_selections[room_id]
                if room_id in lobby_manager.second_charleston_confirms: del lobby_manager.second_charleston_confirms[room_id]
                if room_id in lobby_manager.second_charleston_selections: del lobby_manager.second_charleston_selections[room_id]
                if hasattr(lobby_manager, 'player_names') and room_id in lobby_manager.player_names:
                    del lobby_manager.player_names[room_id]
                print(f"[FRIEND WS] Room {room_id} の game 状態を完全削除しました。")
            except Exception as e:
                print(f"[FRIEND WS] cleanup失敗: {e}")

    async def broadcast(self, room_id: str, message: dict):
        """ルーム内の全プレイヤーに同じメッセージを送信"""
        if room_id not in self.connections:
            return
        for conn in self.connections[room_id]:
            if conn is None:
                continue
            try:
                await conn.send_json(message)
            except Exception as e:
                print(f"[FRIEND WS] 送信失敗: {e}")

    async def send_to(self, room_id: str, player_idx: int, message: dict):
        """特定のプレイヤーだけに送信（視点ごとに異なるstateを送る用）"""
        if room_id not in self.connections:
            return
        conn = self.connections[room_id][player_idx]
        if conn is None:
            return
        try:
            await conn.send_json(message)
        except Exception as e:
            print(f"[FRIEND WS] 個別送信失敗 (player {player_idx}): {e}")


friend_connections = FriendGameConnections()


# ==========================================
# 視点回転ユーティリティ
# ==========================================
def rotate_for_player(arr: list, player_idx: int) -> list:
    """サーバー絶対座席のリストを、指定プレイヤーから見た相対順 [自分, 下家, 対面, 上家] に並び替え"""
    return [arr[(player_idx + i) % 4] for i in range(4)]


def get_friend_state_for_player(game, player_idx: int) -> dict:
    """指定プレイヤー視点に回転した state を作る。
    CPU戦の get_safe_state とフィールド名を合わせる。"""
    # 全プレイヤーの手牌（自分以外は「ura」プレースホルダー）
    all_hands_display = []
    for i in range(4):
        actual_seat = (player_idx + i) % 4
        if i == 0:
            all_hands_display.append(list(game.hands[actual_seat]))
        else:
            all_hands_display.append(["ura"] * len(game.hands[actual_seat]))

    # 開発者モード用（全員の実手牌、視点回転済み）
    dev_all_hands = [list(game.hands[(player_idx + i) % 4]) for i in range(4)]

    state = {
        "status": "success",
        "player_hand": game.hands[player_idx],
        "player_melds": game.melds[player_idx],
        "player_win_tiles": game.win_tiles[player_idx],
        "wall_count": len(game.wall),
        # turn は「自分から見た相対値」に変換: 0=自分, 1=下家, 2=対面, 3=上家
        "turn": (game.turn - player_idx + 4) % 4,
        "dealer": (game.dealer - player_idx + 4) % 4,
        "current_round": game.current_round,
        "scores": rotate_for_player(game.scores, player_idx),
        "total_scores": rotate_for_player(game.total_scores, player_idx),
        "all_hands": all_hands_display,
        "dev_all_hands": dev_all_hands,
        "all_melds": rotate_for_player(game.melds, player_idx),
        "all_win_tiles": rotate_for_player(game.win_tiles, player_idx),
        "discards": [list(d) for d in rotate_for_player(game.discards, player_idx)],
        "discards_count": game.discards_count,
        "any_meld_occurred": game.any_meld_occurred,
        "just_drawn": (game.just_drawn - player_idx + 4) % 4 if game.just_drawn >= 0 else -1,
        "last_drawn": rotate_for_player(game.last_drawn, player_idx),
        "last_discard_info": {
            "player": (game.last_discard_info["player"] - player_idx + 4) % 4 if game.last_discard_info.get("player", -1) >= 0 else -1,
            "tile": game.last_discard_info.get("tile", "")
        },
        "round_calculated": getattr(game, 'round_calculated', False),
        "charleston_done": getattr(game, 'charleston_done', False),
        "second_charleston_done": getattr(game, 'second_charleston_done', False),
        "cpu_targets": ["", "", "", ""],  # 友人戦ではCPUなし
        "cpu_personalities": [0, 0, 0, 0],
        # 友人戦特有: プレイヤー名（視点回転済み）
        "player_names": rotate_for_player(
            getattr(game, 'friend_player_names', [f"Player {i}" for i in range(4)]),
            player_idx
        ),
    }
    return state




# ==========================================
# REST: 第1交換（チャールストン）の3枚提出
# ==========================================
@router.get("/charleston_submit")
async def friend_charleston_submit(room_id: str, player_idx: int, t1: str, t2: str, t3: str):
    """4人全員が3枚提出するまで蓄積し、揃ったら交換実行 → WSでbroadcast。"""
    import random
    from main import lobby_manager, SEASON_TILES

    if room_id not in lobby_manager.games:
        raise HTTPException(status_code=404, detail="対局が見つかりません")
    game = lobby_manager.games[room_id]

    # 既に第1交換完了済みなら無視
    if getattr(game, 'charleston_done', False):
        return {"status": "already_done"}

    # 選択を記録
    if room_id not in lobby_manager.charleston_selections:
        lobby_manager.charleston_selections[room_id] = {}
    selections = lobby_manager.charleston_selections[room_id]
    selections[player_idx] = [t1, t2, t3]

    # この時点で「player_idx は選択済み」を全員に通知
    await friend_connections.broadcast(room_id, {
        "type": "charleston_player_ready",
        "player_idx": player_idx
    })

    # 全員揃ったかチェック
    if len(selections) < 4:
        return {"status": "waiting", "submitted": len(selections)}

    # === 全員揃った: 実行 ===
    print(f"[FRIEND] Room {room_id}: 第1交換 4人全員揃った。実行します")

    # 各プレイヤーの手牌から提出した牌を抜く
    all_passed = [selections[i] for i in range(4)]
    for i in range(4):
        for t in all_passed[i]:
            if t in game.hands[i]:
                game.hands[i].remove(t)

    # サイコロを振って方向決定
    dice = random.randint(1, 6)
    if dice in [1, 2]:
        offset, msg = -1, "下家(右)へ交換"
    elif dice in [3, 4]:
        offset, msg = -2, "対面(正面)へ交換"
    else:
        offset, msg = 1, "上家(左)へ交換"

    # 交換実行
    received_tiles = [[] for _ in range(4)]
    for i in range(4):
        giver_idx = (i + offset) % 4
        game.hands[i].extend(all_passed[giver_idx])
        received_tiles[i] = all_passed[giver_idx]
        game.hands[i] = game.sort_hand(game.hands[i])

    game.just_drawn = -1
    game.last_discard_info = {"player": -1, "tile": ""}
    game.charleston_done = True

    # 各プレイヤーに視点回転済みstate + dice/direction を送信
    for p in range(4):
        state = get_friend_state_for_player(game, p)
        await friend_connections.send_to(room_id, p, {
            "type": "charleston_complete",
            "dice": dice,
            "direction": msg,
            "offset": offset,
            "state": state
        })

    # 選択辞書をクリア（メモリ節約・次局のため）
    del lobby_manager.charleston_selections[room_id]

    return {"status": "complete", "dice": dice, "direction": msg}



# ==========================================
# REST: 第2交換の回答提出（参加 or スキップ）
# ==========================================
@router.get("/second_charleston_submit")
async def friend_second_charleston_submit(
    room_id: str, player_idx: int, participate: str = "false",
    t1: str = "", t2: str = "", t3: str = ""
):
    """各プレイヤーが「参加する/スキップ」を順番に提出。全員揃ったら自動的に交換実行。"""
    import random
    from main import lobby_manager, SEASON_TILES

    if room_id not in lobby_manager.games:
        raise HTTPException(status_code=404, detail="対局が見つかりません")
    game = lobby_manager.games[room_id]

    if getattr(game, 'second_charleston_done', False):
        return {"status": "already_done"}

    participates = participate.lower() == "true"

    # 蓄積場所の初期化
    if room_id not in lobby_manager.second_charleston_confirms:
        lobby_manager.second_charleston_confirms[room_id] = {}
    if room_id not in lobby_manager.second_charleston_selections:
        lobby_manager.second_charleston_selections[room_id] = {}
    confirms = lobby_manager.second_charleston_confirms[room_id]
    selections = lobby_manager.second_charleston_selections[room_id]

    confirms[player_idx] = participates
    if participates:
        selections[player_idx] = [t1, t2, t3]
        # 提出した牌を手牌から先に抜いておく（不成立時に戻す処理は後で）
        for t in [t1, t2, t3]:
            if t in game.hands[player_idx]:
                game.hands[player_idx].remove(t)

    # 「player_idx が回答した」を全員に通知（次の番のプレイヤーに進ませる用）
    await friend_connections.broadcast(room_id, {
        "type": "second_charleston_player_done",
        "player_idx": player_idx,
        "participate": participates
    })

    if len(confirms) < 4:
        return {"status": "waiting", "confirmed": len(confirms)}

    # === 全員揃った: 実行 ===
    active = [i for i in range(4) if confirms[i]]
    print(f"[FRIEND] 第2交換 全員回答完了。参加者: {active}")

    if len(active) <= 1:
        # 不成立: 提出済みの牌を手牌に戻す
        for p in active:
            if p in selections:
                game.hands[p].extend(selections[p])
                game.hands[p] = game.sort_hand(game.hands[p])
        game.second_charleston_done = True
        # 全員にスキップを通知
        for p in range(4):
            state = get_friend_state_for_player(game, p)
            await friend_connections.send_to(room_id, p, {
                "type": "second_charleston_complete",
                "skipped": True,
                "dice": 0,
                "direction": "参加者が足りないため不成立となりました",
                "active_players": active,
                "state": state
            })
        # クリーンアップ
        del lobby_manager.second_charleston_confirms[room_id]
        del lobby_manager.second_charleston_selections[room_id]
        return {"status": "skipped"}

    # 交換実行
    dice = random.randint(1, 6)
    msg = ""

    if len(active) == 4:
        if dice in [1, 2]: offset, msg = -1, "下家(右)へ交換"
        elif dice in [3, 4]: offset, msg = -2, "対面(正面)へ交換"
        else: offset, msg = 1, "上家(左)へ交換"
        for i in range(4):
            giver_idx = (i + offset) % 4
            game.hands[i].extend(selections[giver_idx])

    elif len(active) == 3:
        if dice in [1, 2, 3]: offset_idx, msg = -1, "参加者間で右回り(下家方向)に交換"
        else: offset_idx, msg = 1, "参加者間で左回り(上家方向)に交換"
        for idx, player in enumerate(active):
            giver_idx = active[(idx + offset_idx) % len(active)]
            game.hands[player].extend(selections[giver_idx])

    elif len(active) == 2:
        dice, msg = 0, "2人で直接交換"
        pA, pB = active[0], active[1]
        game.hands[pA].extend(selections[pB])
        game.hands[pB].extend(selections[pA])

    for i in range(4):
        game.hands[i] = game.sort_hand(game.hands[i])
    game.just_drawn = -1
    game.last_discard_info = {"player": -1, "tile": ""}
    game.second_charleston_done = True

    # 各プレイヤーに視点回転済みstateを送信
    for p in range(4):
        state = get_friend_state_for_player(game, p)
        await friend_connections.send_to(room_id, p, {
            "type": "second_charleston_complete",
            "skipped": False,
            "dice": dice,
            "direction": msg,
            "active_players": active,
            "state": state
        })

    # クリーンアップ
    del lobby_manager.second_charleston_confirms[room_id]
    del lobby_manager.second_charleston_selections[room_id]
    return {"status": "complete", "dice": dice, "direction": msg}



# ==========================================
# REST: ツモ
# ==========================================
@router.get("/draw")
async def friend_draw(room_id: str, player_idx: int):
    from main import lobby_manager
    if room_id not in lobby_manager.games:
        raise HTTPException(status_code=404, detail="対局が見つかりません")
    game = lobby_manager.games[room_id]
    if not game.wall:
        return {"error": "流局"}
    tile = game.wall.pop()
    game.hands[player_idx].append(tile)
    game.last_drawn[player_idx] = tile
    game.hands[player_idx] = game.sort_hand(game.hands[player_idx])
    game.just_drawn = player_idx
    game.last_discard_info = {"player": -1, "tile": ""}
    game.append_log("draw", player=player_idx, tile=tile)

    # 自分（呼び出し元）には実際の牌を含むstateを返す
    my_state = get_friend_state_for_player(game, player_idx)
    my_state["drawn_tile"] = tile

    # 他プレイヤーには WS で「draw」イベント + 視点回転済みstateを送る
    for p in range(4):
        if p == player_idx:
            continue
        state = get_friend_state_for_player(game, p)
        await friend_connections.send_to(room_id, p, {
            "type": "friend_draw",
            "player_idx": player_idx,
            "state": state
        })
    return my_state


# ==========================================
# REST: 打牌
# ==========================================
def _check_reaction_possible(game, responder_idx: int, tile: str) -> dict:
    """指定プレイヤーが、打牌された tile に対してロン/ポン/カン/花槓のいずれかができるか判定"""
    from main import SEASON_TILES, is_agari
    can_ron = False
    can_pon = False
    can_kan = False
    can_hanakan = False

    # 🌟 アガリ放題ルール: 既に和了済みでも追加で和了できる。ガードしない
    # （ポン・カン・花槓は和了後にツモ切りしかできない制約があるので別途判定）

    is_haitei = (len(game.wall) == 0)

    # ロン判定
    try:
        win_ctx = {
            "winning_tile": tile, "is_tsumo": False, "is_haitei": is_haitei,
            "is_joker_swap": False, "is_rinshan": False, "is_chankan": False,
            "is_first_turn": game.is_first_turn[responder_idx],
            "any_meld_occurred": game.any_meld_occurred,
            "is_dealer": game.dealer == responder_idx,
            "discards_count": game.discards_count,
        }
        # 🌟 ロン判定: closed_tiles は手牌そのまま（13枚 - 副露3枚×N）、winning_tile は別途
        check_data = {
            "closed_tiles": " ".join(game.hands[responder_idx]),
            "melds": game.melds[responder_idx],
            "win_context": win_ctx
        }
        total_tiles = len(game.hands[responder_idx]) + 1 + len(game.melds[responder_idx]) * 3
        if total_tiles == 14 and is_agari(check_data):
            can_ron = True
    except Exception:
        pass

    # ポン・明槓・花槓判定（季節牌が捨てられた場合はNG）
    if tile not in SEASON_TILES:
        cnt = game.hands[responder_idx].count(tile)
        if cnt >= 2:
            can_pon = True
            if any(t in SEASON_TILES for t in game.hands[responder_idx]):
                can_hanakan = True
        if cnt >= 3:
            can_kan = True

    return {"ron": can_ron, "pon": can_pon, "kan": can_kan, "hanakan": can_hanakan}


@router.get("/discard")
async def friend_discard(room_id: str, player_idx: int, tile: str):
    """打牌処理: 副露猶予を設けてから turn 進行"""
    import asyncio
    from main import lobby_manager
    if room_id not in lobby_manager.games:
        raise HTTPException(status_code=404, detail="対局が見つかりません")
    game = lobby_manager.games[room_id]

    if tile not in game.hands[player_idx]:
        return {"error": "通信エラー: 牌が見つかりません"}

    # 打牌処理
    game.hands[player_idx].remove(tile)
    game.discards[player_idx].append(tile)
    game.discards_count += 1
    game.just_drawn = -1
    game.last_discard_info = {"player": player_idx, "tile": tile}
    game.is_first_turn[player_idx] = False
    game.append_log("discard", player=player_idx, tile=tile,
                    tsumogiri=(tile == game.last_drawn[player_idx]))

    # 反応可能なプレイヤーを集計
    reactions = {}
    responders = []
    for p in range(4):
        if p == player_idx:
            continue
        r = _check_reaction_possible(game, p, tile)
        reactions[p] = r
        if any(r.values()):
            responders.append(p)

    # 反応可能なプレイヤーがいない → 即 turn 進行
    if not responders:
        game.turn = (player_idx + 1) % 4
        # 全員に friend_discard を送る + 打牌者には call_resolved を送って checkT させる
        for p in range(4):
            if p == player_idx:
                state = get_friend_state_for_player(game, p)
                await friend_connections.send_to(room_id, p, {
                    "type": "call_resolved",
                    "resolution": "skip",
                    "state": state
                })
                continue
            state = get_friend_state_for_player(game, p)
            await friend_connections.send_to(room_id, p, {
                "type": "friend_discard",
                "player_idx": player_idx,
                "tile": tile,
                "can_ron": False, "can_pon": False, "can_kan": False, "can_hanakan": False,
                "state": state
            })
        return get_friend_state_for_player(game, player_idx)

    # 副露猶予を開始
    game.pending_call = {
        "discarder": player_idx,
        "tile": tile,
        "responders": list(responders),
        "responses": {},
        "resolved": False
    }

    # 各プレイヤーに WS で「discard」イベント + 反応可能フラグを送る
    for p in range(4):
        if p == player_idx:
            continue
        r = reactions[p]
        state = get_friend_state_for_player(game, p)
        await friend_connections.send_to(room_id, p, {
            "type": "friend_discard",
            "player_idx": player_idx,
            "tile": tile,
            "can_ron": r["ron"], "can_pon": r["pon"], "can_kan": r["kan"], "can_hanakan": r["hanakan"],
            "state": state
        })

    # 全 responder の応答を待つ（最大 12秒）
    TIMEOUT = 12.0
    POLL = 0.1
    elapsed = 0.0
    while elapsed < TIMEOUT:
        pc = getattr(game, 'pending_call', None)
        if not pc or pc.get("resolved"):
            break
        if len(pc["responses"]) >= len(pc["responders"]):
            break
        await asyncio.sleep(POLL)
        elapsed += POLL

    pc = getattr(game, 'pending_call', None)
    if pc and not pc.get("resolved"):
        # タイムアウト: 未応答者は skip 扱い
        for r in pc["responders"]:
            if r not in pc["responses"]:
                pc["responses"][r] = "skip"
        # 副露判定
        await _resolve_friend_call(room_id, game)

    return get_friend_state_for_player(game, player_idx)


async def _resolve_friend_call(room_id: str, game):
    """副露猶予の応答を集計して優先順位で実行。
    優先順位: ron > kan > pon > hanakan > skip
    ron は同時宣言時に「頭ハネ」(discarder の次から時計回りで近い人) で1人だけ勝つ。
    ステップ5b では ron のみ実装。pon/kan/hanakan は次以降のステップ。
    """
    from main import is_agari, get_special_effects, SEASON_TILES
    pc = getattr(game, 'pending_call', None)
    if not pc or pc.get("resolved"):
        return
    pc["resolved"] = True

    discarder = pc["discarder"]
    tile = pc["tile"]
    responses = pc["responses"]
    is_haitei = (len(game.wall) == 0)

    # ===== ロン宣言の処理（頭ハネ） =====
    ron_claimers = [p for p, r in responses.items() if r == "ron"]
    if ron_claimers:
        # 頭ハネ: discarder の次から時計回りで最も近い人
        order = [(discarder + 1) % 4, (discarder + 2) % 4, (discarder + 3) % 4]
        winner = next((p for p in order if p in ron_claimers), ron_claimers[0])

        # 河から打牌牌を取り除く
        if game.discards[discarder] and game.discards[discarder][-1] == tile:
            game.discards[discarder].pop()

        # 和了処理
        ctx = {
            "winning_tile": tile,
            "is_tsumo": False,
            "is_haitei": is_haitei,
            "is_joker_swap": False,
            "is_rinshan": False,
            "is_chankan": False,
            "is_first_turn": game.is_first_turn[winner],
            "any_meld_occurred": game.any_meld_occurred,
            "is_dealer": game.dealer == winner,
            "discards_count": game.discards_count,
        }
        game.win_records[winner].append(ctx)
        game.win_tiles[winner].append(tile)
        game.is_first_turn[winner] = False
        game.last_discard_info = {"player": -1, "tile": ""}

        effects = get_special_effects(game, winner, ctx)
        game.append_log("win", player=winner, method="ron", tile=tile, from_player=discarder)

        # アガリ放題: ターンは打牌者の次に進む（勝者ではない）
        # ただし山が空（海底ロン後）なら局終了は後のステップで実装
        game.turn = (discarder + 1) % 4
        game.pending_call = None

        # 全プレイヤーに win イベントを broadcast
        for p in range(4):
            state = get_friend_state_for_player(game, p)
            await friend_connections.send_to(room_id, p, {
                "type": "friend_win",
                "win_type": "ron",
                "player_idx": winner,
                "from_player": discarder,
                "tile": tile,
                "yaku": effects,
                "state": state
            })
        return

    # ===== 全員スキップ → turn 進行 =====
    game.turn = (discarder + 1) % 4
    game.pending_call = None
    for p in range(4):
        state = get_friend_state_for_player(game, p)
        await friend_connections.send_to(room_id, p, {
            "type": "call_resolved",
            "resolution": "skip",
            "state": state
        })


@router.get("/call_action")
async def friend_call_action(room_id: str, player_idx: int, action: str):
    """プレイヤーの副露猶予への応答を記録。action: skip / pon / kan / ron / hanakan
    ステップ5aでは "skip" のみ受け付ける（他は将来のステップで処理）。"""
    from main import lobby_manager
    if room_id not in lobby_manager.games:
        return {"error": "対局が見つかりません"}
    game = lobby_manager.games[room_id]
    pc = getattr(game, 'pending_call', None)
    if not pc or pc.get("resolved"):
        return {"status": "no_pending"}
    if player_idx not in pc.get("responders", []):
        return {"status": "not_responder"}

    pc["responses"][player_idx] = action

    # 全員の応答が揃ったら即座に解決
    if len(pc["responses"]) >= len(pc["responders"]):
        await _resolve_friend_call(room_id, game)

    return {"status": "ok", "responded": len(pc["responses"]), "needed": len(pc["responders"])}



# ==========================================
# REST: ツモ和了
# ==========================================
@router.get("/win_tsumo")
async def friend_win_tsumo(room_id: str, player_idx: int, is_joker_swap: str = "false", is_rinshan: str = "false"):
    """ツモ和了処理。アガリ放題なので局は終わらず、ターンが次に進む。"""
    from main import lobby_manager, get_special_effects
    if room_id not in lobby_manager.games:
        raise HTTPException(status_code=404, detail="対局が見つかりません")
    game = lobby_manager.games[room_id]

    try:
        tile = game.last_drawn[player_idx]
        if tile in game.hands[player_idx]:
            game.hands[player_idx].remove(tile)

        ctx = {
            "winning_tile": tile,
            "is_tsumo": True,
            "is_haitei": len(game.wall) == 0,
            "is_joker_swap": is_joker_swap.lower() == "true",
            "is_rinshan": is_rinshan.lower() == "true",
            "is_first_turn": game.is_first_turn[player_idx],
            "any_meld_occurred": game.any_meld_occurred,
            "is_dealer": game.dealer == player_idx,
            "discards_count": game.discards_count
        }
        game.win_records[player_idx].append(ctx)
        game.win_tiles[player_idx].append(tile)
        game.last_discard_info = {"player": -1, "tile": ""}
        game.is_first_turn[player_idx] = False
        game.just_drawn = -1
        # アガリ放題: ターンを次に進める
        game.turn = (player_idx + 1) % 4

        effects = get_special_effects(game, player_idx, ctx)
        game.append_log("win", player=player_idx, method="tsumo", tile=tile)

        # 全プレイヤーに friend_win を broadcast
        for p in range(4):
            state = get_friend_state_for_player(game, p)
            await friend_connections.send_to(room_id, p, {
                "type": "friend_win",
                "win_type": "tsumo",
                "player_idx": player_idx,
                "tile": tile,
                "yaku": effects,
                "state": state
            })

        return get_friend_state_for_player(game, player_idx)
    except Exception as e:
        traceback.print_exc()
        return {"error": str(e)}


# ==========================================
# WebSocket: 対局中のリアルタイム同期
# ==========================================
@router.websocket("/ws/{room_id}/{player_idx}")
async def friend_game_websocket(websocket: WebSocket, room_id: str, player_idx: int):
    """対局中の双方向通信。各プレイヤーがゲーム画面に入ったら接続する。"""
    await friend_connections.connect(websocket, room_id, player_idx)
    try:
        while True:
            data = await websocket.receive_json()
            print(f"[FRIEND WS] Room {room_id} Player {player_idx} から受信: {data}")
            # 受信した action はステップ2以降で処理を追加する
    except WebSocketDisconnect:
        friend_connections.disconnect(websocket, room_id)
    except Exception as e:
        print(f"[FRIEND WS ERROR] {e}")
        traceback.print_exc()
        friend_connections.disconnect(websocket, room_id)