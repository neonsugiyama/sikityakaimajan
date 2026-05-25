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