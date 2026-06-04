// ==========================================
// 📡 サーバー通信システム (api.js)
// ==========================================

// 起動時に前回のIDをブラウザの記憶（localStorage）から読み出す
let currentSessionRoomId = localStorage.getItem('shiki_mahjong_room_id') || "";

// 📡 Pythonサーバー(FastAPI)へ通信し、データを受け取る超重要関数
async function apiCall(endpoint, params = {}) {
    // 🌟 追加：リプレイモード中は一切の通信を行わず、空のデータを返す
    if (typeof isReplayMode !== 'undefined' && isReplayMode) {
        return {};
    }

    // 🌟 セッション失効後はゲーム進行の通信を一切行わない
    //   （CPU戦のタイマー切れによる自動進行で /cpu_turn 等が呼ばれ続けるのを防ぐ）
    if (window._sessionRevoked) {
        return { status: "session_revoked" };
    }

    try {
        let url = endpoint;
        params._t = new Date().getTime();

        // 新規スタート以外は、必ず自分のルームIDを送信する
        if (endpoint !== '/start') {
            if (!currentSessionRoomId) throw new Error("セッションが切断されました。リロードしてください。");
            params.room_id = currentSessionRoomId;
        }

        // 🌟 友人戦: player_idx=0 を実際の座席番号に置き換える（サーバーは絶対座席で扱うため）
        if (typeof currentGameMode !== 'undefined' && currentGameMode === 'friend'
            && typeof myPlayerIdx !== 'undefined' && myPlayerIdx >= 0
            && params.player_idx === 0) {
            params.player_idx = myPlayerIdx;
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

// 🌟 牌譜データをサーバーから取得してローカルストレージに保存する
async function fetchAndSaveReplay() {
    if (!currentSessionRoomId) return;
    try {
        const res = await fetch(`/get_replay_data?room_id=${currentSessionRoomId}`);
        const data = await res.json();

        // ログが1局分でも存在すれば保存する
        if (data.status === 'success' && data.replay_data && data.replay_data.rounds.length > 0) {
            // 🔐 ログイン中はアカウント別キー、ゲストは従来通り
            const replayKey = (typeof window.getReplaysStorageKey === 'function') ? window.getReplaysStorageKey() : 'shiki_mahjong_replays';
            let savedReplays = JSON.parse(localStorage.getItem(replayKey)) || [];

            // 🌟 追加：現在の日時を取得して、見やすい形（YYYY/MM/DD HH:MM）に整形する
            const now = new Date();
            const y = now.getFullYear();
            const m = (now.getMonth() + 1).toString().padStart(2, '0');
            const d = now.getDate().toString().padStart(2, '0');
            const h = now.getHours().toString().padStart(2, '0');
            const min = now.getMinutes().toString().padStart(2, '0');
            const formattedTime = `${y}/${m}/${d} ${h}:${min}`;

            // 一意のIDを付与
            data.replay_data.id = Date.now().toString();

            // 🌟 追加：整形した日時と、設定したプレイヤー名をデータに記録する
            data.replay_data.start_time = formattedTime;
            // 友人戦の場合はサーバー側で実プレイヤー名がセット済みなので上書きしない
            if (!data.replay_data.player_names || data.replay_data.player_names.length !== 4 || data.replay_data.player_names[0] === "あなた") {
                data.replay_data.player_names = [playerStats.playerName, "CPU 1", "CPU 2", "CPU 3"];
            }

            savedReplays.push(data.replay_data);

            // ストレージ容量圧迫を防ぐため、最新の30件だけ保存する
            if (savedReplays.length > 30) savedReplays.shift();

            localStorage.setItem(replayKey, JSON.stringify(savedReplays));
            // 🔐 ログイン中はサーバーにも同期
            if (typeof isLoggedIn === 'function' && isLoggedIn() && typeof authSave === 'function') {
                authSave();
            }
        }
    } catch (e) {
        //console.error("牌譜の取得・保存に失敗:", e);
    }
}
/*デプロイ用コメント1*/