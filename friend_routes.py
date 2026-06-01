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
import asyncio
import random
import friend_cpu

router = APIRouter(prefix="/friend")


# ==========================================
# 友人戦の対局中WS接続を管理するクラス
# ==========================================
class FriendGameConnections:
    """ロビーWSとは別に「対局中のWS」を管理する。
    ロビーWSは4人揃ったらゲーム画面に遷移するための仕組み。
    こちらは対局中のリアルタイム同期用。"""

    # 🌟 切断時のクリーンアップ猶予秒数（この間に再接続があれば対局を保持）
    CLEANUP_GRACE_SEC = 60.0

    def __init__(self):
        # room_id → [WebSocket, WebSocket, WebSocket, WebSocket]（player_idx順）
        self.connections: Dict[str, List[WebSocket]] = {}
        # room_id → asyncio.Task （全員切断時のクリーンアップタスク）
        self._cleanup_tasks: Dict[str, "asyncio.Task"] = {}
        # room_id → [bool, bool, bool, bool] 各player_idxが一度でも接続したか（再接続判定用）
        self._ever_connected: Dict[str, List[bool]] = {}
        # (room_id, player_idx) → asyncio.Task （切断中プレイヤーを自動進行させるウォッチドッグ）
        self._disconnect_watchdogs: Dict[tuple, "asyncio.Task"] = {}

    async def connect(self, websocket: WebSocket, room_id: str, player_idx: int) -> bool:
        """接続を登録。戻り値は「これが再接続か（過去に一度でも接続したことがあるか）」を表す。"""
        await websocket.accept()
        if room_id not in self.connections:
            self.connections[room_id] = [None, None, None, None]
        if room_id not in self._ever_connected:
            self._ever_connected[room_id] = [False, False, False, False]

        # 🌟 再接続判定: 過去に一度でも接続したことがあるか
        is_rejoin = self._ever_connected[room_id][player_idx]
        self._ever_connected[room_id][player_idx] = True

        # 🌟 既存接続があれば閉じる（再接続時の差し替え）
        old = self.connections[room_id][player_idx]
        if old is not None and old is not websocket:
            try:
                await old.close()
            except Exception:
                pass

        self.connections[room_id][player_idx] = websocket
        print(f"[FRIEND WS] Room {room_id} に Player {player_idx} が接続 (rejoin={is_rejoin})")

        # 🌟 クリーンアップタスクがあればキャンセル（全員切断 → 誰か復帰）
        if room_id in self._cleanup_tasks:
            self._cleanup_tasks[room_id].cancel()
            del self._cleanup_tasks[room_id]
            print(f"[FRIEND WS] Room {room_id} のクリーンアップタスクをキャンセル（再接続）")

        # 🌟 このプレイヤー宛のウォッチドッグはキャンセルせず、次のループで自分で終了させる。
        # （自動アクション中にキャンセルすると friend_discard の応答待ちが途中で切れて
        #  pending_call が放置される可能性があるため、ウォッチドッグ側の再接続判定に任せる）
        wd_key = (room_id, player_idx)
        if wd_key in self._disconnect_watchdogs:
            print(f"[FRIEND WS] Player {player_idx} のウォッチドッグは次の周期で自己終了予定")

        return is_rejoin

    def disconnect(self, websocket: WebSocket, room_id: str):
        if room_id not in self.connections:
            return
        disconnected_idx = -1
        for i, conn in enumerate(self.connections[room_id]):
            if conn is websocket:
                self.connections[room_id][i] = None
                disconnected_idx = i
                print(f"[FRIEND WS] Room {room_id} の Player {i} が切断")
                break

        # 🌟 他プレイヤーに切断通知 + 自動進行ウォッチドッグ起動
        if disconnected_idx >= 0:
            try:
                asyncio.create_task(self._notify_disconnect(room_id, disconnected_idx))
            except Exception:
                pass
            # 🌟 切断中プレイヤーのターン/反応を肩代わりして他プレイヤーを待たせないためのウォッチドッグ
            wd_key = (room_id, disconnected_idx)
            old_wd = self._disconnect_watchdogs.get(wd_key)
            if old_wd is not None and not old_wd.done():
                old_wd.cancel()
            try:
                self._disconnect_watchdogs[wd_key] = asyncio.create_task(
                    _disconnect_watchdog(room_id, disconnected_idx)
                )
            except Exception:
                pass

        if not any(self.connections[room_id]):
            # 🌟 全員切断 → 即削除せず、60秒の猶予タイマー開始
            print(f"[FRIEND WS] Room {room_id} は全員切断。{self.CLEANUP_GRACE_SEC}秒の猶予開始")
            self._cleanup_tasks[room_id] = asyncio.create_task(self._delayed_cleanup(room_id))

    async def _notify_disconnect(self, room_id: str, player_idx: int):
        """他プレイヤーに player_disconnected を送る"""
        await self.send_to_others(room_id, player_idx, {
            "type": "player_disconnected",
            "player_idx": player_idx
        })

    async def _delayed_cleanup(self, room_id: str):
        """全員切断後、猶予秒数経過したら game 状態を削除"""
        try:
            await asyncio.sleep(self.CLEANUP_GRACE_SEC)
            # 経過後、まだ誰も繋がっていなければクリーンアップ
            if room_id in self.connections and not any(self.connections[room_id]):
                del self.connections[room_id]
                if room_id in self._ever_connected:
                    del self._ever_connected[room_id]
                # 🌟 ルームに紐づくウォッチドッグタスクをすべて停止
                for key in list(self._disconnect_watchdogs.keys()):
                    if key[0] == room_id:
                        task = self._disconnect_watchdogs.pop(key, None)
                        if task is not None and not task.done():
                            task.cancel()
                print(f"[FRIEND WS] Room {room_id} 猶予期間終了。対局を削除します。")
                try:
                    from main import lobby_manager
                    if room_id in lobby_manager.games: del lobby_manager.games[room_id]
                    if room_id in lobby_manager.charleston_selections: del lobby_manager.charleston_selections[room_id]
                    if room_id in lobby_manager.second_charleston_confirms: del lobby_manager.second_charleston_confirms[room_id]
                    if room_id in lobby_manager.second_charleston_selections: del lobby_manager.second_charleston_selections[room_id]
                    if hasattr(lobby_manager, 'player_names') and room_id in lobby_manager.player_names:
                        # 各プレイヤーの current_room_id もクリア
                        try:
                            from auth_routes import set_user_current_room
                            if hasattr(lobby_manager, 'player_usernames') and room_id in lobby_manager.player_usernames:
                                for username in lobby_manager.player_usernames[room_id]:
                                    if username:
                                        set_user_current_room(username, None)
                        except Exception:
                            pass
                        del lobby_manager.player_names[room_id]
                    if hasattr(lobby_manager, 'player_usernames') and room_id in lobby_manager.player_usernames:
                        del lobby_manager.player_usernames[room_id]
                    print(f"[FRIEND WS] Room {room_id} の game 状態を完全削除しました。")
                except Exception as e:
                    print(f"[FRIEND WS] cleanup失敗: {e}")
            if room_id in self._cleanup_tasks:
                del self._cleanup_tasks[room_id]
        except asyncio.CancelledError:
            # 再接続でキャンセルされた場合
            pass

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

    async def send_to_others(self, room_id: str, exclude_idx: int, message: dict):
        """指定プレイヤー以外に送信（切断・再接続通知用）"""
        if room_id not in self.connections:
            return
        for i, conn in enumerate(self.connections[room_id]):
            if i == exclude_idx or conn is None:
                continue
            try:
                await conn.send_json(message)
            except Exception as e:
                print(f"[FRIEND WS] 通知送信失敗 (player {i}): {e}")


friend_connections = FriendGameConnections()


# ==========================================
# 🕒 ターンタイマー（CPU戦の startTimer 相当をサーバー側にも保持）
# ==========================================
# サーバー側でのタイマー切れ判定にネットワーク遅延ぶんの余裕を足す
_TURN_TIMER_GRACE_SEC = 2.0


def _get_room_settings(room_id: str) -> dict:
    from main import lobby_manager
    return getattr(lobby_manager, 'room_settings', {}).get(room_id, {
        "timeDiscard": 60, "timeCall": 20, "timeExchange": 60
    })


def _start_turn_timer(game, room_id: str):
    """現在の game.turn のプレイヤーに対して、状況に応じたターンタイマーを記録する。
    - 山残り1枚（海底選択）: timeCall
    - それ以外（通常の打牌）: timeDiscard
    """
    import time as _t
    room_settings = _get_room_settings(room_id)
    time_discard = float(room_settings.get('timeDiscard', 60))
    time_call = float(room_settings.get('timeCall', 20))
    duration = time_call if len(game.wall) == 1 else time_discard
    game.turn_timer_started_at = _t.time()
    game.turn_timer_duration = duration


def _clear_turn_timer(game):
    """ターンタイマーをクリア（局終了など、誰のターンでもない状態用）"""
    game.turn_timer_started_at = None
    game.turn_timer_duration = None


