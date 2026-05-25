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
// 初期state取得（ステップ1）→ 第1交換開始（ステップ2）
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

        // 🌟 第1交換の選択画面を表示（CPU戦と同じ関数を流用）
        if (typeof charlestonCount !== 'undefined') {
            charlestonCount = 1;
        }
        if (typeof startCharlestonSelection === 'function') {
            startCharlestonSelection();
        }
    } catch (e) {
        console.error("[FRIEND] 初期state取得失敗:", e);
        alert("友人戦の初期化に失敗しました: " + e.message);
    }
}

// ==========================================
// 第1交換: 自分が3枚提出する（game.js の execExchange から呼ばれる）
// ==========================================
async function friendSubmitCharleston(t1, t2, t3) {
    console.log("[FRIEND] 第1交換 提出:", t1, t2, t3);
    try {
        const url = `/friend/charleston_submit?room_id=${friendRoomId}&player_idx=${myPlayerIdx}&t1=${encodeURIComponent(t1)}&t2=${encodeURIComponent(t2)}&t3=${encodeURIComponent(t3)}&_t=${Date.now()}`;
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }
        const result = await res.json();
        console.log("[FRIEND] 提出結果:", result);
        // 自分が選択完了の表示（CPU戦の動作に合わせる）
        if (typeof showCharlestonStatus === 'function') showCharlestonStatus(0, true);
        if (typeof render === 'function') render();
        if (typeof renderCPU === 'function') renderCPU();
        // 待機メッセージ
        const msgEl = document.getElementById('msg');
        if (msgEl) {
            msgEl.innerText = "他のプレイヤーを待っています...";
            msgEl.className = "";
        }
        // 以降は WS で charleston_complete を待つ
    } catch (e) {
        console.error("[FRIEND] 第1交換 提出失敗:", e);
        alert("交換の送信に失敗しました: " + e.message);
    }
}

// ==========================================
// WS受信イベントのディスパッチ
// ==========================================
function handleFriendEvent(data) {
    const type = data.type;
    console.log("[FRIEND] イベント受信:", type, data);

    if (type === "charleston_player_ready") {
        // 他のプレイヤーが3枚提出した → 中央に裏向き3枚を表示
        const absIdx = data.player_idx;
        const relIdx = (absIdx - myPlayerIdx + 4) % 4;
        if (relIdx !== 0 && typeof showCharlestonStatus === 'function') {
            showCharlestonStatus(relIdx, true);
            if (typeof renderCPU === 'function') renderCPU();
        }
    } else if (type === "charleston_complete") {
        // 全員揃った → サイコロ・交換アニメーション・state反映
        handleCharlestonComplete(data);
    }
}

// ==========================================
// 第1交換完了アニメーション
// ==========================================
async function handleCharlestonComplete(data) {
    console.log("[FRIEND] 第1交換完了:", data);
    // state 反映
    if (data.state && typeof safeUpdate === 'function') {
        safeUpdate(data.state);
    }
    if (typeof render === 'function') render();
    if (typeof renderCPU === 'function') renderCPU();

    // 「ステップ2 完了」と表示（ステップ3で第2交換に進む）
    const msgEl = document.getElementById('msg');
    if (msgEl) {
        msgEl.innerText = `第1交換完了！ ${data.direction}（サイコロ: ${data.dice}）`;
        msgEl.className = "";
    }

    // サイコロ・交換アニメーション（CPU戦の関数を流用）
    if (typeof showDiceAnimation === 'function') {
        await showDiceAnimation(data.dice, data.direction);
    }
    if (typeof playExchangeAnimation === 'function') {
        await playExchangeAnimation(data.direction, [true, true, true, true]);
    }

    // クリーンアップ
    if (typeof hideCpuTiles !== 'undefined') {
        for (let i = 0; i < 4; i++) hideCpuTiles[i] = 0;
    }
    if (typeof clearCharlestonStatus === 'function') clearCharlestonStatus();
    if (typeof render === 'function') render();
    if (typeof renderCPU === 'function') renderCPU();

    if (msgEl) {
        msgEl.innerText = "ステップ2 完了。第2交換は次のステップで実装します";
        msgEl.className = "";
    }
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