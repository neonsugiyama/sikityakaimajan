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
        // 待機メッセージ
        const msgEl = document.getElementById('msg');
        if (msgEl) {
            msgEl.innerText = "他のプレイヤーを待っています...";
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
            msgEl.innerText = `${getFriendPlayerName(currentAskerRel)} の回答を待っています...`;
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
        msgEl.innerText = "他のプレイヤーを待っています...";
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
    } else if (type === "friend_next_round") {
        // 次局へ: state を反映 → リザルト画面を閉じて新局の初期化
        console.log("[FRIEND] 次局へ broadcast");
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
    }
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