def _get_turn_timer_remaining(game) -> float:
    """現在のターンタイマーの残り秒数。タイマー未設定なら None。"""
    import time as _t
    started = getattr(game, 'turn_timer_started_at', None)
    duration = getattr(game, 'turn_timer_duration', None)
    if started is None or duration is None:
        return None
    return max(0.0, started + duration - _t.time())


def _start_charleston_timer(game, room_id: str):
    """第1/第2交換のタイマーをサーバー側で開始。
    クライアント側 startTimer(timeExchange, ...) と同時刻にサーバーでも記録しておくことで、
    リロード復帰時に残り秒数を返せるようにする。"""
    import time as _t
    room_settings = _get_room_settings(room_id)
    duration = float(room_settings.get('timeExchange', 60))
    game.charleston_timer_started_at = _t.time()
    game.charleston_timer_duration = duration


def _clear_charleston_timer(game):
    game.charleston_timer_started_at = None
    game.charleston_timer_duration = None


def _get_charleston_timer_remaining(game) -> float:
    import time as _t
    started = getattr(game, 'charleston_timer_started_at', None)
    duration = getattr(game, 'charleston_timer_duration', None)
    if started is None or duration is None:
        return None
    return max(0.0, started + duration - _t.time())


# ==========================================
# 🕒 タイマー切れペナルティ（プレイヤーごと）
# ==========================================
# 1回の時間切れごとに timeDiscard を 20秒減らす（最低 5秒）
_PENALTY_DISCARD_DELTA = 20
# 1回の時間切れごとに timeCall を 5秒減らす（最低 5秒）
_PENALTY_CALL_DELTA = 5
_PENALTY_FLOOR = 5


def _get_penalty_count(game, player_idx: int) -> int:
    counts = getattr(game, 'player_penalty_counts', None)
    if counts is None or player_idx < 0 or player_idx >= len(counts):
        return 0
    return counts[player_idx]


def _increment_penalty(game, player_idx: int):
    if not hasattr(game, 'player_penalty_counts') or game.player_penalty_counts is None:
        game.player_penalty_counts = [0, 0, 0, 0]
    if 0 <= player_idx < len(game.player_penalty_counts):
        game.player_penalty_counts[player_idx] += 1


def _effective_settings_for_player(room_settings: dict, penalty_count: int) -> dict:
    """ペナルティ回数を反映した実効タイマー設定。"""
    td = int(room_settings.get('timeDiscard', 60))
    tc = int(room_settings.get('timeCall', 20))
    te = int(room_settings.get('timeExchange', 60))
    return {
        "timeDiscard": max(_PENALTY_FLOOR, td - _PENALTY_DISCARD_DELTA * penalty_count),
        "timeCall": max(_PENALTY_FLOOR, tc - _PENALTY_CALL_DELTA * penalty_count),
        "timeExchange": te,
    }


# ==========================================
# 🔁 切断中プレイヤーのターン/反応を自動進行するウォッチドッグ
# ==========================================
# 「アクションすべき場面が無い」とき次のチェックまで待つ秒数
_IDLE_POLL_SEC = 1.0
# 待機中に再接続/状態変化を確認するポーリング間隔
_WAIT_POLL_SEC = 0.5


def _get_wait_for_action(game, action: str, room_id: str) -> float:
    """アクション種別と現在のタイマー残量から、ウォッチドッグの待機秒数を返す。
    - 副露猶予の skip: pending_call の timeCall タイマー残量 + grace
    - 第1/第2交換のフェーズ: 交換タイマー残量 + grace
    - 通常打牌/海底ツモ等: ターンタイマー残量 + grace
    """
    import time as _t
    room_settings = _get_room_settings(room_id)
    if action == "skip_call":
        # pending_call.started_at + timeCall - now まで待つ
        pc = getattr(game, 'pending_call', None)
        if pc:
            started = pc.get("started_at")
            if started is not None:
                time_call = float(room_settings.get('timeCall', 20))
                remaining = max(0.0, started + time_call - _t.time())
                return remaining + _TURN_TIMER_GRACE_SEC
        return float(room_settings.get('timeCall', 20))
    if action in ("charleston_submit", "second_charleston_answer"):
        # 交換タイマー残量を尊重する
        remaining = _get_charleston_timer_remaining(game)
        if remaining is None:
            return float(room_settings.get('timeExchange', 60))
        return remaining + _TURN_TIMER_GRACE_SEC
    # その他は現在のターンタイマーの残量を待つ
    remaining = _get_turn_timer_remaining(game)
    if remaining is None:
        # タイマーが未設定（=サーバーが追跡していない場面）はフォールバック
        return float(room_settings.get('timeDiscard', 60))
    return remaining + _TURN_TIMER_GRACE_SEC


def _watchdog_what_to_do(game, player_idx: int, room_id: str = ""):
    """切断中プレイヤーが滞らせている現状アクションを判定。
    戻り値: "skip_call" / "charleston_submit" / "second_charleston_answer" /
            "discard_drawn" / "draw" / "trigger_round_end" / None
    """
    from main import lobby_manager
    if getattr(game, 'round_calculated', False):
        return None
    pc = getattr(game, 'pending_call', None)
    if pc and not pc.get('resolved'):
        if player_idx in pc.get('responders', []) and player_idx not in pc.get('responses', {}):
            return "skip_call"

    # 第1交換: 自分が3枚提出していなければ自動提出すべき
    if not getattr(game, 'charleston_done', False):
        cs = getattr(lobby_manager, 'charleston_selections', {}).get(room_id, {})
        if player_idx not in cs:
            return "charleston_submit"
        return None  # 既に提出済み → 他のプレイヤー待ち

    # 第2交換: 自分が今の質問対象で、まだ回答していなければ自動回答すべき
    if not getattr(game, 'second_charleston_done', False):
        confirms = getattr(lobby_manager, 'second_charleston_confirms', {}).get(room_id, {})
        if player_idx in confirms:
            return None  # 既に回答済み
        # 自分が今の質問対象か（dealer + asked_count == player_idx）
        asked_count = len(confirms)
        current_asker = (game.dealer + asked_count) % 4
        if current_asker == player_idx:
            return "second_charleston_answer"
        return None  # 他人の番なので何もしない

    if (game.turn == player_idx
            and getattr(game, 'charleston_done', False)
            and getattr(game, 'second_charleston_done', False)):
        # 手牌枚数で「打牌が必要 / ツモが必要」を判定。
        # 待機状態: hand = 13 - 3*melds、打牌必要状態: hand = 14 - 3*melds（ツモ後 or 副露後）
        hand_len = len(game.hands[player_idx])
        meld_count = len(game.melds[player_idx])
        expected_waiting = max(0, 13 - meld_count * 3)
        if hand_len > expected_waiting:
            # 1枚以上余っている = 打牌すべき（ツモ後 or 副露後）
            return "discard_drawn"
        if game.wall:
            return "draw"
        return "trigger_round_end"
    return None


