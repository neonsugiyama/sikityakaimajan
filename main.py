import random
import traceback
from typing import Dict, List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

# 🧠 「麻雀の脳みそ（ルールとAI）」を読み込むtest1
# ※ GameState と get_safe_state は main.py 側で定義するので外す
from mahjong_logic import (
    evaluate_hand, get_waits_for_hand, determine_target, evaluate_tile_dynamically, 
    is_kan_valid_for_player, get_visible_count, SEASON_TILES, TILE_NAMES, ODDS, SORT_ORDER,
    is_agari
)

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

app.mount("/static", StaticFiles(directory="."), name="static")
app.mount("/images", StaticFiles(directory="images"), name="images")
app.mount("/audio", StaticFiles(directory="audio"), name="audio")

# ==========================================
# 🎲 状態管理クラス & 牌譜記録システム (main.pyに集約)
# ==========================================
class GameState:
    def __init__(self):
        # 局をまたいで保持するデータ
        self.current_round = 1
        self.dealer = random.randint(0, 3) 
        self.scores = [0, 0, 0, 0] 
        self.total_scores = [0, 0, 0, 0] 
        self.cpu_personalities = ["", random.randint(1, 4), random.randint(1, 4), random.randint(1, 4)]
        self.cpu_level = 1
        print(f"【CPU起動】 CPU1:タイプ{self.cpu_personalities[1]}, CPU2:タイプ{self.cpu_personalities[2]}, CPU3:タイプ{self.cpu_personalities[3]}")
        
        # 📼 牌譜（リプレイ）保存用データ
        self.replay_data = {
            "room_id": "",
            "start_time": "",
            "player_names": ["あなた", "CPU 1", "CPU 2", "CPU 3"],
            "rounds": [] # 各局の全ログを配列で保持
        }
        
        self.reset_round()

    def reset_round(self):
        """局の開始時に状態をリセットし、牌譜の新しい章を作る"""
        self.wall = (TILE_NAMES * 4) + list(SEASON_TILES)
        random.shuffle(self.wall)
        
        # 手牌の配分
        self.hands = [self.sort_hand([self.wall.pop() for _ in range(13)]) for _ in range(4)]
        self.melds = [[] for _ in range(4)]
        self.win_tiles = [[] for _ in range(4)]
        self.win_records = [[] for _ in range(4)]
        self.discards = [[] for _ in range(4)]
        self.last_drawn = [""] * 4
        self.turn = self.dealer
        self.scores = [0, 0, 0, 0]
        
        # 思考用データ
        self.cpu_targets = ["", "", "", ""]
        self.cpu_initial_targets = ["", "", "", ""]
        self.cpu_fixed_scores = [{}, {}, {}, {}]
        
        # フラグ類
        self.is_first_turn = [True, True, True, True]
        self.any_meld_occurred = False
        self.discards_count = 0
        self.just_drawn = -1 
        self.last_discard_info = {"player": -1, "tile": ""}
        self.round_calculated = False 
        self.last_calc_data = None 
        self.charleston_done = False
        self.second_charleston_done = False

        # 📼 牌譜の初期状態を記録
        self.current_round_log = {
            "round": self.current_round,
            "dealer": self.dealer,
            "initial_hands": [list(h) for h in self.hands],
            "wall": list(self.wall),
            "actions": [] # ツモ、打牌、鳴きなどの時系列ログ
        }
    # 配牌（チャールストン前）の初期状態を「Step 1 (start)」として記録しておく
        import json
        initial_action = {
            "type": "start",
            "turn": self.dealer,
            "state_snapshot": json.loads(json.dumps(get_safe_state(self, 0, {
                "discards": [[] for _ in range(4)],
                "last_drawn": [""] * 4
            })))
        }
        self.current_round_log["actions"].append(initial_action)

    def sort_hand(self, hand):
        return sorted(hand, key=lambda x: SORT_ORDER.get(x, 999))

    def append_log(self, action_type, **kwargs):
        if not hasattr(self, 'current_round_log'): return
        entry = {"type": action_type, "turn": self.turn}
        entry.update(kwargs)
        
        # 🌟 修正：jsonを使って「その瞬間の状態」を完全に凍結（ディープコピー）する！
        import json
        snapshot = json.loads(json.dumps(get_safe_state(self, 0, {
            "discards": [list(d) for d in self.discards],
            "last_drawn": list(self.last_drawn)
        })))
        entry["state_snapshot"] = snapshot
        
        self.current_round_log["actions"].append(entry)

    def finalize_round_log(self, results):
        if not hasattr(self, 'current_round_log'): return
        self.current_round_log["results"] = results
        
        # 🌟 追加：局終了時も凍結して保存
        import json
        end_action = {
            "type": "round_end",
            "turn": self.turn,
            "state_snapshot": json.loads(json.dumps(get_safe_state(self, 0, {
                "discards": [list(d) for d in self.discards],
                "last_drawn": list(self.last_drawn)
            })))
        }
        self.current_round_log["actions"].append(end_action)
        self.replay_data["rounds"].append(self.current_round_log)


# 📦 フロントエンド（JS）に送付するための、安全な盤面データをまとめる関数
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
        "cpu_personalities": game.cpu_personalities,
        "discards_count": game.discards_count,
        "any_meld_occurred": game.any_meld_occurred,
        "just_drawn": game.just_drawn,
        "last_drawn": game.last_drawn,
        "last_discard_info": game.last_discard_info,
        "round_calculated": getattr(game, 'round_calculated', False),
        "charleston_done": getattr(game, 'charleston_done', False),
        "second_charleston_done": getattr(game, 'second_charleston_done', False)
    }
    if extra_data: res.update(extra_data)
    return res

# ==========================================
# 🌐 画面表示用のAPI（フロントエンド配信）
# ==========================================

# 🌟 開発中はキャッシュを無効化（ブラウザに古いJSを掴ませない）
NOCACHE_HEADERS = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
}

# 🏠 トップページ（HTML）をブラウザに返す
@app.get("/")
def read_root():
    return FileResponse("index.html", headers=NOCACHE_HEADERS)

# 🎨 デザイン（CSS）をブラウザに返す
@app.get("/style.css")
def read_css():
    return FileResponse("style.css", headers=NOCACHE_HEADERS)

# 🧠 フロントエンドの動き（JS）をブラウザに返す
@app.get("/game.js")
def read_js():
    return FileResponse("game.js", headers=NOCACHE_HEADERS)

@app.get("/audio.js")
async def get_audio_js():
    return FileResponse("audio.js", headers=NOCACHE_HEADERS)

@app.get("/api.js")
async def get_api_js():
    return FileResponse("api.js", headers=NOCACHE_HEADERS)

@app.get("/stats.js")
async def get_stats_js():
    return FileResponse("stats.js", headers=NOCACHE_HEADERS)

@app.get("/tutorial.js")
async def get_tutorial_js():
    return FileResponse("tutorial.js", headers=NOCACHE_HEADERS)

@app.get("/ui.js")
async def get_ui_js():
    return FileResponse("ui.js", headers=NOCACHE_HEADERS)

@app.get("/config.js")
async def get_config_js():
    return FileResponse("config.js", headers=NOCACHE_HEADERS)

@app.get("/app.js")
async def get_app_js():
    return FileResponse("app.js", headers=NOCACHE_HEADERS)

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

# 🌟 友人戦用：各プレイヤーの視点で「自分が常に席0」に見えるよう state を回転させて返すヘルパー
def get_friend_safe_state(room_game, player_idx, extra_data=None):
    n = 4
    def rotate(arr):
        return [arr[(player_idx + i) % n] for i in range(n)]
    placeholder_hands = []
    for i in range(n):
        actual_seat = (player_idx + i) % n
        if i == 0:
            placeholder_hands.append(list(room_game.hands[actual_seat]))
        else:
            placeholder_hands.append(["ura"] * len(room_game.hands[actual_seat]))
    rotated_discards = rotate(room_game.discards)
    state = {
        "status": "success",
        "player_hand": list(room_game.hands[player_idx]),
        "player_melds": list(room_game.melds[player_idx]),
        "player_win_tiles": list(room_game.win_tiles[player_idx]),
        "all_hands": placeholder_hands,
        "all_melds": rotate(room_game.melds),
        "all_win_tiles": rotate(room_game.win_tiles),
        "discards": [list(d) for d in rotated_discards],
        "turn": (room_game.turn - player_idx + n) % n,
        "dealer": (room_game.dealer - player_idx + n) % n,
        "current_round": room_game.current_round,
        "scores": rotate(room_game.scores),
        "total_scores": rotate(room_game.total_scores),
        "wall_count": len(room_game.wall),
        "discards_count": room_game.discards_count,
        "any_meld_occurred": room_game.any_meld_occurred,
        "charleston_done": getattr(room_game, 'charleston_done', False),
        "second_charleston_done": getattr(room_game, 'second_charleston_done', False),
        "cpu_personalities": [0, 0, 0, 0],
        "cpu_targets": ["", "", "", ""],
    }

    # 🌟 ツモ情報を回転：自分のツモ牌だけ実際の牌、他者は空文字で隠す
    just_drawn = -1
    if getattr(room_game, 'just_drawn', -1) >= 0:
        just_drawn = (room_game.just_drawn - player_idx + n) % n
    last_drawn_arr = []
    for i in range(n):
        actual_seat = (player_idx + i) % n
        if i == 0:
            last_drawn_arr.append(room_game.last_drawn[actual_seat])
        else:
            last_drawn_arr.append("")
    state["just_drawn"] = just_drawn
    state["last_drawn"] = last_drawn_arr

    # 🌟 直前打牌情報の回転
    ldi = getattr(room_game, 'last_discard_info', {"player": -1, "tile": ""})
    if ldi.get("player", -1) >= 0:
        state["last_discard_info"] = {
            "player": (ldi["player"] - player_idx + n) % n,
            "tile": ldi["tile"]
        }
    else:
        state["last_discard_info"] = {"player": -1, "tile": ""}

    # 🌟 友人戦：自模可能フラグ（受信者が今ツモった人で、和了形になっているか）
    can_tsumo = False
    if getattr(room_game, 'just_drawn', -1) == player_idx and not room_game.win_tiles[player_idx]:
        last_tile = room_game.last_drawn[player_idx]
        if last_tile:
            temp_hand = list(room_game.hands[player_idx])
            if last_tile in temp_hand:
                temp_hand.remove(last_tile)
            win_ctx = {
                "winning_tile": last_tile,
                "is_tsumo": True,
                "is_haitei": len(room_game.wall) == 0,
                "is_joker_swap": False,
                "is_rinshan": False,
                "is_first_turn": room_game.is_first_turn[player_idx],
                "any_meld_occurred": room_game.any_meld_occurred,
                "is_dealer": room_game.dealer == player_idx,
                "discards_count": room_game.discards_count,
            }
            check_data = {
                "closed_tiles": " ".join(temp_hand),
                "melds": room_game.melds[player_idx],
                "win_context": win_ctx
            }
            try:
                if is_agari(check_data):
                    can_tsumo = True
            except Exception as e:
                print(f"[DEBUG] can_tsumo check error: {e}")
    state["can_tsumo"] = can_tsumo

    # 🌟 友人戦：ロン/ポン/カン可能フラグ（他者の打牌に対して）
    can_ron = False
    can_pon = False
    can_kan = False
    pending_call = getattr(room_game, 'pending_call', None)
    if pending_call and pending_call.get("discarder", -1) != player_idx:
        discarder = pending_call["discarder"]
        tile = pending_call["tile"]
        # ロン判定
        if not room_game.win_tiles[player_idx]:
            win_ctx = {
                "winning_tile": tile,
                "is_tsumo": False,
                "is_haitei": len(room_game.wall) == 0,
                "is_joker_swap": False,
                "is_rinshan": False,
                "is_chankan": False,
                "is_first_turn": room_game.is_first_turn[player_idx],
                "any_meld_occurred": room_game.any_meld_occurred,
                "is_dealer": room_game.dealer == player_idx,
                "discards_count": room_game.discards_count,
            }
            check_data = {
                "closed_tiles": " ".join(room_game.hands[player_idx]),
                "melds": room_game.melds[player_idx],
                "win_context": win_ctx
            }
            try:
                total_tiles = len(room_game.hands[player_idx]) + 1 + len(room_game.melds[player_idx]) * 3
                if total_tiles == 14 and is_agari(check_data):
                    can_ron = True
            except Exception as e:
                print(f"[DEBUG] can_ron check error: {e}")
        # ポン判定（手牌に同じ牌が2枚以上）
        if room_game.hands[player_idx].count(tile) >= 2 and tile not in SEASON_TILES:
            can_pon = True
        # 明槓判定（手牌に同じ牌が3枚）
        if room_game.hands[player_idx].count(tile) >= 3 and tile not in SEASON_TILES:
            can_kan = True
    state["can_ron"] = can_ron
    state["can_pon"] = can_pon
    state["can_kan"] = can_kan
    state["pending_call"] = bool(pending_call)

    if extra_data:
        state.update(extra_data)
    return state

