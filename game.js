// ⏱️ 指定秒数待機しつつ、スキップ可能なタイマーUIを表示する関数

let resultWaitResolver = null;

let resultTimerInterval = null;

let currentGameMode = 'cpu'; // 'cpu' または 'online'



function waitWithTimerAndSkip(seconds) {

    const controls = document.getElementById('result-controls');

    const timerText = document.getElementById('result-timer-text');

    controls.style.display = "flex";



    let timeLeft = seconds;

    timerText.innerText = `次へ: ${timeLeft}s`;



    return new Promise(resolve => {

        resultWaitResolver = resolve;

        resultTimerInterval = setInterval(() => {

            timeLeft--;

            timerText.innerText = `次へ: ${timeLeft}s`;

            if (timeLeft <= 0) {

                skipResultWait(); // 0秒で自動スキップ

            }

        }, 1000);

    });

}



// ⏭️ リザルト画面の待機タイマーを強制終了して次へ進む関数

function skipResultWait() {

    if (resultTimerInterval) clearInterval(resultTimerInterval);

    document.getElementById('result-controls').style.display = "none";

    if (resultWaitResolver) resultWaitResolver();

}



// 📸 リザルト画面を高画質でスクリーンショット撮影・保存する関数

async function takeResultScreenshot() {

    const overlay = document.getElementById('overlay');

    const btn = document.querySelector('#result-controls .btn-blue');

    const originalText = btn.innerText;

    btn.innerText = "📸 撮影中...";

    btn.disabled = true;



    // スクロールで隠れている下部も綺麗に撮るための一時的なCSS変更

    const origOverflow = overlay.style.overflowY;

    const origHeight = overlay.style.height;

    const origPos = overlay.style.position;



    overlay.style.overflowY = "visible";

    overlay.style.height = "auto";

    overlay.style.position = "absolute";



    try {

        const canvas = await html2canvas(overlay, {

            backgroundColor: "#0a0a0a",

            scale: 2, // 高画質化

            useCORS: true // 画像のセキュリティ制限を突破して描画を許可する

        });



        const link = document.createElement('a');

        link.download = `mahjong_result_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.png`;

        link.href = canvas.toDataURL('image/png');

        link.click();

    } catch (e) {

        console.error("Screenshot Error:", e);

        alert("スクリーンショットの保存に失敗しました。");

    } finally {

        // CSSを元に戻す

        overlay.style.overflowY = origOverflow;

        overlay.style.height = origHeight;

        overlay.style.position = origPos;



        btn.innerText = originalText;

        btn.disabled = false;

    }

}



// ==========================================

// ★ 設定画面（Settings）の制御

// ==========================================



// ⚙️ 設定モーダルを開く関数

function openSettings() {

    document.getElementById('settings-modal').style.display = 'flex';

    playSE('click');



    // 🌟 対局中（CPU戦）のみ「中断してホームに戻る」ボタンを表示する処理

    const titleScreen = document.getElementById('title-screen');

    const modeScreen = document.getElementById('mode-select-screen');

    const quitBtn = document.getElementById('btn-settings-quit');



    if (quitBtn) {

        // タイトル画面もホーム画面も隠れていて、かつCPU戦の時だけ表示

        if (titleScreen.style.display === 'none' && modeScreen.style.display === 'none' && currentGameMode === 'cpu') {

            quitBtn.style.display = 'block';

        } else {

            quitBtn.style.display = 'none';

        }

    }

}



// ⚙️ 設定モーダルを閉じる関数

function closeSettings() {

    document.getElementById('settings-modal').style.display = 'none';

    playSE('click');

}



// 🚪 対局を強制中断してホーム画面に戻る関数

function quitGame() {

    if (!confirm("本当に対局を中断してホーム画面に戻りますか？\n（進行中のスコアや戦績は保存されません）")) {

        return;

    }



    playSE('click');

    stopTimer(); // タイマーのカウントダウンを止める



    // 🌟 先ほど作った「ホーム直行切符」を使ってリロード！

    // ※ゲームデータをセーブしていないので、戦績は汚れません

    sessionStorage.setItem('shiki_mahjong_return_home', 'true');

    location.reload();

}



// 💾 現在の音量やスピードなどの設定をローカルストレージに保存する関数

function saveSettings() {

    const config = {

        speed: speedMult,

        bgmVolume: sounds.bgm.volume,

        seVolume: masterSEVolume,

        tableColor1: document.getElementById('table-color-1').value,

        tableColor2: document.getElementById('table-color-2').value,

        devMode: isDevMode,

        langMode: currentLangMode,

        bgmOn: audioState.bgmOn

    };

    localStorage.setItem('shiki_mahjong_settings', JSON.stringify(config));

    console.log("Settings saved.");

}



// 📂 ブラウザから設定を読み込み、スライダーや画面状態に反映する関数

function loadSettings() {

    const saved = localStorage.getItem('shiki_mahjong_settings');

    if (!saved) return;



    const config = JSON.parse(saved);



    // スピード反映

    changeSpeed(config.speed || 1.0);

    document.getElementById('settings-speed-slider').value = config.speed || 1.0;

    document.getElementById('settings-speed-label').innerText = 'x' + parseFloat(config.speed).toFixed(1);



    // 音量反映

    updateMasterBGM(config.bgmVolume ?? 0.3);

    document.getElementById('settings-bgm-slider').value = config.bgmVolume ?? 0.3;



    updateMasterSE(config.seVolume ?? 1.0);

    document.getElementById('settings-se-slider').value = config.seVolume ?? 1.0;



    // 卓の色反映

    document.getElementById('table-color-1').value = config.tableColor1 || "#1a5e3a";

    document.getElementById('table-color-2').value = config.tableColor2 || "#0d3b22";

    updateTableGradient();



    // 開発者モード

    if (config.devMode) {

        document.getElementById('dev-mode-container').style.display = "block";

        toggleDevMode(true);

    }



    // 言語設定

    if (config.langMode !== undefined) {

        currentLangMode = config.langMode;

        applyLangMode();

    }



    if (config.bgmOn !== undefined) {

        audioState.bgmOn = config.bgmOn;

        const btn = document.getElementById('btn-toggle-bgm');

        if (!audioState.bgmOn && btn) {

            btn.innerText = "🔇";

            btn.title = "BGM切替: OFF";

            btn.style.color = "#e74c3c";

            btn.style.borderColor = "rgba(231, 76, 60, 0.4)";

        }

    }

}



// ==========================================

// ★ セーブデータ（段位・レート・実績）管理

// ==========================================

let playerRatings = [1500, 1500, 1500, 1500];



// 📊 プレイヤーの実績・戦績を管理するデータオブジェクト

let playerStats = {

    playerName: "あなた",

    maxScore: 0,

    maxScoreHand: null,

    currentWinStreak: 0,

    maxWinStreak: 0,

    yakuCollected: {},

    jokerSwapCount: 0,

    secondCharlestonCount: 0,

    hanakanCount: 0,

    totalRoundsPlayed: 0,

    clutch1PointCount: 0,

    recentRecords: [],



    // 📊 新規追加：詳細戦績・グラフ用の指標データ

    totalGamesPlayed: 0,      // 累計ゲーム数（半荘相当）

    rankCounts: [0, 0, 0, 0], // 1位, 2位, 3位, 4位の獲得回数

    totalWins: 0,             // アガった局数

    totalTsumoWins: 0,        // ツモでアガった局数

    totalCalls: 0,            // 鳴き（副露）をした局数

    totalScoreSum: 0,         // 累計獲得点数（平均打点計算用）



    heavenlyCount: 0,       // 神の領域（天胡・地胡）

    maxComboCount: 0,       // インフレの体現者（最高同時複合役数）

    welcomeHomeCount: 0,    // おかえりなさい（交換で出した牌が戻る）

    comebackCount: 0,       // 逆転の劇薬（オーラス4位から1位）

    masterOfSeasonsCount: 0,// 四季を統べる者（春夏秋冬を揃えて和了）

    pacifistCount: 0,       // 漁夫の利（和了0回で局内1位）

    wideWaitCount: 0        // 無限の選択肢（27面待ち達成）

};



// 🏆 レート数値に応じたプレイヤーの「称号」文字列を返す関数

function getRatingTitle(rate) {

    if (rate < 1500) return "ざこ";

    if (rate < 1600) return "よわい";

    if (rate < 1700) return "ふつう";

    if (rate < 1800) return "つよい";

    if (rate < 1900) return "すごい";

    if (rate < 2000) return "やばい";

    return "あたまおかしい";

}



// 💾 プレイヤーのレートと実績（戦績）データをローカルストレージに保存する関数

function saveGameData() {

    const data = {

        ratings: playerRatings,

        stats: playerStats

    };

    localStorage.setItem('shiki_mahjong_data', JSON.stringify(data));

}



// 📂 ブラウザから実績とレートデータを読み込み、既存データとマージする関数

function loadGameData() {

    const saved = localStorage.getItem('shiki_mahjong_data');

    if (saved) {

        const data = JSON.parse(saved);

        if (data.ratings) playerRatings = data.ratings;

        if (data.stats) {

            playerStats = { ...playerStats, ...data.stats };

        }

    }

}

window.addEventListener('DOMContentLoaded', loadGameData);



// 🎨 選択された2色を使って麻雀卓の背景（円形グラデーション）を更新する関数

function updateTableGradient() {

    const c1 = document.getElementById('table-color-1').value;

    const c2 = document.getElementById('table-color-2').value;

    document.querySelector('.table').style.background = `radial-gradient(circle at center, ${c1} 0%, ${c2} 100%)`;

    saveSettings();

}



// 🛠️ 開発者モード（手牌全公開・ログ表示等）のON/OFFを切り替える関数

let isDevMode = false;

function toggleDevMode(isChecked) {

    isDevMode = isChecked;

    document.getElementById('settings-dev-mode').checked = isDevMode;



    const debugPanel = document.querySelector('.debug-panel');

    const debugLog = document.getElementById('debug-log');

    const achieveDebugPanel = document.getElementById('achieve-debug-panel');



    if (isDevMode) {

        debugPanel.style.display = 'flex';

        if (achieveDebugPanel) achieveDebugPanel.style.display = 'flex';

        if (debugLog.innerHTML !== '') debugLog.style.display = 'block';

    } else {

        debugPanel.style.display = 'none';

        if (achieveDebugPanel) achieveDebugPanel.style.display = 'none';

        debugLog.style.display = 'none';

    }



    // モードを切り替えた瞬間に再描画して、手牌とターゲット表示を更新

    updateInfoUI();

    renderCPU();



    saveSettings();

}



// 🔄 設定（スピード・音量・色・開発者モード）をすべて初期状態に戻す関数

function resetSettings() {

    // 1. スピードをリセット (x1.0)

    const speedSlider = document.getElementById('settings-speed-slider');

    const speedLabel = document.getElementById('settings-speed-label');

    if (speedSlider) speedSlider.value = 1.0;

    if (speedLabel) speedLabel.innerText = 'x1.0';

    changeSpeed(1.0);



    // 2. BGM音量をリセット (30%)

    const bgmSlider = document.getElementById('settings-bgm-slider');

    const bgmLabel = document.getElementById('settings-bgm-label');

    if (bgmSlider) bgmSlider.value = 0.3;

    if (bgmLabel) bgmLabel.innerText = '30%';

    updateMasterBGM(0.3);



    // 3. SE音量をリセット (100%)

    const seSlider = document.getElementById('settings-se-slider');

    const seLabel = document.getElementById('settings-se-label');

    if (seSlider) seSlider.value = 1.0;

    if (seLabel) seLabel.innerText = '100%';

    updateMasterSE(1.0);



    // 4. 卓の色をリセット (王道の緑グラデーション)

    const c1 = document.getElementById('table-color-1');

    const c2 = document.getElementById('table-color-2');

    if (c1) c1.value = "#1a5e3a";

    if (c2) c2.value = "#0d3b22";

    updateTableGradient();



    // 5. 開発者モードを完全にリセット（OFFにして隠す）

    toggleDevMode(false);

    const devContainer = document.getElementById('dev-mode-container');

    if (devContainer) devContainer.style.display = "none";



    playSE('click');

    console.log("Settings reset to default.");

}



// ページ読み込み時の処理（セーブがあれば読み込み、なければデフォルト色を塗る）

window.addEventListener('DOMContentLoaded', () => {

    const saved = localStorage.getItem('shiki_mahjong_settings');

    if (saved) {

        loadSettings();

    } else {

        updateTableGradient();

    }



    // 🌟 ここを追加！リロード時に切符を持っていたらタイトルをスキップして直行！

    if (sessionStorage.getItem('shiki_mahjong_return_home') === 'true') {

        sessionStorage.removeItem('shiki_mahjong_return_home'); // 切符を回収



        // BGMを鳴らす準備（自動再生制限対策のフラグ）

        audioState.initialized = true;

        if (audioState.bgmOn) {

            sounds.bgm.play().catch(e => console.log("BGM自動再生ブロック:", e));

        }



        // タイトル画面を消してホーム画面を出す

        document.getElementById('title-screen').style.display = 'none';

        document.getElementById('mode-select-screen').style.display = 'flex';



        // プロフィール（最新の戦績やグラフ）を更新して表示

        updateProfileUI();

    }

});



// 🎵 BGMの音量を変更して保存する関数

function updateMasterBGM(val) {

    const v = parseFloat(val);

    sounds.bgm.volume = v;

    document.getElementById('settings-bgm-label').innerText = `${Math.round(v * 100)}%`;

    saveSettings();

}



let masterSEVolume = 1.0;



// 🔊 効果音(SE)の音量を変更し、必要に応じてテスト音を鳴らす関数

function updateMasterSE(val, playTestSound = false) {

    masterSEVolume = parseFloat(val);

    document.getElementById('settings-se-label').innerText = `${Math.round(masterSEVolume * 100)}%`;

    if (playTestSound) {

        playSE('dahai'); // スライダーを手動で動かした時だけ鳴らす

    }

    saveSettings();

}



// ==========================================

// ★ チュートリアル＆役一覧・ローカライズ制御

// ==========================================

let currentLangMode = 0; // 0: 中国語, 1: 日本語, 2: 英語



// 🌐 選択中の言語（日・英・中）に合わせて画面のCSSクラスを切り替える関数

function applyLangMode() {

    document.body.classList.remove('lang-ja', 'lang-en');

    if (currentLangMode === 1) document.body.classList.add('lang-ja');

    if (currentLangMode === 2) document.body.classList.add('lang-en');



    const label = document.getElementById('current-lang-label');

    if (label) {

        if (currentLangMode === 0) {

            label.innerText = "中国語";

            label.style.color = "#f1c40f";

        } else if (currentLangMode === 1) {

            label.innerText = "日本語";

            label.style.color = "#e74c3c";

        } else {

            label.innerText = "English";

            label.style.color = "#3498db";

        }

    }

}



// 🔄 言語設定ボタンを押した際に、次の言語へローテーションさせる関数

function toggleYakuLang() {

    currentLangMode = (currentLangMode + 1) % 3;

    applyLangMode();

    playSE('click');

    saveSettings();

}



// 🇨🇳 日本語への翻訳辞書

const yakuJaMap = {

    // 64点

    "天胡": "天和", "地胡": "地和", "七星攬月": "大七星", "清幺九": "清老頭", "連七対": "連七対", "九連宝燈": "九連宝燈",

    // 32点

    "十八羅漢": "四槓子", "大四風会": "大四喜", "一色四節高": "一色四連刻", "一色四歩高": "一色四連順", "紅孔雀": "紅孔雀", "七星不靠": "七星不靠",

    // 16点

    "小四風会": "小四喜", "緑一色": "緑一色", "字一色": "字一色", "陰陽両儀": "黒一色", "大三元": "大三元", "全大": "全大", "全中": "全中", "全小": "全小", "寒江独釣": "裸単騎", "十三幺九": "国士無双",

    // 8点

    "三節高": "三連刻", "三同刻": "三同刻", "断紅胡": "断紅胡", "一気化三清": "三風刻", "十二金釵": "三槓子", "混幺九": "混老頭",

    // 6点

    "大于五": "大于五", "小于五": "小于五", "清一色": "清一色", "清龍": "一気通貫", "五門斉": "五門斉", "推不倒": "推不倒",

    // 4点

    "七対": "七対", "小三元": "小三元", "碰碰胡": "対々和", "下雨": "暗槓",

    // 2点

    "双同刻": "二同刻", "混一色": "混一色", "刮風": "明槓", "断么": "断么", "字刻": "字刻", "全単": "全単",

    // 1点

    "無番和": "無役",

    // 特殊

    "無花果": "無花", "槓上開花": "嶺上開花", "槍槓": "槍槓", "妙手回春": "妙手回春", "花天月地": "海底河底"

};

// 🇯🇵 中国語の役名を日本語名に翻訳する関数

function getJaYakuName(zhName) { return yakuJaMap[zhName] || zhName; }



// 🇨🇳 英語への翻訳辞書

const yakuEnMap = {

    "天胡": "Heavenly hand", "地胡": "Blessing hand", "七星攬月": "Big seven stars", "清幺九": "All terminal",

    "十八羅漢": "Four kang", "大四風会": "Big four winds", "一色四節高": "Four shifted pong", "一色四歩高": "Four shifted chow",

    "小四風会": "Little four winds", "陰陽両儀": "Monochrome tiles", "寒江独釣": "All melded hand", "十三幺九": "Thirteen orphans",

    "三節高": "Three shifted pong", "一気化三清": "Big three winds", "十二金釵": "Three kang", "混幺九": "Terminal & Honor",

    "清龍": "Pure straight", "碰碰胡": "All pong", "下雨": "Concealed kang",

    "双同刻": "Double pong", "刮風": "Melded kang", "字刻": "Character pong", "無番和": "Chicken hand",

    "無花果": "No season tiles", "槓上開花": "Replacement tile", "花天月地": "Last tile",

    "連七対": "Seven shifted pairs", "九連宝燈": "Nine gates", "紅孔雀": "Red peacock", "七星不靠": "Knitted & honors",

    "緑一色": "All green", "字一色": "All honor", "大三元": "Big dragons", "全大": "Upper tiles", "全中": "Middle tiles & Red", "全小": "Lower tiles",

    "三同刻": "Triple pong", "断紅胡": "Two toned hand",

    "大于五": "Upper four", "小于五": "Lower four", "清一色": "Full flush", "五門斉": "All types", "推不倒": "Reversible tiles",

    "七対": "Seven pairs", "小三元": "Little dragons",

    "混一色": "Half flush", "断么": "All simples", "全単": "All odds",

    "槍槓": "Robbing kang", "妙手回春": "Draw the Spring"

};

// 🇺🇸 中国語の役名を英語名に翻訳する関数

function getEnYakuName(zhName) { return yakuEnMap[zhName] || zhName; }



// 📖 遊び方モーダルを開く関数

function openHowTo() {

    document.getElementById('howto-modal').style.display = 'flex';

    playSE('click');

}



// 📖 遊び方モーダルを閉じる関数

function closeHowTo() {

    document.getElementById('howto-modal').style.display = 'none';

    playSE('click');

}



// 📜 役一覧モーダルを開く関数

function openYakuList() {

    document.getElementById('yaku-modal').style.display = 'flex';

    playSE('click');

}



// 📑 役一覧画面のタブ（点数ごとのページ）を切り替える関数

function switchYakuTab(evt, tabId) {

    const tabContents = document.getElementsByClassName("yaku-tab-content");

    for (let i = 0; i < tabContents.length; i++) {

        tabContents[i].style.display = "none";

    }

    const tabLinks = document.getElementsByClassName("yaku-tab-btn");

    for (let i = 0; i < tabLinks.length; i++) {

        tabLinks[i].classList.remove("active");

    }

    document.getElementById(tabId).style.display = "block";

    evt.currentTarget.classList.add("active");



    // スクロール位置を一番上に戻す

    document.getElementById('yaku-list-container').scrollTop = 0;

}



// 📜 役一覧モーダルを閉じる関数

function closeYakuList() {

    document.getElementById('yaku-modal').style.display = 'none';

    playSE('click');

}



// 🎖️ 役の点数（強さ）に応じて、CSSの色分け用クラス名を返す関数