async def _disconnect_watchdog(room_id: str, player_idx: int):
    """切断中のプレイヤー player_idx が自分のターン/副露猶予で止めている場面を検出し、
    自動的にスキップ/自摸切り処理を行うウォッチドッグ。

    待機:
      - 自分のターン（打牌/海底ツモ等）: サーバーが追跡している
        ターンタイマー残量に等しい時間だけ待ってから自動アクション。
        ホストが設定した timeDiscard / timeCall がそのまま「他人を待たせる時間」になる。
      - 副露猶予 skip: discard 側のポーリングが timeCall+5 で auto-skip するため即時。
    """
    from main import lobby_manager

    def _is_reconnected():
        conns = friend_connections.connections.get(room_id)
        return conns is not None and conns[player_idx] is not None

    def _is_room_gone():
        return room_id not in lobby_manager.games

    while True:
        try:
            # 再接続 or ルーム消失で終了
            if _is_reconnected():
                print(f"[WATCHDOG] Room {room_id} Player {player_idx} 再接続検知、終了")
                return
            if _is_room_gone():
                return

            game = lobby_manager.games[room_id]
            action = _watchdog_what_to_do(game, player_idx, room_id)

            if action is None:
                # 現状アクション不要 → 短い間隔で再チェック
                try:
                    await asyncio.sleep(_IDLE_POLL_SEC)
                except asyncio.CancelledError:
                    return
                continue

            # サーバーが追跡しているターンタイマー残量に応じて待機
            wait_sec = _get_wait_for_action(game, action, room_id)
            print(f"[WATCHDOG] Room {room_id} Player {player_idx} 検知: action={action}, {wait_sec:.1f}秒待機")

            elapsed = 0.0
            interrupted = False
            while elapsed < wait_sec:
                step = min(_WAIT_POLL_SEC, wait_sec - elapsed)
                try:
                    await asyncio.sleep(step)
                except asyncio.CancelledError:
                    return
                elapsed += step
                if _is_reconnected() or _is_room_gone():
                    interrupted = True
                    break
                # 待機中にゲーム状態が変わって行動不要になっていたらキャンセル
                if room_id in lobby_manager.games:
                    current_action = _watchdog_what_to_do(lobby_manager.games[room_id], player_idx, room_id)
                    if current_action != action:
                        interrupted = True
                        break

            if interrupted:
                continue  # ループ先頭で再判定（再接続/状態変化に対応）

            # 待機完了 → 改めて状態を確認してアクション実行
            if _is_reconnected() or _is_room_gone():
                continue
            game = lobby_manager.games[room_id]
            action_now = _watchdog_what_to_do(game, player_idx, room_id)
            if action_now is None:
                continue

            # アクション実行
            try:
                if action_now == "skip_call":
                    pc = getattr(game, 'pending_call', None)
                    if pc:
                        print(f"[WATCHDOG] Room {room_id} Player {player_idx} 副露猶予を自動スキップ（+ペナルティ）")
                        pc.setdefault('responses', {})[player_idx] = 'skip'
                        # 🌟 切断中の応答タイムアウト → 通常と同じくペナルティ
                        _increment_penalty(game, player_idx)
                elif action_now == "charleston_submit":
                    # 第1交換: 手牌の昇順下位3枚を自動提出（クライアントのタイムアウト挙動 [0,1,2] と一致）
                    sorted_hand = list(game.hands[player_idx])
                    if len(sorted_hand) >= 3:
                        t1, t2, t3 = sorted_hand[0], sorted_hand[1], sorted_hand[2]
                        print(f"[WATCHDOG] Room {room_id} Player {player_idx} 第1交換を自動提出 {t1},{t2},{t3}（+ペナルティ）")
                        _increment_penalty(game, player_idx)
                        await friend_charleston_submit(room_id, player_idx, t1, t2, t3)
                elif action_now == "second_charleston_answer":
                    # 第2交換: 「スキップ（参加しない）」で自動回答
                    print(f"[WATCHDOG] Room {room_id} Player {player_idx} 第2交換を自動スキップ（+ペナルティ）")
                    _increment_penalty(game, player_idx)
                    await friend_second_charleston_submit(room_id, player_idx, "false", "", "", "")
                elif action_now == "discard_drawn":
                    # 自摸切り（ツモ後）、または副露後の打牌（pon 等で just_drawn が無いケース）
                    tile_to_discard = ""
                    if game.just_drawn == player_idx and player_idx < len(game.last_drawn):
                        t = game.last_drawn[player_idx]
                        if t and t in game.hands[player_idx]:
                            tile_to_discard = t
                    if not tile_to_discard and game.hands[player_idx]:
                        # 副露後はクライアントのタイマー切れと同じく「ソート済み手牌の末尾」を捨てる
                        sorted_hand = game.sort_hand(list(game.hands[player_idx]))
                        if sorted_hand:
                            tile_to_discard = sorted_hand[-1]
                    if tile_to_discard:
                        print(f"[WATCHDOG] Room {room_id} Player {player_idx} 自動打牌 {tile_to_discard}（+ペナルティ）")
                        _increment_penalty(game, player_idx)
                        await friend_discard(room_id, player_idx, tile_to_discard)
                elif action_now == "draw":
                    print(f"[WATCHDOG] Room {room_id} Player {player_idx} 自動ツモ（+ペナルティ）")
                    # 🌟 切断中のツモ未実行タイムアウト → 通常と同じくペナルティ
                    _increment_penalty(game, player_idx)
                    await friend_draw(room_id, player_idx)
                elif action_now == "trigger_round_end":
                    # 山0枚での局終了は時間切れではないのでペナルティ無し
                    print(f"[WATCHDOG] Room {room_id} Player {player_idx} 山0枚で局終了をトリガ")
                    await friend_calculate_round_scores(room_id, player_idx)
            except asyncio.CancelledError:
                return
            except Exception as e:
                print(f"[WATCHDOG] アクション実行失敗 ({action_now}): {e}")
                traceback.print_exc()

            # ブロードキャスト反映の安定化
            try:
                await asyncio.sleep(0.5)
            except asyncio.CancelledError:
                return
        except asyncio.CancelledError:
            return
        except Exception as e:
            print(f"[WATCHDOG] エラー: {e}")
            traceback.print_exc()
            try:
                await asyncio.sleep(1.0)
            except asyncio.CancelledError:
                return


# ==========================================
# 視点回転ユーティリティ
# ==========================================
def rotate_for_player(arr: list, player_idx: int) -> list:
    """サーバー絶対座席のリストを、指定プレイヤーから見た相対順 [自分, 下家, 対面, 上家] に並び替え"""
    return [arr[(player_idx + i) % 4] for i in range(4)]


