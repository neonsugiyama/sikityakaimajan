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
// 🔁 切断中プレイヤー（相対インデックス）の管理。true なら切断中
let disconnectedPlayers = [false, false, false, false];

// ==========================================
// ロビーで4人揃ったら呼ばれるエントリーポイント
// ==========================================
function startFriendGame(initData) {
    console.log("[FRIEND] startFriendGame", initData);
    myPlayerIdx = initData.player_idx;
    friendRoomId = initData.room_id;
    friendPlayerNames = initData.player_names || [];
    console.log("[FRIEND DEBUG] myPlayerIdx:", myPlayerIdx, " friendPlayerNames:", JSON.stringify(friendPlayerNames));

    // 🌟 ホストの設定値を CPU戦のグローバル変数に上書き（友人戦中だけ有効）
    if (initData.settings) {
        if (typeof timeDiscard !== 'undefined') {
            timeDiscard = initData.settings.timeDiscard || 60;
        }
        if (typeof timeCall !== 'undefined') {
            timeCall = initData.settings.timeCall || 20;
        }
        if (typeof timeExchange !== 'undefined') {
            timeExchange = initData.settings.timeExchange || 60;
        }
        console.log("[FRIEND] タイマー設定:", initData.settings);
    }

    // ゲームモードを切り替え
    currentGameMode = 'friend';
    localStorage.setItem('shiki_mahjong_game_mode', 'friend');

    // 🌟 api.js の apiCall が使う currentSessionRoomId に同期
    if (typeof currentSessionRoomId !== 'undefined') {
        currentSessionRoomId = friendRoomId;
    }
    localStorage.setItem('shiki_mahjong_room_id', friendRoomId);

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
// 🔁 友人戦 途中復帰
// ==========================================
async function rejoinFriendGame() {
    // ローディング画面を出す
    const loading = document.getElementById('rejoin-loading');
    const progBar = document.getElementById('rejoin-progress-bar');
    const progText = document.getElementById('rejoin-progress-text');
    if (loading) loading.style.display = 'flex';

    const setProgress = (pct) => {
        if (progBar) progBar.style.width = pct + '%';
        if (progText) progText.innerText = Math.round(pct) + '%';
    };
    setProgress(5);

    try {
        if (!authToken) throw new Error('未ログイン');

        // サーバーから state 取得
        setProgress(15);
        const res = await fetch(`/friend/rejoin?token=${encodeURIComponent(authToken)}&_t=${Date.now()}`, { cache: 'no-store' });
        setProgress(40);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (data.status === 'no_active_room' || data.status === 'room_expired' || data.status === 'player_not_found') {
            // 復帰対象なし → ローディングを閉じて、通常モード選択へ
            console.log('[REJOIN] 復帰なし:', data.status);
            currentRoomIdInDb = null;
            if (loading) loading.style.display = 'none';
            return false;
        }
        if (data.status !== 'ok') throw new Error('rejoin 失敗: ' + JSON.stringify(data));

        setProgress(55);

        // ゲーム変数を復元
        myPlayerIdx = data.player_idx;
        friendRoomId = data.room_id;
        friendPlayerNames = data.player_names || [];
        currentSessionRoomId = data.room_id;
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('shiki_mahjong_room_id', data.room_id);
        }

        // タイマー設定を上書き（ペナルティ反映済みの effective_settings があればそちらを優先）
        const baseSettings = data.effective_settings || data.settings;
        if (baseSettings) {
            if (typeof timeDiscard !== 'undefined') timeDiscard = baseSettings.timeDiscard || 60;
            if (typeof timeCall !== 'undefined') timeCall = baseSettings.timeCall || 20;
            if (typeof timeExchange !== 'undefined') timeExchange = baseSettings.timeExchange || 60;
        }

        // ゲームモード切り替え
        currentGameMode = 'friend';
        localStorage.setItem('shiki_mahjong_game_mode', 'friend');

        setProgress(65);

        // 切断状況を反映
        if (Array.isArray(data.connected)) {
            for (let i = 0; i < 4; i++) disconnectedPlayers[i] = !data.connected[i];
        }

        // state を反映
        if (data.state && typeof safeUpdate === 'function') safeUpdate(data.state);
        // 🔁 オート機能の状態を復元（同じ局・同じ親なら ON のままにする）
        // リザルト経由 or 次局移行時には sessionStorage から削除されるので、復元されない
        if (data.phase === 'play' || data.phase === 'pending_call') {
            try {
                const key = `shiki_friend_auto_${friendRoomId}_${currentRound}_${dealer}`;
                const saved = sessionStorage.getItem(key);
                if (saved === '1') {
                    if (typeof isAutoPlay !== 'undefined') isAutoPlay = true;
                    // ボタン見た目も更新
                    const btn = document.getElementById('btn-auto-play');
                    if (btn) {
                        btn.innerText = "オート(和了後): ON";
                        btn.style.background = "#27ae60";
                        btn.style.boxShadow = "0 3px #2ecc71";
                        btn.classList.remove('auto-off');
                    }
                }
            } catch (e) { }
        }
        setProgress(80);

        // 画面遷移
        const titleScreen = document.getElementById('title-screen');
        const modeScreen = document.getElementById('mode-select-screen');
        const table = document.querySelector('.table');
        const gameContainer = document.getElementById('game-container');
        if (titleScreen) titleScreen.style.display = 'none';
        if (modeScreen) modeScreen.style.display = 'none';
        if (table) table.style.opacity = 1;
        if (gameContainer) {
            gameContainer.style.display = 'block';
            gameContainer.style.opacity = 1;
        }

        // 描画
        if (typeof render === 'function') render();
        if (typeof renderCPU === 'function') renderCPU();
        if (typeof updateInfoUI === 'function') updateInfoUI();

        // WS接続（onopen 内の fetchFriendInitialState はスキップさせる）
        friendSkipInitialStateOnOpen = true;
        connectFriendGameWs();
        setProgress(92);

        // フェーズに応じた再開
        await _resumeByPhase(data);
        setProgress(100);

        // ローディング非表示
        setTimeout(() => { if (loading) loading.style.display = 'none'; }, 300);
        return true;
    } catch (e) {
        console.error('[REJOIN] 失敗:', e);
        alert('対局への復帰に失敗しました: ' + e.message);
        if (loading) loading.style.display = 'none';
        currentRoomIdInDb = null;
        return false;
    }
}

