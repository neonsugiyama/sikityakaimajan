const sleep = ms => new Promise(res => setTimeout(res, ms / speedMult));

let currentWaits = [];
let myHand = [], myMelds = [], myWinTiles = [], turn = 0, isProc = false, lastT = "", justPonged = false;
let drawnTile = "", autoResumeTimer = null, lastDiscardPlayer = -1;
let wallCount = 0;
let currentRound = 1, dealer = 0, scores = [0, 0, 0, 0], totalScores = [0, 0, 0, 0];
let currentRoundSeasonDiscardCount = 0;
let charlestonCount = 1, charlestonPhase = false, exchangeSelection = [];
let secondCharlestonParticipating = [false, false, false, false];
let charlestonAskResults = [];
let askedCount = 0;
let humanSecondCharlestonTiles = [];
let hideCpuTiles = [0, 0, 0, 0];
let pendingIsJokerSwap = false, pendingIsRinshan = false, pendingIsMiaoshou = false;
let myAllHands = [], myAllMelds = [], myAllWinTiles = [], cpuTargets = [], cpuPersonalities = [];
// 🌟 追加：引く前からテンパイしていたかを記憶するフラグ
let isAlreadyTenpai = false;
let isAutoPlay = false;
// 🌟 追加：リロードからの再開中であることを示すフラグ
let isResuming = false;
let isResumingResult = false;
let isWelcomeHomeTest = false;
let charlestonDoneServer = false;        // 🌟 追加
let secondCharlestonDoneServer = false;  // 🌟 追加
let timerInterval = null;
let timeLeft = 0;
let maxTimeForTimer = 0;
let timerAction = null;
let currentTickAudio = null;
let selectedTileIndex = -1; // -1は「何も選択されていない」状態

// ==========================================
// 🚀 牌画像のプリロード（読み込み遅延・チラつき防止）
// ==========================================
const preloadedImages = []; // メモリ上に保持しておくための配列

window.addEventListener('DOMContentLoaded', () => {
    // SM（Sort Map）に登録されている全種類の牌の名前を取得
    const allTiles = Object.keys(SM);
    allTiles.push('ura'); // 裏向きの牌も追加しておく

    // 裏側でこっそり画像をロードしてブラウザに記憶（キャッシュ）させる
    allTiles.forEach(tileName => {
        const img = new Image();
        img.src = `images/${tileName}.png`;
        preloadedImages.push(img);
    });

    console.log(`[Preload] ${allTiles.length}種類の牌画像をキャッシュしました！`);
});

// ⏳ 持ち時間タイマーを開始し、0秒になったら指定のコールバック処理を実行する関数
function startTimer(seconds, timeoutCallback) {
    stopTimer();
    timeLeft = seconds;
    maxTimeForTimer = seconds;
    timerAction = timeoutCallback;

    console.log(`[タイマー処理] ⏱️ タイマーセット要求: ${seconds}秒`);

    // 🎓 レッスンモード中はタイマーを無効化し、「∞」を表示して待ち続ける
    if (currentGameMode === 'lesson') {
        const display = document.getElementById('timer-display');
        const secSpan = document.getElementById('timer-sec');
        display.style.display = "block";
        display.style.color = "#2ecc71";
        display.style.borderColor = "#2ecc71";
        display.style.boxShadow = "none";
        secSpan.innerText = "∞";
        return; // ここで処理を終了し、カウントダウン（setInterval）を起動させない！
    }

    if (isResuming) {
        const endTime = sessionStorage.getItem(`timer_end_time_${currentSessionRoomId}`);
        if (endTime) {
            const remaining = Math.ceil((parseInt(endTime) - Date.now()) / 1000);
            console.log(`[タイマー復元] 💾 記憶された終了時刻: ${endTime}, 現在時刻: ${Date.now()}`);
            console.log(`[タイマー復元] 🔍 算出された残り時間: ${remaining}秒`);

            if (remaining > 0 && remaining <= seconds) {
                timeLeft = remaining;
                console.log(`[タイマー復元] ✅ ${timeLeft}秒からタイマーを再開します。`);
            } else if (remaining <= 0) {
                timeLeft = 0;
                console.log(`[タイマー復元] 🚨 時間切れのため、0秒として処理します。`);
            }
        } else {
            console.log(`[タイマー復元] ⚠️ 終了時刻の記憶がないため、初期値(${seconds}秒)で開始します。`);
        }
        isResuming = false;
    } else {
        sessionStorage.setItem(`timer_end_time_${currentSessionRoomId}`, Date.now() + seconds * 1000);
    }

    const display = document.getElementById('timer-display');
    const secSpan = document.getElementById('timer-sec');
    display.style.display = "block";
    display.style.color = "#2ecc71";
    display.style.borderColor = "#2ecc71";
    display.style.boxShadow = "0 0 15px rgba(46, 204, 113, 0.5)";

    // すでにタイマーが0秒以下の場合は即座に実行
    if (timeLeft <= 0) {
        console.log(`[タイマー処理] ⚡ 残り時間が0秒以下のため、待機せず即座にアクションを実行します！ (isProc状態: ${isProc})`);
        secSpan.innerText = "0";
        display.style.color = "#e74c3c";
        display.style.borderColor = "#e74c3c";
        display.style.boxShadow = "0 0 20px rgba(231, 76, 60, 0.8)";

        let finalAction = timerAction;
        stopTimer();

        if (typeof finalAction === 'function') {
            setTimeout(() => {
                console.log(`[タイマー処理] 🚀 強制アクション発動！`);
                timeDiscard = Math.max(5, timeDiscard - 20);
                timeCall = Math.max(5, timeCall - 5);
                finalAction();
            }, 100);
        }
        return;
    }

    secSpan.innerText = timeLeft;

    let tickPlayed = false;
    if (timeLeft <= 5 && timeLeft > 0) {
        currentTickAudio = playSE('tick');
        tickPlayed = true;
    }

    timerInterval = setInterval(() => {
        if (isProc) return;
        timeLeft--;
        secSpan.innerText = timeLeft;

        if ((timeLeft <= 10 && maxTimeForTimer >= 20) || timeLeft <= 5) {
            display.style.color = "#e74c3c";
            display.style.borderColor = "#e74c3c";
            display.style.boxShadow = "0 0 20px rgba(231, 76, 60, 0.8)";
        }

        if (timeLeft <= 5 && timeLeft > 0 && !tickPlayed) {
            currentTickAudio = playSE('tick');
            tickPlayed = true;
        }

        if (timeLeft <= 0) {
            let finalAction = timerAction;
            stopTimer();
            if (isProc) return;

            console.log(`[タイマー処理] ⌛ 通常の時間切れ。アクションを実行します。`);
            timeDiscard = Math.max(5, timeDiscard - 20);
            timeCall = Math.max(5, timeCall - 5);

            if (typeof finalAction === 'function') {
                finalAction();
            }
        }
    }, 1000);
}

// ⏹️ 動作中の持ち時間タイマーを停止・破棄する関数
function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    timerAction = null;
    document.getElementById('timer-display').style.display = "none";

    if (currentTickAudio) {
        currentTickAudio.pause();
        currentTickAudio.currentTime = 0;
        currentTickAudio = null;
    }
}

function toggleAutoPlay() {
    isAutoPlay = !isAutoPlay;
    const btn = document.getElementById('btn-auto-play');

    if (isAutoPlay) {
        // ON状態（聴牌前でも緑色にする）
        btn.innerText = "オート(和了後): ON";
        btn.style.background = "#27ae60";
        btn.style.boxShadow = "0 3px #2ecc71";
        btn.classList.remove('auto-off'); // 🌟 これを追加

        // もしONにした瞬間にすでに聴牌・打牌番なら即座に実行を試みる
        triggerAutoPlayIfNeeded();
    } else {
        // OFF状態
        btn.innerText = "オート(和了後): OFF";
        btn.style.background = "#7f8c8d";
        btn.style.boxShadow = "0 3px #95a5a6";
        btn.classList.add('auto-off'); // 🌟 これを追加
    }
}

// 🌟 修正：プレイヤーがテンパイしているか（副露も考慮して）正確に判定する関数
function isPlayerTenpai() {
    // 手牌の枚数 + (鳴き回数 × 3) で仮想的な手牌枚数を計算
    let totalVirtualTiles = myHand.length + (myMelds.length * 3);

    if (totalVirtualTiles % 3 === 1) {
        // 13枚相当の時（他家のターン等）は、現在の待ちを見る
        return currentWaits.length > 0;
    } else {
        // 14枚相当の時（自分のツモ番）は「引く前からテンパイしていたか」の記憶を見る
        return isAlreadyTenpai;
    }
}

// 🤖 オートモード中、状況に応じて自動でツモ切りや鳴きスルーなどのボタンを押す関数
function triggerAutoPlayIfNeeded() {
    if (!isAutoPlay || isProc) return;

    let hasWon = myWinTiles.length > 0;
    if (!hasWon) return; // 🌟 1. 和了前はそもそも機能させない

    const msgText = document.getElementById('msg').innerText;

    if (turn === 0 && msgText.includes("打牌")) {
        // 🌟 2. 槓などのアクションが出たら一時停止
        if (activeSelfActionsCount > 0) return;

        const btnWin = document.getElementById('btn-win');
        let isWinVisible = btnWin.style.display === "block" || btnWin.style.display === "flex";

        if (isWinVisible) {
            // 🌟 3. 自摸ボタンが出れば押す
            btnWin.click();
        } else {
            // 🌟 3. 和了でなければ自摸切り
            if (drawnTile !== "") {
                discard(drawnTile, true, 'drawn');
            } else {
                let displayHand = [...myHand].sort((a, b) => SM[a] - SM[b]);
                discard(displayHand[displayHand.length - 1], false, displayHand.length - 1);
            }
        }
    } else if (msgText === "鳴き" || msgText === "胡！" || msgText.includes("チャンス")) {
        const btnKan = document.getElementById('btn-kan');
        const btnHanakan = document.getElementById('btn-hanakan');
        let isKanVisible = (btnKan && (btnKan.style.display === "block" || btnKan.style.display === "flex")) ||
            (btnHanakan && (btnHanakan.style.display === "block" || btnHanakan.style.display === "flex"));

        // 🌟 2. 槓ボタンが出たら一時停止（和了かどうかにかかわらず）
        if (isKanVisible) return;

        const btnWin = document.getElementById('btn-win');
        let isWinVisible = btnWin.style.display === "block" || btnWin.style.display === "flex";

        if (isWinVisible) {
            // 🌟 3. 胡ボタンが出れば押す
            btnWin.click();
        } else {
            // 🌟 3. 和了でなければスルー
            const btnSkip = document.getElementById('btn-skip');
            if (btnSkip && (btnSkip.style.display === "block" || btnSkip.style.display === "flex")) {
                btnSkip.click();
            }
        }
    }
}

// 📝 開発者用ログ画面とブラウザのコンソールにメッセージを出力する関数
function logMsg(msg, isError = false) {
    if (isError) console.error(msg);
    else console.log(msg);

    const logDiv = document.getElementById('debug-log');
    if (logDiv) {
        // 🌟 修正：開発モードONで、かつ「UI非表示モード」でない時だけ画面に出す！
        if (isDevMode && !isDebugUIHidden) {
            logDiv.style.display = "block";
        }
        const p = document.createElement('div');
        p.style.color = isError ? "#e74c3c" : "#2ecc71";
        p.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
        logDiv.appendChild(p);
        logDiv.scrollTop = logDiv.scrollHeight;
    }
}

// 💬 「ポン」「ロン」などの発声（カットイン文字）を画面に表示する関数
function showCallout(playerIdx, text) {
    const el = document.getElementById(`call-text-${playerIdx}`);
    if (!el) return;

    el.className = 'call-text';
    void el.offsetWidth;

    el.innerText = text;

    if (el.parentElement) {
        el.parentElement.style.setProperty('z-index', '9999', 'important');
    }
    el.style.setProperty('z-index', '9999', 'important');

    if (text === "天胡" || text === "地胡") {
        playSE('special_win');
        const flash = document.getElementById('flash-overlay');
        if (flash) {
            flash.classList.remove('flash-animate');
            void flash.offsetWidth;
            flash.style.animationDuration = `${1.5 / speedMult}s`;
            flash.classList.add('flash-animate');
        }
        const bigText = document.getElementById('big-yaku-text');
        if (bigText) {
            bigText.innerText = text;
            bigText.classList.remove('big-yaku-active');
            void bigText.offsetWidth;
            bigText.style.animationDuration = `${3.5 / speedMult}s`;
            bigText.classList.add('big-yaku-active');
        }
        el.innerText = "";
        return;
    }

    if (text.includes("Swap")) {
        el.classList.add('joker-swap-style');
        el.classList.add('call-active');
        el.style.animationDuration = `${1.0 / speedMult}s`;
        playSE(`jokerswap_${playerIdx}`);
        playSE(`jokerswap_se`);
    }
    else if (["妙手回春", "槍槓", "花天月地", "槓上開花"].includes(text)) {
        el.classList.add('special-yaku');
        el.style.animationDuration = `${1.5 / speedMult}s`;
        playSE('yaku');
    }
    else {
        el.classList.add('call-active');
        el.style.animationDuration = `${1.0 / speedMult}s`;
        if (text === "胡") playSE(`ron_${playerIdx}`);
        else if (text === "自摸") playSE(`zimo_${playerIdx}`);
        else if (text.includes("ポン") || text.includes("碰")) playSE(`pon_${playerIdx}`);
        else if (text.includes("カン") || text.includes("槓")) playSE(`kan_${playerIdx}`);
    }
}

// 📢 画面中央に大きめのお知らせメッセージを表示する関数
function showCenterMessage(html) {
    const el = document.getElementById('center-message');
    if (!el) return;
    el.innerHTML = html;
    el.style.zIndex = "9999";
    el.style.display = "block";
}

// 📢 画面中央のお知らせメッセージを消す関数
function hideCenterMessage() {
    const el = document.getElementById('center-message');
    if (el) el.style.display = "none";
}

// 🔄 チャールストン（交換）で、各プレイヤーが出した3枚の裏向き牌を表示する関数
function showCharlestonStatus(idx, isParticipating) {
    const el = document.getElementById(`c-status-${idx}`);
    if (isParticipating) {
        el.innerHTML = `<img class="tile" src="images/ura.png"><img class="tile" src="images/ura.png"><img class="tile" src="images/ura.png">`;
    } else {
        el.innerHTML = `<div class="guo-stamp">過</div>`;
    }
}

// 🧹 画面上のチャールストン交換牌をすべてクリアする関数
function clearCharlestonStatus() {
    for (let i = 0; i < 4; i++) document.getElementById(`c-status-${i}`).innerHTML = "";
}

// 📍 各プレイヤー（0~3）の画面上の座標（位置と回転）を返す関数
function getPlayerPos(idx) {
    const positions = [
        { left: '50%', top: '75%', transform: 'translate(-50%, -50%) scale(1)' },
        { left: '85%', top: '50%', transform: 'translate(-50%, -50%) rotate(-90deg) scale(0.8)' },
        { left: '50%', top: '25%', transform: 'translate(-50%, -50%) rotate(180deg) scale(0.8)' },
        { left: '15%', top: '50%', transform: 'translate(-50%, -50%) rotate(90deg) scale(0.8)' }
    ];
    return positions[idx];
}

// 🎲 チャールストンの交換方向を決めるサイコロアニメーションを表示する関数
async function showDiceAnimation(targetDice, directionMsg) {
    const diceEl = document.getElementById('dice-overlay');
    diceEl.style.zIndex = "9999";
    diceEl.style.display = "block";

    if (targetDice > 0) {
        playSE('dice');
        for (let i = 0; i < 15; i++) {
            let r = Math.floor(Math.random() * 6) + 1;
            diceEl.innerHTML = `🎲 ${r}`;
            await sleep(50);
        }
        diceEl.innerHTML = `🎲 ${targetDice}<br><span style="font-size:30px; color:#f1c40f;">${directionMsg}</span>`;
    } else {
        diceEl.innerHTML = `<span style="font-size:30px; color:#f1c40f;">${directionMsg}</span>`;
    }

    await sleep(1500);
    diceEl.style.display = "none";
}