def get_friend_state_for_player(game, player_idx: int) -> dict:
    """指定プレイヤー視点に回転した state を作る。
    CPU戦の get_safe_state とフィールド名を合わせる。"""
    # 🌟 リザルト画面（局終了 = round_calculated == True）なら全員の手牌公開
    reveal_all = getattr(game, 'round_calculated', False)

    # 全プレイヤーの手牌（自分以外は通常「ura」プレースホルダー、リザルト時は実手牌）
    all_hands_display = []
    for i in range(4):
        actual_seat = (player_idx + i) % 4
        if i == 0 or reveal_all:
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
        # 🌟 サーバー側で管理しているターンタイマーの残量（自分のターンの時のみクライアントで利用する想定）
        "turn_timer_remaining": _get_turn_timer_remaining(game),
        # 🌟 交換タイマーの残量（charleston フェーズで意味を持つ）
        "charleston_timer_remaining": _get_charleston_timer_remaining(game),
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

    # 🌟 第2交換開始: 最初の質問対象は親
    game.second_charleston_current_asker = game.dealer

    # 🌟 第2交換（最初の質問対象=親）用にタイマーをリセット
    _start_charleston_timer(game, room_id)

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

    # 🤖 第2交換は親から順番に。最初の質問対象 (dealer) が CPU なら自動応答を起動。
    # 次の asker（順番が回ってきた瞬間）も submit 完了時に同様に起動される。
    if friend_cpu.is_cpu_seat(game, game.dealer):
        asyncio.create_task(_cpu_answer_second_charleston(room_id, game.dealer))
    else:
        # 親が人間 → タイムアウト監視タスク起動
        asyncio.create_task(_watch_second_charleston_timeout(room_id, game.dealer))

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

    # 🌟 順番チェック: 現在質問対象 (second_charleston_current_asker) でなければ拒否
    current_asker = getattr(game, 'second_charleston_current_asker', None)
    if current_asker is None:
        # 初期化されていない（charleston_complete を経由していない異常状態）→ 親で初期化
        game.second_charleston_current_asker = game.dealer
        current_asker = game.dealer
    if player_idx != current_asker:
        print(f"[FRIEND] 第2交換 submit 順番違反: 要求 {player_idx}, 期待 {current_asker} → 無視")
        return {"status": "not_your_turn", "expected": current_asker}

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

    # 🌟 次の質問対象を更新（4人全員回ったら終了処理に行く）
    next_asker = (player_idx + 1) % 4
    game.second_charleston_current_asker = next_asker

    # 🌟 次の質問対象のプレイヤー用にタイマーをリセット
    _start_charleston_timer(game, room_id)

    # 「player_idx が回答した」を全員に通知（次の番のプレイヤーに進ませる用）
    await friend_connections.broadcast(room_id, {
        "type": "second_charleston_player_done",
        "player_idx": player_idx,
        "participate": participates,
        "next_asker": next_asker
    })

    # 🌟 次の asker が人間で、まだ4人回答完了でなければタイムアウト監視タスクを起動
    # （人間が放置しても、設定時間 + マージンで自動スキップして次へ進める）
    if len(confirms) < 4 and not friend_cpu.is_cpu_seat(game, next_asker):
        asyncio.create_task(_watch_second_charleston_timeout(room_id, next_asker))

    if len(confirms) < 4:
        active_so_far = sum(1 for v in confirms.values() if v)
        remaining = 4 - len(confirms)
        # 🌟 早期不成立: 参加 + 残り < 2 で不成立確定
        if active_so_far + remaining < 2:
            print(f"[FRIEND] 第2交換 早期不成立: 参加 {active_so_far} + 残り {remaining} < 2")
            for i in range(4):
                if i not in confirms:
                    confirms[i] = False
            # 通常処理にフォールスルー
        # 🌟 早期成立: 既に3人以上参加（残り1人の選択に関わらず交換実行）
        # ※ ただし「3人参加+残り1人」のケースでも残り1人が参加すれば4人になるので、
        #   残り1人の選択を待った方が公平。早期成立は無効化（自動で4人目を待たない動作を防止）
        # → 単純に未回答者を待つ
        else:
            # 🤖 次の asker が CPU なら自動応答タスク起動
            if friend_cpu.is_cpu_seat(game, next_asker):
                asyncio.create_task(_cpu_answer_second_charleston(room_id, next_asker))
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
        # 🌟 交換タイマー終了 + 親のターンタイマー開始
        _clear_charleston_timer(game)
        _start_turn_timer(game, room_id)
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

        # 🤖 通常ターン開始: 次が CPU なら自動進行
        asyncio.create_task(cpu_auto_advance_if_needed(room_id))

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
    # 🌟 交換タイマー終了 + 親（先頭打牌者）のターンタイマー開始
    _clear_charleston_timer(game)
    _start_turn_timer(game, room_id)

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

    # 🤖 通常ターン開始: 次が CPU なら自動進行
    asyncio.create_task(cpu_auto_advance_if_needed(room_id))

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
    # 🌟 ツモ後はクライアント側で改めて timeDiscard タイマーが始まるので、サーバー側も合わせる
    _start_turn_timer(game, room_id)

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
    # 🌟 打牌したら槓上開花/JokerSwap/妙手フラグはリセット
    game.next_tsumo_rinshan = False
    game.next_tsumo_joker_swap = False
    game.next_tsumo_miaoshou = False
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
        _start_turn_timer(game, room_id)
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
        # 🤖 反応者なしで進行 → 次が CPU なら自動進行
        asyncio.create_task(cpu_auto_advance_if_needed(room_id))
        return get_friend_state_for_player(game, player_idx)

    # 副露猶予を開始
    import time as _time
    game.pending_call = {
        "discarder": player_idx,
        "tile": tile,
        "responders": list(responders),
        "ron_capable": [p for p, r in reactions.items() if r["ron"]],
        "responses": {},
        "resolved": False,
        "started_at": _time.time()  # 🌟 復帰時の残り時間計算用
    }

    # 🤖 CPU 席が responder にいれば自動応答タスク起動
    cpu_in_responders = any(friend_cpu.is_cpu_seat(game, r) for r in responders)
    if cpu_in_responders:
        asyncio.create_task(_cpu_respond_to_pending_call(room_id))

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
            "pending_call": True,  # 🌟 誰かが反応可能=副露猶予中。受信側はこの間 checkT で局終了判定をしないようにする
            "state": state
        })

    # 全 responder の応答を待つ（最大 12秒）
    # 🌟 副露猶予のタイムアウト: ホストが設定した time_call + マージン
    from main import lobby_manager
    room_settings = getattr(lobby_manager, 'room_settings', {}).get(room_id, {})
    user_time_call = room_settings.get('timeCall', 20)
    # ユーザータイマーより少し長めに設定（クライアントのタイマー切れ → skip 送信のためのマージン）
    TIMEOUT = float(user_time_call) + 5.0
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
        # タイムアウト: 未応答者は skip 扱い + ペナルティ加算
        # （クライアント側で notifyTimerPenalty を投げられないまま timeCall+5 まで来た =
        #   応答できなかった、または切断中なので、通常のタイマー切れと同じ扱いにする）
        timeout_reached = elapsed >= TIMEOUT
        for r in pc["responders"]:
            if r not in pc["responses"]:
                pc["responses"][r] = "skip"
                if timeout_reached:
                    _increment_penalty(game, r)
        # 副露判定
        await _resolve_friend_call(room_id, game)
        # 🤖 副露解決後、次が CPU なら自動進行
        asyncio.create_task(cpu_auto_advance_if_needed(room_id))

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
        _start_turn_timer(game, room_id)
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

    # ===== 明槓（kan） =====
    kan_claimers = [p for p, r in responses.items() if r == "kan"]
    if kan_claimers:
        order = [(discarder + 1) % 4, (discarder + 2) % 4, (discarder + 3) % 4]
        claimer = next((p for p in order if p in kan_claimers), kan_claimers[0])
        if game.hands[claimer].count(tile) >= 3:
            for _ in range(3): game.hands[claimer].remove(tile)
            game.melds[claimer].append({"type": "minkan", "tiles": [tile]*4, "from_player": discarder})
            if game.discards[discarder] and game.discards[discarder][-1] == tile:
                game.discards[discarder].pop()
            game.any_meld_occurred = True
            game.is_first_turn[claimer] = False
            game.last_discard_info = {"player": -1, "tile": ""}
            game.turn = claimer
            _start_turn_timer(game, room_id)
            # 嶺上ツモ
            drawn = ""
            if game.wall:
                drawn = game.wall.pop()
                game.hands[claimer].append(drawn)
                game.last_drawn[claimer] = drawn
                game.just_drawn = claimer
            game.hands[claimer] = game.sort_hand(game.hands[claimer])
            game.append_log("meld", player=claimer, meld_type="minkan", tile=tile, from_player=discarder)
            game.pending_call = None
            # 🌟 次のツモ和了で「槓上開花」を有効に
            game.next_tsumo_rinshan = True
            for p in range(4):
                state = get_friend_state_for_player(game, p)
                await friend_connections.send_to(room_id, p, {
                    "type": "friend_meld",
                    "meld_type": "minkan",
                    "player_idx": claimer,
                    "from_player": discarder,
                    "tile": tile,
                    "state": state
                })
            return

    # ===== 花槓（hanakan: 2枚+季節牌1枚） =====
    hk_claimers = [p for p, r in responses.items() if r == "hanakan"]
    if hk_claimers:
        order = [(discarder + 1) % 4, (discarder + 2) % 4, (discarder + 3) % 4]
        claimer = next((p for p in order if p in hk_claimers), hk_claimers[0])
        # 季節牌を選ぶ
        season_tile = pc.get("hanakan_season")
        if not season_tile:
            from main import SEASON_TILES
            for s in SEASON_TILES:
                if s in game.hands[claimer]:
                    season_tile = s
                    break
        if season_tile and game.hands[claimer].count(tile) >= 2 and season_tile in game.hands[claimer]:
            for _ in range(2): game.hands[claimer].remove(tile)
            game.hands[claimer].remove(season_tile)
            game.melds[claimer].append({"type": "hanakan", "tiles": [tile, season_tile, tile, tile], "from_player": discarder})
            if game.discards[discarder] and game.discards[discarder][-1] == tile:
                game.discards[discarder].pop()
            game.any_meld_occurred = True
            game.is_first_turn[claimer] = False
            game.last_discard_info = {"player": -1, "tile": ""}
            game.turn = claimer
            _start_turn_timer(game, room_id)
            # 嶺上ツモ
            drawn = ""
            if game.wall:
                drawn = game.wall.pop()
                game.hands[claimer].append(drawn)
                game.last_drawn[claimer] = drawn
                game.just_drawn = claimer
            game.hands[claimer] = game.sort_hand(game.hands[claimer])
            game.append_log("meld", player=claimer, meld_type="hanakan", tile=tile, season=season_tile, from_player=discarder)
            game.pending_call = None
            # 🌟 次のツモ和了で「槓上開花」を有効に
            game.next_tsumo_rinshan = True
            for p in range(4):
                state = get_friend_state_for_player(game, p)
                await friend_connections.send_to(room_id, p, {
                    "type": "friend_meld",
                    "meld_type": "hanakan",
                    "player_idx": claimer,
                    "from_player": discarder,
                    "tile": tile,
                    "season": season_tile,
                    "state": state
                })
            return

    # ===== ポン =====
    pon_claimers = [p for p, r in responses.items() if r == "pon"]
    if pon_claimers:
        order = [(discarder + 1) % 4, (discarder + 2) % 4, (discarder + 3) % 4]
        claimer = next((p for p in order if p in pon_claimers), pon_claimers[0])
        if game.hands[claimer].count(tile) >= 2:
            for _ in range(2): game.hands[claimer].remove(tile)
            game.melds[claimer].append({"type": "pong", "tiles": [tile]*3, "from_player": discarder})
            if game.discards[discarder] and game.discards[discarder][-1] == tile:
                game.discards[discarder].pop()
            game.any_meld_occurred = True
            game.is_first_turn[claimer] = False
            game.last_discard_info = {"player": -1, "tile": ""}
            game.turn = claimer
            _start_turn_timer(game, room_id)
            game.hands[claimer] = game.sort_hand(game.hands[claimer])
            game.append_log("meld", player=claimer, meld_type="pong", tile=tile, from_player=discarder)
            game.pending_call = None
            for p in range(4):
                state = get_friend_state_for_player(game, p)
                await friend_connections.send_to(room_id, p, {
                    "type": "friend_meld",
                    "meld_type": "pong",
                    "player_idx": claimer,
                    "from_player": discarder,
                    "tile": tile,
                    "state": state
                })
            return

    # ===== 全員スキップ → turn 進行 =====
    game.turn = (discarder + 1) % 4
    _start_turn_timer(game, room_id)
    game.pending_call = None
    for p in range(4):
        state = get_friend_state_for_player(game, p)
        await friend_connections.send_to(room_id, p, {
            "type": "call_resolved",
            "resolution": "skip",
            "state": state
        })