// フェーズに応じて状態を再開
async function _resumeByPhase(rejoinData) {
    const phase = rejoinData.phase;
    console.log('[REJOIN] フェーズ:', phase);

    // 🌟 サーバーから返ってきた交換タイマーの残り秒数を sessionStorage に流し込み、
    //    startTimer の既存復元ロジック（isResuming + endTime 参照）で残り時間からカウント再開させる。
    const csRemaining = rejoinData.charleston_timer_remaining;
    function _applyCharlestonRemaining() {
        if (typeof csRemaining === 'number' && csRemaining > 0) {
            const endTime = Date.now() + Math.round(csRemaining * 1000);
            try {
                sessionStorage.setItem(`timer_end_time_${currentSessionRoomId}`, endTime);
            } catch (e) { }
            if (typeof isResuming !== 'undefined') isResuming = true;
        }
    }

    if (phase === 'charleston') {
        // 第1交換中
        if (typeof charlestonCount !== 'undefined') charlestonCount = 1;
        if (typeof isProc !== 'undefined') isProc = false;
        if (rejoinData.charleston_submitted) {
            // 🌟 既に3枚提出済み: 選択UIは出さず、待機画面に切り替える
            console.log('[REJOIN] 第1交換は既に提出済み → 待機表示');
            const cUi = document.getElementById('charleston-ui');
            if (cUi) cUi.style.display = 'none';
            const btn = document.getElementById('btn-exchange');
            if (btn) btn.style.display = 'none';
            if (typeof charlestonPhase !== 'undefined') charlestonPhase = true;
            if (typeof exchangeSelection !== 'undefined') exchangeSelection = [];
            // 自分の前に「提出済み(裏3枚)」スタンプを出す
            if (typeof showCharlestonStatus === 'function') showCharlestonStatus(0, true);
            const msgEl = document.getElementById('msg');
            if (msgEl) { msgEl.innerText = "待機中..."; msgEl.className = ""; }
            if (typeof isProc !== 'undefined') isProc = true; // 操作不可
        } else {
            _applyCharlestonRemaining();
            if (typeof startCharlestonSelection === 'function') startCharlestonSelection();
        }
    } else if (phase === 'second_charleston') {
        // 第2交換中: サーバーから渡された進行状況を復元
        if (typeof charlestonCount !== 'undefined') charlestonCount = 2;
        if (typeof charlestonPhase !== 'undefined') charlestonPhase = true;
        if (typeof exchangeSelection !== 'undefined') exchangeSelection = [];

        // 🌟 friendStartSecondCharleston と同じく「第2交換」パネルを再表示する
        const cTitle = document.getElementById('c-title');
        if (cTitle) {
            cTitle.innerText = "第2交換 (Second Charleston)";
            cTitle.style.color = "#f1c40f";
        }
        const cUiOpen = document.getElementById('charleston-ui');
        if (cUiOpen) {
            cUiOpen.style.zIndex = "9999";
            cUiOpen.style.display = "block";
        }
        const btnReopen = document.getElementById('btn-exchange');
        if (btnReopen) btnReopen.style.display = "none";
        if (typeof clearCharlestonStatus === 'function') clearCharlestonStatus();

        const askedCount = rejoinData.second_charleston_asked_count || 0;
        const answeredRel = Array.isArray(rejoinData.second_charleston_answered)
            ? rejoinData.second_charleston_answered : [false, false, false, false];
        const participatingRel = Array.isArray(rejoinData.second_charleston_participating)
            ? rejoinData.second_charleston_participating : [false, false, false, false];

        if (typeof friendSecondAskedCount !== 'undefined') friendSecondAskedCount = askedCount;
        if (typeof friendSecondParticipating !== 'undefined') {
            // 既存配列は絶対座席で使われている。dealer 起点で復元するため絶対座席に戻す
            for (let rel = 0; rel < 4; rel++) {
                const abs = (myPlayerIdx + rel) % 4;
                friendSecondParticipating[abs] = !!participatingRel[rel];
            }
        }

        // 既に回答済みのプレイヤーの場に「参加(裏3枚)」or「過」スタンプを再描画
        if (typeof showCharlestonStatus === 'function') {
            for (let rel = 0; rel < 4; rel++) {
                if (answeredRel[rel]) {
                    showCharlestonStatus(rel, !!participatingRel[rel]);
                    if (rel !== 0 && participatingRel[rel] && typeof hideCpuTiles !== 'undefined') {
                        hideCpuTiles[rel] = 3;
                    }
                }
            }
        }
        if (typeof renderCPU === 'function') renderCPU();

        if (rejoinData.second_charleston_my_answered) {
            // 🌟 自分は回答済み → UIは出さず、他プレイヤーの回答待ち
            console.log('[REJOIN] 第2交換は既に回答済み → 待機表示');
            const cUi = document.getElementById('charleston-ui');
            if (cUi) cUi.style.display = 'none';
            const btn = document.getElementById('btn-exchange');
            if (btn) btn.style.display = 'none';
            const msgEl = document.getElementById('msg');
            if (msgEl) { msgEl.innerText = "待機中..."; msgEl.className = ""; }
            if (typeof isProc !== 'undefined') isProc = true;
        } else {
            // 自分が回答対象の番なら、startTimer で交換タイマー残量を引き継ぐ
            const currentAskerRel = (typeof dealer !== 'undefined' ? (dealer + askedCount) % 4 : -1);
            if (currentAskerRel === 0) _applyCharlestonRemaining();
            if (typeof isProc !== 'undefined') isProc = false;
            if (typeof friendAskNextPlayer === 'function') friendAskNextPlayer();
        }
    } else if (phase === 'pending_call') {
        // 副露猶予中
        const pc = rejoinData.pending_can;
        const remaining = rejoinData.pending_remaining;
        if (pc && !pc.responded && remaining > 0) {
            // 自分が反応待機中で未応答 → ロンボタンを再表示
            if (typeof lastDiscardPlayer !== 'undefined') lastDiscardPlayer = pc.discarder;
            if (typeof lastT !== 'undefined') lastT = pc.tile;
            if (typeof checkHumanReaction === 'function') {
                // 🌟 checkHumanReaction は async（内部で await apiCall 多数）。
                // 中で startTimer(timeCall, ...) を呼んでフルタイマーをセットするので、
                // それを await で待ってから残り秒数に上書きする必要がある。
                await checkHumanReaction(pc.discarder, pc.tile);
                // タイマー残り秒数で上書き
                if (typeof stopTimer === 'function') stopTimer();
                if (typeof startTimer === 'function') {
                    startTimer(remaining, () => {
                        if (typeof sendFriendCallAction === 'function') sendFriendCallAction('skip');
                    });
                }
            }
            if (typeof isProc !== 'undefined') isProc = true;
        } else {
            // 自分は対象外 → 待機
            if (typeof isProc !== 'undefined') isProc = true;
        }
    } else if (phase === 'round_end') {
        // リザルト画面中 → 自分も同様にリザルト画面表示
        if (typeof handleRoundEnd === 'function') {
            handleRoundEnd(true);
        }
    } else {
        // play フェーズ（通常ターン）
        // 🌟 自分のターンでサーバーが残り時間を返してきていたら、
        //    既存の isResuming/sessionStorage 経由で startTimer に引き継ぐ
        const remaining = rejoinData.turn_timer_remaining;
        if (typeof turn !== 'undefined' && turn === 0 && typeof remaining === 'number' && remaining > 0) {
            const endTime = Date.now() + Math.round(remaining * 1000);
            try {
                sessionStorage.setItem(`timer_end_time_${currentSessionRoomId}`, endTime);
            } catch (e) { }
            if (typeof isResuming !== 'undefined') isResuming = true;
        }
        if (typeof isProc !== 'undefined') isProc = false;
        if (typeof checkT === 'function') {
            // 🌟 checkT は async。中で startTimer(timeDiscard, ...) を呼ぶ。
            //    isResuming フラグを事前にセットしてあるので、sessionStorage 経由で残り時間が反映される。
            //    ただし await で待つことで、checkT 完了後に念のためタイマー上書きで残り時間を確実に反映する。
            await checkT();
            // 🌟 安全のため、自分のターンならタイマーを残り秒数で再セット（フルタイマーになっている場合の保険）
            if (typeof turn !== 'undefined' && turn === 0 && typeof remaining === 'number' && remaining > 0) {
                // checkT 内ですでに startTimer が呼ばれているはず。残り秒数の方が短いなら上書き。
                // 現在のタイマー残り秒数を取得して、サーバーの remaining より長ければ上書き
                if (typeof timeLeft !== 'undefined' && timeLeft > remaining + 1) {
                    if (typeof stopTimer === 'function') stopTimer();
                    if (typeof startTimer === 'function') {
                        // 元のコールバックを保持できないので、シンプルに timeDiscard 用のオート打牌コールバックを再現
                        startTimer(remaining, () => {
                            // 時間切れ → ツモ切り
                            if (typeof drawnTile !== 'undefined' && drawnTile !== "" && typeof discard === 'function') {
                                discard(drawnTile, true, 'drawn');
                            } else if (typeof myHand !== 'undefined' && myHand.length > 0 && typeof discard === 'function') {
                                discard(myHand[myHand.length - 1], false, myHand.length - 1);
                            }
                        });
                    }
                }
            }
        }
    }
}