// 🀄 3枚の牌が相手の場所へ飛んでいくチャールストン交換アニメーション関数
async function playExchangeAnimation(dirStr, participants) {
    for (let i = 0; i < 4; i++) {
        if (participants[i]) {
            document.getElementById(`c-status-${i}`).innerHTML = "";
        }
    }

    let activeIndices = [];
    for (let i = 0; i < 4; i++) {
        if (participants[i]) activeIndices.push(i);
    }

    let targetMap = {};
    if (dirStr.includes("下家(右)")) {
        for (let i = 0; i < 4; i++) targetMap[i] = (i + 1) % 4;
    } else if (dirStr.includes("対面(正面)")) {
        for (let i = 0; i < 4; i++) targetMap[i] = (i + 2) % 4;
    } else if (dirStr.includes("上家(左)")) {
        for (let i = 0; i < 4; i++) targetMap[i] = (i + 3) % 4;
    } else if (dirStr.includes("右回り")) {
        for (let i = 0; i < activeIndices.length; i++) targetMap[activeIndices[i]] = activeIndices[(i + 1) % activeIndices.length];
    } else if (dirStr.includes("左回り")) {
        for (let i = 0; i < activeIndices.length; i++) targetMap[activeIndices[i]] = activeIndices[(i + 2) % activeIndices.length];
    } else if (dirStr.includes("直接")) {
        targetMap[activeIndices[0]] = activeIndices[1];
        targetMap[activeIndices[1]] = activeIndices[0];
    } else {
        return;
    }

    const table = document.querySelector('.table');
    let packs = [];

    for (let i of activeIndices) {
        let pack = document.createElement('div');
        pack.className = 'flying-pack';
        pack.innerHTML = `<img class="tile" src="images/ura.png"><img class="tile" src="images/ura.png"><img class="tile" src="images/ura.png">`;

        let startPos = getPlayerPos(i);
        pack.style.left = startPos.left;
        pack.style.top = startPos.top;
        pack.style.transform = startPos.transform;

        table.appendChild(pack);
        packs.push({ el: pack, from: i, to: targetMap[i] });
    }

    await sleep(100);

    playSE('exchange');

    for (let p of packs) {
        let endPos = getPlayerPos(p.to);
        p.el.style.left = endPos.left;
        p.el.style.top = endPos.top;
        p.el.style.transform = endPos.transform;
    }

    await sleep(800);

    for (let p of packs) {
        p.el.remove();
    }
}

// 📦 サーバーから受け取った最新の盤面データで、手元の変数を安全に一括更新する関数
function safeUpdate(data) {
    if (data.player_hand !== undefined) myHand = data.player_hand;
    if (data.player_melds !== undefined) myMelds = data.player_melds;
    if (data.player_win_tiles !== undefined) myWinTiles = data.player_win_tiles;
    if (data.turn !== undefined) turn = data.turn;

    // 🌟 追加：自分のツモ番でリロードした時に、ツモ牌を右側に分離させる
    if (data.just_drawn !== undefined && data.last_drawn !== undefined) {
        if (data.just_drawn === 0) {
            drawnTile = data.last_drawn[0];
        } else {
            drawnTile = "";
        }
    } else if (data.drawn_tile !== undefined) {
        drawnTile = data.drawn_tile;
    }

    // 🌟 追加：他家が捨てた直後かどうかの判定用
    if (data.last_discard_info !== undefined) {
        lastDiscardPlayer = data.last_discard_info.player;
        lastT = data.last_discard_info.tile;
    }

    // 🚨 これが消えていたのが原因です！！（山札の枚数更新を復活）
    if (data.wall_count !== undefined) {
        wallCount = data.wall_count;
        updateWall(wallCount);
    }

    if (data.current_round !== undefined) currentRound = data.current_round;
    if (data.dealer !== undefined) dealer = data.dealer;
    if (data.scores !== undefined) scores = data.scores;
    if (data.total_scores !== undefined) totalScores = data.total_scores;

    // 🌟 追加：サーバーから現在のチャールストン進行状況を正確に受け取る
    if (data.charleston_done !== undefined) charlestonDoneServer = data.charleston_done;
    if (data.second_charleston_done !== undefined) secondCharlestonDoneServer = data.second_charleston_done;

    if (data.all_hands !== undefined) myAllHands = data.all_hands;
    if (data.all_melds !== undefined) myAllMelds = data.all_melds;
    if (data.all_win_tiles !== undefined) myAllWinTiles = data.all_win_tiles;
    if (data.cpu_targets !== undefined) cpuTargets = data.cpu_targets;
    if (data.cpu_personalities !== undefined) cpuPersonalities = data.cpu_personalities;

    // 🌟 修正：河（捨て牌）の復元時に、アニメーションクラス（discard-tedashi）を外す！
    if (data.discards !== undefined) {
        for (let i = 0; i < 4; i++) {
            const r = document.getElementById(`river-${i}`);
            if (r) {
                r.innerHTML = "";
                data.discards[i].forEach(t => {
                    const img = document.createElement('img');
                    img.className = 'tile'; // 🌟 アニメーションなしの素のクラスにする
                    img.src = `images/${t}.png`;

                    // 🌟 追加：リロード復元時も影とフチを消して平面で統一する
                    img.style.boxShadow = "none";
                    img.style.border = "none";

                    r.appendChild(img);
                });
            }
        }
    }

    // 🌟 修正：サーバーが勝者のデータを自分の変数に入れてしまうバグへの防御策
    // 全員分の公開情報 (all_*) から自分の分 (インデックス0) を強制的に同期します。
    if (myAllMelds && myAllMelds.length === 4) myMelds = myAllMelds[0] || [];
    if (myAllWinTiles && myAllWinTiles.length === 4) myWinTiles = myAllWinTiles[0] || [];
    if (myAllHands && myAllHands.length === 4 && myAllHands[0] && myAllHands[0][0] !== 'ura') {
        myHand = myAllHands[0];
    }

    updateInfoUI();
    updateWaitsButton();
}

// 📊 点差表示モードの管理用
let isDiffMode = false;
let diffModeTimer = null;

// ℹ️ 画面四隅のプレイヤー名、点数、レート、親マークなどを更新する関数
function updateInfoUI() {
    const roundTextEl = document.getElementById('round-text');
    if (roundTextEl) roundTextEl.innerText = `第 ${currentRound} 局`;

    for (let i = 0; i < 4; i++) {
        let nameEl = document.getElementById(`player-name-${i}`);
        let scoreEl = document.getElementById(`player-score-${i}`);

        let title = getRatingTitle(playerRatings[i]);
        let titleColor = playerRatings[i] >= 2000 ? "#e74c3c" : (playerRatings[i] >= 1800 ? "#f1c40f" : "#3498db");
        let rateStr = `<span style="font-size:12px; color:#bdc3c7;">(R:${playerRatings[i]})</span>`;

        let name = i === 0 ?
            `<span style="color:${titleColor}; font-size:12px;">【${title}】</span><br>${escapeHTML(playerStats.playerName)}` :
            `<span style="color:${titleColor}; font-size:12px;">【${title}】</span><br>CPU ${i}`;

        let isDealer = (dealer === i) ? `<span class="dealer-mark">🀄親</span>` : "";
        let aiTarget = (i !== 0 && cpuTargets[i] && isDevMode) ? `<br><span style="color:#2ecc71; font-size:12px;">[${cpuPersonalities[i]}] ${cpuTargets[i]}</span>` : "";

        nameEl.innerHTML = `${isDealer}${name}${aiTarget}`;

        // 🌟 修正：点差表示モード中でなければ通常の持ち点を表示
        if (!isDiffMode) {
            scoreEl.innerHTML = `持ち点: ${totalScores[i]}`;
            scoreEl.style.color = "#fff";
        }

        // 🌟 修正①：親の箱（pos-score-○）のZ-index自体を引き上げる！
        if (scoreEl.parentElement) {
            scoreEl.parentElement.style.zIndex = "1000";
        }

        // 🌟 修正②：点数加算アニメーションの「透明な箱」がクリックを吸収しないように無効化（除霊）！
        let rsEl = document.getElementById(`player-round-score-${i}`);
        if (rsEl) {
            rsEl.style.pointerEvents = "none";
        }

        // 🌟 対面が押せないバグを回避するため、透明レイヤーより最前面に強制配置！
        scoreEl.style.position = "relative";
        scoreEl.style.zIndex = "1001";
        scoreEl.style.pointerEvents = "auto";

        // スコア欄のクリックイベント設定
        scoreEl.style.cursor = "pointer";
        scoreEl.style.userSelect = "none";
        scoreEl.onclick = () => toggleScoreDiff(i);
    }
}

// 📊 点差表示の切り替えロジック
function toggleScoreDiff(baseIdx) {
    playSE('click');

    // すでに点差モードなら、タイマーをキャンセルして通常に戻す
    if (isDiffMode) {
        clearTimeout(diffModeTimer);
        isDiffMode = false;
        updateInfoUI();
        return;
    }

    isDiffMode = true;
    const baseScore = totalScores[baseIdx];

    for (let i = 0; i < 4; i++) {
        let scoreEl = document.getElementById(`player-score-${i}`);
        if (i === baseIdx) {
            // 基準プレイヤーはそのままの点数を表示
            scoreEl.innerHTML = `持ち点: ${totalScores[i]}`;
            scoreEl.style.color = "#f1c40f"; // 黄色でハイライト
        } else {
            // 🌟 修正：計算式を逆転（基準の点数 - 相手の点数）
            let diff = baseScore - totalScores[i];

            let diffStr = diff > 0 ? `+${diff}` : (diff === 0 ? `±0` : `${diff}`);
            let diffColor = diff > 0 ? '#2ecc71' : (diff < 0 ? '#e74c3c' : '#aaa');

            scoreEl.innerHTML = `<span style="font-size:12px; color:#aaa;">点差:</span> <span style="font-weight:bold;">${diffStr}</span>`;
            scoreEl.style.color = diffColor;
        }
    }

    // 3秒後に自動で元の表示に戻す
    if (diffModeTimer) clearTimeout(diffModeTimer);
    diffModeTimer = setTimeout(() => {
        isDiffMode = false;
        updateInfoUI();
    }, 3000);
}

// 📊 持ち点をクリックしたときに順位と全員の点差を表示するパネル
let scoreDiffTimer = null;
function showScoreDiff(baseIdx) {
    playSE('click');
    const panel = document.getElementById('score-diff-panel');
    if (!panel) return;

    // 現在の点数で降順（高い順）にソートして順位を出す
    let sortedIndices = [0, 1, 2, 3].sort((a, b) => totalScores[b] - totalScores[a]);

    let baseName = baseIdx === 0 ? playerStats.playerName : `CPU ${baseIdx}`;
    let baseScore = totalScores[baseIdx];

    // パネルのヘッダー部分
    let html = `<div style="text-align:center; font-weight:bold; color:#3498db; margin-bottom:10px; border-bottom:2px solid #3498db; padding-bottom:8px; font-size:18px;">
                    現在の順位と点差 <br><span style="font-size:13px; color:#bdc3c7;">(基準: ${baseName})</span>
                </div>`;

    // 各プレイヤーの行を生成
    sortedIndices.forEach((idx, rank) => {
        let name = idx === 0 ? playerStats.playerName : `CPU ${idx}`;
        let score = totalScores[idx];
        let diff = score - baseScore;

        let diffStr = diff > 0 ? `+${diff}` : (diff === 0 ? `±0` : `${diff}`);
        let diffColor = diff > 0 ? '#2ecc71' : (diff < 0 ? '#e74c3c' : '#aaa');

        // 基準にしたプレイヤー自身の行は点差をハイフンにする
        if (idx === baseIdx) {
            diffStr = "-";
            diffColor = "#fff";
        }

        // プレイヤー自身(0番)の行は黄色くハイライトして目立たせる
        let rowStyle = idx === 0
            ? 'color: #f1c40f; font-weight: bold; background: rgba(241, 196, 15, 0.15); border-radius: 4px;'
            : 'color: #fff;';

        html += `
            <div style="display:flex; justify-content:space-between; align-items:center; padding: 8px 10px; margin-bottom: 2px; ${rowStyle}">
                <span style="width: 110px;">${rank + 1}位: ${name}</span>
                <div style="display:flex; justify-content:flex-end; align-items:center; gap:15px; width: 140px;">
                    <span style="text-align:right; width: 60px;">${score}</span>
                    <span style="text-align:right; width: 65px; color:${diffColor}; font-size:16px;">${diffStr}</span>
                </div>
            </div>
        `;
    });

    html += `<div style="text-align:center; font-size:12px; color:#7f8c8d; margin-top:12px;">(画面クリックで閉じます)</div>`;

    panel.innerHTML = html;
    panel.style.display = 'flex';

    // 5秒後に自動で閉じる（邪魔にならないように）
    if (scoreDiffTimer) clearTimeout(scoreDiffTimer);
    scoreDiffTimer = setTimeout(() => {
        panel.style.display = 'none';
    }, 5000);
}

let currentNanikiru = null;

// 🀄 現在の待ち牌（または何切る）を計算し、「待ち確認」ボタンの状態を更新する関数
async function updateWaitsButton() {
    // 🌟 追加：リプレイ中は待ち牌の計算（サーバー通信）をスキップし、ボタンも隠す
    if (typeof isReplayMode !== 'undefined' && isReplayMode) {
        const btn = document.getElementById('btn-show-waits');
        if (btn) btn.style.display = 'none';
        return;
    }

    const waitsBtn = document.getElementById('btn-show-waits');
    if (!waitsBtn) return;

    if (!confWaitsHint) {
        waitsBtn.style.display = 'none';
        hideWaitsPanel();
        return;
    } else {
        waitsBtn.style.display = 'block'; // ONなら表示
    }

    if (charlestonPhase) {
        waitsBtn.disabled = true;
        waitsBtn.innerText = "ノーテン";
        return;
    }

    try {
        // 🌟 apiCallだと無限ループになるため、fetchに戻しつつ「room_id」を手動で付ける！
        const res = await fetch(`/get_waits?player_idx=0&room_id=${currentSessionRoomId}&_t=${new Date().getTime()}`, { cache: 'no-store' });
        const data = await res.json();

        currentWaits = (data.waits || []).filter(w => !["春", "夏", "秋", "冬"].includes(w));
        currentNanikiru = data.nanikiru || null;

        // 🌟🌟 修正：副露も加味して「13枚相当」の時にテンパイ状態を記憶する！
        let totalVirtualTiles = myHand.length + (myMelds.length * 3);
        if (totalVirtualTiles % 3 === 1) {
            isAlreadyTenpai = (currentWaits.length > 0);
        }

        const isTenpai = currentWaits.length > 0;
        const canListen = currentNanikiru && Object.keys(currentNanikiru).length > 0;

        if (isTenpai || canListen) {
            waitsBtn.disabled = false;
            waitsBtn.innerText = isTenpai ? "待ち牌確認" : "聴牌確認(何切る)";
            applyEffectiveHint();
        } else {
            waitsBtn.disabled = true;
            waitsBtn.innerText = "ノーテン";
            hideWaitsPanel();
        }
    } catch (e) {
        console.error("待ち牌取得エラー:", e);
    }
}

// 🌟 新規追加：手牌の中から「有効な打牌候補」を視覚的にハイライトする関数
function applyEffectiveHint() {
    // 手牌の画像をすべて取得
    const tiles = document.querySelectorAll('#hand-0 .tile');

    // 一旦すべてのアシスト装飾をリセット
    tiles.forEach(img => {
        img.style.boxShadow = "";
        img.style.border = "";
        img.style.transform = "";
        img.style.transition = "all 0.2s ease";
    });

    // 設定がOFF、または何切る候補データが無い場合はここで終了
    if (!confEffective || !currentNanikiru || Object.keys(currentNanikiru).length === 0) return;

    // 候補データがある場合、該当する牌を光らせる
    tiles.forEach(img => {
        // 画像のURL (images/1m.pngなど) から牌の名前 ('1m') を抽出
        let match = img.src.match(/images\/(.+?)\.png/);
        if (match && currentNanikiru[match[1]]) {
            // 切ると良い牌を緑色に光らせて少し浮かせる
            img.style.boxShadow = "0 0 15px #2ecc71";
            img.style.border = "2px solid #2ecc71";
            img.style.transform = "translateY(-8px)";
        }
    });
}