@router.get("/call_action")
async def friend_call_action(room_id: str, player_idx: int, action: str, season: str = ""):
    """プレイヤーの副露猶予への応答を記録。action: skip / pon / kan / ron / hanakan
    hanakan の場合は使用する季節牌を season で指定。"""
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
    # hanakan の場合は季節牌情報を保存
    if action == "hanakan" and season:
        pc["hanakan_season"] = season

    # 🌟 ロン宣言: 他のロン可能者だけ待ち、それ以外は即解決
    if action == "ron":
        ron_capable = pc.get("ron_capable", [])
        # 他のロン可能者でまだ応答していない人がいるか
        ron_pending = [p for p in ron_capable if p != player_idx and p not in pc["responses"]]
        if not ron_pending:
            # 他のロン可能者なし or 全員応答済み → 即解決（ポン/カン/スキップ待ちは不要）
            await _resolve_friend_call(room_id, game)
            # 🤖 副露解決後、次が CPU なら自動進行
            asyncio.create_task(cpu_auto_advance_if_needed(room_id))
            return {"status": "ok", "responded": len(pc["responses"]), "needed": len(pc["responders"])}

    # 全員の応答が揃ったら即座に解決
    if len(pc["responses"]) >= len(pc["responders"]):
        await _resolve_friend_call(room_id, game)
        # 🤖 副露解決後、次が CPU なら自動進行
        asyncio.create_task(cpu_auto_advance_if_needed(room_id))

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

        # 🌟 サーバー側に保持しているフラグも OR で使う（CPU戦と違い、フロントのフラグは保持できないため）
        server_rinshan = getattr(game, 'next_tsumo_rinshan', False)
        server_joker_swap = getattr(game, 'next_tsumo_joker_swap', False)
        server_miaoshou = getattr(game, 'next_tsumo_miaoshou', False)

        ctx = {
            "winning_tile": tile,
            "is_tsumo": True,
            "is_haitei": len(game.wall) == 0,
            "is_joker_swap": is_joker_swap.lower() == "true" or server_joker_swap,
            "is_rinshan": is_rinshan.lower() == "true" or server_rinshan,
            "is_miaoshou": server_miaoshou,
            "is_first_turn": game.is_first_turn[player_idx],
            "any_meld_occurred": game.any_meld_occurred,
            "is_dealer": game.dealer == player_idx,
            "discards_count": game.discards_count
        }
        # フラグ消費
        game.next_tsumo_rinshan = False
        game.next_tsumo_joker_swap = False
        game.next_tsumo_miaoshou = False

        game.win_records[player_idx].append(ctx)
        game.win_tiles[player_idx].append(tile)
        game.last_discard_info = {"player": -1, "tile": ""}
        game.is_first_turn[player_idx] = False
        game.just_drawn = -1
        # アガリ放題: ターンを次に進める
        game.turn = (player_idx + 1) % 4
        _start_turn_timer(game, room_id)

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
# REST: 自分のターンでの暗槓・暗花槓・加槓・加花槓
# ==========================================
@router.get("/self_meld")
async def friend_self_meld(room_id: str, player_idx: int, type: str, tile: str, season: str = "", is_hidden: str = "false"):
    """CPU戦の process_self_meld ロジックを再利用し、結果を WS broadcast する。"""
    from main import lobby_manager, process_self_meld
    if room_id not in lobby_manager.games:
        raise HTTPException(status_code=404, detail="対局が見つかりません")
    game = lobby_manager.games[room_id]

    # CPU戦のロジックを直接呼び出す
    result = process_self_meld(player_idx=player_idx, type=type, tile=tile, season=season, is_hidden=is_hidden, game=game)

    if isinstance(result, dict) and result.get("error"):
        return result

    # 🌟 次のツモ和了時に「槓上開花」を有効にするためのフラグ（嶺上ツモが発生する種類だけ）
    if type in ["暗槓", "暗花槓", "加槓", "加花槓"]:
        game.next_tsumo_rinshan = True

    # 槍槓（chankan）発生時は special 処理（後のステップで対応）
    if isinstance(result, dict) and result.get("chankan_occurred"):
        pass

    # 🌟 自分が継続して打牌するためタイマーをリセット
    _start_turn_timer(game, room_id)

    # 全プレイヤーに friend_self_meld を broadcast
    for p in range(4):
        state = get_friend_state_for_player(game, p)
        await friend_connections.send_to(room_id, p, {
            "type": "friend_self_meld",
            "player_idx": player_idx,
            "meld_type": type,
            "tile": tile,
            "season": season,
            "state": state
        })

    return get_friend_state_for_player(game, player_idx)



# ==========================================
# REST: JokerSwap（季節牌と他家の花槓の本体牌を交換）
# ==========================================
@router.get("/joker_swap")
async def friend_joker_swap(room_id: str, player_idx: int, tile: str, season: str, target_idx: int):
    """CPU戦の process_joker_swap ロジックを再利用し、結果を WS broadcast する。"""
    from main import lobby_manager, process_joker_swap
    if room_id not in lobby_manager.games:
        raise HTTPException(status_code=404, detail="対局が見つかりません")
    game = lobby_manager.games[room_id]

    result = process_joker_swap(player_idx=player_idx, tile=tile, season=season, target_idx=target_idx, game=game)

    if isinstance(result, dict) and result.get("error"):
        return result

    # 🌟 次のツモ和了で「JokerSwap」「妙手」を有効に
    game.next_tsumo_joker_swap = True
    if season == "春":
        game.next_tsumo_miaoshou = True

    # 🌟 自分が継続して打牌するためタイマーをリセット
    _start_turn_timer(game, room_id)

    # 全プレイヤーに friend_joker_swap を broadcast
    for p in range(4):
        state = get_friend_state_for_player(game, p)
        await friend_connections.send_to(room_id, p, {
            "type": "friend_joker_swap",
            "player_idx": player_idx,
            "target_idx": target_idx,
            "tile": tile,
            "season": season,
            "state": state
        })

    return get_friend_state_for_player(game, player_idx)



# ==========================================
# REST: 1局終了時の点数計算
# ==========================================
@router.get("/calculate_round_scores")
async def friend_calculate_round_scores(room_id: str, player_idx: int):
    """CPU戦の calculate_round_scores を呼び出して結果を全員に broadcast。"""
    from main import lobby_manager, calculate_round_scores
    if room_id not in lobby_manager.games:
        raise HTTPException(status_code=404, detail="対局が見つかりません")
    game = lobby_manager.games[room_id]

    result = calculate_round_scores(game=game)
    # 🌟 局終了時はターンタイマーを無効化（ウォッチドッグが何もしないようにするため）
    _clear_turn_timer(game)

    abs_scores = result.get("scores", [0, 0, 0, 0])
    abs_ranking = result.get("ranking_points", [0, 0, 0, 0])
    abs_results = result.get("results", [])

    def rotate_result_for(p):
        rotated_scores = rotate_for_player(abs_scores, p) if len(abs_scores) == 4 else abs_scores
        rotated_ranking = rotate_for_player(abs_ranking, p) if len(abs_ranking) == 4 else abs_ranking
        rotated_results = []
        for r in abs_results:
            r2 = dict(r)
            if "player" in r2:
                r2["player"] = (r2["player"] - p + 4) % 4
            rotated_results.append(r2)
        # 🌟 リザルト中は全員の実手牌を含む state を同梱して、
        # 「盤面を見る」ホバーで他プレイヤーの手牌・副露が確認できるようにする
        state = get_friend_state_for_player(game, p)
        return {
            "results": rotated_results,
            "scores": rotated_scores,
            "ranking_points": rotated_ranking,
            "state": state
        }

    # 各プレイヤーに視点回転済みのデータを broadcast
    for p in range(4):
        payload = rotate_result_for(p)
        state = get_friend_state_for_player(game, p)  # round_calculated=True 状態の state（全員手牌公開済み）
        await friend_connections.send_to(room_id, p, {
            "type": "friend_round_end",
            "state": state,
            **payload
        })
    # 呼び出した本人にも視点回転済みの結果を返す（state も含めて、apiCall の safeUpdate で myAllHands を更新）
    response = rotate_result_for(player_idx)
    response["state"] = get_friend_state_for_player(game, player_idx)
    # state の中身も apiCall の safeUpdate が拾えるようにトップレベルにも展開
    response.update(response["state"])
    return response


