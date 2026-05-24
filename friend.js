// ==========================================
// 🤝 友人戦専用のフロントロジック (friend.js)
// ==========================================
// 設計方針:
// - CPU戦の game.js は基本的に触らない（読み取り専用で関数を呼び出すのみ）
// - 自分のアクションは /friend/* のREST APIを叩く（後のステップで実装）
// - 他人のアクションは /friend/ws/{room_id}/{player_idx} のWSで受信
// - 受信したイベントを既存のレンダリング関数 (render, renderCPU 等) に渡して画面更新

let friendWs = null;          // 対局中のWebSocket（ロビーWSとは別）
let myPlayerIdx = -1;          // 自分の座席番号 (0=東, 1=南, 2=西, 3=北)
let friendRoomId = "";         // 現在の友人戦ルームID
let friendPlayerNames = [];   // 全プレイヤー名（視点回転前の絶対座席順）

// ==========================================
// ロビーで4人揃ったら呼ばれるエントリーポイント
// ==========================================
function startFriendGame(initData) {
    console.log("[FRIEND] startFriendGame", initData);
    myPlayerIdx = initData.player_idx;
    friendRoomId = initData.room_id;
    friendPlayerNames = initData.player_names || [];

    // ゲームモードを切り替え
    currentGameMode = 'friend';
    localStorage.setItem('shiki_mahjong_game_mode', 'friend');

    // モーダルを閉じる
    if (typeof closeFriendMatch === 'function') {
        closeFriendMatch();
    } else {
        const modal = document.getElementById('friend-match-modal');
        if (modal) modal.style.display = 'none';
    }

    // 対局画面に遷移（CPU戦と同じパターン）
    const titleScreen = document.getElementById('title-screen');
    const modeScreen = document.getElementById('mode-select-screen');
    const table = document.querySelector('.table');
    const gameContainer = document.getElementById('game-container');
    if (titleScreen) titleScreen.style.display = 'none';
    if (modeScreen) modeScreen.style.display = 'none';
    if (table) table.style.opacity = 1;
    if (gameContainer) gameContainer.style.opacity = 1;

    // 対局WSに接続
    connectFriendGameWs();
}

// ==========================================
// 対局中のWebSocket接続
// ==========================================
function connectFriendGameWs() {
    const wsUrl = `ws://${window.location.host}/friend/ws/${friendRoomId}/${myPlayerIdx}`;
    console.log("[FRIEND] WS接続:", wsUrl);
    friendWs = new WebSocket(wsUrl);

    friendWs.onopen = () => {
        console.log("[FRIEND] WS接続成功。初期stateを取得します");
        // ステップ1: 初期stateを取得して画面に反映
        fetchFriendInitialState();
    };

    friendWs.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log("[FRIEND] WS受信:", data);
        handleFriendEvent(data);
    };

    friendWs.onclose = () => {
        console.log("[FRIEND] WS切断");
    };

    friendWs.onerror = (e) => {
        console.error("[FRIEND] WSエラー:", e);
    };
}

// ==========================================
// 初期state取得（ステップ1）
// ==========================================
async function fetchFriendInitialState() {
    try {
        const url = `/friend/state?room_id=${friendRoomId}&player_idx=${myPlayerIdx}&_t=${Date.now()}`;
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }
        const state = await res.json();
        console.log("[FRIEND] 初期state取得:", state);

        // game.js の safeUpdate でレンダリング
        if (typeof safeUpdate === 'function') {
            safeUpdate(state);
        }
        if (typeof render === 'function') render();
        if (typeof renderCPU === 'function') renderCPU();

        // ステップ1ではここまで。「次のステップで実装」と表示
        const msgEl = document.getElementById('msg');
        if (msgEl) {
            msgEl.innerText = `友人戦 ステップ1 完了。あなたは Player ${myPlayerIdx} (${friendPlayerNames[myPlayerIdx] || '?'})`;
            msgEl.className = "";
        }
    } catch (e) {
        console.error("[FRIEND] 初期state取得失敗:", e);
        alert("友人戦の初期化に失敗しました: " + e.message);
    }
}

// ==========================================
// WS受信イベントのディスパッチ（ステップ2以降で実装）
// ==========================================
function handleFriendEvent(data) {
    // 今は何もしない
    console.log("[FRIEND] イベント受信（ステップ2以降で処理）:", data);
}

// ==========================================
// プレイヤー名を取得（視点回転後の相対インデックス）
// game.js から呼び出されることを想定
// ==========================================
function getFriendPlayerName(rotatedIdx) {
    if (!friendPlayerNames || friendPlayerNames.length < 4) {
        return rotatedIdx === 0 ? "あなた" : `Player ${rotatedIdx}`;
    }
    const absoluteIdx = (myPlayerIdx + rotatedIdx) % 4;
    return friendPlayerNames[absoluteIdx] || `Player ${absoluteIdx}`;
}