# 🌟 イベント内の絶対席インデックスを、受信プレイヤー視点（自分=0）に回転させる
def translate_event_for(event, player_idx):
    if not event:
        return event
    n = 4
    e = dict(event)
    if 'player_idx' in e and isinstance(e['player_idx'], int):
        e['player_idx'] = (e['player_idx'] - player_idx + n) % n
    if 'active_players' in e and isinstance(e['active_players'], list):
        e['active_players'] = [(p - player_idx + n) % n for p in e['active_players']]
    return e

async def broadcast_friend_update(room_id: str, room_game, event_log: dict):
    """各クライアントへ視点回転済みの状態とイベントを送信する"""
    if room_id not in lobby_manager.active_connections:
        return
    for i, connection in enumerate(lobby_manager.active_connections[room_id]):
        try:
            await connection.send_json({
                "type": "update",
                "event": translate_event_for(event_log, i),
                "state": get_friend_safe_state(room_game, i)
            })
        except Exception as ex:
            print(f"[DEBUG ERROR] broadcast_friend_update 送信失敗: {ex}")

# 🌟 友人戦：呼び出し待機の解決処理
async def _resolve_pending_call(room_id, room_game):
    """pending_call の応答を集計して、優先順位（ロン > ポン > 明槓 > スキップ）で解決"""
    pc = getattr(room_game, 'pending_call', None)
    if not pc:
        return None
    discarder = pc["discarder"]
    tile = pc["tile"]
    responses = pc["responses"]

    # 優先順位探索
    ron_claimers = [p for p, r in responses.items() if r == "ron"]
    pon_claimers = [p for p, r in responses.items() if r == "pon"]
    kan_claimers = [p for p, r in responses.items() if r == "kan"]

    event_log = None

    if ron_claimers:
        # 打牌者の下家から優先（複数いる場合は最も近い人=頭跳ね）
        order = [(discarder + 1) % 4, (discarder + 2) % 4, (discarder + 3) % 4]
        winner = next((p for p in order if p in ron_claimers), ron_claimers[0])
        # ロン適用
        win_ctx = {
            "winning_tile": tile, "is_tsumo": False,
            "is_haitei": len(room_game.wall) == 0,
            "is_joker_swap": False, "is_rinshan": False, "is_chankan": False,
            "is_first_turn": room_game.is_first_turn[winner],
            "any_meld_occurred": room_game.any_meld_occurred,
            "is_dealer": room_game.dealer == winner,
            "discards_count": room_game.discards_count,
        }
        check_data = {
            "closed_tiles": " ".join(room_game.hands[winner]),
            "melds": room_game.melds[winner],
            "win_context": win_ctx
        }
        if is_agari(check_data):
            # 河から打牌牌を取り除く（ロン牌は手牌に組み込まれる）
            if room_game.discards[discarder] and room_game.discards[discarder][-1] == tile:
                room_game.discards[discarder].pop()
            room_game.win_records[winner].append(win_ctx)
            room_game.win_tiles[winner].append(tile)
            room_game.last_discard_info = {"player": -1, "tile": ""}
            room_game.round_calculated = True
            effects = get_special_effects(room_game, winner, win_ctx)
            event_log = {"action": "win", "win_type": "ron", "player_idx": winner, "tile": tile, "from_player": discarder, "yaku": effects}
        else:
            print(f"[DEBUG] ron claim invalid for player {winner}")

    elif pon_claimers:
        # ポン適用：打牌者の下家から優先（同時はあり得ないが念のため）
        order = [(discarder + 1) % 4, (discarder + 2) % 4, (discarder + 3) % 4]
        claimer = next((p for p in order if p in pon_claimers), pon_claimers[0])
        # 手牌から同種2枚を取り除き、副露としてpongを記録
        if room_game.hands[claimer].count(tile) >= 2:
            room_game.hands[claimer].remove(tile)
            room_game.hands[claimer].remove(tile)
            room_game.melds[claimer].append({"type": "pong", "tiles": [tile, tile, tile], "from_player": discarder})
            if room_game.discards[discarder] and room_game.discards[discarder][-1] == tile:
                room_game.discards[discarder].pop()
            room_game.any_meld_occurred = True
            room_game.is_first_turn[claimer] = False
            room_game.turn = claimer  # ポンしたプレイヤーのターンへ
            room_game.just_drawn = -1
            room_game.last_discard_info = {"player": -1, "tile": ""}
            event_log = {"action": "meld", "meld_type": "pong", "player_idx": claimer, "tile": tile, "from_player": discarder}

    elif kan_claimers:
        # 明槓適用
        order = [(discarder + 1) % 4, (discarder + 2) % 4, (discarder + 3) % 4]
        claimer = next((p for p in order if p in kan_claimers), kan_claimers[0])
        if room_game.hands[claimer].count(tile) >= 3:
            for _ in range(3):
                room_game.hands[claimer].remove(tile)
            room_game.melds[claimer].append({"type": "minkan", "tiles": [tile, tile, tile, tile], "from_player": discarder})
            if room_game.discards[discarder] and room_game.discards[discarder][-1] == tile:
                room_game.discards[discarder].pop()
            room_game.any_meld_occurred = True
            room_game.is_first_turn[claimer] = False
            room_game.turn = claimer
            room_game.last_discard_info = {"player": -1, "tile": ""}
            # 嶺上ツモ
            if room_game.wall:
                rinshan = room_game.wall.pop()
                room_game.hands[claimer].append(rinshan)
                room_game.last_drawn[claimer] = rinshan
                room_game.just_drawn = claimer
            room_game.hands[claimer] = room_game.sort_hand(room_game.hands[claimer])
            event_log = {"action": "meld", "meld_type": "minkan", "player_idx": claimer, "tile": tile, "from_player": discarder}

    room_game.pending_call = None
    return event_log

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
                        "state": get_friend_safe_state(room_game, i)
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
                    # --- 自摸和了 ---
                    if action == "win_tsumo":
                        if room_game.turn != p_idx or room_game.just_drawn != p_idx:
                            print(f"[DEBUG LOG] win_tsumo: ターン/ツモ違反")
                            continue
                        last_tile = room_game.last_drawn[p_idx]
                        if not last_tile:
                            continue
                        temp_hand = list(room_game.hands[p_idx])
                        if last_tile in temp_hand:
                            temp_hand.remove(last_tile)
                        win_ctx = {
                            "winning_tile": last_tile, "is_tsumo": True,
                            "is_haitei": len(room_game.wall) == 0,
                            "is_joker_swap": False, "is_rinshan": False,
                            "is_first_turn": room_game.is_first_turn[p_idx],
                            "any_meld_occurred": room_game.any_meld_occurred,
                            "is_dealer": room_game.dealer == p_idx,
                            "discards_count": room_game.discards_count,
                        }
                        check_data = {
                            "closed_tiles": " ".join(temp_hand),
                            "melds": room_game.melds[p_idx],
                            "win_context": win_ctx
                        }
                        if not is_agari(check_data):
                            print(f"[DEBUG LOG] win_tsumo: 和了形ではない")
                            continue
                        room_game.win_records[p_idx].append(win_ctx)
                        room_game.win_tiles[p_idx].append(last_tile)
                        room_game.last_discard_info = {"player": -1, "tile": ""}
                        room_game.is_first_turn[p_idx] = False
                        effects = get_special_effects(room_game, p_idx, win_ctx)
                        room_game.round_calculated = True
                        event_log = {"action": "win", "win_type": "tsumo", "player_idx": p_idx, "tile": last_tile, "yaku": effects}

                    # --- ⓪ ツモ処理（友人戦：山から1枚引く）---
                    elif action == "draw":
                        if room_game.turn != p_idx:
                            print(f"[DEBUG LOG] draw: プレイヤー {p_idx} のターンではない (現在 turn={room_game.turn})。無視。")
                            continue
                        if not room_game.wall:
                            print(f"[DEBUG LOG] draw: 山札なし → 流局")
                            event_log = {"action": "ryukyoku"}
                        else:
                            tile = room_game.wall.pop()
                            room_game.hands[p_idx].append(tile)
                            room_game.last_drawn[p_idx] = tile
                            room_game.hands[p_idx] = room_game.sort_hand(room_game.hands[p_idx])
                            room_game.just_drawn = p_idx
                            room_game.last_discard_info = {"player": -1, "tile": ""}
                            print(f"[DEBUG LOG] draw: プレイヤー {p_idx} が {tile} をツモ（残り山={len(room_game.wall)}）")
                            event_log = {"action": "draw", "player_idx": p_idx}

                    # --- ① 打牌処理 ---
                    elif action == "discard":
                        tile = data.get("tile")
                        print(f"[DEBUG LOG] プレイヤー {p_idx} が {tile} を打牌しました。")
                        if room_game.turn != p_idx:
                            print(f"[DEBUG LOG] discard: ターン違反 (現在 turn={room_game.turn})。無視。")
                            continue
                        if tile not in room_game.hands[p_idx]:
                            print(f"[DEBUG LOG] discard: 牌 {tile} が手牌にない。無視。")
                            continue
                        room_game.hands[p_idx].remove(tile)
                        room_game.hands[p_idx] = room_game.sort_hand(room_game.hands[p_idx])
                        room_game.discards[p_idx].append(tile)
                        room_game.discards_count += 1
                        room_game.is_first_turn[p_idx] = False
                        room_game.just_drawn = -1
                        room_game.last_discard_info = {"player": p_idx, "tile": tile}

                        # 🌟 友人戦：呼び出し待機フェーズを開始
                        room_game.pending_call = {"discarder": p_idx, "tile": tile, "responses": {}}
                        # 各非打牌者が呼び出し可能かを判定
                        for ndp in range(4):
                            if ndp == p_idx:
                                continue
                            # 既に和了済みのプレイヤーは呼び出し不可
                            if room_game.win_tiles[ndp]:
                                room_game.pending_call["responses"][ndp] = "skip"
                                continue
                            # ロン・ポン・明槓どれかが可能かチェック
                            has_action = False
                            if room_game.hands[ndp].count(tile) >= 2 and tile not in SEASON_TILES:
                                has_action = True
                            if not has_action:
                                # ロンチェック
                                win_ctx = {
                                    "winning_tile": tile, "is_tsumo": False,
                                    "is_haitei": len(room_game.wall) == 0,
                                    "is_joker_swap": False, "is_rinshan": False, "is_chankan": False,
                                    "is_first_turn": room_game.is_first_turn[ndp],
                                    "any_meld_occurred": room_game.any_meld_occurred,
                                    "is_dealer": room_game.dealer == ndp,
                                    "discards_count": room_game.discards_count,
                                }
                                check_data = {
                                    "closed_tiles": " ".join(room_game.hands[ndp]),
                                    "melds": room_game.melds[ndp],
                                    "win_context": win_ctx
                                }
                                try:
                                    total_tiles = len(room_game.hands[ndp]) + 1 + len(room_game.melds[ndp]) * 3
                                    if total_tiles == 14 and is_agari(check_data):
                                        has_action = True
                                except Exception:
                                    pass
                            if not has_action:
                                room_game.pending_call["responses"][ndp] = "skip"

                        # ターンは仮で次の人にしておく（呼び出しがあれば後で上書き）
                        room_game.turn = (p_idx + 1) % 4
                        event_log = {"action": "discard", "player_idx": p_idx, "tile": tile}

                        # 全員がskip済み（呼び出し対象者がいない）→ 即解決
                        if len(room_game.pending_call["responses"]) >= 3:
                            print(f"[DEBUG LOG] discard: 呼び出し可能者なし。即進行。")
                            room_game.pending_call = None
                        # それ以外: broadcast 後に各クライアントが claim_call / skip_call で応答

                    # --- 🌟 呼び出し処理 ---
                    elif action == "claim_call":
                        call_type = data.get("call_type", "skip")
                        pc = getattr(room_game, 'pending_call', None)
                        if not pc:
                            print(f"[DEBUG LOG] claim_call: 待機なし。無視。")
                            continue
                        if pc["discarder"] == p_idx or p_idx in pc["responses"]:
                            continue
                        pc["responses"][p_idx] = call_type
                        print(f"[DEBUG LOG] claim_call: P{p_idx} が {call_type} を選択。")
                        # 3人揃ったかチェック
                        if len(pc["responses"]) >= 3:
                            event_log = await _resolve_pending_call(room_id, room_game)
                            if not event_log:
                                # 解決なし → 通常の打牌進行
                                event_log = {"action": "call_resolved", "player_idx": -1, "result": "none"}
                        else:
                            # まだ待機 → broadcast せず継続
                            continue

                    elif action == "skip_call":
                        pc = getattr(room_game, 'pending_call', None)
                        if not pc:
                            continue
                        if pc["discarder"] == p_idx or p_idx in pc["responses"]:
                            continue
                        pc["responses"][p_idx] = "skip"
                        print(f"[DEBUG LOG] skip_call: P{p_idx} がスキップ。")
                        if len(pc["responses"]) >= 3:
                            event_log = await _resolve_pending_call(room_id, room_game)
                            if not event_log:
                                event_log = {"action": "call_resolved", "player_idx": -1, "result": "none"}
                        else:
                            continue

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

                        # 二重送信ガード：すでに送信済みのプレイヤーは無視
                        if p_idx in lobby_manager.charleston_selections[room_id]:
                            print(f"[DEBUG LOG] 第1交換: プレイヤー {p_idx} は既に送信済み。無視します。")
                            continue

                        tiles = data.get("tiles")
                        lobby_manager.charleston_selections[room_id][p_idx] = tiles

                        for t in tiles:
                            if t in room_game.hands[p_idx]: room_game.hands[p_idx].remove(t)

                        # まず「このプレイヤーが選択を終えた」イベントをブロードキャスト
                        ready_event = {"action": "charleston_player_ready", "player_idx": p_idx}
                        await broadcast_friend_update(room_id, room_game, ready_event)

                        # 4人揃ったら交換を実行
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
                            room_game.charleston_done = True
                            event_log = {"action": "charleston_complete", "dice": dice, "direction": msg}
                        else:
                            # 4人揃っていない場合は ready_event 送信済みなので追加ブロードキャストはスキップ
                            event_log = None

                    # --- ③ 第2チャールストン ---
                    elif action == "second_charleston_turn":
                        print(f"[DEBUG LOG] 第2交換: プレイヤー {p_idx} から選択を受信しました。")
                        if room_id not in lobby_manager.second_charleston_selections:
                            lobby_manager.second_charleston_selections[room_id] = {}
                            lobby_manager.second_charleston_confirms[room_id] = {}

                        # 二重送信ガード
                        if p_idx in lobby_manager.second_charleston_selections[room_id]:
                            print(f"[DEBUG LOG] 第2交換: プレイヤー {p_idx} は既に送信済み。無視します。")
                            continue

                        participate = data.get("participate")
                        tiles = data.get("tiles", [])

                        lobby_manager.second_charleston_confirms[room_id][p_idx] = participate
                        lobby_manager.second_charleston_selections[room_id][p_idx] = tiles

                        for t in tiles:
                            if t in room_game.hands[p_idx]: room_game.hands[p_idx].remove(t)

                        # まず「このプレイヤーが回答した」イベントをブロードキャスト
                        ready_event = {"action": "second_charleston_player_done", "player_idx": p_idx, "participate": participate}
                        await broadcast_friend_update(room_id, room_game, ready_event)
                        event_log = None

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
                                room_game.second_charleston_done = True
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
                                room_game.second_charleston_done = True
                                event_log = {"action": "second_charleston_complete", "dice": dice, "direction": msg, "active_players": active}

                    # 最新の盤面を全員に配る（視点回転済みのリッチな state を送信）
                    if event_log:
                        print(f"[DEBUG LOG] ブロードキャスト送信: {event_log.get('action')}")
                        await broadcast_friend_update(room_id, room_game, event_log)
                
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