// 🌟 復帰時は WS の onopen での「初期state→第1交換開始」自動シーケンスを抑止する
let friendSkipInitialStateOnOpen = false;

// ==========================================
// 対局中のWebSocket接続
// ==========================================
function connectFriendGameWs() {
    const wsUrl = `ws://${window.location.host}/friend/ws/${friendRoomId}/${myPlayerIdx}`;
    console.log("[FRIEND] WS接続:", wsUrl);
    friendWs = new WebSocket(wsUrl);

    friendWs.onopen = () => {
        console.log("[FRIEND] WS接続成功。初期stateを取得します");
        // 🌟 復帰時は _resumeByPhase が UI を組んでいるので、初期stateフローはスキップ
        if (friendSkipInitialStateOnOpen) {
            friendSkipInitialStateOnOpen = false;
            console.log("[FRIEND] 復帰中のため fetchFriendInitialState はスキップ");
            return;
        }
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
        // 🌟 サーバー側で起動済みの交換タイマー残量に合わせて、クライアント間の表示ズレを抑える
        //    （reset_round 時に _start_charleston_timer が走っているので、ここに来る時点で
        //     既に1〜2秒経過していることがある）
        const csRemaining = state.charleston_timer_remaining;
        if (typeof csRemaining === 'number' && csRemaining > 0) {
            const endTime = Date.now() + Math.round(csRemaining * 1000);
            try {
                sessionStorage.setItem(`timer_end_time_${currentSessionRoomId}`, endTime);
            } catch (e) { }
            if (typeof isResuming !== 'undefined') isResuming = true;
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
        // 待機メッセージ
        const msgEl = document.getElementById('msg');
        if (msgEl) {
            msgEl.innerText = "待機中...";
            msgEl.className = "";
        }
        // 🌟 fetch は await しない（最後に決定した人の場合、レスポンスより前に
        // WS の charleston_complete が届くべきなのに、レスポンス完了が先になって
        // render が走り手牌が見えてしまうのを防ぐ）
        fetch(url, { cache: 'no-store' })
            .then(res => res.json())
            .then(result => console.log("[FRIEND] 提出結果:", result))
            .catch(e => {
                console.error("[FRIEND] 第1交換 提出失敗:", e);
                alert("交換の送信に失敗しました: " + e.message);
            });
        // 以降は WS で charleston_complete を待つ
    } catch (e) {
        console.error("[FRIEND] 第1交換 提出失敗:", e);
    }
}

// ==========================================
// 第1交換完了アニメーション
// ==========================================
async function handleCharlestonComplete(data) {
    console.log("[FRIEND] 第1交換完了:", data);

    // 🌟 修正: アニメーション「前」に safeUpdate しても render しない（手牌の更新は描画しない）
    // CPU戦と同じ挙動: アニメーション後にまとめて render する
    if (data.state && typeof safeUpdate === 'function') {
        safeUpdate(data.state);
    }

    // サイコロ・交換アニメーション（CPU戦の関数を流用）
    if (typeof showDiceAnimation === 'function') {
        await showDiceAnimation(data.dice, data.direction);
    }
    if (typeof playExchangeAnimation === 'function') {
        await playExchangeAnimation(data.direction, [true, true, true, true]);
    }

    // アニメ完了 → ここで初めて新しい手牌を描画
    if (typeof hideCpuTiles !== 'undefined') {
        for (let i = 0; i < 4; i++) hideCpuTiles[i] = 0;
    }
    if (typeof clearCharlestonStatus === 'function') clearCharlestonStatus();
    if (typeof render === 'function') render();
    if (typeof renderCPU === 'function') renderCPU();

    // 🌟 第2交換へ
    friendStartSecondCharleston();
}

// ==========================================
// 第2交換: 親から順に「参加？スキップ？」を聞く
// ==========================================
let friendSecondAskedCount = 0;          // 何人聞き終わったか（0〜4）
let friendSecondParticipating = [false, false, false, false]; // 各プレイヤーの回答
let friendMySecondCharlestonTiles = [];  // 自分が出した3枚（不成立時に戻す用）

function friendStartSecondCharleston() {
    console.log("[FRIEND] 第2交換 開始");
    friendSecondAskedCount = 0;
    friendSecondParticipating = [false, false, false, false];
    friendMySecondCharlestonTiles = [];

    if (typeof charlestonPhase !== 'undefined') charlestonPhase = true;
    if (typeof charlestonCount !== 'undefined') charlestonCount = 2;
    if (typeof exchangeSelection !== 'undefined') exchangeSelection = [];
    if (typeof clearCharlestonStatus === 'function') clearCharlestonStatus();

    // 🌟 全員、開始時点でチャールストンUI（タイトル）と手牌選択を有効化する
    // ただしボタンは自分の番が来るまで非表示
    const cUi = document.getElementById('charleston-ui');
    const cTitle = document.getElementById('c-title');
    if (cTitle) {
        cTitle.innerText = "第2交換 (Second Charleston)";
        cTitle.style.color = "#f1c40f";
    }
    if (cUi) {
        cUi.style.zIndex = "9999";
        cUi.style.display = "block";
    }
    const btn = document.getElementById('btn-exchange');
    if (btn) btn.style.display = "none";

    if (typeof render === 'function') render();

    friendAskNextPlayer();
}

// 自分が現在の質問対象かどうか
function friendIsMyTurnNow() {
    if (friendSecondAskedCount >= 4) return false;
    if (typeof dealer === 'undefined') return false;
    return ((dealer + friendSecondAskedCount) % 4) === 0;
}

// 次のプレイヤー（親から順）の番を進める
function friendAskNextPlayer() {
    if (friendSecondAskedCount >= 4) {
        // 全員回答済み → サーバーが自動的に処理を進めるので何もしない（待機）
        const msgEl = document.getElementById('msg');
        if (msgEl) { msgEl.innerText = "結果集計中..."; msgEl.className = ""; }
        return;
    }

    // dealer は「自分視点の相対値」（0=自分が親, 1=下家が親, ...）
    // 親から friendSecondAskedCount 番目に質問されるプレイヤーの相対値
    const currentAskerRel = (dealer + friendSecondAskedCount) % 4;

    if (currentAskerRel === 0) {
        // 自分の番 → UIを表示
        friendShowSecondCharlestonUI();
    } else {
        // 他人の番 → 待機メッセージ
        const msgEl = document.getElementById('msg');
        if (msgEl) {
            msgEl.innerText = `${getFriendPlayerName(currentAskerRel)} ...`;
            msgEl.className = "";
        }
        if (typeof isProc !== 'undefined') isProc = true;
    }
}

// 自分の番が来た時: ボタンを表示し、現在の選択状態に応じたラベルにする
function friendShowSecondCharlestonUI() {
    const msgEl = document.getElementById('msg');
    if (msgEl) { msgEl.innerText = "交換"; msgEl.className = "blink-text"; }

    // 現在の選択状態に応じてボタン表示（toggleExchange と同じロジック）
    const btn = document.getElementById('btn-exchange');
    if (btn) {
        btn.style.display = "block";
        if (typeof exchangeSelection !== 'undefined' && exchangeSelection.length === 3) {
            btn.innerHTML = "📤 決定 (3枚交換)";
            btn.className = "btn-act btn-blue";
        } else {
            btn.innerHTML = "⏭️ スルー (過)";
            btn.className = "btn-act btn-gray";
        }
    }

    if (typeof render === 'function') render();
    if (typeof isProc !== 'undefined') isProc = false; // 操作可能

    // タイマー（時間切れはスルー or 3枚選択していたら決定）
    if (typeof startTimer === 'function' && typeof timeExchange !== 'undefined') {
        startTimer(timeExchange, () => {
            // 時間切れ: 選択されたものをそのまま提出（3枚なら交換、それ以外はスルー）
            if (typeof execExchange === 'function') execExchange();
        });
    }
}

// game.js の execExchange (第2交換) から呼ばれる: 自分の回答をサーバーに送信
async function friendSubmitSecondCharleston(participate, t1, t2, t3) {
    console.log("[FRIEND] 第2交換 自分の回答:", participate, t1, t2, t3);

    // 自分が出した牌を記憶（不成立時に戻す用）※サーバーが戻すのでこちらでは特に処理しない
    if (participate) {
        friendMySecondCharlestonTiles = [t1, t2, t3];
    } else {
        friendMySecondCharlestonTiles = [];
    }

    // チャールストンUIを閉じる
    const cUi = document.getElementById('charleston-ui');
    if (cUi) cUi.style.display = "none";

    // 待機メッセージ
    const msgEl = document.getElementById('msg');
    if (msgEl) {
        msgEl.innerText = "待機中...";
        msgEl.className = "";
    }

    try {
        const params = new URLSearchParams({
            room_id: friendRoomId,
            player_idx: myPlayerIdx,
            participate: participate ? "true" : "false",
            t1: t1 || "", t2: t2 || "", t3: t3 || "",
            _t: Date.now()
        });
        // 🌟 fire-and-forget でレスポンスを待たない（WS broadcast を優先するため）
        fetch(`/friend/second_charleston_submit?${params}`, { cache: 'no-store' })
            .then(res => res.json())
            .then(result => console.log("[FRIEND] 第2交換 提出結果:", result))
            .catch(e => {
                console.error("[FRIEND] 第2交換 提出失敗:", e);
                alert("第2交換の送信に失敗しました: " + e.message);
            });
    } catch (e) {
        console.error("[FRIEND] 第2交換 提出失敗:", e);
        alert("第2交換の送信に失敗しました: " + e.message);
    }
}

// 第2交換完了のアニメーション処理
async function handleSecondCharlestonComplete(data) {
    console.log("[FRIEND] 第2交換完了:", data);

    // state 反映（render はまだ）
    if (data.state && typeof safeUpdate === 'function') {
        safeUpdate(data.state);
    }

    // 🌟 まず UI を全部閉じる（早期スキップ時に「3枚選んで」パネルが残るのを防ぐため、
    //    showCenterMessage の前に閉じる必要がある）
    const cUiEarly = document.getElementById('charleston-ui');
    if (cUiEarly) cUiEarly.style.display = "none";
    const btnExEarly = document.getElementById('btn-exchange');
    if (btnExEarly) btnExEarly.style.display = "none";
    if (typeof exchangeSelection !== 'undefined') exchangeSelection = [];
    if (typeof stopTimer === 'function') stopTimer();

    if (data.skipped) {
        // 不成立: メッセージ表示
        if (typeof showCenterMessage === 'function') {
            showCenterMessage(`参加者不足<br><span style="color:#e74c3c;font-size:24px;">第2交換はスキップされます</span>`);
            await new Promise(r => setTimeout(r, 2000));
            if (typeof hideCenterMessage === 'function') hideCenterMessage();
        }
    } else {
        // アニメーション
        if (typeof showDiceAnimation === 'function') {
            await showDiceAnimation(data.dice, data.direction);
        }
        if (typeof playExchangeAnimation === 'function') {
            // active_players（絶対座席）→ participants（視点回転後）
            const participants = [false, false, false, false];
            for (const abs of (data.active_players || [])) {
                const rel = (abs - myPlayerIdx + 4) % 4;
                participants[rel] = true;
            }
            await playExchangeAnimation(data.direction, participants);
        }
    }

    // 後処理
    if (typeof hideCpuTiles !== 'undefined') {
        for (let i = 0; i < 4; i++) hideCpuTiles[i] = 0;
    }
    if (typeof clearCharlestonStatus === 'function') clearCharlestonStatus();
    if (typeof charlestonPhase !== 'undefined') charlestonPhase = false;
    // 🌟 チャールストンUIを閉じる（早期スキップ時にUIが残るのを防止）
    const cUiClose = document.getElementById('charleston-ui');
    if (cUiClose) cUiClose.style.display = "none";
    const btnExClose = document.getElementById('btn-exchange');
    if (btnExClose) btnExClose.style.display = "none";
    // 選択状態もクリア
    if (typeof exchangeSelection !== 'undefined') exchangeSelection = [];
    // タイマー停止
    if (typeof stopTimer === 'function') stopTimer();

    if (typeof render === 'function') render();
    if (typeof renderCPU === 'function') renderCPU();

    // 🌟 対局開始: checkT() で親から順にツモ・打牌が進む
    if (typeof isProc !== 'undefined') isProc = false;
    if (typeof checkT === 'function') checkT();
}

// ==========================================
// WS受信イベントのディスパッチ
// ==========================================
function handleFriendEvent(data) {
    const type = data.type;
    console.log("[FRIEND] イベント受信:", type, data);

    if (type === "charleston_player_ready") {
        // 他のプレイヤーが3枚提出した → 中央に裏向き3枚を表示 + 手牌から3枚隠す
        const absIdx = data.player_idx;
        const relIdx = (absIdx - myPlayerIdx + 4) % 4;
        if (relIdx !== 0) {
            if (typeof showCharlestonStatus === 'function') {
                showCharlestonStatus(relIdx, true);
            }
            // 手牌から3枚分隠す（13→10枚に見せる）
            if (typeof hideCpuTiles !== 'undefined') {
                hideCpuTiles[relIdx] = 3;
            }
            if (typeof renderCPU === 'function') renderCPU();
        }
    } else if (type === "charleston_complete") {
        handleCharlestonComplete(data);
    } else if (type === "second_charleston_player_done") {
        // 他のプレイヤーが第2交換の回答を出した
        const absIdx = data.player_idx;
        const relIdx = (absIdx - myPlayerIdx + 4) % 4;
        friendSecondParticipating[absIdx] = !!data.participate;
        friendSecondAskedCount++;
        // 視覚的に「参加(裏3枚)」or「スキップ(過スタンプ)」を表示
        if (typeof showCharlestonStatus === 'function') {
            showCharlestonStatus(relIdx, !!data.participate);
        }
        if (relIdx !== 0 && data.participate && typeof hideCpuTiles !== 'undefined') {
            hideCpuTiles[relIdx] = 3;
        }
        if (typeof renderCPU === 'function') renderCPU();
        // 次の人に進める
        friendAskNextPlayer();
    } else if (type === "second_charleston_complete") {
        handleSecondCharlestonComplete(data);
    } else if (type === "friend_draw") {
        // 他人がツモした → state を反映して描画（手牌枚数 +1, 山牌 -1）
        if (data.state && typeof safeUpdate === 'function') safeUpdate(data.state);
        if (typeof render === 'function') render();
        if (typeof renderCPU === 'function') renderCPU();
        // ターンは進めない（打牌するまでは tsumo 中の表示）
    } else if (type === "friend_discard") {
        // 他人が打牌した → state を反映
        if (data.state && typeof safeUpdate === 'function') safeUpdate(data.state);
        if (typeof render === 'function') render();
        if (typeof renderCPU === 'function') renderCPU();

        // 🌟 演出中は checkT を呼ばない（演出後の handleFriendWin が責任を持って checkT する）
        if (friendWinAnimating) {
            console.log("[FRIEND] 和了演出中 → checkT 抑制");
            return;
        }

        const canAny = !!(data.can_ron || data.can_pon || data.can_kan || data.can_hanakan);

        if (canAny) {
            // 🌟 反応可能 → checkHumanReaction でボタン表示
            const discarderRel = (data.player_idx - myPlayerIdx + 4) % 4;
            if (typeof checkHumanReaction === 'function') {
                lastDiscardPlayer = discarderRel;
                lastT = data.tile;
                checkHumanReaction(discarderRel, data.tile);
            }
            if (typeof isProc !== 'undefined') isProc = true;
        } else if (data.pending_call) {
            // 🌟 自分は反応不可だが、他プレイヤーが副露猶予中 → checkT は呼ばず call_resolved/friend_win 待ち
            // （これを呼ぶと wallCount=0 時に handleRoundEnd が早期発動してしまう）
            console.log("[FRIEND] 他プレイヤー副露猶予中 → checkT 待機");
            if (typeof isProc !== 'undefined') isProc = true;
        } else {
            // 反応不可 + 副露猶予なし → 即 checkT
            if (typeof isProc !== 'undefined') isProc = false;
            if (typeof checkT === 'function') checkT();
        }
    } else if (type === "call_resolved") {
        // 副露猶予の結果通知 → state 反映して checkT
        if (data.state && typeof safeUpdate === 'function') safeUpdate(data.state);
        if (typeof render === 'function') render();
        if (typeof renderCPU === 'function') renderCPU();

        // 🌟 演出中は checkT を呼ばない
        if (friendWinAnimating) {
            console.log("[FRIEND] 和了演出中 → call_resolved の checkT 抑制");
            return;
        }

        if (typeof isProc !== 'undefined') isProc = false;
        // 既存のボタン群を念のため非表示にする
        document.querySelectorAll('.action-layer .btn-act').forEach(b => b.style.display = "none");
        const btnWin = document.getElementById('btn-win');
        if (btnWin) btnWin.style.display = "none";
        if (typeof checkT === 'function') checkT();
    } else if (type === "friend_win") {
        // 誰かが和了した（ロン or ツモ）
        handleFriendWin(data);
    } else if (type === "friend_meld") {
        // 副露成立（ポン・カン・花槓）
        handleFriendMeld(data);
    } else if (type === "friend_self_meld") {
        // 自分のターンの暗槓・暗花槓
        handleFriendSelfMeld(data);
    } else if (type === "friend_joker_swap") {
        // JokerSwap 成立
        handleFriendJokerSwap(data);
    } else if (type === "friend_haitei_skip") {
        // 🌟 海底牌スルー broadcast：実行者の位置に「過」スタンプを表示する
        // 発火元のクライアントは handleRoundEnd 内で showCallout 済みなのでスキップ
        if (data.player_idx !== myPlayerIdx) {
            const claimerRel = (data.player_idx - myPlayerIdx + 4) % 4;
            if (typeof showCallout === 'function') showCallout(claimerRel, "過");
        }
    } else if (type === "friend_round_end") {
        // 🌟 局終了 broadcast：海底スルーなど、自分自身は流局判定に到達しなかったプレイヤーも
        // ここで handleRoundEnd を発火させてリザルト画面に進める。
        // 発火元のクライアントは _handleRoundEndInProgress ガードにより二重実行されない。
        console.log("[FRIEND] 局終了 broadcast 受信");
        // 🌟 リザルト中の盤面公開（盤面を見るホバー）に向けて、全員の実手牌入り state を反映
        if (data.state && typeof safeUpdate === 'function') safeUpdate(data.state);
        if (typeof handleRoundEnd === 'function') {
            handleRoundEnd();
        }
    } else if (type === "friend_next_round") {
        // 次局へ: state を反映 → リザルト画面を閉じて新局の初期化
        console.log("[FRIEND] 次局へ broadcast");
        // 🌟 次局開始のタイミングで handleRoundEnd の二重実行ガードを解除
        if (typeof _handleRoundEndInProgress !== 'undefined') _handleRoundEndInProgress = false;
        if (data.state && typeof safeUpdate === 'function') safeUpdate(data.state);
        if (typeof render === 'function') render();
        if (typeof renderCPU === 'function') renderCPU();

        // リザルト画面と各種オーバーレイを閉じる
        const overlays = ['result-overlay', 'result-screen', 'achievement-toast-container'];
        overlays.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });

        // 河 / 副露 / 和了ゾーンをクリア
        for (let i = 0; i < 4; i++) {
            const river = document.getElementById(`river-${i}`);
            if (river) river.innerHTML = "";
            const meld = document.getElementById(`meld-${i}`);
            if (meld) meld.innerHTML = "";
            const winZone = document.getElementById(`win-zone-${i}`);
            if (winZone) {
                winZone.innerHTML = "";
                winZone.style.display = "none";
            }
        }

        // チャールストン開始
        if (typeof charlestonCount !== 'undefined') charlestonCount = 1;
        if (typeof isProc !== 'undefined') isProc = false;
        if (typeof startCharlestonSelection === 'function') startCharlestonSelection();
    } else if (type === "friend_game_end") {
        // 4局終了 → 全体終了 → ホーム画面へ
        console.log("[FRIEND] ゲーム終了:", data.total_scores);
        if (typeof returnToHomeGracefully === 'function') {
            returnToHomeGracefully();
        }
    } else if (type === "player_disconnected") {
        // 🔁 他プレイヤー切断 → 名前を赤文字に + 通知トースト
        const absIdx = data.player_idx;
        const relIdx = (absIdx - myPlayerIdx + 4) % 4;
        if (relIdx !== 0) {  // 自分は対象外
            disconnectedPlayers[relIdx] = true;
            const playerName = getFriendPlayerName(relIdx);
            showReconnectToast(`${playerName} が切断しました`, true);
            // 名前表示を更新
            if (typeof updateInfoUI === 'function') updateInfoUI();
        }
    } else if (type === "player_reconnected") {
        // 🔁 他プレイヤー再接続 → 名前を白に戻す + 通知トースト
        const absIdx = data.player_idx;
        const relIdx = (absIdx - myPlayerIdx + 4) % 4;
        if (relIdx !== 0) {
            disconnectedPlayers[relIdx] = false;
            const playerName = data.player_name || getFriendPlayerName(relIdx);
            showReconnectToast(`${playerName} が再接続しました`, false);
            if (typeof updateInfoUI === 'function') updateInfoUI();
        }
    } else if (type === "friend_stamp") {
        // 🌟 他プレイヤーからのスタンプ表示
        const absIdx = data.player_idx;
        const relIdx = (absIdx - myPlayerIdx + 4) % 4;
        if (relIdx !== 0 && typeof showStamp === 'function') {
            showStamp(relIdx, data.content);
        }
    }
}