// 👁️ 「待ち牌確認」パネルを開閉し、待ち牌や「何切る」の候補を描画する関数
function showWaitsPanel() {
    const panel = document.getElementById('waits-panel');
    const list = document.getElementById('waits-list');

    if (panel.style.display === 'block') {
        hideWaitsPanel();
        return;
    }

    list.innerHTML = '';
    panel.style.zIndex = "9999";

    // 「何切る」モード（14枚の時）の表示処理
    if (currentNanikiru) {
        panel.style.minWidth = "400px";

        // 🌟 追加：切る牌の順番も「マンズ→ピンズ→ソウズ→字牌」に整える
        let sortedDiscards = Object.keys(currentNanikiru).sort((a, b) => SM[a] - SM[b]);

        // 🌟🌟 修正箇所： in currentNanikiru ではなく、上で作った sortedDiscards を使う！
        for (let discardTile of sortedDiscards) {
            const row = document.createElement('div');
            row.style.display = "flex";
            row.style.alignItems = "center";
            row.style.gap = "10px";
            row.style.padding = "8px";
            row.style.borderBottom = "1px solid #444";
            row.style.width = "100%";

            // 待ち牌の順番も綺麗にソートする！
            const waits = currentNanikiru[discardTile]
                .filter(w => !["春", "夏", "秋", "冬"].includes(w))
                .sort((a, b) => SM[a] - SM[b]);

            row.innerHTML = `
                        <div style="display:flex; flex-direction:column; align-items:center; min-width:50px;">
                            <span style="font-size:10px; color:#aaa;">打</span>
                            <img src="images/${discardTile}.png" style="width:24px; height:34px; border-radius:2px;">
                        </div>
                        <div style="font-size:20px; color:#e67e22;">→</div>
                        <div style="display:flex; flex-wrap:wrap; gap:5px; align-items:center;">
                            <span style="font-size:10px; color:#aaa;">待</span>
                            ${waits.map(w => `<img src="images/${w}.png" style="width:24px; height:34px; border-radius:2px;">`).join('')}
                        </div>
                    `;
            list.appendChild(row);
        }
    }
    // 通常の待ち表示（13枚の時）
    else if (currentWaits.length > 0) {
        panel.style.minWidth = "250px";

        // 待ち牌の順番を綺麗にソートする！
        let sortedWaits = [...currentWaits].sort((a, b) => SM[a] - SM[b]);

        sortedWaits.forEach(w => {
            let visible = 0;

            // 1. 自分の手牌をカウント
            myHand.forEach(t => { if (t === w) visible++; });

            // 2. 全員の副露（鳴き牌）をカウント
            if (myAllMelds) {
                myAllMelds.forEach(pm => {
                    if (pm) pm.forEach(m => { m.tiles.forEach(t => { if (t === w) visible++; }); });
                });
            }

            // 3. 全員のアガリ牌をカウント
            if (myAllWinTiles) {
                myAllWinTiles.forEach(wtList => {
                    if (wtList) wtList.forEach(t => { if (t === w) visible++; });
                });
            }

            // 4. 🌟 修正：全員の河（捨て牌）をカウント
            for (let i = 0; i < 4; i++) {
                const r = document.getElementById(`river-${i}`);
                if (r) {
                    Array.from(r.children).forEach(img => {
                        // 🚨 究極の安全策：どんなブラウザでも確実に日本語URLを解読する
                        const srcPath = decodeURIComponent(img.src);
                        if (srcPath.includes(`/${w}.png`)) {
                            visible++;
                        }
                    });
                }
            }

            let rem = Math.max(0, 4 - visible);
            const div = document.createElement('div');
            div.className = 'wait-item';
            div.innerHTML = `<img class="tile" src="images/${w}.png"><span>残り ${rem} 枚</span>`;
            list.appendChild(div);
        });
    }

    panel.style.display = 'block';
}

// 👁️ 「待ち牌確認」パネルを隠す関数
function hideWaitsPanel() {
    const wp = document.getElementById('waits-panel');
    if (wp) wp.style.display = 'none';

    // 🌟 チュートリアル中の場合、避難させていたメッセージパネルを「記憶した元の位置」に戻す
    if (typeof isIngameTutorial !== 'undefined' && isIngameTutorial) {
        const navPanel = document.getElementById('ingame-tutorial-nav');
        if (navPanel && navPanel.dataset.returnTop) {
            navPanel.style.top = navPanel.dataset.returnTop; // 記憶から復元
        }
        if (wp) {
            wp.classList.remove('tut-highlight');
            wp.style.removeProperty('z-index');
        }
    }
}

// 🛠️ サーバーにデバッグ用の特定の盤面（天和など）をセットさせる関数
async function loadDebugScenario(scenario) {
    if (!confirm("現在の局をリセットしてテストデータを読み込みますか？")) return;

    // 🌟 ここを追加！おかえりなさいボタンが押されたらフラグON
    isWelcomeHomeTest = (scenario === 'achieve_welcomehome');

    // テスト開始時にすべての画面（モーダル）を強制終了する
    document.getElementById('mypage-modal').style.display = 'none';
    document.getElementById('achievement-modal').style.display = 'none';
    document.getElementById('settings-modal').style.display = 'none';
    document.getElementById('howto-modal').style.display = 'none';
    document.getElementById('yaku-modal').style.display = 'none';
    document.getElementById('waits-panel').style.display = 'none';

    stopTimer();
    isProc = true;
    await apiCall('/debug_setup', { scenario: scenario });

    charlestonPhase = false;
    document.getElementById('charleston-ui').style.display = "none";
    document.getElementById('charleston-confirm-ui').style.display = "none";
    document.querySelectorAll('.action-layer .btn-act').forEach(b => b.style.display = "none");

    const btnHaitei = document.getElementById('btn-haitei-tsumo');
    const btnRyukyoku = document.getElementById('btn-ryukyoku');
    if (btnHaitei) btnHaitei.style.display = "none";
    if (btnRyukyoku) btnRyukyoku.style.display = "none";

    drawnTile = "";
    lastDiscardPlayer = -1;
    justPonged = false;
    pendingIsRinshan = false;
    pendingIsMiaoshou = false;

    hideCpuTiles = [0, 0, 0, 0];
    clearCharlestonStatus();

    for (let i = 0; i < 4; i++) {
        document.getElementById(`river-${i}`).innerHTML = "";
        document.getElementById(`meld-${i}`).innerHTML = "";
        document.getElementById(`win-zone-${i}`).innerHTML = "";
        document.getElementById(`win-zone-${i}`).style.display = "none";
    }

    // 🌟🌟 ここを追加！「おかえりなさい」の時だけチャールストンを開始する！
    if (isWelcomeHomeTest) {
        charlestonCount = 1;
        isProc = false;
        startCharlestonSelection();
        renderCPU();
    } else {
        // それ以外のテストはチャールストンをスキップして即打牌フェーズへ
        charlestonPhase = false;
        document.getElementById('charleston-ui').style.display = "none";
        document.getElementById('charleston-confirm-ui').style.display = "none";
        document.querySelectorAll('.action-layer .btn-act').forEach(b => b.style.display = "none");

        render(); renderCPU();
        isProc = false;
        checkT();
    }
}

// 🛠️ デバッグパネルのタブを切り替える関数
function switchDebugTab(evt, tabId) {
    // すべてのタブの中身を隠す
    const tabContents = document.getElementsByClassName("debug-tab-content");
    for (let i = 0; i < tabContents.length; i++) {
        tabContents[i].style.display = "none";
    }

    // すべてのタブボタンの色を元に戻す
    const tabLinks = document.getElementsByClassName("debug-tab-btn");
    for (let i = 0; i < tabLinks.length; i++) {
        tabLinks[i].classList.remove("active");
    }

    // クリックされたタブの中身を表示し、ボタンを赤く光らせる
    document.getElementById(tabId).style.display = "block";
    evt.currentTarget.classList.add("active");
}

// 🚀 ゲームの初期化通信を行い、最初のチャールストンを開始する関数
async function init() {
    logMsg("=== ゲーム起動 ===");
    await apiCall('/start', { cpu_level: confCpuLevel });
    sessionStorage.removeItem(`charleston_done_${currentSessionRoomId}`);

    // 🌟 追加：以前のゲームのリザルト状態が残っているとスキップされる原因になるため、確実に消去する
    sessionStorage.removeItem(`result_display_idx_${currentSessionRoomId}`);
    sessionStorage.removeItem(`result_end_time_${currentSessionRoomId}`);
    sessionStorage.removeItem(`result_phase_start_${currentSessionRoomId}`);

    // 🌟 修正：牌譜再生モードで隠した「退出」ボタンの非表示設定を解除し、元に戻す！
    const topExitBtn = document.getElementById('quick-exit-btn');
    const menuExitBtn = document.getElementById('sidebar-exit');
    if (topExitBtn) topExitBtn.style.removeProperty('display');
    if (menuExitBtn) menuExitBtn.style.removeProperty('display');

    charlestonCount = 1;
    startCharlestonSelection();
    render(); renderCPU();
}

// 🧱 画面左上の「山: 〇枚」の表示を更新する関数
function updateWall(c) { document.getElementById('wall-count').innerText = `山: ${c}`; }

// 🔄 第1・第2交換のUIを表示し、プレイヤーに交換する3枚を選ばせる関数
function startCharlestonSelection() {
    sessionStorage.setItem(`charleston_count_${currentSessionRoomId}`, "1"); // 🌟 追加
    charlestonPhase = true;
    exchangeSelection = [];
    updateStampVisibility();

    const cTitle = document.getElementById('c-title');
    if (charlestonCount === 1) {
        cTitle.innerText = "第1交換（換三張）";
        cTitle.style.color = "#3498db";
    } else {
        cTitle.innerText = "第2交換 (Second Charleston)";
        cTitle.style.color = "#f1c40f";
    }

    const cUi = document.getElementById('charleston-ui');
    cUi.style.zIndex = "9999";
    cUi.style.display = "block";

    document.getElementById('btn-exchange').style.display = "none";
    render();

    const msgEl = document.getElementById('msg');
    if (charlestonCount === 1) {
        msgEl.innerText = "交換";
        msgEl.className = "blink-text";
    } else {
        msgEl.innerText = "交換";
        msgEl.className = "";
    }

    startTimer(timeExchange, () => {
        let displayHand = [...myHand].sort((a, b) => SM[a] - SM[b]);
        exchangeSelection = [0, 1, 2];
        execExchange();
    });
}

// 👆 チャールストンで交換に出す牌の選択/解除を切り替える関数
function toggleExchange(idx) {
    if (charlestonCount === 2 && isProc) return; // 🌟 順番待ち中はクリックを無効化

    const pos = exchangeSelection.indexOf(idx);
    if (pos > -1) exchangeSelection.splice(pos, 1);
    else if (exchangeSelection.length < 3) exchangeSelection.push(idx);
    render();

    const btn = document.getElementById('btn-exchange');
    if (charlestonCount === 1) {
        // 🌟 第1交換：3枚選んだ時だけ「決定」ボタンを表示（スルーはさせない）
        if (exchangeSelection.length === 3) {
            btn.style.display = "block";
            btn.innerHTML = "📤 決定 (3枚交換)";
            btn.className = "btn-act btn-blue";
        } else {
            btn.style.display = "none";
        }
    } else {
        // 🌟 第2交換：常にボタンを表示し、3枚選んだら決定ボタンに化ける
        btn.style.display = "block";
        if (exchangeSelection.length === 3) {
            btn.innerHTML = "📤 決定 (3枚交換)";
            btn.className = "btn-act btn-blue";
        } else {
            btn.innerHTML = "⏭️ スルー (過)";
            btn.className = "btn-act btn-gray";
        }
    }
}

// 📤 選んだ3枚の牌をサーバーに送り、交換を実行する関数（第2交換の決定も兼ねる）
async function execExchange() {
    stopTimer();

    if (charlestonCount === 1) {
        // ================= 第1交換の処理 =================
        if (exchangeSelection.length !== 3) exchangeSelection = [0, 1, 2];
        isProc = true;
        document.getElementById('charleston-ui').style.display = "none";

        let displayHand = [...myHand].sort((a, b) => SM[a] - SM[b]);
        let t1 = displayHand[exchangeSelection[0]];
        let t2 = displayHand[exchangeSelection[1]];
        let t3 = displayHand[exchangeSelection[2]];

        let oldHandStr = [...myHand].sort((a, b) => SM[a] - SM[b]).join(',');

        exchangeSelection.sort((a, b) => b - a).forEach(idx => displayHand.splice(idx, 1));
        myHand = displayHand;
        exchangeSelection = [];

        showCharlestonStatus(0, true);
        render();

        hideCpuTiles = [0, 3, 3, 3];
        for (let i = 1; i <= 3; i++) showCharlestonStatus(i, true);
        renderCPU();

        const data = await apiCall('/charleston', { player_idx: 0, t1: t1, t2: t2, t3: t3 });

        if (isWelcomeHomeTest) {
            myHand = oldHandStr.split(',');
            isWelcomeHomeTest = false;
        }

        let newHandStr = [...myHand].sort((a, b) => SM[a] - SM[b]).join(',');
        if (oldHandStr === newHandStr && playerStats.welcomeHomeCount === 0) {
            playerStats.welcomeHomeCount = 1;
            saveGameData();
            showAchievementUnlock("おかえりなさい", "🎲");
        }

        await showDiceAnimation(data.dice, data.direction);
        await playExchangeAnimation(data.direction, [true, true, true, true]);

        hideCpuTiles = [0, 0, 0, 0];
        clearCharlestonStatus();
        render(); renderCPU();

        askedCount = 0;
        charlestonAskResults = [];
        secondCharlestonParticipating = [false, false, false, false];

        isProc = false;
        askNextSecondCharleston();

    } else {
        // ================= 第2交換の意思決定処理 =================
        isProc = true;
        document.getElementById('charleston-ui').style.display = "none";
        let willDo = exchangeSelection.length === 3;

        if (willDo) {
            let displayHand = [...myHand].sort((a, b) => SM[a] - SM[b]);
            // 🌟 3枚選んだ場合は一旦手牌から消して記憶しておく
            humanSecondCharlestonTiles = [
                displayHand[exchangeSelection[0]],
                displayHand[exchangeSelection[1]],
                displayHand[exchangeSelection[2]]
            ];
            exchangeSelection.sort((a, b) => b - a).forEach(idx => displayHand.splice(idx, 1));
            myHand = displayHand;
        } else {
            humanSecondCharlestonTiles = [];
        }

        exchangeSelection = [];
        render(); // 3枚出した後の手牌を描画
        processAskSecondCharleston(0, willDo); // 即座に自分の前に牌（またはスタンプ）を出す
    }
}

// ❓ 各プレイヤーに「第2チャールストンをやるか？」を順番に聞いていく関数
async function askNextSecondCharleston() {
    if (askedCount === 0) {
        sessionStorage.setItem(`charleston_count_${currentSessionRoomId}`, "2"); // 🌟 追加
        charlestonAskResults = [];
        clearCharlestonStatus();
        charlestonPhase = true; // 🌟 選択できるようにフェーズを戻す
        charlestonCount = 2;    // 🌟 第2交換モードに設定
        humanSecondCharlestonTiles = [];
    }

    if (askedCount === 4) {
        await sleep(500);
        finishAskSecondCharleston();
        return;
    }

    let currentAsker = (dealer + askedCount) % 4;

    if (currentAsker === 0) {
        // 🌟 人間の番：UIを表示して選択を促す
        document.getElementById('msg').innerText = "交換";
        const cUi = document.getElementById('charleston-ui');
        const cTitle = document.getElementById('c-title');
        cTitle.innerText = "第2交換 (Second Charleston)";
        cTitle.style.color = "#f1c40f";

        cUi.style.zIndex = "9999";
        cUi.style.display = "block";

        exchangeSelection = [];
        const btn = document.getElementById('btn-exchange');
        btn.style.display = "block";
        btn.innerHTML = "⏭️ スルー (過)";
        btn.className = "btn-act btn-gray";

        render(); // クリックできるように再描画
        isProc = false; // 操作を許可

        startTimer(timeExchange, () => {
            exchangeSelection = []; // 時間切れはスルー扱い
            execExchange();
        });
    } else {
        // 🌟 CPUの番：悩む演出の後に決断
        document.getElementById('msg').innerText = `CPU ${currentAsker} ...`;

        let willDo = false;
        try {
            // サーバーの「AIの脳みそ」に、今の自分の手牌なら参加すべきか質問する
            const res = await fetch(`/should_cpu_participate_second_charleston?cpu_idx=${currentAsker}&room_id=${currentSessionRoomId}&_t=${new Date().getTime()}`);
            const data = await res.json();
            if (data.participate !== undefined) {
                willDo = data.participate;
            } else {
                willDo = Math.random() < 0.5; // 万が一のエラー時は半々
            }
        } catch (e) {
            console.error("第2交換のCPU思考エラー:", e);
            willDo = Math.random() < 0.5;
        }

        await sleep(800 / speedMult); // 演出のタメ
        processAskSecondCharleston(currentAsker, willDo);
    }
}

// 🧠 参加/不参加の回答を記録し、即座に演出を出して次の人に回す関数
function processAskSecondCharleston(askerIdx, willDo) {
    secondCharlestonParticipating[askerIdx] = willDo;
    playSE('dahai'); // 決定した瞬間に音を鳴らす

    showCharlestonStatus(askerIdx, willDo);

    if (askerIdx !== 0 && willDo) {
        hideCpuTiles[askerIdx] = 3;
        renderCPU();
    }

    askedCount++;

    // 🌟 追加：早期終了の判定（不成立の確定）
    // 「既に参加決定した人数」＋「これから回答する残り人数」が1人以下なら、
    // ペア（2人以上）が作れる可能性がゼロになったため、その場で不成立として終了する
    let currentYesCount = secondCharlestonParticipating.filter(p => p).length;
    let remainingAskers = 4 - askedCount;

    if (currentYesCount + remainingAskers <= 1) {
        logMsg("参加者不足が確定したため、早期終了します。");
        // 0.8秒ほど待ってから終了（最後のCPUの「過」スタンプが見えるようにするため）
        setTimeout(() => {
            finishAskSecondCharleston();
        }, 800 / speedMult);
        return; // 次の人へは回さずに終了
    }

    isProc = true; // 次の人の処理までブロック
    askNextSecondCharleston();
}

