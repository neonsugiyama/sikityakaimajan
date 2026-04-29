import random
import traceback
from typing import Dict, List  # 🌟 追加
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends  # 🌟 ここに HTTPException, Depends を追加！
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

# 🧠 分離した「麻雀の脳みそ（ルールとAI）」を読み込む
from mahjong_logic import (
    GameState, get_safe_state, evaluate_hand, get_waits_for_hand,
    determine_target, evaluate_tile_dynamically, is_kan_valid_for_player,
    get_visible_count, SEASON_TILES, TILE_NAMES, ODDS,SORT_ORDER
)

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

app.mount("/static", StaticFiles(directory="."), name="static")
app.mount("/images", StaticFiles(directory="images"), name="images")
app.mount("/audio", StaticFiles(directory="audio"), name="audio")

# ==========================================
# 🧠 セッション（同時プレイ）管理システム
# ==========================================
# 🌟 追加：プレイヤー（ブラウザ）ごとに独立したゲームを保存するロッカー
active_sessions: Dict[str, GameState] = {}

def get_game(session_id: str) -> GameState:
    """指定されたセッションIDのゲームを取得。無ければ新しく作る"""
    if not session_id:
        session_id = "default" # IDがない場合の保険
        
    if session_id not in active_sessions:
        print(f"[DEBUG] 新しいセッションを作成しました: {session_id}")
        active_sessions[session_id] = GameState()
        
    return active_sessions[session_id]

# ==========================================
# 🌐 画面表示用のAPI（フロントエンド配信）
# ==========================================

# 🏠 トップページ（HTML）をブラウザに返す
@app.get("/")
def read_root():
    return FileResponse("index.html")

# 🎨 デザイン（CSS）をブラウザに返す
@app.get("/style.css")
def read_css():
    return FileResponse("style.css")

# 🧠 フロントエンドの動き（JS）をブラウザに返す
@app.get("/game.js")
def read_js():
    return FileResponse("game.js")

from fastapi.responses import FileResponse

# --- 既存の index.html や game.js を返す処理の近くにこれを追加 ---
@app.get("/manifest.json")
def get_manifest():
    return FileResponse("manifest.json", media_type="application/json; charset=utf-8")

# ==========================================
# 🤝 友人戦ロビー（WebSocket）管理システム
# ==========================================
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}
        self.games = {}
        self.charleston_selections = {}
        self.second_charleston_confirms = {}
        self.second_charleston_selections = {}

    async def connect(self, websocket: WebSocket, room_id: str):
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = []
        self.active_connections[room_id].append(websocket)
        print(f"[DEBUG] Room {room_id} に接続。現在の人数: {len(self.active_connections[room_id])}")

    def disconnect(self, websocket: WebSocket, room_id: str):
        if room_id in self.active_connections:
            if websocket in self.active_connections[room_id]:
                self.active_connections[room_id].remove(websocket)
            print(f"[DEBUG] Room {room_id} から切断。残りの人数: {len(self.active_connections[room_id])}")
            if len(self.active_connections[room_id]) == 0:
                del self.active_connections[room_id]
                if room_id in self.games: del self.games[room_id]
                if room_id in self.charleston_selections: del self.charleston_selections[room_id]
                if room_id in self.second_charleston_confirms: del self.second_charleston_confirms[room_id]
                if room_id in self.second_charleston_selections: del self.second_charleston_selections[room_id]
                print(f"[DEBUG] Room {room_id} を削除しました。")

    async def broadcast_to_room(self, room_id: str, message: dict):
        if room_id in self.active_connections:
            dead_connections = []
            for connection in self.active_connections[room_id]:
                try:
                    await connection.send_json(message)
                except Exception as e:
                    print(f"[DEBUG ERROR] 送信失敗。切断されたソケットです: {e}")
                    dead_connections.append(connection)
            for c in dead_connections:
                self.disconnect(c, room_id)

lobby_manager = ConnectionManager()

# 📡 ロビー用のWebSocket通信口
@app.websocket("/ws/lobby/{room_id}")
async def websocket_lobby(websocket: WebSocket, room_id: str):
    print(f"\n[DEBUG LOG] === 新規接続リクエスト Room: {room_id} ===")
    try:
        await lobby_manager.connect(websocket, room_id)
        
        player_count = len(lobby_manager.active_connections[room_id])
        print(f"[DEBUG LOG] 現在の接続人数: {player_count}人")

        await lobby_manager.broadcast_to_room(room_id, {
            "type": "lobby_update",
            "player_count": player_count
        })

        # 🌟 4人揃ったらゲームを開始する！
        if player_count == 4:
            print(f"[DEBUG LOG] 4人揃いました！ゲームの初期化を開始します...")
            try:
                if room_id not in lobby_manager.games:
                    # 🌟 修正：古いgameをコピーするのではなく、新しく「GameState()」を作る！
                    lobby_manager.games[room_id] = GameState()  
                
                room_game = lobby_manager.games[room_id]
                room_game.reset_round() # 🌟 ついでに初期化メソッドも正しい名前に修正
                
                lobby_manager.charleston_selections[room_id] = {}
                lobby_manager.second_charleston_confirms[room_id] = {}
                lobby_manager.second_charleston_selections[room_id] = {}
                
                for i, connection in enumerate(lobby_manager.active_connections[room_id]):
                    await connection.send_json({
                        "type": "game_start",
                        "player_idx": i,
                        "state": {
                            "player_hand": room_game.hands[i],
                            "turn": room_game.turn,
                            "dealer": room_game.dealer,
                            "wall_count": len(room_game.wall)
                        }
                    })
                print(f"[DEBUG LOG] 全員に game_start を送信完了しました。")
            
            except Exception as init_err:
                print(f"\n[FATAL ERROR 💥] 4人目のゲーム開始処理中にエラーが起きてクラッシュしました！")
                print(f"エラー詳細: {init_err}")
                traceback.print_exc()
                print(f"==============================================================\n")
        
        # --- メインの通信ループ ---
        while True:
            data = await websocket.receive_json()
            print(f"[DEBUG LOG] 受信データ: {data}")
            
            if data.get("type") == "action":
                action = data.get("action")
                p_idx = data.get("player_idx")
                event_log = None
                room_game = lobby_manager.games.get(room_id)

                if not room_game: 
                    print(f"[DEBUG ERROR] Room {room_id} の game データがありません！")
                    continue
                
                try:
                    # --- ① 打牌処理 ---
                    if action == "discard":
                        tile = data.get("tile")
                        print(f"[DEBUG LOG] プレイヤー {p_idx} が {tile} を打牌しました。")
                        room_game.hands[p_idx].remove(tile)
                        room_game.hands[p_idx] = room_game.sort_hand(room_game.hands[p_idx])
                        room_game.turn = (p_idx + 1) % 4
                        room_game.discards[p_idx].append(tile)  
                        room_game.discards_count += 1
                        room_game.is_first_turn[p_idx] = False
                        event_log = {"action": "discard", "player_idx": p_idx, "tile": tile}

                    # --- 🌟 鳴き・アガリ・スキップ同期アクション ---
                    elif action == "play_callout":
                        print(f"[DEBUG LOG] プレイヤー {p_idx} が発声しました: {data.get('call_text')}")
                        event_log = {"action": "play_callout", "player_idx": p_idx, "call_text": data.get("call_text")}
                    
                    elif action == "skip":
                        print(f"[DEBUG LOG] プレイヤー {p_idx} がスキップしました。")
                        event_log = {"action": "skip", "player_idx": p_idx}
                    
                    elif action == "sync":
                        print(f"[DEBUG LOG] プレイヤー {p_idx} が盤面の同期を要求しました。")
                        event_log = {"action": "sync", "player_idx": p_idx}
                        
                    # --- ② 第1チャールストン ---
                    elif action == "charleston":
                        print(f"[DEBUG LOG] 第1交換: プレイヤー {p_idx} が牌を選びました。")
                        if room_id not in lobby_manager.charleston_selections:
                            lobby_manager.charleston_selections[room_id] = {}
                        
                        tiles = data.get("tiles")
                        lobby_manager.charleston_selections[room_id][p_idx] = tiles
                        
                        for t in tiles:
                            if t in room_game.hands[p_idx]: room_game.hands[p_idx].remove(t)
                                
                        event_log = {"action": "charleston_player_ready", "player_idx": p_idx}
                        
                        if len(lobby_manager.charleston_selections[room_id]) == 4:
                            print("[DEBUG LOG] 第1交換: 全員の牌が出揃いました。交換処理を実行します。")
                            selections = lobby_manager.charleston_selections[room_id]
                            dice = random.randint(1, 6)
                            if dice in [1, 2]: offset, msg = -1, "下家(右)へ交換"
                            elif dice in [3, 4]: offset, msg = -2, "対面(正面)へ交換"
                            else: offset, msg = 1, "上家(左)へ交換"
                            for i in range(4):
                                giver_idx = (i + offset) % 4
                                room_game.hands[i].extend(selections[giver_idx])
                                room_game.hands[i] = room_game.sort_hand(room_game.hands[i])
                            lobby_manager.charleston_selections[room_id] = {}
                            event_log = {"action": "charleston_complete", "dice": dice, "direction": msg}

                    # --- ③ 第2チャールストン ---
                    elif action == "second_charleston_turn":
                        print(f"[DEBUG LOG] 第2交換: プレイヤー {p_idx} から選択を受信しました。")
                        if room_id not in lobby_manager.second_charleston_selections:
                            lobby_manager.second_charleston_selections[room_id] = {}
                            lobby_manager.second_charleston_confirms[room_id] = {}

                        participate = data.get("participate")
                        tiles = data.get("tiles", [])

                        lobby_manager.second_charleston_confirms[room_id][p_idx] = participate
                        lobby_manager.second_charleston_selections[room_id][p_idx] = tiles

                        for t in tiles:
                            if t in room_game.hands[p_idx]: room_game.hands[p_idx].remove(t)

                        event_log = {"action": "second_charleston_player_done", "player_idx": p_idx, "participate": participate}

                        if len(lobby_manager.second_charleston_selections[room_id]) == 4:
                            print("[DEBUG LOG] 第2交換: 4人全員の選択が出揃いました。集計を開始します。")
                            selections = lobby_manager.second_charleston_selections[room_id]
                            confirms = lobby_manager.second_charleston_confirms[room_id]
                            active = [i for i in range(4) if confirms.get(i, False) or confirms.get(str(i), False)]

                            if len(active) <= 1:
                                print("[DEBUG LOG] 第2交換: 参加者不足によりスキップします。")
                                for i in active:
                                    room_game.hands[i].extend(selections[i])
                                    room_game.hands[i] = room_game.sort_hand(room_game.hands[i])
                                lobby_manager.second_charleston_confirms[room_id] = {}
                                lobby_manager.second_charleston_selections[room_id] = {}
                                event_log = {"action": "second_charleston_skip", "message": "参加者不足"}
                            else:
                                print("[DEBUG LOG] 第2交換: 牌の移動を実行します。")
                                passed_tiles = {i: selections[i] for i in range(4)}
                                dice = random.randint(1, 6)
                                msg = ""
                                if len(active) == 4:
                                    if dice in [1, 2]: offset, msg = -1, "下家(右)へ交換"
                                    elif dice in [3, 4]: offset, msg = -2, "対面(正面)へ交換"
                                    else: offset, msg = 1, "上家(左)へ交換"
                                    for i in range(4):
                                        giver_idx = (i + offset) % 4
                                        room_game.hands[i].extend(passed_tiles[giver_idx])
                                elif len(active) == 3:
                                    if dice in [1, 2, 3]: offset_idx, msg = -1, "参加者間で右回り(下家方向)に交換"
                                    else: offset_idx, msg = 1, "参加者間で左回り(上家方向)に交換"
                                    for idx, player in enumerate(active):
                                        giver_idx = active[(idx + offset_idx) % len(active)]
                                        room_game.hands[player].extend(passed_tiles[giver_idx])
                                elif len(active) == 2:
                                    dice, msg = 0, "2人で直接交換"
                                    pA, pB = active[0], active[1]
                                    room_game.hands[pA].extend(passed_tiles[pB])
                                    room_game.hands[pB].extend(passed_tiles[pA])
                                    
                                for i in range(4): room_game.hands[i] = room_game.sort_hand(room_game.hands[i])
                                lobby_manager.second_charleston_confirms[room_id] = {}
                                lobby_manager.second_charleston_selections[room_id] = {}
                                event_log = {"action": "second_charleston_complete", "dice": dice, "direction": msg, "active_players": active}

                    # 最新の盤面を全員に配る
                    if event_log:
                        print(f"[DEBUG LOG] ブロードキャスト送信: {event_log.get('action')}")
                        for i, connection in enumerate(lobby_manager.active_connections[room_id]):
                            await connection.send_json({
                                "type": "update", "event": event_log,
                                "state": {"player_hand": room_game.hands[i], "turn": room_game.turn, "wall_count": len(room_game.wall)}
                            })
                
                except Exception as action_err:
                    print(f"\n[FATAL ERROR 💥] アクションの処理中にエラーが発生しました！")
                    print(f"エラー詳細: {action_err}")
                    traceback.print_exc()
                    print(f"==============================================================\n")

    except WebSocketDisconnect:
        print(f"[DEBUG LOG] ⚠️ プレイヤーがブラウザを閉じたか、通信が切断されました")
        lobby_manager.disconnect(websocket, room_id)
        if room_id in lobby_manager.active_connections:
            new_count = len(lobby_manager.active_connections[room_id])
            await lobby_manager.broadcast_to_room(room_id, {
                "type": "lobby_update",
                "player_count": new_count
            })
    except Exception as fatal_e:
        print(f"\n[FATAL ERROR 💥] サーバーとの通信ループが完全にクラッシュしました！")
        print(f"エラー詳細: {fatal_e}")
        traceback.print_exc()
        print(f"==============================================================\n")
        lobby_manager.disconnect(websocket, room_id)

