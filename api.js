// ==========================================
// 📡 サーバー通信システム (api.js)
// ==========================================

// 起動時に前回のIDをブラウザの記憶（localStorage）から読み出す
let currentSessionRoomId = localStorage.getItem('shiki_mahjong_room_id') || "";

// 📡 Pythonサーバー(FastAPI)へ通信し、データを受け取る超重要関数
async function apiCall(endpoint, params = {}) {
    try {
        let url = endpoint;
        params._t = new Date().getTime();

        // 新規スタート以外は、必ず自分のルームIDを送信する
        if (endpoint !== '/start') {
            if (!currentSessionRoomId) throw new Error("セッションが切断されました。リロードしてください。");
            params.room_id = currentSessionRoomId;
        }

        if (Object.keys(params).length > 0) {
            const query = new URLSearchParams(params).toString();
            url += `?${query}`;
        }

        if (typeof logMsg === 'function') logMsg(`>>> 通信: ${url}`);

        const res = await fetch(url, { method: 'GET', cache: 'no-store' });
        if (!res.ok) throw new Error(`サーバーエラー(${res.status})。`);

        const data = await res.json();

        // サーバーから新しいルームIDが届いたら記憶して保存する
        if (data.room_id) {
            currentSessionRoomId = data.room_id;
            localStorage.setItem('shiki_mahjong_room_id', currentSessionRoomId); // 永久保存

            // 現在のゲームモードも一緒に記憶しておく
            if (typeof currentGameMode !== 'undefined') {
                localStorage.setItem('shiki_mahjong_game_mode', currentGameMode);
            }

            console.log(`[ROOM] 割り当てられたルームID: ${currentSessionRoomId}`);
        }

        if (data.error) {
            if (data.error === "流局") throw new Error("流局");
            throw new Error(data.error);
        }

        // game.js 側の画面更新関数を呼び出す
        if (typeof safeUpdate === 'function') safeUpdate(data);

        if (typeof logMsg === 'function') {
            logMsg(`<<< 成功 (T:${typeof turn !== 'undefined' ? turn : '?'}, 手牌:${typeof myHand !== 'undefined' ? myHand.length : '?'})`);
        }

        return data;
    } catch (e) {
        if (e.message === "流局") throw e;
        if (typeof logMsg === 'function') logMsg(`[エラー] ${e.message}`, true);
        alert(`【システムエラー】\n${e.message}\n\n※画面をリロードしてもう一度お試しください。`);
        if (typeof isProc !== 'undefined') isProc = false;
        throw e;
    }
}