// 🔁 切断/再接続のトーストを画面右から左へ流す（ニコニコ風）
function showReconnectToast(text, isDisconnect) {
    const area = document.getElementById('reconnect-toast-area');
    if (!area) return;
    const el = document.createElement('div');
    el.className = 'reconnect-toast' + (isDisconnect ? ' disconnect' : '');
    el.innerText = text;
    // 縦位置をランダムにずらして重なりを避ける（最大3レーン）
    const laneOffsets = [0, 60, 120];
    const offset = laneOffsets[Math.floor(Math.random() * laneOffsets.length)];
    el.style.top = offset + 'px';
    area.appendChild(el);
    // アニメ終了後に削除（8秒）
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 8100);
}

// ==========================================
// JokerSwap イベント
// ==========================================
async function handleFriendJokerSwap(data) {
    console.log("[FRIEND] JokerSwap:", data);
    if (data.state && typeof safeUpdate === 'function') safeUpdate(data.state);

    if (typeof render === 'function') render();
    if (typeof renderCPU === 'function') renderCPU();

    // 演出: 実行者位置に「JokerSwap」表示
    const claimerRel = (data.player_idx - myPlayerIdx + 4) % 4;
    if (typeof showCallout === 'function') showCallout(claimerRel, "JokerSwap");
    await new Promise(r => setTimeout(r, 800));

    if (typeof isProc !== 'undefined') isProc = false;
    if (typeof checkT === 'function') checkT();
}