class GameState:
    def __init__(self):
        self.current_round = 1
        self.dealer = random.randint(0, 3) 
        self.scores = [0, 0, 0, 0] 
        self.total_scores = [0, 0, 0, 0] 
        self.cpu_targets = ["", "", "", ""]
        self.cpu_personalities = ["", random.randint(1, 4), random.randint(1, 4), random.randint(1, 4)]
        self.just_drawn = -1 
        self.reset_round()

    def reset_round(self):
        self.wall = (TILE_NAMES * 4) + list(SEASON_TILES)
        random.shuffle(self.wall)
        self.hands = [self.sort_hand([self.wall.pop() for _ in range(13)]) for _ in range(4)]
        self.melds = [[] for _ in range(4)]
        self.win_tiles = [[] for _ in range(4)]
        self.last_drawn = [""] * 4
        self.discards = [[] for _ in range(4)]
        self.turn = self.dealer 
        self.scores = [0, 0, 0, 0]
        self.cpu_targets = ["", "", "", ""]
        self.just_drawn = -1 
        self.win_records = [[] for _ in range(4)]
        self.is_first_turn = [True, True, True, True]
        self.any_meld_occurred = False
        self.discards_count = 0
        
    def sort_hand(self, hand):
        return sorted(hand, key=lambda x: SORT_ORDER.get(x, 999))

# 🌟 10000パターンのルーム管理システム
ROOM_COUNTER = 0
active_rooms: Dict[str, GameState] = {}

# 🌟 通信が来るたびに、自動的に「その人の卓データ(game)」を取り出す魔法の関数
def get_current_game(room_id: str = "") -> GameState:
    if not room_id or room_id not in active_rooms:
        raise HTTPException(status_code=400, detail="ルームが見つかりません。画面をリロードしてください。")
    return active_rooms[room_id]

# 🌟 第一引数に必ず game を受け取るように変更！
def get_safe_state(game: GameState, player_idx=0, extra_data=None):
    res = {
        "status": "success",
        "player_hand": game.hands[player_idx],
        "player_melds": game.melds[player_idx],
        "player_win_tiles": game.win_tiles[player_idx],
        "wall_count": len(game.wall),
        "turn": game.turn,
        "dealer": game.dealer,
        "current_round": game.current_round,
        "scores": game.scores,
        "total_scores": game.total_scores,
        "all_hands": game.hands,
        "all_melds": game.melds,
        "all_win_tiles": game.win_tiles,
        "cpu_targets": game.cpu_targets,
        "cpu_personalities": game.cpu_personalities 
    }
    if extra_data: res.update(extra_data)
    return res

# 🌟 第一引数に必ず game を受け取るように変更！
def get_cpu_ron_interceptor(game: GameState, discarder_idx: int, tile: str, target_players: list):
    is_haitei = (len(game.wall) == 0)
    for i in target_players:
        if i == 0: continue 
        # 🚨 修正箇所1：以下の行を削除しました！これで和了済みのCPUも頭ハネに参加できます
        # if len(game.win_tiles[i]) > 0: continue 
        
        ctx = {
            "winning_tile": tile, "is_tsumo": False, "is_haitei": is_haitei,
            "is_joker_swap": False, "is_rinshan": False, "is_chankan": False,
            "is_first_turn": game.is_first_turn[i], "any_meld_occurred": game.any_meld_occurred,
            "is_dealer": game.dealer == i, "discards_count": game.discards_count
        }
        res = evaluate_hand({"closed_tiles": " ".join(game.hands[i]), "melds": game.melds[i], "win_context": ctx})
        if "error" not in res:
            # 🌟 修正箇所2：すでに和了しているかどうかを判定する変数を追加
            has_won_already = len(game.win_tiles[i]) > 0
            has_season_in_hand = any(t in SEASON_TILES for t in game.hands[i]) or any(t in SEASON_TILES for m in game.melds[i] for t in m["tiles"])
            
            # 🌟 修正箇所3：見逃し判定は「まだ和了っていない、かつ四季牌を持っている時」のみ行うように条件を追加！
            if not has_won_already and has_season_in_hand:
                is_hanari_zentan = ("全単" in res.get("yaku", []) and "無花果" not in res.get("yaku", []))
                jokers_count = sum(1 for t in game.hands[i] + [tile] if t in SEASON_TILES)
                is_hanari_qixing = ("七星不靠" in res.get("yaku", []) and "無花果" not in res.get("yaku", []) and jokers_count == 1 and game.cpu_personalities[i] in [1, 2])
                
                if (is_hanari_zentan or is_hanari_qixing) and len(game.wall) > 20: 
                    continue 

                if "十三幺九" in res.get("yaku", []):
                    waits = get_waits_for_hand(game.hands[i], game.melds[i])
                    if len(waits) < 13:
                        remaining = 0
                        for w in waits:
                            visible = get_visible_count(w, game)
                            remaining += max(0, 4 - visible - game.hands[i].count(w))
                        if len(game.wall) >= 24 and remaining >= 3: 
                            continue 

                if len(game.wall) > 20:
                    waits = get_waits_for_hand(game.hands[i], game.melds[i])
                    if len(waits) < 27: 
                        continue 

            return {"player": i, "yaku": res.get("yaku", []), "score": res.get("score", 0), "ctx": ctx}
    return None

# ==========================================
# 🎮 ゲーム進行・操作受付用API
# ==========================================

@app.get("/start")
def start_game():
    global ROOM_COUNTER
    # 0000〜9999 のルームIDを発行して、10000を超えたら0に戻る
    room_id = f"{ROOM_COUNTER:04d}"
    ROOM_COUNTER = (ROOM_COUNTER + 1) % 10000
    
    new_game = GameState()
    active_rooms[room_id] = new_game
    print(f"🎮 新規ルーム作成: {room_id} (現在稼働中: {len(active_rooms)}卓)")
    
    return get_safe_state(new_game, 0, {"room_id": room_id})

# 🌟 全てのAPIに `game: GameState = Depends(get_current_game)` を追加！
@app.get("/next_round")
def next_round(game: GameState = Depends(get_current_game)):
    sorted_indices = sorted(range(4), key=lambda i: (game.scores[i], -((i - game.dealer) % 4)), reverse=True)
    next_dealer = sorted_indices[0] 
    
    for rank, idx in enumerate(sorted_indices):
        points = [300, 200, 100, 0][rank]
        game.total_scores[idx] += game.scores[idx] + points
        
    game.current_round += 1
    game.dealer = next_dealer
    game.reset_round()
    return get_safe_state(game)