# ==========================================
# REST: 次局へ進める
# ==========================================
# ==========================================
# REST: リザルト演出完了通知 → 4人揃ったら自動で次局へ
# ==========================================
@router.get("/round_ready")
async def friend_round_ready(room_id: str, player_idx: int):
    """各プレイヤーがリザルト演出完了を通知。4人揃ったらサーバーが next_round を実行して broadcast。"""
    from main import lobby_manager, next_round
    if room_id not in lobby_manager.games:
        raise HTTPException(status_code=404, detail="対局が見つかりません")
    game = lobby_manager.games[room_id]

    if not hasattr(game, 'round_ready'):
        game.round_ready = set()
    game.round_ready.add(player_idx)

    # 🤖 CPU 席は常に自動 ready 扱い（人間プレイヤーがリザルト演出完了するのを待たない）
    types = getattr(game, 'friend_seat_types', None)
    if types:
        for seat in range(4):
            if types[seat] == "cpu":
                game.round_ready.add(seat)

    print(f"[FRIEND] Room {room_id} round_ready: {len(game.round_ready)}/4 (player {player_idx})")

    # 4人揃った時点で次局へ進める
    if len(game.round_ready) >= 4 and not getattr(game, 'next_round_processing', False):
        game.next_round_processing = True
        game.round_ready = set()  # クリア

        # 4局終了判定
        if game.current_round >= 4:
            # 🌟 ログイン中ユーザーの current_room_id をクリア（途中復帰の対象から外す）
            try:
                from auth_routes import set_user_current_room
                from main import lobby_manager
                if hasattr(lobby_manager, 'player_usernames') and room_id in lobby_manager.player_usernames:
                    for username in lobby_manager.player_usernames[room_id]:
                        if username:
                            set_user_current_room(username, None)
            except Exception as e:
                print(f"[FRIEND] game_end current_room_id クリア失敗: {e}")
            for p in range(4):
                await friend_connections.send_to(room_id, p, {
                    "type": "friend_game_end",
                    "total_scores": game.total_scores
                })
            return {"status": "game_end", "total_scores": game.total_scores}

        # 次局へ
        next_round(game=game)
        game.next_round_processing = False

        # 🌟 第1交換用のタイマーを開始
        _start_charleston_timer(game, room_id)

        # 各プレイヤーに視点回転済み state を broadcast
        for p in range(4):
            state = get_friend_state_for_player(game, p)
            await friend_connections.send_to(room_id, p, {
                "type": "friend_next_round",
                "state": state
            })

        # 🤖 CPU 席があれば第1交換の自動 submit を起動
        types = getattr(game, 'friend_seat_types', None)
        if types:
            for seat in range(4):
                if types[seat] == "cpu":
                    asyncio.create_task(_cpu_submit_charleston_after_delay(room_id, seat, friend_cpu.CPU_WAIT_CHARLESTON))

    return {"status": "ok", "ready_count": len(game.round_ready)}


# ==========================================
# REST: 時間切れペナルティ通知
# ==========================================
@router.get("/timer_penalty")
async def friend_timer_penalty(room_id: str, player_idx: int):
    """クライアントが自分のタイマーを切らした時に呼ぶ。
    プレイヤーごとのペナルティ回数を 1 加算する（リロード時の復元用）。"""
    from main import lobby_manager
    if room_id not in lobby_manager.games:
        return {"status": "no_room"}
    game = lobby_manager.games[room_id]
    _increment_penalty(game, player_idx)
    return {
        "status": "ok",
        "penalty_count": _get_penalty_count(game, player_idx)
    }


# ==========================================
# 🤖 CPU 自動進行 ヘルパー群
# ==========================================
async def schedule_cpu_initial_charleston(room_id: str):
    """ゲーム開始時、CPU 席があれば第1交換の自動 submit をスケジュール。"""
    from main import lobby_manager
    if room_id not in lobby_manager.games:
        return
    game = lobby_manager.games[room_id]
    types = getattr(game, 'friend_seat_types', None)
    if not types:
        return
    # 各CPU席に対してタスクを起動（人間と同じくらいの遅延で submit）
    for seat in range(4):
        if types[seat] == "cpu":
            asyncio.create_task(_cpu_submit_charleston_after_delay(room_id, seat, friend_cpu.CPU_WAIT_CHARLESTON))


async def _cpu_submit_charleston_after_delay(room_id: str, seat_idx: int, delay: float):
    """指定遅延後、CPU 席の第1交換を submit する。"""
    try:
        await asyncio.sleep(delay)
        from main import lobby_manager
        if room_id not in lobby_manager.games:
            return
        game = lobby_manager.games[room_id]
        # 既に交換完了 or 既に submit 済みなら何もしない
        if getattr(game, 'charleston_done', False):
            return
        selections = lobby_manager.charleston_selections.get(room_id, {})
        if seat_idx in selections:
            return
        # CPU の選択を計算
        tiles = friend_cpu.cpu_pick_charleston_tiles(game, seat_idx)
        if len(tiles) < 3:
            print(f"[FRIEND_CPU] charleston tiles 不足 seat {seat_idx}: {tiles}")
            return
        # 既存の friend_charleston_submit を内部呼び出し
        await friend_charleston_submit(
            room_id=room_id, player_idx=seat_idx,
            t1=tiles[0], t2=tiles[1], t3=tiles[2]
        )
    except Exception as e:
        print(f"[FRIEND_CPU] CPU 第1交換 submit 失敗 seat {seat_idx}: {e}")
        traceback.print_exc()


async def _cpu_answer_second_charleston(room_id: str, seat_idx: int):
    """指定 CPU 席が第2交換の質問対象になったタイミングで自動応答。
    必ず current_asker == seat_idx の時のみ実行する。
    """
    try:
        await asyncio.sleep(friend_cpu.CPU_WAIT_CHARLESTON)
        from main import lobby_manager
        if room_id not in lobby_manager.games:
            return
        game = lobby_manager.games[room_id]
        if getattr(game, 'second_charleston_done', False):
            return
        # 🌟 順番チェック: 自分が current_asker でなければ何もしない
        current_asker = getattr(game, 'second_charleston_current_asker', None)
        if current_asker != seat_idx:
            print(f"[FRIEND_CPU] CPU seat {seat_idx} 第2交換 自動応答スキップ (current_asker={current_asker})")
            return
        # 参加するか
        participate = friend_cpu.cpu_should_join_second_charleston(game, seat_idx)
        if participate:
            tiles = friend_cpu.cpu_pick_charleston_tiles(game, seat_idx)
            if len(tiles) < 3:
                tiles = list(game.hands[seat_idx][:3])
            await friend_second_charleston_submit(
                room_id=room_id, player_idx=seat_idx,
                participate="true",
                t1=tiles[0], t2=tiles[1], t3=tiles[2]
            )
        else:
            await friend_second_charleston_submit(
                room_id=room_id, player_idx=seat_idx,
                participate="false", t1="", t2="", t3=""
            )
    except Exception as e:
        print(f"[FRIEND_CPU] CPU 第2交換 submit 失敗 seat {seat_idx}: {e}")
        traceback.print_exc()


async def _watch_second_charleston_timeout(room_id: str, asker_seat: int):
    """第2交換で人間が時間切れになったら自動的にスキップして次へ進める。
    タイマーの残り秒数（+マージン）後に asker_seat がまだ submit していなければ強制 skip。
    """
    try:
        from main import lobby_manager
        if room_id not in lobby_manager.games:
            return
        game = lobby_manager.games[room_id]
        if getattr(game, 'second_charleston_done', False):
            return
        # 現在のタイマー残り時間 + マージン
        remaining = _get_charleston_timer_remaining(game)
        if remaining is None:
            return
        wait_sec = float(remaining) + 3.0  # マージン

        # 一気に sleep するのではなく、少しずつチェック（途中で submit されれば抜ける）
        elapsed = 0.0
        STEP = 0.5
        while elapsed < wait_sec:
            await asyncio.sleep(STEP)
            elapsed += STEP
            if room_id not in lobby_manager.games:
                return
            game = lobby_manager.games[room_id]
            # 第2交換完了 → 抜ける
            if getattr(game, 'second_charleston_done', False):
                return
            # 該当 asker が submit 済み → 抜ける
            confirms = lobby_manager.second_charleston_confirms.get(room_id, {})
            if asker_seat in confirms:
                return
            # 現在の asker が変わった（他の経路で進められた）→ 抜ける
            if getattr(game, 'second_charleston_current_asker', None) != asker_seat:
                return

        # タイムアウト到達 → 強制スキップ
        if room_id not in lobby_manager.games:
            return
        game = lobby_manager.games[room_id]
        if getattr(game, 'second_charleston_done', False):
            return
        confirms = lobby_manager.second_charleston_confirms.get(room_id, {})
        if asker_seat in confirms:
            return
        if getattr(game, 'second_charleston_current_asker', None) != asker_seat:
            return

        print(f"[FRIEND] 第2交換 タイムアウト → 強制スキップ seat {asker_seat}")
        # ペナルティ加算
        _increment_penalty(game, asker_seat)
        # 強制 skip として submit
        await friend_second_charleston_submit(
            room_id=room_id, player_idx=asker_seat,
            participate="false", t1="", t2="", t3=""
        )
    except Exception as e:
        print(f"[FRIEND] _watch_second_charleston_timeout 失敗: {e}")
        traceback.print_exc()