// 🏁 全員の回答が出揃った後、第2チャールストンを実行するかスキップするか判定する関数
async function finishAskSecondCharleston() {
    let activeCount = secondCharlestonParticipating.filter(p => p).length;

    if (activeCount <= 1) {
        showCenterMessage(`参加者不足<br><span style="color:#e74c3c;font-size:24px;">第2交換はスキップされます</span>`);
        await sleep(2000);
        hideCenterMessage();

        // 🌟 参加ボタンを押していたのに不成立だった場合、隠した手牌を元に戻す
        if (secondCharlestonParticipating[0] && humanSecondCharlestonTiles.length === 3) {
            myHand.push(...humanSecondCharlestonTiles);
            humanSecondCharlestonTiles = [];
        }

        hideCpuTiles = [0, 0, 0, 0];
        sessionStorage.setItem(`charleston_done_${currentSessionRoomId}`, "true");
        clearCharlestonStatus();
        render(); renderCPU();

        // 🌟🌟 修正：サーバーにも「スキップしたよ（不成立だよ）」と通知して状態を同期させる！
        try {
            await apiCall('/second_charleston', {
                player_idx: 0, t1: "", t2: "", t3: "",
                p0: secondCharlestonParticipating[0], p1: secondCharlestonParticipating[1],
                p2: secondCharlestonParticipating[2], p3: secondCharlestonParticipating[3]
            });
        } catch (e) { }

        charlestonPhase = false;
        isProc = false;
        checkT();

    } else {
        // 🌟 人間が参加しているなら、記憶しておいた選んだ牌を取り出す
        let t1 = "", t2 = "", t3 = "";
        if (secondCharlestonParticipating[0] && humanSecondCharlestonTiles.length === 3) {
            t1 = humanSecondCharlestonTiles[0];
            t2 = humanSecondCharlestonTiles[1];
            t3 = humanSecondCharlestonTiles[2];
        }
        execSecondCharleston(t1, t2, t3);
    }
}

// 📤 プレイヤーの参加状況と選んだ牌をサーバーに送り、第2チャールストンを実行する関数
async function execSecondCharleston(t1 = "", t2 = "", t3 = "") {
    stopTimer();
    isProc = true;
    document.getElementById('charleston-ui').style.display = "none";

    // おかえりなさい実績用：交換前の手牌を算出
    let oldHandStr = [...myHand].sort((a, b) => SM[a] - SM[b]).join(',');
    if (t1 !== "") oldHandStr = [...myHand, t1, t2, t3].sort((a, b) => SM[a] - SM[b]).join(',');

    if (secondCharlestonParticipating[0] && t1 !== "") {
        let oldCharleston = playerStats.secondCharlestonCount;
        playerStats.secondCharlestonCount++;
        checkTieredAchievement("charleston", "チャールストンの愛し子", "🔄", oldCharleston, playerStats.secondCharlestonCount, [5, 50, 500, 2500]);
        saveGameData();
    }

    // 既に execExchange の時点で手牌から抜いてあるので、ここでは抜く処理を行わずリセットのみ
    exchangeSelection = [];

    const data = await apiCall('/second_charleston', {
        player_idx: 0, t1: t1, t2: t2, t3: t3,
        p0: secondCharlestonParticipating[0],
        p1: secondCharlestonParticipating[1],
        p2: secondCharlestonParticipating[2],
        p3: secondCharlestonParticipating[3]
    });

    // 🏆 おかえりなさい実績の判定
    if (secondCharlestonParticipating[0] && t1 !== "" && !data.direction.includes("不成立")) {
        let newHandStr = [...myHand].sort((a, b) => SM[a] - SM[b]).join(',');
        if (oldHandStr === newHandStr) {
            playerStats.welcomeHomeCount = 1;
            saveGameData();
            showAchievementUnlock("おかえりなさい", "🎲");
        }
    }

    if (data.direction.includes("不成立")) {
        showCenterMessage(`<span style="color:#e74c3c;font-size:24px;">${data.direction}</span>`);
        await sleep(1500);
        hideCenterMessage();
    } else {
        await showDiceAnimation(data.dice, data.direction);
        await playExchangeAnimation(data.direction, secondCharlestonParticipating);
    }

    hideCpuTiles = [0, 0, 0, 0];
    sessionStorage.setItem(`charleston_done_${currentSessionRoomId}`, "true");
    clearCharlestonStatus();
    humanSecondCharlestonTiles = []; // 役目終了

    render(); renderCPU();

    charlestonPhase = false;
    isProc = false;
    checkT();
}

// 🀄 自分の手牌（画像）を画面上に並べて描画する関数
function render() {
    try {
        myHand.sort((a, b) => SM[a] - SM[b]);
        const c = document.getElementById('hand-0'); c.innerHTML = "";

        let displayHand = [...myHand];
        let dTile = "";
        if (turn === 0 && drawnTile !== "" && displayHand.includes(drawnTile)) {
            displayHand.splice(displayHand.indexOf(drawnTile), 1);
            dTile = drawnTile;
        }

        displayHand.forEach((t, idx) => {
            const i = document.createElement('img'); i.className = 'tile'; i.src = `images/${t}.png`;
            i.id = `my-tile-${idx}`;

            if (charlestonPhase && exchangeSelection.includes(idx)) i.classList.add('selected-exchange');

            if (!charlestonPhase && selectedTileIndex === idx) i.classList.add('selected-discard');

            i.onclick = () => {
                // ① チャールストン中なら専用処理をしてすぐ終わる
                if (charlestonPhase) {
                    toggleExchange(idx);
                    return;
                }

                // ② すでにこの牌が浮いている（選択中）かどうかを「真っ先に」判定する
                if (selectedTileIndex === idx) {
                    // 【2回目のタップ（捨てる処理）】
                    // 実際に捨てるのは「自分の番(turn === 0)」で「処理中じゃない時(!isProc)」だけ！
                    if (!isProc && turn === 0) {
                        let msgText = document.getElementById('msg').innerText;
                        if (msgText === "鳴き" || msgText === "胡！" || msgText === "海底牌" || msgText === "槍槓チャンス") return;

                        if (myWinTiles.length > 0) {
                            logMsg("アガリ後は手牌を入れ替えられません！右端のツモ牌を捨ててください。", true);
                        } else {
                            selectedTileIndex = -1;
                            discard(t, false, idx);
                        }
                    }
                } else {
                    // 【1回目のタップ（浮かせる処理）】
                    // ここには turn === 0 の制限がないので、相手の番でも自由に浮かせられます！
                    selectedTileIndex = idx;
                    render();
                }
            };
            c.appendChild(i);
        });

        // 🌟 ツモ牌（右端に離れている牌）の処理
        if (dTile !== "") {
            const i = document.createElement('img'); i.className = 'tile'; i.src = `images/${dTile}.png`;
            i.id = `my-tile-drawn`;
            i.style.position = "absolute";
            i.style.left = "calc(100% + 15px)";
            i.style.top = "0";

            if (!charlestonPhase && selectedTileIndex === 'drawn') i.classList.add('selected-discard');

            i.onclick = () => {
                if (charlestonPhase) return;

                if (selectedTileIndex === 'drawn') {
                    // 【2回目のタップ（ツモ切り処理）】
                    if (!isProc && turn === 0) {
                        let msgText = document.getElementById('msg').innerText;
                        if (msgText === "鳴き" || msgText === "胡！" || msgText === "海底牌" || msgText === "槍槓チャンス") return;

                        selectedTileIndex = -1;
                        discard(dTile, true, 'drawn');
                    }
                } else {
                    // 【1回目のタップ（浮かせる処理）】
                    selectedTileIndex = 'drawn';
                    render();
                }
            };
            c.appendChild(i);
        }

        renderMelds(0);
        renderWinTiles(0);
        applyEffectiveHint();

    } catch (e) {
        logMsg(`[描画エラー] ${e.message}`, true);
    }
}

// 🤖 CPU3人の手牌（裏向き・または開発者モードの表向き）を描画する関数
function renderCPU() {
    for (let i = 1; i <= 3; i++) {
        const c = document.getElementById(`hand-${i}`); c.innerHTML = "";
        let cpuHand = [...(myAllHands[i] || [])]; // 元データを壊さないようコピー

        let limit = cpuHand.length - (hideCpuTiles[i] || 0);
        let tilesToRender = cpuHand.slice(0, limit);

        let drawnTileImg = null;
        // ツモ番（14枚目がある）なら最後の一枚を切り離す
        if (limit % 3 === 2) {
            drawnTileImg = tilesToRender.pop();
        }

        // 🌟 修正：下家(1)と対面(2)の手牌の並びを反転させる（昇順を維持するため）
        if (i === 1 || i === 2) {
            tilesToRender.reverse();
        }

        // 基本の手牌を描画
        tilesToRender.forEach(t => {
            const img = document.createElement('img');
            img.className = 'tile';
            img.src = isDevMode ? `images/${t}.png` : 'images/ura.png';

            // 🌟 修正：対面(i=2)のみ向きを上下逆（180度回転）にする
            if (i === 2) {
                img.style.transform = 'rotate(180deg)';
            }

            c.appendChild(img);
        });

        // 🌟 修正：ツモ牌の配置を「各CPUの右手側（自然な位置）」に修正
        if (drawnTileImg) {
            const img = document.createElement('img');
            img.className = 'tile';
            img.src = isDevMode ? `images/${drawnTileImg}.png` : 'images/ura.png';
            img.style.position = 'absolute';
            img.style.margin = '0';

            if (i === 1) {
                // 下家：手牌の「下（彼らにとっての右）」に配置
                img.style.top = 'calc(100% + 10px)';
                img.style.left = '0';
            } else if (i === 2) {
                // 対面：手牌の「右（彼らにとっての右）」に配置
                img.style.left = 'calc(100% + 15px)';
                img.style.top = '0';
                img.style.transform = 'rotate(180deg)';
            } else if (i === 3) {
                // 上家：手牌の「上（彼らにとっての右）」に配置
                img.style.bottom = 'calc(100% + 10px)';
                img.style.left = '0';
            }
            c.appendChild(img);
        }

        renderMelds(i);
        renderWinTiles(i);
    }

    // 原因がわかるように、正常に描画されたことをコンソールに出力
    console.log("[DEBUG 描画] CPUの手牌描画を更新しました（下家・対面の反転適用済み）");
}

// 🀄 指定プレイヤーの鳴き牌（ポン・カン）を描画する関数
function renderMelds(idx) {
    const m = document.getElementById(`meld-${idx}`); m.innerHTML = "";
    let melds = (idx === 0) ? myMelds : (myAllMelds[idx] || []);
    melds.forEach(meld => {
        if (!meld || !Array.isArray(meld.tiles)) return;
        const g = document.createElement('div'); g.className = 'meld-group';

        let isHidden = meld.is_hidden === true || meld.is_hidden === "true";

        meld.tiles.forEach((t, tileIdx) => {
            const i = document.createElement('img'); i.className = 'tile';

            // 🌟 修正箇所：自分の暗槓は常に「両端が裏」になるように条件を整理
            if (idx !== 0 && isHidden && !isDevMode) {
                // CPUの伏せ牌（または暗槓）は、開発者モードでなければ全部裏
                i.src = 'images/ura.png';
            } else if (meld.type === 'ankan') {
                // 自分（または開発者モード時のCPU）の暗槓は、常に両端を裏にする
                if (tileIdx === 0 || tileIdx === 3) i.src = 'images/ura.png';
                else i.src = `images/${t}.png`;
            } else {
                // ポン・明槓・加槓は全部表
                i.src = `images/${t}.png`;
            }

            // 🌟 修正：対面(idx=2)の副露牌を上下逆にする
            if (idx === 2) {
                i.style.transform = 'rotate(180deg)';
            }

            g.appendChild(i);
        });
        m.appendChild(g);
    });
}

// 🏆 アガリ牌（ロン・ツモした牌）を専用ゾーンに描画する関数
function renderWinTiles(idx) {
    const wz = document.getElementById(`win-zone-${idx}`); wz.innerHTML = "";
    let winTiles = (idx === 0) ? myWinTiles : (myAllWinTiles[idx] || []);
    if (winTiles.length === 0) {
        wz.style.display = "none";
        return;
    }
    wz.style.display = "flex";

    winTiles.forEach((t, tIdx) => {
        const i = document.createElement('img'); i.className = 'tile'; i.src = `images/${t}.png`;

        if (idx === 0 || idx === 1) {
            i.style.zIndex = 1000 + tIdx;
        }

        // 🌟 追加：和了ゾーンの牌も影とフチを消して平面で統一する
        i.style.boxShadow = "none";
        i.style.border = "none";

        // 🌟 修正：対面(idx=2)の和了牌を上下逆にする
        if (idx === 2) {
            i.style.transform = 'rotate(180deg)';
        }

        wz.appendChild(i);
    });
}

// 🕹️ ターンの持ち主を判定し、自分の番ならアクションボタン（打牌やツモ等）を表示する関数
async function checkT() {
    isProc = true;

    let totalVirtualTiles = myHand.length + (myMelds.length * 3);
    let isPlayerDrawPhase = (totalVirtualTiles % 3 === 1);

    console.log(`[処理順確認] ターン判定開始 -> 現在のターン: ${turn === 0 ? "あなた" : "CPU " + turn}, 山札残り: ${wallCount}枚, 自分の手牌相当: ${totalVirtualTiles}枚`);

    // 🌟 全員の光を一旦消す
    for (let i = 0; i < 4; i++) {
        const scoreEl = document.getElementById(`player-score-${i}`);
        if (scoreEl) scoreEl.classList.remove('active-turn');
    }

    // 🌟 修正：チャールストン（交換フェーズ）中「ではない」時だけ光らせる！
    if (!charlestonPhase) {
        const activescoreEl = document.getElementById(`player-score-${turn}`);
        if (activescoreEl) activescoreEl.classList.add('active-turn');
    }

    document.querySelectorAll('.action-layer .btn-act').forEach(b => b.style.display = "none");
    resetActionBtnPool();

    const btnHaitei = document.getElementById('btn-haitei-tsumo');
    const btnRyukyoku = document.getElementById('btn-ryukyoku');
    if (btnHaitei) btnHaitei.style.display = "none";
    if (btnRyukyoku) btnRyukyoku.style.display = "none";

    if (wallCount === 0 && ((turn === 0 && isPlayerDrawPhase) || turn !== 0)) {
        console.log(`[処理順確認] 🛑 山札が0枚のため、これ以上ターンを回さずに流局（または終了）処理へ移行します`);
        handleRoundEnd();
        return;
    }

    if (turn === 0) {
        if (!isPlayerDrawPhase) {
            const msgEl = document.getElementById('msg');
            msgEl.innerText = "↓打牌↓";
            msgEl.className = "blink-text";

            // 🌟🌟 修正：サーバーへの確認通信を完全に並列化し、結果のデータだけを待つ
            let canWin = false;
            let canMeld = false;

            await Promise.all([
                checkSelfMelds().then(res => canMeld = res),
                (!justPonged) ? checkWinPossible().then(res => canWin = res) : Promise.resolve(false)
            ]);

            // 🌟🌟 修正：通信が「両方とも」終わってから、一斉にボタンを描画する！（ズレ消滅）
            resetActionBtnPool(); // プールをリセット

            // 先にカンなどの副露ボタンを生成（ここで activeSelfActionsCount が確定する）
            if (canMeld) {
                renderSelfMeldsMenu();
            }

            // 次にツモボタンを生成
            const btnWin = document.getElementById('btn-win');
            if (canWin) {
                let winTile = drawnTile !== "" ? drawnTile : myHand[myHand.length - 1];
                const getImg = (t) => `<img src="images/${t}.png" style="height: 28px; border-radius: 2px; box-shadow: 1px 1px 3px rgba(0,0,0,0.5); vertical-align: middle;">`;

                btnWin.className = 'btn-act btn-red';
                btnWin.innerHTML = `自摸 ${getImg(winTile)}`;
                btnWin.onclick = () => execTsumo();

                // 💥 古い「オートONならボタンを隠す」バグを完全削除。常に表示する。
                btnWin.style.display = "flex";
            } else {
                btnWin.style.display = "none";
            }

            let shouldAlert = false;
            let hasWon = myWinTiles.length > 0;

            if (btnWin.style.display === "block" || btnWin.style.display === "flex" || activeSelfActionsCount > 0) {
                shouldAlert = true;
                if (isAutoPlay && hasWon && activeSelfActionsCount === 0) {
                    shouldAlert = false; // オートで処理される場合はアラート音を消す
                }
            }
            if (shouldAlert) {
                playSE('alert');
            }

            isProc = false;

            let autoActed = false;
            if (isAutoPlay && hasWon) {
                let isWinVisible = btnWin.style.display === "block" || btnWin.style.display === "flex";

                // 🌟 2. 槓などのアクションボタンが出ていれば一時停止
                if (activeSelfActionsCount > 0) {
                    showCenterMessage(`<span style="color:#f39c12;font-size:24px;">アクション可能なため<br>オート進行を一時待機します</span>`);
                    setTimeout(hideCenterMessage, 2500);
                } else if (isWinVisible) {
                    // 🌟 3. 自摸ボタンが出ていれば押す
                    isProc = true;
                    setTimeout(() => { isProc = false; btnWin.click(); }, 600 / speedMult);
                    autoActed = true;
                } else {
                    // 🌟 3. 和了でなければ自摸切り
                    isProc = true;
                    setTimeout(() => {
                        isProc = false;
                        if (drawnTile !== "") {
                            discard(drawnTile, true, 'drawn');
                        } else {
                            let displayHand = [...myHand].sort((a, b) => SM[a] - SM[b]);
                            discard(displayHand[displayHand.length - 1], false, displayHand.length - 1);
                        }
                    }, 600 / speedMult);
                    autoActed = true;
                }
            }

            if (!autoActed) {
                startTimer(timeDiscard, () => {
                    if (drawnTile !== "") {
                        discard(drawnTile, true, 'drawn');
                    } else {
                        let displayHand = [...myHand].sort((a, b) => SM[a] - SM[b]);
                        discard(displayHand[displayHand.length - 1], false, displayHand.length - 1);
                    }
                });
            }

        } else {
            if (wallCount === 1) {
                document.getElementById('msg').className = "";
                document.getElementById('msg').innerText = "海底牌";
                if (btnHaitei) btnHaitei.style.display = "block";
                if (btnRyukyoku) btnRyukyoku.style.display = "block";

                playSE('alert');
                isProc = false;

                startTimer(timeCall, () => {
                    if (btnRyukyoku) btnRyukyoku.click();
                });
                return;
            }

            document.getElementById('msg').className = "";
            document.getElementById('msg').innerText = "ツモ...";

            setTimeout(() => {
                isProc = false;
                draw();
            }, 500 / speedMult);
        }
    } else {
        document.getElementById('msg').className = "";
        document.getElementById('msg').innerText = `CPU ${turn}...`;

        if (wallCount > 0) {
            playSE('tsumo');
            const c = document.getElementById(`hand-${turn}`);
            const img = document.createElement('img');
            img.className = 'tile';
            img.src = 'images/ura.png';

            img.style.position = 'absolute';
            img.style.margin = '0';

            if (turn === 1) { img.style.bottom = 'calc(100% + 10px)'; img.style.left = '0'; }
            if (turn === 2) { img.style.right = 'calc(100% + 15px)'; img.style.top = '0'; img.style.transform = 'rotate(180deg)'; }
            if (turn === 3) { img.style.top = 'calc(100% + 10px)'; img.style.left = '0'; }

            c.appendChild(img);
            updateWall(wallCount - 1);
        }

        setTimeout(cpu, 1000 / speedMult);
    }
}