@app.get("/charleston")
def charleston(player_idx: int = 0, t1: str = "", t2: str = "", t3: str = "", game: GameState = Depends(get_current_game)):
    try:
        player_passed = [t1, t2, t3]
        for t in player_passed: game.hands[0].remove(t)
        
        cpu_passed = []
        for i in range(1, 4):
            target = determine_target(i, game.hands[i], game)
            game.cpu_targets[i] = target
            valid_candidates = [t for t in game.hands[i] if t not in SEASON_TILES]
            scored = [(t, evaluate_tile_dynamically(t, game.hands[i], game, i, game.cpu_personalities[i]) + random.randint(0, 5)) for t in valid_candidates]
            scored.sort(key=lambda x: x[1])
            passed = []
            temp_hand = list(game.hands[i])
            for st in scored:
                if st[0] in temp_hand:
                    passed.append(st[0])
                    temp_hand.remove(st[0])
                if len(passed) == 3: break
            for t in passed: game.hands[i].remove(t)
            cpu_passed.append(passed)
        
        all_passed = [player_passed, cpu_passed[0], cpu_passed[1], cpu_passed[2]]
        dice = random.randint(1, 6)
        if dice in [1, 2]: offset, msg = -1, "下家(右)へ交換"
        elif dice in [3, 4]: offset, msg = -2, "対面(正面)へ交換"
        else: offset, msg = 1, "上家(左)へ交換"
        
        for i in range(4):
            giver_idx = (i + offset) % 4
            game.hands[i].extend(all_passed[giver_idx])
            game.hands[i] = game.sort_hand(game.hands[i])
            
        game.just_drawn = -1 
        return get_safe_state(game, 0, {"dice": dice, "direction": msg})
    except Exception as e:
        return {"error": str(e)}

@app.get("/second_charleston")
def second_charleston(player_idx: int = 0, t1: str = "", t2: str = "", t3: str = "", p0: str = "false", p1: str = "false", p2: str = "false", p3: str = "false", game: GameState = Depends(get_current_game)):
    try:
        participating = [p0.lower() == "true", p1.lower() == "true", p2.lower() == "true", p3.lower() == "true"]
        active = [i for i in range(4) if participating[i]]

        if len(active) <= 1:
            return get_safe_state(game, 0, {"dice": 0, "direction": "参加者が足りないため不成立となりました"})

        passed_tiles = {i: [] for i in active}

        if 0 in active:
            player_passed = [t for t in [t1, t2, t3] if t]
            for t in player_passed:
                if t in game.hands[0]: game.hands[0].remove(t)
            passed_tiles[0] = player_passed

        for i in active:
            if i != 0:
                target = determine_target(i, game.hands[i], game)
                game.cpu_targets[i] = target
                valid_candidates = [t for t in game.hands[i] if t not in SEASON_TILES]
                scored = [(t, evaluate_tile_dynamically(t, game.hands[i], game, i, game.cpu_personalities[i]) + random.randint(0, 5)) for t in valid_candidates]
                scored.sort(key=lambda x: x[1])
                passed = []
                temp_hand = list(game.hands[i])
                for st in scored:
                    if st[0] in temp_hand:
                        passed.append(st[0])
                        temp_hand.remove(st[0])
                    if len(passed) == 3: break
                for t in passed: game.hands[i].remove(t)
                passed_tiles[i] = passed

        dice = random.randint(1, 6)
        msg = ""

        if len(active) == 4:
            if dice in [1, 2]: offset, msg = -1, "下家(右)へ交換"
            elif dice in [3, 4]: offset, msg = -2, "対面(正面)へ交換"
            else: offset, msg = 1, "上家(左)へ交換"
            for i in range(4):
                giver_idx = (i + offset) % 4
                game.hands[i].extend(passed_tiles[giver_idx])

        elif len(active) == 3:
            if dice in [1, 2, 3]: offset_idx, msg = -1, "参加者間で右回り(下家方向)に交換"
            else: offset_idx, msg = 1, "参加者間で左回り(上家方向)に交換"
            for idx, player in enumerate(active):
                giver_idx = active[(idx + offset_idx) % len(active)]
                game.hands[player].extend(passed_tiles[giver_idx])

        elif len(active) == 2:
            dice, msg = 0, "2人で直接交換"
            pA, pB = active[0], active[1]
            game.hands[pA].extend(passed_tiles[pB])
            game.hands[pB].extend(passed_tiles[pA])

        for i in range(4): game.hands[i] = game.sort_hand(game.hands[i])
        game.just_drawn = -1 
        return get_safe_state(game, 0, {"dice": dice, "direction": msg})
    except Exception as e:
        traceback.print_exc()
        return {"error": f"サーバー内部エラー(/second_charleston): {str(e)}"}

@app.get("/draw")
def draw_tile(player_idx: int = 0, game: GameState = Depends(get_current_game)):
    if not game.wall: return {"error": "流局"}
    tile = game.wall.pop()
    game.hands[player_idx].append(tile)
    game.last_drawn[player_idx] = tile
    game.hands[player_idx] = game.sort_hand(game.hands[player_idx])
    game.just_drawn = player_idx 
    return get_safe_state(game, 0, {"drawn_tile": tile})

@app.get("/discard")
def discard_tile(player_idx: int = 0, tile: str = "", game: GameState = Depends(get_current_game)):
    game.is_first_turn[player_idx] = False 
    if len(game.win_tiles[player_idx]) > 0:
        if tile != game.last_drawn[player_idx]:
            return {"error": "アガリ後はツモ切りしかできません"}
            
    if tile in game.hands[player_idx]:
        game.hands[player_idx].remove(tile)
        game.discards[player_idx].append(tile) 
        game.discards_count += 1
        game.turn = (player_idx + 1) % 4
        game.just_drawn = -1 
        return get_safe_state(game)
    return {"error": "通信エラー: 牌が見つかりません"}