# 🌟 10000パターンのルーム管理システム
ROOM_COUNTER = 0
active_rooms: Dict[str, GameState] = {}

# 🌟 通信が来るたびに、自動的に「その人の卓データ(game)」を取り出す魔法の関数
def get_current_game(room_id: str = "") -> GameState:
    if not room_id or room_id not in active_rooms:
        raise HTTPException(status_code=400, detail="ルームが見つかりません。画面をリロードしてください。")
    return active_rooms[room_id]

# 📦 フロントエンド（JS）に送付するための、安全な盤面データをまとめる関数
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
        "cpu_personalities": game.cpu_personalities,
        "discards_count": game.discards_count,
        "any_meld_occurred": game.any_meld_occurred,
        "just_drawn": game.just_drawn,
        "last_drawn": game.last_drawn,
        "last_discard_info": game.last_discard_info,
        "round_calculated": getattr(game, 'round_calculated', False),
        "charleston_done": getattr(game, 'charleston_done', False),               # 🌟 追加
        "second_charleston_done": getattr(game, 'second_charleston_done', False)  # 🌟 追加
    }
    if extra_data: res.update(extra_data)
    return res

# 🌟 演出用の特殊役（天胡など）だけをアガリ時に即座に判定する関数
def get_special_effects(game: GameState, player_idx: int, ctx: dict):
    effects = []
    is_tsumo = ctx.get("is_tsumo", False)
    is_first = ctx.get("is_first_turn", False)
    any_meld = ctx.get("any_meld_occurred", False)
    d_count = ctx.get("discards_count", 999)
    winning_tile = ctx.get("winning_tile", "")
    
    melds = game.melds[player_idx]
    
    # 面前かつ1巡目（鳴きなし）の判定
    if len(melds) == 0 and is_first and not any_meld:
        if ctx.get("is_dealer", False) and is_tsumo and d_count == 0:
            effects.append("天胡")
        elif not ctx.get("is_dealer", False) and d_count < 4:
            effects.append("地胡")
            
    if is_tsumo and winning_tile == "春": effects.append("妙手回春")
    if ctx.get("is_rinshan", False): effects.append("槓上開花")
    if ctx.get("is_haitei", False): effects.append("花天月地")
    
    # ※「槍槓」はフロントエンド側で独自に判定してエフェクトを出しているため除外
    
    return effects

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
        # 🌟 修正：is_agari と determine_target を使って超軽量化
        data = {"closed_tiles": " ".join(game.hands[i]), "melds": game.melds[i], "win_context": ctx}
        if is_agari(data):
            has_won_already = len(game.win_tiles[i]) > 0
            has_season_in_hand = any(t in SEASON_TILES for t in game.hands[i]) or any(t in SEASON_TILES for m in game.melds[i] for t in m["tiles"])
            
            target = determine_target(i, game.hands[i], game) # 🌟 役の代わりに目標を取得
            
            if not has_won_already and has_season_in_hand:
                is_hanari_zentan = (target == "全単")
                jokers_count = sum(1 for t in game.hands[i] + [tile] if t in SEASON_TILES)
                is_hanari_qixing = (target == "七星不靠" and jokers_count == 1 and game.cpu_personalities[i] in [1, 2])
                
                if (is_hanari_zentan or is_hanari_qixing) and len(game.wall) > 20: 
                    continue 

            if target == "十三幺九": # 🌟 ここも target で判定
                waits = get_waits_for_hand(game.hands[i], game.melds[i])
                if len(waits) < 13:
                    remaining = 0
                    for w in waits:
                        visible = get_visible_count(w, game)
                        remaining += max(0, 4 - visible - game.hands[i].count(w))
                    if len(game.wall) >= 24 and remaining >= 3: 
                        continue 

            # 🌟 修正：「つよい」CPU以外は、欲張らずにテンパイ即リー（即和了）する！
            if getattr(game, 'cpu_level', 1) == 2 and len(game.wall) > 20:
                waits = get_waits_for_hand(game.hands[i], game.melds[i])
                if len(waits) < 27: 
                    continue

            # 🌟 追加：演出用の役を即席判定してフロントに渡す
            effects = get_special_effects(game, i, ctx)
            return {"player": i, "yaku": effects, "score": 0, "ctx": ctx}
    return None

# ==========================================
# 🎮 ゲーム進行・操作受付用API
# ==========================================

# 🔍 指定されたルームIDが存在するかチェックするAPI
@app.get("/check_room")
def check_room(room_id: str = ""):
    return {"exists": room_id in active_rooms}

# 🔄 再開用に、現在の盤面データを取得するだけのAPI
@app.get("/get_room_state")
def get_room_state(game: GameState = Depends(get_current_game)):
    # 🌟 ここでだけ「discards（河の全データ）」を特別に付けて送る！
    return get_safe_state(game, 0, {"discards": game.discards})