// ==========================================
// 🌟 自分のアクションボタン制御（オブジェクトプール方式）
// ==========================================
let activeSelfActionsCount = 0;

// ボタンを全て隠してリセットする関数
function resetActionBtnPool() {
    for (let i = 0; i < 10; i++) {
        let btn = document.getElementById(`btn-self-${i}`);
        if (btn) {
            btn.style.display = 'none';
            btn.onclick = null;
        }
    }
    activeSelfActionsCount = 0;
}

// 空いているボタンを取り出して色と文字を設定する関数
function setupActionBtn(html, cls, onClick) {
    let btn = document.getElementById(`btn-self-${activeSelfActionsCount}`);
    if (!btn) return; // 万が一足りなくなった場合は安全に無視

    btn.className = `btn-act ${cls}`;
    btn.innerHTML = html;
    btn.style.display = 'flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
    btn.style.gap = '5px';
    btn.onclick = onClick;

    activeSelfActionsCount++;
}

let currentValidMelds = [];

// 🔍 自分のツモ番で可能な鳴き（暗槓・加槓など）があるかサーバーにデータだけ確認する関数
async function checkSelfMelds() {
    if (wallCount === 0) return false;
    try {
        const data = await apiCall('/get_valid_self_melds', { player_idx: 0 });
        if (data.valid_melds && data.valid_melds.length > 0) {
            currentValidMelds = data.valid_melds;
            return true; // 鳴きが可能なら true を返す
        }
    } catch (e) {
        console.error("Self meld validation failed:", e);
    }
    currentValidMelds = [];
    return false;
}

// 🎛️ 可能な暗槓や加槓をグループ化して、アクションボタンとして並べる関数
function renderSelfMeldsMenu() {
    resetActionBtnPool();

    let melds = [...currentValidMelds];
    melds.sort((a, b) => {
        let diff = SM[a.tile] - SM[b.tile];
        if (diff !== 0) return diff;
        if (a.season && b.season) return SM[a.season] - SM[b.season];
        return 0;
    });

    let groups = {};
    melds.forEach(vm => {
        if (justPonged && (vm.type === "暗槓" || vm.type === "加槓")) return;

        let key = `${vm.type}_${vm.tile}`;
        if (!groups[key]) {
            groups[key] = { type: vm.type, tile: vm.tile, seasons: [], original: vm };
        }
        if (vm.season) groups[key].seasons.push(vm.season);
    });

    const getImg = (tileName) => `<img src="images/${tileName}.png" style="height: 28px; border-radius: 2px; box-shadow: 1px 1px 3px rgba(0,0,0,0.5);">`;

    Object.values(groups).forEach(g => {
        if (g.type === "暗槓") {
            setupActionBtn(`槓 ${getImg(g.tile)} <span style="font-size:14px;">(選択)</span>`, 'btn-purple', () => renderAnkanSubMenu(g.tile));
        } else if (g.type === "加槓" || g.type === "JokerSwap") {
            let btnClass = g.type.includes("槓") ? 'btn-blue' : 'btn-purple';
            let label = g.type === "JokerSwap" ? "Joker Swap" : "槓";
            setupActionBtn(`${label} ${getImg(g.tile)}`, btnClass, () => {
                if (g.type === "JokerSwap") execJokerSwap(g.tile, g.original.season, g.original.target_idx);
                else execSelfMeld(g.type, g.tile, '');
            });
        } else {
            let btnClass = 'btn-act btn-blue';
            let btnLabel = "花槓";

            if (g.seasons.length === 1) {
                setupActionBtn(`${btnLabel} ${getImg(g.tile)}${getImg(g.seasons[0])}`, 'btn-blue', () => execSelfMeld(g.type, g.tile, g.seasons[0]));
            } else {
                setupActionBtn(`${btnLabel} ${getImg(g.tile)} <span style="font-size:14px;">(選択)</span>`, 'btn-green', () => renderSelfMeldsSubMenu(g.type, g.tile, g.seasons));
            }
        }
    });
}

// 🎛️ 複数の花牌から昇格させるものを選ぶ「サブメニュー」を描画する関数
function renderSelfMeldsSubMenu(type, tile, seasons) {
    resetActionBtnPool();
    const getImg = (tileName) => `<img src="images/${tileName}.png" style="height: 28px; border-radius: 2px; box-shadow: 1px 1px 3px rgba(0,0,0,0.5);">`;

    setupActionBtn(`◀ 戻る`, 'btn-gray', () => renderSelfMeldsMenu());

    let btnClass = 'btn-blue';
    seasons.forEach(s => {
        let btnLabel = "花槓";
        setupActionBtn(`${btnLabel} ${getImg(tile)}${getImg(s)}`, 'btn-blue', () => execSelfMeld(type, tile, s));
    });
}

// 🎛️ 暗槓の際、「完全に伏せる」か「両端だけ裏返す」かを選ぶメニューを描画する関数
function renderAnkanSubMenu(tile) {
    resetActionBtnPool();
    const getImg = (tileName) => `<img src="images/${tileName}.png" style="height: 28px; border-radius: 2px; box-shadow: 1px 1px 3px rgba(0,0,0,0.5);">`;

    setupActionBtn(`◀ 戻る`, 'btn-gray', () => renderSelfMeldsMenu());

    setupActionBtn(`完全に伏せる ${getImg('ura')}${getImg('ura')}${getImg('ura')}${getImg('ura')}`, 'btn-purple', () => execSelfMeld('暗槓', tile, '', true));

    setupActionBtn(`通常通り ${getImg('ura')}${getImg(tile)}${getImg(tile)}${getImg('ura')}`, 'btn-blue', () => execSelfMeld('暗槓', tile, '', false));
}

// 🏆 現在の手牌でアガれるか（役があるか）をサーバーにデータだけ確認する関数
async function checkWinPossible() {
    const isHaitei = (wallCount === 0);
    try {
        const wd = await apiCall('/check_win', { player_idx: 0, is_ron: "false", is_rinshan: pendingIsRinshan, is_haitei: isHaitei, is_chankan: "false" });
        return wd.can_win; // アガれるなら true を返す
    } catch (e) {
        return false;
    }
}

// 🎴 山から牌を1枚引く（ツモる）通信を行う関数
async function draw() {
    stopTimer();
    if (isProc) return; isProc = true;
    try {
        await apiCall('/draw', { player_idx: 0 });

        playSE('tsumo');

        render(); renderCPU();

        pendingIsJokerSwap = false; pendingIsRinshan = false; pendingIsMiaoshou = false; justPonged = false;

        isProc = false; checkT();
    } catch (e) { if (e.message === "流局") handleRoundEnd(); }
}

// 🗑️ 誰かが鳴いた時に、河（捨て牌置き場）から最新の捨て牌を拾い上げる関数
function removeLastDiscard(overrideIdx = null, targetTile = null) {
    let target = overrideIdx !== null ? overrideIdx : lastDiscardPlayer;
    let tileName = targetTile !== null ? targetTile : lastT;

    if (target !== -1) {
        const r = document.getElementById(`river-${target}`);
        if (r && r.lastChild) {
            // 🌟 修正：最後に捨てられた牌が、実際に拾うべき牌と一致しているか確認してから安全に消す
            const src = decodeURIComponent(r.lastChild.src || "");
            if (!tileName || src.includes(`/${tileName}.png`)) {
                r.removeChild(r.lastChild);
            }
        }
        // グローバル変数を使用した時だけリセットする
        if (target === lastDiscardPlayer) {
            lastDiscardPlayer = -1;
        }
    }
}

// 🖐️ 指定した牌を捨てる通信を行い、CPUの反応待ちへ進む関数
async function discard(t, isTsumogiri = false, domIdx = null) {
    stopTimer();
    if (isProc) return;
    isProc = true;

    // 🌟 追加：「罰当たり」実績の判定
    if (["春", "夏", "秋", "冬"].includes(t)) {
        currentRoundSeasonDiscardCount++;
        if (currentRoundSeasonDiscardCount === 2 && playerStats.sacrilegeCount === 0) {
            playerStats.sacrilegeCount = 1;
            showAchievementUnlock("罰当たり", "🚮");
            saveGameData();
        }
    }

    resetActionBtnPool(); // 🌟 修正
    document.querySelectorAll('.action-layer .btn-act').forEach(b => b.style.display = "none");

    // 🌟 1. 手牌の中の牌を消す（幅を保ったまま透明にして隙間を作る）
    if (domIdx !== null) {
        let el = (domIdx === 'drawn') ? document.getElementById('my-tile-drawn') : document.getElementById(`my-tile-${domIdx}`);
        if (el) el.style.visibility = "hidden";
    }

    // 🌟 2. 捨て牌を先に河に表示する（通信前に即座に反映させる）
    addR(0, t, isTsumogiri);

    // 🌟 3. 余韻（隙間が見える時間）を作る
    await sleep(250);

    // 🌟 4. サーバーに通信してデータを確定させる
    await apiCall('/discard', { player_idx: 0, tile: t });
    drawnTile = ""; lastDiscardPlayer = 0; justPonged = false;

    // 🌟 5. 理牌して再描画（ここでツモ牌も手牌に吸収され、隙間が詰まる）
    render(); renderCPU();

    // 🌟 6. 少し待ってからCPUの反応判定へ
    await sleep(250);
    checkCpuReactions(0, t);
}

// 🤖 CPUのターン処理（ツモ・打牌・鳴き判断）をサーバーに実行させる関数
async function cpu() {
    try {
        let currentCpuTurn = turn;
        let prevMeldCount = myAllMelds[currentCpuTurn] ? myAllMelds[currentCpuTurn].length : 0;

        let oldHand = [...(myAllHands[currentCpuTurn] || [])];

        const data = await apiCall('/cpu_turn', { cpu_idx: currentCpuTurn });

        if (data.tsumo) {
            showCallout(currentCpuTurn, "自摸");
            await sleep(1500);

            if (data.yaku) {
                if (data.yaku.includes("天胡")) { showCallout(currentCpuTurn, "天胡"); await sleep(4000); }
                else if (data.yaku.includes("地胡")) { showCallout(currentCpuTurn, "地胡"); await sleep(4000); }

                const specialEffects = ["槓上開花", "妙手回春", "花天月地"];
                for (let y of data.yaku) {
                    if (specialEffects.includes(y)) {
                        showCallout(currentCpuTurn, y);
                        await sleep(1500);
                    }
                }
            }

            turn = (currentCpuTurn + 1) % 4;

            render(); renderCPU();
            isProc = false; checkT();
            return;
        }

        let newMeldCount = myAllMelds[currentCpuTurn] ? myAllMelds[currentCpuTurn].length : 0;
        if (newMeldCount > prevMeldCount || data.did_kakan) {

            // 🌟 修正：サーバーですでに引いているので、UI上の山札も1枚減らす
            wallCount = Math.max(0, wallCount - 1);
            updateWall(wallCount);

            // まず副露（カン）の描画を更新する
            render(); renderCPU();

            // 🌟 追加：嶺上牌を引くアニメーションと音を再現する！
            playSE('tsumo');
            const c = document.getElementById(`hand-${currentCpuTurn}`);
            const dummyTile = document.createElement('img');
            dummyTile.className = 'tile';
            dummyTile.src = 'images/ura.png'; // 嶺上牌はとりあえず裏向き
            dummyTile.style.position = 'absolute';
            dummyTile.style.margin = '0';
            if (currentCpuTurn === 1) { dummyTile.style.bottom = 'calc(100% + 10px)'; dummyTile.style.left = '0'; }
            if (currentCpuTurn === 2) { dummyTile.style.right = 'calc(100% + 15px)'; dummyTile.style.top = '0'; dummyTile.style.transform = 'rotate(180deg)'; }
            if (currentCpuTurn === 3) { dummyTile.style.top = 'calc(100% + 10px)'; dummyTile.style.left = '0'; }
            c.appendChild(dummyTile);

            showCallout(currentCpuTurn, "槓");
            await sleep(1500);

            if (data.kakan_tile) {
                const wd = await apiCall('/check_win', { player_idx: 0, last_tile: data.kakan_tile, is_ron: "true", is_haitei: "false", is_chankan: "true" });

                if (wd.can_win) {
                    const btnWin = document.getElementById('btn-win');
                    const btnSkip = document.getElementById('btn-skip');

                    let kTile = data.kakan_tile;
                    btnWin.innerHTML = `胡 <img src="images/${kTile}.png" style="height: 28px; border-radius: 2px; box-shadow: 1px 1px 3px rgba(0,0,0,0.5); vertical-align: middle;">`;

                    let isAutoDigest = (isAutoPlay);
                    if (!isAutoDigest) {
                        btnWin.style.display = "flex";
                        btnWin.style.alignItems = "center";
                        btnWin.style.gap = "5px";
                        btnSkip.style.display = "block";
                        document.getElementById('msg').innerText = "槍槓チャンス";
                        playSE('alert');
                    }

                    btnWin.onclick = async () => {
                        stopTimer();
                        btnWin.style.display = "none";
                        btnSkip.style.display = "none";
                        lastT = kTile;
                        await execRon(true);
                    };

                    btnSkip.onclick = async () => {
                        stopTimer();
                        isProc = true;
                        btnWin.style.display = "none";
                        btnSkip.style.display = "none";

                        if (data.did_joker_swap) {
                            render(); renderCPU();
                            showCallout(currentCpuTurn, "JokerSwap");
                            await sleep(1500);
                        }

                        lastT = data.discard; lastDiscardPlayer = currentCpuTurn;

                        let newHand = [...(myAllHands[currentCpuTurn] || [])];
                        let combined = [...newHand, lastT];
                        oldHand.forEach(t => {
                            let idx = combined.indexOf(t);
                            if (idx !== -1) combined.splice(idx, 1);
                        });
                        let drawnTileByCpu = combined[0];
                        let isTsumogiri = (lastT === drawnTileByCpu);

                        addR(currentCpuTurn, lastT, isTsumogiri);
                        renderCPU();
                        await sleep(500);
                        await checkHumanReaction(currentCpuTurn, lastT);
                    };

                    isProc = false;

                    if (isAutoDigest) {
                        isProc = true;
                        setTimeout(() => { isProc = false; btnWin.click(); }, 800 / speedMult);
                    } else {
                        startTimer(timeCall, () => btnSkip.click());
                    }
                    return;
                }
            }
        }

        if (data.did_joker_swap) {
            render(); renderCPU();
            showCallout(currentCpuTurn, "JokerSwap");
            await sleep(1500);
        }

        lastT = data.discard; lastDiscardPlayer = currentCpuTurn;

        let newHand = [...(myAllHands[currentCpuTurn] || [])];
        let combined = [...newHand, lastT];

        oldHand.forEach(t => {
            let idx = combined.indexOf(t);
            if (idx !== -1) combined.splice(idx, 1);
        });
        let drawnTileByCpu = combined[0];

        let isTsumogiri = (lastT === drawnTileByCpu);

        addR(currentCpuTurn, lastT, isTsumogiri);

        renderCPU(); // ここでダミーの嶺上牌が消え、正しい手牌になる
        await sleep(500);
        await checkHumanReaction(currentCpuTurn, lastT);
    } catch (e) {
        if (e.message === "流局") handleRoundEnd();
    }
}