@app.get("/cpu_turn")
def cpu_turn(cpu_idx: int, game: GameState = Depends(get_current_game)):
    try:
        if not game.wall: return {"error": "流局"}
        drawn = game.wall.pop()
        game.last_drawn[cpu_idx] = drawn
        
        ctx = {
            "winning_tile": drawn, 
            "is_tsumo": True, 
            "is_haitei": len(game.wall)==0,
            "is_joker_swap": False,
            "is_rinshan": False,
            "is_first_turn": game.is_first_turn[cpu_idx],
            "any_meld_occurred": game.any_meld_occurred,
            "is_dealer": game.dealer == cpu_idx,
            "discards_count": game.discards_count
        }

        win_data = {
            "closed_tiles": " ".join(game.hands[cpu_idx]),
            "melds": game.melds[cpu_idx],
            "win_context": ctx
        }
        res = evaluate_hand(win_data)
        if "error" not in res:
            has_won_already = len(game.win_tiles[cpu_idx]) > 0
            has_season_in_hand = any(t in SEASON_TILES for t in game.hands[cpu_idx]) or any(t in SEASON_TILES for m in game.melds[cpu_idx] for t in m["tiles"])
            is_pass = False
            
            if not has_won_already and has_season_in_hand:
                is_hanari_zentan = ("全単" in res.get("yaku", []) and "無花果" not in res.get("yaku", []))
                jokers_count = sum(1 for t in game.hands[cpu_idx] + [drawn] if t in SEASON_TILES)
                is_hanari_qixing = ("七星不靠" in res.get("yaku", []) and "無花果" not in res.get("yaku", []) and jokers_count == 1 and game.cpu_personalities[cpu_idx] in [1, 2])
                
                if (is_hanari_zentan or is_hanari_qixing) and len(game.wall) > 20:
                    is_pass = True

                if "十三幺九" in res.get("yaku", []):
                    waits = get_waits_for_hand(game.hands[cpu_idx], game.melds[cpu_idx])
                    if len(waits) < 13:
                        remaining = 0
                        for w in waits:
                            visible = get_visible_count(w, game)
                            remaining += max(0, 4 - visible - game.hands[cpu_idx].count(w))
                        if len(game.wall) >= 24 and remaining >= 3:
                            is_pass = True

                if len(game.wall) > 20: 
                    waits = get_waits_for_hand(game.hands[cpu_idx], game.melds[cpu_idx])
                    if len(waits) < 27:
                        is_pass = True 

            if not is_pass:
                game.win_tiles[cpu_idx].append(drawn)
                game.win_records[cpu_idx].append(ctx)
                game.turn = (cpu_idx + 1) % 4 
                # 🌟 修正：ただの辞書ではなく、get_safe_state を使って山札0枚の事実をJSに知らせる！
                return get_safe_state(game, 0, {"tsumo": True, "cpu_idx": cpu_idx, "winning_tile": drawn, "yaku": res.get("yaku", []), "score": res.get("score", 0)})

        game.hands[cpu_idx].append(drawn)
        
        did_joker_swap_in_turn = False 
        did_kakan_in_turn = False 
        kakan_tile_in_turn = ""  

        while game.wall:
            seasons = [t for t in game.hands[cpu_idx] if t in SEASON_TILES]
            hanakan_seasons = seasons if game.cpu_personalities[cpu_idx] in [2, 4] else []
            counts = {t: game.hands[cpu_idx].count(t) for t in set(game.hands[cpu_idx])}
            did_meld = False
            has_won = len(game.win_tiles[cpu_idx]) > 0
            
            if has_won and len(seasons) > 0: break
                
            current_target = determine_target(cpu_idx, game.hands[cpu_idx], game)
            if current_target in ["十三幺九", "七星不靠"]: break
                
            for t, c in counts.items():
                if c == 4 and t not in SEASON_TILES:
                    if is_kan_valid_for_player(cpu_idx, "ankan", t, game):
                        for _ in range(4): game.hands[cpu_idx].remove(t)
                        game.melds[cpu_idx].append({"type": "ankan", "tiles": [t]*4, "is_hidden": True})
                        game.hands[cpu_idx].append(game.wall.pop())
                        did_meld = True; break

            if did_meld: continue
            
            for m in game.melds[cpu_idx]:
                if m["type"] == "pong":
                    base_t = m["tiles"][0]
                    if base_t in game.hands[cpu_idx]:
                        if is_kan_valid_for_player(cpu_idx, "kakan", base_t, game):
                            game.hands[cpu_idx].remove(base_t)
                            m["type"] = "minkan"
                            m["tiles"].append(base_t)
                            game.hands[cpu_idx].append(game.wall.pop())
                            game.any_meld_occurred = True 
                            did_meld = True
                            did_kakan_in_turn = True 
                            kakan_tile_in_turn = base_t 
                            break
                    
            if did_meld: continue
            
            if not has_won:
                if current_target != "全単":
                    for target_idx in range(4):
                        for m in game.melds[target_idx]:
                            if m["type"] == "hanakan":
                                base_t = m["tiles"][0]
                                season_t = m["tiles"][1]
                                if base_t in game.hands[cpu_idx]:
                                    game.hands[cpu_idx].remove(base_t)
                                    m["type"] = "minkan"
                                    m["tiles"] = [base_t]*4
                                    game.hands[cpu_idx].append(season_t)
                                    game.any_meld_occurred = True 
                                    did_meld = True
                                    did_joker_swap_in_turn = True 
                                    break
                        if did_meld: break
            if did_meld: continue
            break
        
        if len(game.win_tiles[cpu_idx]) > 0:
            discard = game.hands[cpu_idx][-1] 
        else:
            target = determine_target(cpu_idx, game.hands[cpu_idx], game)
            game.cpu_targets[cpu_idx] = target
            
            tenpai_discards = []
            for d_candidate in set(game.hands[cpu_idx]):
                if d_candidate in SEASON_TILES: 
                    temp_hand = list(game.hands[cpu_idx])
                    temp_hand.remove(d_candidate)
                    is_all_odds = all((x in SEASON_TILES or (x in TILE_NAMES and TILE_NAMES.index(x) in ODDS)) for x in temp_hand)
                    
                    jokers_count = sum(1 for x in game.hands[cpu_idx] if x in SEASON_TILES)
                    is_qixing_roment = (target == "七星不靠" and game.cpu_personalities[cpu_idx] in [1, 2] and jokers_count == 1)
                    
                    if not is_all_odds and not is_qixing_roment:
                        continue 
                        
                temp_hand = list(game.hands[cpu_idx])
                temp_hand.remove(d_candidate)
                if get_waits_for_hand(temp_hand, game.melds[cpu_idx]):
                    tenpai_discards.append(d_candidate)
                    
            if tenpai_discards:
                scored = [(t, evaluate_tile_dynamically(t, game.hands[cpu_idx], game, cpu_idx, game.cpu_personalities[cpu_idx]) + random.randint(0, 5)) for t in tenpai_discards]
                scored.sort(key=lambda x: x[1])
                discard = scored[0][0]
            else:
                valid_discards = []
                for t in game.hands[cpu_idx]:
                    if t in SEASON_TILES:
                        temp_hand = list(game.hands[cpu_idx])
                        temp_hand.remove(t)
                        is_all_odds = all((x in SEASON_TILES or (x in TILE_NAMES and TILE_NAMES.index(x) in ODDS)) for x in temp_hand)
                        if is_all_odds:
                            valid_discards.append(t) 
                    else:
                        valid_discards.append(t)
                        
                scored = [(t, evaluate_tile_dynamically(t, game.hands[cpu_idx], game, cpu_idx, game.cpu_personalities[cpu_idx]) + random.randint(0, 5)) for t in valid_discards]
                scored.sort(key=lambda x: x[1]) 
                discard = scored[0][0]
            
        game.hands[cpu_idx].remove(discard)
        game.discards[cpu_idx].append(discard) 
        game.discards_count += 1
        game.is_first_turn[cpu_idx] = False 
        game.hands[cpu_idx] = game.sort_hand(game.hands[cpu_idx])
        game.turn = (cpu_idx + 1) % 4
        game.just_drawn = -1 
        
        return get_safe_state(game, 0, {"discard": discard, "did_joker_swap": did_joker_swap_in_turn, "did_kakan": did_kakan_in_turn, "kakan_tile": kakan_tile_in_turn})
    except Exception as e:
        traceback.print_exc()
        return {"error": str(e)}

@app.get("/check_cpu_reaction")
def check_cpu_reaction(discarder_idx: int, tile: str, is_kakan: str = "false", game: GameState = Depends(get_current_game)):
    try:
        turn_order = [(discarder_idx + 1) % 4, (discarder_idx + 2) % 4, (discarder_idx + 3) % 4]
        is_haitei = (len(game.wall) == 0)
        is_chankan_bool = is_kakan.lower() == "true"
        
        for i in turn_order:
            if i == 0: continue 
            
            if is_chankan_bool:
                waits = get_waits_for_hand(game.hands[i], game.melds[i])
                if len(waits) >= 31: continue
            
            ctx = {
                "winning_tile": tile, "is_tsumo": False, "is_haitei": is_haitei,
                "is_joker_swap": False, "is_rinshan": False, "is_chankan": is_chankan_bool,
                "is_first_turn": game.is_first_turn[i], "any_meld_occurred": game.any_meld_occurred,
                "is_dealer": game.dealer == i, "discards_count": game.discards_count
            }

            data = {"closed_tiles": " ".join(game.hands[i]), "melds": game.melds[i], "win_context": ctx}
            res = evaluate_hand(data)
            if "error" not in res:
                has_won_already = len(game.win_tiles[i]) > 0
                has_season_in_hand = any(t in SEASON_TILES for t in game.hands[i]) or any(t in SEASON_TILES for m in game.melds[i] for t in m["tiles"])
                is_pass = False
                
                if not has_won_already and has_season_in_hand:
                    is_hanari_zentan = ("全単" in res.get("yaku", []) and "無花果" not in res.get("yaku", []))
                    jokers_count = sum(1 for t in game.hands[i] + [tile] if t in SEASON_TILES)
                    is_hanari_qixing = ("七星不靠" in res.get("yaku", []) and "無花果" not in res.get("yaku", []) and jokers_count == 1 and game.cpu_personalities[i] in [1, 2])
                    
                    if (is_hanari_zentan or is_hanari_qixing) and len(game.wall) > 20: is_pass = True

                    if "十三幺九" in res.get("yaku", []):
                        waits = get_waits_for_hand(game.hands[i], game.melds[i])
                        if len(waits) < 13:
                            remaining = 0
                            for w in waits:
                                visible = get_visible_count(w, game)
                                remaining += max(0, 4 - visible - game.hands[i].count(w))
                            if len(game.wall) >= 24 and remaining >= 3: is_pass = True

                    if len(game.wall) > 20: 
                        waits = get_waits_for_hand(game.hands[i], game.melds[i])
                        if len(waits) < 27: is_pass = True 

                if is_pass: continue

                if not is_chankan_bool and game.discards[discarder_idx] and game.discards[discarder_idx][-1] == tile:
                    game.discards[discarder_idx].pop()
                game.win_tiles[i].append(tile)
                game.win_records[i].append(ctx)
                return get_safe_state(game, 0, {"reacted": True, "type": "ron", "player": i, "yaku": res.get("yaku", []), "score": res.get("score", 0)})

        if is_chankan_bool: return get_safe_state(game, 0, {"reacted": False})

        if not is_haitei:
            for i in turn_order:
                if i == 0: continue
                if len(game.win_tiles[i]) > 0: continue
                
                current_target = determine_target(i, game.hands[i], game)
                if current_target in ["十三幺九", "七星不靠"]: continue

                count = game.hands[i].count(tile)
                if count >= 2:
                    temp_hand_with_meld = list(game.hands[i])
                    temp_hand_with_meld.extend([tile, tile]) 
                    score_if_meld = evaluate_tile_dynamically(tile, temp_hand_with_meld, game, i, game.cpu_personalities[i])
                    
                    if score_if_meld > 80 or (count >= 3): 
                        if game.discards[discarder_idx] and game.discards[discarder_idx][-1] == tile:
                            game.discards[discarder_idx].pop()
                            
                        is_kan = (count >= 3)
                        call_type = "minkan" if is_kan else "pong"
                        remove_count = 3 if is_kan else 2
                        
                        for _ in range(remove_count): game.hands[i].remove(tile)
                        game.melds[i].append({"type": call_type, "tiles": [tile]*(remove_count+1)})
                        game.any_meld_occurred = True 
                        game.turn = i 
                        
                        if is_kan and game.wall:
                            drawn = game.wall.pop()
                            game.hands[i].append(drawn)
                            
                        scored = [(t, evaluate_tile_dynamically(t, game.hands[i], game, i, game.cpu_personalities[i]) + random.randint(0, 5)) for t in game.hands[i]]
                        scored.sort(key=lambda x: x[1])
                        discard = scored[0][0]
                        game.hands[i].remove(discard)
                        game.discards[i].append(discard)
                        game.is_first_turn[i] = False 
                        game.hands[i] = game.sort_hand(game.hands[i])
                        
                        game.turn = (i + 1) % 4
                        game.just_drawn = -1 
                        return get_safe_state(game, 0, {"reacted": True, "type": call_type, "player": i, "discard": discard})

        return get_safe_state(game, 0, {"reacted": False})
    except Exception as e:
        traceback.print_exc()
        return {"error": str(e)}