@app.get("/start")
def start_game(cpu_level: int = 1): # 🌟 修正：URLパラメータから cpu_level を受け取る（デフォルト1）
    global ROOM_COUNTER
    # 0000〜9999 のルームIDを発行して、10000を超えたら0に戻る
    room_id = f"{ROOM_COUNTER:04d}"
    ROOM_COUNTER = (ROOM_COUNTER + 1) % 10000
    
    new_game = GameState()
    new_game.cpu_level = cpu_level # 🌟 追加：作成した卓のCPUの強さを設定する
    active_rooms[room_id] = new_game
    print(f"🎮 新規ルーム作成: {room_id} (CPUレベル: {cpu_level} / 現在稼働中: {len(active_rooms)}卓)")
    
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
    # 🌟 追加：既に終わっている場合は無視する（二重実行バグ防止）
    if getattr(game, 'charleston_done', False):
        return get_safe_state(game, 0, {"dice": 0, "direction": "すでに第1交換は完了しています"})

    try:
        player_passed = [t1, t2, t3]
        for t in player_passed: 
            if t in game.hands[0]: game.hands[0].remove(t)
        
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
            for t in passed: 
                if t in game.hands[i]: game.hands[i].remove(t)
            cpu_passed.append(passed)
        
        all_passed = [player_passed, cpu_passed[0], cpu_passed[1], cpu_passed[2]]
        dice = random.randint(1, 6)
        if dice in [1, 2]: offset, msg = -1, "下家(右)へ交換"
        elif dice in [3, 4]: offset, msg = -2, "対面(正面)へ交換"
        else: offset, msg = 1, "上家(左)へ交換"
        
        # 🌟 追加：誰が何をもらったかの正確なリストを作成
        received_tiles = [[] for _ in range(4)]
        for i in range(4):
            giver_idx = (i + offset) % 4
            game.hands[i].extend(all_passed[giver_idx])
            received_tiles[i] = all_passed[giver_idx] # 記録用
            game.hands[i] = game.sort_hand(game.hands[i])
            
        game.just_drawn = -1 
        game.last_discard_info = {"player": -1, "tile": ""}
        game.charleston_done = True 
        
        # 🌟 修正：渡した牌(passed_tiles)ともらった牌(received_tiles)をログに刻む
        game.append_log("charleston", type="first", dice=dice, direction=msg, passed_tiles=all_passed, received_tiles=received_tiles)
        return get_safe_state(game, 0, {"dice": dice, "direction": msg})
    except Exception as e:
        traceback.print_exc()
        return {"error": str(e)}

@app.get("/second_charleston")
def second_charleston(player_idx: int = 0, t1: str = "", t2: str = "", t3: str = "", p0: str = "false", p1: str = "false", p2: str = "false", p3: str = "false", game: GameState = Depends(get_current_game)):
    # 🌟 追加：既に終わっている場合は無視する（二重実行バグ防止）
    if getattr(game, 'second_charleston_done', False):
        return get_safe_state(game, 0, {"dice": 0, "direction": "すでに第2交換は完了しています"})

    try:
        participating = [p0.lower() == "true", p1.lower() == "true", p2.lower() == "true", p3.lower() == "true"]
        active = [i for i in range(4) if participating[i]]

        if len(active) <= 1:
            game.second_charleston_done = True
            # 🌟 修正：不成立時もエラーにならないよう空リストを渡しておく
            game.append_log("charleston", type="second", dice=0, direction="不成立(参加者不足)", active_players=active, passed_tiles=[[],[],[],[]], received_tiles=[[],[],[],[]])
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
                for t in passed: 
                    if t in game.hands[i]: game.hands[i].remove(t)
                passed_tiles[i] = passed

        dice = random.randint(1, 6)
        msg = ""

        # 🌟 追加：誰が何を渡し、何を受け取ったかのリストを作成
        passed_tiles_list = [passed_tiles.get(i, []) for i in range(4)]
        received_tiles_list = [[] for _ in range(4)]

        if len(active) == 4:
            if dice in [1, 2]: offset, msg = -1, "下家(右)へ交換"
            elif dice in [3, 4]: offset, msg = -2, "対面(正面)へ交換"
            else: offset, msg = 1, "上家(左)へ交換"
            for i in range(4):
                giver_idx = (i + offset) % 4
                game.hands[i].extend(passed_tiles[giver_idx])
                # 🌟 追加：受け取った牌を記録
                received_tiles_list[i] = passed_tiles[giver_idx]

        elif len(active) == 3:
            if dice in [1, 2, 3]: offset_idx, msg = -1, "参加者間で右回り(下家方向)に交換"
            else: offset_idx, msg = 1, "参加者間で左回り(上家方向)に交換"
            for idx, player in enumerate(active):
                giver_idx = active[(idx + offset_idx) % len(active)]
                game.hands[player].extend(passed_tiles[giver_idx])
                # 🌟 追加：受け取った牌を記録
                received_tiles_list[player] = passed_tiles[giver_idx]

        elif len(active) == 2:
            dice, msg = 0, "2人で直接交換"
            pA, pB = active[0], active[1]
            game.hands[pA].extend(passed_tiles[pB])
            game.hands[pB].extend(passed_tiles[pA])

        for i in range(4): game.hands[i] = game.sort_hand(game.hands[i])
        game.just_drawn = -1 
        game.last_discard_info = {"player": -1, "tile": ""} 
        game.second_charleston_done = True
        
        # 🌟 修正：第1交換と同じく、passed_tiles と received_tiles をログに刻む！
        game.append_log("charleston", type="second", dice=dice, direction=msg, active_players=active, passed_tiles=passed_tiles_list, received_tiles=received_tiles_list)
        
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
    game.last_discard_info = {"player": -1, "tile": ""} # 🌟 追加
    game.append_log("draw", player=player_idx, tile=tile)
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
        game.last_discard_info = {"player": player_idx, "tile": tile} # 🌟 追加
        game.append_log("discard", player=player_idx, tile=tile, tsumogiri=(tile == game.last_drawn[player_idx]))
        return get_safe_state(game)
    return {"error": "通信エラー: 牌が見つかりません"}