// 👁️ 他家が牌を捨てた時、自分が鳴けるか・ロンできるか判定してボタンを出す関数
async function checkHumanReaction(discarderIdx, tile) {
    resetActionBtnPool(); // 🌟 修正

    const count = myHand.filter(t => t === tile).length;
    const hasSeason = myHand.some(t => ["春", "夏", "秋", "冬"].includes(t));
    const isSeasonDiscard = ["春", "夏", "秋", "冬"].includes(tile);
    const isHaitei = (wallCount === 0);

    let showAny = false;
    const getImg = (t) => `<img src="images/${t}.png" style="height: 28px; border-radius: 2px; box-shadow: 1px 1px 3px rgba(0,0,0,0.5); vertical-align: middle;">`;

    const wd = await apiCall('/check_win', { player_idx: 0, last_tile: tile, is_ron: "true", is_haitei: isHaitei, is_chankan: "false" });

    // 🌟 頭ハネ判定
    let anyCpuWillRon = false;
    let higherPriorityCpuWillRon = false;
    let humanDist = (0 - discarderIdx + 4) % 4;

    for (let i = 1; i <= 3; i++) {
        if (i === discarderIdx) continue;
        try {
            const cpuWd = await apiCall('/check_win', { player_idx: i, last_tile: tile, is_ron: "true", is_haitei: isHaitei, is_chankan: "false" });
            if (cpuWd.can_win) {
                anyCpuWillRon = true;
                let cpuDist = (i - discarderIdx + 4) % 4;
                if (cpuDist < humanDist) {
                    higherPriorityCpuWillRon = true;
                }
            }
        } catch (e) { }
    }

    let canHumanRon = wd.can_win; // 🟢 修正：頭ハネされる場合でも「ロン」ボタンを堂々と出す！

    // ----------------------------------------------------
    // 1. ロン判定（優先）
    // ----------------------------------------------------
    if (canHumanRon) {
        const btn = document.getElementById('btn-win');
        btn.className = 'btn-act btn-red';
        btn.innerHTML = `胡 ${getImg(tile)}`;
        btn.style.display = "flex";
        btn.style.alignItems = "center";
        btn.style.gap = "5px";
        btn.onclick = () => execRon(false);
        // 💥 ここにあった isAutoPlay ならボタンを消すバグコードを完全消去！
        showAny = true;
    }

    // ----------------------------------------------------
    // 2. 鳴き判定
    // ----------------------------------------------------
    if (myWinTiles.length === 0) {
        if (count >= 2 && wallCount > 0) {
            const btn = document.getElementById('btn-pon');
            btn.className = 'btn-act btn-green';
            btn.innerHTML = `碰 ${getImg(tile)}`;
            btn.style.display = "flex";
            btn.style.alignItems = "center";
            btn.style.gap = "5px";
            showAny = true;
        }
        if (count >= 3 && wallCount > 0) {
            const btn = document.getElementById('btn-kan');
            btn.className = 'btn-act btn-blue';
            btn.innerHTML = `槓 ${getImg(tile)}`;
            btn.style.display = "flex";
            btn.style.alignItems = "center";
            btn.style.gap = "5px";
            showAny = true;
        }
        if (count === 2 && hasSeason && !isSeasonDiscard && wallCount > 0) {
            const btn = document.getElementById('btn-hanakan');
            btn.className = 'btn-act btn-blue';
            btn.innerHTML = `花槓 ${getImg(tile)}`;
            btn.style.display = "flex";
            btn.style.alignItems = "center";
            btn.style.gap = "5px";
            showAny = true;
        }
    }

    // ----------------------------------------------------
    // 3. アクション表示・自動進行制御
    // ----------------------------------------------------
    if (!showAny) {
        return checkCpuReactions(discarderIdx, tile);
    }

    renderCPU();

    let hasWon = myWinTiles.length > 0;
    let isAutoDigest = (isAutoPlay && hasWon); // 🌟 1. 和了前は機能させない

    let isKanVisible = false;
    if (myWinTiles.length === 0) {
        if (count >= 3 && wallCount > 0) isKanVisible = true;
        if (count === 2 && hasSeason && !isSeasonDiscard && wallCount > 0) isKanVisible = true;
    }

    let shouldAutoRon = false;
    let shouldAutoSkip = false;

    if (isAutoDigest) {
        if (isKanVisible) {
            // 🌟 2. 槓ボタンが出たら一時停止（和了かどうかにかかわらず）
        } else if (canHumanRon) {
            // 🌟 3. 槓が出なくて胡が出れば押す
            shouldAutoRon = true;
        } else {
            // 🌟 3. 和了でなければスルー
            shouldAutoSkip = true;
        }
    }

    if (!shouldAutoRon && !shouldAutoSkip) {
        playSE('alert');
        document.getElementById('btn-skip').style.display = "block";
    }

    const skipAction = () => {
        stopTimer();
        document.querySelectorAll('.action-layer .btn-act').forEach(b => b.style.display = "none");
        checkCpuReactions(discarderIdx, tile);
    };

    document.getElementById('btn-skip').onclick = skipAction;
    isProc = false;
    document.getElementById('msg').innerText = canHumanRon ? "胡！" : "鳴き";

    if (shouldAutoRon) {
        isProc = true;
        setTimeout(() => {
            isProc = false;
            document.getElementById('btn-win').click();
        }, 800 / speedMult);
    } else if (shouldAutoSkip) {
        isProc = true;
        setTimeout(() => {
            isProc = false;
            skipAction();
        }, 800 / speedMult);
    } else {
        startTimer(timeCall, () => {
            skipAction();
        });
    }
}

// 🤖 自分や他家の捨て牌（または加槓）に対し、他のCPUが鳴くかロンするか判定させる関数
async function checkCpuReactions(discarderIdx, tile, isKakan = false) {
    // 🎓 レッスン中は、CPUに「鳴き」や「ロン」を絶対にさせない！
    if (currentGameMode === 'lesson') {
        isProc = false;
        checkT(); // 何もせずに次の人のターンへ回す
        return;
    }

    try {
        isProc = true;
        const data = await apiCall('/check_cpu_reaction', { discarder_idx: discarderIdx, tile: tile, is_kakan: isKakan });

        if (data.reacted) {
            if (data.type === "ron") {
                showCallout(data.player, "胡");
                await sleep(1500);

                if (isKakan) {
                    showCallout(data.player, "槍槓");
                    await sleep(1500);

                    let targetMelds = myAllMelds[discarderIdx];
                    if (targetMelds && targetMelds.length > 0) {
                        let m = targetMelds.find(m => m.tiles.length === 4 && m.tiles.includes(tile));
                        if (m) {
                            m.tiles.pop();
                            m.type = "pong";
                        }
                    }
                } else {
                    removeLastDiscard(discarderIdx, tile); // 🌟 ターゲットを直接指定
                }

                render(); renderCPU();

                if (data.yaku) {
                    if (data.yaku.includes("地胡")) { showCallout(data.player, "地胡"); await sleep(4000); }

                    for (let y of data.yaku) {
                        if (y === "槍槓" || y === "花天月地") {
                            showCallout(data.player, y);
                            await sleep(1500);
                        }
                    }
                }

                if (!isKakan) removeLastDiscard(discarderIdx, tile); // 🌟 ターゲットを直接指定
                render(); renderCPU();

                checkT();
                return;
            } else {
                let isKan = (data.type === "minkan" || data.type === "hanakan" || data.type === "ankan" || String(data.type).includes("kan"));
                let callText = isKan ? "槓" : "碰";

                showCallout(data.player, callText);
                removeLastDiscard(discarderIdx, tile); // 🌟 ターゲットを直接指定

                if (isKan) {
                    wallCount = Math.max(0, wallCount - 1);
                    updateWall(wallCount);
                    render(); renderCPU();

                    playSE('tsumo');
                    const c = document.getElementById(`hand-${data.player}`);
                    const dummyTile = document.createElement('img');
                    dummyTile.className = 'tile';
                    dummyTile.src = 'images/ura.png';
                    dummyTile.style.position = 'absolute';
                    dummyTile.style.margin = '0';
                    if (data.player === 1) { dummyTile.style.bottom = 'calc(100% + 10px)'; dummyTile.style.left = '0'; }
                    if (data.player === 2) { dummyTile.style.right = 'calc(100% + 15px)'; dummyTile.style.top = '0'; }
                    if (data.player === 3) { dummyTile.style.top = 'calc(100% + 10px)'; dummyTile.style.left = '0'; }
                    c.appendChild(dummyTile);
                }

                await sleep(1500);

                lastT = data.discard;
                lastDiscardPlayer = data.player;
                addR(data.player, lastT);
                render(); renderCPU();

                await checkHumanReaction(data.player, lastT);
                return;
            }
        }
        checkT();
    } catch (e) {
        if (e.message === "流局") { handleRoundEnd(); return; }
        logMsg(`[Reaction Error] ${e.message}`, true);
        checkT();
    }
}

// 🏆 自分のツモ番で「ツモ」を宣言してアガリ処理を行う関数
async function execTsumo() {
    stopTimer();
    if (isProc) return;
    isProc = true;

    document.querySelectorAll('.action-layer .btn-act').forEach(b => b.style.display = "none");

    // 🌟 追加：透過箱を即座に消す
    const hideArea = document.getElementById('action-hide-area'); if (hideArea) hideArea.style.display = "none";

    let currentDrawnTile = drawnTile;

    const data = await apiCall('/win_tsumo', { player_idx: 0, is_joker_swap: pendingIsJokerSwap, is_rinshan: pendingIsRinshan });

    // 🌟 修正：文字が出る「前」に牌が動かないよう、描画(render)をスリープの後に移動！
    showCallout(0, "自摸");
    await sleep(1500);

    drawnTile = "";
    render(); renderCPU(); // ← ここで初めて画面を更新する

    if (data.yaku) {
        if (data.yaku.includes("天胡")) { showCallout(0, "天胡"); await sleep(4000); }
        else if (data.yaku.includes("地胡")) { showCallout(0, "地胡"); await sleep(4000); }

        const specialEffects = ["槓上開花", "妙手回春", "花天月地"];
        for (let y of data.yaku) {
            if (specialEffects.includes(y)) {
                showCallout(0, y);
                await sleep(1500);
            }
        }
    }

    turn = 1;
    isProc = false; checkT();
}

// 🏆 他家の捨て牌（または加槓）に対して「ロン」を宣言してアガリ処理を行う関数
async function execRon(isChankan = false) {
    stopTimer();
    if (isProc) return;

    isProc = true;
    document.querySelectorAll('.action-layer .btn-act').forEach(b => b.style.display = "none");

    // 🌟 追加：透過箱を即座に消す
    const hideArea = document.getElementById('action-hide-area'); if (hideArea) hideArea.style.display = "none";

    // 🌟 修正：非同期通信(apiCall)によって記憶が上書きされる前に、ターゲットを退避する
    let targetDiscarder = lastDiscardPlayer;
    let targetTile = lastT;

    const data = await apiCall('/win_ron', { player_idx: 0, tile: targetTile, is_chankan: isChankan, discarder: targetDiscarder });

    if (data.intercepted && data.type === "ron") {
        showCallout(data.player, "胡");
        await sleep(1500);
        if (data.yaku && data.yaku.includes("地胡")) { showCallout(data.player, "地胡"); await sleep(4000); }
        for (let y of (data.yaku || [])) {
            if (y === "花天月地") { showCallout(data.player, y); await sleep(1500); }
        }
        removeLastDiscard(targetDiscarder, targetTile); // 🌟 退避したターゲットを消去
        render(); renderCPU();
        isProc = false; checkT();
        return;
    }

    showCallout(0, "胡");
    await sleep(1500);

    if (isChankan) {
        showCallout(0, "槍槓");
        await sleep(1500);

        let cpuMelds = myAllMelds[targetDiscarder];
        if (cpuMelds && cpuMelds.length > 0) {
            let targetMeld = cpuMelds.find(m => m.tiles.length === 4 && m.tiles.includes(targetTile));
            if (targetMeld) {
                targetMeld.tiles.pop();
                targetMeld.type = "pong";
            }
        }
    } else {
        removeLastDiscard(targetDiscarder, targetTile); // 🌟 退避したターゲットを消去
    }

    render(); renderCPU();

    if (data.yaku) {
        if (data.yaku.includes("地胡")) { showCallout(0, "地胡"); await sleep(4000); }

        for (let y of data.yaku) {
            if (y === "花天月地") {
                showCallout(0, y);
                await sleep(1500);
            }
        }
    }

    isProc = false; checkT();
}

// 🗣️ 他家の捨て牌に対して「ポン」や「明槓」を実行する関数
async function execMeld(type) {
    stopTimer();
    if (isProc) return; isProc = true;
    document.querySelectorAll('.action-layer .btn-act').forEach(b => b.style.display = "none");

    // 🌟 追加：透過箱を即座に消す
    const hideArea = document.getElementById('action-hide-area'); if (hideArea) hideArea.style.display = "none";

    // 🌟 修正：非同期通信(apiCall)によって記憶が上書きされる前に、ターゲットを退避する
    let targetDiscarder = lastDiscardPlayer;
    let targetTile = lastT;

    const data = await apiCall('/meld', { player_idx: 0, type: type, tile: targetTile, discarder: targetDiscarder });

    if (data.intercepted && data.type === "ron") {
        showCallout(data.player, "胡");
        await sleep(1500);
        if (data.yaku && data.yaku.includes("地胡")) { showCallout(data.player, "地胡"); await sleep(4000); }
        for (let y of (data.yaku || [])) {
            if (y === "花天月地") { showCallout(data.player, y); await sleep(1500); }
        }
        removeLastDiscard(targetDiscarder, targetTile); // 🌟 退避したターゲットを消去
        render(); renderCPU();
        isProc = false; checkT();
        return;
    }

    removeLastDiscard(targetDiscarder, targetTile); // 🌟 退避したターゲットを消去
    render(); renderCPU();

    let callText = (type.includes("槓") || type.includes("カン")) ? "槓" : "碰";
    showCallout(0, callText);
    await sleep(1500);

    if (type === 'カン' || type === '花槓') {
        if (type === '花槓') {
            let oldHanakan = playerStats.hanakanCount;
            playerStats.hanakanCount++;
            checkTieredAchievement("hanakan", "花槓マスター", "🌸", oldHanakan, playerStats.hanakanCount, [10, 50, 100, 500]);
            saveGameData();
        }
        pendingIsRinshan = true; justPonged = false;
    } else {
        justPonged = true;
    }

    isProc = false; checkT();
}

// 🗣️ 自分のツモ番で「暗槓」や「加槓」を実行する関数
async function execSelfMeld(type, t, s, isHidden = false) {
    stopTimer();
    if (isProc) return; isProc = true;
    resetActionBtnPool(); // 🌟 修正

    // 🌟 追加：透過箱を即座に消す
    const hideArea = document.getElementById('action-hide-area'); if (hideArea) hideArea.style.display = "none";

    if (type.includes("花槓")) {
        // 🏆 ここを変更！【花槓マスター】（暗花槓など）
        let oldHanakan = playerStats.hanakanCount;
        playerStats.hanakanCount++;
        checkTieredAchievement("hanakan", "花槓マスター", "🌸", oldHanakan, playerStats.hanakanCount, [10, 50, 100, 500]);
        saveGameData();
    }

    const data = await apiCall('/self_meld', { player_idx: 0, type: type, tile: t, season: s, is_hidden: isHidden });
    render(); renderCPU();

    if (data.chankan_occurred) {
        showCallout(0, "加槓");
        await sleep(1500);

        lastT = t;
        if (wallCount === 0) { showCallout(data.winner, "花天月地"); await sleep(1500); }

        // 和了処理
        if (data.winner === 0) {
            await execRon(true);
        } else {
            showCallout(data.winner, "胡");
            await sleep(1500);

            showCallout(data.winner, "槍槓");
            await sleep(1500);

            if (wallCount === 0) {
                showCallout(data.winner, "花天月地");
                await sleep(1500);
            }

            await apiCall('/win_ron', { player_idx: data.winner, tile: data.tile, is_chankan: "true" });

            // 🌟 修正：胡の文字が出たあとの、画面更新直前に自分の副露を減らす！
            if (myMelds.length > 0) {
                let lastMeld = myMelds[myMelds.length - 1];
                if (lastMeld.tiles.length === 4) {
                    lastMeld.tiles.pop();
                    lastMeld.type = "pong";
                }
            }
        }

        render(); renderCPU(); // 🌟 ここで同時に更新される
        isProc = false; checkT();
        return;
    }

    showCallout(0, "槓");
    await sleep(1500);

    pendingIsRinshan = true; justPonged = false;
    isProc = false; checkT();
}