@app.get("/meld")
def process_meld(player_idx: int = 0, type: str = "", tile: str = "", discarder: int = -1, game: GameState = Depends(get_current_game)):
    try:
        if discarder != -1:
            turn_order = [(discarder + 1) % 4, (discarder + 2) % 4, (discarder + 3) % 4]
            interceptor = get_cpu_ron_interceptor(game, discarder, tile, turn_order)
            if interceptor:
                i = interceptor["player"]
                if game.discards[discarder] and game.discards[discarder][-1] == tile:
                    game.discards[discarder].pop()
                game.win_tiles[i].append(tile)
                game.win_records[i].append(interceptor["ctx"])
                return get_safe_state(game, 0, {"intercepted": True, "type": "ron", "player": i, "yaku": interceptor["yaku"], "score": interceptor["score"]})

        drawn_tile = ""
        game.any_meld_occurred = True 
        if type == "花槓":
            if game.hands[player_idx].count(tile) < 2: return {"error": "同期エラー：指定された牌が手牌に足りません。"}
            season_used = ""
            for s in SEASON_TILES:
                if s in game.hands[player_idx]:
                    season_used = s
                    break
            if not season_used: return {"error": "同期エラー：手牌に四季牌がありません。"}
            
            game.hands[player_idx].remove(tile)
            game.hands[player_idx].remove(tile)
            game.hands[player_idx].remove(season_used)
            
            game.melds[player_idx].append({"type": "hanakan", "tiles": [tile, season_used, tile, tile]})
            game.turn = player_idx
            if game.wall:
                drawn_tile = game.wall.pop()
                game.hands[player_idx].append(drawn_tile)
                game.last_drawn[player_idx] = drawn_tile
                game.just_drawn = player_idx 
        else:
            count = 3 if type == "カン" else 2
            if game.hands[player_idx].count(tile) < count: return {"error": "同期エラー：指定された牌が手牌に足りません。"}
                
            for _ in range(count): game.hands[player_idx].remove(tile)
            game.melds[player_idx].append({"type": "pong" if type == "ポン" else "minkan", "tiles": [tile] * (count + 1)})
            game.turn = player_idx
            if type == "カン" and game.wall:
                drawn_tile = game.wall.pop()
                game.hands[player_idx].append(drawn_tile)
                game.last_drawn[player_idx] = drawn_tile
                game.just_drawn = player_idx 
            else:
                game.just_drawn = -1 
                
        game.hands[player_idx] = game.sort_hand(game.hands[player_idx])
        return get_safe_state(game, 0, {"drawn_tile": drawn_tile})
    except Exception as e:
        return {"error": str(e)}

@app.get("/self_meld")
def process_self_meld(player_idx: int = 0, type: str = "", tile: str = "", season: str = "", is_hidden: str = "false", game: GameState = Depends(get_current_game)):
    try:
        drawn_tile = ""
        is_hidden_bool = is_hidden.lower() == "true" 
        
        if type != "暗槓":
            game.any_meld_occurred = True 
            
        if type == "暗槓":
            if game.hands[player_idx].count(tile) < 4: return {"error": "同期エラー：指定された牌が足りません。"}
            for _ in range(4): game.hands[player_idx].remove(tile)
            game.melds[player_idx].append({"type": "ankan", "tiles": [tile] * 4, "is_hidden": is_hidden_bool})
            
        elif type == "暗花槓":
            if game.hands[player_idx].count(tile) < 3 or season not in game.hands[player_idx]: return {"error": "同期エラー：指定された牌が足りません。"}
            for _ in range(3): game.hands[player_idx].remove(tile)
            game.hands[player_idx].remove(season)
            game.melds[player_idx].append({"type": "hanakan", "tiles": [tile, season, tile, tile]})
            
        elif type in ["加槓", "大明槓"]: 
            if tile not in game.hands[player_idx]: return {"error": "同期エラー：指定された牌が足りません。"}
            
            for m in game.melds[player_idx]:
                if m["type"] == "pong" and m["tiles"][0] == tile:
                    m["type"] = "minkan" 
                    m["tiles"].append(tile)
                    break
            game.hands[player_idx].remove(tile)

            chankan_winner = None
            for i in range(1, 4):
                p = (player_idx + i) % 4
                if len(game.win_tiles[p]) > 0: continue 

                waits = get_waits_for_hand(game.hands[p], game.melds[p])
                if len(waits) >= 31: continue

                ctx = {
                    "winning_tile": tile, "is_tsumo": False, "is_haitei": False,
                    "is_joker_swap": False, "is_rinshan": False, "is_chankan": True,
                    "is_first_turn": game.discards_count == 0 and not game.any_meld_occurred,
                    "is_dealer": game.dealer == p
                }
                res = evaluate_hand({"closed_tiles": " ".join(game.hands[p]), "melds": game.melds[p], "win_context": ctx})
                
                if "error" not in res:
                    chankan_winner = p
                    break 

            if chankan_winner is not None:
                game.is_first_turn[player_idx] = False
                return get_safe_state(game, 0, {"chankan_occurred": True, "winner": chankan_winner, "tile": tile})

            for m in game.melds[player_idx]:
                if m["type"] == "pong" and m["tiles"][0] == tile:
                    m["type"] = "minkan" 
                    m["tiles"].append(tile)
                    break
                    
        elif type in ["加花槓", "自摸花槓"]: 
            if season not in game.hands[player_idx]: return {"error": "同期エラー：指定された四季牌が足りません。"}
            game.hands[player_idx].remove(season)
            for m in game.melds[player_idx]:
                if m["type"] == "pong" and m["tiles"][0] == tile:
                    m["type"] = "hanakan"
                    m["tiles"] = [tile, season, tile, tile]
                    break

        game.turn = player_idx
        if game.wall:
            drawn_tile = game.wall.pop()
            game.hands[player_idx].append(drawn_tile)
            game.last_drawn[player_idx] = drawn_tile
            game.just_drawn = player_idx 

        game.hands[player_idx] = game.sort_hand(game.hands[player_idx])
        return get_safe_state(game, 0, {"drawn_tile": drawn_tile})
    except Exception as e:
        traceback.print_exc()
        return {"error": str(e)}

@app.get("/joker_swap")
def process_joker_swap(player_idx: int = 0, tile: str = "", season: str = "", target_idx: int = 0, game: GameState = Depends(get_current_game)):
    try:
        if tile not in game.hands[player_idx]: return {"error": "指定された牌が手牌にありません"}
        target_meld = None
        for m in game.melds[target_idx]:
            if m["type"] == "hanakan" and m["tiles"][0] == tile:
                target_meld = m
                break
        if not target_meld: return {"error": "対応する花槓がありません"}

        game.hands[player_idx].remove(tile)
        target_meld["tiles"] = [tile, tile, tile, tile]
        target_meld["type"] = "minkan" 
        game.hands[player_idx].append(season)
        game.any_meld_occurred = True 
        
        game.last_drawn[player_idx] = season
        game.just_drawn = player_idx 
        game.turn = player_idx
        game.hands[player_idx] = game.sort_hand(game.hands[player_idx])
        
        return get_safe_state(game, 0, {"drawn_tile": season})
    except Exception as e:
        return {"error": str(e)}

@app.get("/win_tsumo")
def process_win_tsumo(player_idx: int = 0, is_joker_swap: str = "false", is_rinshan: str = "false", game: GameState = Depends(get_current_game)):
    try:
        tile = game.last_drawn[player_idx]
        if tile in game.hands[player_idx]: game.hands[player_idx].remove(tile)
        
        ctx = {
            "winning_tile": tile, 
            "is_tsumo": True, 
            "is_haitei": len(game.wall)==0,
            "is_joker_swap": is_joker_swap.lower() == "true",
            "is_rinshan": is_rinshan.lower() == "true",
            "is_first_turn": game.is_first_turn[player_idx], 
            "any_meld_occurred": game.any_meld_occurred,
            "is_dealer": game.dealer == player_idx,
            "discards_count": game.discards_count
        }
        
        win_data = {
            "closed_tiles": " ".join(game.hands[player_idx]),
            "melds": game.melds[player_idx],
            "win_context": ctx
        }
        res = evaluate_hand(win_data) 
        
        game.win_records[player_idx].append(ctx)
        game.win_tiles[player_idx].append(tile)
        game.turn = (player_idx + 1) % 4 
        
        return get_safe_state(game, player_idx, {"yaku": res.get("yaku", []), "score": res.get("score", 0)})
    except Exception as e:
        traceback.print_exc()
        return {"error": str(e)}

@app.get("/win_ron")
def process_win_ron(player_idx: int = 0, tile: str = "", is_chankan: str = "false", discarder: int = -1, game: GameState = Depends(get_current_game)):
    try:
        is_chankan_bool = is_chankan.lower() == "true"
        if discarder != -1 and not is_chankan_bool:
            turn_order = [(discarder + 1) % 4, (discarder + 2) % 4, (discarder + 3) % 4]
            higher_priority_players = []
            for p in turn_order:
                if p == player_idx: break
                higher_priority_players.append(p)
                
            interceptor = get_cpu_ron_interceptor(game, discarder, tile, higher_priority_players)
            if interceptor:
                i = interceptor["player"]
                if game.discards[discarder] and game.discards[discarder][-1] == tile:
                    game.discards[discarder].pop()
                game.win_tiles[i].append(tile)
                game.win_records[i].append(interceptor["ctx"])
                return get_safe_state(game, 0, {"intercepted": True, "type": "ron", "player": i, "yaku": interceptor["yaku"], "score": interceptor["score"]})

        robbed_player_idx = -1
        
        if is_chankan_bool:
            found_robbed = False
            for p_idx in range(4):
                for m in game.melds[p_idx]:
                    if m["tiles"].count(tile) == 4 and m["type"] in ["minkan", "hanakan"]:
                        m["tiles"].remove(tile) 
                        m["type"] = "pong"      
                        
                        if p_idx != 0: 
                            if game.discards[p_idx]:
                                game.hands[p_idx].append(game.discards[p_idx].pop())
                                game.discards_count -= 1
                            if len(game.hands[p_idx]) > 0:
                                game.wall.append(game.hands[p_idx].pop()) 
                        
                        robbed_player_idx = p_idx
                        found_robbed = True
                        break
                if found_robbed: break

        ctx = {
            "winning_tile": tile, 
            "is_tsumo": False, 
            "is_haitei": len(game.wall)==0,
            "is_joker_swap": False,
            "is_rinshan": False,
            "is_chankan": is_chankan_bool,
            "is_first_turn": game.is_first_turn[player_idx],
            "any_meld_occurred": game.any_meld_occurred,
            "is_dealer": game.dealer == player_idx,
            "discards_count": game.discards_count
        }
        
        win_data = {
            "closed_tiles": " ".join(game.hands[player_idx]),
            "melds": game.melds[player_idx],
            "win_context": ctx
        }
        res = evaluate_hand(win_data)

        game.win_records[player_idx].append(ctx)
        game.win_tiles[player_idx].append(tile)

        if is_chankan_bool and robbed_player_idx != -1:
            game.turn = (robbed_player_idx + 1) % 4

        return get_safe_state(game, player_idx, {"yaku": res.get("yaku", []), "score": res.get("score", 0)})
    except Exception as e:
        traceback.print_exc()
        return {"error": str(e)}