@app.get("/cpu_turn")
def cpu_turn(cpu_idx: int, game: GameState = Depends(get_current_game)):
    try:
        if not game.wall: return {"error": "流局"}
        drawn = game.wall.pop()
        game.last_drawn[cpu_idx] = drawn
        
        # 🌟 レッスンモード（cpu_level == -1）なら、アガリ判定や鳴き判定を全てスキップして即ツモ切り！
        if getattr(game, 'cpu_level', 1) == -1:
            # 先にツモを処理して記録
            game.hands[cpu_idx].append(drawn)
            game.just_drawn = cpu_idx
            print(f"[DEBUG 🤖] CPU {cpu_idx} ツモ: {drawn}")
            game.append_log("draw", player=cpu_idx, tile=drawn)
            
            # その後に打牌処理
            discard = drawn
            
            # 🌟 修正：.remove() だと手牌の同種牌を消してしまうため、確実に追加した末尾のツモ牌を消す
            game.hands[cpu_idx].pop() 
            
            game.discards[cpu_idx].append(discard) 
            game.discards_count += 1
            game.is_first_turn[cpu_idx] = False 
            game.turn = (cpu_idx + 1) % 4
            game.just_drawn = -1 
            game.last_discard_info = {"player": cpu_idx, "tile": discard}
            print(f"[DEBUG 🤖] CPU {cpu_idx} 打牌: {discard}")
            game.append_log("discard", player=cpu_idx, tile=discard, tsumogiri=True)
            return get_safe_state(game, 0, {
                "tsumo": False,
                "discard": discard, 
                "did_joker_swap": False, 
                "did_kakan": False, 
                "kakan_tile": ""
            })

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
        
        # 🌟 修正：is_agari と determine_target を使う！
        if is_agari(win_data):
            has_won_already = len(game.win_tiles[cpu_idx]) > 0
            has_season_in_hand = any(t in SEASON_TILES for t in game.hands[cpu_idx]) or any(t in SEASON_TILES for m in game.melds[cpu_idx] for t in m["tiles"])
            is_pass = False
            
            target = determine_target(cpu_idx, game.hands[cpu_idx], game) # 🌟 追加
            
            if not has_won_already and has_season_in_hand:
                is_hanari_zentan = (target == "全単")
                jokers_count = sum(1 for t in game.hands[cpu_idx] + [drawn] if t in SEASON_TILES)
                is_hanari_qixing = (target == "七星不靠" and jokers_count == 1 and game.cpu_personalities[cpu_idx] in [1, 2])
                
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

            # 🌟 修正：「つよい」CPU以外は、欲張らずに即和了する！
            if getattr(game, 'cpu_level', 1) == 2 and len(game.wall) > 20: 
                waits = get_waits_for_hand(game.hands[cpu_idx], game.melds[cpu_idx])
                if len(waits) < 27:
                    is_pass = True

            if not is_pass:
                # 和了の前にツモを処理して記録
                game.hands[cpu_idx].append(drawn)
                game.just_drawn = cpu_idx
                print(f"[DEBUG 🤖] CPU {cpu_idx} ツモ和了: {drawn}")
                game.append_log("draw", player=cpu_idx, tile=drawn)
                game.hands[cpu_idx].remove(drawn)
                game.win_tiles[cpu_idx].append(drawn)
                game.win_records[cpu_idx].append(ctx)
                game.turn = (cpu_idx + 1) % 4 
                game.last_discard_info = {"player": -1, "tile": ""}
                game.is_first_turn[cpu_idx] = False
                
                # 🌟 追加：演出用の役を即席判定してフロントに渡す
                effects = get_special_effects(game, cpu_idx, ctx)
                game.append_log("win", player=cpu_idx, method="tsumo", tile=drawn)
                return get_safe_state(game, 0, {"tsumo": True, "cpu_idx": cpu_idx, "winning_tile": drawn, "yaku": effects, "score": 0})

        # ここでツモの瞬間の盤面を記録
        game.hands[cpu_idx].append(drawn)
        game.just_drawn = cpu_idx
        print(f"[DEBUG 🤖] CPU {cpu_idx} ツモ: {drawn}")
        game.append_log("draw", player=cpu_idx, tile=drawn)
        
        did_joker_swap_in_turn = False
        did_kakan_in_turn = False 
        kakan_tile_in_turn = ""  

        while game.wall:
            seasons = [t for t in game.hands[cpu_idx] if t in SEASON_TILES]
            
            # 🌟 修正：「よわい」「ふつう」の花槓判断ミス（性格に関わらず発生）
            cpu_level = getattr(game, 'cpu_level', 1)
            hanakan_seasons = []
            if cpu_level == 0:
                if random.random() < 0.7: hanakan_seasons = seasons
            elif cpu_level == 1:
                if random.random() < 0.3: hanakan_seasons = seasons
            else:
                hanakan_seasons = seasons if game.cpu_personalities[cpu_idx] in [2, 4] else []

            counts = {t: game.hands[cpu_idx].count(t) for t in set(game.hands[cpu_idx])}
            did_meld = False
            has_won = len(game.win_tiles[cpu_idx]) > 0
            
            if has_won and len(seasons) > 0: break
                
            current_target = determine_target(cpu_idx, game.hands[cpu_idx], game)
            if current_target in ["十三幺九", "七星不靠", "全単"]: break
                
            for t, c in counts.items():
                if c == 4 and t not in SEASON_TILES:
                    
                    if is_kan_valid_for_player(cpu_idx, "ankan", t, game):
                        for _ in range(4): game.hands[cpu_idx].remove(t)
                        game.melds[cpu_idx].append({"type": "ankan", "tiles": [t]*4, "is_hidden": True})
                        drawn_rinshan = game.wall.pop()
                        game.hands[cpu_idx].append(drawn_rinshan)
                        
                        # 🌟 追加：引いた嶺上牌をセットし、打牌前に記録！
                        game.last_drawn[cpu_idx] = drawn_rinshan
                        game.just_drawn = cpu_idx
                        game.last_discard_info = {"player": -1, "tile": ""}
                        game.append_log("self_meld", player=cpu_idx, meld_type="ankan", tile=t)
                        
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
                            drawn_rinshan = game.wall.pop()
                            game.hands[cpu_idx].append(drawn_rinshan)
                            
                            # 🌟 追加：引いた嶺上牌をセットし、打牌前に記録！
                            game.last_drawn[cpu_idx] = drawn_rinshan
                            game.just_drawn = cpu_idx
                            game.any_meld_occurred = True 
                            game.last_discard_info = {"player": cpu_idx, "tile": base_t}
                            game.append_log("self_meld", player=cpu_idx, meld_type="kakan", tile=base_t)
                            
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
                                    cpu_level = getattr(game, 'cpu_level', 1)
                                    if cpu_level == 0 and random.random() < 0.6: continue 
                                    if cpu_level == 1 and random.random() < 0.3: continue 

                                    game.hands[cpu_idx].remove(base_t)
                                    m["type"] = "minkan"
                                    m["tiles"] = [base_t]*4
                                    game.hands[cpu_idx].append(season_t)
                                    
                                    # 🌟 追加：スワップした牌をツモ牌扱いにし、打牌前に記録！
                                    game.last_drawn[cpu_idx] = season_t
                                    game.just_drawn = cpu_idx
                                    game.any_meld_occurred = True 
                                    did_meld = True
                                    did_joker_swap_in_turn = True 
                                    game.last_discard_info = {"player": -1, "tile": ""}
                                    game.append_log("joker_swap", player=cpu_idx, tile=base_t, season=season_t, target_player=target_idx)
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
        game.last_discard_info = {"player": cpu_idx, "tile": discard}
        print(f"[DEBUG 🤖] CPU {cpu_idx} 打牌: {discard}")
        game.append_log("discard", player=cpu_idx, tile=discard, tsumogiri=(discard == drawn))
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
            
            # 🌟 修正：ここも is_agari と target に差し替え！
            if is_agari(data):
                has_won_already = len(game.win_tiles[i]) > 0
                has_season_in_hand = any(t in SEASON_TILES for t in game.hands[i]) or any(t in SEASON_TILES for m in game.melds[i] for t in m["tiles"])
                is_pass = False
                
                target = determine_target(i, game.hands[i], game) # 🌟 追加
                
                if not has_won_already and has_season_in_hand:
                    is_hanari_zentan = (target == "全単")
                    jokers_count = sum(1 for t in game.hands[i] + [tile] if t in SEASON_TILES)
                    is_hanari_qixing = (target == "七星不靠" and jokers_count == 1 and game.cpu_personalities[i] in [1, 2])
                    
                    if (is_hanari_zentan or is_hanari_qixing) and len(game.wall) > 20: is_pass = True

                    if target == "十三幺九":
                        waits = get_waits_for_hand(game.hands[i], game.melds[i])
                        if len(waits) < 13:
                            remaining = 0
                            for w in waits:
                                visible = get_visible_count(w, game)
                                remaining += max(0, 4 - visible - game.hands[i].count(w))
                            if len(game.wall) >= 24 and remaining >= 3: is_pass = True

                    # 🌟 修正：「つよい」CPU以外は、欲張らずに即和了する！
                    if getattr(game, 'cpu_level', 1) == 2 and len(game.wall) > 20: 
                        waits = get_waits_for_hand(game.hands[i], game.melds[i])
                        if len(waits) < 27: is_pass = True

                if is_pass: continue

                if not is_chankan_bool and game.discards[discarder_idx] and game.discards[discarder_idx][-1] == tile:
                    game.discards[discarder_idx].pop()
                game.win_tiles[i].append(tile)
                game.win_records[i].append(ctx)
                
                # 🌟 追加：演出用の役を即席判定してフロントに渡す
                effects = get_special_effects(game, i, ctx)
                game.append_log("win", player=i, method="ron", tile=tile, from_player=discarder_idx)
                return get_safe_state(game, 0, {"reacted": True, "type": "ron", "player": i, "yaku": effects, "score": 0})

        if is_chankan_bool: return get_safe_state(game, 0, {"reacted": False})

        if not is_haitei:
            for i in turn_order:
                if i == 0: continue
                if len(game.win_tiles[i]) > 0: continue
                
                current_target = determine_target(i, game.hands[i], game)
                # 🌟 修正：全単を狙っている時は、国士無双などと同じく「絶対にポン・明槓しない」
                if current_target in ["十三幺九", "七星不靠", "全単"]: continue

                count = game.hands[i].count(tile)
                if count >= 2:
                    # 🌟 追加：「よわい」「ふつう」の鳴き見逃し（スルー）確率判定
                    cpu_level = getattr(game, 'cpu_level', 1)
                    if cpu_level == 0:
                        # よわい: 50%で鳴きを見逃す（ポンのボタンに気づかない初心者）
                        if random.random() < 0.5: continue
                    elif cpu_level == 1:
                        # ふつう: 20%で鳴きを見逃す（ちょっと迷ってスルーしてしまう中級者）
                        if random.random() < 0.2: continue

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
                            # 🌟 追加：引いた嶺上牌をセットする
                            game.last_drawn[i] = drawn
                            game.just_drawn = i
                        else:
                            game.just_drawn = -1
                            
                        # 🌟 追加：【打牌する前】の「鳴きが完了した状態」を牌譜に記録！
                        game.append_log("meld", player=i, meld_type=call_type, tile=tile, from_player=discarder_idx)
                            
                        # --- ここから打牌処理 ---
                        scored = [(t, evaluate_tile_dynamically(t, game.hands[i], game, i, game.cpu_personalities[i]) + random.randint(0, 5)) for t in game.hands[i]]
                        scored.sort(key=lambda x: x[1])
                        discard = scored[0][0]
                        game.hands[i].remove(discard)
                        game.discards[i].append(discard)
                        game.is_first_turn[i] = False 
                        game.hands[i] = game.sort_hand(game.hands[i])
                        
                        game.turn = (i + 1) % 4
                        game.just_drawn = -1 
                        game.last_discard_info = {"player": i, "tile": discard}
                        
                        # 🌟 追加：【打牌した後】の状態も牌譜に記録！
                        is_tsumogiri = (is_kan and discard == drawn) if is_kan else False
                        game.append_log("discard", player=i, tile=discard, tsumogiri=is_tsumogiri)
                        
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
                game.last_discard_info = {"player": -1, "tile": ""}
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
                
        # 🌟 修正：牌譜を記録（append_log）する前に、確実に河から対象の牌を消しておく！
        if discarder != -1 and game.discards[discarder] and game.discards[discarder][-1] == tile:
            game.discards[discarder].pop()
            
        game.hands[player_idx] = game.sort_hand(game.hands[player_idx])
        game.last_discard_info = {"player": -1, "tile": ""}
        
        # 🌟 ここで記録される状態（snapshot）には、すでに河から消えた綺麗なデータが入る
        game.append_log("meld", player=player_idx, meld_type=type, tile=tile, from_player=discarder)
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
            game.last_discard_info = {"player": -1, "tile": ""}
            
        elif type == "暗花槓":
            if game.hands[player_idx].count(tile) < 3 or season not in game.hands[player_idx]: return {"error": "同期エラー：指定された牌が足りません。"}
            for _ in range(3): game.hands[player_idx].remove(tile)
            game.hands[player_idx].remove(season)
            game.melds[player_idx].append({"type": "hanakan", "tiles": [tile, season, tile, tile]})
            game.last_discard_info = {"player": -1, "tile": ""}
            
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

            game.last_discard_info = {"player": player_idx, "tile": tile}

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
                game.last_discard_info = {"player": -1, "tile": ""}

        game.turn = player_idx
        if game.wall:
            drawn_tile = game.wall.pop()
            game.hands[player_idx].append(drawn_tile)
            game.last_drawn[player_idx] = drawn_tile
            game.just_drawn = player_idx 

        game.hands[player_idx] = game.sort_hand(game.hands[player_idx])
        game.append_log("self_meld", player=player_idx, meld_type=type, tile=tile, season=season)
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
        game.last_discard_info = {"player": -1, "tile": ""} # 🌟 追加
        game.append_log("joker_swap", player=player_idx, tile=tile, season=season, target_player=target_idx)
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
        
        game.win_records[player_idx].append(ctx)
        game.win_tiles[player_idx].append(tile)
        game.turn = (player_idx + 1) % 4 
        game.last_discard_info = {"player": -1, "tile": ""}
        game.is_first_turn[player_idx] = False
        
        # 🌟 追加：演出用の役を即席判定してフロントに渡す
        effects = get_special_effects(game, player_idx, ctx)
        game.append_log("win", player=player_idx, method="tsumo", tile=tile)
        return get_safe_state(game, player_idx, {"yaku": effects, "score": 0})
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
                game.last_discard_info = {"player": -1, "tile": ""}
                # 🌟 削除：和了時の強制ストッパーを解除
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

        if discarder != -1 and not is_chankan_bool:
            if game.discards[discarder] and game.discards[discarder][-1] == tile:
                game.discards[discarder].pop()

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
        # 🌟 修正：evaluate_hand を削除し、最後の return もダミーにする！

        game.win_records[player_idx].append(ctx)
        game.win_tiles[player_idx].append(tile)

        if is_chankan_bool and robbed_player_idx != -1:
            game.turn = (robbed_player_idx + 1) % 4

        game.last_discard_info = {"player": -1, "tile": ""}

        # 🌟 追加：演出用の役を即席判定してフロントに渡す
        effects = get_special_effects(game, player_idx, ctx)
        game.append_log("win", player=player_idx, method="ron", tile=tile, from_player=discarder)
        return get_safe_state(game, player_idx, {"yaku": effects, "score": 0})
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
        
    # 🌟 修正：重い evaluate_hand をやめて is_agari だけでサクッと判定
    if not is_agari(data): return {"can_win": False, "reason": "役がありません"}
    return {"can_win": True, "score": 0, "yaku": []}