function getYakuTierClass(yakuName) {

    const tier64 = ["天胡", "地胡", "七星攬月", "清幺九", "連七対", "九連宝燈"];

    const tier32 = ["十八羅漢", "大四風会", "一色四節高", "一色四歩高", "紅孔雀", "七星不靠"];

    const tier16 = ["小四風会", "緑一色", "字一色", "陰陽両儀", "大三元", "全大", "全中", "全小", "寒江独釣", "十三幺九"];

    const tier8 = ["三節高", "三同刻", "断紅胡", "一気化三清", "十二金釵", "混幺九"];

    const tier6 = ["大于五", "小于五", "清一色", "清龍", "五門斉", "推不倒"];

    const tier4 = ["七対", "小三元", "碰碰胡", "下雨"];

    const tier2 = ["双同刻", "混一色", "刮風", "断么", "字刻", "全単"];

    const tier1 = ["無番和"];

    const tierMulti = ["無花果", "槓上開花", "槍槓", "妙手回春", "花天月地"];



    if (tier64.includes(yakuName)) return "yaku-tier-64";

    if (tier32.includes(yakuName)) return "yaku-tier-32";

    if (tier16.includes(yakuName)) return "yaku-tier-16";

    if (tier8.includes(yakuName)) return "yaku-tier-8";

    if (tier6.includes(yakuName)) return "yaku-tier-6";

    if (tier4.includes(yakuName)) return "yaku-tier-4";

    if (tier2.includes(yakuName)) return "yaku-tier-2";

    if (tier1.includes(yakuName)) return "yaku-tier-1";

    if (tierMulti.includes(yakuName)) return "yaku-tier-multi";

    return "yaku-tier-1";

}



// ==========================================

// ★ 隠しコマンド（開発者モード解放・封印）

// ==========================================

let secretClickCount = 0;

let secretClickTimer = null;



// 🤫 画面の特定箇所を7回連続タップで開発者モードを隠し解放する関数

function secretClick() {

    secretClickCount++;



    // 1秒間クリックが途切れたらカウントを0に戻す

    clearTimeout(secretClickTimer);

    secretClickTimer = setTimeout(() => {

        secretClickCount = 0;

    }, 1000);



    // 7回連続でクリックされたら状態を切り替え！

    if (secretClickCount >= 7) {

        const devContainer = document.getElementById('dev-mode-container');



        if (devContainer.style.display === "none") {

            devContainer.style.display = "block";

            playSE('jokerswap_se');

            alert("【システム解放】\n開発者モードが利用可能になりました。");

        } else {

            devContainer.style.display = "none";

            toggleDevMode(false); // スイッチも強制OFFにする

            alert("【システム封印】\n開発者モードを隠しました。");

        }



        secretClickCount = 0;

    }

}



// ==========================================

// ★ オーディオ管理システム

// ==========================================

const audioState = {

    bgmOn: true,

    seOn: true,

    initialized: false

};



const sounds = {

    bgm: new Audio('audio/bgm.mp3'),

    tsumo: new Audio('audio/tsumo.mp3'),

    dahai: new Audio('audio/dahai.mp3'),

    dice: new Audio('audio/dice.mp3'),

    yaku: new Audio('audio/yaku.mp3'),

    score: new Audio('audio/score.mp3'),

    exchange: new Audio('audio/exchange.mp3'),

    tick: new Audio('audio/tick.mp3'),

    alert: new Audio('audio/alert.mp3'),

    click: new Audio('audio/click.mp3'),

    special_win: new Audio('audio/special_win.mp3'),

    jokerswap_se: new Audio('audio/jokerswap_se.mp3'),

    coin: new Audio('audio/coin.mp3'),

    start: new Audio('audio/start.mp3')

};



const voiceTypes = ['pon', 'kan', 'ron', 'zimo', 'jokerswap'];

for (let i = 0; i < 4; i++) {

    voiceTypes.forEach(v => {

        sounds[`${v}_${i}`] = new Audio(`audio/${v}_${i}.wav`);

    });

}



const soundVolumes = {

    bgm: 0.3,

    dahai: 0.6,

    dice: 1.0,

    exchange: 0.6,

    yaku: 0.8,

    score: 0.8,

    tick: 0.5,

    alert: 0.5,

    click: 0.2,

    jokerswap_se: 0.3,

    coin: 0.4,

    pon: 0.8,

    kan: 0.8,

    ron: 1.0,

    zimo: 1.0,

    jokerswap: 0.9

};



sounds.bgm.loop = true;

sounds.bgm.volume = 0.3;



// 🔈 ユーザーの初回クリック時にBGMの再生を開始する関数（ブラウザの自動再生ブロック対策）

function initAudio() {

    if (audioState.initialized) return;

    audioState.initialized = true;

    if (audioState.bgmOn) {

        sounds.bgm.play().catch(e => console.log("BGM自動再生ブロック:", e));

    }

}

window.addEventListener('click', initAudio, { once: true });



// 🔊 指定された名前の効果音（ボイス含む）を適切な音量で再生する関数

function playSE(soundName) {

    if (!audioState.seOn || !sounds[soundName]) return;

    let clone = sounds[soundName].cloneNode();

    let vol = 0.6;

    if (soundVolumes[soundName] !== undefined) {

        vol = soundVolumes[soundName];

    } else {

        let baseName = soundName.split('_')[0];

        if (soundVolumes[baseName] !== undefined) {

            vol = soundVolumes[baseName];

        }

    }



    clone.volume = Math.min(1.0, vol * masterSEVolume);

    clone.play().catch(e => console.log("SE再生エラー:", e));

    return clone;

}



// 🎵 BGMの再生/一時停止を切り替える関数

function toggleBGM() {

    audioState.bgmOn = !audioState.bgmOn;

    const btn = document.getElementById('btn-toggle-bgm');



    if (audioState.bgmOn) {

        if (audioState.initialized) sounds.bgm.play().catch(e => console.log(e));

        if (btn) {

            btn.innerText = "🎵"; // アイコンのみ

            btn.title = "BGM切替: ON";

            // 🌟 ひっそり佇むための透過カラー

            btn.style.color = "rgba(255,255,255,0.5)";

            btn.style.borderColor = "rgba(255,255,255,0.25)";

        }

    } else {

        sounds.bgm.pause();

        if (btn) {

            btn.innerText = "🔇"; // ミュートアイコン

            btn.title = "BGM切替: OFF";

            // 🌟 OFF時は気づきやすいように少し赤く、でも透過させる

            btn.style.color = "rgba(231, 76, 60, 0.6)";

            btn.style.borderColor = "rgba(231, 76, 60, 0.3)";

        }

    }

    saveSettings();

    playSE('click');

}



// 📱 画面サイズに合わせてゲーム画面（卓・タイトル等）を拡大縮小し、ズレを防ぐ関数

function resizeGame() {

    const scale = Math.min(window.innerWidth / 1280, window.innerHeight / 800);



    const table = document.querySelector('.table');

    if (table) {

        table.style.transformOrigin = "center center";

        table.style.transform = `scale(${scale})`;

        table.classList.add('ready'); // 🌟 計算完了！表示する！

    }



    const titleContent = document.querySelector('.title-content');

    if (titleContent) {

        titleContent.style.transformOrigin = "center center";

        titleContent.style.transform = `translate(-50%, -50%) scale(${scale})`;

        titleContent.classList.add('ready'); // 🌟 計算完了！表示する！

    }



    const modeContainer = document.getElementById('mode-select-container');

    if (modeContainer) {

        modeContainer.style.transformOrigin = "center center";

        modeContainer.style.transform = `translate(-50%, -50%) scale(${scale})`;

        modeContainer.classList.add('ready'); // 🌟 計算完了！表示する！

    }

}



window.addEventListener('resize', resizeGame);

window.addEventListener('DOMContentLoaded', resizeGame);

resizeGame(); // スクリプト読み込み時に即実行



// ==========================================

// ★ 進行スピードとタイマー制御

// ==========================================

let speedMult = 1.0;



// ⏩ ゲームの進行スピード（倍率）を変更する関数

function changeSpeed(val) {

    speedMult = parseFloat(val);

    const oldLabel = document.getElementById('speed-label');

    if (oldLabel) {

        oldLabel.innerText = `x${speedMult.toFixed(1)}`;

    }

    saveSettings();

}



const sleep = ms => new Promise(res => setTimeout(res, ms / speedMult));



let myPlayerIdx = 0;

let cpuHands = [[], [], [], []];



let currentWaits = [];

let myHand = [], myMelds = [], myWinTiles = [], turn = 0, isProc = false, lastT = "", justPonged = false;

let drawnTile = "", autoResumeTimer = null, lastDiscardPlayer = -1;

let wallCount = 0;

let currentRound = 1, dealer = 0, scores = [0, 0, 0, 0], totalScores = [0, 0, 0, 0];

let charlestonCount = 1, charlestonPhase = false, exchangeSelection = [];

let secondCharlestonParticipating = [false, false, false, false];

let charlestonAskResults = [];

let askedCount = 0;

let hideCpuTiles = [0, 0, 0, 0];

let pendingIsJokerSwap = false, pendingIsRinshan = false, pendingIsMiaoshou = false;

let myAllHands = [], myAllMelds = [], myAllWinTiles = [], cpuTargets = [], cpuPersonalities = [];

let isAutoPlay = false;

let skipCount = 0;

// 🌟 ここに追加！「おかえりなさい」テスト発動用のフラグ

let isWelcomeHomeTest = false;

let timerInterval = null;

let timeLeft = 0;

let maxTimeForTimer = 0;

let timerAction = null;

let currentTickAudio = null;

let timeDiscard = 60;

let timeCall = 20;

let timeExchange = 30;



const SM = { "1m": 1, "9m": 2, "1p": 11, "2p": 12, "3p": 13, "4p": 14, "5p": 15, "6p": 16, "7p": 17, "8p": 18, "9p": 19, "1s": 21, "2s": 22, "3s": 23, "4s": 24, "5s": 25, "6s": 26, "7s": 27, "8s": 28, "9s": 29, "東": 41, "南": 42, "西": 43, "北": 44, "白": 45, "發": 46, "中": 47, "春": 51, "夏": 52, "秋": 53, "冬": 54 };



// ⏳ 持ち時間タイマーを開始し、0秒になったら指定のコールバック処理を実行する関数