// 🃏 他家の花槓から四季牌(Joker)を正規の牌と交換して強奪する関数
async function execJokerSwap(t, season, targetIdx) {
    stopTimer();
    if (isProc) return; isProc = true;
    resetActionBtnPool(); // 🌟 修正

    // 🌟 追加：透過箱を即座に消す
    const hideArea = document.getElementById('action-hide-area'); if (hideArea) hideArea.style.display = "none";
    await apiCall('/joker_swap', { player_idx: 0, tile: t, season: season, target_idx: targetIdx });
    render(); renderCPU();

    showCallout(0, "JokerSwap");
    await sleep(1500);

    // 🏆 ここを変更！【スワップの支配者】
    let oldSwap = playerStats.jokerSwapCount;
    playerStats.jokerSwapCount++;
    checkTieredAchievement("jokerswap", "スワップの支配者", "🃏", oldSwap, playerStats.jokerSwapCount, [1, 10, 50, 150]);
    saveGameData();

    pendingIsJokerSwap = true;
    pendingIsMiaoshou = (season === "春");
    justPonged = false;

    isProc = false; checkT();
}

// ⏭️ 鳴きやロンの権利をスルーして、次の人の処理へ進める関数
function skipAction() {
    stopTimer();
    if (isProc) return; isProc = true;
    document.querySelectorAll('.action-layer .btn-act').forEach(b => b.style.display = "none");
    resetActionBtnPool(); // 🌟 修正

    // 🌟 追加：透過箱を即座に消す
    const hideArea = document.getElementById('action-hide-area'); if (hideArea) hideArea.style.display = "none";
    checkCpuReactions(lastDiscardPlayer, lastT);
}