@app.get("/calculate_round_scores")
def calculate_round_scores(game: GameState = Depends(get_current_game)):
    # 🌟 追加：既に計算済みなら、保存しておいた結果を返すだけにする（二重加算防止）
    if getattr(game, 'round_calculated', False):
        return game.last_calc_data

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
            
    # 🌟 追加：計算が終わったら結果を保存してフラグを立てる
    game.round_calculated = True
    game.last_calc_data = {"status": "success", "results": results, "scores": game.scores, "ranking_points": ranking_points}
    game.finalize_round_log(game.last_calc_data)
    return game.last_calc_data

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
    print(f"\n[DEBUG LOG] 🛠️ デバッグセットアップAPIが呼ばれました！ 要求されたシナリオ: {scenario}")
    
    game.reset_round()
    game.discards_count = 0
    game.any_meld_occurred = False
    game.is_first_turn = [True, True, True, True]
    game.win_records = [[] for _ in range(4)]
    game.win_tiles = [[] for _ in range(4)]
    
    # 🌟 追加：各シナリオで純粋な「仕込み牌」だけを .append() 等で指定できるように、一旦山札を完全に空にする
    game.wall = []
    
    if scenario == "tenhou":
        game.dealer = 0
        game.turn = 0
        game.hands[0] = ["1p","1p","1p","2p","2p","2p","3p","3p","3p","4p","4p","4p","5p"]
        game.wall = ["1p","1p","1p","1p", "2p","2p","2p", "3p","3p","3p", "4p","4p","4p","1p","1p","1p","1p", "2p","2p","2p", "3p","3p","3p", "4p","4p","4p","1p","1p","1p","1p", "2p","2p","2p", "3p","3p","3p", "4p","4p","4p"]
        
    elif scenario == "chiihou":
        game.dealer = 1
        game.turn = 1
        game.is_first_turn = [True, True, True, True]
        game.hands[0] = ["1p","2p","3p","4p","5p","6p","7s","8s","9s","春","夏","秋","冬"]
        base_hand = ["1s","2s","3s","4s","5s","6s","7p","8p","9p","1m","9m","中"]
        game.hands[1] = base_hand + ["東"]
        game.hands[2] = base_hand + ["南"]
        game.hands[3] = base_hand + ["西"]
        game.wall = ["9s", "8s", "7s", "6s", "5s", "4s"]

    elif scenario == "jokerswap":
        game.dealer = 0
        game.turn = 1
        game.is_first_turn = [False, False, False, False]
        game.discards_count = 1
        game.melds[0] = [{"type": "hanakan", "tiles": ["東", "春", "東", "東"]}]
        game.hands[0] = ["1p","2p","3p","4p","5p","6p","7p","8p","9p","1s"]
        game.hands[1] = ["東","南","南","西","西","白","白","發","發","中","中","1p","2p"]
        game.wall.append("3p")
        
    elif scenario == "chankan":
        game.dealer = 0
        game.turn = 0
        game.is_first_turn = [False, False, False, False]
        game.discards_count = 5
        game.melds[0] = [{"type": "pong", "tiles": ["1p", "1p", "1p"]}]
        game.hands[0] = ["1p","2p","3p","4p","5p","6p","7p","8p","9p","1s"]
        game.hands[1] = ["2p","2p","3p","3p","4p","4p","5p","5p","6p","6p","7p","7p","1p"]
        game.wall.append("2s") 

    elif scenario == "kokushi_chankan":
        game.dealer = 0
        game.turn = 0
        game.is_first_turn = [False, False, False, False]
        game.discards_count = 5
        game.melds[0] = [{"type": "pong", "tiles": ["1p", "1p", "1p"]}]
        game.hands[0] = ["1p","2p","3p","4p","5p","6p","7p","8p","9p","1s"]
        game.hands[1] = ["9p","9p","1s","9s","1m","9m","東","南","西","北","白","發","中"]
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
        game.hands[0] = ["1p", "1p", "1p", "2p", "2p", "2p", "3p", "3p", "3p", "春", "夏", "秋", "冬"]

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
        game.hands[1] = ["中","中","1p","2p","3p","4p","5p","6p","7p","8p","9p","1s","2s"] 
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

    elif scenario == "cpu_kang":
        game.dealer = 0
        game.turn = 1
        game.is_first_turn = [True, True, True, True]
        game.hands[1] = ["1s","1s","1s","3s","3s","3s","4s","4s","4s","5s","6s","6s","7s"]
        game.wall = ["9p","1s","1s","1s","3s","3s","3s","4s","4s","4s","5s","6s","6s","7s"] 

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
        game.hands[1] = ["1p","2p","3p","4p","5p","6p","7p","8p","9p","1s"]
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
        game.hands[1] = ["1p","1p","1p","2p","2p","2p","3p","3p","5s","6s","7s","8s","9s"]
        game.wall = ["7s", "7s", "6s", "5p", "4s"]

    elif scenario == "cpu1_chiihou":
        game.dealer = 3
        game.turn = 3
        game.is_first_turn = [True, True, True, True]
        game.hands[1] = ["1p","2p","3p","4p","5p","6p","7s","8s","9s","春","夏","秋","冬"]
        base_hand = ["1s","2s","3s","4s","5s","6s","7p","8p","9p","1m","9m","中"]
        game.hands[3] = base_hand + ["東"]
        game.hands[0] = base_hand + ["南"]
        game.hands[2] = base_hand + ["西"]
        game.wall = ["9s", "8s", "7s", "6s", "5s", "4s"]

    elif scenario == "cpu2_chiihou":
        game.dealer = 3
        game.turn = 3
        game.is_first_turn = [True, True, True, True]
        game.hands[2] = ["1p","2p","3p","4p","5p","6p","7s","8s","9s","春","夏","秋","冬"]
        base_hand = ["1s","2s","3s","4s","5s","6s","7p","8p","9p","1m","9m","中"]
        game.hands[3] = base_hand + ["東"]
        game.hands[0] = base_hand + ["南"]
        game.hands[1] = base_hand + ["西"]
        game.wall = ["9s", "8s", "7s", "6s", "5s", "4s"]

    elif scenario == "cpu3_chiihou":
        game.dealer = 3
        game.turn = 3
        game.is_first_turn = [True, True, True, True]
        game.hands[3] = ["1p","2p","3p","4p","5p","6p","7s","8s","9s","春","夏","秋","冬"]
        base_hand = ["1s","2s","3s","4s","5s","6s","7p","8p","9p","1m","9m","中"]
        game.hands[2] = base_hand + ["東"]
        game.hands[0] = base_hand + ["南"]
        game.hands[1] = base_hand + ["西"]
        game.wall = ["9s", "8s", "7s", "6s", "5s", "4s"]

    elif scenario == "block_chiihou_by_meld":
        game.dealer = 3
        game.turn = 3
        game.is_first_turn = [True, True, True, True]
        game.hands[0] = ["1p","2p","3p","4p","5p","6p","1s","2s","3s","7s","8s","9s","南"]
        game.cpu_personalities[1] = 3
        game.hands[1] = ["東","東","東","南","1p","1p","1p","9p","9p","9p","中","中","中"]
        game.hands[2] = ["1s","2s","3s","4s","5s","6s","7p","8p","9p","1m","9m","發","白"]
        game.cpu_personalities[3] = 3
        game.hands[3] = ["1s","2s","3s","4s","5s","6s","7p","8p","9p","1m","9m","白","東"]
        game.wall = ["4p", "4p", "4p"]

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
        game.wall = ["1m","1m","9m","1p","9p","1s","9s","1m","1m","9m","1p","9p","1s","9s","1m","1m","9m","1p","9p","1s","9s","1m","1m","9m","1p","9p","1s","9s","發", "白", "東", "白", "1p"] 

    elif scenario == "test_kokushi_win":
        game.dealer = 0
        game.turn = 0 
        game.hands[1] = ["1m","1m","9m","1p","9p","1s","9s","東","南","西","北","白","春"]
        game.wall = ["1m"] * 10

    elif scenario == "test_chankan_all_waits":
        game.dealer = 1
        game.turn = 1 
        game.is_first_turn = [False, False, False, False]
        game.hands[0] = ["1s","1s","2s","2s","3s","3s","4s","4s","6s","6s","8s","8s","春"]
        game.melds[1] = [{"type": "pong", "tiles": ["5p", "5p", "5p"]}]
        game.hands[1] = ["1p","2p","3p","4p","5p","6p","7p","8p","9p","1s"]
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
        game.dealer = 0
        game.turn = 2 
        game.is_first_turn = [False]*4
        game.hands[0] = ["1p","1p","2s","3s","4s","5s","6s","7s","8s","9s","東","南","西"]
        game.hands[1] = ["1p","白","發","中","東","南","西","北","1s","9s","1m","9m","9p"]
        game.hands[2] = ["1p","白","發","中","東","南","西","北","1s","9m","1m","1p","9p"]
        game.hands[3] = ["1p","白","發","中","東","南","西","北","1s","9s","1m","9m","9p"]
        game.wall = ["1p", "1p", "1p", "1p", "1p", "1p", "1p", "1p", "1p", "1p", "1p", "1p"]

    elif scenario == "test_cpu_keep_joker":
        game.dealer = 1
        game.turn = 0
        game.is_first_turn = [False]*4
        game.win_tiles[1] = ["1p"] 
        game.hands[1] = ["1p","1p","1p","2p","2p","2p","3p","3p","3p","4p","4p","4p","東"] 
        game.hands[0] = ["南","西","北","白","發","中","1m","9m","1s","9s","1p","9p","2p"]
        game.wall = ["春", "西"]

    elif scenario == "auto_jokerswap":
        game.dealer = 0
        game.turn = 0
        game.is_first_turn = [False]*4
        game.melds[0] = [
            {"type": "pong", "tiles": ["1p", "1p", "1p"]},
            {"type": "pong", "tiles": ["3p", "3p", "3p"]},
            {"type": "pong", "tiles": ["5p", "5p", "5p"]},
            {"type": "pong", "tiles": ["7p", "7p", "7p"]}
        ]
        game.hands[0] = ["夏"]
        game.hands[1] = ["4p","6p","8p","4s","6s","8s","東","南","西","北","白","發","中"]
        game.hands[2] = ["4p","6p","8p","4s","6s","8s","東","南","西","北","白","發","中"]
        game.hands[3] = ["4p","6p","8p","4s","6s","8s","東","南","西","北","白","發","中"]
        game.wall = ["1p", "2p", "3p", "2p", "1p", "2p", "3p", "2p", "1p", "春"]

    elif scenario == "syabomachi":
        game.dealer = 0
        game.turn = 3 
        game.is_first_turn = [False]*4
        game.melds[0] = [
            {"type": "ankan", "tiles": ["1m","1m","1m","1m"]},
            {"type": "minkan", "tiles": ["2p","2p","2p","2p"]},
            {"type": "minkan", "tiles": ["3s","3s","3s","3s"]}
        ]
        game.hands[0] = ["4s","4s","5s","5s"]
        game.wall = ["4s", "5s"] + ["1p"] * 20
        game.hands[3] = ["4s", "1p", "2p", "3p", "4p", "5p", "6p", "7p", "8p", "9p", "1s", "2s", "3s"]

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

    # --- 実績解除テストケース ---
    elif scenario == "achieve_wide_wait":
        game.dealer = 0
        game.turn = 0
        game.hands[0] = ["1p","2p","3p","4p","5p","6p","7s","8s","9s","春","夏","秋","冬"]
        game.wall = ["東"] * 20 
        
    elif scenario == "achieve_seasons":
        game.dealer = 0
        game.turn = 0
        game.hands[0] = ["東","東","東","南","南","南","西","西","西","春","夏","秋","冬"]
        game.wall.append("北")
        
    elif scenario == "achieve_fullhouse":
        game.dealer = 0
        game.turn = 0
        game.hands[0] = ["白","白","白","發","發","發","中","中","中","東","東","東","南"]
        game.wall.append("南")
        
    elif scenario == "pacifist":
        game.current_round = 4
        game.total_scores = [0, -10000, -10000, -10000]
        game.dealer = 1
        game.turn = 1
        game.hands[1] = ["東","東","東","南","南","南","西","西","西","北","北","北","白"]
        game.wall.append("白")
        
    elif scenario == "comeback":
        game.current_round = 4
        game.total_scores = [-30000, 40000, 30000, 20000]
        game.dealer = 0
        game.turn = 0
        game.hands[0] = ["白","白","白","發","發","發","中","中","中","東","東","東","南"]
        game.wall.append("南")
        
    elif scenario == "clutch":
        game.current_round = 4
        game.total_scores = [10000, 10001, 30000, 20000]
        game.dealer = 0
        game.turn = 0
        game.hands[0] = ["1p","2p","3p","5p","6p","7p","2s","3s","4s","6s","7s","8s","北"]
        game.wall.append("北")
        
    elif scenario == "achieve_welcomehome":
        game.debug_welcome_home = True
        game.dealer = 0
        game.turn = 0
        game.hands[0] = ["1p","2p","3p","4p","5p","6p","7p","8p","9p","1s","2s","3s","4s"]

    # --- 新規追加した隠し実績のテストケース ---
    elif scenario == "achieve_sacrilege":
        # 【罰当たり】ツモ切り -> 春を捨てる -> 他家スルー -> 安全牌ツモる -> 夏捨てる で達成
        game.dealer = 0
        game.turn = 0
        game.hands[0] = ["春", "夏", "1m", "1m", "1p", "1p", "2p", "2p", "3p", "3p", "4p", "4p", "5p"]
        game.wall = ["6p", "7p"] 

    elif scenario == "achieve_suanko_troll":
        # 【四暗刻！】面前で碰碰胡（四暗刻単騎待ち）
        game.dealer = 0
        game.turn = 0
        game.hands[0] = ["1p", "1p", "1p", "2p", "2p", "2p", "3s", "3s", "3s", "4s", "4s", "4s", "西"]
        game.wall.append("西")

    elif scenario == "achieve_chanta_troll":
        # 【チャンタってある？】無番和（無役）かつヤオチュウ牌(1,9,字牌)を多く含む
        game.dealer = 0
        game.turn = 0
        game.hands[0] = ["1p", "2p", "3p", "7p", "8p", "9p", "1s", "2s", "3s", "7s", "8s", "9s", "西"]
        game.wall.append("西")

    elif scenario == "achieve_kyuka_sanfuku":
        # 【九夏三伏】数牌の合計が30以下
        game.dealer = 0
        game.turn = 0
        game.hands[0] = ["1m", "1m", "1p", "1p", "1s", "1s", "2p", "2p", "2p", "2s", "2s", "2s", "西"]
        game.wall.append("西")

    elif scenario == "achieve_tougetsu_sekisoku":
        # 【冬月赤足】1,9萬と1,6,7筒を含む和了
        game.dealer = 0
        game.turn = 0
        game.hands[0] = ["1m", "1m", "1m", "9m", "9m", "9m", "1p", "2p", "3p", "6p", "7p", "8p", "西"]
        game.wall.append("西")

    elif scenario == "achieve_tousen_karo":
        # 【冬扇夏炉】無花の状態で春を自摸
        game.dealer = 0
        game.turn = 0
        game.hands[0] = ["1p", "1p", "1p", "2p", "2p", "2p", "3p", "3p", "3p", "4p", "4p", "4p", "東"]
        game.wall.append("春")

    elif scenario == "achieve_evil_rationalism":
        # 【悪の合理主義】JS側でフラグを立てた後、この全単配牌で和了してテストする
        game.dealer = 0
        game.turn = 0
        game.hands[0] = ["1p", "1p", "1p", "3p", "3p", "3p", "5s", "5s", "5s", "7s", "7s", "7s", "9m"]
        game.wall.append("9m")

    elif scenario == "random_4jokers":
        print("[DEBUG LOG] 🃏 random_4jokers の分岐に突入しました！") 
        
        game.dealer = 0
        game.turn = 0
        game.is_first_turn = [False]*4
        
        # 1. 108枚の通常牌（数牌＋字牌）だけをシャッフル
        deck = TILE_NAMES * 4
        random.shuffle(deck)
        
        # 2. プレイヤーには四季牌4枚と、シャッフルした山から9枚を配る
        game.hands[0] = ["春", "夏", "秋", "冬"] + deck[:9]
        
        print(f"[DEBUG LOG] 🀄 プレイヤー0の手牌セット直後: {game.hands[0]}")
        
        # 3. CPUたちにも「ダブらないように」残りの山から13枚ずつ配る
        game.hands[1] = deck[9:22]
        game.hands[2] = deck[22:35]
        game.hands[3] = deck[35:48]
        
        # 4. 残りの60枚を山札にする
        game.wall = deck[48:]

        print(f"[DEBUG LOG] 🧱 山札の残り枚数: {len(game.wall)}")

    elif scenario == "haitei_pon_test":
        # 1. 自分(0)の手牌に「白」を2枚仕込み、残りは適当なバラバラの牌にする
        game.hands[0] = ["白", "白", "1p", "2p", "3p", "4p", "5p", "6p", "7p", "8p", "9p", "東", "南"]
        game.melds[0] = []
            
        # 2. 山札を残り2枚にし、先頭（次に引かれる牌）を「白」にする
        game.wall = ["白", "白"]
            
        # 3. いきなり上家(3)のターンからゲームを再開させる
        game.turn = 3
            
        # 4. CPU3(上家)が引いた「白」を確実に切るように、手牌をパンパンの数牌で埋めておく
        game.hands[3] = ["1p", "2p", "3p", "4p", "5p", "6p", "7p", "8p", "9p", "1p", "1p", "9p", "9p"]
            
        # 巡目フラグをリセット（天胡などの誤爆を防ぐため）
        game.is_first_turn = [False, False, False, False]

    elif scenario == "haitei_pon_test2":
        # 1. 自分(0)の手牌に「白」を2枚仕込み、残りは適当なバラバラの牌にする
        game.hands[0] = ["白", "白", "1p", "2p", "3p", "4p", "5p", "6p", "7p", "8p", "9p", "東", "夏"]
        game.melds[0] = []
            
        # 2. 山札を残り2枚にし、先頭（次に引かれる牌）を「白」にする
        game.wall = ["東", "東"]
            
        # 3. いきなり上家(3)のターンからゲームを再開させる
        game.turn = 3
            
        # 4. CPU3(上家)が引いた「白」を確実に切るように、手牌をパンパンの数牌で埋めておく
        game.hands[3] = ["1p", "2p", "3p", "4p", "5p", "6p", "7p", "8p", "9p", "1p", "1p", "9p", "9p"]
            
        # 巡目フラグをリセット（天胡などの誤爆を防ぐため）
        game.is_first_turn = [False, False, False, False]


    #以下レッスンシナリオ
    elif scenario == "lesson_1":
        # 1. プレイヤー0(人間)の手牌を13枚指定する
        game.hands[0] = ["1p","1p","7p","9p","1s","3s","5s","7s","9s","1m","9m","北","發"]

        # 2. プレイヤー0の副露(ポン・カン)を指定する (基本は空配列でOK)
        game.melds[0] = []

        # 3. 最初のターン(天和・地和)の判定フラグを全てFalseにして無効化する
        game.is_first_turn = [False, False, False, False]

        # 4. 誰のターンから始まるかを指定する (0:人間, 1:下家, 2:対面, 3:上家)
        game.turn = 0

        # 5. CPU(1, 2, 3)の手牌を13枚ずつ指定する
        # ※CPUはレッスン中「絶対に鳴かない・アガらない」設定になっていますが、
        #   内部でエラーを起こさないよう、必ず正しいフォーマットで13枚セットしてください。
        game.hands[1] = ["4p","6p","8p","4s","6s","8s","東","南","西","北","白","發","中"]
        game.hands[2] = ["4p","6p","8p","4s","6s","8s","東","南","西","北","白","發","中"]
        game.hands[3] = ["4p","6p","8p","4s","6s","8s","東","南","西","北","白","發","中"]

        # 6. 山札(wall)を構築する
        # ※配列の【右側】(末尾)から順番にツモられていくことに注意してください！
        game.wall = [
            "9m", "1s", "3s",
            "5p", "2p", "2p", "2p",
            "冬", "2s", "2s", "1p",
            "5p"
        ]

    elif scenario == "lesson_2":
        # レッスン2: 推不倒
        game.hands[0] = ["2p", "2p", "2p", "4s", "5s", "3s", "8s", "8s", "8s", "9p", "9p", "1m", "9m"]
        game.melds[0] = []
        game.is_first_turn = [False, False, False, False]
        game.turn = 0
        game.hands[1] = ["3p", "4p", "5p", "6p", "7p", "8p", "1s", "2s", "3s", "4s", "5s", "6s", "7s"]
        game.hands[2] = ["3p", "4p", "5p", "6p", "7p", "8p", "1s", "2s", "3s", "4s", "5s", "6s", "7s"]
        game.hands[3] = ["3p", "4p", "5p", "6p", "7p", "8p", "1s", "2s", "3s", "4s", "5s", "6s", "7s"]

        game.wall = [
            "9p", "2p", "白", "北",
            "白", "北", "北", "北",
            "7p", "東", "南", "西",
            "白", "東", "南", "西",
            "6s"
        ]

    elif scenario == "lesson_3":
        # レッスン3: 全大
        game.hands[0] = ["7p", "8p", "9p", "7p", "8p", "9p", "7s", "8s", "9s", "9s", "9s", "8s", "1p"]
        game.melds[0] = []
        game.is_first_turn = [False, False, False, False]
        game.turn = 0
        game.hands[1] = ["1p", "2p", "3p", "1s", "2s", "3s", "東", "南", "西", "北", "白", "發", "中"]
        game.hands[2] = ["1p", "2p", "3p", "1s", "2s", "3s", "東", "南", "西", "北", "白", "發", "中"]
        game.hands[3] = ["1p", "2p", "3p", "1s", "2s", "3s", "東", "南", "西", "北", "白", "發", "中"]

        #碰してもしなくても和了は可能
        game.wall = [
            "7p", "7s", "8p", "9p",
            "8s", "東", "南", "西",
            "1s"
        ]

    elif scenario == "lesson_4":
        # レッスン4: 三節高
        game.hands[0] = ["2p", "3p", "3p", "3p", "4p", "4p", "7s", "8s", "9s", "9p", "發", "發", "中"]
        game.melds[0] = []
        game.is_first_turn = [False, False, False, False]
        game.turn = 0
        game.hands[1] = ["1s", "2s", "3s", "4s", "5s", "6s", "7s", "8s", "9s", "東", "南", "西", "北"]
        game.hands[2] = ["1s", "2s", "3s", "4s", "5s", "6s", "7s", "8s", "9s", "東", "南", "西", "北"]
        game.hands[3] = ["1s", "2s", "3s", "4s", "5s", "6s", "7s", "8s", "9s", "東", "南", "西", "北"]

        game.wall = [
            "2p", "3p", "4p",
            "2p", "8p", "9p", "1p",
            "9p"
        ]

    elif scenario == "lesson_5":
        # レッスン5: 断紅胡 
        game.hands[0] = ["2p", "2p", "2p", "4p", "4p", "4p", "3s", "4s", "5s", "8s", "8s", "8s", "中"]
        game.melds[0] = []
        game.is_first_turn = [False, False, False, False]
        game.turn = 0
        game.hands[1] = ["1p", "3p", "5p", "7p", "9p", "1s", "3s", "5s", "7s", "9s", "白", "發", "中"]
        game.hands[2] = ["1p", "3p", "5p", "7p", "9p", "1s", "3s", "5s", "7s", "9s", "白", "發", "中"]
        game.hands[3] = ["1p", "3p", "5p", "7p", "9p", "1s", "3s", "5s", "7s", "9s", "白", "發", "中"]

        game.wall = [
            "南", "2p", "3p", "4p",
            "南", "發", "中", "東",
            "2s"
        ]

    elif scenario == "lesson_6":
        # レッスン6: 寒江独釣
        game.hands[0] = ["1m", "1m", "1m", "5p", "5p", "9s", "9s", "東", "9m", "白", "白", "發", "3s"]
        game.melds[0] = []
        game.is_first_turn = [False, False, False, False]
        game.turn = 0
        game.hands[1] = ["2p", "3p", "4p", "6p", "7p", "8p", "2s", "發", "中", "東", "南", "西", "北"]
        game.hands[2] = ["1s", "2s", "3s", "4s", "5s", "6s", "7s", "發", "中", "東", "南", "西", "北"]
        game.hands[3] = ["1p", "2p", "3p", "1s", "9m", "9m", "9m", "發", "中", "東", "南", "西", "北"]

        game.wall = [
            "發", "東", "1s", "1s", "9m", "1p", "3s",
            "白", # C1ツモ -> ポン
            "春", # P0ツモ 
            "1m", # C3ツモ -> カン
            "7p", # C2ツモ
            "8s", # C1ツモ
            "9s", # C2ツモ -> ポン
            "8s", # C1ツモ
            "5p", # C1ツモ -> ポン
            "1p"  # P0ツモ (ハズレ)
        ]

    elif scenario == "lesson_7":
        # レッスン7: 七星不靠
        game.hands[0] = ["東", "9p", "西", "北", "白", "發", "中", "東", "2p", "5p", "8p", "3s", "6s"]
        game.melds[0] = []
        game.is_first_turn = [False, False, False, False]
        game.turn = 0
        game.hands[1] = ["1p", "1p", "1p", "4p", "4p", "4p", "7p", "7p", "7p", "9m", "白", "發", "中"]
        game.hands[2] = ["2s", "2s", "2s", "5s", "5s", "5s", "8s", "8s", "8s", "9m", "白", "發", "中"]
        game.hands[3] = ["3s", "3s", "3s", "6s", "6s", "6s", "9s", "9s", "9s", "9m", "白", "發", "中"]

        game.wall = [
            "1m", "1m", "1m", 
            "1m", # (和了)
            "東", "南", "西", 
            "南", # (前進)
            "3p", "3p", "3p", 
            "中", # (ハズレ)
            "2p", "2p", "2p", 
            "9s", # (前進)
            "1s", "1s", "1s", 
            "1s"  # (ハズレ)
        ]

    elif scenario == "lesson_8":
        # レッスン8: 一色四歩高
        game.hands[0] = ["1s", "2s", "3s", "2s", "3s", "4s", "3s", "4s", "5s", "南", "5s", "白", "白"]
        game.melds[0] = []
        game.is_first_turn = [False, False, False, False]
        game.turn = 0
        game.hands[1] = ["1p", "1p", "2p", "2p", "3p", "3p", "4p", "4p", "5p", "東", "南", "西", "北"]
        game.hands[2] = ["5p", "6p", "6p", "7p", "7p", "8p", "8p", "9p", "9p", "東", "南", "西", "北"]
        game.hands[3] = ["1m", "1m", "1m", "1m", "9m", "9m", "9m", "9m", "白", "東", "南", "西", "北"]

        game.wall = [
            "6s", "5s", "6s",
            "4s", "白", "4s", "6s",
            "1s"
        ]

    elif scenario == "lesson_9":
        # レッスン9: 無花果+槓上開花
        game.hands[0] = ["1s", "1s", "1s", "2s", "2s", "2s", "3p", "4p", "5p", "5p", "6p", "7p", "7p"]
        game.melds[0] = []
        game.is_first_turn = [False, False, False, False]
        game.turn = 0
        game.hands[1] = ["1p", "3s", "2p", "2p", "3p", "3p", "4p", "4p", "8p", "8p", "9p", "9p", "東"]
        game.hands[2] = ["1p", "3s", "4s", "4s", "5s", "6s", "7s", "8s", "9s", "東", "南", "西", "北"]
        game.hands[3] = ["1p", "3s", "3s", "4s", "5s", "6s", "7s", "8s", "9s", "白", "發", "中", "東"]

        game.wall = [
            "7p",
            "2s", "1m", "1m", "1m",
            "4p","1s"
        ]

    # 🌟 追加：全テストケース共通！場に出た牌をカウントして、残りの牌で山札（game.wall）を自動生成する処理
    # 🚨 修正：海底テストなど、意図的に山札を極少数にしているシナリオはこの自動補充をスキップする
    skip_auto_wall = [
        "haitei_kan", 
        "test_haitei_stop", 
        "test_cpu_haitei", 
        "haitei_pon_test", 
        "haitei_pon_test2", 
        "random_4jokers",
        "auto_jokerswap",
        "lesson_1",
        "lesson_2",
        "lesson_3",
        "lesson_4",
        "lesson_5",
        "lesson_6",
        "lesson_7",
        "lesson_8",
        "lesson_9"
    ]
    
    print(skip_auto_wall)
    if scenario not in skip_auto_wall:
        # 1. 完全な112枚のデッキを用意する
        full_deck = TILE_NAMES * 4 + ["春", "夏", "秋", "冬"]
        
        # 2. 既に配置された牌をリストアップする
        used_tiles = []
        for i in range(4):
            used_tiles.extend(game.hands[i])
            for m in game.melds[i]:
                used_tiles.extend(m["tiles"])
            used_tiles.extend(game.win_tiles[i])
        
        # シナリオ内で明示的に「次に引かせるための山札」として設定された牌も使用済みとする
        preset_wall = list(game.wall)
        used_tiles.extend(preset_wall)
        
        # 3. 完全なデッキから配置済みの牌を引いていく
        for t in used_tiles:
            if t in full_deck:
                full_deck.remove(t)
            else:
                # ユーザーの指定ミスで本来の枚数（4枚または1枚）をオーバーしてしまった場合の警告
                print(f"[WARNING] 牌 '{t}' がゲームの規定枚数をオーバーして配置されています！")
        
        # 4. 余った牌をランダムにシャッフルして、シナリオで指定した山札の下（リストの先頭）に敷き詰める
        import random
        random.shuffle(full_deck)
        game.wall = full_deck + preset_wall

    # 全員の手牌をソート
    for i in range(4):
        game.hands[i] = game.sort_hand(game.hands[i])
        
    print(f"[DEBUG LOG] 🏁 最終的なプレイヤー0の手牌(ソート後): {game.hands[0]}")
    print(f"[DEBUG LOG] 🧱 自動生成・調整後の山札の総枚数: {len(game.wall)}")
        
    return get_safe_state(game)