@app.get("/check_win")
def check_win(player_idx: int = 0, last_tile: str = "", is_ron: str = "false", is_rinshan: str = "false", is_haitei: str = "false", is_chankan: str = "false", game: GameState = Depends(get_current_game)):
    hand = list(game.hands[player_idx])
    is_ron_bool = is_ron.lower() == "true"
    is_rinshan_bool = is_rinshan.lower() == "true"
    is_haitei_bool = is_haitei.lower() == "true"
    is_chankan_bool = is_chankan.lower() == "true"
    
    if is_chankan_bool:
        temp_hand = list(hand)
        if len(temp_hand) % 3 == 2 and game.last_drawn[player_idx] in temp_hand:
            temp_hand.remove(game.last_drawn[player_idx])
        waits = get_waits_for_hand(temp_hand, game.melds[player_idx])
        if len(waits) >= 31:
            return {"can_win": False, "reason": "全ての牌で和了れる待ちは槍槓できません"}
    
    win_ctx = {
        "winning_tile": last_tile or "",
        "is_tsumo": not is_ron_bool,
        "is_rinshan": is_rinshan_bool,
        "is_haitei": is_haitei_bool,
        "is_joker_swap": False,
        "is_chankan": is_chankan_bool,
        "is_first_turn": game.is_first_turn[player_idx],
        "any_meld_occurred": game.any_meld_occurred,
        "is_dealer": game.dealer == player_idx,
        "discards_count": game.discards_count
    }
    
    if is_ron_bool and last_tile:
        closed_str = " ".join(hand)
        win_ctx["winning_tile"] = last_tile
    else:
        last_drawn = game.last_drawn[player_idx]
        temp_hand = list(hand)
        if last_drawn in temp_hand: temp_hand.remove(last_drawn)
        closed_str = " ".join(temp_hand)
        win_ctx["winning_tile"] = last_drawn
        
    data = {"closed_tiles": closed_str, "melds": game.melds[player_idx], "win_context": win_ctx}
    
    total_tiles = len(closed_str.split()) + 1 + len(game.melds[player_idx]) * 3
    if total_tiles != 14: return {"can_win": False}
        
    res = evaluate_hand(data)
    if "error" in res: return {"can_win": False, "reason": res["error"]}
    return {"can_win": True, "score": res["score"], "yaku": res["yaku"]}

@app.get("/calculate_round_scores")
def calculate_round_scores(game: GameState = Depends(get_current_game)):
    results = []
    for i in range(4):
        player_total = 0
        player_yaku_list = []
        for ctx in game.win_records[i]:
            data = {
                "closed_tiles": " ".join(game.hands[i]),
                "melds": game.melds[i],
                "win_context": ctx
            }
            res = evaluate_hand(data)
            if "error" not in res:
                player_total += res["score"]
                player_yaku_list.append({
                    "tile": ctx["winning_tile"],
                    "score": res["score"],
                    "yaku": res["yaku"]
                })
        
        game.scores[i] += player_total
        if player_yaku_list:
            results.append({
                "player": i,
                "total_score": player_total,
                "details": player_yaku_list
            })
            
    sorted_indices = sorted(range(4), key=lambda i: (game.scores[i], -((i - game.dealer) % 4)), reverse=True)
    ranking_points = [0, 0, 0, 0]
    for rank, idx in enumerate(sorted_indices):
        ranking_points[idx] = [300, 200, 100, 0][rank]
            
    return {"status": "success", "results": results, "scores": game.scores, "ranking_points": ranking_points}

@app.get("/get_valid_self_melds")
def get_valid_self_melds(player_idx: int = 0, game: GameState = Depends(get_current_game)):
    valid_melds = []
    hand = list(game.hands[player_idx])
    melds = game.melds[player_idx]
    counts = {t: hand.count(t) for t in set(hand)}
    seasons = [t for t in hand if t in SEASON_TILES]
    has_won = len(game.win_tiles[player_idx]) > 0
    last_drawn = game.last_drawn[player_idx] 

    for t, c in counts.items():
        if c == 4 and t not in SEASON_TILES:
            if is_kan_valid_for_player(player_idx, "ankan", t, game):
                valid_melds.append({"type": "暗槓", "tile": t, "season": ""})
        if c >= 3 and seasons and t not in SEASON_TILES:
            if not has_won:
                for s in seasons:
                    valid_melds.append({"type": "暗花槓", "tile": t, "season": s})

    for m in melds:
        if m["type"] == "pong": 
            base = m["tiles"][0]
            if counts.get(base, 0) > 0:
                if is_kan_valid_for_player(player_idx, "kakan", base, game):
                    valid_melds.append({"type": "加槓", "tile": base, "season": ""})
            if seasons:
                if not has_won:
                    for s in seasons:
                        valid_melds.append({"type": "加花槓", "tile": base, "season": s})
        elif m["type"] == "hanakan":
            base = m["tiles"][0]
            season_t = m["tiles"][1]
            if counts.get(base, 0) > 0:
                if not has_won or base == last_drawn:
                    valid_melds.append({"type": "JokerSwap", "tile": base, "season": season_t, "target_idx": player_idx})

    for t_idx in range(4):
        if t_idx == player_idx: continue
        for m in game.melds[t_idx]:
            if m["type"] == "hanakan":
                base = m["tiles"][0]
                season_t = m["tiles"][1]
                if counts.get(base, 0) > 0:
                    if not has_won or base == last_drawn:
                        valid_melds.append({"type": "JokerSwap", "tile": base, "season": season_t, "target_idx": t_idx})
                    
    return {"valid_melds": valid_melds}

@app.get("/check_cpu_ron_interceptor")
def check_cpu_ron_interceptor_api(discarder_idx: int = 0, tile: str = "", game: GameState = Depends(get_current_game)):
    turn_order = [(discarder_idx + 1) % 4, (discarder_idx + 2) % 4, (discarder_idx + 3) % 4]
    interceptor = get_cpu_ron_interceptor(game, discarder_idx, tile, turn_order)
    if interceptor:
        return {"intercepted": True, "player": interceptor["player"]}
    return {"intercepted": False}