function startTimer(seconds, timeoutCallback) {

    stopTimer();

    timeLeft = seconds;

    maxTimeForTimer = seconds;

    timerAction = timeoutCallback;



    const display = document.getElementById('timer-display');

    const secSpan = document.getElementById('timer-sec');

    display.style.display = "block";

    display.style.color = "#2ecc71";

    display.style.borderColor = "#2ecc71";

    display.style.boxShadow = "0 0 15px rgba(46, 204, 113, 0.5)";

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



            // ペナルティ処理

            timeDiscard = Math.max(5, timeDiscard - 20);

            timeCall = Math.max(5, timeCall - 5);

            timeExchange = Math.max(5, timeExchange - 10);



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



// 🤖 アガリ後の「オート進行（消化試合）」モードをON/OFFする関数

function toggleAutoPlay() {

    isAutoPlay = !isAutoPlay;

    const btn = document.getElementById('btn-auto-play');

    if (isAutoPlay) {

        btn.innerText = "オート(和了後): ON";

        btn.style.background = "#27ae60";

        btn.style.boxShadow = "0 3px #2ecc71";

        triggerAutoPlayIfNeeded();

    } else {

        btn.innerText = "オート(和了後): OFF";

        btn.style.background = "#7f8c8d";

        btn.style.boxShadow = "0 3px #95a5a6";

    }

}



// 🤖 オートモード中、状況に応じて自動でツモ切りや鳴きスルーなどのボタンを押す関数

function triggerAutoPlayIfNeeded() {

    if (!isAutoPlay || isProc) return;

    if (myWinTiles.length === 0) return; // アガリ前は動作させない



    const msgText = document.getElementById('msg').innerText;

    const btnWin = document.getElementById('btn-win');



    if (turn === 0 && msgText.includes("打牌")) {

        const selfActions = document.getElementById('self-actions');

        if (btnWin.style.display === "block") {

            btnWin.click();

        } else if (selfActions.innerHTML === '') {

            if (drawnTile !== "") discard(drawnTile);

        }

    } else if (msgText === "鳴き") {

        const btnSkip = document.getElementById('btn-skip');

        if (btnWin.style.display === "block") {

            btnWin.click();

        } else if (btnSkip.style.display === "block") {

            btnSkip.click();

        }

    }

}



// 📝 開発者用ログ画面とブラウザのコンソールにメッセージを出力する関数

function logMsg(msg, isError = false) {

    if (isError) console.error(msg);

    else console.log(msg);



    const logDiv = document.getElementById('debug-log');

    if (logDiv) {

        if (isDevMode) {

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



// 📡 Pythonサーバー(FastAPI)へ通信し、データを受け取る超重要関数

async function apiCall(endpoint, params = {}) {

    try {

        let url = `http://127.0.0.1:8000${endpoint}`;



        params._t = new Date().getTime();



        if (Object.keys(params).length > 0) {

            const query = new URLSearchParams(params).toString();

            url += `?${query}`;

        }

        logMsg(`>>> 通信: ${url}`);



        const res = await fetch(url, { method: 'GET', cache: 'no-store' });

        if (!res.ok) throw new Error(`サーバーエラー(${res.status})。`);



        const data = await res.json();

        if (data.error) {

            if (data.error === "流局") throw new Error("流局");

            throw new Error(data.error);

        }



        safeUpdate(data);

        logMsg(`<<< 成功 (T:${turn}, 手牌:${myHand.length})`);

        return data;

    } catch (e) {

        if (e.message === "流局") throw e;

        logMsg(`[エラー] ${e.message}`, true);

        alert(`【システムエラー】\n${e.message}\n\n※ボタンを連打した可能性があります。もう一度操作してください。`);

        isProc = false;

        throw e;

    }

}



// 📦 サーバーから受け取った最新の盤面データで、手元の変数を安全に一括更新する関数

function safeUpdate(data) {

    if (data.player_hand !== undefined) myHand = data.player_hand;

    if (data.player_melds !== undefined) myMelds = data.player_melds;

    if (data.player_win_tiles !== undefined) myWinTiles = data.player_win_tiles;

    if (data.drawn_tile !== undefined) drawnTile = data.drawn_tile;

    if (data.turn !== undefined) turn = data.turn;



    if (data.wall_count !== undefined) {

        wallCount = data.wall_count;

        updateWall(wallCount);

    }



    if (data.current_round !== undefined) currentRound = data.current_round;

    if (data.dealer !== undefined) dealer = data.dealer;

    if (data.scores !== undefined) scores = data.scores;

    if (data.total_scores !== undefined) totalScores = data.total_scores;



    if (data.all_hands !== undefined) myAllHands = data.all_hands;

    if (data.all_melds !== undefined) myAllMelds = data.all_melds;

    if (data.all_win_tiles !== undefined) myAllWinTiles = data.all_win_tiles;

    if (data.cpu_targets !== undefined) cpuTargets = data.cpu_targets;

    if (data.cpu_personalities !== undefined) cpuPersonalities = data.cpu_personalities;



    updateInfoUI();

    updateWaitsButton();

}



// 📊 点差表示モードの管理用

let isDiffMode = false;

let diffModeTimer = null;



// 📍 実際の席番号から、画面上の位置（0=下, 1=右, 2=上, 3=左）を計算する便利関数

function getViewPos(actualIdx) {

    return (actualIdx - myPlayerIdx + 4) % 4;

}



// ℹ️ 画面四隅のプレイヤー名、点数、レート、親マークなどを更新する関数

function updateInfoUI() {

    const roundTextEl = document.getElementById('round-text');

    if (roundTextEl) roundTextEl.innerText = `第 ${currentRound} 局`;



    const wallCountEl = document.getElementById('wall-count');

    if (wallCountEl && typeof wallCount !== 'undefined') {

        wallCountEl.innerText = `山: ${wallCount}`;

    }



    for (let viewPos = 0; viewPos < 4; viewPos++) {

        let actualIdx = (myPlayerIdx + viewPos) % 4;

        let nameEl = document.getElementById(`player-name-${viewPos}`);

        let scoreEl = document.getElementById(`player-score-${viewPos}`);



        if (!nameEl || !scoreEl) continue;



        let title = getRatingTitle(playerRatings[actualIdx]);

        let titleColor = playerRatings[actualIdx] >= 2000 ? "#e74c3c" : (playerRatings[actualIdx] >= 1800 ? "#f1c40f" : "#3498db");

        let rateStr = `<span style="font-size:12px; color:#bdc3c7;">(R:${playerRatings[actualIdx]})</span>`;



        let name = "";

        if (currentGameMode === 'online') {

            name = actualIdx === myPlayerIdx ?

                `<span style="color:${titleColor}; font-size:12px;">【${title}】</span><br>⚙️ あなた ${rateStr}` :

                `<span style="color:${titleColor}; font-size:12px;">【${title}】</span><br>👤 プレイヤー ${actualIdx} ${rateStr}`;

        } else {

            name = viewPos === 0 ?

                `<span style="color:${titleColor}; font-size:12px;">【${title}】</span><br>⚙️ あなた ${rateStr}` :

                `<span style="color:${titleColor}; font-size:12px;">【${title}】</span><br>CPU ${actualIdx} ${rateStr}`;

        }



        let isDealer = (dealer === actualIdx) ? `<span class="dealer-mark">🀄親</span>` : "";

        let aiTarget = (actualIdx !== myPlayerIdx && cpuTargets[actualIdx] && isDevMode) ? `<br><span style="color:#2ecc71; font-size:12px;">[${cpuPersonalities[actualIdx]}] ${cpuTargets[actualIdx]}</span>` : "";



        nameEl.innerHTML = `${isDealer}${name}${aiTarget}`;



        if (!isDiffMode) {

            scoreEl.innerHTML = `持ち点: ${totalScores[actualIdx]}`;

            scoreEl.style.color = "#fff";

        }



        if (scoreEl.parentElement) {

            scoreEl.parentElement.style.zIndex = "10000";

        }



        let rsEl = document.getElementById(`player-round-score-${viewPos}`);

        if (rsEl) {

            rsEl.style.pointerEvents = "none";

        }



        scoreEl.style.position = "relative";

        scoreEl.style.zIndex = "5000";

        scoreEl.style.pointerEvents = "auto";

        scoreEl.style.cursor = "pointer";

        scoreEl.style.userSelect = "none";

        scoreEl.onclick = () => toggleScoreDiff(actualIdx);

    }

}



// 📊 点差表示の切り替えロジック

function toggleScoreDiff(baseIdx) {

    playSE('click');

    if (isDiffMode) {

        clearTimeout(diffModeTimer);

        isDiffMode = false;

        updateInfoUI();

        return;

    }



    isDiffMode = true;

    const baseScore = totalScores[baseIdx];



    for (let i = 0; i < 4; i++) {

        let viewPos = getViewPos(i);

        let scoreEl = document.getElementById(`player-score-${viewPos}`);

        if (!scoreEl) continue;



        if (i === baseIdx) {

            scoreEl.innerHTML = `持ち点: ${totalScores[i]}`;

            scoreEl.style.color = "#f1c40f";

        } else {

            let diff = baseScore - totalScores[i];

            let diffStr = diff > 0 ? `+${diff}` : (diff === 0 ? `±0` : `${diff}`);

            let diffColor = diff > 0 ? '#2ecc71' : (diff < 0 ? '#e74c3c' : '#aaa');

            scoreEl.innerHTML = `<span style="font-size:12px; color:#aaa;">点差:</span> <span style="font-weight:bold;">${diffStr}</span>`;

            scoreEl.style.color = diffColor;

        }

    }



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



    let sortedIndices = [0, 1, 2, 3].sort((a, b) => totalScores[b] - totalScores[a]);

    let baseName = baseIdx === myPlayerIdx ? playerStats.playerName : (currentGameMode === 'online' ? `プレイヤー ${baseIdx}` : `CPU ${baseIdx}`);

    let baseScore = totalScores[baseIdx];



    let html = `<div style="text-align:center; font-weight:bold; color:#3498db; margin-bottom:10px; border-bottom:2px solid #3498db; padding-bottom:8px; font-size:18px;">

                    現在の順位と点差 <br><span style="font-size:13px; color:#bdc3c7;">(基準: ${baseName})</span>

                </div>`;



    sortedIndices.forEach((idx, rank) => {

        let name = idx === myPlayerIdx ? playerStats.playerName : (currentGameMode === 'online' ? `プレイヤー ${idx}` : `CPU ${idx}`);

        let score = totalScores[idx];

        let diff = score - baseScore;



        let diffStr = diff > 0 ? `+${diff}` : (diff === 0 ? `±0` : `${diff}`);

        let diffColor = diff > 0 ? '#2ecc71' : (diff < 0 ? '#e74c3c' : '#aaa');



        if (idx === baseIdx) {

            diffStr = "-";

            diffColor = "#fff";

        }



        let rowStyle = idx === myPlayerIdx

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



    if (scoreDiffTimer) clearTimeout(scoreDiffTimer);

    scoreDiffTimer = setTimeout(() => {

        panel.style.display = 'none';

    }, 5000);

}



let currentNanikiru = null;



// 🀄 現在の待ち牌（または何切る）を計算し、「待ち確認」ボタンの状態を更新する関数

async function updateWaitsButton() {

    const waitsBtn = document.getElementById('btn-show-waits');

    if (!waitsBtn) return;



    if (charlestonPhase) {

        waitsBtn.disabled = true;

        waitsBtn.innerText = "ノーテン";

        return;

    }



    try {

        const res = await fetch(`http://127.0.0.1:8000/get_waits?player_idx=0&_t=${new Date().getTime()}`, { cache: 'no-store' });

        const data = await res.json();



        currentWaits = (data.waits || []).filter(w => !["春", "夏", "秋", "冬"].includes(w));

        currentNanikiru = data.nanikiru || null;



        const isTenpai = currentWaits.length > 0;

        const canListen = currentNanikiru && Object.keys(currentNanikiru).length > 0;



        if (isTenpai || canListen) {

            waitsBtn.disabled = false;

            waitsBtn.innerText = isTenpai ? "待ち牌確認" : "聴牌確認(何切る)";

        } else {

            waitsBtn.disabled = true;

            waitsBtn.innerText = "ノーテン";

            hideWaitsPanel();

        }

    } catch (e) {

        console.error("待ち牌取得エラー:", e);

    }

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



    // 「何切る」モード（14枚の時）の表示処理

    if (currentNanikiru) {

        panel.style.minWidth = "400px";

        for (let discardTile in currentNanikiru) {

            const row = document.createElement('div');

            row.style.display = "flex";

            row.style.alignItems = "center";

            row.style.gap = "10px";

            row.style.padding = "8px";

            row.style.borderBottom = "1px solid #444";

            row.style.width = "100%";



            const waits = currentNanikiru[discardTile].filter(w => !["春", "夏", "秋", "冬"].includes(w));



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

        currentWaits.forEach(w => {

            let visible = 0;

            myHand.forEach(t => { if (t === w) visible++; });

            myAllMelds.forEach(pm => { pm.forEach(m => { m.tiles.forEach(t => { if (t === w) visible++; }); }); });

            myAllWinTiles.forEach(wtList => { wtList.forEach(t => { if (t === w) visible++; }); });

            for (let i = 0; i < 4; i++) {

                const r = document.getElementById(`river-${i}`);

                Array.from(r.children).forEach(img => { if (img.src.includes(`/${w}.png`)) visible++; });

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

    document.getElementById('waits-panel').style.display = 'none';

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



// 🚀 ゲームの初期化通信を行い、最初のチャールストンを開始する関数

async function init() {

    logMsg("=== ゲーム起動 ===");

    await apiCall('/start');

    charlestonCount = 1;

    startCharlestonSelection();

    render(); renderCPU();

}



// 🧱 画面左上の「山: 〇枚」の表示を更新する関数

function updateWall(c) { document.getElementById('wall-count').innerText = `山: ${c}`; }



// 🔄 第1・第2交換のUIを表示し、プレイヤーに交換する3枚を選ばせる関数

function startCharlestonSelection() {

    charlestonPhase = true;

    exchangeSelection = [];



    const cTitle = document.getElementById('c-title');

    if (charlestonCount === 1) {

        cTitle.innerText = "第1交換（換三張）";

        cTitle.style.color = "#3498db";

    } else {

        cTitle.innerText = "第2交換 (Second Charleston)";

        cTitle.style.color = "#f1c40f";

    }

    document.getElementById('msg').innerText = "";

    document.getElementById('charleston-ui').style.display = "block";

    document.getElementById('btn-exchange').style.display = "none";

    render();



    startTimer(timeExchange, () => {

        let displayHand = [...myHand].sort((a, b) => SM[a] - SM[b]);

        exchangeSelection = [0, 1, 2];

        execExchange();

    });

}



// 👆 チャールストンで交換に出す牌の選択/解除を切り替える関数

function toggleExchange(idx) {

    console.log(`[DEBUG toggleExchange] クリックされたインデックス: ${idx}`);

    const pos = exchangeSelection.indexOf(idx);

    if (pos > -1) {

        exchangeSelection.splice(pos, 1);

        console.log(`[DEBUG toggleExchange] 選択解除しました。現在の選択数: ${exchangeSelection.length}`);

    } else if (exchangeSelection.length < 3) {

        exchangeSelection.push(idx);

        console.log(`[DEBUG toggleExchange] 選択追加しました。現在の選択数: ${exchangeSelection.length}`);

    } else {

        console.log(`[DEBUG toggleExchange] すでに3枚選択されているため無視されました`);

    }



    render();

    const btn = document.getElementById('btn-exchange');

    if (exchangeSelection.length === 3) {

        btn.style.display = "block";

        console.log("[DEBUG toggleExchange] 3枚選ばれたため、交換決定ボタンを表示しました");

    } else {

        btn.style.display = "none";

    }

}



// 📤 第1・第2チャールストンを実行する関数

async function execExchange() {

    console.log("========== [DEBUG execExchange] 実行開始 ==========");

    console.log(`[DEBUG execExchange] 現在の charlestonCount: ${charlestonCount}`);

    console.log(`[DEBUG execExchange] 選択されているインデックス: ${exchangeSelection}`);



    stopTimer();

    if (exchangeSelection.length !== 3) {

        console.log("[DEBUG execExchange] ⚠️ 選択枚数が3枚ではないため、[0, 1, 2]で強制上書きします");

        exchangeSelection = [0, 1, 2];

    }



    let displayHand = [...myHand].sort((a, b) => SM[a] - SM[b]);

    let t1 = displayHand[exchangeSelection[0]];

    let t2 = displayHand[exchangeSelection[1]];

    let t3 = displayHand[exchangeSelection[2]];

    console.log(`[DEBUG execExchange] 抽出された3枚の牌: ${t1}, ${t2}, ${t3}`);



    // 🌟 第2交換の時は、強制的に第2交換専用の関数へパスする

    if (charlestonCount === 2) {

        console.log("[DEBUG execExchange] charlestonCount が 2 のため、execSecondCharleston に処理をパスします");

        execSecondCharleston(t1, t2, t3);

        return;

    }



    isProc = true;

    document.getElementById('charleston-ui').style.display = "none";



    if (currentGameMode === 'online') {

        console.log("[DEBUG execExchange] オンラインモード: 第1交換の送信処理に入ります");

        document.getElementById('msg').className = "";

        document.getElementById('msg').innerText = "他のプレイヤーを待機中...";



        exchangeSelection.sort((a, b) => b - a).forEach(idx => displayHand.splice(idx, 1));

        myHand = displayHand;

        exchangeSelection = [];

        showCharlestonStatus(0, true);

        render();



        console.log(`[DEBUG execExchange] サーバーへ action: 'charleston' を送信します`);

        lobbyWs.send(JSON.stringify({

            type: "action", action: "charleston", player_idx: myPlayerIdx, tiles: [t1, t2, t3]

        }));

        return;

    }



    // --- 以下CPU戦の第1交換 ---

    console.log("[DEBUG execExchange] CPU戦モード: 第1交換の処理に入ります");

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

}



// 📤 第2チャールストンを実行する関数

async function execSecondCharleston(t1 = "", t2 = "", t3 = "") {

    console.log("========== [DEBUG execSecondCharleston] 実行開始 ==========");

    console.log(`[DEBUG execSecondCharleston] 受け取った牌: ${t1}, ${t2}, ${t3}`);

    console.log(`[DEBUG execSecondCharleston] currentGameMode: ${currentGameMode}`);

    console.log(`[DEBUG execSecondCharleston] myPlayerIdx: ${myPlayerIdx}`);

    console.log(`[DEBUG execSecondCharleston] 参加フラグ: ${secondCharlestonParticipating[myPlayerIdx]}`);



    stopTimer();

    isProc = true;

    document.getElementById('charleston-ui').style.display = "none";



    if (currentGameMode === 'online') {

        console.log("[DEBUG execSecondCharleston] オンラインモードの処理に入ります");



        if (secondCharlestonParticipating[myPlayerIdx] && t1 !== "") {

            console.log("[DEBUG execSecondCharleston] 参加状態＆牌指定あり。手牌から3枚削除します");

            let displayHand = [...myHand].sort((a, b) => SM[a] - SM[b]);

            [t1, t2, t3].forEach(t => {

                let idx = displayHand.indexOf(t);

                if (idx !== -1) displayHand.splice(idx, 1);

            });

            myHand = displayHand;

            exchangeSelection = [];

            showCharlestonStatus(0, true);

            render();



            document.getElementById('msg').innerText = "他のプレイヤーを待機中...";

            console.log(`[DEBUG execSecondCharleston] 🌟 サーバーへ action: 'second_charleston_turn' (参加) を送信します`);



            const sendData = {

                type: "action", action: "second_charleston_turn", player_idx: myPlayerIdx, participate: true, tiles: [t1, t2, t3]

            };

            console.log("[DEBUG execSecondCharleston] 送信データ中身:", sendData);

            lobbyWs.send(JSON.stringify(sendData));

        } else {

            console.log("[DEBUG execSecondCharleston] 不参加状態、または牌の指定なし");

            document.getElementById('msg').innerText = "他のプレイヤーを待機中...";

            console.log(`[DEBUG execSecondCharleston] 🌟 サーバーへ action: 'second_charleston_turn' (不参加) を送信します`);



            const sendData = {

                type: "action", action: "second_charleston_turn", player_idx: myPlayerIdx, participate: false, tiles: []

            };

            console.log("[DEBUG execSecondCharleston] 送信データ中身:", sendData);

            lobbyWs.send(JSON.stringify(sendData));

        }

        return;

    }



    // --- 以下CPU戦 ---

    console.log("[DEBUG execSecondCharleston] CPU戦モードの処理に入ります");

    let oldHandStr = [...myHand].sort((a, b) => SM[a] - SM[b]).join(',');



    if (secondCharlestonParticipating[0] && t1 !== "") {

        let oldCharleston = playerStats.secondCharlestonCount;

        playerStats.secondCharlestonCount++;

        checkTieredAchievement("charleston", "チャールストンの愛し子", "🔄", oldCharleston, playerStats.secondCharlestonCount, [5, 50, 500, 2500]);

        saveGameData();



        let displayHand = [...myHand].sort((a, b) => SM[a] - SM[b]);

        [t1, t2, t3].forEach(t => {

            let idx = displayHand.indexOf(t);

            if (idx !== -1) displayHand.splice(idx, 1);

        });

        myHand = displayHand;

        exchangeSelection = [];

        showCharlestonStatus(0, true);

        render();

    } else {

        exchangeSelection = [];

    }



    const data = await apiCall('/second_charleston', {

        player_idx: 0, t1: t1, t2: t2, t3: t3,

        p0: secondCharlestonParticipating[0],

        p1: secondCharlestonParticipating[1],

        p2: secondCharlestonParticipating[2],

        p3: secondCharlestonParticipating[3]

    });



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

    clearCharlestonStatus();

    render(); renderCPU();



    charlestonPhase = false;

    isProc = false;

    checkT();

}

// ⏳ 待合室画面に切り替える

function enterWaitingRoom(roomId) {

    currentRoomId = roomId;

    document.getElementById('friend-menu-select').style.display = 'none';

    document.getElementById('friend-menu-waiting').style.display = 'block';

    document.getElementById('display-room-id').innerText = roomId;

    document.getElementById('room-player-count').innerText = "1";



    const wsUrl = `ws://${window.location.host}/ws/lobby/${roomId}`;

    lobbyWs = new WebSocket(wsUrl);



    lobbyWs.onmessage = async (event) => {

        const data = JSON.parse(event.data);



        if (data.type === "lobby_update") {

            document.getElementById('room-player-count').innerText = data.player_count;

        }

        else if (data.type === "game_start") {

            skipCount = 0;

            myPlayerIdx = data.player_idx;

            currentGameMode = 'online';



            document.getElementById('friend-match-modal').style.display = 'none';

            document.getElementById('mode-select-screen').style.display = 'none';

            document.getElementById('title-screen').style.display = 'none';



            let state = data.state;

            myHand = state.player_hand || [];

            totalScores = state.total_scores || [0, 0, 0, 0];

            turn = state.turn;

            dealer = state.dealer;

            currentRound = state.current_round || 1;

            wallCount = state.wall_count;



            if (typeof cpuHands === 'undefined') window.cpuHands = [[], [], [], []];

            for (let i = 0; i < 4; i++) {

                if (i !== myPlayerIdx) cpuHands[i] = new Array(13).fill("back");

            }



            updateInfoUI(); render(); renderCPU();

            alert(`対局開始！あなたは ${myPlayerIdx} 番です。まずは牌の交換を行います。`);



            charlestonPhase = false; isProc = false;

            charlestonCount = 1; startCharlestonSelection();

        }

        else if (data.type === "update") {

            let state = data.state;

            let ev = data.event;



            let isCharlestonEvent = ev && ev.action && ev.action.includes("charleston");

            let isCallout = ev && ev.action === "play_callout";



            if (!isCharlestonEvent && !isCallout) {

                safeUpdate(state);

            }



            if (ev) {

                if (ev.action === "discard") {

                    let pIdx = ev.player_idx;

                    let tile = ev.tile;

                    drawnTile = ""; lastT = tile; lastDiscardPlayer = pIdx;

                    addR(pIdx, tile, false);

                    skipCount = 0;

                    render(); renderCPU();

                    if (pIdx !== myPlayerIdx) checkHumanReactionOnline(pIdx, tile);

                }

                else if (ev.action === "skip") {

                    skipCount++;

                    if (skipCount >= 3 && turn === myPlayerIdx && !charlestonPhase) {

                        isProc = false; checkOnlineT();

                    }

                }

                else if (ev.action === "sync") {

                    render(); renderCPU();

                    if (turn === myPlayerIdx) {

                        isProc = false; checkOnlineT();

                    }

                }

                else if (ev.action === "play_callout") {

                    let callIdx = ev.player_idx;

                    let text = ev.call_text;

                    showCallout(callIdx, text);



                    if (text === "胡" || text === "自摸" || text === "天胡" || text === "地胡") {

                        safeUpdate(state); render(); renderCPU();

                        isProc = true;

                        setTimeout(() => handleRoundEnd(), 2000);

                    } else {

                        setTimeout(() => {

                            safeUpdate(state); render(); renderCPU();

                            isProc = false;

                            if (turn === myPlayerIdx) checkOnlineT();

                        }, 1500);

                    }

                }

                // ▽ 第1交換：誰かが選び終わった

                else if (ev.action === "charleston_player_ready") {

                    let readyIdx = ev.player_idx;

                    if (readyIdx !== myPlayerIdx) {

                        showCharlestonStatus(getViewPos(readyIdx), true);

                        hideCpuTiles[readyIdx] = 3; renderCPU();

                    }

                }

                // ▽ 第1交換：全員完了！

                else if (ev.action === "charleston_complete") {

                    (async () => {

                        isProc = true;

                        await showDiceAnimation(ev.dice, ev.direction);

                        await playExchangeAnimation(ev.direction, [true, true, true, true]);

                        safeUpdate(state);

                        hideCpuTiles = [0, 0, 0, 0]; clearCharlestonStatus();

                        render(); renderCPU();

                        isProc = false;



                        askedCount = 0;

                        startSequentialSecondCharlestonOnline(); // 🌟 順番待ち確認をスタート

                    })();

                }

                // ▽ 第2交換：順番に回ってきて、誰かが選択を終えた

                else if (ev.action === "second_charleston_player_done") {

                    let cIdx = ev.player_idx;

                    if (cIdx !== myPlayerIdx) {

                        showCharlestonStatus(getViewPos(cIdx), ev.participate);

                        if (ev.participate) hideCpuTiles[cIdx] = 3;

                        renderCPU();

                    }

                    askedCount++;

                    startSequentialSecondCharlestonOnline(); // 次の人へ！

                }

                // ▽ 第2交換：スキップ

                else if (ev.action === "second_charleston_skip") {

                    (async () => {

                        showCenterMessage(`<span style="color:#e74c3c;font-size:24px;">参加者不足<br>第2交換はスキップされます</span>`);

                        await sleep(2000); hideCenterMessage();

                        hideCpuTiles = [0, 0, 0, 0]; clearCharlestonStatus(); renderCPU();

                        safeUpdate(state);

                        charlestonPhase = false; isProc = false; checkOnlineT();

                    })();

                }

                // ▽ 第2交換：交換実行！

                else if (ev.action === "second_charleston_complete") {

                    let parts = [false, false, false, false];

                    ev.active_players.forEach(p => parts[p] = true);

                    (async () => {

                        isProc = true;

                        if (!ev.direction.includes("不成立")) {

                            await showDiceAnimation(ev.dice, ev.direction);

                            await playExchangeAnimation(ev.direction, parts);

                        }

                        safeUpdate(state);

                        hideCpuTiles = [0, 0, 0, 0]; clearCharlestonStatus(); render(); renderCPU();

                        charlestonPhase = false; isProc = false; checkOnlineT();

                    })();

                }

            } else {

                if (!isCharlestonEvent && !isCallout) {

                    render(); renderCPU();

                }

            }

        }

    };

    lobbyWs.onclose = () => { console.log("ロビーから切断されました"); };

}



// 📋 招待URLをクリップボードにコピーする関数

function copyRoomUrl() {

    playSE('click');

    const url = window.location.origin + window.location.pathname + "?room=" + currentRoomId;

    navigator.clipboard.writeText(url).then(() => {

        alert("招待URLをコピーしました！\n" + url + "\n友達にLINE等で送って招待しましょう。");

    }).catch(err => {

        alert("コピーに失敗しました。手動でURLを共有してください。");

    });

}



// ==========================================

// 🌐 友人戦専用システム（CPU戦のコードは一切触りません）

// ==========================================



// 📤 第1・第2チャールストンを実行する関数

async function execExchange() {

    console.log("========== [DEBUG execExchange] 実行開始 ==========");

    console.log(`[DEBUG execExchange] 現在の charlestonCount: ${charlestonCount}`);

    console.log(`[DEBUG execExchange] 選択されているインデックス: ${exchangeSelection}`);



    stopTimer();

    if (exchangeSelection.length !== 3) {

        console.log("[DEBUG execExchange] ⚠️ 選択枚数が3枚ではないため、[0, 1, 2]で強制上書きします");

        exchangeSelection = [0, 1, 2];

    }



    let displayHand = [...myHand].sort((a, b) => SM[a] - SM[b]);

    let t1 = displayHand[exchangeSelection[0]];

    let t2 = displayHand[exchangeSelection[1]];

    let t3 = displayHand[exchangeSelection[2]];

    console.log(`[DEBUG execExchange] 抽出された3枚の牌: ${t1}, ${t2}, ${t3}`);



    // 🌟 第2交換の時は、強制的に第2交換専用の関数へパスする

    if (charlestonCount === 2) {

        console.log("[DEBUG execExchange] charlestonCount が 2 のため、execSecondCharleston に処理をパスします");

        execSecondCharleston(t1, t2, t3);

        return;

    }



    isProc = true;

    document.getElementById('charleston-ui').style.display = "none";



    if (currentGameMode === 'online') {

        console.log("[DEBUG execExchange] オンラインモード: 第1交換の送信処理に入ります");

        document.getElementById('msg').className = "";

        document.getElementById('msg').innerText = "他のプレイヤーを待機中...";



        exchangeSelection.sort((a, b) => b - a).forEach(idx => displayHand.splice(idx, 1));

        myHand = displayHand;

        exchangeSelection = [];

        showCharlestonStatus(0, true);

        render();



        console.log(`[DEBUG execExchange] サーバーへ action: 'charleston' を送信します`);

        lobbyWs.send(JSON.stringify({

            type: "action", action: "charleston", player_idx: myPlayerIdx, tiles: [t1, t2, t3]

        }));

        return;

    }



    // --- 以下CPU戦の第1交換 ---

    console.log("[DEBUG execExchange] CPU戦モード: 第1交換の処理に入ります");

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

}



// ❓ 各プレイヤーに「第2チャールストンをやるか？」を順番に聞いていく関数（CPU戦用）

async function askNextSecondCharleston() {

    if (askedCount === 0) {

        charlestonAskResults = [];

        clearCharlestonStatus();

    }



    if (askedCount === 4) {

        await sleep(500);

        finishAskSecondCharleston();

        return;

    }



    let currentAsker = (dealer + askedCount) % 4;



    if (currentAsker === 0) {

        document.getElementById('charleston-confirm-ui').style.display = "block";

        startTimer(timeExchange, () => {

            confirmSecondCharleston(false);

        });

    } else {

        await sleep(500);

        let willDo = Math.random() < 0.7;

        processAskSecondCharleston(currentAsker, willDo);

    }

}



// 🌟 オンライン専用：第2交換を親から「順番に」表示・制御する関数

function startSequentialSecondCharlestonOnline() {

    if (askedCount >= 4) {

        document.getElementById('msg').innerText = "結果を集計中...";

        return;

    }



    let currentAsker = (dealer + askedCount) % 4;



    if (currentAsker === myPlayerIdx) {

        charlestonAskResults = [];

        // 🌟 修正3：ここで clearCharlestonStatus() を呼ぶと他人の「過」が消えるので削除しました！

        document.getElementById('charleston-confirm-ui').style.display = "block";

        document.getElementById('msg').className = "";

        document.getElementById('msg').innerText = "第2交換に参加しますか？";



        // 時間切れになったら自動で「いいえ（false）」を選択

        startTimer(timeExchange, () => { confirmSecondCharleston(false); });

    } else {

        document.getElementById('charleston-confirm-ui').style.display = "none";

        document.getElementById('charleston-ui').style.display = "none";

        document.getElementById('msg').innerText = `プレイヤー ${currentAsker} が第2交換を検討中...`;

    }

}



// ✅ プレイヤーが第2チャールストンへの参加/不参加を選択した時の処理関数（CPU/オンライン共通）

function confirmSecondCharleston(willDo) {

    stopTimer();

    document.getElementById('charleston-confirm-ui').style.display = "none";



    if (currentGameMode === 'online') {

        // 🌟 修正1：自分が「はい」を押した記憶をしっかり残す！

        secondCharlestonParticipating[myPlayerIdx] = willDo;



        if (willDo) {

            console.log("[DEBUG] 第2交換に参加します。牌選択画面へ。");

            charlestonCount = 2;

            startCharlestonSelection();

        } else {

            console.log("[DEBUG] 第2交換をスルーします。サーバーへ通知。");

            document.getElementById('msg').innerText = "他のプレイヤーを待機中...";

            showCharlestonStatus(0, false); // 自分の画面に「過」を出す



            lobbyWs.send(JSON.stringify({

                type: "action",

                action: "second_charleston_turn", // 🌟 修正2：フリーズの原因だった間違った合言葉を修正！

                player_idx: myPlayerIdx,

                participate: false,

                tiles: []

            }));

        }

        return; // オンライン時はここで終了

    }



    // --- 以下、CPU戦の処理 ---

    processAskSecondCharleston(0, willDo);

}



// 🧠 参加/不参加の回答を記録し、次の人に質問を回す関数（CPU戦用）

function processAskSecondCharleston(askerIdx, willDo) {

    secondCharlestonParticipating[askerIdx] = willDo;

    if (askerIdx !== 0) {

        showCharlestonStatus(askerIdx, willDo);

        if (willDo) {

            hideCpuTiles[askerIdx] = 3;

            renderCPU();

        }

    } else {

        if (!willDo) {

            showCharlestonStatus(0, false);

        }

    }

    askedCount++;

    askNextSecondCharleston();

}



// 🏁 全員の回答が出揃った後、第2チャールストンを実行するかスキップするか判定する関数（CPU戦用）

async function finishAskSecondCharleston() {

    let activeCount = secondCharlestonParticipating.filter(p => p).length;



    if (activeCount <= 1) {

        showCenterMessage(`参加者不足<br><span style="color:#e74c3c;font-size:24px;">第2交換はスキップされます</span>`);

        await sleep(2000);

        hideCenterMessage();



        hideCpuTiles = [0, 0, 0, 0];

        clearCharlestonStatus();

        renderCPU();



        charlestonPhase = false;

        isProc = false;

        checkT();

    } else {

        if (secondCharlestonParticipating[0]) {

            hideCenterMessage();

            charlestonCount = 2;

            startCharlestonSelection();

            isProc = false;

        } else {

            execSecondCharleston("", "", "");

        }

    }

}



// 📤 第2チャールストンを実行する関数

async function execSecondCharleston(t1 = "", t2 = "", t3 = "") {

    console.log("========== [DEBUG execSecondCharleston] 実行開始 ==========");

    console.log(`[DEBUG execSecondCharleston] 受け取った牌: ${t1}, ${t2}, ${t3}`);

    console.log(`[DEBUG execSecondCharleston] currentGameMode: ${currentGameMode}`);

    console.log(`[DEBUG execSecondCharleston] myPlayerIdx: ${myPlayerIdx}`);

    console.log(`[DEBUG execSecondCharleston] 参加フラグ: ${secondCharlestonParticipating[myPlayerIdx]}`);



    stopTimer();

    isProc = true;

    document.getElementById('charleston-ui').style.display = "none";



    if (currentGameMode === 'online') {

        console.log("[DEBUG execSecondCharleston] オンラインモードの処理に入ります");



        if (secondCharlestonParticipating[myPlayerIdx] && t1 !== "") {

            console.log("[DEBUG execSecondCharleston] 参加状態＆牌指定あり。手牌から3枚削除します");

            let displayHand = [...myHand].sort((a, b) => SM[a] - SM[b]);

            [t1, t2, t3].forEach(t => {

                let idx = displayHand.indexOf(t);

                if (idx !== -1) displayHand.splice(idx, 1);

            });

            myHand = displayHand;

            exchangeSelection = [];

            showCharlestonStatus(0, true);

            render();



            document.getElementById('msg').innerText = "他のプレイヤーを待機中...";

            console.log(`[DEBUG execSecondCharleston] 🌟 サーバーへ action: 'second_charleston_turn' (参加) を送信します`);



            const sendData = {

                type: "action", action: "second_charleston_turn", player_idx: myPlayerIdx, participate: true, tiles: [t1, t2, t3]

            };

            console.log("[DEBUG execSecondCharleston] 送信データ中身:", sendData);

            lobbyWs.send(JSON.stringify(sendData));

        } else {

            console.log("[DEBUG execSecondCharleston] 不参加状態、または牌の指定なし");

            document.getElementById('msg').innerText = "他のプレイヤーを待機中...";

            console.log(`[DEBUG execSecondCharleston] 🌟 サーバーへ action: 'second_charleston_turn' (不参加) を送信します`);



            const sendData = {

                type: "action", action: "second_charleston_turn", player_idx: myPlayerIdx, participate: false, tiles: []

            };

            console.log("[DEBUG execSecondCharleston] 送信データ中身:", sendData);

            lobbyWs.send(JSON.stringify(sendData));

        }

        return;

    }



    // --- 以下CPU戦 ---

    console.log("[DEBUG execSecondCharleston] CPU戦モードの処理に入ります");

    let oldHandStr = [...myHand].sort((a, b) => SM[a] - SM[b]).join(',');



    if (secondCharlestonParticipating[0] && t1 !== "") {

        let oldCharleston = playerStats.secondCharlestonCount;

        playerStats.secondCharlestonCount++;

        checkTieredAchievement("charleston", "チャールストンの愛し子", "🔄", oldCharleston, playerStats.secondCharlestonCount, [5, 50, 500, 2500]);

        saveGameData();



        let displayHand = [...myHand].sort((a, b) => SM[a] - SM[b]);

        [t1, t2, t3].forEach(t => {

            let idx = displayHand.indexOf(t);

            if (idx !== -1) displayHand.splice(idx, 1);

        });

        myHand = displayHand;

        exchangeSelection = [];

        showCharlestonStatus(0, true);

        render();

    } else {

        exchangeSelection = [];

    }



    const data = await apiCall('/second_charleston', {

        player_idx: 0, t1: t1, t2: t2, t3: t3,

        p0: secondCharlestonParticipating[0],

        p1: secondCharlestonParticipating[1],

        p2: secondCharlestonParticipating[2],

        p3: secondCharlestonParticipating[3]

    });



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

    clearCharlestonStatus();

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



        // 自分のターンかどうかを判定

        let isMyTurn = (currentGameMode === 'online') ? (turn === myPlayerIdx) : (turn === 0);



        if (isMyTurn && drawnTile !== "" && displayHand.includes(drawnTile)) {

            displayHand.splice(displayHand.indexOf(drawnTile), 1);

            dTile = drawnTile;

        }



        displayHand.forEach((t, idx) => {

            const i = document.createElement('img'); i.className = 'tile'; i.src = `images/${t}.png`;

            if (charlestonPhase && exchangeSelection.includes(idx)) i.classList.add('selected-exchange');



            i.onclick = () => {

                if (charlestonPhase) {

                    toggleExchange(idx);

                } else if (!isProc && isMyTurn) {

                    let msgText = document.getElementById('msg').innerText;

                    if (msgText === "鳴き" || msgText === "海底牌" || msgText === "槍槓チャンス") return;



                    if (myWinTiles.length > 0) {

                        logMsg("アガリ後は手牌を入れ替えられません！右端のツモ牌を捨ててください。", true);

                    } else {

                        if (currentGameMode === 'online') onlineDiscard(t);

                        else discard(t, false);

                    }

                }

            };

            c.appendChild(i);

        });



        if (dTile !== "") {

            const i = document.createElement('img'); i.className = 'tile'; i.src = `images/${dTile}.png`;

            i.style.position = "absolute";

            i.style.left = "calc(100% + 15px)";

            i.style.top = "0";



            i.onclick = () => {

                if (!isProc && isMyTurn && !charlestonPhase) {

                    let msgText = document.getElementById('msg').innerText;

                    if (msgText === "鳴き" || msgText === "海底牌" || msgText === "槍槓チャンス") return;



                    if (currentGameMode === 'online') onlineDiscard(dTile);

                    else discard(dTile, true);

                }

            };

            c.appendChild(i);

        }



        renderMelds(myPlayerIdx);

        renderWinTiles(myPlayerIdx);



    } catch (e) {

        logMsg(`[描画エラー] ${e.message}`, true);

    }

}



// 🤖 CPU（または他家）の手牌を描画する関数

function renderCPU() {

    for (let viewPos = 1; viewPos <= 3; viewPos++) {

        let actualIdx = (myPlayerIdx + viewPos) % 4;

        const c = document.getElementById(`hand-${viewPos}`);

        if (!c) continue;

        c.innerHTML = "";



        let cpuHand = (currentGameMode === 'online') ? (cpuHands[actualIdx] || []) : (myAllHands[actualIdx] || []);

        let limit = cpuHand.length - (hideCpuTiles[actualIdx] || 0);



        for (let j = 0; j < limit; j++) {

            const t = cpuHand[j];

            const img = document.createElement('img');

            img.className = 'tile';



            img.src = (currentGameMode === 'online') ? `images/ura.png` : (isDevMode ? `images/${t}.png` : `images/ura.png`);



            if (j === limit - 1 && limit % 3 === 2) {

                img.style.position = 'absolute';

                img.style.margin = '0';



                if (viewPos === 1) { img.style.bottom = 'calc(100% + 10px)'; img.style.left = '0'; }

                if (viewPos === 2) { img.style.right = 'calc(100% + 15px)'; img.style.top = '0'; }

                if (viewPos === 3) { img.style.top = 'calc(100% + 10px)'; img.style.left = '0'; }

            }

            c.appendChild(img);

        }



        renderMelds(actualIdx);

        renderWinTiles(actualIdx);

    }

}



// 🀄 指定プレイヤーの鳴き牌（ポン・カン）を描画する関数

function renderMelds(actualIdx) {

    let viewPos = getViewPos(actualIdx);

    const m = document.getElementById(`meld-${viewPos}`);

    if (!m) return;

    m.innerHTML = "";



    let melds = (actualIdx === myPlayerIdx) ? myMelds : (myAllMelds[actualIdx] || []);

    melds.forEach(meld => {

        if (!meld || !Array.isArray(meld.tiles)) return;

        const g = document.createElement('div'); g.className = 'meld-group';



        let isHidden = meld.is_hidden === true || meld.is_hidden === "true";



        meld.tiles.forEach((t, tileIdx) => {

            const i = document.createElement('img'); i.className = 'tile';



            if (actualIdx !== myPlayerIdx && isHidden && !isDevMode) {

                i.src = 'images/ura.png';

            } else if (meld.type === 'ankan' && !isHidden) {

                if (tileIdx === 0 || tileIdx === 3) i.src = 'images/ura.png';

                else i.src = `images/${t}.png`;

            } else {

                i.src = `images/${t}.png`;

            }

            g.appendChild(i);

        });

        m.appendChild(g);

    });

}



// 🏆 アガリ牌（ロン・ツモした牌）を専用ゾーンに描画する関数

function renderWinTiles(actualIdx) {

    let viewPos = getViewPos(actualIdx);

    const wz = document.getElementById(`win-zone-${viewPos}`);

    if (!wz) return;

    wz.innerHTML = "";



    let winTiles = (actualIdx === myPlayerIdx) ? myWinTiles : (myAllWinTiles[actualIdx] || []);

    if (winTiles.length === 0) {

        wz.style.display = "none";

        return;

    }

    wz.style.display = "flex";



    winTiles.forEach((t, tIdx) => {

        const i = document.createElement('img'); i.className = 'tile'; i.src = `images/${t}.png`;

        if (viewPos === 0 || viewPos === 1) {

            i.style.zIndex = 1000 + tIdx;

        }

        wz.appendChild(i);

    });

}



// 🕹️ ターンの持ち主を判定し、自分の番ならアクションボタン（打牌やツモ等）を表示する関数

async function checkT() {

    isProc = true;



    for (let i = 0; i < 4; i++) {

        const nameEl = document.getElementById(`player-name-${i}`);

        if (nameEl) nameEl.classList.remove('active-turn');

    }

    const activeNameEl = document.getElementById(`player-name-${turn}`);

    if (activeNameEl) activeNameEl.classList.add('active-turn');



    document.querySelectorAll('.action-layer .btn-act').forEach(b => b.style.display = "none");

    document.getElementById('self-actions').innerHTML = '';



    if (turn === 0) {

        let totalVirtualTiles = myHand.length + (myMelds.length * 3);

        if (totalVirtualTiles % 3 === 2) {

            const msgEl = document.getElementById('msg');

            msgEl.innerText = "↓打牌↓";

            msgEl.className = "blink-text";



            await checkSelfMelds();



            let canWin = false;

            if (!justPonged) {

                canWin = await checkWinPossible();

            }



            const btnWin = document.getElementById('btn-win');

            const selfActions = document.getElementById('self-actions');



            let shouldAlert = false;

            if (btnWin.style.display === "block" || selfActions.innerHTML !== '') {

                shouldAlert = true;

                if (isAutoPlay && myWinTiles.length > 0 && selfActions.innerHTML === '') {

                    shouldAlert = false;

                }

            }

            if (shouldAlert) {

                playSE('alert');

            }



            isProc = false;



            let autoActed = false;

            if (isAutoPlay && myWinTiles.length > 0) {

                if (canWin && selfActions.innerHTML === '') {

                    isProc = true;

                    setTimeout(() => execTsumo(), 800 / speedMult);

                    autoActed = true;

                } else if (selfActions.innerHTML === '') {

                    if (drawnTile !== "") {

                        isProc = true;

                        setTimeout(() => discard(drawnTile, true), 600 / speedMult);

                        autoActed = true;

                    }

                } else {

                    showCenterMessage(`<span style="color:#f39c12;font-size:24px;">アクション可能なため<br>オート進行を一時待機します</span>`);

                    setTimeout(hideCenterMessage, 2500);

                }

            }



            if (!autoActed) {

                startTimer(timeDiscard, () => {

                    if (drawnTile !== "") {

                        discard(drawnTile, true);

                    } else {

                        let displayHand = [...myHand].sort((a, b) => SM[a] - SM[b]);

                        discard(displayHand[displayHand.length - 1], false);

                    }

                });

            }



        } else {

            if (wallCount === 1) {

                document.getElementById('msg').className = "";

                document.getElementById('msg').innerText = "海底牌";

                document.getElementById('btn-haitei-tsumo').style.display = "block";

                document.getElementById('btn-ryukyoku').style.display = "block";



                playSE('alert');



                isProc = false;



                startTimer(timeCall, () => {

                    document.getElementById('btn-ryukyoku').click();

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

            if (turn === 2) { img.style.right = 'calc(100% + 15px)'; img.style.top = '0'; }

            if (turn === 3) { img.style.top = 'calc(100% + 10px)'; img.style.left = '0'; }



            c.appendChild(img);



            updateWall(wallCount - 1);

        }



        setTimeout(cpu, 1000 / speedMult);

    }

}



// 🖱️ アクション用のボタン（ポン、カンなど）を動的に生成する関数

function createBtn(html, cls, onClick, parent) {

    let b = document.createElement('button');

    b.className = `btn-act ${cls}`;



    b.innerHTML = html;



    b.style.display = 'flex';

    b.style.alignItems = 'center';

    b.style.justifyContent = 'center';

    b.style.gap = '5px';



    b.onclick = onClick;

    parent.appendChild(b);

}



let currentValidMelds = [];



// 🔍 自分のツモ番で可能な鳴き（暗槓・加槓など）があるかサーバーに確認する関数

async function checkSelfMelds() {

    const actC = document.getElementById('self-actions'); actC.innerHTML = '';

    if (wallCount === 0) return;

    try {

        const data = await apiCall('/get_valid_self_melds', { player_idx: myPlayerIdx }); // 🌟 0をmyPlayerIdxに変更

        if (data.valid_melds) {

            currentValidMelds = data.valid_melds;

            renderSelfMeldsMenu();

        }

    } catch (e) { console.error(e); }

}



// 🎛️ 可能な暗槓や加槓をグループ化して、アクションボタンとして並べる関数

function renderSelfMeldsMenu() {

    const actC = document.getElementById('self-actions'); actC.innerHTML = '';



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

            createBtn(`${g.type} ${getImg(g.tile)} <span style="font-size:14px;">(選択)</span>`, 'btn-purple', () => renderAnkanSubMenu(g.tile), actC);

        } else if (g.type === "加槓" || g.type === "JokerSwap") {

            let btnClass = g.type.includes("槓") ? 'btn-purple' : 'btn-green';

            let label = g.type === "JokerSwap" ? "Swap" : g.type;

            createBtn(`${label} ${getImg(g.tile)}`, btnClass, () => {

                if (g.type === "JokerSwap") execJokerSwap(g.tile, g.original.season, g.original.target_idx);

                else execSelfMeld(g.type, g.tile, '');

            }, actC);

        } else {

            let btnLabel = g.type === "暗花槓" ? "暗花槓" : "昇格";



            if (g.seasons.length === 1) {

                createBtn(`${btnLabel} ${getImg(g.tile)}${getImg(g.seasons[0])}`, 'btn-green', () => execSelfMeld(g.type, g.tile, g.seasons[0]), actC);

            } else {

                createBtn(`${btnLabel} ${getImg(g.tile)} <span style="font-size:14px;">(選択)</span>`, 'btn-green', () => renderSelfMeldsSubMenu(g.type, g.tile, g.seasons), actC);

            }

        }

    });

}



// 🎛️ 複数の花牌から昇格させるものを選ぶ「サブメニュー」を描画する関数

function renderSelfMeldsSubMenu(type, tile, seasons) {

    const actC = document.getElementById('self-actions'); actC.innerHTML = '';

    const getImg = (tileName) => `<img src="images/${tileName}.png" style="height: 28px; border-radius: 2px; box-shadow: 1px 1px 3px rgba(0,0,0,0.5);">`;



    createBtn(`◀ 戻る`, 'btn-gray', () => renderSelfMeldsMenu(), actC);



    seasons.forEach(s => {

        let btnLabel = type === "暗花槓" ? "暗花槓" : "昇格";

        createBtn(`${btnLabel} ${getImg(tile)}${getImg(s)}`, 'btn-green', () => execSelfMeld(type, tile, s), actC);

    });

}



// 🎛️ 暗槓の際、「完全に伏せる」か「両端だけ裏返す」かを選ぶメニューを描画する関数

function renderAnkanSubMenu(tile) {

    const actC = document.getElementById('self-actions'); actC.innerHTML = '';

    const getImg = (tileName) => `<img src="images/${tileName}.png" style="height: 28px; border-radius: 2px; box-shadow: 1px 1px 3px rgba(0,0,0,0.5);">`;



    createBtn(`◀ 戻る`, 'btn-gray', () => renderSelfMeldsMenu(), actC);



    createBtn(`完全に伏せる ${getImg('ura')}${getImg('ura')}${getImg('ura')}${getImg('ura')}`, 'btn-purple', () => execSelfMeld('暗槓', tile, '', true), actC);



    createBtn(`通常通り ${getImg('ura')}${getImg(tile)}${getImg(tile)}${getImg('ura')}`, 'btn-blue', () => execSelfMeld('暗槓', tile, '', false), actC);

}



// 🏆 現在の手牌でアガれるか（役があるか）をサーバーに確認し、ツモボタンを出す関数

async function checkWinPossible() {

    const isHaitei = (wallCount === 0);

    const wd = await apiCall('/check_win', { player_idx: myPlayerIdx, is_ron: "false", is_rinshan: pendingIsRinshan, is_haitei: isHaitei, is_chankan: "false" }); // 🌟 0をmyPlayerIdxに変更

    if (wd.can_win) {

        const btn = document.getElementById('btn-win');

        btn.onclick = () => execTsumo();

        btn.style.display = "block";

        return true;

    }

    return false;

}



// 🎴 山から牌を1枚引く（ツモる）通信を行う関数

async function draw() {

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

function removeLastDiscard() {

    if (lastDiscardPlayer !== -1) {

        let viewPos = getViewPos(lastDiscardPlayer);

        const r = document.getElementById(`river-${viewPos}`);

        if (r && r.lastChild) r.removeChild(r.lastChild);

        lastDiscardPlayer = -1;

    }

}



// 🖐️ 指定した牌を捨てる通信を行い、CPUの反応待ちへ進む関数

async function discard(t, isTsumogiri = false) {

    stopTimer();

    if (isProc && !(isAutoPlay && myWinTiles.length > 0)) return;



    isProc = true;



    await apiCall('/discard', { player_idx: 0, tile: t });

    drawnTile = ""; lastDiscardPlayer = 0; justPonged = false;



    addR(0, t, isTsumogiri);

    render(); renderCPU();

    await sleep(500);

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



            if (data.kakan_tile) {

                wallCount += 1;

                updateWall(wallCount);

            }



            render(); renderCPU();

            showCallout(currentCpuTurn, "槓");

            await sleep(1500);



            if (data.kakan_tile) {

                const wd = await apiCall('/check_win', { player_idx: 0, last_tile: data.kakan_tile, is_ron: "true", is_haitei: "false", is_chankan: "true" });



                if (wd.can_win) {

                    const btnWin = document.getElementById('btn-win');

                    const btnSkip = document.getElementById('btn-skip');



                    let isAutoDigest = (isAutoPlay && myWinTiles.length > 0);

                    if (!isAutoDigest) {

                        btnWin.style.display = "block";

                        btnSkip.style.display = "block";

                        document.getElementById('msg').innerText = "槍槓チャンス";

                        playSE('alert');

                    }



                    let kTile = data.kakan_tile;

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



                        wallCount -= 1;

                        updateWall(wallCount);



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

                        setTimeout(() => btnWin.click(), 800 / speedMult);

                    } else {

                        startTimer(timeCall, () => btnSkip.click());

                    }

                    return;

                } else {

                    wallCount -= 1;

                    updateWall(wallCount);

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



        renderCPU();

        await sleep(500);

        await checkHumanReaction(currentCpuTurn, lastT);

    } catch (e) { if (e.message === "流局") handleRoundEnd(); }

}



// 👁️ 他家が牌を捨てた時、自分が鳴けるか・ロンできるか判定してボタンを出す関数

async function checkHumanReaction(discarderIdx, tile) {

    const count = myHand.filter(t => t === tile).length;

    const hasSeason = myHand.some(t => ["春", "夏", "秋", "冬"].includes(t));

    const isSeasonDiscard = ["春", "夏", "秋", "冬"].includes(tile);

    const isHaitei = (wallCount === 0);



    let showAny = false;



    const wd = await apiCall('/check_win', { player_idx: 0, last_tile: tile, is_ron: "true", is_haitei: isHaitei, is_chankan: "false" });

    if (wd.can_win) {

        const btn = document.getElementById('btn-win'); btn.style.display = "block";

        btn.onclick = () => execRon(false);

        if (isAutoPlay && myWinTiles.length > 0) {

            btn.style.display = "none";

        }

        showAny = true;

    }



    if (myWinTiles.length === 0) {

        if (count >= 2) { document.getElementById('btn-pon').style.display = "block"; showAny = true; }

        if (count >= 3 && wallCount > 0) { document.getElementById('btn-kan').style.display = "block"; showAny = true; }

        if (count === 2 && hasSeason && !isSeasonDiscard && wallCount > 0) { document.getElementById('btn-hanakan').style.display = "block"; showAny = true; }

    }



    renderCPU();



    if (showAny) {

        let isAutoDigest = (isAutoPlay && myWinTiles.length > 0);



        if (!isAutoDigest) {

            playSE('alert');

            document.getElementById('btn-skip').style.display = "block";

        }



        document.getElementById('btn-skip').onclick = () => {

            stopTimer();

            document.querySelectorAll('.action-layer .btn-act').forEach(b => b.style.display = "none");

            checkCpuReactions(discarderIdx, tile);

        };

        document.getElementById('msg').innerText = "鳴き";

        isProc = false;



        if (isAutoDigest) {

            isProc = true;

            setTimeout(() => execRon(false), 800 / speedMult);

        } else {

            startTimer(timeCall, () => {

                const skipBtn = document.getElementById('btn-skip');

                if (skipBtn && skipBtn.style.display !== "none") {

                    skipBtn.click();

                }

            });

        }



    } else {

        checkCpuReactions(discarderIdx, tile);

    }

}



// 🤖 自分や他家の捨て牌（または加槓）に対し、他のCPUが鳴くかロンするか判定させる関数

async function checkCpuReactions(discarderIdx, tile, isKakan = false) {

    try {

        isProc = true;

        const data = await apiCall('/check_cpu_reaction', { discarder_idx: discarderIdx, tile: tile, is_kakan: isKakan });



        if (data.reacted) {

            if (data.type === "ron") {

                showCallout(data.player, "胡");

                await sleep(1500);



                if (data.yaku) {

                    if (data.yaku.includes("地胡")) { showCallout(data.player, "地胡"); await sleep(4000); }



                    for (let y of data.yaku) {

                        if (y === "槍槓" || y === "花天月地") {

                            showCallout(data.player, y);

                            await sleep(1500);

                        }

                    }

                }



                if (!isKakan) removeLastDiscard();

                render(); renderCPU();



                checkT();

                return;

            } else {

                let callText = (data.type === "minkan" || data.type === "hanakan" || data.type === "ankan" || String(data.type).includes("kan")) ? "槓" : "碰";

                showCallout(data.player, callText);

                await sleep(1500);

                removeLastDiscard();

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

    if (isProc && !(isAutoPlay && myWinTiles.length > 0)) return;



    isProc = true;

    document.querySelectorAll('.action-layer .btn-act').forEach(b => b.style.display = "none");



    let currentDrawnTile = drawnTile;



    const data = await apiCall('/win_tsumo', { player_idx: myPlayerIdx, is_joker_swap: pendingIsJokerSwap, is_rinshan: pendingIsRinshan });



    // 🌟 オンラインならサーバーへ「ツモ！」のカットインを流させる

    if (currentGameMode === 'online') {

        lobbyWs.send(JSON.stringify({ type: "action", action: "play_callout", player_idx: myPlayerIdx, call_text: "自摸" }));

        return;

    }



    // --- 以下CPU戦の処理 ---

    drawnTile = ""; render(); renderCPU();



    showCallout(0, "自摸");

    await sleep(1500);



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

    if (isProc && !(isAutoPlay && myWinTiles.length > 0)) return;



    isProc = true;

    document.querySelectorAll('.action-layer .btn-act').forEach(b => b.style.display = "none");

    if (!isChankan) removeLastDiscard();



    const data = await apiCall('/win_ron', { player_idx: myPlayerIdx, tile: lastT, is_chankan: isChankan });



    // 🌟 オンラインならサーバーへ「ロン！」のカットインを流させる

    if (currentGameMode === 'online') {

        lobbyWs.send(JSON.stringify({ type: "action", action: "play_callout", player_idx: myPlayerIdx, call_text: "胡" }));

        return;

    }



    // --- 以下CPU戦の処理 ---

    render(); renderCPU();



    showCallout(0, "胡");

    await sleep(1500);



    if (data.yaku) {

        if (data.yaku.includes("地胡")) { showCallout(0, "地胡"); await sleep(4000); }



        for (let y of data.yaku) {

            if (y === "槍槓" || y === "花天月地") {

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

    removeLastDiscard();



    await apiCall('/meld', { player_idx: myPlayerIdx, type: type, tile: lastT });



    let callText = (type.includes("槓") || type.includes("カン")) ? "槓" : "碰";



    if (type === 'カン' || type === '花槓') {

        if (type === '花槓') {

            // 🏆 ここを変更！【花槓マスター】（明槓）

            let oldHanakan = playerStats.hanakanCount;

            playerStats.hanakanCount++;

            checkTieredAchievement("hanakan", "花槓マスター", "🌸", oldHanakan, playerStats.hanakanCount, [10, 50, 100, 500]);

            saveGameData();

        }

    }



    // 🌟 オンラインなら発声と状態のセットを通信に任せる

    if (currentGameMode === 'online') {

        lobbyWs.send(JSON.stringify({ type: "action", action: "play_callout", player_idx: myPlayerIdx, call_text: callText }));

        if (type === 'カン' || type === '花槓') { pendingIsRinshan = true; justPonged = false; }

        else { justPonged = true; }

        return;

    }



    // --- 以下CPU戦の処理 ---

    render(); renderCPU();



    showCallout(0, callText);

    await sleep(1500);



    if (type === 'カン' || type === '花槓') {

        pendingIsRinshan = true; justPonged = false;

    } else {

        justPonged = true;

    }



    isProc = false; checkT();

}



// 🗣️ 自分のツモ番で「暗槓」や「加槓」を実行する関数

async function execSelfMeld(type, t, s, isHidden = false) {

    stopTimer();

    if (isProc) return; isProc = true; document.getElementById('self-actions').innerHTML = '';



    if (type.includes("花槓")) {

        // 🏆 ここを変更！【花槓マスター】（暗花槓など）

        let oldHanakan = playerStats.hanakanCount;

        playerStats.hanakanCount++;

        checkTieredAchievement("hanakan", "花槓マスター", "🌸", oldHanakan, playerStats.hanakanCount, [10, 50, 100, 500]);

        saveGameData();

    }



    const data = await apiCall('/self_meld', { player_idx: myPlayerIdx, type: type, tile: t, season: s, is_hidden: isHidden });



    // 🌟 オンラインなら発声と状態のセットを通信に任せる

    if (currentGameMode === 'online') {

        if (data.chankan_occurred) {

            lobbyWs.send(JSON.stringify({ type: "action", action: "play_callout", player_idx: myPlayerIdx, call_text: "加槓" }));

            // 槍槓された場合は少し遅れてロンのカットインを流す

            setTimeout(async () => {

                await apiCall('/win_ron', { player_idx: data.winner, tile: data.tile, is_chankan: "true" });

                lobbyWs.send(JSON.stringify({ type: "action", action: "play_callout", player_idx: data.winner, call_text: "胡" }));

            }, 1500);

        } else {

            lobbyWs.send(JSON.stringify({ type: "action", action: "play_callout", player_idx: myPlayerIdx, call_text: "槓" }));

        }

        pendingIsRinshan = true; justPonged = false;

        return;

    }



    // --- 以下CPU戦の処理 ---

    render(); renderCPU();



    if (data.chankan_occurred) {

        showCallout(0, "加槓");

        await sleep(1500);



        showCallout(data.winner, "胡");

        await sleep(1500);



        showCallout(data.winner, "槍槓");

        await sleep(1500);



        lastT = t;



        if (wallCount === 0) {

            showCallout(data.winner, "花天月地");

            await sleep(1500);

        }



        if (data.winner === 0) {

            await execRon(true);

        } else {

            await apiCall('/win_ron', { player_idx: data.winner, tile: data.tile, is_chankan: "true" });

        }



        render(); renderCPU();

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

    if (isProc) return; isProc = true; document.getElementById('self-actions').innerHTML = '';



    await apiCall('/joker_swap', { player_idx: myPlayerIdx, tile: t, season: season, target_idx: targetIdx });



    // 🏆 ここを変更！【スワップの支配者】

    let oldSwap = playerStats.jokerSwapCount;

    playerStats.jokerSwapCount++;

    checkTieredAchievement("jokerswap", "スワップの支配者", "🃏", oldSwap, playerStats.jokerSwapCount, [1, 10, 50, 150]);

    saveGameData();



    // 🌟 オンラインなら発声と状態のセットを通信に任せる

    if (currentGameMode === 'online') {

        lobbyWs.send(JSON.stringify({ type: "action", action: "play_callout", player_idx: myPlayerIdx, call_text: "JokerSwap" }));

        pendingIsJokerSwap = true;

        pendingIsMiaoshou = (season === "春");

        justPonged = false;

        return;

    }



    // --- 以下CPU戦の処理 ---

    render(); renderCPU();



    showCallout(0, "JokerSwap");

    await sleep(1500);



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

    checkCpuReactions(lastDiscardPlayer, lastT);

}



// 🏁 1局の終了（アガリまたは流局）時に点数計算を行い、リザルト画面を表示する関数

async function handleRoundEnd() {

    stopTimer();



    // 🏆 ここを変更！【継続は力なり】

    let oldRounds = playerStats.totalRoundsPlayed;

    playerStats.totalRoundsPlayed++;

    checkTieredAchievement("rounds", "継続は力なり", "⏳", oldRounds, playerStats.totalRoundsPlayed, [10, 100, 1000, 5000]);

    saveGameData();



    document.getElementById('settings-modal').style.display = 'none';

    document.getElementById('howto-modal').style.display = 'none';

    document.getElementById('yaku-modal').style.display = 'none';

    document.getElementById('waits-panel').style.display = 'none';



    isProc = true;

    document.getElementById('msg').innerHTML = "局終了<br>点数計算中...";

    document.querySelectorAll('.action-layer .btn-act').forEach(b => b.style.display = 'none');



    isAutoPlay = false;

    const btnAuto = document.getElementById('btn-auto-play');

    if (btnAuto) {

        btnAuto.innerText = "オート(和了後): OFF";

        btnAuto.style.background = "#7f8c8d";

        btnAuto.style.boxShadow = "0 3px #95a5a6";

    }



    const calcData = await apiCall('/calculate_round_scores');



    let iWon = false;

    for (let res of calcData.results) {

        if (res.player === 0) {

            iWon = true;

            playerStats.totalWins++;



            // --- 💰 ここに追加：大富豪の判定 ---

            let oldTotalScore = playerStats.totalScoreSum || 0;

            playerStats.totalScoreSum = oldTotalScore + res.total_score;

            // tiers は renderAchievements で設定した [1000, 500000, 1000000, 5000000] に合わせる

            checkTieredAchievement("billionaire", "大富豪", "🏦", oldTotalScore, playerStats.totalScoreSum, [1000, 10000, 50000, 1000000]);



            // 🏆 ここに追加！【無限の選択肢】（アガった瞬間に27面待ちだったか）

            if (currentWaits.length >= 27 && playerStats.wideWaitCount === 0) {

                playerStats.wideWaitCount = 1;

                showAchievementUnlock("無限の選択肢", "🌀");

            }



            // 🏆 ここに追加！【神の領域】＆【インフレの体現者】

            for (let detail of res.details) {

                if (detail.yaku.includes("天胡") || detail.yaku.includes("地胡")) {

                    if (playerStats.heavenlyCount === 0) {

                        playerStats.heavenlyCount = 1;

                        showAchievementUnlock("神の領域", "⚡");

                    }

                }

                if (detail.yaku.length > playerStats.maxComboCount) {

                    let isFirstTime = (playerStats.maxComboCount < 7 && detail.yaku.length >= 7);

                    playerStats.maxComboCount = detail.yaku.length;

                    if (isFirstTime) showAchievementUnlock("インフレの体現者", "🌈");

                }

            }



            // 🏆 ここに追加！【四季を統べる者】

            let allMyTiles = [...myHand];

            myMelds.forEach(m => m.tiles.forEach(t => allMyTiles.push(t)));

            if (allMyTiles.includes("春") && allMyTiles.includes("夏") && allMyTiles.includes("秋") && allMyTiles.includes("冬")) {

                if (playerStats.masterOfSeasonsCount === 0) {

                    playerStats.masterOfSeasonsCount = 1;

                    showAchievementUnlock("四季を統べる者", "🌍");

                }

            }



            // --- 💰 ここに追加：最高到達打点の判定 ---

            if (res.total_score > playerStats.maxScore) {

                let oldMax = playerStats.maxScore;

                playerStats.maxScore = res.total_score;

                // tiers は [100, 1000, 5000, 10000] に合わせる

                checkTieredAchievement("score", "最高到達打点", "💰", oldMax, playerStats.maxScore, [100, 500, 1000, 2000]);



                playerStats.maxScoreHand = {

                    tiles: [...myHand],

                    melds: JSON.parse(JSON.stringify(myMelds)),

                    winTile: res.details.length > 0 ? res.details[0].tile : ""

                };

            }



            if (Array.isArray(playerStats.yakuCollected)) {

                let migrated = {};

                playerStats.yakuCollected.forEach(y => migrated[y] = 1);

                playerStats.yakuCollected = migrated;

            }



            for (let detail of res.details) {

                for (let y of detail.yaku) {

                    if (!playerStats.yakuCollected[y]) {

                        playerStats.yakuCollected[y] = 0;

                    }

                    playerStats.yakuCollected[y]++;

                }

            }

        }

    }



    // 📊 詳細戦績の更新

    saveGameData();



    for (let res of calcData.results) {

        let groupedDetails = {};

        for (let detail of res.details) {

            let yakuKey = [...detail.yaku].sort().join(",");

            let groupKey = `${detail.tile}_${yakuKey}`;



            if (!groupedDetails[groupKey]) {

                groupedDetails[groupKey] = {

                    tile: detail.tile,

                    yaku: detail.yaku,

                    score: detail.score,

                    count: 1,

                    total_score: detail.score

                };

            } else {

                groupedDetails[groupKey].count++;

                groupedDetails[groupKey].total_score += detail.score;

            }

        }



        let sortedDetails = Object.values(groupedDetails);

        sortedDetails.sort((a, b) => {

            if (b.total_score !== a.total_score) {

                return b.total_score - a.total_score;

            }

            return SM[a.tile] - SM[b.tile];

        });



        let yakuHtml = "";

        for (let d of sortedDetails) {

            let tile = d.tile;



            const tierOrder = {

                "yaku-tier-64": 1,

                "yaku-tier-32": 2,

                "yaku-tier-16": 3,

                "yaku-tier-8": 4,

                "yaku-tier-6": 5,

                "yaku-tier-4": 6,

                "yaku-tier-2": 7,

                "yaku-tier-1": 8,

                "yaku-tier-multi": 9

            };

            d.yaku.sort((a, b) => {

                let tierA = getYakuTierClass(a);

                let tierB = getYakuTierClass(b);



                let orderA = tierOrder[tierA] !== undefined ? tierOrder[tierA] : 99;

                let orderB = tierOrder[tierB] !== undefined ? tierOrder[tierB] : 99;



                return orderA - orderB;

            });



            let countStr = d.count > 1 ? `<span style="color: #ff9ff3; font-weight: bold; margin-left: 5px; font-size: 18px;">×${d.count}枚</span>` : "";

            let scoreStr = d.count > 1 ? `<span style="font-size: 14px; color:#aaa;">(${d.score}点 × ${d.count})</span> <br> ${d.total_score}点` : `${d.score}点`;



            yakuHtml += `

                                            <div style="font-size: 20px; display: flex; align-items: center; justify-content: space-between; width: 100%; background: rgba(0,0,0,0.6); padding: 8px 15px; border-radius: 8px; border-left: 5px solid #f39c12; box-sizing: border-box;">

                                                <div style="display: flex; align-items: center; width: 160px;">

                                                    <span style="color: #ddd; margin-right: 10px; font-size: 16px;">和了牌</span>

                                                    <img src="images/${tile}.png" style="width:28px; height:39px; border-radius: 2px;">

                                                    ${countStr}

                                                </div>

                                                <div style="flex-grow: 1; text-align: center; display: flex; flex-wrap: wrap; justify-content: center; gap: 4px; padding: 0 10px;">

                                                    ${d.yaku.map(y => `<span class="yaku-tag ${getYakuTierClass(y)}"><span class="zh">${y}</span><span class="ja">${getJaYakuName(y)}</span><span class="en">${getEnYakuName(y)}</span></span>`).join("")}

                                                </div>

                                                <div style="color: #2ecc71; font-weight: bold; min-width: 140px; text-align: right;">

                                                    ${scoreStr}

                                                </div>

                                            </div>`;

        }



        let closedHand = (res.player === 0) ? myHand : (myAllHands[res.player] || []);

        let melds = (res.player === 0) ? myMelds : (myAllMelds[res.player] || []);

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

                for (let i = 0; i < m.tiles.length; i++) {

                    let t = m.tiles[i];

                    let src = (m.type === 'ankan' && (i === 0 || i === 3)) ? 'ura' : t;

                    handHtml += `<img src="images/${src}.png" style="width: 36px; height: 50px; border-radius: 3px;">`;

                }

                handHtml += `</div>`;

            }

        }

        handHtml += `</div>`;



        document.getElementById('win-label-text').innerText = res.player === 0 ? "あなたの和了！" : `CPU ${res.player} の和了！`;

        document.getElementById('win-score').innerText = `${res.total_score} 点`;

        document.getElementById('win-hand-display').innerHTML = handHtml;

        document.getElementById('win-yaku').innerHTML = yakuHtml;



        document.getElementById('overlay').scrollTop = 0;

        document.getElementById('overlay').style.display = "flex";



        playSE('score');



        await waitWithTimerAndSkip(8);



        document.getElementById('overlay').style.display = "none";

        await sleep(500);

    }



    scores = calcData.scores;

    let rankingPoints = calcData.ranking_points || [0, 0, 0, 0];



    // 🏆 ここに追加！【漁夫の利】

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



    let startIdx = dealer;

    for (let step = 0; step < 4; step++) {

        let targetIdx = (startIdx + step) % 4;

        let roundScore = scores[targetIdx];

        let rankPoint = rankingPoints[targetIdx];



        await sleep(1000);



        let rsEl = document.getElementById(`player-round-score-${targetIdx}`);

        let sign = roundScore > 0 ? "+" : "";



        let mainCls = roundScore > 0 ? "score-main-plus" : (roundScore < 0 ? "score-main-minus" : "score-main-zero");

        let rankCls = rankPoint > 0 ? "score-rank-plus" : "score-rank-zero";



        rsEl.innerHTML = `<div class="${mainCls}">${sign}${roundScore}</div>

                                                      <div class="${rankCls}">順位点 +${rankPoint}</div>`;

        rsEl.className = `player-round-score show-score`;



        playSE('coin');



        totalScores[targetIdx] += roundScore + rankPoint;

        let scoreEl = document.getElementById(`player-score-${targetIdx}`);

        scoreEl.innerHTML = `持ち点: ${totalScores[targetIdx]}`;



        scoreEl.style.transform = "scale(1.2)";

        setTimeout(() => scoreEl.style.transform = "scale(1)", 200);

    }



    // ... (前略：点数加算アニメーションのループ) ...



    await sleep(3500);



    for (let i = 0; i < 4; i++) {

        document.getElementById(`player-round-score-${i}`).className = "player-round-score";

    }



    if (currentRound >= 4) {

        // 🌟 修正箇所！ apiCall('/next_round') でデータが消し飛ぶ「前」に判定する！



        // 🏆 【逆転の劇薬】（現在の最終スコアから、今回の獲得スコアを引いて開始時の順位を逆算）

        let oldScores = [];

        for (let i = 0; i < 4; i++) {

            oldScores[i] = totalScores[i] - (scores[i] + rankingPoints[i]);

        }

        let sortedOld = [...oldScores].sort((a, b) => b - a);

        let oldRank = sortedOld.indexOf(oldScores[0]) + 1; // 4局目開始時点の自分の順位



        let sortedIndices = [0, 1, 2, 3].sort((a, b) => totalScores[b] - totalScores[a]);

        let avgScore = totalScores.reduce((a, b) => a + b, 0) / 4;

        let myRank = sortedIndices.indexOf(0) + 1; // ゲーム終了時の最終順位



        if (oldRank === 4 && myRank === 1 && playerStats.comebackCount === 0) {

            playerStats.comebackCount = 1;

            showAchievementUnlock("逆転の劇薬", "💊");

        }



        // 📊 ゲーム終了時の戦績記録

        playerStats.totalGamesPlayed++;

        playerStats.rankCounts[myRank - 1]++;



        if (myRank === 1) {

            playerStats.currentWinStreak++;

            // 🏆 【連勝記録】

            if (playerStats.currentWinStreak > playerStats.maxWinStreak) {

                let oldStreak = playerStats.maxWinStreak;

                playerStats.maxWinStreak = playerStats.currentWinStreak;

                checkTieredAchievement("streak", "連勝記録", "🔥", oldStreak, playerStats.maxWinStreak, [2, 5, 10, 20]);

            }

        } else {

            playerStats.currentWinStreak = 0;

        }



        playerStats.recentRecords.unshift({ rank: myRank, score: totalScores[0] });

        if (playerStats.recentRecords.length > 20) playerStats.recentRecords.pop();



        let oldRate = playerRatings[0];

        let rateChanges = [0, 0, 0, 0];



        if (currentGameMode === 'online' || currentGameMode === 'cpu') {

            let placementPoints = [15, 5, -5, -15];

            for (let rank = 0; rank < 4; rank++) {

                let pIdx = sortedIndices[rank];

                let scoreBonus = Math.floor((totalScores[pIdx] - avgScore) / 100);

                let change = placementPoints[rank] + scoreBonus;

                rateChanges[pIdx] = change;

                playerRatings[pIdx] += change;

                if (playerRatings[pIdx] < 0) playerRatings[pIdx] = 0;

            }

            // 🏆 レート実績の判定

            let newRate = playerRatings[0];

            if (oldRate < 1600 && newRate >= 1600) showAchievementUnlock("レートの階段 (1600)", "📈");

            if (oldRate < 1700 && newRate >= 1700) showAchievementUnlock("レートの階段 (1700)", "📈");

            if (oldRate < 1800 && newRate >= 1800) showAchievementUnlock("レートの階段 (1800)", "📈");

            if (oldRate < 1900 && newRate >= 1900) showAchievementUnlock("レートの階段 (1900)", "📈");

            if (oldRate < 2000 && newRate >= 2000) showAchievementUnlock("頂に立つ者", "👑");

        }



        saveGameData();



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



        // 🌟🌟 実績ポップアップがすべて出終わるまで待機する 🌟🌟

        while (isToastShowing || toastQueue.length > 0) {

            await new Promise(resolve => setTimeout(resolve, 500));

        }



        alert(resultMsg);

        sessionStorage.setItem('shiki_mahjong_return_home', 'true');



        // 🌟 修正箇所！ すべての処理が終わった一番最後にサーバーデータをリセットする

        await apiCall('/next_round');



        location.reload();

        return;

    }



    await apiCall('/next_round');

    // ... (以下、既存の 1〜3局目の終了処理が続く) ...



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

}



// 🗑️ 捨てられた牌を河（捨て牌置き場）に描画する関数

function addR(actualIdx, t, isTsumogiri = false) {

    playSE('dahai');

    let viewPos = getViewPos(actualIdx);

    const r = document.getElementById(`river-${viewPos}`);

    if (!r) return;

    const i = document.createElement('img');

    i.className = 'tile';

    i.src = `images/${t}.png`;



    if (isTsumogiri) {

        i.classList.add('discard-tsumogiri');

    } else {

        i.classList.add('discard-tedashi');

    }



    r.appendChild(i);

}



// ==========================================

// ★ 画面遷移・モード選択制御

// ==========================================



// 🏠 タイトル画面から「モード選択画面」へ移行する関数

function showModeSelect() {

    playSE('start');



    if (!audioState.initialized) {

        audioState.initialized = true;

        if (audioState.bgmOn) {

            sounds.bgm.play().catch(e => console.log("BGM自動再生ブロック:", e));

        }

    }



    updateProfileUI();

    document.getElementById('title-screen').style.display = 'none';

    document.getElementById('mode-select-screen').style.display = 'flex';

}



// 🔙 モード選択画面から「タイトル画面」へ戻る関数

function backToTitle() {

    playSE('click');

    document.getElementById('mode-select-screen').style.display = 'none';

    document.getElementById('title-screen').style.display = 'flex';

}



// 🎮 「CPU戦」を選択し、ゲーム画面へ移行して初期化を開始する関数

function startCpuGame() {

    playSE('click');

    currentGameMode = 'cpu';

    const modeScreen = document.getElementById('mode-select-screen');



    modeScreen.style.opacity = '0';

    modeScreen.style.transition = 'opacity 1s';



    setTimeout(() => {

        modeScreen.style.display = 'none';

        modeScreen.style.opacity = '1';

        init();

    }, 1000);

}



// ==========================================

// ★ 実績（アチーブメント）画面の描画

// ==========================================



// 🏅 実績（アチーブメント）画面を開き、達成度を描画する関数

function openAchievements() {

    playSE('click');

    renderAchievements();

    document.getElementById('achievement-modal').style.display = 'flex';

}



// 🏅 実績画面を閉じる関数

function closeAchievements() {

    playSE('click');

    document.getElementById('achievement-modal').style.display = 'none';

}



function switchAchieveTab(evt, tabId) {

    const tabContents = document.getElementsByClassName("achieve-tab-content");

    for (let i = 0; i < tabContents.length; i++) tabContents[i].style.display = "none";

    const tabLinks = document.getElementsByClassName("yaku-tab-btn");

    for (let i = 0; i < tabLinks.length; i++) tabLinks[i].classList.remove("active");

    document.getElementById(tabId).style.display = "block";

    evt.currentTarget.classList.add("active");

}



// 📊 実績データと役コレクター図鑑のHTMLを組み立てて画面に描画する関数

function renderAchievements() {

    // --- 1. 🏆 実績タブの描画 ---

    const container = document.getElementById('achieve-container');

    container.innerHTML = '';



    // 🌟 現在のレートを取得（オンラインモードなら変動、初期は1500）

    let currentRate = playerRatings[0];

    let totalScore = playerStats.totalScoreSum || 0;



    const achievements = [

        // 📈 積み上げ型（レート・スコア・回数）

        { id: "rating", icon: "📈", title: "レートの階段", desc: "自身のレート(R)を指定値まで上げる", val: currentRate, tiers: [1600, 1700, 1800, 1900], unit: "R" },

        { id: "billionaire", icon: "🏦", title: "大富豪", desc: "生涯の累計獲得点数", val: totalScore, tiers: [1000, 10000, 50000, 1000000], unit: "点" },

        { id: "score", icon: "💰", title: "最高到達打点", desc: "1局での最高獲得点数", val: playerStats.maxScore, tiers: [100, 500, 1000, 2000], unit: "点" },

        { id: "streak", icon: "🔥", title: "連勝記録", desc: "総合1位を連続で獲得した回数", val: playerStats.maxWinStreak, tiers: [2, 5, 7, 10], unit: "連勝" },

        { id: "rounds", icon: "⏳", title: "継続は力なり", desc: "対局を完了した累計局数", val: playerStats.totalRoundsPlayed, tiers: [10, 100, 1000, 5000], unit: "局" },

        { id: "charleston", icon: "🔄", title: "チャールストンの愛し子", desc: "第2交換に参加した回数", val: playerStats.secondCharlestonCount, tiers: [5, 50, 500, 2500], unit: "回" },

        { id: "hanakan", icon: "🌸", title: "花槓マスター", desc: "四季牌を使って花槓を作った回数", val: playerStats.hanakanCount, tiers: [10, 50, 100, 500], unit: "回" },

        { id: "jokerswap", icon: "🃏", title: "スワップの支配者", desc: "JokerSwapを成功させた回数", val: playerStats.jokerSwapCount, tiers: [1, 10, 50, 150], unit: "回" },



        // 👑 一発達成型 (1回でプラチナ)

        { id: "rating_god", icon: "👑", title: "頂に立つ者", desc: "レート2000(称号「あたまおかしい」)到達", val: currentRate >= 2000 ? 1 : 0, tiers: [1, 1, 1, 1], unit: "回" },

        { id: "wide_wait", icon: "🌀", title: "無限の選択肢", desc: "聴牌時の待ち牌が「27種類」ある状態で和了", val: playerStats.wideWaitCount, tiers: [1, 1, 1, 1], unit: "回" },

        { id: "master_of_seasons", icon: "🌍", title: "四季を統べる者", desc: "1局の手牌に四季牌4種すべてを揃えて和了", val: playerStats.masterOfSeasonsCount, tiers: [1, 1, 1, 1], unit: "回" },

        { id: "full_house", icon: "🌈", title: "インフレの体現者", desc: "一局で7種類以上の役を複合させる", val: playerStats.maxComboCount >= 7 ? 1 : 0, tiers: [1, 1, 1, 1], unit: "回" },

        { id: "heavenly", icon: "⚡", title: "神の領域", desc: "天胡または地胡を達成する", val: playerStats.heavenlyCount, tiers: [1, 1, 1, 1], unit: "回" },

        { id: "welcomehome", icon: "🎲", title: "おかえりなさい", desc: "交換で出した3枚と同じ3枚を受け取る", val: playerStats.welcomeHomeCount, tiers: [1, 1, 1, 1], unit: "回" },

        { id: "pacifist", icon: "🕊️", title: "漁夫の利", desc: "自分が和了していないのに局の順位が1位になる", val: playerStats.pacifistCount, tiers: [1, 1, 1, 1], unit: "回" },

        { id: "comeback", icon: "💊", title: "逆転の劇薬", desc: "4局開始時4位から1位で終了する", val: playerStats.comebackCount, tiers: [1, 1, 1, 1], unit: "回" },

    ];



    let gridHtml = ``;



    achievements.forEach(a => {

        let rank = 0; // 0:なし, 1:銅, 2:銀, 3:金, 4:プラチナ

        if (a.val >= a.tiers[3]) rank = 4;

        else if (a.val >= a.tiers[2]) rank = 3;

        else if (a.val >= a.tiers[1]) rank = 2;

        else if (a.val >= a.tiers[0]) rank = 1;



        let medalClass = ["medal-none", "medal-bronze", "medal-silver", "medal-gold", "medal-platinum"][rank];

        let statusText = rank === 0 ? "未達成" : ["", "ブロンズ", "シルバー", "ゴールド", "プラチナ"][rank] + " 獲得！";

        let statusColor = rank === 0 ? "#7f8c8d" : ["", "#cd7f32", "#bdc3c7", "#f1c40f", "#00d2d3"][rank];



        let nextTarget = a.tiers[Math.min(rank, 3)];

        let isOneShot = (a.tiers[0] === 1 && a.tiers[3] === 1);

        let progressPercent = (rank >= 4 || (isOneShot && rank >= 1)) ? 100 : Math.min(100, (a.val / nextTarget) * 100);



        gridHtml += `

            <div class="achieve-card ${medalClass}">

                <div class="achieve-icon">${a.icon}</div>

                <div class="achieve-title">${a.title}</div>

                <div class="achieve-desc">${a.desc}</div>

                

                <div class="achieve-progress-bg">

                    <div class="achieve-progress-bar" style="width: ${progressPercent}%; background: ${statusColor};"></div>

                </div>

                

                <div style="width: 100%; display: flex; justify-content: space-between; font-size: 11px; color: #aaa; margin-bottom: 5px;">

                    <span>現在: ${a.val} ${a.unit === "R" ? "" : a.unit}</span>

                    <span>${(rank >= 4 || (isOneShot && rank >= 1)) ? "MAX" : "次: " + nextTarget + (a.unit === "R" ? "" : " " + a.unit)}</span>

                </div>

                

                <div class="achieve-status" style="color: ${statusColor};">${statusText}</div>

            </div>

        `;

    });

    container.innerHTML = gridHtml;





    // --- 2. 📜 役コレクター図鑑タブの描画 ---

    const dexContainer = document.getElementById('yaku-dex-container');

    dexContainer.innerHTML = '';



    const allYakuList = Object.keys(yakuJaMap);

    let collectedCount = 0;



    // 分類用の箱（1点役「yaku-tier-1」も確実に拾うように修正）

    let yakuByTier = { "64": [], "32": [], "16": [], "8": [], "6": [], "4": [], "2": [], "multi": [] };



    allYakuList.forEach(yakuZh => {

        let tierClass = getYakuTierClass(yakuZh);

        let key = "2"; // デフォルトを「2点・1点」に設定



        if (tierClass.includes("64")) key = "64";

        else if (tierClass.includes("32")) key = "32";

        else if (tierClass.includes("16")) key = "16";

        else if (tierClass.includes("8")) key = "8";

        else if (tierClass.includes("6")) key = "6";

        else if (tierClass.includes("4")) key = "4";

        else if (tierClass.includes("multi")) key = "multi";



        if (yakuByTier[key]) yakuByTier[key].push(yakuZh);

    });



    const tierNameMap = {

        "64": { ja: "👑 64点役", zh: "64点", en: "64 Points" },

        "32": { ja: "🔥 32点役", zh: "32点", en: "32 Points" },

        "16": { ja: "⚔️ 16点役", zh: "16点", en: "16 Points" },

        "8": { ja: "🔮 8点役", zh: "8点", en: "8 Points" },

        "6": { ja: "💎 6点役", zh: "6点", en: "6 Points" },

        "4": { ja: "🛡️ 4点役", zh: "4点", en: "4 Points" },

        "2": { ja: "🛡️ 2点・1点役", zh: "2点・1点", en: "2/1 Points" },

        "multi": { ja: "✨ 特殊役 (乗算)", zh: "特殊", en: "Special" }

    };



    ["64", "32", "16", "8", "6", "4", "2", "multi"].forEach(tierKey => {

        const yakuList = yakuByTier[tierKey];

        if (yakuList.length === 0) return;



        let names = tierNameMap[tierKey];

        let tierHtml = `

            <div class="yaku-dex-tier-group">

                <div class="yaku-dex-tier-header">

                    <span class="zh">${names.zh}</span><span class="ja">${names.ja}</span><span class="en">${names.en}</span>

                </div>

                <div class="yaku-dex-card-grid">`;



        yakuList.forEach(yakuZh => {

            let count = playerStats.yakuCollected[yakuZh] || 0;

            if (count > 0) collectedCount++;

            let rankClass = getYakuRankClass(yakuZh, count);



            tierHtml += `

                <div class="yaku-dex-card ${rankClass}">

                    <div class="dex-title-area" style="margin-bottom: 0;">

                        <span class="dex-yaku-name">

                            <span class="zh">${yakuZh}</span>

                            <span class="ja">${getJaYakuName(yakuZh)}</span>

                            <span class="en">${getEnYakuName(yakuZh)}</span>

                        </span>

                        <span class="dex-points">和了: ${count} 回</span>

                    </div>

                </div>`;

        });

        tierHtml += `</div></div>`;

        dexContainer.innerHTML += tierHtml;

    });



    document.getElementById('dex-comp-count').innerText = collectedCount;

    document.getElementById('dex-total-count').innerText = allYakuList.length;

}



// 📊 リザルト画面・チャート描画制御用の変数

let radarChart = null;

let pieChart = null;

let lineChart = null;



// ==========================================

// ★ マイページ・プロフィール制御

// ==========================================



// 📊 タイトル画面用のプロフィール描画（折れ線グラフ化）

function updateProfileUI() {

    document.getElementById('prof-name').innerText = playerStats.playerName;

    let rate = playerRatings[0];

    document.getElementById('prof-rank').innerText = `【${getRatingTitle(rate)}】 R:${rate}`;



    // 折れ線グラフの描画

    if (lineChart) lineChart.destroy();

    const ctxLine = document.getElementById('prof-history-chart').getContext('2d');



    // データがない場合はダミーを入れる

    let recordsRev = playerStats.recentRecords.length > 0 ? [...playerStats.recentRecords].reverse() : [0];

    let lineData = recordsRev.map(r => (typeof r === 'object') ? r.rank : r);

    let scoreData = recordsRev.map(r => (typeof r === 'object') ? r.score : null);



    Chart.defaults.color = '#fff';

    lineChart = new Chart(ctxLine, {

        type: 'line',

        data: {

            labels: lineData.map((_, i) => `${lineData.length - i}戦前`),

            datasets: [{

                label: '順位',

                data: lineData,

                borderColor: '#e67e22',

                backgroundColor: 'rgba(230, 126, 34, 0.2)',

                borderWidth: 3,

                tension: 0.3,

                fill: true,

                pointBackgroundColor: '#f1c40f',

                pointRadius: 6,

                pointHoverRadius: 8,

                clip: false

            }]

        },

        options: {

            responsive: true,

            maintainAspectRatio: false,

            layout: {

                padding: { top: 15, bottom: 15, left: 10, right: 10 }

            },

            scales: {

                y: {

                    reverse: true,

                    min: 1,

                    max: 4,

                    ticks: {

                        stepSize: 1,

                        color: '#fff',

                        font: { size: 14, weight: 'bold' },

                        callback: function (value) {

                            return value + "位";

                        }

                    },

                    grid: { color: '#444' }

                },

                x: { display: false }

            },

            plugins: {

                legend: { display: false },

                // 🌟 ここを追加！マウスを乗せた時のポップアップ（ツールチップ）を魔改造！

                tooltip: {

                    backgroundColor: 'rgba(0, 0, 0, 0.8)',

                    titleFont: { size: 14 },

                    bodyFont: { size: 16, weight: 'bold' },

                    displayColors: false, // 四角いカラーアイコンを消してスタイリッシュに

                    callbacks: {

                        label: function (context) {

                            let idx = context.dataIndex;

                            let score = scoreData[idx];

                            // スコアデータがあれば「獲得スコア」を、無ければ今まで通り「順位」を出す

                            if (score !== null && score !== undefined) {

                                return `獲得スコア: ${score} 点`;

                            }

                            return `順位: ${context.parsed.y}位`;

                        }

                    }

                }

            }

        }

    });



    document.getElementById('best-score-val').innerText = `${playerStats.maxScore} 点`;

    const handTiles = document.getElementById('best-hand-tiles');

    handTiles.innerHTML = '';



    if (playerStats.maxScoreHand) {

        const { tiles, melds, winTile } = playerStats.maxScoreHand;

        [...tiles].sort((a, b) => SM[a] - SM[b]).forEach(t => { handTiles.innerHTML += `<img src="images/${t}.png" style="width:20px; height:28px;">`; });

        if (winTile) handTiles.innerHTML += `<div style="width:10px;"></div><img src="images/${winTile}.png" style="width:20px; height:28px; border:1px solid #f1c40f;">`;

    }

    updateHomeStats();

}



// ホーム画面の「累計スコア」と「役図鑑進捗」を更新する処理

function updateHomeStats() {

    // 1. 生涯累計スコアの計算と反映

    let totalScore = playerStats.totalScoreSum || 0;

    const scoreEl = document.getElementById('home-lifetime-score');

    if (scoreEl) {

        scoreEl.innerHTML = `${totalScore.toLocaleString()} <span style="font-size: 14px; color: #aaa;">点</span>`;

    }



    // 2. 役図鑑コンプリート率の計算と反映

    let yakuData = playerStats.yakuCollected || {};

    let collectedCount = Object.values(yakuData).filter(count => count > 0).length;

    let totalYaku = 45; // 全役数

    let progressPercent = Math.min(Math.floor((collectedCount / totalYaku) * 100), 100);



    const textEl = document.getElementById('home-yaku-progress-text');

    const barEl = document.getElementById('home-yaku-progress-bar');



    if (textEl && barEl) {

        textEl.innerText = `${collectedCount} / ${totalYaku} 役 (${progressPercent}%)`;

        setTimeout(() => {

            barEl.style.width = `${progressPercent}%`;

        }, 100);

    }

}



// 📊 マイページ（詳細戦績）の描画

function openMyPage() {

    document.getElementById('input-player-name').value = playerStats.playerName;

    updateNameCounter(playerStats.playerName);



    // 基本データの取得（0割防止のための || 1）

    let totalG = playerStats.totalGamesPlayed || 0;

    let totalR = playerStats.totalRoundsPlayed || 1;

    let totalW = playerStats.totalWins || 0; // 和了回数は0もあり得る

    let totalScore = playerStats.totalScoreSum || 0; // スコアの総計変数（元のコードに合わせています）



    // --- 📊 総合指標の計算（0割防止のための条件分岐を追加） ---

    let avgRank = "0.00";

    let topRate = "0.00";

    let rentaiRate = "0.00";

    let rasuKaihiRate = "0.00";



    if (totalG > 0) {

        avgRank = ((playerStats.rankCounts[0] * 1 + playerStats.rankCounts[1] * 2 + playerStats.rankCounts[2] * 3 + playerStats.rankCounts[3] * 4) / totalG).toFixed(2);

        topRate = ((playerStats.rankCounts[0] / totalG) * 100).toFixed(2);

        rentaiRate = (((playerStats.rankCounts[0] + playerStats.rankCounts[1]) / totalG) * 100).toFixed(2);

        rasuKaihiRate = ((1 - (playerStats.rankCounts[3] / totalG)) * 100).toFixed(2);

    }



    let maxStreak = playerStats.maxWinStreak || 0;



    // --- ⚔️ 詳細スコア・技術指標の計算 ---

    let avgWins = (totalW / totalR).toFixed(1);

    let avgWinScore = totalW > 0 ? Math.floor(totalScore / totalW) : 0;

    let avgRoundScore = Math.floor(totalScore / totalR);

    let avgGameScore = playerStats.totalGamesPlayed > 0 ? Math.floor(totalScore / totalG) : 0;



    // 役図鑑オブジェクトが存在しない場合のエラー回避

    let yakuData = playerStats.yakuCollected || {};

    let muhanaCount = yakuData["無花果"] || 0;

    let muhanaRate = totalW > 0 ? ((muhanaCount / totalW) * 100).toFixed(2) : "0.00";



    let luckCount = (yakuData["嶺上開花"] || 0) + (yakuData["妙手回春"] || 0) + (yakuData["花天月地"] || 0);

    let luckRate = totalW > 0 ? ((luckCount / totalW) * 100).toFixed(2) : "0.00";



    // 🌟 1. HTMLに数値を流し込む（新しいIDに対応）

    document.getElementById('stat-total-games').innerText = totalG;

    document.getElementById('stat-max-streak').innerText = maxStreak + " 連勝";

    document.getElementById('stat-avg-rank').innerText = avgRank;

    document.getElementById('stat-top-rate').innerText = topRate + "%";

    document.getElementById('stat-rentai-rate').innerText = rentaiRate + "%";

    document.getElementById('stat-rasu-kaihi').innerText = rasuKaihiRate + "%";



    document.getElementById('stat-avg-wins').innerText = avgWins + " 回";

    document.getElementById('stat-avg-score-win').innerText = avgWinScore.toLocaleString() + " 点";

    document.getElementById('stat-avg-score-round').innerText = avgRoundScore.toLocaleString() + " 点";

    document.getElementById('stat-avg-score-game').innerText = avgGameScore.toLocaleString() + " 点";

    document.getElementById('stat-muhana-rate').innerText = muhanaRate + "%";

    document.getElementById('stat-luck-rate').innerText = luckRate + "%";



    // 🌟 2. 生涯累計獲得スコア

    document.getElementById('stat-lifetime-score').innerHTML = `${totalScore.toLocaleString()} <span style="font-size: 18px; color: #aaa;">点</span>`;



    // 🌟 3. レーダーチャートの描画(最初は伸びやすく、徐々に伸びにくくする)

    let chartAvgWins = Math.min(Math.sqrt(avgWins / 60) * 100, 100);

    let chartAvgScore = Math.min(Math.sqrt(avgWinScore / 2000) * 100, 100);

    let chartMuhana = Math.min((muhanaRate / 80) * 100, 100);

    let chartLuckRate = Math.min((luckRate / 15) * 100, 100);



    if (radarChart) radarChart.destroy();

    const ctxRadar = document.getElementById('mypage-radar-chart').getContext('2d');

    radarChart = new Chart(ctxRadar, {

        type: 'radar',

        data: {

            labels: ['トップ率', '1局平均和了', '1局平均スコア', '無花果率', '天運'],

            datasets: [{

                data: [topRate, chartAvgWins, chartAvgScore, chartMuhana, chartLuckRate],

                backgroundColor: 'rgba(52, 152, 219, 0.4)',

                borderColor: '#3498db',

                pointBackgroundColor: '#f1c40f',

                borderWidth: 2

            }]

        },

        options: {

            responsive: true, maintainAspectRatio: false,

            scales: { r: { min: 0, max: 100, ticks: { display: false }, grid: { color: '#555' }, pointLabels: { color: '#ecf0f1', font: { size: 14 } } } },

            plugins: { legend: { display: false } }

        }

    });



    // 🌟 4. 円グラフの描画

    if (pieChart) pieChart.destroy();

    const ctxPie = document.getElementById('mypage-rank-pie-chart').getContext('2d');



    const customOutLabelPlugin = {

        id: 'customOutLabels',

        afterDraw: (chart) => {

            const ctx = chart.ctx;

            const data = chart.data.datasets[0].data;

            const meta = chart.getDatasetMeta(0);

            const total = data.reduce((a, b) => a + b, 0);



            // 🌟 未プレイ時（ダミーデータ）は線やラベルを描画しないように除外！

            if (total === 0 || chart.data.labels[0] === '未プレイ') return;



            meta.data.forEach((arc, index) => {

                const value = data[index];

                if (value === 0) return;



                const percentage = ((value / total) * 100).toFixed(1) + '%';

                const labelText = chart.data.labels[index];

                const displayText = `${labelText}: ${percentage} (${value}回)`;



                const midAngle = arc.startAngle + (arc.endAngle - arc.startAngle) / 2;

                const r = arc.outerRadius;

                const x = arc.x;

                const y = arc.y;



                const startX = x + Math.cos(midAngle) * r;

                const startY = y + Math.sin(midAngle) * r;



                const lineExt = 15;

                const midX = x + Math.cos(midAngle) * (r + lineExt);

                const midY = y + Math.sin(midAngle) * (r + lineExt);



                const isRight = midX > x;

                const endX = isRight ? midX + 15 : midX - 15;



                ctx.beginPath();

                ctx.moveTo(startX, startY);

                ctx.lineTo(midX, midY);

                ctx.lineTo(endX, midY);

                ctx.strokeStyle = chart.data.datasets[0].backgroundColor[index];

                ctx.lineWidth = 1.5;

                ctx.stroke();



                ctx.fillStyle = '#fff';

                ctx.font = 'bold 13px sans-serif';

                ctx.textAlign = isRight ? 'left' : 'right';

                ctx.textBaseline = 'middle';

                ctx.fillText(displayText, isRight ? endX + 5 : endX - 5, midY);

            });

        }

    };



    // 🌟 未プレイかどうかを判定

    let isZeroData = totalG === 0;



    pieChart = new Chart(ctxPie, {

        type: 'doughnut',

        data: {

            // 未プレイ時はラベルもデータもダミーのグレー色にする

            labels: isZeroData ? ['未プレイ'] : ['1位', '2位', '3位', '4位'],

            datasets: [{

                data: isZeroData ? [1] : playerStats.rankCounts,

                backgroundColor: isZeroData ? ['#333333'] : ['#e74c3c', '#e67e22', '#3498db', '#95a5a6'],

                borderColor: '#2c3e50',

                borderWidth: 2

            }]

        },

        plugins: [customOutLabelPlugin],

        options: {

            responsive: true,

            maintainAspectRatio: false,

            layout: { padding: { left: 65, right: 65, top: 20, bottom: 20 } },

            // 未プレイ時はマウスを乗せてもツールチップを出さない

            plugins: { legend: { display: false }, tooltip: { enabled: !isZeroData } }

        }

    });



    document.getElementById('mypage-modal').style.display = 'flex';

    playSE('click');

}



// ✏️ 入力中の文字数をリアルタイムで更新する関数

function updateNameCounter(val) {

    const counter = document.getElementById('name-char-counter');

    if (counter) {

        counter.innerText = `${val.length}/10`;

        // 10文字MAXになったら文字を赤くして警告！

        counter.style.color = val.length >= 10 ? '#e74c3c' : '#aaa';

    }

}



// ✏️ マイページで入力された新しいプレイヤー名を保存する関数

function saveNewName() {

    let newName = document.getElementById('input-player-name').value.trim();



    // 🌟 空欄のまま保存しようとした場合は「名無し」にする安全装置

    if (!newName) {

        newName = "名無し";

        document.getElementById('input-player-name').value = newName;

    }



    playerStats.playerName = newName;

    saveGameData();

    updateProfileUI(); // タイトル画面の表示も更新

    updateNameCounter(newName); // カウンターの数字も更新



    alert(`名前を「${newName}」に変更しました！`);

}



// ✏️ 名前入力欄を一括で消去する関数（×ボタン用）

function clearNameInput() {

    const input = document.getElementById('input-player-name');

    input.value = '';

    input.focus(); // 🌟 消した直後にすぐ入力できるようにフォーカスを当てる！

    updateNameCounter('');

}



// 👤 マイページ画面を閉じる関数

function closeMyPage() {

    document.getElementById('mypage-modal').style.display = 'none';

    playSE('click');

}



// 🏅 役の点数と回数から熟練度ランクを判定する関数

function getYakuRankClass(yakuName, count) {

    if (count <= 0) return "locked";



    // 🌟 ① 個別に条件を調整したい役の例外リストを作成

    const specialThresholds = {

        // ※ここに追加していくだけで個別調整が可能！

        "七星不靠": { silver: 10, gold: 50, platinum: 200 },

        "十三幺九": { silver: 10, gold: 100, platinum: 500 },

        "寒江独釣": { silver: 10, gold: 50, platinum: 200 },

        "無番和": { silver: 10, gold: 50, platinum: 200 },

        "無番和": { silver: 20, gold: 50, platinum: 200 },

        "槍槓": { silver: 3, gold: 5, platinum: 10 },

    };



    let thresholds;



    // 🌟 ② 例外リストに登録されている役なら、その数値を採用

    if (specialThresholds[yakuName]) {

        thresholds = specialThresholds[yakuName];

    } else {

        // 🌟 ③ リストになければ、今まで通り点数帯（Tier）ごとのデフォルト値を採用

        const tier = getYakuTierClass(yakuName);



        thresholds = { silver: 50, gold: 200, platinum: 1000 };



        if (tier === "yaku-tier-64") {

            thresholds = { silver: 3, gold: 5, platinum: 10 };

        } else if (tier === "yaku-tier-32") {

            thresholds = { silver: 5, gold: 10, platinum: 15 };

        } else if (tier === "yaku-tier-16") {

            thresholds = { silver: 5, gold: 20, platinum: 50 };

        } else if (tier === "yaku-tier-8") {

            thresholds = { silver: 20, gold: 50, platinum: 100 };

        } else if (tier === "yaku-tier-6") {

            thresholds = { silver: 20, gold: 50, platinum: 150 };

        } else if (tier === "yaku-tier-4") {

            thresholds = { silver: 50, gold: 100, platinum: 500 };

        } else if (tier === "yaku-tier-2") {

            thresholds = { silver: 50, gold: 200, platinum: 1000 };

        } else if (tier === "yaku-tier-multi") {

            thresholds = { silver: 10, gold: 20, platinum: 50 };

        }

    }



    if (count >= thresholds.platinum) return "platinum";

    if (count >= thresholds.gold) return "gold";

    if (count >= thresholds.silver) return "silver";

    return "bronze";

}



// ==========================================

// ★ デバッグ用：ダミーデータの注入

// ==========================================



// 🧪 デバッグ用：セーブデータに強力なダミー実績・レートを強制注入する関数

function injectDummyData() {

    if (!confirm("現在のセーブデータを上書きして、テスト用の実績データを注入しますか？")) return;



    playerRatings[0] = 1850;

    playerStats.playerName = "DummyData";



    // 🌟 総合指標データ

    playerStats.totalGamesPlayed = 85;

    playerStats.rankCounts = [35, 25, 15, 10]; // 1位, 2位, 3位, 4位 (計85ゲーム)

    playerStats.totalRoundsPlayed = 342;



    // 🌟 超インフレ仕様に合わせたデータ爆盛り！

    // 342局 × 平均約25回和了 = 8550回アガったことにする

    playerStats.totalWins = 8550;

    // 1アガリ平均550点 × 8550回 = 約470万点！

    playerStats.totalScoreSum = 4702500;



    // （鳴きやツモはもう使わないが、一応辻褄を合わせる）

    playerStats.totalTsumoWins = 3500;

    playerStats.totalCalls = 16500;



    // 🌟 アチーブメント関連データ

    playerStats.currentWinStreak = 4;

    playerStats.maxWinStreak = 12;

    playerStats.jokerSwapCount = 420;

    playerStats.secondCharlestonCount = 115;

    playerStats.hanakanCount = 204;

    playerStats.clutch1PointCount = 85;



    // 🌟 直近20戦の順位とスコア推移

    playerStats.recentRecords = [

        { rank: 1, score: 2048 }, { rank: 2, score: 850 }, { rank: 1, score: 1420 }, { rank: 1, score: 1900 }, { rank: 3, score: -200 },

        { rank: 2, score: 400 }, { rank: 1, score: 1100 }, { rank: 4, score: -850 }, { rank: 1, score: 1600 }, { rank: 2, score: 300 },

        { rank: 3, score: -100 }, { rank: 1, score: 2100 }, { rank: 2, score: 500 }, { rank: 4, score: -1200 }, { rank: 1, score: 1300 },

        { rank: 2, score: 600 }, { rank: 1, score: 1750 }, { rank: 3, score: -400 }, { rank: 2, score: 700 }, { rank: 1, score: 1550 }

    ];



    playerStats.maxScore = 2048;

    playerStats.maxScoreHand = {

        tiles: ["1s", "1s", "1s", "2s", "3s", "4s", "5s", "6s", "7s", "8s", "9s", "9s", "9s"],

        melds: [],

        winTile: "5s"

    };



    // 🌟 役図鑑用データ（新指標の計算元）

    playerStats.yakuCollected = {

        // レア役（コンプリート率・ランク色テスト用）

        "天胡": 5, "地胡": 1, "九連宝燈": 3, "十八羅漢": 12, "大四風会": 8, "大三元": 40, "清一色": 150,

        // 乗算バフ（無花果率の元データ）-> 8550回のうち約44%

        "無花果": 3800,

        // 特殊ドロー（天運の元データ）-> 計650回 (約7.6%)

        "槓上開花": 450, "妙手回春": 120, "花天月地": 80,

        // その他役

        "対々和": 1242, "七対": 828, "混一色": 933, "小三元": 108, "無番和": 2500, "断么": 3120, "刮風": 1045, "下雨": 830

    };



    saveGameData();

    alert("超絶インフレ版ダミーデータを注入しました！\n画面をリロードして反映します。");

    location.reload();

}



// 🧪 デバッグ用：インストール直後の「完全初期状態」に戻す関数

function resetToInitialData() {

    if (!confirm("データを完全に初期化し、インストール直後の状態に戻しますか？")) return;



    playerRatings = [1500, 1500, 1500, 1500];

    playerStats = {

        playerName: "あなた",

        maxScore: 0,

        maxScoreHand: null,

        currentWinStreak: 0,

        maxWinStreak: 0,

        yakuCollected: {},

        jokerSwapCount: 0,

        secondCharlestonCount: 0,

        hanakanCount: 0,

        totalRoundsPlayed: 0,

        recentRecords: [],

        totalGamesPlayed: 0,

        rankCounts: [0, 0, 0, 0],

        totalWins: 0,

        totalTsumoWins: 0,

        totalCalls: 0,

        totalScoreSum: 0,

        heavenlyCount: 0,

        maxComboCount: 0,

        welcomeHomeCount: 0,

        comebackCount: 0,

        masterOfSeasonsCount: 0,

        pacifistCount: 0,

        wideWaitCount: 0

    };



    saveGameData();

    alert("データを完全初期化しました！\n画面をリロードして反映します。");

    location.reload();

}



// 🧪 デバッグ用：少しだけプレイした「初心者データ」を注入する関数

function injectBeginnerData() {

    if (!confirm("現在のセーブデータを上書きして、初心者(10ゲームプレイ済み)のデータを注入しますか？")) return;



    playerRatings[0] = 1599;

    playerStats.playerName = "ビギナー";



    // 🌟 総合指標データ (10ゲームプレイ)

    playerStats.totalGamesPlayed = 10;

    playerStats.rankCounts = [3, 4, 2, 1]; // 1位3回, 2位4回, 3位2回, 4位1回

    playerStats.totalRoundsPlayed = 38;



    playerStats.totalWins = 8;

    playerStats.totalScoreSum = 8500; // 平均打点1000点ちょっと



    // 🌟 アチーブメント関連データ

    playerStats.currentWinStreak = 1;

    playerStats.maxWinStreak = 2;

    playerStats.jokerSwapCount = 2;

    playerStats.secondCharlestonCount = 8;

    playerStats.hanakanCount = 5;



    // 🌟 直近10戦の推移

    playerStats.recentRecords = [

        { rank: 1, score: 1200 }, { rank: 2, score: 800 }, { rank: 4, score: -500 }, { rank: 2, score: 900 }, { rank: 3, score: 100 },

        { rank: 1, score: 1500 }, { rank: 2, score: 600 }, { rank: 3, score: 200 }, { rank: 2, score: 700 }, { rank: 1, score: 1800 }

    ];



    playerStats.maxScore = 1800;

    playerStats.maxScoreHand = {

        tiles: ["1m", "1m", "1m", "5p", "6p", "7p", "2s", "3s", "4s", "東", "東"],

        melds: [{ type: "pon", tiles: ["白", "白", "白"] }],

        winTile: "東"

    };



    // 🌟 役図鑑用データ (簡単な役のみ)

    playerStats.yakuCollected = {

        "断么": 3, "碰碰胡": 2, "混一色": 1, "無番和": 4, "刮風": 2

    };



    // 🌟 一発系実績はすべて未達成(0)にリセット

    playerStats.heavenlyCount = 0;

    playerStats.maxComboCount = 2;

    playerStats.welcomeHomeCount = 0;

    playerStats.comebackCount = 0;

    playerStats.masterOfSeasonsCount = 0;

    playerStats.pacifistCount = 0;

    playerStats.wideWaitCount = 0;



    saveGameData();

    alert("初心者用ダミーデータを注入しました！\n画面をリロードして反映します。");

    location.reload();

}



// 🏆 テスト用：実績のフラグを強制的にONにする関数

function testUnlockAchievement(id) {

    // playerStatsが未定義のテスト環境(index_test.html)用の安全対策

    if (typeof playerStats === 'undefined') {

        window.playerStats = {};

        window.playerRatings = [1500, 1500, 1500, 1500];

    }



    if (id === 'rating_god') {

        playerRatings[0] = 2000;

    } else if (id === 'wide_wait') {

        playerStats.wideWaitCount = 1;

    } else if (id === 'master_of_seasons') {

        playerStats.masterOfSeasonsCount = 1;

    } else if (id === 'full_house') {

        playerStats.maxComboCount = 7;

    } else if (id === 'heavenly') {

        playerStats.heavenlyCount = 1;

    } else if (id === 'welcomehome') {

        playerStats.welcomeHomeCount = 1;

    } else if (id === 'pacifist') {

        playerStats.pacifistCount = 1;

    } else if (id === 'comeback') {

        playerStats.comebackCount = 1;

    } else if (id === 'clutch') {

        playerStats.clutch1PointCount = 1;

    }



    // 本番環境（game.jsが存在する環境）ならセーブする

    if (typeof saveGameData === 'function') saveGameData();



    console.log(`🏆 テスト: 実績[${id}]を解除しました！`);

    alert(`実績を解除状態にしました！\n実績画面を開いて「プラチナ」になっているか確認してください。`);

}



// 🏆 テスト用：JS側でスコアや局の状況を強制セットアップする

function setupAchieveScenarioJS(type) {

    if (typeof totalScores === 'undefined') return;



    if (type === 'comeback') {

        // オーラス（第4局）で、自分が圧倒的最下位の状況を作る

        currentRound = 4;

        totalScores = [0, 1, 1, 1]; // 自分(0)が-3万点

        updateInfoUI();

        alert("【逆転の劇薬テスト】\nオーラスで自分が4位（-30000点）の状況をセットしました！ここで大物手をアガって1位になってください！");



    } else if (type === 'clutch') {

        // 自分が最下位だが、1点アガれば3位に滑り込める超僅差の状況を作る

        totalScores = [0, 1, 5000, 2000]; // 1点差

        updateInfoUI();

        alert("【1点の重みテスト】\n現在4位ですが、3位とわずか「1点差」の状況をセットしました！無役（1点）でアガって逆転してください！");



    } else if (type === 'pacifist') {

        // 自分以外が全員マイナスの状況を作る

        totalScores = [0, -10000, -10000, -10000];

        updateInfoUI();

        alert("【漁夫の利テスト】\n他家が全員ハコ下の状況をセットしました！自分は一切アガらずに、流局や他家の和了で局を終えてください！");

    }

}



// 🔄 テスト用：一発達成型の実績をすべて未達成に戻す関数

function resetTestAchievements() {

    if (typeof playerStats === 'undefined') return;



    playerRatings[0] = 1500;

    playerStats.wideWaitCount = 0;

    playerStats.masterOfSeasonsCount = 0;

    playerStats.maxComboCount = 0;

    playerStats.heavenlyCount = 0;

    playerStats.welcomeHomeCount = 0;

    playerStats.pacifistCount = 0;

    playerStats.comebackCount = 0;

    playerStats.clutch1PointCount = 0;



    if (typeof saveGameData === 'function') saveGameData();



    alert("テスト用の実績をリセット（未達成）に戻しました。");

}



// ==========================================

// 🏆 実績解除ポップアップ表示システム

// ==========================================

let toastQueue = [];

let isToastShowing = false;



// 🌟 ポップアップを予約リストに追加する関数

function showAchievementUnlock(name, icon = "🏆") {

    toastQueue.push({ name, icon });

    if (!isToastShowing) processToastQueue();

}



// 🌟 予約されたポップアップを順番に表示する関数（ゲーム速度に依存しない実時間表示）

async function processToastQueue() {

    if (toastQueue.length === 0) {

        isToastShowing = false;

        return;

    }

    isToastShowing = true;

    let achieve = toastQueue.shift();



    const toast = document.getElementById('achievement-toast');

    if (!toast) return;



    document.getElementById('toast-icon').innerText = achieve.icon;

    document.getElementById('toast-name').innerText = achieve.name;



    // 音を鳴らす（コイン音か専用音がおすすめ）

    playSE('coin');



    // 画面に降ろす

    toast.classList.add('toast-show');



    // 4秒間表示して、自動で上に戻る

    await new Promise(res => setTimeout(res, 4000));

    toast.classList.remove('toast-show');



    // アニメーションが終わるまで待ってから次の実績を表示

    await new Promise(res => setTimeout(res, 600));

    processToastQueue();

}



// 🌟 積み上げ型実績がランクアップ（銅・銀・金・プラチナ）した瞬間にポップアップを出す関数

function checkTieredAchievement(id, title, icon, oldVal, newVal, tiers) {

    for (let i = 0; i < tiers.length; i++) {

        // 古い値が目標未満で、新しい値が目標に到達・突破した時だけ通知する！

        if (oldVal < tiers[i] && newVal >= tiers[i]) {

            let rankName = ["ブロンズ", "シルバー", "ゴールド", "プラチナ"][i];

            showAchievementUnlock(`${title} (${rankName})`, icon);

        }

    }

}



// ==========================================

// ★ 友人戦（オンラインロビー）制御

// ==========================================



let currentRoomId = "";

let lobbyWs = null; // 🌟 WebSocket接続を保存する変数を追加



// 🤝 友人戦モーダルを開く

function openFriendMatch() {

    playSE('click');

    document.getElementById('friend-match-modal').style.display = 'flex';

    document.getElementById('friend-menu-select').style.display = 'block';

    document.getElementById('friend-menu-waiting').style.display = 'none';

    document.getElementById('room-id-input').value = "";

}



// 🚪 モーダルを閉じる（退室する）

function closeFriendMatch() {

    playSE('click');

    document.getElementById('friend-match-modal').style.display = 'none';



    // 🌟 モーダルを閉じたら、WebSocketも切断して部屋から抜ける

    if (lobbyWs) {

        lobbyWs.close();

        lobbyWs = null;

    }

    currentRoomId = "";

}



// ✨ 新しいルームを作る（とりあえず見た目だけ）

function createRoom() {

    playSE('click');

    // ランダムな4文字の英数字を生成（例: A7X9）

    const randomId = Math.random().toString(36).substring(2, 6).toUpperCase();

    enterWaitingRoom(randomId);

}



// 🚪 既存のルームに参加する

function joinRoom() {

    playSE('click');

    const inputVal = document.getElementById('room-id-input').value.trim().toUpperCase();

    if (!inputVal) {

        alert("ルームIDを入力してください！");

        return;

    }

    enterWaitingRoom(inputVal);

}



// ⏳ 待合室画面に切り替える

function enterWaitingRoom(roomId) {

    currentRoomId = roomId;

    document.getElementById('friend-menu-select').style.display = 'none';

    document.getElementById('friend-menu-waiting').style.display = 'block';

    document.getElementById('display-room-id').innerText = roomId;

    document.getElementById('room-player-count').innerText = "1";



    const wsUrl = `ws://${window.location.host}/ws/lobby/${roomId}`;

    lobbyWs = new WebSocket(wsUrl);



    lobbyWs.onmessage = async (event) => {

        const data = JSON.parse(event.data);



        if (data.type === "lobby_update") {

            document.getElementById('room-player-count').innerText = data.player_count;

        }

        else if (data.type === "game_start") {

            skipCount = 0;

            myPlayerIdx = data.player_idx;

            currentGameMode = 'online';



            document.getElementById('friend-match-modal').style.display = 'none';

            document.getElementById('mode-select-screen').style.display = 'none';

            document.getElementById('title-screen').style.display = 'none';



            let state = data.state;

            myHand = state.player_hand || [];

            totalScores = state.total_scores || [0, 0, 0, 0];

            turn = state.turn;

            dealer = state.dealer;

            currentRound = state.current_round || 1;

            wallCount = state.wall_count;



            if (typeof cpuHands === 'undefined') window.cpuHands = [[], [], [], []];

            for (let i = 0; i < 4; i++) {

                if (i !== myPlayerIdx) cpuHands[i] = new Array(13).fill("back");

            }



            updateInfoUI(); render(); renderCPU();

            alert(`対局開始！あなたは ${myPlayerIdx} 番です。まずは牌の交換を行います。`);



            charlestonPhase = false; isProc = false;

            charlestonCount = 1; startCharlestonSelection();

        }

        else if (data.type === "update") {

            let state = data.state;

            let ev = data.event;



            let isCharlestonEvent = ev && ev.action && ev.action.includes("charleston");

            let isCallout = ev && ev.action === "play_callout";



            if (!isCharlestonEvent && !isCallout) {

                safeUpdate(state);

            }



            if (ev) {

                if (ev.action === "discard") {

                    let pIdx = ev.player_idx;

                    let tile = ev.tile;

                    drawnTile = ""; lastT = tile; lastDiscardPlayer = pIdx;

                    addR(pIdx, tile, false);

                    skipCount = 0;

                    render(); renderCPU();

                    if (pIdx !== myPlayerIdx) checkHumanReactionOnline(pIdx, tile);

                }

                else if (ev.action === "skip") {

                    skipCount++;

                    if (skipCount >= 3 && turn === myPlayerIdx && !charlestonPhase) {

                        isProc = false; checkOnlineT();

                    }

                }

                else if (ev.action === "sync") {

                    render(); renderCPU();

                    if (turn === myPlayerIdx) {

                        isProc = false; checkOnlineT();

                    }

                }

                else if (ev.action === "play_callout") {

                    let callIdx = ev.player_idx;

                    let text = ev.call_text;

                    showCallout(callIdx, text);



                    if (text === "胡" || text === "自摸" || text === "天胡" || text === "地胡") {

                        safeUpdate(state); render(); renderCPU();

                        isProc = true;

                        setTimeout(() => handleRoundEnd(), 2000);

                    } else {

                        setTimeout(() => {

                            safeUpdate(state); render(); renderCPU();

                            isProc = false;

                            if (turn === myPlayerIdx) checkOnlineT();

                        }, 1500);

                    }

                }

                // ▽ 第1交換：誰かが選び終わった

                else if (ev.action === "charleston_player_ready") {

                    let readyIdx = ev.player_idx;

                    if (readyIdx !== myPlayerIdx) {

                        showCharlestonStatus(getViewPos(readyIdx), true);

                        hideCpuTiles[readyIdx] = 3; renderCPU();

                    }

                }

                // ▽ 第1交換：全員完了！

                else if (ev.action === "charleston_complete") {

                    (async () => {

                        isProc = true;

                        await showDiceAnimation(ev.dice, ev.direction);

                        await playExchangeAnimation(ev.direction, [true, true, true, true]);

                        safeUpdate(state);

                        hideCpuTiles = [0, 0, 0, 0]; clearCharlestonStatus();

                        render(); renderCPU();

                        isProc = false;



                        askedCount = 0;

                        startSequentialSecondCharlestonOnline(); // 🌟 順番待ち確認をスタート

                    })();

                }

                // ▽ 第2交換：順番に回ってきて、誰かが選択を終えた

                else if (ev.action === "second_charleston_player_done") {

                    let cIdx = ev.player_idx;

                    if (cIdx !== myPlayerIdx) {

                        showCharlestonStatus(getViewPos(cIdx), ev.participate);

                        if (ev.participate) hideCpuTiles[cIdx] = 3;

                        renderCPU();

                    }

                    askedCount++;

                    startSequentialSecondCharlestonOnline(); // 次の人へ！

                }

                // ▽ 第2交換：スキップ

                else if (ev.action === "second_charleston_skip") {

                    (async () => {

                        showCenterMessage(`<span style="color:#e74c3c;font-size:24px;">参加者不足<br>第2交換はスキップされます</span>`);

                        await sleep(2000); hideCenterMessage();

                        hideCpuTiles = [0, 0, 0, 0]; clearCharlestonStatus(); renderCPU();

                        safeUpdate(state);

                        charlestonPhase = false; isProc = false; checkOnlineT();

                    })();

                }

                // ▽ 第2交換：交換実行！

                else if (ev.action === "second_charleston_complete") {

                    let parts = [false, false, false, false];

                    ev.active_players.forEach(p => parts[p] = true);

                    (async () => {

                        isProc = true;

                        if (!ev.direction.includes("不成立")) {

                            await showDiceAnimation(ev.dice, ev.direction);

                            await playExchangeAnimation(ev.direction, parts);

                        }

                        safeUpdate(state);

                        hideCpuTiles = [0, 0, 0, 0]; clearCharlestonStatus(); render(); renderCPU();

                        charlestonPhase = false; isProc = false; checkOnlineT();

                    })();

                }

            } else {

                if (!isCharlestonEvent && !isCallout) {

                    render(); renderCPU();

                }

            }

        }

    };

    lobbyWs.onclose = () => { console.log("ロビーから切断されました"); };

}



// 📋 招待URLをクリップボードにコピーする関数

function copyRoomUrl() {

    playSE('click');

    const url = window.location.origin + window.location.pathname + "?room=" + currentRoomId;

    navigator.clipboard.writeText(url).then(() => {

        alert("招待URLをコピーしました！\n" + url + "\n友達にLINE等で送って招待しましょう。");

    }).catch(err => {

        alert("コピーに失敗しました。手動でURLを共有してください。");

    });

}



// ==========================================

// 🌐 友人戦専用システム（CPU戦のコードは一切触りません）

// ==========================================



// 🌐 友人戦専用システム（自動ツモ＆暗槓メニュー対応版）

async function checkOnlineT() {

    if (charlestonPhase) return; // 交換中はここを通らないようにする



    isProc = true;

    stopTimer();



    // ターン強調表示

    for (let i = 0; i < 4; i++) {

        const nameEl = document.getElementById(`player-name-${i}`);

        if (nameEl) nameEl.classList.remove('active-turn');

    }

    let turnViewPos = getViewPos(turn);

    const activeNameEl = document.getElementById(`player-name-${turnViewPos}`);

    if (activeNameEl) activeNameEl.classList.add('active-turn');



    document.querySelectorAll('.action-layer .btn-act').forEach(b => b.style.display = "none");

    document.getElementById('self-actions').innerHTML = '';



    if (turn === myPlayerIdx) {

        // 現在の枚数を計算（副露含まず、手牌のみ）

        let totalTiles = myHand.length;



        if (totalTiles % 3 === 2) {

            // 🌟 【14枚：打牌フェーズ】

            document.getElementById('msg').innerText = "↓打牌↓";

            document.getElementById('msg').className = "blink-text";



            // 🌟 復活：自分の番で可能な暗槓・加槓・ツモアガリがあるかチェック！

            await checkSelfMelds();



            let canWin = false;

            if (!justPonged) {

                canWin = await checkWinPossible();

            }



            const btnWin = document.getElementById('btn-win');

            const selfActions = document.getElementById('self-actions');



            let shouldAlert = false;

            if (btnWin.style.display === "block" || selfActions.innerHTML !== '') {

                shouldAlert = true;

                if (isAutoPlay && myWinTiles.length > 0 && selfActions.innerHTML === '') {

                    shouldAlert = false;

                }

            }

            if (shouldAlert) {

                playSE('alert');

            }



            isProc = false;



            // 🌟 復活：オートプレイ進行制御

            let autoActed = false;

            if (isAutoPlay && myWinTiles.length > 0) {

                if (canWin && selfActions.innerHTML === '') {

                    isProc = true;

                    setTimeout(() => execTsumo(), 800 / speedMult);

                    autoActed = true;

                } else if (selfActions.innerHTML === '') {

                    if (drawnTile !== "") {

                        isProc = true;

                        setTimeout(() => onlineDiscard(drawnTile), 600 / speedMult);

                        autoActed = true;

                    }

                } else {

                    showCenterMessage(`<span style="color:#f39c12;font-size:24px;">アクション可能なため<br>オート進行を一時待機します</span>`);

                    setTimeout(hideCenterMessage, 2500);

                }

            }



            if (!autoActed) {

                // 打牌タイマー（60秒）を起動

                startTimer(timeDiscard, () => {

                    if (drawnTile !== "") {

                        onlineDiscard(drawnTile);

                    } else {

                        let displayHand = [...myHand].sort((a, b) => SM[a] - SM[b]);

                        onlineDiscard(displayHand[displayHand.length - 1]);

                    }

                });

            }

        } else {

            // 🌟 【13枚：ツモ行程】（全員のスキップが確認されたので、自動で引く！）

            if (wallCount === 1) {

                document.getElementById('msg').className = "";

                document.getElementById('msg').innerText = "海底牌";

                document.getElementById('btn-haitei-tsumo').style.display = "block";

                document.getElementById('btn-ryukyoku').style.display = "block";



                playSE('alert');

                isProc = false;



                startTimer(timeCall, () => {

                    document.getElementById('btn-ryukyoku').click();

                });

                return;

            }



            document.getElementById('msg').className = "";

            document.getElementById('msg').innerText = "ツモ...";



            // 🌟 変更点：ボタンを出さず、CPU戦と同じように自動で引くように修正！

            isProc = true; // 引くまで操作ロック

            setTimeout(async () => {

                try {

                    // サーバーから1枚引く

                    const data = await apiCall('/draw', { player_idx: myPlayerIdx });

                    playSE('tsumo');

                    // ツモったことをWebSocket経由で全員に通知して画面を同期させる

                    lobbyWs.send(JSON.stringify({

                        type: "action",

                        action: "sync",

                        player_idx: myPlayerIdx

                    }));

                } catch (e) {

                    if (e.message === "流局") console.log("流局しました");

                }

            }, 500 / speedMult);

        }

    } else {

        // 他人のターン（変更点：誰かが捨てて自分の判断待ちになるまで、このメッセージを表示）

        document.getElementById('msg').className = "";

        document.getElementById('msg').innerText = `他家の反応待ち...`;

    }

}



// 🌐 オンライン打牌：タイマーを止めてサーバーへ送信

function onlineDiscard(t) {

    if (isProc) return;

    isProc = true;

    stopTimer();

    lobbyWs.send(JSON.stringify({

        type: "action",

        action: "discard",

        tile: t,

        player_idx: myPlayerIdx

    }));

}



// 🌐 オンライン鳴き判定：鳴けない時は「自動でスキップ」をサーバーに送る！

async function checkHumanReactionOnline(discarderIdx, tile) {

    const count = myHand.filter(t => t === tile).length;

    let showAny = false;



    // 役判定

    const wd = await apiCall('/check_win', {

        player_idx: myPlayerIdx,

        last_tile: tile,

        is_ron: "true",

        is_haitei: (wallCount === 0),

        is_chankan: "false"

    });

    if (wd.can_win) {

        const btn = document.getElementById('btn-win');

        btn.style.display = "block";

        // 🌟 復活：オンラインのロン関数を呼ぶように変更！

        btn.onclick = () => execRon(false);



        // 🌟 復活：オートプレイ対応

        if (isAutoPlay && myWinTiles.length > 0) {

            btn.style.display = "none";

        }

        showAny = true;

    }



    if (myWinTiles.length === 0) {

        if (count >= 2) { document.getElementById('btn-pon').style.display = "block"; showAny = true; }

        if (count >= 3 && wallCount > 0) { document.getElementById('btn-kan').style.display = "block"; showAny = true; }

    }



    if (showAny) {

        let isAutoDigest = (isAutoPlay && myWinTiles.length > 0);



        if (!isAutoDigest) {

            playSE('alert');

            document.getElementById('btn-skip').style.display = "block";

        }



        const skipBtn = document.getElementById('btn-skip');



        skipBtn.onclick = () => {

            stopTimer();

            document.querySelectorAll('.action-layer .btn-act').forEach(b => b.style.display = "none");

            isProc = false;

            document.getElementById('msg').innerText = "他家の反応待ち...";

            // 🌟 変更点：スキップしたらサーバーに伝える

            lobbyWs.send(JSON.stringify({ type: "action", action: "skip", player_idx: myPlayerIdx }));

        };



        document.getElementById('msg').innerText = "鳴き判断";

        isProc = false;



        if (isAutoDigest) {

            isProc = true;

            setTimeout(() => execRon(false), 800 / speedMult);

        } else {

            // 友人戦の鳴き待機タイマー（20秒）

            startTimer(timeCall, () => {

                if (skipBtn.style.display !== "none") skipBtn.click();

            });

        }

        return true;

    } else {

        // 🌟 変更点：何もない人は、20秒待たずに「自動でスキップ通信」を送る！

        lobbyWs.send(JSON.stringify({ type: "action", action: "skip", player_idx: myPlayerIdx }));

        return false;

    }

}