async def cpu_auto_advance_if_needed(room_id: str):
    """次のターンが CPU 席なら自動進行。連鎖的に複数のCPUターンを処理。
    人間ターン or 副露猶予中 になったら戻る。
    """
    from main import lobby_manager
    if room_id not in lobby_manager.games:
        return
    game = lobby_manager.games[room_id]

    # 第1/第2交換中・局終了中・副露猶予中は ターン進行系の対象外
    if not getattr(game, 'charleston_done', False):
        return
    if not getattr(game, 'second_charleston_done', False):
        return
    if getattr(game, 'round_calculated', False):
        return
    if getattr(game, 'pending_call', None):
        # 副露猶予中 → CPU の応答を別途処理
        return

    # 連続CPUターンを処理（ループだが、毎ターン awaitable な遅延あり）
    safety_limit = 200
    while safety_limit > 0:
        safety_limit -= 1

        if room_id not in lobby_manager.games:
            return
        game = lobby_manager.games[room_id]

        # 終了条件
        if getattr(game, 'round_calculated', False):
            return
        if getattr(game, 'pending_call', None):
            return
        if not game.wall:
            return

        seat = game.turn
        if not friend_cpu.is_cpu_seat(game, seat):
            return  # 人間ターン → 戻る

        # CPU のターン処理
        await asyncio.sleep(friend_cpu.CPU_WAIT_TURN)

        # 再度状態チェック（待っている間に変わった可能性）
        if room_id not in lobby_manager.games:
            return
        game = lobby_manager.games[room_id]
        if getattr(game, 'round_calculated', False) or not game.wall:
            return
        if game.turn != seat:
            continue  # ターンが変わったので再評価
        if getattr(game, 'pending_call', None):
            return

        # CPU のアクション実行
        # 副露直後（ポン直後）は手牌+meld=14枚相当 → ツモなしで打牌のみ
        # 通常ターン開始時は手牌+meld=13枚相当 → ツモ→打牌（cpu_do_turn）
        total_tiles = len(game.hands[seat]) + 3 * len(game.melds[seat])
        # 花槓は4枚 meld だが、内部的にも3で計算しているため要注意。
        # 念のため花槓を考慮した正確な総枚数を計算する
        try:
            total_tiles = len(game.hands[seat])
            for m in game.melds[seat]:
                total_tiles += len(m.get("tiles", []))
        except Exception:
            total_tiles = len(game.hands[seat]) + 3 * len(game.melds[seat])

        if total_tiles >= 14:
            # 副露直後 → ツモせずに打牌だけ
            result = friend_cpu.cpu_pick_discard_only(game, seat)
        else:
            # 通常ターン → ツモ→打牌（和了判定・暗槓・花槓・JokerSwap も含む）
            result = friend_cpu.cpu_do_turn(game, seat)

        if isinstance(result, dict) and result.get("error"):
            print(f"[FRIEND_CPU] cpu turn error seat {seat}: {result.get('error')}")
            return

        # ツモ和了の場合
        if isinstance(result, dict) and result.get("tsumo"):
            # 自摸イベントを broadcast（全員）
            for p in range(4):
                state = get_friend_state_for_player(game, p)
                await friend_connections.send_to(room_id, p, {
                    "type": "friend_win_tsumo",
                    "winner": seat,
                    "winning_tile": result.get("winning_tile", ""),
                    "yaku": result.get("yaku", []),
                    "state": state
                })
            # CPU のツモ和了後は次の手番はそのCPU席+1だが、cpu_turn 内で turn を進めている。
            # アガリ放題ルールなので局は続行。次の人がCPUなら更にループ。
            await asyncio.sleep(0.5)
            continue

        # 通常の打牌の場合
        discard = result.get("discard", "") if isinstance(result, dict) else ""
        did_kakan = result.get("did_kakan", False) if isinstance(result, dict) else False
        did_joker_swap = result.get("did_joker_swap", False) if isinstance(result, dict) else False
        kakan_tile = result.get("kakan_tile", "") if isinstance(result, dict) else ""

        # 副露猶予を発生させる必要があるかチェック
        # 既存の friend_discard 関数のロジックと同じ判定を簡略化して実装
        await _broadcast_cpu_discard(room_id, seat, discard, did_kakan, did_joker_swap, kakan_tile)

        # discard 後、副露猶予が発生していれば一旦戻る（CPUの応答は別タスクで処理）
        if room_id not in lobby_manager.games:
            return
        game = lobby_manager.games[room_id]
        if getattr(game, 'pending_call', None):
            # 副露猶予 → CPU の応答を非同期で処理
            asyncio.create_task(_cpu_respond_to_pending_call(room_id))
            return

        # 連続CPUターンの間に少し空ける
        await asyncio.sleep(friend_cpu.CPU_WAIT_BETWEEN_TURNS)


async def _broadcast_cpu_discard(room_id: str, seat: int, tile: str, did_kakan: bool, did_joker_swap: bool, kakan_tile: str):
    """CPU の打牌結果を broadcast し、必要なら副露猶予を立てる。
    friend_discard と同等の処理を CPU 用に行う。
    人間版の broadcast 形式 (player_idx + state) に揃える。"""
    from main import lobby_manager
    if room_id not in lobby_manager.games:
        return
    game = lobby_manager.games[room_id]

    # 各プレイヤーの反応可能性を計算
    reactions = {}
    responders = []
    for p in range(4):
        if p == seat:
            continue
        # 既存の dict 返却版（game, responder_idx, tile）を使う
        r = _check_reaction_possible(game, p, tile)
        reactions[p] = r
        if any([r.get("pon", False), r.get("kan", False), r.get("ron", False), r.get("hanakan", False)]):
            responders.append(p)

    if responders:
        import time as _time
        game.pending_call = {
            "discarder": seat,
            "tile": tile,
            "responders": list(responders),
            "ron_capable": [p for p, r in reactions.items() if r["ron"]],
            "responses": {},
            "resolved": False,
            "started_at": _time.time(),
            "is_kakan": did_kakan,
            "kakan_tile": kakan_tile,
        }
        # 各プレイヤーに通知（人間版の friend_discard と同じ形式 + state を含める）
        for p in range(4):
            state = get_friend_state_for_player(game, p)
            payload = {
                "type": "friend_discard",
                "player_idx": seat,  # 絶対座席
                "tile": tile,
                "did_kakan": did_kakan,
                "did_joker_swap": did_joker_swap,
                "kakan_tile": kakan_tile,
                "pending_call": True,
                "can_ron": reactions.get(p, {}).get("ron", False),
                "can_pon": reactions.get(p, {}).get("pon", False),
                "can_kan": reactions.get(p, {}).get("kan", False),
                "can_hanakan": reactions.get(p, {}).get("hanakan", False),
                "state": state
            }
            await friend_connections.send_to(room_id, p, payload)
        # ターン切り替えはまだ
    else:
        # 副露なし → 即進行
        for p in range(4):
            state = get_friend_state_for_player(game, p)
            await friend_connections.send_to(room_id, p, {
                "type": "friend_discard",
                "player_idx": seat,
                "tile": tile,
                "did_kakan": did_kakan,
                "did_joker_swap": did_joker_swap,
                "kakan_tile": kakan_tile,
                "pending_call": False,
                "can_ron": False, "can_pon": False, "can_kan": False, "can_hanakan": False,
                "state": state
            })
        # turn は cpu_turn 内で進めている
        _start_turn_timer(game, room_id)


async def _cpu_respond_to_pending_call(room_id: str):
    """副露猶予中、CPU 席があれば自動的に応答（スキップ or 副露）。
    人間プレイヤーの応答も待つので、CPU は即応答ではなく適切な遅延を挟む。"""
    from main import lobby_manager
    try:
        if room_id not in lobby_manager.games:
            return
        game = lobby_manager.games[room_id]
        pc = getattr(game, 'pending_call', None)
        if not pc:
            return
        discarder = pc.get("discarder", -1)
        tile = pc.get("tile", "")
        responders = list(pc.get("responders", []))
        is_kakan = bool(pc.get("is_kakan", False))

        # CPU 席だけを抽出
        cpu_responders = [r for r in responders if friend_cpu.is_cpu_seat(game, r)]

        for cpu_seat in cpu_responders:
            # 応答決定
            reaction = friend_cpu.cpu_react_to_discard(game, discarder, tile, cpu_seat, is_kakan=is_kakan)
            action = reaction.get("action", "skip")

            if action == "skip":
                await asyncio.sleep(friend_cpu.CPU_WAIT_CALL_SKIP)
            else:
                await asyncio.sleep(friend_cpu.CPU_WAIT_CALL_DO)

            # 再度 game の状態確認
            if room_id not in lobby_manager.games:
                return
            game = lobby_manager.games[room_id]
            pc = getattr(game, 'pending_call', None)
            if not pc or pc.get("resolved", False):
                return

            # action を内部呼び出しで処理
            try:
                if action == "hanakan":
                    hk_season = reaction.get("season", tile)
                    await friend_call_action(
                        room_id=room_id, player_idx=cpu_seat,
                        action="hanakan", season=hk_season
                    )
                else:
                    await friend_call_action(
                        room_id=room_id, player_idx=cpu_seat,
                        action=action, season=""
                    )
            except Exception as e:
                print(f"[FRIEND_CPU] call action 失敗 seat {cpu_seat} action={action}: {e}")
                traceback.print_exc()
                # スキップでフォールバック
                try:
                    await friend_call_action(room_id=room_id, player_idx=cpu_seat, action="skip", season="")
                except Exception:
                    pass
    except Exception as e:
        print(f"[FRIEND_CPU] _cpu_respond_to_pending_call 失敗: {e}")
        traceback.print_exc()


