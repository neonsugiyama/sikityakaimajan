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
    masterOfSeasonsCount: 0,// 四季常春（春夏秋冬を揃えて和了）
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

// 📱 画面サイズに合わせてゲーム画面全体を拡大縮小する関数
function resizeGame() {
    const scale = Math.min(window.innerWidth / 1280, window.innerHeight / 800);

    // 🌟 CSS変数としてスケール値を全体に渡す（サイドバーなどのサイズ同期用）
    document.documentElement.style.setProperty('--game-scale', scale);

    // 🌟 空間全体に「3Dカメラの奥行き」を設定
    document.body.style.perspective = "1200px";

    const mainElements = [
        '.table',
        '.title-content',
        '#mode-select-container'
    ];

    mainElements.forEach(selector => {
        const el = document.querySelector(selector);
        if (el) {
            el.style.position = "absolute";
            el.style.left = "50%";
            el.style.top = "50%";
            el.style.transformOrigin = "center center";

            // 🌟 修正：35度から「20度」に傾きを緩めて、上の空間を詰める！
            if (selector === '.table') {
                el.style.transform = `translate(-50%, -50%) scale(${scale}) rotateX(20deg)`;
                el.style.transformStyle = "preserve-3d";
            } else {
                el.style.transform = `translate(-50%, -50%) scale(${scale})`;
            }
            el.classList.add('ready');
        }
    });

    // 2. ポップアップ画面（モーダル）の「中身の箱」だけを縮小する
    // ※モーダル全体を縮小すると背景の黒い暗幕まで小さくなってしまうため、直下のdiv要素を狙う
    const modalContents = [
        '#settings-modal > div',       // 設定
        '#howto-modal > div',          // 遊び方
        '#yaku-modal > div',           // 役一覧
        '#achievement-modal > div',    // 実績
        '#mypage-modal > div',         // 戦績データ
        '#friend-match-modal > div',   // 友人戦ロビー
        '#settings-screen > div'       // 対局前設定
    ];

    modalContents.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
            // 🌟 卓と同じように「絶対配置＋中央揃え」を指定してから縮小をかける
            el.style.position = "absolute";
            el.style.left = "50%";
            el.style.top = "50%";
            el.style.transformOrigin = "center center";
            el.style.transform = `translate(-50%, -50%) scale(${scale})`;
        });
    });

    // 🌟 3. リザルト画面専用の縮小処理（重なりバグの解消）
    const overlayChildren = document.querySelectorAll('#overlay > *');
    const resultScale = scale * 0.85;
    const resultWrapper = document.getElementById('result-wrapper');
    if (resultWrapper) {
        resultWrapper.style.position = "absolute";
        resultWrapper.style.left = "50%";
        resultWrapper.style.top = "50%";
        resultWrapper.style.transformOrigin = "center center";

        // 💡 scale * 0.85 で全体を少し小さめに表示（好みに合わせて 0.8 や 0.9 に調整可能）
        resultWrapper.style.transform = `translate(-50%, -50%) scale(${scale * 0.85})`;
    }

    // 🌟 4. 天和・地和などの巨大文字（アニメーションと喧嘩しないようフォントサイズ自体を縮小）
    const bigYaku = document.getElementById('big-yaku-text');
    if (bigYaku) {
        bigYaku.style.fontSize = `${180 * scale}px`;
        bigYaku.style.webkitTextStrokeWidth = `${4 * scale}px`; // 縁取りの太さも合わせて調整
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

let currentWaits = [];
let myHand = [], myMelds = [], myWinTiles = [], turn = 0, isProc = false, lastT = "", justPonged = false;
let drawnTile = "", autoResumeTimer = null, lastDiscardPlayer = -1;
let wallCount = 0;
let currentRound = 1, dealer = 0, scores = [0, 0, 0, 0], totalScores = [0, 0, 0, 0];
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
// 🌟 ここに追加！「おかえりなさい」テスト発動用のフラグ
let isWelcomeHomeTest = false;
let timerInterval = null;
let timeLeft = 0;
let maxTimeForTimer = 0;
let timerAction = null;
let currentTickAudio = null;

const SM = {
    "1p": 11, "2p": 12, "3p": 13, "4p": 14, "5p": 15, "6p": 16, "7p": 17, "8p": 18, "9p": 19,
    "1s": 21, "2s": 22, "3s": 23, "4s": 24, "5s": 25, "6s": 26, "7s": 27, "8s": 28, "9s": 29,
    "1m": 31, "9m": 39,
    "東": 41, "南": 42, "西": 43, "北": 44, "白": 45, "發": 46, "中": 47,
    "春": 51, "夏": 52, "秋": 53, "冬": 54
};

// ==========================================
// ⚙️ 設定用のグローバル変数（初期値）を追加
// ==========================================
let timeDiscard = 60;
let timeCall = 20;
let timeExchange = 30;
let confCpuLevel = 1;       // 0:よわい, 1:ふつう, 2:つよい
let confTsumogiri = true;   // ツモ切り表示ON/OFF
let confWaitsHint = true;   // 待ち牌ヒントON/OFF
let confEffective = false;  // 有効牌表示ON/OFF

// ==========================================
// ⚙️ 設定を適用してゲームを開始する関数
// ==========================================
function applySettingsAndStart() {
    playSE('start');

    // 1. 画面の入力値を変数に保存 (HTML側のIDに合わせて安全に取得)
    let elDiscard = document.getElementById('set-discard');
    if (elDiscard) timeDiscard = parseInt(elDiscard.value);

    let elCall = document.getElementById('set-call');
    if (elCall) timeCall = parseInt(elCall.value);

    let elExchange = document.getElementById('set-exchange');
    if (elExchange) timeExchange = parseInt(elExchange.value);

    let elCpu = document.getElementById('set-cpu');
    if (elCpu) confCpuLevel = parseInt(elCpu.value);

    let elTsumogiri = document.getElementById('set-tsumogiri');
    if (elTsumogiri) confTsumogiri = elTsumogiri.checked;

    let elWaits = document.getElementById('set-waits');
    if (elWaits) confWaitsHint = elWaits.checked;

    // 2. 設定画面を閉じる
    document.getElementById('settings-screen').style.display = 'none';

    // 3. 🌟 ここでようやく雀卓を表示し、ゲーム初期化（init）を走らせる！
    document.querySelector('.table').style.opacity = 1;
    init();

    console.log("適用された設定:", { timeCall, timeExchange, confCpuLevel, confTsumogiri, confWaitsHint });
}

// ⚙️ 対局前設定画面の入力値を「初期値」にリセットする関数
function resetMatchSettingsUI() {
    playSE('click'); // 音を鳴らす

    // セレクトボックス（CPUレベル）を「ふつう(1)」に戻す
    const elCpu = document.getElementById('set-cpu');
    if (elCpu) elCpu.value = "1";

    // スライダーと、横の数値テキストを初期値に戻す
    const elDiscard = document.getElementById('set-discard');
    if (elDiscard) { elDiscard.value = 60; document.getElementById('val-discard').innerText = "60"; }

    const elCall = document.getElementById('set-call');
    if (elCall) { elCall.value = 20; document.getElementById('val-call').innerText = "20"; }

    const elExchange = document.getElementById('set-exchange');
    if (elExchange) { elExchange.value = 30; document.getElementById('val-exchange').innerText = "30"; }

    // チェックボックスを初期状態に戻す
    const elTsumogiri = document.getElementById('set-tsumogiri');
    if (elTsumogiri) elTsumogiri.checked = true;

    const elWaits = document.getElementById('set-waits');
    if (elWaits) elWaits.checked = true;

    const elEffective = document.getElementById('set-effective');
    if (elEffective) elEffective.checked = false;
}

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
            //timeExchange = Math.max(5, timeExchange - 10);

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

// 🤖 オート進行モードのON/OFFを切り替える関数（いつでも予約可能）
function toggleAutoPlay() {
    isAutoPlay = !isAutoPlay;
    const btn = document.getElementById('btn-auto-play');

    if (isAutoPlay) {
        // ON状態（聴牌前でも緑色にする）
        btn.innerText = "オート(和了後): ON";
        btn.style.background = "#27ae60";
        btn.style.boxShadow = "0 3px #2ecc71";

        // もしONにした瞬間にすでに聴牌・打牌番なら即座に実行を試みる
        triggerAutoPlayIfNeeded();
    } else {
        // OFF状態
        btn.innerText = "オート(和了後): OFF";
        btn.style.background = "#7f8c8d";
        btn.style.boxShadow = "0 3px #95a5a6";
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

    // 🌟 修正：テンパイしていない間はオートを「完全に殺しておく」
    if (!isPlayerTenpai()) return;

    const msgText = document.getElementById('msg').innerText;
    const btnWin = document.getElementById('btn-win');

    let isWinVisible = btnWin.style.display === "block" || btnWin.style.display === "flex";

    if (turn === 0 && msgText.includes("打牌")) {
        const selfActions = document.getElementById('self-actions');
        // 🌟 追加：暗槓やJokerSwapのボタンが出ている場合は、勝手にボタンを押さずにストップ！
        if (selfActions.innerHTML !== '') {
            return;
        }

        if (isWinVisible) {
            btnWin.click();
        } else {
            if (drawnTile !== "") {
                discard(drawnTile, true);
            } else {
                let displayHand = [...myHand].sort((a, b) => SM[a] - SM[b]);
                discard(displayHand[displayHand.length - 1], false);
            }
        }
    } else if (msgText === "鳴き" || msgText.includes("チャンス")) {
        const btnSkip = document.getElementById('btn-skip');
        if (isWinVisible) {
            btnWin.click();
        } else if (btnSkip && (btnSkip.style.display === "block" || btnSkip.style.display === "flex")) {
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
            `<span style="color:${titleColor}; font-size:12px;">【${title}】</span><br>⚙️ あなた ${rateStr}` :
            `<span style="color:${titleColor}; font-size:12px;">【${title}】</span><br>CPU ${i} ${rateStr}`;

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
        const res = await fetch(`http://127.0.0.1:8000/get_waits?player_idx=0&_t=${new Date().getTime()}`, { cache: 'no-store' });
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

    const cUi = document.getElementById('charleston-ui');
    cUi.style.zIndex = "9999";
    cUi.style.display = "block";

    document.getElementById('btn-exchange').style.display = "none";
    render();

    // 🌟 描画の後にメッセージを上書きする
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
        await sleep(800 / speedMult); // 演出のタメ
        let willDo = Math.random() < 0.7; // TODO: CPUの性格に合わせる
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
        clearCharlestonStatus();
        render(); renderCPU();

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

        // 交換フェーズ中でない時だけ、メッセージを空にする（通常時への復帰）
        if (!charlestonPhase) {
            document.getElementById('msg').innerText = "";
            document.getElementById('msg').className = "";
        }

        let displayHand = [...myHand];
        let dTile = "";
        if (turn === 0 && drawnTile !== "" && displayHand.includes(drawnTile)) {
            displayHand.splice(displayHand.indexOf(drawnTile), 1);
            dTile = drawnTile;
        }

        displayHand.forEach((t, idx) => {
            const i = document.createElement('img'); i.className = 'tile'; i.src = `images/${t}.png`;
            if (charlestonPhase && exchangeSelection.includes(idx)) i.classList.add('selected-exchange');

            i.onclick = () => {
                if (charlestonPhase) {
                    toggleExchange(idx);
                } else if (!isProc && turn === 0) {
                    let msgText = document.getElementById('msg').innerText;
                    if (msgText === "鳴き" || msgText === "海底牌" || msgText === "槍槓チャンス") return;

                    if (myWinTiles.length > 0) {
                        logMsg("アガリ後は手牌を入れ替えられません！右端のツモ牌を捨ててください。", true);
                    } else {
                        discard(t, false);
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
                if (!isProc && turn === 0 && !charlestonPhase) {
                    let msgText = document.getElementById('msg').innerText;
                    if (msgText === "鳴き" || msgText === "海底牌" || msgText === "槍槓チャンス") return;

                    discard(dTile, true);
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
        let cpuHand = myAllHands[i] || [];

        let limit = cpuHand.length - (hideCpuTiles[i] || 0);
        for (let j = 0; j < limit; j++) {
            const t = cpuHand[j];
            const img = document.createElement('img');
            img.className = 'tile';

            img.src = isDevMode ? `images/${t}.png` : `images/ura.png`;

            if (j === limit - 1 && limit % 3 === 2) {
                img.style.position = 'absolute';
                img.style.margin = '0';

                if (i === 1) { img.style.bottom = 'calc(100% + 10px)'; img.style.left = '0'; }
                if (i === 2) { img.style.right = 'calc(100% + 15px)'; img.style.top = '0'; }
                if (i === 3) { img.style.top = 'calc(100% + 10px)'; img.style.left = '0'; }
            }

            c.appendChild(img);
        }

        renderMelds(i);
        renderWinTiles(i);
    }
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
            if (btnWin.style.display === "block" || btnWin.style.display === "flex" || selfActions.innerHTML !== '') {
                shouldAlert = true;
                // 🌟 修正：オート中でも「アクション（暗槓・JokerSwap）」がある場合はアラート音を鳴らす！
                if (isAutoPlay && isPlayerTenpai() && selfActions.innerHTML === '') {
                    shouldAlert = false;
                }
            }
            if (shouldAlert) {
                playSE('alert');
            }

            isProc = false;

            let autoActed = false;
            // 🌟 修正：オートON、かつ【テンパイしている時だけ】自動ツモ切りを行う
            if (isAutoPlay && isPlayerTenpai()) {
                // 🌟 最優先：暗槓やJokerSwapができる牌を引いた時は、和了やツモ切りよりも「待機」を優先する！
                if (selfActions.innerHTML !== '') {
                    showCenterMessage(`<span style="color:#f39c12;font-size:24px;">アクション可能なため<br>オート進行を一時待機します</span>`);
                    setTimeout(hideCenterMessage, 2500);
                    // autoActed = false のままなので、下のタイマーが起動して手動操作になる
                }
                else if (canWin) {
                    isProc = true;
                    setTimeout(() => { isProc = false; execTsumo(); }, 800 / speedMult);
                    autoActed = true;
                }
                else {
                    if (drawnTile !== "") {
                        isProc = true;
                        setTimeout(() => { isProc = false; discard(drawnTile, true); }, 600 / speedMult);
                        autoActed = true;
                    }
                }
            }

            // 🌟 オートが機能していない（テンパイ前、またはOFF）場合は手動操作を待つ
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
            // 🌟 絶対に 1 が正解です（山が残り1枚の時に、引くか引かないかの選択を出すため）
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
        const data = await apiCall('/get_valid_self_melds', { player_idx: 0 });

        if (data.valid_melds) {
            currentValidMelds = data.valid_melds;
            renderSelfMeldsMenu();
        }
    } catch (e) {
        console.error("Self meld validation failed:", e);
    }
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
    const wd = await apiCall('/check_win', { player_idx: 0, is_ron: "false", is_rinshan: pendingIsRinshan, is_haitei: isHaitei, is_chankan: "false" });
    if (wd.can_win) {
        const btn = document.getElementById('btn-win');

        // 🌟 修正：過去の「ロン」の表示を上書きして、「ツモ」と引いた牌の画像にする！
        let winTile = drawnTile !== "" ? drawnTile : myHand[myHand.length - 1];
        const getImg = (t) => `<img src="images/${t}.png" style="height: 28px; border-radius: 2px; box-shadow: 1px 1px 3px rgba(0,0,0,0.5); vertical-align: middle;">`;

        btn.innerHTML = `ツモ ${getImg(winTile)}`;
        btn.style.display = "flex";
        btn.style.alignItems = "center";
        btn.style.gap = "5px";

        btn.onclick = () => execTsumo();

        if (isAutoPlay && myWinTiles.length > 0 && document.getElementById('self-actions').innerHTML === '') {
            btn.style.display = "none";
        } else {
            btn.style.display = "flex"; // 🌟 blockからflexに変更してレイアウト崩れ防止
        }
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
        const r = document.getElementById(`river-${lastDiscardPlayer}`);
        if (r && r.lastChild) r.removeChild(r.lastChild);
        lastDiscardPlayer = -1;
    }
}

// 🖐️ 指定した牌を捨てる通信を行い、CPUの反応待ちへ進む関数
async function discard(t, isTsumogiri = false) {
    stopTimer();
    if (isProc) return; // 🌟 変更：複雑な条件を削除してシンプルに
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

                    // 🌟 追加：槍槓用のロンボタンにも画像を仕込む
                    let kTile = data.kakan_tile;
                    btnWin.innerHTML = `ロン <img src="images/${kTile}.png" style="height: 28px; border-radius: 2px; box-shadow: 1px 1px 3px rgba(0,0,0,0.5); vertical-align: middle;">`;

                    let isAutoDigest = (isAutoPlay);
                    if (!isAutoDigest) {
                        btnWin.style.display = "flex";       // blockからflexに変更
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

                        await execRon(true); // あなたがロン！
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

                    // 🌟 修正：フリーズ対策のロック解除
                    isProc = false;

                    if (isAutoDigest) {
                        isProc = true;
                        setTimeout(() => { isProc = false; btnWin.click(); }, 800 / speedMult);
                    } else {
                        startTimer(timeCall, () => btnSkip.click());
                    }
                    return;
                } else {
                    // 🌟 警告の原因：前回ここのカッコと処理が消えてしまっていました！
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
    } catch (e) {
        if (e.message === "流局") handleRoundEnd();
    }
}

// 👁️ 他家が牌を捨てた時、自分が鳴けるか・ロンできるか判定してボタンを出す関数
async function checkHumanReaction(discarderIdx, tile) {
    const count = myHand.filter(t => t === tile).length;
    const hasSeason = myHand.some(t => ["春", "夏", "秋", "冬"].includes(t));
    const isSeasonDiscard = ["春", "夏", "秋", "冬"].includes(tile);
    const isHaitei = (wallCount === 0);

    let showAny = false;
    const getImg = (t) => `<img src="images/${t}.png" style="height: 28px; border-radius: 2px; box-shadow: 1px 1px 3px rgba(0,0,0,0.5);">`;

    const wd = await apiCall('/check_win', { player_idx: 0, last_tile: tile, is_ron: "true", is_haitei: isHaitei, is_chankan: "false" });

    // 🌟 頭ハネ判定（ここはお客様の希望通り正常に動作します）
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

    let canHumanRon = wd.can_win && !higherPriorityCpuWillRon;

    if (!canHumanRon && anyCpuWillRon) {
        return checkCpuReactions(discarderIdx, tile);
    }

    if (canHumanRon) {
        const btn = document.getElementById('btn-win');
        btn.innerHTML = `ロン ${getImg(tile)}`;
        btn.style.display = "flex";
        btn.style.alignItems = "center";
        btn.style.gap = "5px";
        btn.onclick = () => execRon(false);

        if (isAutoPlay) {
            btn.style.display = "none";
        }
        showAny = true;
    }

    if (!anyCpuWillRon && myWinTiles.length === 0) {
        if (count >= 2 && wallCount > 0) {
            const btn = document.getElementById('btn-pon');
            btn.innerHTML = `ポン ${getImg(tile)}`;
            btn.style.display = "flex";
            btn.style.alignItems = "center";
            btn.style.gap = "5px";
            showAny = true;
        }
        if (count >= 3 && wallCount > 0) {
            const btn = document.getElementById('btn-kan');
            btn.innerHTML = `明槓 ${getImg(tile)}`;
            btn.style.display = "flex";
            btn.style.alignItems = "center";
            btn.style.gap = "5px";
            showAny = true;
        }
        if (count === 2 && hasSeason && !isSeasonDiscard && wallCount > 0) {
            const btn = document.getElementById('btn-hanakan');
            btn.innerHTML = `花槓 ${getImg(tile)}`;
            btn.style.display = "flex";
            btn.style.alignItems = "center";
            btn.style.gap = "5px";
            showAny = true;
        }
    }

    renderCPU();

    if (showAny) {
        // 🌟 修正：オートON かつ テンパイしている時だけ、ポンなどを自動スルーしてロンを優先させる
        let isAutoDigest = (isAutoPlay && isPlayerTenpai());

        if (!isAutoDigest) {
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
        document.getElementById('msg').innerText = "鳴き";

        if (isAutoDigest) {
            isProc = true;
            setTimeout(() => {
                isProc = false;
                if (canHumanRon) {
                    execRon(false);
                } else {
                    skipAction();
                }
            }, 800 / speedMult);
        } else {
            // テンパイ前（機能を殺している間）は普通にタイマーを動かして手動でポンなどを選ばせる
            startTimer(timeCall, () => {
                skipAction();
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

                if (isKakan) {
                    showCallout(data.player, "槍槓");
                    await sleep(1500);

                    // 奪われるCPUの副露から1枚減らす
                    let targetMelds = myAllMelds[discarderIdx];
                    if (targetMelds && targetMelds.length > 0) {
                        let m = targetMelds.find(m => m.tiles.length === 4 && m.tiles.includes(tile));
                        if (m) {
                            m.tiles.pop();
                            m.type = "pong";
                        }
                    }
                } else {
                    removeLastDiscard();
                }

                // 🌟 ここで描画！文字が出たあとに牌が動く
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
    if (isProc) return;
    isProc = true;

    document.querySelectorAll('.action-layer .btn-act').forEach(b => b.style.display = "none");

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

    const data = await apiCall('/win_ron', { player_idx: 0, tile: lastT, is_chankan: isChankan, discarder: lastDiscardPlayer });

    // 🌟 追加：もし自分より優先順位の高いCPUのロンが成立して割り込まれた場合
    if (data.intercepted && data.type === "ron") {
        showCallout(data.player, "胡");
        await sleep(1500);
        if (data.yaku && data.yaku.includes("地胡")) { showCallout(data.player, "地胡"); await sleep(4000); }
        for (let y of (data.yaku || [])) {
            if (y === "花天月地") { showCallout(data.player, y); await sleep(1500); }
        }
        removeLastDiscard();
        render(); renderCPU();
        isProc = false; checkT();
        return;
    }

    // 1. まず「胡」を出す
    showCallout(0, "胡");
    await sleep(1500);

    // 🌟 2. 槍槓（チャンカン）の場合、牌を動かす前に演出を入れる！
    if (isChankan) {
        showCallout(0, "槍槓");
        await sleep(1500); // 「槍槓」の文字をじっくり見せる

        // 演出が終わったので、相手の副露を減らす（奪う準備）
        let cpuMelds = myAllMelds[lastDiscardPlayer];
        if (cpuMelds && cpuMelds.length > 0) {
            let targetMeld = cpuMelds.find(m => m.tiles.length === 4 && m.tiles.includes(lastT));
            if (targetMeld) {
                targetMeld.tiles.pop();
                targetMeld.type = "pong";
            }
        }
    } else {
        removeLastDiscard();
    }

    // 🌟 3. ここで描画！これで「槍槓」の文字が出たあとに牌が動く
    render(); renderCPU();

    if (data.yaku) {
        if (data.yaku.includes("地胡")) { showCallout(0, "地胡"); await sleep(4000); }

        for (let y of data.yaku) {
            // 🌟🌟🌟 ここを修正！ 「槍槓」は既に上で出しているので除外し、「花天月地」だけを残す！
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

    const data = await apiCall('/meld', { player_idx: 0, type: type, tile: lastT, discarder: lastDiscardPlayer });

    // 🌟 追加：もしCPUのロンが優先された場合、そちらの演出を流して鳴きをキャンセル
    if (data.intercepted && data.type === "ron") {
        showCallout(data.player, "胡");
        await sleep(1500);
        if (data.yaku && data.yaku.includes("地胡")) { showCallout(data.player, "地胡"); await sleep(4000); }
        for (let y of (data.yaku || [])) {
            if (y === "花天月地") { showCallout(data.player, y); await sleep(1500); }
        }
        removeLastDiscard();
        render(); renderCPU();
        isProc = false; checkT();
        return;
    }

    removeLastDiscard();
    render(); renderCPU();

    let callText = (type.includes("槓") || type.includes("カン")) ? "槓" : "碰";
    showCallout(0, callText);
    await sleep(1500);

    if (type === 'カン' || type === '花槓') {
        if (type === '花槓') {
            // 🏆 ここを変更！【花槓マスター】（明槓）
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
    if (isProc) return; isProc = true; document.getElementById('self-actions').innerHTML = '';

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
    if (isProc) return; isProc = true; document.getElementById('self-actions').innerHTML = '';
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
    document.getElementById('msg').innerHTML = "点数計算中...";
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

            // 🏆 ここに追加！【四季常春】
            let allMyTiles = [...myHand];
            myMelds.forEach(m => m.tiles.forEach(t => allMyTiles.push(t)));
            if (allMyTiles.includes("春") && allMyTiles.includes("夏") && allMyTiles.includes("秋") && allMyTiles.includes("冬")) {
                if (playerStats.masterOfSeasonsCount === 0) {
                    playerStats.masterOfSeasonsCount = 1;
                    showAchievementUnlock("四季常春", "🌍");
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

    // 🌟 変更点1: 勝者だけ(calcData.results)のループをやめ、0〜3の4人全員のループにする
    for (let i = 0; i < 4; i++) {
        let isWinner = false;
        let winData = null;

        // 🌟 変更点2: 今処理している人(i)がアガったかどうかをチェックする
        for (let res of calcData.results) {
            if (res.player === i) {
                isWinner = true;
                winData = res;
                break;
            }
        }

        let diff = calcData.scores[i]; // この局での点数変動

        let yakuHtml = "";
        let titleText = "";
        let scoreText = "";
        let scoreColor = "";

        // 🌟 変更点3: アガった人と、それ以外(0点・失点)で表示内容を分ける
        if (isWinner) {
            // ▼ アガった人（今まで通りの役リスト計算処理）
            titleText = (i === 0) ? "あなたの和了！" : `CPU ${i} の和了！`;
            scoreText = `${winData.total_score} 点`;
            scoreColor = "#2ecc71"; // 緑色

            let groupedDetails = {};
            for (let detail of winData.details) {
                let yakuKey = [...detail.yaku].sort().join(",");
                let groupKey = `${detail.tile}_${yakuKey}`;

                if (!groupedDetails[groupKey]) {
                    groupedDetails[groupKey] = {
                        tile: detail.tile, yaku: detail.yaku, score: detail.score, count: 1, total_score: detail.score
                    };
                } else {
                    groupedDetails[groupKey].count++;
                    groupedDetails[groupKey].total_score += detail.score;
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
                            <span style="color: #ddd; margin-right: 10px; font-size: 16px;">和了牌</span>
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
            // ▼ アガれなかった人・マイナスの人用の表示
            titleText = (i === 0) ? "あなたの結果" : `CPU ${i} の結果`;
            let diffStr = diff > 0 ? `+${diff}` : (diff === 0 ? `±0` : `${diff}`);
            scoreText = `${diffStr} 点`;
            scoreColor = diff > 0 ? "#2ecc71" : (diff < 0 ? "#e74c3c" : "#bdc3c7");

            let resultLabel = diff < 0 ? "失点 (振込み等)" : (calcData.results.length === 0 ? "流局" : "ー");
            yakuHtml = `
                <div style="font-size: 24px; font-weight: bold; color: #bdc3c7; background: rgba(0,0,0,0.6); padding: 15px 40px; border-radius: 8px; border: 2px solid #555; text-align: center; margin-top: 10px;">
                    ${resultLabel}
                </div>`;
        }

        // 🌟 変更点4: 手牌の取得元を「res.player」から「i」に変更
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

        // 🌟 画面へのセット（scoreは色付けのため innerHTML で上書き）
        document.getElementById('win-label-text').innerText = titleText;
        document.getElementById('win-score').innerHTML = scoreText;
        document.getElementById('win-score').style.color = scoreColor;
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

        if (!rsEl) continue;

        // 🌟 位置の微調整（座席ごとに数値を書き換えて調整してください）
        const posOffsets = [
            { bottom: "110px", left: "50%" },  // 0: あなた（下）
            { right: "120px", top: "50%" },    // 1: 下家（右）
            { top: "110px", left: "50%" },     // 2: 対面（上）
            { left: "120px", top: "50%" }      // 3: 上家（左）
        ];

        // スタイル適用
        const offset = posOffsets[targetIdx];
        rsEl.style.bottom = offset.bottom || "auto";
        rsEl.style.top = offset.top || "auto";
        rsEl.style.left = offset.left || "auto";
        rsEl.style.right = offset.right || "auto";
        rsEl.style.zIndex = "10000"; // アニメーションは全UIの最前面

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

    await sleep(3500);

    for (let i = 0; i < 4; i++) {
        document.getElementById(`player-round-score-${i}`).className = "player-round-score";
    }

    if (currentRound >= 4) {
        // 🌟 1. まず現在の最終スコアで順位を確定させる
        let sortedIndices = [0, 1, 2, 3].sort((a, b) => totalScores[b] - totalScores[a]);
        let myRank = sortedIndices.indexOf(0) + 1; // 1位～4位

        // 🌟 2. 歴史(recentRecords)に今回の順位とスコアを追加（ここを先に行う！）
        playerStats.recentRecords.unshift({ rank: myRank, score: totalScores[0] });
        if (playerStats.recentRecords.length > 20) playerStats.recentRecords.pop();

        // 📊 累計データの更新
        playerStats.totalGamesPlayed++;
        playerStats.rankCounts[myRank - 1]++;

        // 🏆 連勝記録・逆転の劇薬などの判定（ここは既存通り）
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

        // --- 📈 レート計算（ジャイアントキリング補正版） ---
        let oldRate = playerRatings[0];
        let rateChanges = [0, 0, 0, 0];
        let avgScore = totalScores.reduce((a, b) => a + b, 0) / 4;
        let avgTableRate = playerRatings.reduce((sum, r) => sum + r, 0) / 4;

        if (currentGameMode === 'online' || currentGameMode === 'cpu') {
            let placementPoints = [15, 5, -5, -15];
            for (let rank = 0; rank < 4; rank++) {
                let pIdx = sortedIndices[rank];
                let scoreBonus = Math.floor((totalScores[pIdx] - avgScore) / 100);
                let rateDiff = avgTableRate - playerRatings[pIdx];
                let rateCorrection = Math.round(rateDiff / 40);

                let change = placementPoints[rank] + scoreBonus + rateCorrection;
                if (rank === 0 && change <= 0) change = 1;
                if (rank === 3 && change >= 0) change = -1;

                rateChanges[pIdx] = change;
                playerRatings[pIdx] += change;
                if (playerRatings[pIdx] < 0) playerRatings[pIdx] = 0;
            }

            // レート実績判定
            let newRate = playerRatings[0];
            if (oldRate < 1600 && newRate >= 1600) showAchievementUnlock("レートの階段 (1600)", "📈");
            if (oldRate < 1700 && newRate >= 1700) showAchievementUnlock("レートの階段 (1700)", "📈");
            if (oldRate < 1800 && newRate >= 1800) showAchievementUnlock("レートの階段 (1800)", "📈");
            if (oldRate < 1900 && newRate >= 1900) showAchievementUnlock("レートの階段 (1900)", "📈");
            if (oldRate < 2000 && newRate >= 2000) showAchievementUnlock("頂に立つ者", "👑");
        }

        // 🌟 3. 全てのデータが確定してからセーブ！
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

// 🎮 「CPU戦」を選択した時、いきなり始めずに【設定画面を開く】ように変更
function startCpuGame() {
    playSE('click');
    currentGameMode = 'cpu';
    const modeScreen = document.getElementById('mode-select-screen');

    // モード選択画面をフワッと消す
    modeScreen.style.opacity = '0';
    modeScreen.style.transition = 'opacity 0.5s';

    setTimeout(() => {
        modeScreen.style.display = 'none';
        modeScreen.style.opacity = '1';

        // 🌟 雀卓(init)ではなく、設定画面を呼び出す！
        document.getElementById('settings-screen').style.display = 'flex';
        document.getElementById('settings-screen').style.zIndex = '35000'; // 念のため最前面に
    }, 500);
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
        { id: "master_of_seasons", icon: "🌍", title: "四季常春", desc: "1局の手牌に四季牌4種すべてを揃えて和了", val: playerStats.masterOfSeasonsCount, tiers: [1, 1, 1, 1], unit: "回" },
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

    // 🌟 修正：最高打点の牌姿表示を分かりやすくする
    if (playerStats.maxScoreHand) {
        const { tiles, melds, winTile } = playerStats.maxScoreHand;

        // 🌟 1. 副露（鳴き牌）を描画
        if (melds && melds.length > 0) {
            melds.forEach((m) => {
                m.tiles.forEach((t, i) => {
                    let src = (m.type === 'ankan' && (i === 0 || i === 3)) ? 'ura' : t;
                    // 青いラインや背景を廃止し、普通の牌と同じように並べる
                    handTiles.innerHTML += `<img src="images/${src}.png" style="width:20px; height:28px; border-radius:2px; margin-right:1px;">`;
                });
                // 鳴いたグループ同士の間にほんの少し（3px）だけ隙間を開ける
                handTiles.innerHTML += `<div style="width:3px; display:inline-block;"></div>`;
            });
            // 🌟 手牌との境界線（金色の縦線）はそのまま残す
            handTiles.innerHTML += `<div style="width:2px; height:24px; background:#f1c40f; display:inline-block; vertical-align:middle; margin: 0 6px; opacity: 0.8;"></div>`;
        }

        // 🌟 2. 門前（手牌）部分を描画
        [...tiles].sort((a, b) => SM[a] - SM[b]).forEach(t => {
            handTiles.innerHTML += `<img src="images/${t}.png" style="width:20px; height:28px; border-radius:2px; margin-right:1px;">`;
        });

        // 🌟 3. 和了牌を一番右に描画（黄色い太枠付き）
        if (winTile) {
            handTiles.innerHTML += `<div style="width:8px; display:inline-block;"></div><img src="images/${winTile}.png" style="width:20px; height:28px; border:2px solid #f1c40f; border-radius:2px; box-sizing:border-box; box-shadow: 0 0 5px #f1c40f;">`;
        }
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
            layout: {
                /* 🌟 ここのパディングを大きくするとグラフ自体は小さくなり、
                   外側のラベル（引き出し線）のスペースが広くなります */
                padding: {
                    left: 60,
                    right: 60,
                    top: 20,
                    bottom: 20
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: { enabled: !isZeroData }
            }
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

    // 自分が入ったので1人に設定
    document.getElementById('room-player-count').innerText = "1";

    // 🌟 WebSocketサーバーに接続する（ws:// で繋ぐ）
    const wsUrl = `ws://${window.location.host}/ws/lobby/${roomId}`;
    lobbyWs = new WebSocket(wsUrl);

    // 🌟 サーバーからメッセージ（人数の更新など）を受け取った時の処理
    lobbyWs.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "lobby_update") {
            // 画面の人数表記をサーバーから来た数字に書き換える
            document.getElementById('room-player-count').innerText = data.player_count;

            // 4人揃ったら次のステップへ！
            if (data.player_count === 4) {
                // 少しだけ待ってからアラートを出す（数字が4になるのを見せるため）
                setTimeout(() => {
                    alert("4人揃いました！ゲームを開始します！\n（※対局への遷移処理はこれから作ります）");
                }, 500);
            }
        }
    };

    lobbyWs.onclose = () => {
        console.log("ロビーから切断されました");
    };
}

// 📋 招待URLをクリップボードにコピーする関数
function copyRoomUrl() {
    playSE('click');
    // 現在のURLの末尾に ?room=ABCD をくっつける
    const url = window.location.origin + window.location.pathname + "?room=" + currentRoomId;

    navigator.clipboard.writeText(url).then(() => {
        alert("招待URLをコピーしました！\n" + url + "\n友達にLINE等で送って招待しましょう。");
    }).catch(err => {
        alert("コピーに失敗しました。手動でURLを共有してください。");
    });
}

// ==========================================
// ★ マウス操作・ショートカット制御
// ==========================================

// 🖱️ 右クリックでツモ切り（引いてきた牌をそのまま捨てる）機能
document.addEventListener('contextmenu', (e) => {
    // ブラウザ標準の右クリックメニューが出るのを防ぐ
    e.preventDefault();

    // 自分のターンで、処理中ではなく、ツモ牌が存在し、交換フェーズではない場合
    if (!isProc && turn === 0 && drawnTile !== "" && !charlestonPhase) {

        // 特殊な選択待ち状態（他家の牌を鳴くかどうかの場面など）では誤爆を防ぐ
        const msgText = document.getElementById('msg').innerText;
        if (msgText === "鳴き" || msgText === "海底牌" || msgText === "槍槓チャンス") return;

        // ツモ切りを実行（true を渡すことでエフェクトがツモ切り専用の青白い光になる）
        discard(drawnTile, true);
    }
});

// ==========================================
// 🍔 サイドバーメニューの開閉とボタン連動（修正版）
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const sidebarMenu = document.getElementById('sidebar-menu');
    const sidebarCloseBtn = document.getElementById('sidebar-close-btn');
    const sidebarOverlay = document.getElementById('sidebar-overlay');

    // メニューを開く
    function openSidebar() {
        playSE('click'); // 🌟 音を鳴らす
        sidebarMenu.classList.add('open');
        sidebarOverlay.classList.add('show');
    }

    // メニューを閉じる
    function closeSidebar() {
        playSE('click'); // 🌟 音を鳴らす
        sidebarMenu.classList.remove('open');
        sidebarOverlay.classList.remove('show');
    }

    // 開閉イベントの登録
    if (hamburgerBtn) hamburgerBtn.addEventListener('click', openSidebar);
    if (sidebarCloseBtn) sidebarCloseBtn.addEventListener('click', closeSidebar);
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);

    // ▼ 各ボタンを押した時の処理 ▼

    // ⚙️ 設定（既存の openSettings() を直接呼ぶ）
    document.getElementById('sidebar-settings')?.addEventListener('click', () => {
        closeSidebar();
        openSettings(); // 🌟 モーダルを開く関数
    });

    // 📖 ルール（遊び方）（既存の openHowTo() を直接呼ぶ）
    document.getElementById('sidebar-rules')?.addEventListener('click', () => {
        closeSidebar();
        openHowTo(); // 🌟 モーダルを開く関数
    });

    // 🀄 役一覧（既存の openYakuList() を直接呼ぶ）
    document.getElementById('sidebar-yaku')?.addEventListener('click', () => {
        closeSidebar();
        openYakuList(); // 🌟 モーダルを開く関数
    });

    // 🚪 退出（既存の quitGame() のロジックを使う）
    document.getElementById('sidebar-exit')?.addEventListener('click', () => {
        closeSidebar();
        // 🌟 quitGame() と同じ確認＆ホーム直行処理
        if (confirm("本当に対局を中断してホーム画面に戻りますか？\n（進行中のスコアや戦績は保存されません）")) {
            playSE('click');
            stopTimer();
            sessionStorage.setItem('shiki_mahjong_return_home', 'true');
            location.reload();
        }
    });
});