# 🛠️ デバッグ・テスト用に、特定の盤面（天和、国士無双など）を強制的に作り出すAPI
@app.get("/debug_setup")
def debug_setup(scenario: str, game: GameState = Depends(get_current_game)):
    game.reset_round()
    game.discards_count = 0
    game.any_meld_occurred = False
    game.is_first_turn = [True, True, True, True]
    game.win_records = [[] for _ in range(4)]
    game.win_tiles = [[] for _ in range(4)]
    
    if scenario == "tenhou":
        game.dealer = 0
        game.turn = 0
        game.hands[0] = ["1p","1p","1p","2p","2p","2p","3p","3p","3p","4p","4p","4p","5p"]
        game.wall = ["1p","1p","1p","1p", "2p","2p","2p", "3p","3p","3p", "4p","4p","4p","1p","1p","1p","1p", "2p","2p","2p", "3p","3p","3p", "4p","4p","4p","1p","1p","1p","1p", "2p","2p","2p", "3p","3p","3p", "4p","4p","4p"]
        
    elif scenario == "chiihou":
        game.dealer = 1
        game.turn = 1
        game.hands[0] = ["1p","1p","1p","2p","2p","2p","3p","3p","3p","4p","4p","4p","5p"]
        game.hands[1] = ["東","東","東","南","南","南","西","西","西","北","北","北","5p"]
        game.wall = ["東", "東", "東", "東", "東", "東", "東", "東","西", "西", "西", "西","南", "南", "南", "南","東", "東", "東", "東",]
        
    elif scenario == "jokerswap":
        game.dealer = 0
        game.turn = 1
        game.is_first_turn = [False, False, False, False]
        game.discards_count = 1
        game.melds[0] = [{"type": "hanakan", "tiles": ["東", "春", "東", "東"]}]
        game.hands[0] = ["1p","2p","3p","4p","5p","6p","7p","8p","9p","1s"]
        game.hands[1] = ["東","南","南","西","西","白","白","發","發","中","中","1m","2m"]
        game.wall.append("3m")
        
    elif scenario == "chankan":
        game.dealer = 0
        game.turn = 0
        game.is_first_turn = [False, False, False, False]
        game.discards_count = 5
        game.melds[0] = [{"type": "pong", "tiles": ["1p", "1p", "1p"]}]
        game.hands[0] = ["1p","2p","3p","4p","5p","6p","7p","8p","9p","1s"]
        game.hands[1] = ["2p","2p","3p","3p","4p","4p","5p","5p","6p","6p","7p","7p","1p"]
        game.wall.append("2s") 

    elif scenario == "kan_jokerswap":
        game.dealer = 0
        game.turn = 0
        game.is_first_turn = [False, False, False, False]
        game.discards_count = 5
        game.melds[1] = [{"type": "hanakan", "tiles": ["東", "春", "東", "東"]}]
        game.hands[0] = ["1p","1p","1p","1p", "2p","2p","2p", "3p","3p","3p", "4p","4p","4p"]
        game.hands[1] = ["南","南","南","西","西","西","北","北","北","白","白","發","發"]
        game.wall.append("東") 
        game.wall.append("5p")

    elif scenario == "kan_menzu_hakai":
        game.dealer = 0
        game.turn = 0
        game.is_first_turn = [False, False, False, False]
        game.discards_count = 5
        game.hands[0] = ["1p","1p","1p","1p", "2p","3p", "5s","5s","5s", "7s","7s","7s", "8s"]
        game.hands[1] = ["東","東","東","南","南","南","西","西","西","北","北","北","白"]
        game.wall.append("4p") 
        game.wall.append("8s") 

    elif scenario == 'max_buttons':
        game.hands[0] = ["1m", "1m", "1m", "2m", "2m", "2m", "3m", "3m", "3m", "春", "夏", "秋", "冬"]
        drawn_tile = "1m" 
        turn_player_idx = 0

    elif scenario == "kokushi_13":
        game.dealer = 0
        game.turn = 0
        game.hands[0] = ["1p","9p","1s","9s","1m","9m","東","南","西","北","白","發","中"]
        game.wall.append("1p") 

    elif scenario == "chuuren":
        game.dealer = 0
        game.turn = 0
        game.hands[0] = ["1s","1s","1s","2s","3s","4s","5s","6s","7s","8s","9s","9s","9s"]
        game.wall.append("5s")

    elif scenario == "post_win_swap":
        game.dealer = 0
        game.turn = 0
        game.is_first_turn = [False]*4
        game.win_tiles[0] = ["5p"] 
        game.melds[1] = [{"type": "hanakan", "tiles": ["1m", "春", "1m", "1m"]}]
        game.hands[0] = ["1p","2p","3p","4p","5p","6p","7p","8p","9p","1s","2s","3s","4s"]
        game.wall.append("1m") 

    elif scenario == "haitei_kan":
        game.dealer = 0
        game.turn = 0
        game.is_first_turn = [False]*4
        game.hands[0] = ["1p","1p","1p","1p","2p","3p","4p","5p","6p","7p","8p","9p","9p"]
        game.wall = ["9p"] 

    elif scenario == "joker_pair_kan":
        game.dealer = 0
        game.turn = 0
        game.hands[0] = ["春","夏","秋","冬","1p","1p","1p","2p","2p","2p","3p","3p","3p"]
        game.wall.append("1s")

    elif scenario == "chankan_with_joker":
        game.dealer = 0
        game.turn = 0
        game.is_first_turn = [False]*4
        game.melds[0] = [{"type": "pong", "tiles": ["5p", "5p", "5p"]}]
        game.hands[0] = ["1p","2p","3p","4p","6p","7p","8p","9p","1s","2s"] 
        game.hands[1] = ["2s","2s","3s","3s","4s","4s","5s","5s","6s","6s","3p","4p","春"]
        game.wall.append("5p")

    elif scenario == "chitoi_joker":
        game.dealer = 0
        game.turn = 0
        game.hands[0] = ["1p","1p","2p","2p","3p","3p","4p","4p","5p","5p","6p","春","夏"]
        game.wall.append("6p") 

    elif scenario == "shikantsu":
        game.dealer = 0
        game.turn = 0
        game.is_first_turn = [False]*4
        game.melds[0] = [
            {"type": "ankan", "tiles": ["1m","1m","1m","1m"]},
            {"type": "minkan", "tiles": ["2p","2p","2p","2p"]},
            {"type": "minkan", "tiles": ["3s","3s","3s","3s"]}
        ]
        game.hands[0] = ["4s","4s","4s","東"]
        game.wall.append("4s") 

    elif scenario == "conflict_call":
        game.dealer = 0
        game.turn = 0
        game.is_first_turn = [False]*4
        game.hands[0] = ["1p","2p","3p","4p","5p","6p","7p","8p","9p","1s","2s","3s","中"] 
        game.hands[1] = ["中","中","1m","2m","3m","4m","5m","6m","7m","8m","9m","1p","2p"] 
        game.hands[2] = ["中","1s","9s","1p","9p","1m","9m","東","南","西","北","白","發"] 
        game.wall.append("1m") 

    elif scenario == "all_seasons":
        game.dealer = 0
        game.turn = 0
        game.hands[0] = ["春","夏","秋","冬","1p","2p","3p","4p","5p","6p","7p","8p","9p"]
        game.wall.append("1p")

    elif scenario == "chuuren_post_win_kan":
        game.dealer = 0
        game.turn = 0
        game.is_first_turn = [False]*4
        game.win_tiles[0] = ["2s", "5s", "8s", "4s", "3s"]
        game.win_records[0] = [
            {"winning_tile": "2s", "is_tsumo": False, "is_haitei": False},
            {"winning_tile": "5s", "is_tsumo": False, "is_haitei": False},
            {"winning_tile": "8s", "is_tsumo": False, "is_haitei": False},
            {"winning_tile": "4s", "is_tsumo": False, "is_haitei": False},
            {"winning_tile": "3s", "is_tsumo": False, "is_haitei": False}
        ]
        game.hands[0] = ["1s","1s","1s","2s","3s","4s","5s","6s","7s","8s","9s","9s","9s"]
        game.wall.append("1s") 

    elif scenario == "bug_renchitoi":
        game.dealer = 0
        game.turn = 0
        game.is_first_turn = [False]*4
        game.hands[0] = ["3p","3p","4p","4p","5p","5p","6p","6p","7p","7p","8p","春","夏"]
        game.wall = ["9p"] 

    elif scenario == "bug_cpu_loop":
        game.dealer = 0
        game.turn = 1
        game.is_first_turn = [True, True, True, True]
        game.hands[1] = ["1s","1s","2s","2s","3s","3s","4s","4s","5s","5s","6s","6s","7s"]
        game.wall.append("7s")

    elif scenario == "bug_ui_tenhou":
        game.dealer = 0
        game.turn = 0
        game.is_first_turn = [True, True, True, True]
        game.hands[0] = ["東","東","南","南","西","西","北","北","白","白","發","發","中"]
        game.wall.append("中")
        
    elif scenario == "test_haitei_stop":
        game.dealer = 0
        game.turn = 0
        game.is_first_turn = [False]*4
        game.win_tiles[0] = ["2s", "5s", "8s", "4s", "3s"]
        game.win_records[0] = [
            {"winning_tile": "2s", "is_tsumo": False, "is_haitei": False},
            {"winning_tile": "5s", "is_tsumo": False, "is_haitei": False},
            {"winning_tile": "8s", "is_tsumo": False, "is_haitei": False},
            {"winning_tile": "4s", "is_tsumo": False, "is_haitei": False},
            {"winning_tile": "3s", "is_tsumo": False, "is_haitei": False}
        ]
        game.hands[0] = ["1s","1s","1s","2s","3s","4s","5s","6s","7s","8s","9s","9s","9s"]
        game.wall = ["白", "發", "白", "白", "1p"]

    elif scenario == "test_cpu_haitei":
        game.dealer = 3
        game.turn = 3
        game.is_first_turn = [False]*4
        game.win_tiles[3] = ["2s", "5s", "8s", "4s", "3s"]
        game.win_records[0] = [
            {"winning_tile": "2s", "is_tsumo": False, "is_haitei": False},
            {"winning_tile": "5s", "is_tsumo": False, "is_haitei": False},
            {"winning_tile": "8s", "is_tsumo": False, "is_haitei": False},
            {"winning_tile": "4s", "is_tsumo": False, "is_haitei": False},
            {"winning_tile": "3s", "is_tsumo": False, "is_haitei": False}
        ]
        game.hands[3] = ["1s","1s","1s","2s","3s","4s","春","6s","7s","8s","9s","9s","9s"]
        game.wall = ["1p"]

    elif scenario == "test_player_chankan":
        game.dealer = 1
        game.turn = 1
        game.is_first_turn = [False]*4
        game.melds[1] = [{"type": "pong", "tiles": ["5p", "5p", "5p"]}]
        game.hands[1] = ["1m","2m","3m","4m","5m","6m","7m","8m","9m","1s"]
        game.wall = ["1p", "5p"] 
        
        game.hands[0] = ["1s","1s","1s","2s","2s","2s","3s","3s","3s","9p","9p","4p","6p"]

    elif scenario == "ankan_tenhou":
        game.dealer = 0
        game.turn = 0
        game.is_first_turn = [True] * 4
        game.hands[0] = ["1p","1p","1p","1p","2p","2p","2p","3p","3p","3p","4p","4p","春"]
        game.wall.append("4p")

    elif scenario == "all_waits_1st_turn":
        game.dealer = 1
        game.turn = 1 
        game.is_first_turn = [True] * 4
        
        game.hands[0] = ["1p","1p","1p","2p","2p","2p","4p","4p","4p","5p","5p","5p","春"]
        
        game.hands[1] = ["1p","3p","5p","7p","9p","1s","3s","5s","7s","9s","東","西","白"]
        game.hands[2] = ["1p","3p","5p","7p","9p","1s","3s","5s","7s","9s","東","西","白"]
        game.hands[3] = ["1p","3p","5p","7p","9p","1s","3s","5s","7s","9s","東","西","白"]
        
        game.wall.append("北")

    elif scenario == "cpu_tenhou":
        game.dealer = 1
        game.turn = 1
        game.is_first_turn = [True, True, True, True]
        game.discards_count = 0
        game.hands[1] = ["1p","1p","1p","2p","2p","2p","3p","3p","3p","4p","4p","4p","5p"]
        game.wall.append("5p") 

    elif scenario == "cpu_chiihou":
        game.dealer = 0
        game.turn = 1 
        game.is_first_turn = [False, True, True, True]
        game.discards_count = 1 
        game.discards[0] = ["北"]
        game.hands[1] = ["1s","1s","1s","2s","2s","2s","3s","3s","3s","4s","4s","4s","5s"]
        game.wall.append("5s") 

    elif scenario == "test_zentan_flower":
        game.dealer = 0
        game.turn = 1 
        game.is_first_turn = [False, False, False, False]
        game.hands[1] = ["1p","1p","1m","3p","5p","7p","1s","3s","3s","7s","7s","9s","春"]
        game.hands[0] = ["1p","1p","1m","3p","5p","7p","1s","3s","3s","7s","7s","9s","春"]
        game.wall.append("8s")

    elif scenario == "test_qixing_flower":
        game.dealer = 0
        game.turn = 1 
        game.is_first_turn = [False, False, False, False]
        
        game.cpu_personalities[1] = 1 
        
        game.hands[1] = ["1m","2p","5p","8p","3s","6s","9s","東","南","西","北","白","春"]
        
        game.wall.append("中")

    elif scenario == "test_kokushi_pass":
        game.dealer = 0
        game.turn = 1 
        game.hands[1] = ["1m","1m","9m","1p","9p","1s","9s","東","南","西","北","白","春"]
        game.wall = ["1m"] * 30 
        game.wall = ["1m","1m","9m","1p","9p","1s","9s","1m","1m","9m","1p","9p","1s","9s","1m","1m","9m","1p","9p","1s","9s","1m","1m","9m","1p","9p","1s","9s","發", "白", "東", "白", "1p"] 

    elif scenario == "test_kokushi_win":
        game.dealer = 0
        game.turn = 0 
        game.hands[1] = ["1m","1m","9m","1p","9p","1s","9s","東","南","西","北","白","春"]
        game.wall = ["1m"] * 10
        lastT = "發"

    elif scenario == "test_chankan_all_waits":
        game.dealer = 1
        game.turn = 1 
        game.is_first_turn = [False, False, False, False]
        
        game.hands[0] = ["1s","1s","2s","2s","3s","3s","4s","4s","6s","6s","8s","8s","春"]
        
        game.melds[1] = [{"type": "pong", "tiles": ["5p", "5p", "5p"]}]
        game.hands[1] = ["1m","2m","3m","4m","5m","6m","7m","8m","9m","1p"]
        
        game.wall = ["1p", "5p"]

    elif scenario == "test_kankou_dokuchou":
        game.dealer = 0
        game.turn = 0
        game.is_first_turn = [False]*4
        game.melds[0] = [
            {"type": "pong", "tiles": ["1p", "1p", "1p"]},
            {"type": "pong", "tiles": ["3p", "3p", "3p"]},
            {"type": "pong", "tiles": ["5p", "5p", "5p"]},
            {"type": "pong", "tiles": ["7p", "7p", "7p"]}
        ]
        game.hands[0] = ["9p"] 
        game.wall = ["9p"] 

    elif scenario == "test_daisuufoukai":
        game.dealer = 0
        game.turn = 0
        game.is_first_turn = [False]*4
        game.melds[0] = [
            {"type": "pong", "tiles": ["東", "東", "東"]},
            {"type": "pong", "tiles": ["南", "南", "南"]},
            {"type": "pong", "tiles": ["西", "西", "西"]},
            {"type": "pong", "tiles": ["北", "北", "北"]}
        ]
        game.hands[0] = ["白"] 
        game.wall = ["白"] 

    elif scenario == "test_tsuuiisou_chitoi":
        game.dealer = 0
        game.turn = 0
        game.is_first_turn = [False]*4
        game.hands[0] = ["東","東","東","東","南","南","西","西","北","北","白","白","發"]
        game.wall = ["發"]

    elif scenario == "test_headbump":
        # 頭ハネテスト：自分がポンできる牌をCPU3が捨てるが、CPU1のロンが優先される
        game.dealer = 0
        game.turn = 2 
        game.is_first_turn = [False]*4
        game.hands[0] = ["1p","1p","2s","3s","4s","5s","6s","7s","8s","9s","東","南","西"]
        game.hands[1] = ["1p","白","發","中","東","南","西","北","1s","9s","1m","9m","9p"]
        game.hands[2] = ["1p","白","發","中","東","南","西","北","1s","9m","1m","1p","9p"]
        game.hands[3] = ["1p","白","發","中","東","南","西","北","1s","9s","1m","9m","9p"]
        game.wall = ["1p", "1p", "1p", "1p", "1p", "1p", "1p", "1p", "1p", "1p", "1p", "1p"]

    elif scenario == "test_cpu_keep_joker":
        # CPU四季牌キープテスト：和了済みのCPU1が四季牌を引いた時、手持ちの「東」と入れ替えて捨てるか
        game.dealer = 1
        game.turn = 0
        game.is_first_turn = [False]*4
        game.win_tiles[1] = ["1p"] 
        game.hands[1] = ["1p","1p","1p","2p","2p","2p","3p","3p","3p","4p","4p","4p","東"] 
        game.hands[0] = ["南","西","北","白","發","中","1m","9m","1s","9s","1p","9p","2m"]
        game.wall = ["春", "西"]

    elif scenario == "syabomachi":
        game.dealer = 0
        game.turn = 3  # CPU3に捨てさせる
        game.is_first_turn = [False]*4
        
        # 0番（あなた）の副露をセット
        game.melds[0] = [
            {"type": "ankan", "tiles": ["1m","1m","1m","1m"]},
            {"type": "minkan", "tiles": ["2p","2p","2p","2p"]},
            {"type": "minkan", "tiles": ["3s","3s","3s","3s"]}
        ]
        
        # 0番の手牌をセット
        game.hands[0] = ["4s","4s","5s","5s"]
        
        # 山札のセット
        game.wall = ["4s", "5s"] + ["1p"] * 20
        
        # CPU3の手牌をセット
        game.hands[3] = ["4s", "1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "2p", "3p"]

    elif scenario == "test_chow_patern":
        game.dealer = 0
        game.turn = 0
        game.is_first_turn = [False]*4
        game.hands[0] = ["夏","秋","9s","1p","1p","1p","西","9p","9p","9p","白","白","白"]
        game.wall = ["8s"]

    elif scenario == "test_sibugao_sijiegao":
        game.dealer = 0
        game.turn = 0
        game.is_first_turn = [False]*4
        game.hands[0] = ["4s","5s","5s","5s","6s","6s","6s","7s","8s","8s","春","夏","秋"]
        game.wall = ["7s","7s","7s","7s","4s","4s","4s","4s","3s","3s","3s","3s","2s","2s",
                     "2s","2s","5s","5s","5s","5s","6s","6s","6s","6s","8s","8s","8s","8s",
                     "1s","1s","1s","1s","9s","9s","9s","9s"]

    #実績解除テストケース
    elif scenario == "achieve_wide_wait":
        game.dealer = 0
        game.turn = 0
        # 3つの順子 + 四季牌4枚。
        # 四季牌4枚は「どんな形にもなれる」ため、実質的に全種待ち(34面待ち)状態になります。
        game.hands[0] = ["1m","2m","3m","4p","5p","6p","7s","8s","9s","春","夏","秋","冬"]
        game.wall = ["東"] * 20 # ツモ用に適当に積む
        
    elif scenario == "achieve_seasons":
        game.dealer = 0
        game.turn = 0
        # 四季牌4枚を抱えた状態でテンパイ。引くだけで「四季常春」達成。
        game.hands[0] = ["東","東","東","南","南","南","西","西","西","春","夏","秋","冬"]
        game.wall.append("北")
        
    elif scenario == "achieve_fullhouse":
        game.dealer = 0
        game.turn = 0
        # 大三元(16) + 字一色(16) などが確定する超絶配牌。ツモるだけで7役以上複合！
        game.hands[0] = ["白","白","白","發","發","發","中","中","中","東","東","東","南"]
        game.wall.append("南")
        
    elif scenario == "pacifist":
        # 最終局(オーラス)で、自分だけ0点、他家が全員マイナスの状態を作る
        game.current_round = 4
        game.total_scores = [0, -10000, -10000, -10000]
        game.dealer = 1
        game.turn = 1
        # CPU1にすぐにアガらせてゲームを終了させる
        game.hands[1] = ["東","東","東","南","南","南","西","西","西","北","北","北","白"]
        game.wall.append("白")
        
    elif scenario == "comeback":
        # オーラスで自分がダントツの最下位(-3万点)
        game.current_round = 4
        game.total_scores = [-30000, 40000, 30000, 20000]
        game.dealer = 0
        game.turn = 0
        # 逆転トップになれる超特大役満（天胡＋大三元など）の配牌をプレゼント
        game.hands[0] = ["白","白","白","發","發","發","中","中","中","東","東","東","南"]
        game.wall.append("南")
        
    elif scenario == "clutch":
        # オーラス、3位(10001点)と1点差の4位(10000点)
        game.current_round = 4
        game.total_scores = [10000, 10001, 30000, 20000]
        game.dealer = 0
        game.turn = 0
        # 無役（無番和）＝1点でアガって逆転できる手牌
        game.hands[0] = ["1m","2m","3m","5p","6p","7p","2s","3s","4s","6s","7s","8s","北"]
        game.wall.append("北")
        
    elif scenario == "achieve_welcomehome":
        # ※「おかえりなさい」のテスト用に、サーバー側のフラグを立てておく
        game.debug_welcome_home = True
        game.dealer = 0
        game.turn = 0
        game.hands[0] = ["1p","2p","3p","4p","5p","6p","7p","8p","9p","1s","2s","3s","4s"]

    for i in range(4):
        game.hands[i] = game.sort_hand(game.hands[i])
        
    return get_safe_state(game)

# 🎯 UI表示用：現在のテンパイ待ち牌、または「何を切ればテンパイか」を計算して返すAPI
@app.get("/get_waits")
def get_waits(player_idx: int = 0, game: GameState = Depends(get_current_game)):
    hand = list(game.hands[player_idx])
    melds = game.melds[player_idx]
    has_won = len(game.win_tiles[player_idx]) > 0
    last_drawn = game.last_drawn[player_idx] 
    
    if len(hand) % 3 == 1:
        waits = []
        closed_str = " ".join(hand)
        for t in TILE_NAMES + list(SEASON_TILES):
            win_ctx = {"winning_tile": t, "is_tsumo": False, "is_haitei": False}
            res = evaluate_hand({"closed_tiles": closed_str, "melds": melds, "win_context": win_ctx})
            if "error" not in res:
                waits.append(t)
        return {"waits": waits}
    
    elif len(hand) % 3 == 2:
        nanikiru_results = {}
        
        if has_won:
            candidates = [last_drawn] if last_drawn in hand else []
        else:
            candidates = set(hand)
            
        for discard_tile in candidates:
            temp_hand = list(hand)
            temp_hand.remove(discard_tile)
            
            waits = []
            closed_str = " ".join(temp_hand)
            for t in TILE_NAMES + list(SEASON_TILES):
                win_ctx = {"winning_tile": t, "is_tsumo": False, "is_haitei": False}
                res = evaluate_hand({"closed_tiles": closed_str, "melds": melds, "win_context": win_ctx})
                if "error" not in res:
                    waits.append(t)
            
            if waits:
                nanikiru_results[discard_tile] = waits
        return {"nanikiru": nanikiru_results}
    
    return {"waits": []}