# ==========================================
# WebSocket: 対局中のリアルタイム同期
# ==========================================
# ==========================================

# REST: 途中復帰
# ==========================================
@router.get("/rejoin")
async def friend_rejoin(token: str):
    """ログイン中ユーザーの current_room_id に基づいて途中復帰用の state を返す。"""
    try:
        return await _friend_rejoin_impl(token)
    except HTTPException:
        raise
    except Exception as e:
        print(f"[FRIEND REJOIN ERROR] {e}")
        traceback.print_exc()
        # 500を返すと UI が「対局への復帰に失敗しました」アラートを出して通常モード選択に進めない。
        # ここでは「復帰対象なし」として 200 を返してフロントを通常選択画面に進める。
        return {"status": "no_active_room", "error": str(e)}


async def _friend_rejoin_impl(token: str):
    from main import lobby_manager
    from auth_routes import resolve_token_to_username
    import time as _time

    username = resolve_token_to_username(token)
    if not username:
        raise HTTPException(status_code=401, detail="セッションが無効です")

    # DB から current_room_id を取得
    import sqlite3 as _sql
    import os as _os
    db_path = _os.environ.get("SHIKI_DB_PATH", _os.path.join(_os.path.dirname(__file__), "accounts.db"))
    conn = _sql.connect(db_path)
    conn.row_factory = _sql.Row
    try:
        row = conn.execute("SELECT current_room_id FROM users WHERE username = ?", (username,)).fetchone()
    finally:
        conn.close()

    room_id = row["current_room_id"] if row else None
    if not room_id:
        return {"status": "no_active_room"}

    # ルームが存在するか確認
    if room_id not in lobby_manager.games:
        # サーバー再起動 or 猶予期間切れで対局が消えている
        from auth_routes import set_user_current_room
        set_user_current_room(username, None)
        return {"status": "room_expired"}

    # username から player_idx を特定
    player_idx = None
    if hasattr(lobby_manager, 'player_usernames') and room_id in lobby_manager.player_usernames:
        for i, uname in enumerate(lobby_manager.player_usernames[room_id]):
            if uname == username:
                player_idx = i
                break
    if player_idx is None:
        # username 紐付けが失われている。クリアして諦め
        from auth_routes import set_user_current_room
        set_user_current_room(username, None)
        return {"status": "player_not_found"}

    game = lobby_manager.games[room_id]
    state = get_friend_state_for_player(game, player_idx)

    # ルーム設定（タイマー設定）
    room_settings = getattr(lobby_manager, 'room_settings', {}).get(room_id, {
        "timeDiscard": 60, "timeCall": 20, "timeExchange": 60
    })

    # 現在のフェーズ判定
    phase = "play"  # デフォルト
    if not getattr(game, 'charleston_done', False):
        phase = "charleston"
    elif not getattr(game, 'second_charleston_done', False):
        phase = "second_charleston"
    elif getattr(game, 'round_calculated', False):
        phase = "round_end"
    elif getattr(game, 'pending_call', None):
        phase = "pending_call"

    # 副露猶予の残り秒数（pending_call が立っている場合）
    pending_remaining = None
    pending_can = None
    pending_call = getattr(game, 'pending_call', None)
    if pending_call:
        elapsed = _time.time() - pending_call.get("started_at", _time.time())
        user_time_call = float(room_settings.get('timeCall', 20))
        pending_remaining = max(0.0, user_time_call - elapsed)
        # 自分が反応可能か
        responders = pending_call.get("responders", [])
        if player_idx in responders:
            # 簡易再計算（_check_reaction_possible は内部用なのでここでは pending_call の情報から判定）
            pending_can = {
                "can_ron": player_idx in pending_call.get("ron_capable", []),
                "discarder": (pending_call.get("discarder", 0) - player_idx + 4) % 4,
                "tile": pending_call.get("tile", ""),
                "responded": player_idx in pending_call.get("responses", {})
            }

    # 接続状況（誰が切断中か = None）
    connected_status = []
    if room_id in friend_connections.connections:
        for i in range(4):
            connected_status.append(friend_connections.connections[room_id][i] is not None)
    else:
        connected_status = [False, False, False, False]
    # 自分視点に回転
    connected_rotated = [connected_status[(player_idx + i) % 4] for i in range(4)]
    # 自分は復帰直後なので True 扱い
    connected_rotated[0] = True

    # 🌟 ターンタイマーの残り秒数（自分のターンの場合のみ意味を持つ）
    turn_timer_remaining = _get_turn_timer_remaining(game)
    # 🌟 交換タイマーの残り秒数（charleston フェーズで意味を持つ）
    charleston_timer_remaining = _get_charleston_timer_remaining(game)

    # 🌟 自分のペナルティ回数と、それを反映した実効タイマー設定
    penalty_count = _get_penalty_count(game, player_idx)
    effective_settings = _effective_settings_for_player(room_settings, penalty_count)

    # 🌟 第1交換の提出状況: 自分が既に3枚提出済みかどうか
    charleston_submitted = False
    cs = getattr(lobby_manager, 'charleston_selections', {}).get(room_id, {})
    if player_idx in cs:
        charleston_submitted = True

    # 🌟 第2交換の進行状況: 何人が回答したか / 自分が回答済みかどうか / 各人の回答
    confirms_dict = getattr(lobby_manager, 'second_charleston_confirms', {}).get(room_id, {})
    # 自分視点の dealer 起点で asked_count を数える（=確認辞書のサイズで十分。順序は親→下家→...）
    second_charleston_asked_count = len(confirms_dict)
    second_charleston_my_answered = player_idx in confirms_dict
    second_charleston_my_participate = bool(confirms_dict.get(player_idx, False))
    # 4要素の絶対座席 → 自分視点に回転して participating を返す
    abs_participating = [bool(confirms_dict.get(i, False)) for i in range(4)]
    second_charleston_participating = [
        abs_participating[(player_idx + i) % 4] for i in range(4)
    ]
    # 既に answered か否かを「自分視点で誰々」で返す
    abs_answered = [i in confirms_dict for i in range(4)]
    second_charleston_answered = [
        abs_answered[(player_idx + i) % 4] for i in range(4)
    ]

    return {
        "status": "ok",
        "room_id": room_id,
        "player_idx": player_idx,
        "player_names": list(getattr(game, 'friend_player_names', [])) or [],
        "dealer": game.dealer,
        "settings": room_settings,
        "effective_settings": effective_settings,
        "penalty_count": penalty_count,
        "phase": phase,
        "pending_remaining": pending_remaining,
        "pending_can": pending_can,
        "turn_timer_remaining": turn_timer_remaining,
        "charleston_timer_remaining": charleston_timer_remaining,
        "connected": connected_rotated,
        "charleston_submitted": charleston_submitted,
        "second_charleston_asked_count": second_charleston_asked_count,
        "second_charleston_my_answered": second_charleston_my_answered,
        "second_charleston_my_participate": second_charleston_my_participate,
        "second_charleston_participating": second_charleston_participating,
        "second_charleston_answered": second_charleston_answered,
        "state": state
    }



@router.websocket("/ws/{room_id}/{player_idx}")
async def friend_game_websocket(websocket: WebSocket, room_id: str, player_idx: int):
    """対局中の双方向通信。各プレイヤーがゲーム画面に入ったら接続する。"""
    from main import lobby_manager

    # 🌟 再接続判定は connect() が「過去に一度でも繋いだ player_idx か」を返す
    is_rejoin = await friend_connections.connect(websocket, room_id, player_idx)

    # 🌟 再接続なら他プレイヤーに通知（プレイヤー名も含めて）
    if is_rejoin:
        player_name = None
        try:
            if hasattr(lobby_manager, 'player_names') and room_id in lobby_manager.player_names:
                names = lobby_manager.player_names[room_id]
                if player_idx < len(names):
                    player_name = names[player_idx]
        except Exception:
            pass
        await friend_connections.send_to_others(room_id, player_idx, {
            "type": "player_reconnected",
            "player_idx": player_idx,
            "player_name": player_name or f"Player {player_idx}"
        })

    try:
        while True:
            data = await websocket.receive_json()
            print(f"[FRIEND WS] Room {room_id} Player {player_idx} から受信: {data}")
    except WebSocketDisconnect:
        friend_connections.disconnect(websocket, room_id)
    except Exception as e:
        print(f"[FRIEND WS ERROR] {e}")
        traceback.print_exc()
        friend_connections.disconnect(websocket, room_id)