// 🏁 1局の終了（アガリまたは流局）時に点数計算を行い、リザルト画面を表示する関数
async function handleRoundEnd(isReplayingResult = false) {
    try {
        stopTimer();

        // 🌟 追加：リザルト表示に入る前に、全員の持ち点枠の光（active-turn）を完全に消去する
        for (let i = 0; i < 4; i++) {
            const scoreEl = document.getElementById(`player-score-${i}`);
            if (scoreEl) scoreEl.classList.remove('active-turn');
        }

        // 🌟 修正：万が一以前の時間が残っていた場合のバグを防ぐため、再開時以外は現在時刻で強制上書き
        let startTime = sessionStorage.getItem(`result_phase_start_${currentSessionRoomId}`);
        if (!startTime || !isReplayingResult) {
            startTime = Date.now().toString();
            sessionStorage.setItem(`result_phase_start_${currentSessionRoomId}`, startTime);
        }
        let resultStartTime = parseInt(startTime);
        if (isNaN(resultStartTime)) resultStartTime = Date.now();

        if (!isReplayingResult) {
            let oldRounds = playerStats.totalRoundsPlayed;
            playerStats.totalRoundsPlayed++;
            checkTieredAchievement("rounds", "継続は力なり", "⏳", oldRounds, playerStats.totalRoundsPlayed, [10, 100, 1000, 5000]);
            saveGameData();
        }

        closeAllModals();
        document.getElementById('waits-panel').style.display = 'none';

        isProc = true;
        document.getElementById('msg').innerHTML = "点数計算中...";
        document.querySelectorAll('.action-layer .btn-act').forEach(b => b.style.display = 'none');

        isAutoPlay = false;
        const btnAuto = document.getElementById('btn-auto-play');
        if (btnAuto) {
            btnAuto.innerText = "オート(和了後): OFF";
            btnAuto.style.background = "#7f8c8d";
            btnAuto.style.boxShadow = "0 3px #95a5a6";
            btnAuto.classList.add('auto-off');
        }

        const calcData = await apiCall('/calculate_round_scores');

        let iWon = false;
        for (let res of (calcData.results || [])) {
            if (res.player === 0) {
                iWon = true;

                if (!isReplayingResult && currentGameMode !== 'lesson' && currentGameMode !== 'tutorial') {
                    playerStats._tempGameWins = (playerStats._tempGameWins || 0) + 1;
                    if (calcData.results.length > 0) {
                        if (calcData.results[0].player === 0) playerStats._tempFirstWin = true;
                        if (calcData.results[calcData.results.length - 1].player === 0) playerStats._tempLastWin = true;
                    }

                    let hasMenzen = myMelds.filter(m => m.type !== "ankan").length === 0;
                    let combinedYaku = (res.details || []).flatMap(d => d.yaku || []);
                    let allMyTiles = [...myHand];
                    myMelds.forEach(m => m.tiles.forEach(t => allMyTiles.push(t)));

                    if (hasMenzen && combinedYaku.includes("碰碰胡") && playerStats.suankoTrollCount === 0) {
                        playerStats.suankoTrollCount = 1;
                        showAchievementUnlock("四暗刻！", "😎");
                    }

                    if (combinedYaku.includes("無番和") && playerStats.chantaTrollCount === 0) {
                        let yaochuCount = allMyTiles.filter(t => t.includes("1") || t.includes("9") || ["東", "南", "西", "北", "白", "發", "中"].includes(t)).length;
                        if (yaochuCount >= 10) {
                            playerStats.chantaTrollCount = 1;
                            showAchievementUnlock("チャンタってある？", "🤪");
                        }
                    }

                    if (combinedYaku.includes("全単")) {
                        playerStats._tempZentanRounds = (playerStats._tempZentanRounds || 0) + 1;
                    }

                    if (combinedYaku.includes("無花果")) {
                        playerStats._tempMuhanaRounds = (playerStats._tempMuhanaRounds || 0) + 1;
                    }

                    if (playerStats.kyukaSanfukuCount === 0) {
                        let sum = 0;
                        allMyTiles.forEach(t => {
                            if (t.includes("m") || t.includes("p") || t.includes("s")) sum += parseInt(t[0]);
                        });
                        if (sum <= 30 || sum >= 90) {
                            playerStats.kyukaSanfukuCount = 1;
                            showAchievementUnlock("九夏三伏", "☀️");
                        }
                    }

                    if (playerStats.tougetsuSekisokuCount === 0) {
                        if (allMyTiles.includes("1m") && allMyTiles.includes("9m") &&
                            allMyTiles.includes("1p") && allMyTiles.includes("6p") && allMyTiles.includes("7p")) {
                            playerStats.tougetsuSekisokuCount = 1;
                            showAchievementUnlock("冬月赤足", "👣");
                        }
                    }

                    if (playerStats.tousenKaroCount === 0) {
                        let hasFlower = allMyTiles.some(t => ["春", "夏", "秋", "冬"].includes(t));
                        if (!hasFlower && (res.details || []).some(d => d.tile === "春" && (d.yaku || []).includes("自摸"))) {
                            playerStats.tousenKaroCount = 1;
                            showAchievementUnlock("冬扇夏炉", "⛄");
                        }
                    }

                    let winTile = (res.details && res.details.length > 0) ? res.details[0].tile : null;
                    if (winTile && !["春", "夏", "秋", "冬"].includes(winTile)) {
                        let visibleCount = 0;
                        myAllMelds.forEach(playerMelds => {
                            if (playerMelds) {
                                playerMelds.forEach(m => {
                                    m.tiles.forEach(t => { if (t === winTile) visibleCount++; });
                                });
                            }
                        });

                        for (let riverIdx = 0; riverIdx < 4; riverIdx++) {
                            const r = document.getElementById(`river-${riverIdx}`);
                            if (r) {
                                Array.from(r.children).forEach(img => {
                                    const srcPath = decodeURIComponent(img.src);
                                    if (srcPath.includes(`/${winTile}.png`)) visibleCount++;
                                });
                            }
                        }

                        if (visibleCount === 3 && (playerStats.hezuezhangCount || 0) === 0) {
                            playerStats.hezuezhangCount = 1;
                            showAchievementUnlock("和絶張", "🀄");
                        }
                    }

                    playerStats.totalWins += (res.details ? res.details.length : 1);
                    let oldTotalScore = playerStats.totalScoreSum || 0;
                    playerStats.totalScoreSum = oldTotalScore + res.total_score;
                    checkTieredAchievement("billionaire", "大富豪", "🏦", oldTotalScore, playerStats.totalScoreSum, [1000, 10000, 50000, 1000000]);

                    if (currentWaits.length >= 27 && playerStats.wideWaitCount === 0) {
                        playerStats.wideWaitCount = 1;
                        showAchievementUnlock("無限の選択肢", "🌀");
                    }

                    for (let detail of (res.details || [])) {
                        if ((detail.yaku || []).length > playerStats.maxComboCount) {
                            let isFirstTime = (playerStats.maxComboCount < 7 && detail.yaku.length >= 7);
                            playerStats.maxComboCount = detail.yaku.length;
                            if (isFirstTime) showAchievementUnlock("インフレの体現者", "🌈");
                        }
                    }

                    if (allMyTiles.includes("春") && allMyTiles.includes("夏") && allMyTiles.includes("秋") && allMyTiles.includes("冬")) {
                        if (playerStats.masterOfSeasonsCount === 0) {
                            playerStats.masterOfSeasonsCount = 1;
                            showAchievementUnlock("四季常春", "🌍");
                        }
                    }

                    if (res.total_score > playerStats.maxScore) {
                        let oldMax = playerStats.maxScore;
                        playerStats.maxScore = res.total_score;
                        checkTieredAchievement("score", "最高到達打点", "💰", oldMax, playerStats.maxScore, [100, 500, 1000, 2000]);

                        playerStats.maxScoreHand = {
                            tiles: [...myHand],
                            melds: JSON.parse(JSON.stringify(myMelds)),
                            winTile: (res.details && res.details.length > 0) ? res.details[0].tile : ""
                        };
                    }

                    if (Array.isArray(playerStats.yakuCollected)) {
                        let migrated = {};
                        playerStats.yakuCollected.forEach(y => migrated[y] = 1);
                        playerStats.yakuCollected = migrated;
                    }

                    const yakuAchieveMap = {
                        "天胡": { title: "最速最強", icon: "⚡", req: 1 },
                        "地胡": { title: "あっ！(胡！)", icon: "😲", req: 1 },
                        "七星攬月": { title: "流星群", icon: "🌠", req: 1 },
                        "清幺九": { title: "老成円熟", icon: "👴", req: 1 },
                        "連七対": { title: "二盃口！", icon: "👯", req: 1 },
                        "九連宝燈": { title: "南無阿弥陀仏", icon: "🙏", req: 1 },
                        "十八羅漢": { title: "仏の顔も三度まで", icon: "💢", req: 1 },
                        "大四風会": { title: "風神降臨", icon: "🌪️", req: 1 },
                        "一色四節高": { title: "金門橋", icon: "🌉", req: 1 },
                        "一色四歩高": { title: "虎視眈々", icon: "🐅", req: 1 },
                        "紅孔雀": { title: "孔雀報喜", icon: "🦚", req: 1 },
                        "七星不靠": { title: "これ和了なの？", icon: "🤔", req: 1 },
                        "陰陽両儀": { title: "黒一色", icon: "⬛", req: 1 },
                        "大三元": { title: "三位一体", icon: "🐉", req: 1 },
                        "推不倒": { title: "目が回る", icon: "🌀", req: 8 },
                        "槍槓": { title: "今だ！(仮)", icon: "🎯", req: 1 },
                        "花天月地": { title: "花落知多少", icon: "🥀", req: 1 }
                    };

                    for (let detail of (res.details || [])) {
                        for (let y of (detail.yaku || [])) {
                            if (!playerStats.yakuCollected[y]) {
                                playerStats.yakuCollected[y] = 0;
                            }
                            playerStats.yakuCollected[y]++;
                            let ach = yakuAchieveMap[y];
                            if (ach && playerStats.yakuCollected[y] === ach.req) {
                                showAchievementUnlock(ach.title, ach.icon);
                            }
                        }
                    }
                }
            }
        }

        if (!isReplayingResult) saveGameData();

        let startDisplayIdx = 0;
        if (isReplayingResult) {
            startDisplayIdx = parseInt(sessionStorage.getItem(`result_display_idx_${currentSessionRoomId}`)) || 0;
            if (startDisplayIdx > 4) startDisplayIdx = 4;
        } else {
            sessionStorage.setItem(`result_display_idx_${currentSessionRoomId}`, "0");
        }

        for (let i = startDisplayIdx; i < 4; i++) {
            sessionStorage.setItem(`result_display_idx_${currentSessionRoomId}`, i.toString());

            let elapsed = (Date.now() - resultStartTime) / 1000;
            if (isNaN(elapsed)) elapsed = 0;

            // 🌟 UI調整用のコメントアウト。あとで戻します
            // if (elapsed >= (i + 1) * 8) continue; 

            // 🌟 UI調整用に600秒にします。
            let currentWaitTime = 600;

            // 🌟 UI調整用のコメントアウト。あとで戻します
            // let currentWaitTime = 8 - (elapsed - (i * 8));
            // if (currentWaitTime > 8) currentWaitTime = 8;
            // if (currentWaitTime < 0) currentWaitTime = 0;

            let isWinner = false;
            let winData = null;

            for (let res of (calcData.results || [])) {
                if (res.player === i) {
                    isWinner = true;
                    winData = res;
                    break;
                }
            }

            let diff = (calcData.scores && calcData.scores[i]) !== undefined ? calcData.scores[i] : 0;
            let yakuHtml = "";
            let titleText = "";
            let scoreText = "";
            let scoreColor = "";

            if (isWinner && winData) {
                titleText = (i === 0) ? "あなたの和了！" : `CPU ${i} の和了！`;
                scoreText = `${winData.total_score} 点`;
                scoreColor = "#2ecc71";

                let groupedDetails = {};
                for (let detail of (winData.details || [])) {
                    let yakuKey = [...(detail.yaku || [])].sort().join(",");
                    let groupKey = `${detail.tile}_${yakuKey}`;

                    if (!groupedDetails[groupKey]) {
                        groupedDetails[groupKey] = {
                            tile: detail.tile, yaku: (detail.yaku || []), score: detail.score || 0, count: 1, total_score: detail.score || 0
                        };
                    } else {
                        groupedDetails[groupKey].count++;
                        groupedDetails[groupKey].total_score += (detail.score || 0);
                    }
                }

                let sortedDetails = Object.values(groupedDetails);
                sortedDetails.sort((a, b) => {
                    if (b.total_score !== a.total_score) return b.total_score - a.total_score;
                    return SM[a.tile] - SM[b.tile];
                });

                for (let d of sortedDetails) {
                    let tile = d.tile;
                    const tierOrder = { "yaku-tier-64": 1, "yaku-tier-32": 2, "yaku-tier-16": 3, "yaku-tier-8": 4, "yaku-tier-6": 5, "yaku-tier-4": 6, "yaku-tier-2": 7, "yaku-tier-1": 8, "yaku-tier-multi": 9 };
                    d.yaku.sort((a, b) => {
                        let orderA = tierOrder[getYakuTierClass(a)] !== undefined ? tierOrder[getYakuTierClass(a)] : 99;
                        let orderB = tierOrder[getYakuTierClass(b)] !== undefined ? tierOrder[getYakuTierClass(b)] : 99;
                        return orderA - orderB;
                    });

                    let countStr = d.count > 1 ? `<span style="color: #ff9ff3; font-weight: bold; margin-left: 5px; font-size: 18px;">×${d.count}枚</span>` : "";
                    let scoreDetailStr = d.count > 1 ? `<span style="font-size: 14px; color:#aaa;">(${d.score}点 × ${d.count})</span> <br> ${d.total_score}点` : `${d.score}点`;

                    yakuHtml += `
                        <div style="font-size: 20px; display: flex; align-items: center; justify-content: space-between; width: 100%; background: rgba(0,0,0,0.6); padding: 8px 15px; border-radius: 8px; border-left: 5px solid #f39c12; box-sizing: border-box; margin-bottom: 5px;">
                            <div style="display: flex; align-items: center; width: 160px;">
                                <img src="images/${tile}.png" style="width:28px; height:39px; border-radius: 2px;">
                                ${countStr}
                            </div>
                            <div style="flex-grow: 1; text-align: center; display: flex; flex-wrap: wrap; justify-content: center; gap: 4px; padding: 0 10px;">
                                ${d.yaku.map(y => `<span class="yaku-tag ${getYakuTierClass(y)}"><span class="zh">${y}</span><span class="ja">${getJaYakuName(y)}</span><span class="en">${getEnYakuName(y)}</span></span>`).join("")}
                            </div>
                            <div style="color: #2ecc71; font-weight: bold; min-width: 140px; text-align: right;">
                                ${scoreDetailStr}
                            </div>
                        </div>`;
                }
            } else {
                titleText = (i === 0) ? "あなたの結果" : `CPU ${i} の結果`;
                let diffStr = diff > 0 ? `${diff}` : (diff === 0 ? `0` : `${diff}`);
                scoreText = `${diffStr} 点`;
                scoreColor = diff > 0 ? "#2ecc71" : (diff < 0 ? "#e74c3c" : "#bdc3c7");

                let resultLabel = diff < 0 ? "失点 (振込み等)" : ((calcData.results || []).length === 0 ? "流局" : "ー");
                yakuHtml = `
                    <div style="font-size: 24px; font-weight: bold; color: #bdc3c7; background: rgba(0,0,0,0.6); padding: 15px 40px; border-radius: 8px; border: 2px solid #555; text-align: center; margin-top: 10px;">
                        ${resultLabel}
                    </div>`;
            }

            let closedHand = (i === 0) ? myHand : (myAllHands[i] || []);
            let melds = (i === 0) ? myMelds : (myAllMelds[i] || []);
            let sortedHand = [...closedHand].sort((a, b) => SM[a] - SM[b]);

            let handHtml = `<div style="display: flex; gap: 4px; align-items: center; justify-content: center; background: rgba(255,255,255,0.15); padding: 15px 25px; border-radius: 10px; margin-bottom: 20px; box-shadow: inset 0 0 10px rgba(0,0,0,0.5);">`;

            handHtml += `<div style="display: flex; gap: 2px;">`;
            for (let t of sortedHand) {
                handHtml += `<img src="images/${t}.png" style="width: 36px; height: 50px; border-radius: 3px; box-shadow: 2px 2px 5px rgba(0,0,0,0.5);">`;
            }
            handHtml += `</div>`;

            if (melds.length > 0) {
                handHtml += `<div style="width: 4px; height: 50px; background: #f1c40f; margin: 0 15px; border-radius: 2px; box-shadow: 0 0 8px #f39c12;"></div>`;

                for (let m of melds) {
                    handHtml += `<div style="display: flex; gap: 2px; margin-right: 8px; background: rgba(0,0,0,0.4); padding: 4px; border-radius: 5px; border: 1px solid rgba(255,255,255,0.2);">`;
                    for (let idx = 0; idx < m.tiles.length; idx++) {
                        let t = m.tiles[idx];
                        let src = (m.type === 'ankan' && (idx === 0 || idx === 3)) ? 'ura' : t;
                        handHtml += `<img src="images/${src}.png" style="width: 36px; height: 50px; border-radius: 3px;">`;
                    }
                    handHtml += `</div>`;
                }
            }
            handHtml += `</div>`;

            document.getElementById('win-label-text').innerText = titleText;
            document.getElementById('win-yaku').innerHTML = yakuHtml; // 🌟 修正：アニメーション関数を呼ぶ「前」に役リストを入れる！
            document.getElementById('win-hand-display').innerHTML = handHtml;

            // 🌟 修正：役がDOMに入った「後」にアニメーション関数を呼ぶ！
            let finalScoreAmount = (isWinner && winData) ? winData.total_score : diff;
            window.animateWinScore(document.getElementById('win-score'), finalScoreAmount, isWinner);

            // 🌟 修正：リザルト画面が出たタイミングでパネルを隠し、そのまま復元しない！
            const navPanel = document.getElementById('ingame-tutorial-nav');
            if (navPanel) {
                navPanel.style.display = 'none';
            }

            document.getElementById('overlay').scrollTop = 0;
            document.getElementById('overlay').style.display = "flex";

            updateStampVisibility();

            if (!isReplayingResult) playSE('score');

            await waitWithTimerAndSkip(currentWaitTime);

            document.getElementById('overlay').style.display = "none";
            updateStampVisibility();
            await sleep(500);
        }

        sessionStorage.setItem(`result_display_idx_${currentSessionRoomId}`, "4");

        scores = calcData.scores || [0, 0, 0, 0];
        let rankingPoints = calcData.ranking_points || [0, 0, 0, 0];
        let rateChanges = [0, 0, 0, 0];

        let rankBeforeFinalRound = -1;
        if (currentRound >= 4 && !isReplayingResult) {
            let sortedBefore = [0, 1, 2, 3].sort((a, b) => totalScores[b] - totalScores[a]);
            rankBeforeFinalRound = sortedBefore.indexOf(0) + 1;
        }

        if (!isReplayingResult && currentGameMode !== 'lesson' && currentGameMode !== 'tutorial') {
            let myNetScore = scores[0] + rankingPoints[0];
            let isPacifistTop = true;
            for (let i = 1; i < 4; i++) {
                if (scores[i] + rankingPoints[i] > myNetScore) isPacifistTop = false;
            }
            if (!iWon && isPacifistTop && playerStats.pacifistCount === 0) {
                playerStats.pacifistCount = 1;
                showAchievementUnlock("漁夫の利", "🕊️");
            }
            saveGameData();
        }

        let finalElapsed = (Date.now() - resultStartTime) / 1000;
        if (isNaN(finalElapsed)) finalElapsed = 0;

        if (finalElapsed < 35) {
            let startIdx = dealer;
            for (let step = 0; step < 4; step++) {
                let targetIdx = (startIdx + step) % 4;
                let roundScore = scores[targetIdx];
                let rankPoint = rankingPoints[targetIdx];

                await sleep(1000);

                let rsEl = document.getElementById(`player-round-score-${targetIdx}`);
                if (!rsEl) continue;

                const posOffsets = [
                    { bottom: "110px", left: "50%" },
                    { right: "120px", top: "50%" },
                    { top: "110px", left: "50%" },
                    { left: "120px", top: "50%" }
                ];

                const offset = posOffsets[targetIdx];
                rsEl.style.bottom = offset.bottom || "auto";
                rsEl.style.top = offset.top || "auto";
                rsEl.style.left = offset.left || "auto";
                rsEl.style.right = offset.right || "auto";
                rsEl.style.zIndex = "10000";

                let sign = roundScore > 0 ? "+" : "";
                let mainCls = roundScore > 0 ? "score-main-plus" : (roundScore < 0 ? "score-main-minus" : "score-main-zero");
                let rankCls = rankPoint > 0 ? "score-rank-plus" : "score-rank-zero";

                rsEl.innerHTML = `<div class="${mainCls}">${sign}${roundScore}</div>
                                  <div class="${rankCls}">順位点 +${rankPoint}</div>`;
                rsEl.className = `player-round-score show-score`;

                if (!isReplayingResult) playSE('coin');

                if (!isReplayingResult) {
                    totalScores[targetIdx] += roundScore + rankPoint;
                }

                let scoreEl = document.getElementById(`player-score-${targetIdx}`);
                scoreEl.innerHTML = `持ち点: ${totalScores[targetIdx]}`;
                scoreEl.style.transform = "scale(1.2)";
                setTimeout(() => scoreEl.style.transform = "scale(1)", 200);
            }

            await sleep(3500);

            for (let i = 0; i < 4; i++) {
                let rsEl = document.getElementById(`player-round-score-${i}`);
                if (rsEl) rsEl.className = "player-round-score";
            }
        }

        sessionStorage.removeItem(`result_display_idx_${currentSessionRoomId}`);
        sessionStorage.removeItem(`result_end_time_${currentSessionRoomId}`);
        sessionStorage.removeItem(`result_phase_start_${currentSessionRoomId}`);

        if (currentGameMode === 'lesson') {
            let isCleared = false;
            let clearMsg = "";

            if (iWon) {
                let myResult = (calcData.results || []).find(r => r.player === 0);
                let myYaku = myResult ? (myResult.details || []).flatMap(d => d.yaku || []) : [];

                if (window.currentLessonId === 1 && myYaku.includes("全単")) isCleared = true;
                else if (window.currentLessonId === 2 && myYaku.includes("推不倒")) isCleared = true;
                else if (window.currentLessonId === 3 && (myYaku.includes("全大") || myYaku.includes("全中") || myYaku.includes("全小"))) isCleared = true;
                else if (window.currentLessonId === 4 && myYaku.includes("三節高")) isCleared = true;
                else if (window.currentLessonId === 5 && myYaku.includes("断紅胡")) isCleared = true;
                else if (window.currentLessonId === 6 && myYaku.includes("寒江独釣")) isCleared = true;
                else if (window.currentLessonId === 7 && myYaku.includes("七星不靠")) isCleared = true;
                else if (window.currentLessonId === 8 && myYaku.includes("一色四歩高")) isCleared = true;
                else if (window.currentLessonId === 9 && myYaku.includes("無花果") && myYaku.includes("槓上開花")) isCleared = true;

                if (isCleared) {
                    console.log("実際にサーバーから返ってきた獲得役:", myYaku);
                    clearMsg = "🎉 レッスンクリア！おめでとうございます！\n『四季茶会麻雀』ならではの、日麻の常識を壊す戦術が身につきましたね！";

                    // 🌟 追加：レッスンクリア状況を専用の領域にセーブする
                    let savedLessons = JSON.parse(localStorage.getItem('shiki_mahjong_lessons')) || [];
                    savedLessons[window.currentLessonId] = true;
                    localStorage.setItem('shiki_mahjong_lessons', JSON.stringify(savedLessons));

                } else {
                    console.log("実際にサーバーから返ってきた獲得役:", myYaku);
                    clearMsg = "⚠️ 和了はできましたが、ミッションの条件役が含まれていませんでした！\nもう一度、指定された役の完成を狙ってみましょう！";
                }
            } else {
                clearMsg = "❌ レッスン失敗...\n条件を満たせずに局が終了してしまいました。もう一度挑戦してみましょう！";
            }

            await sleep(500);
            alert(clearMsg);

            if (currentSessionRoomId) {
                await fetch(`/exit_room?room_id=${currentSessionRoomId}`);
                currentSessionRoomId = "";
                localStorage.removeItem('shiki_mahjong_room_id');
            }
            returnToHomeGracefully();
            return;
        }

        if (currentRound >= 4) {
            let sortedIndices = [0, 1, 2, 3].sort((a, b) => {
                // 1. まずはスコアが高い順に比較
                if (totalScores[b] !== totalScores[a]) {
                    return totalScores[b] - totalScores[a];
                }
                // 2. 同点の場合は、現在の親(dealer)から見て席順が近い方を上位にする
                let distA = (a - dealer + 4) % 4;
                let distB = (b - dealer + 4) % 4;
                return distA - distB;
            });
            let myRank = sortedIndices.indexOf(0) + 1;

            if (!isReplayingResult && currentGameMode !== 'lesson' && currentGameMode !== 'tutorial') {
                if ((playerStats._tempGameWins || 0) === 0 && playerStats.noWinGameCount === 0) {
                    playerStats.noWinGameCount = 1;
                    showAchievementUnlock("暖かい紅茶でもいかが？", "☕");
                }
                playerStats._tempGameWins = 0;

                if (playerStats._tempZentanRounds >= 4 && playerStats.evilRationalismCount === 0) {
                    playerStats.evilRationalismCount = 1;
                    showAchievementUnlock("悪の合理主義", "😈");
                }
                playerStats._tempZentanRounds = 0;

                if (playerStats._tempMuhanaRounds >= 4 && playerStats.muhanaAddictionCount === 0) {
                    playerStats.muhanaAddictionCount = 1;
                    showAchievementUnlock("無花果依存症", "🍂");
                }
                playerStats._tempMuhanaRounds = 0;

                if (playerStats._tempFirstWin && playerStats._tempLastWin && playerStats.senshuBandaiCount === 0) {
                    if ((calcData.results || []).length >= 2) {
                        playerStats.senshuBandaiCount = 1;
                        showAchievementUnlock("千秋万代", "⏳");
                    }
                }
                playerStats._tempFirstWin = false;
                playerStats._tempLastWin = false;

                if (rankBeforeFinalRound === 4 && myRank === 1 && playerStats.comebackCount === 0) {
                    playerStats.comebackCount = 1;
                    showAchievementUnlock("逆転の劇薬", "💊");
                }

                playerStats.recentRecords.unshift({ rank: myRank, score: totalScores[0] });
                if (playerStats.recentRecords.length > 20) playerStats.recentRecords.pop();

                playerStats.totalGamesPlayed++;
                playerStats.rankCounts[myRank - 1]++;

                if (myRank === 1) {
                    playerStats.currentWinStreak++;
                    if (playerStats.currentWinStreak > playerStats.maxWinStreak) {
                        let oldStreak = playerStats.maxWinStreak;
                        playerStats.maxWinStreak = playerStats.currentWinStreak;
                        checkTieredAchievement("streak", "連勝記録", "🔥", oldStreak, playerStats.maxWinStreak, [2, 5, 10, 20]);
                    }
                } else {
                    playerStats.currentWinStreak = 0;
                }

                // ==========================================
                // 🌟 ここから下が修正・追加されたレート計算ロジック
                // ==========================================
                let avgScore = totalScores.reduce((a, b) => a + b, 0) / 4;
                let avgTableRate = playerRatings.reduce((sum, r) => sum + r, 0) / 4;

                if (currentGameMode === 'online' || currentGameMode === 'cpu') {
                    let oldMyRate = playerRatings[0];

                    for (let rank = 0; rank < 4; rank++) {
                        let pIdx = sortedIndices[rank];
                        let myRate = playerRatings[pIdx];

                        // 1. 順位点の決定（案Aを適用）
                        let placementPoints = [0, 0, 0, 0];
                        if (myRate < 1600) {
                            placementPoints = [30, 10, 0, -20]; // 🔰 初心者帯（3位は減らない）
                        } else if (myRate < 1800) {
                            placementPoints = [20, 5, -5, -20]; // ⚔️ 一般帯（ゼロサム）
                        } else {
                            placementPoints = [15, 0, -10, -30]; // 👹 上級帯（ラスが致命傷）
                        }

                        // 2. 素点ボーナス（切り上げ ＆ ±20キャップ）
                        let scoreBonus = Math.ceil((totalScores[pIdx] - avgScore) / 100);
                        scoreBonus = Math.max(-20, Math.min(20, scoreBonus));

                        // 3. レート差補正
                        let rateDiff = avgTableRate - myRate;
                        let rateCorrection = Math.round(rateDiff / 40);

                        // 最終変動値の計算
                        let change = placementPoints[rank] + scoreBonus + rateCorrection;

                        // 1位と4位の最低保証
                        if (rank === 0 && change <= 0) change = 1;
                        if (rank === 3 && change >= 0) change = -1;

                        rateChanges[pIdx] = change;
                        playerRatings[pIdx] += change;

                        // 🌟 絶対下限1400の適用
                        if (playerRatings[pIdx] < 1400) playerRatings[pIdx] = 1400;
                    }

                    checkTieredAchievement("rating", "レートの階段", "📈", oldMyRate, playerRatings[0], [1600, 1700, 1800, 1900]);
                    if (oldMyRate < 2000 && playerRatings[0] >= 2000) {
                        showAchievementUnlock("頂に立つ者", "👑");
                    }
                } else {
                    // フリー卓やリプレイなどの「レート変動なし（ダミー計算）」用
                    let placementPoints = [0, 0, 0, 0];
                    for (let rank = 0; rank < 4; rank++) {
                        let pIdx = sortedIndices[rank];
                        let myRate = playerRatings[pIdx];

                        if (myRate < 1600) {
                            placementPoints = [30, 10, 0, -20];
                        } else if (myRate < 1800) {
                            placementPoints = [20, 5, -5, -20];
                        } else {
                            placementPoints = [15, 0, -10, -30];
                        }

                        let scoreBonus = Math.ceil((totalScores[pIdx] - avgScore) / 100);
                        scoreBonus = Math.max(-20, Math.min(20, scoreBonus));

                        let rateDiff = avgTableRate - myRate;
                        let rateCorrection = Math.round(rateDiff / 40);

                        let change = placementPoints[rank] + scoreBonus + rateCorrection;
                        if (rank === 0 && change <= 0) change = 1;
                        if (rank === 3 && change >= 0) change = -1;

                        // 実際のレートは動かさず、表示用の変動値だけセットする
                        rateChanges[pIdx] = change;
                    }
                }
                saveGameData();
            }

            let resultMsg = "【ゲーム終了！最終結果】\n\n";
            for (let rank = 0; rank < 4; rank++) {
                let pIdx = sortedIndices[rank];
                let name = pIdx === 0 ? playerStats.playerName : `CPU ${pIdx}`;
                resultMsg += `${rank + 1}位: ${name} (${totalScores[pIdx]}点)\n`;

                if (currentGameMode === 'online' || currentGameMode === 'cpu') {
                    let sign = rateChanges[pIdx] >= 0 ? "+" : "";
                    resultMsg += ` ┗ レート: ${playerRatings[pIdx]} (${sign}${rateChanges[pIdx]})\n`;
                }
            }

            while (isToastShowing || toastQueue.length > 0) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            alert(resultMsg);

            await apiCall('/next_round');
            returnToHomeGracefully();
            return;
        }

        currentRoundSeasonDiscardCount = 0;
        await apiCall('/next_round');

        for (let i = 0; i < 4; i++) {
            document.getElementById(`river-${i}`).innerHTML = "";
            document.getElementById(`meld-${i}`).innerHTML = "";
            document.getElementById(`win-zone-${i}`).innerHTML = "";
            document.getElementById(`win-zone-${i}`).style.display = "none";
        }

        charlestonCount = 1;
        isProc = false;
        startCharlestonSelection();
        renderCPU();

    } catch (e) {
        console.error("リザルト処理中にエラーが発生しました:", e);
        alert("リザルト処理中に予期せぬエラーが発生しました。\nホーム画面に戻ります。");
        returnToHomeGracefully();
    }
}

// 🗑️ 捨てられた牌を河（捨て牌置き場）に描画する関数
function addR(idx, t, isTsumogiri = false) {
    playSE('dahai');
    const r = document.getElementById(`river-${idx}`);
    const i = document.createElement('img');
    i.className = 'tile';
    i.src = `images/${t}.png`;

    if (isTsumogiri) {
        i.classList.add('discard-tsumogiri');
        // 設定ONなら、ツモ切り牌をずっと暗く表示する
        if (confTsumogiri) {
            i.style.filter = "brightness(0.65)";
        }
    } else {
        i.classList.add('discard-tedashi');
    }
    r.appendChild(i);
}