// ==========================================
// 副露成立イベント（他人の捨て牌をポン/カン/花槓した）
// ==========================================
async function handleFriendMeld(data) {
    console.log("[FRIEND] 副露:", data);
    if (data.state && typeof safeUpdate === 'function') safeUpdate(data.state);

    // ボタン群を非表示
    document.querySelectorAll('.action-layer .btn-act').forEach(b => b.style.display = "none");
    const btnWin = document.getElementById('btn-win');
    if (btnWin) btnWin.style.display = "none";

    if (typeof render === 'function') render();
    if (typeof renderCPU === 'function') renderCPU();

    // 演出: 副露プレイヤー位置に表示
    const meldLabels = { pong: "碰", minkan: "明槓", hanakan: "花槓" };
    const label = meldLabels[data.meld_type] || data.meld_type;
    const claimerRel = (data.player_idx - myPlayerIdx + 4) % 4;
    if (typeof showCallout === 'function') showCallout(claimerRel, label);
    await new Promise(r => setTimeout(r, 800));

    if (typeof isProc !== 'undefined') isProc = false;
    if (typeof checkT === 'function') checkT();
}

// ==========================================
// 自分のターンの暗槓・暗花槓イベント
// ==========================================
async function handleFriendSelfMeld(data) {
    console.log("[FRIEND] 自家副露:", data);
    if (data.state && typeof safeUpdate === 'function') safeUpdate(data.state);

    if (typeof render === 'function') render();
    if (typeof renderCPU === 'function') renderCPU();

    // 演出
    const labels = { "暗槓": "暗槓", "暗花槓": "花槓", "加槓": "加槓", "加花槓": "花槓" };
    const label = labels[data.meld_type] || data.meld_type;
    const claimerRel = (data.player_idx - myPlayerIdx + 4) % 4;
    if (typeof showCallout === 'function') showCallout(claimerRel, label);
    await new Promise(r => setTimeout(r, 800));

    if (typeof isProc !== 'undefined') isProc = false;
    if (typeof checkT === 'function') checkT();
}