# 🎯 UI表示用：現在のテンパイ待ち牌、または「何を切ればテンパイか」を計算して返すAPI
@app.get("/get_waits")
def get_waits(player_idx: int = 0, game: GameState = Depends(get_current_game)):
    hand = list(game.hands[player_idx])
    melds = game.melds[player_idx]
    has_won = len(game.win_tiles[player_idx]) > 0
    last_drawn = game.last_drawn[player_idx] 
    
    # 【パターン1】手牌が13枚（ツモる前、または他家のターン中）の待ち牌検索
    if len(hand) % 3 == 1:
        waits = []
        closed_str = " ".join(hand)
        for t in TILE_NAMES + list(SEASON_TILES):
            win_ctx = {"winning_tile": t, "is_tsumo": False, "is_haitei": False}
            data = {"closed_tiles": closed_str, "melds": melds, "win_context": win_ctx}
            if is_agari(data):
                waits.append(t)
        return {"waits": waits}
    
    # 【パターン2】手牌が14枚（自分のツモ番）の「何切る（どれを切ればテンパイか）」検索
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
                data = {"closed_tiles": closed_str, "melds": melds, "win_context": win_ctx}
                if is_agari(data):
                    waits.append(t)
            
            if waits:
                nanikiru_results[discard_tile] = waits
        return {"nanikiru": nanikiru_results}
    
    return {"waits": []}

# 🧹 対局終了時や退出時に、使い終わった卓をメモリから削除するAPI
@app.get("/exit_room")
def exit_room(room_id: str = ""):
    global active_rooms
    if room_id in active_rooms:
        del active_rooms[room_id]
        print(f"🧹 ルーム {room_id} を削除・お掃除しました！ (現在稼働中: {len(active_rooms)}卓)")
    return {"status": "success"}

# 🌟 牌譜データをフロントエンドに送るAPI
@app.get("/get_replay_data")
def get_replay_data(game: GameState = Depends(get_current_game)):
    return {"status": "success", "replay_data": game.replay_data}

@app.get("/should_cpu_participate_second_charleston")
def should_cpu_participate_second_charleston(cpu_idx: int, game: GameState = Depends(get_current_game)):
    try:
        hand = list(game.hands[cpu_idx])
        # 四季牌以外の牌を評価対象にする
        valid_candidates = [t for t in hand if t not in SEASON_TILES]
        
        # 手牌の各牌の評価値を計算
        scored = [(t, evaluate_tile_dynamically(t, hand, game, cpu_idx, game.cpu_personalities[cpu_idx])) for t in valid_candidates]
        # 評価値が低い順（いらない順）に並べ替える
        scored.sort(key=lambda x: x[1])
        
        cpu_level = getattr(game, 'cpu_level', 1)
        will_do = True
        
        # 候補が3枚以上ある場合のみ判定
        if len(scored) >= 3:
            # 「ワースト3番目」の牌の評価値を見る
            # （この牌の点数が高ければ、3枚も捨てるゴミ牌がない＝手が整っているということ）
            worst_3rd_score = scored[2][1] 
            
            if cpu_level == 0:
                # 🌟 よわい: 手牌の価値が分からず、手が壊れてもとりあえず70%で交換しちゃう
                if random.random() < 0.3:
                    will_do = False
            elif cpu_level == 1:
                # 🌟 ふつう: ワースト3位が「50点(対子など)」以上なら、形を崩したくないのでスルー
                if worst_3rd_score >= 50:
                    will_do = False
            else:
                # 🌟 つよい: ワースト3位が「30点(くっつき待ちの孤立牌など)」以上ならシビアにスルー
                if worst_3rd_score >= 30:
                    will_do = False
        else:
            will_do = False # 四季牌だらけで出せる牌が3枚ない場合は物理的に不可
            
        return {"participate": will_do}
    except Exception as e:
        traceback.print_exc()
        return {"error": str(e), "participate": False}