// ==========================================
// 和了演出
// ==========================================
// 🌟 演出中フラグ: 和了アニメーション中は他のイベントが checkT を呼ぶのを抑制
let friendWinAnimating = false;

// 🌟 和了演出を順番に処理するためのキュー
let friendWinQueue = [];

async function handleFriendWin(data) {
    console.log("[FRIEND] 和了:", data, "yaku:", data.yaku, "myPlayerIdx:", myPlayerIdx);

    // 既に演出中ならキューに積んで終了
    if (friendWinAnimating) {
        // state は最新化（手牌や河の整合性のため）
        if (data.state && typeof safeUpdate === 'function') safeUpdate(data.state);
        if (typeof render === 'function') render();
        if (typeof renderCPU === 'function') renderCPU();
        // 演出データだけ後でも実行できるようキューに保存
        friendWinQueue.push(data);
        console.log("[FRIEND] 演出中なのでキューに追加 (queue size:", friendWinQueue.length, ")");
        return;
    }
    friendWinAnimating = true;

    try {
        // 1件目を演出 + 後続をキューから順次処理
        let current = data;
        while (current) {
            if (current.state && typeof safeUpdate === 'function') safeUpdate(current.state);
            if (typeof render === 'function') render();
            if (typeof renderCPU === 'function') renderCPU();

            // ボタン群を非表示
            document.querySelectorAll('.action-layer .btn-act').forEach(b => b.style.display = "none");
            const btnWin = document.getElementById('btn-win');
            if (btnWin) btnWin.style.display = "none";

            // 演出: 勝者位置に「胡」「自摸」表示
            const winnerRel = (current.player_idx - myPlayerIdx + 4) % 4;
            const winText = (current.win_type === "ron") ? "胡" : "自摸";
            if (typeof showCallout === 'function') showCallout(winnerRel, winText);
            await new Promise(r => setTimeout(r, 800));

            // 役表示
            if (current.yaku && current.yaku.length > 0) {
                for (const y of current.yaku) {
                    if (typeof showCallout === 'function') showCallout(winnerRel, y);
                    await new Promise(r => setTimeout(r, 600));
                }
            }

            // 次のキュー要素へ
            current = friendWinQueue.shift() || null;
        }
    } finally {
        friendWinAnimating = false;
    }

    // アガリ放題: ターンを進めて続行
    if (typeof isProc !== 'undefined') isProc = false;
    if (typeof checkT === 'function') checkT();
}

// ==========================================
// 副露猶予への応答送信
// ==========================================
async function sendFriendCallAction(action) {
    try {
        const url = `/friend/call_action?room_id=${friendRoomId}&player_idx=${myPlayerIdx}&action=${action}&_t=${Date.now()}`;
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result = await res.json();
        console.log("[FRIEND] call_action 結果:", result);
    } catch (e) {
        console.error("[FRIEND] call_action 失敗:", e);
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