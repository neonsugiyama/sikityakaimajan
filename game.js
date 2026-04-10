        // 🌟 追加：リザルト待機とスクショ用の変数と関数
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

        function skipResultWait() {
            if (resultTimerInterval) clearInterval(resultTimerInterval);
            document.getElementById('result-controls').style.display = "none";
            if (resultWaitResolver) resultWaitResolver();
        }

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
                    useCORS: true // 🌟 これを追加！画像のセキュリティ制限を突破して描画を許可する
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
        function openSettings() {
            document.getElementById('settings-modal').style.display = 'flex';
            playSE('click');
        }

        function closeSettings() {
            document.getElementById('settings-modal').style.display = 'none';
            playSE('click');
        }

        // 設定をブラウザに保存する
function saveSettings() {
    const config = {
        speed: speedMult,
        bgmVolume: sounds.bgm.volume,
        seVolume: masterSEVolume,
        tableColor1: document.getElementById('table-color-1').value,
        tableColor2: document.getElementById('table-color-2').value,
        devMode: isDevMode,
        langMode: currentLangMode
    };
    localStorage.setItem('shiki_mahjong_settings', JSON.stringify(config));
    console.log("Settings saved.");
}

// 保存された設定を読み込む
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

    // 🌟 これを追加：セーブデータに言語設定があれば復元する
    if (config.langMode !== undefined) {
        currentLangMode = config.langMode;
        applyLangMode(); // 先ほど作った反映関数を呼ぶ！
    }
}

// ==========================================
// ★ セーブデータ（段位・レート）管理
// ==========================================
let playerRatings = [1500, 1500, 1500, 1500];

// 🌟 追加：実績（戦績）用のデータ箱
let playerStats = {
    playerName: "あなた",     // 🌟 追加：プレイヤー名
    maxScore: 0,
    maxScoreHand: null,      // 🌟 追加：最高打点時の手牌データ
    currentWinStreak: 0,
    maxWinStreak: 0,
    yakuCollected: [],
    jokerSwapCount: 0,
    secondCharlestonCount: 0, 
    hanakanCount: 0,          
    totalRoundsPlayed: 0,     
    clutch1PointCount: 0,
    recentRecords: []        // 🌟 追加：直近の順位履歴（最大10戦）
};

// レートに応じた称号を返す
function getRatingTitle(rate) {
    if (rate < 1500) return "ざこ";
    if (rate < 1600) return "よわい";
    if (rate < 1700) return "ふつう";
    if (rate < 1800) return "つよい";
    if (rate < 1900) return "すごい";
    if (rate < 2000) return "やばい";
    return "あたまおかしい";
}

function saveGameData() {
    const data = { 
        ratings: playerRatings,
        stats: playerStats // 🌟 追加：実績データも一緒に保存する
    };
    localStorage.setItem('shiki_mahjong_data', JSON.stringify(data));
}

function loadGameData() {
    const saved = localStorage.getItem('shiki_mahjong_data');
    if (saved) {
        const data = JSON.parse(saved);
        if (data.ratings) playerRatings = data.ratings;
        if (data.stats) {
            // 🌟 追加：既存のデータとマージして読み込む
            playerStats = { ...playerStats, ...data.stats };
        }
    }
}
window.addEventListener('DOMContentLoaded', loadGameData);

        // 🌟 グラデーションを適用する関数（円形グラデーションでスポットライトを演出）
        function updateTableGradient() {
            const c1 = document.getElementById('table-color-1').value;
            const c2 = document.getElementById('table-color-2').value;
            document.querySelector('.table').style.background = `radial-gradient(circle at center, ${c1} 0%, ${c2} 100%)`;
            saveSettings();
        }

        // 🌟 追加：開発者モードのON/OFF制御
        let isDevMode = false;
        function toggleDevMode(isChecked) {
            isDevMode = isChecked;
            document.getElementById('settings-dev-mode').checked = isDevMode;

            const debugPanel = document.querySelector('.debug-panel');
            const debugLog = document.getElementById('debug-log');

            if (isDevMode) {
                debugPanel.style.display = 'flex';
                if (debugLog.innerHTML !== '') debugLog.style.display = 'block';
            } else {
                debugPanel.style.display = 'none';
                debugLog.style.display = 'none';
            }

            // 🌟 追加：モードを切り替えた瞬間に再描画して、手牌とターゲット表示を更新する！
            updateInfoUI();
            renderCPU();

            saveSettings();
        }

        // 🌟 初期設定に戻す関数（完全版）
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

            // 🌟 5. 開発者モードを完全にリセット（OFFにして隠す）
            toggleDevMode(false);
            const devContainer = document.getElementById('dev-mode-container');
            if (devContainer) devContainer.style.display = "none";

            playSE('click');

            console.log("Settings reset to default.");
        }

        // ページ読み込み時の処理（ロードを先に行う！）
        window.addEventListener('DOMContentLoaded', () => {
            const saved = localStorage.getItem('shiki_mahjong_settings');
            if (saved) {
                // セーブデータがあれば、それを読み込む（この中で色も塗られます）
                loadSettings();
            } else {
                // 初回プレイ（セーブがない）時だけ、デフォルトの色を塗る
                updateTableGradient();
            }
        });

        // BGMの音量変更
        function updateMasterBGM(val) {
            const v = parseFloat(val);
            sounds.bgm.volume = v;
            document.getElementById('settings-bgm-label').innerText = `${Math.round(v * 100)}%`;
            saveSettings();
        }

        // SE全体の倍率を保存しておく変数
        let masterSEVolume = 1.0;

        // SEの音量変更（テスト音を鳴らすか選べるようにする）
        function updateMasterSE(val, playTestSound = false) {
            masterSEVolume = parseFloat(val);
            document.getElementById('settings-se-label').innerText = `${Math.round(masterSEVolume * 100)}%`;
            if (playTestSound) {
                playSE('dahai'); // スライダーを手動で動かした時だけ鳴らす
            }
            saveSettings();
        }

// ==========================================
// ★ チュートリアル＆役一覧の制御
// ==========================================
let currentLangMode = 0; // 0: 中国語, 1: 日本語, 2: 英語

// 🌟 言語設定を画面に反映する専用の関数
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

// 🌟 ボタンを押した時の処理
function toggleYakuLang() {
    currentLangMode = (currentLangMode + 1) % 3;
    applyLangMode();
    playSE('click');
    saveSettings(); // 🌟 言語を切り替えた瞬間にセーブ！
}

// 🌟 中国語の役名を日本語に翻訳する辞書
const yakuJaMap = {
    "天胡": "天和", "地胡": "地和", "七星攬月": "大七星", "清幺九": "清老頭",
    "十八羅漢": "四槓子", "大四風会": "大四喜", "一色四節高": "一色四連刻", "一色四歩高": "一色四連順",
    "小四風会": "小四喜", "陰陽両儀": "黒一色", "寒江独釣": "裸単騎", "十三幺九": "国士無双",
    "三節高": "三連刻", "一気化三清": "三風刻", "十二金釵": "三槓子", "混幺九": "混老頭",
    "清龍": "一気通貫", "碰碰胡": "対々和", "下雨": "暗槓",
    "双同刻": "二同刻", "刮風": "明槓", "字刻": "字刻", "無番和": "無役",
    "無花果": "無花", "槓上開花": "嶺上開花",  "花天月地": "海底河底"
};
function getJaYakuName(zhName) { return yakuJaMap[zhName] || zhName; }

// 🌟 新規追加：中国語の役名を英語に翻訳する辞書
const yakuEnMap = {
    "天胡": "Heavenly hand", "地胡": "Blessing hand", "七星攬月": "Big seven stars", "清幺九": "All terminal",
    "十八羅漢": "Four kang", "大四風会": "Big four winds", "一色四節高": "Four shifted pong", "一色四歩高": "Four shifted chow",
    "小四風会": "Little four winds", "陰陽両儀": "Monochrome tiles", "寒江独釣": "All melded hand", "十三幺九": "Thirteen orphans",
    "三節高": "Three shifted pong", "一気化三清": "Big three winds", "十二金釵": "Three kang", "混幺九": "Terminal & Honor",
    "清龍": "Pure straight", "碰碰胡": "All pong", "下雨": "Concealed kang",
    "双同刻": "Double pong", "刮風": "Melded kang", "字刻": "Character pong", "無番和": "Chicken hand",
    "無花果": "No season tiles", "槓上開花": "Replacement tile",  "花天月地": "Last tile",
    "連七対": "Seven shifted pairs", "九連宝燈": "Nine gates", "紅孔雀": "Red peacock", "七星不靠": "Knitted & honors",
    "緑一色": "All green", "字一色": "All honor", "大三元": "Big dragons", "全大": "Upper tiles", "全中": "Middle tiles & Red", "全小": "Lower tiles",
    "三同刻": "Triple pong", "断紅胡": "Two toned hand",
    "大于五": "Upper four", "小于五": "Lower four", "清一色": "Full flush", "五門斉": "All types", "推不倒": "Reversible tiles",
    "七対": "Seven pairs", "小三元": "Little dragons",
    "混一色": "Half flush", "断么": "All simples", "全単": "All odds",
    "槍槓": "Robbing kang", "妙手回春": "Draw the Spring"
};
function getEnYakuName(zhName) { return yakuEnMap[zhName] || zhName; }

function openHowTo() {
    document.getElementById('howto-modal').style.display = 'flex';
    playSE('click');
}

function closeHowTo() {
    document.getElementById('howto-modal').style.display = 'none';
    playSE('click');
}

function openYakuList() {
    document.getElementById('yaku-modal').style.display = 'flex';
    playSE('click');
}

// 🌟 役一覧のタブ切り替え関数
function switchYakuTab(evt, tabId) {
    // 全てのタブコンテンツを非表示にする
    const tabContents = document.getElementsByClassName("yaku-tab-content");
    for (let i = 0; i < tabContents.length; i++) {
        tabContents[i].style.display = "none";
    }
    // 全てのタブボタンから「active」クラスを外す
    const tabLinks = document.getElementsByClassName("yaku-tab-btn");
    for (let i = 0; i < tabLinks.length; i++) {
        tabLinks[i].classList.remove("active");
    }
    // 指定されたタブを表示し、押されたボタンをアクティブにする
    document.getElementById(tabId).style.display = "block";
    evt.currentTarget.classList.add("active");
    
    // スクロール位置を一番上に戻す
    document.getElementById('yaku-list-container').scrollTop = 0;
}

function closeYakuList() {
    document.getElementById('yaku-modal').style.display = 'none';
    playSE('click');
}

// 🌟 超強化版：中国語・日本語どちらの役名が来ても正しいCSSクラスを返す
function getYakuTierClass(yakuName) {
    // 64点役
    const tier64 = ["天胡", "天和", "地胡", "地和", "七星攬月", "大七星", "清幺九", "清老頭", "連七対", "九連宝燈"];
    // 32点役
    const tier32 = ["十八羅漢", "四槓子", "大四風会", "大四喜", "一色四節高", "一色四連刻", "一色四歩高", "一色四連順", "紅孔雀", "七星不靠"];
    // 16点役
    const tier16 = ["小四風会", "小四喜", "緑一色", "字一色", "陰陽両儀", "黒一色", "大三元", "全大", "全中", "全小", "寒江独釣", "裸単騎", "十三幺九", "国士無双"];
    // 8点役
    const tier8 = ["三節高", "三連刻", "三同刻", "断紅胡", "一気化三清", "三風刻", "十二金釵", "三槓子", "混幺九", "混老頭"];
    // 6点役
    const tier6 = ["大于五", "小于五", "清一色", "清龍", "一気通貫", "五門斉", "推不倒"];
    // 4点役
    const tier4 = ["七対", "小三元", "碰碰胡", "対々和", "下雨", "暗槓"];
    // 2点役
    const tier2 = ["双同刻", "二同刻", "混一色", "刮風", "明槓", "断么", "字刻", "全単"];
    // 乗算役 (x3, x2)
    const tierMulti = ["無花果", "無花", "槓上開花", "嶺上開花", "槍槓", "妙手回春", "花天月地", "海底"];

    if (tier64.includes(yakuName)) return "yaku-tier-64";
    if (tier32.includes(yakuName)) return "yaku-tier-32";
    if (tier16.includes(yakuName)) return "yaku-tier-16";
    if (tier8.includes(yakuName)) return "yaku-tier-8";
    if (tier6.includes(yakuName)) return "yaku-tier-6";
    if (tier4.includes(yakuName)) return "yaku-tier-4";
    if (tier2.includes(yakuName)) return "yaku-tier-2";
    if (tierMulti.includes(yakuName)) return "yaku-tier-multi";

    return "yaku-tier-1"; // 1点役（無番和/無役 など）
}

        // ==========================================
        // ★ 隠しコマンド（開発者モード解放・封印）
        // ==========================================
        let secretClickCount = 0;
        let secretClickTimer = null;

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
                    // 🌟 隠されているなら「解放」
                    devContainer.style.display = "block";
                    playSE('jokerswap_se'); // シュイィィン！
                    alert("【システム解放】\n開発者モードが利用可能になりました。");
                } else {
                    // 🌟 既に出ているなら「再封印」
                    devContainer.style.display = "none";
                    toggleDevMode(false); // スイッチも強制OFFにする
                    alert("【システム封印】\n開発者モードを隠しました。");
                }

                secretClickCount = 0; // カウントリセット
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
            yaku: new Audio('audio/yaku.mp3'),         // 役の読み上げやカットイン音
            score: new Audio('audio/score.mp3'),       // リザルト画面表示時の「ジャン！」
            exchange: new Audio('audio/exchange.mp3'), // 牌が飛んでいく「シャッ」という音
            tick: new Audio('audio/tick.mp3'),          // タイマーの「ピッ、ピッ」という音
            alert: new Audio('audio/alert.mp3'),
            click: new Audio('audio/click.mp3'),
            special_win: new Audio('audio/special_win.mp3'), // 天胡・地胡共通ボイス
            jokerswap_se: new Audio('audio/jokerswap_se.mp3'),
            coin: new Audio('audio/coin.mp3'),            // チャリン！やドギュン！などの加算音
            start: new Audio('audio/start.mp3') 
        };

        const voiceTypes = ['pon', 'kan', 'ron', 'zimo', 'jokerswap'];
        for (let i = 0; i < 4; i++) {
            voiceTypes.forEach(v => {
                // 例: sounds['pon_0'] = new Audio('audio/pon_0.wav') という形で自動生成されます
                sounds[`${v}_${i}`] = new Audio(`audio/${v}_${i}.wav`);
            });
        }

        const soundVolumes = {
            bgm: 0.3,          // BGM（控えめ）
            dahai: 0.6,        // 打牌
            dice: 1.0,         // サイコロ
            exchange: 0.6,     // 交換
            yaku: 0.8,         // 役カットイン（少し大きめ）
            score: 0.8,        // リザルト表示（少し大きめ）
            tick: 0.5,         // タイマー（焦らせすぎない程度に）
            alert: 0.5,        // 通知アラート
            click: 0.2,        // クリック音（かなり控えめ）
            jokerswap_se: 0.3, // JokerSwapの効果音
            coin: 0.4,         // チャリン音

            // ▼ キャラクターボイス系の基本ボリューム（BGM等より大きめがおすすめ）
            pon: 0.8,
            kan: 0.8,
            ron: 1.0,          // アガリの声は最大音量！
            zimo: 1.0,
            jokerswap: 0.9
        };

        // BGMの設定（ループ再生、音量少し控えめ）
        sounds.bgm.loop = true;
        sounds.bgm.volume = 0.3;

        // 🌟 ブラウザの仕様対策：ユーザーが画面を最初にクリックした時にBGMを再生開始する
        function initAudio() {
            if (audioState.initialized) return;
            audioState.initialized = true;
            if (audioState.bgmOn) {
                sounds.bgm.play().catch(e => console.log("BGM自動再生ブロック:", e));
            }
        }
        window.addEventListener('click', initAudio, { once: true });

        // SEを鳴らす関数（連打しても音が重なって鳴るように cloneNode を使う）
        function playSE(soundName) {
            if (!audioState.seOn || !sounds[soundName]) return;
            let clone = sounds[soundName].cloneNode();
            let vol = 0.6; // SEの音量
            if (soundVolumes[soundName] !== undefined) {
                // 通常の効果音（dahai, click, jokerswap_se など）はそのまま一致するか確認
                vol = soundVolumes[soundName];
            } else {
                // キャラクターボイス（pon_0 など）の場合は、後ろの数字を切り捨てて「pon」の音量を見る
                let baseName = soundName.split('_')[0];
                if (soundVolumes[baseName] !== undefined) {
                    vol = soundVolumes[baseName];
                }
            }

            clone.volume = Math.min(1.0, vol * masterSEVolume);

            clone.play().catch(e => console.log("SE再生エラー:", e));
            return clone;
        }

        // BGMのON/OFF切り替え用
        function toggleBGM() {
            audioState.bgmOn = !audioState.bgmOn;
            if (audioState.bgmOn && audioState.initialized) sounds.bgm.play();
            else sounds.bgm.pause();
        }

        function resizeGame() {
            // 基準となる画面スケール（1280x800ベース）
            const scale = Math.min(window.innerWidth / 1280, window.innerHeight / 800);
            
            // 1. ゲーム画面（麻雀卓）のスケール（ここは元のまま）
            const table = document.querySelector('.table');
            if (table) table.style.transform = `scale(${scale})`;

            // 🌟 修正：scaleの前に translate(-50%, -50%) を挟んで、ズレを完全に防ぐ！
            
            // 2. タイトル画面のスケール
            const titleContent = document.querySelector('.title-content');
            if (titleContent) titleContent.style.transform = `translate(-50%, -50%) scale(${scale})`;

            // 3. モード選択画面のスケール
            const modeContainer = document.getElementById('mode-select-container');
            if (modeContainer) modeContainer.style.transform = `translate(-50%, -50%) scale(${scale})`;
        }
        window.addEventListener('resize', resizeGame);
        window.addEventListener('DOMContentLoaded', resizeGame);

        // ==========================================
        // ★ 進行スピード制御
        // ==========================================
        let speedMult = 1.0;
        function changeSpeed(val) {
            speedMult = parseFloat(val);
            // 🌟 修正：古いスピードラベルが削除されていてもエラーで止まらないようにする
            const oldLabel = document.getElementById('speed-label');
            if (oldLabel) {
                oldLabel.innerText = `x${speedMult.toFixed(1)}`;
            }
            saveSettings();
        }

        // スライダーの倍率で待機時間を割る（x2.0なら時間は半分になる）
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

        let hideCpuTiles = [0, 0, 0, 0];

        let pendingIsJokerSwap = false, pendingIsRinshan = false, pendingIsMiaoshou = false;
        let myAllHands = [], myAllMelds = [], myAllWinTiles = [], cpuTargets = [], cpuPersonalities = [];

        // ★ オートプレイ用フラグ
        let isAutoPlay = false;

        // ★ タイマー用変数群
        let timerInterval = null;
        let timeLeft = 0;
        let maxTimeForTimer = 0;
        let timerAction = null;
        let currentTickAudio = null;

        // 🌟 新追加：ペナルティで減少する制限時間（初期値）
        let timeDiscard = 60;  // 通常の打牌時間
        let timeCall = 20;     // 鳴きの判断時間
        let timeExchange = 30; // チャールストン交換時間

        const SM = { "1m": 1, "9m": 2, "1p": 11, "2p": 12, "3p": 13, "4p": 14, "5p": 15, "6p": 16, "7p": 17, "8p": 18, "9p": 19, "1s": 21, "2s": 22, "3s": 23, "4s": 24, "5s": 25, "6s": 26, "7s": 27, "8s": 28, "9s": 29, "東": 41, "南": 42, "西": 43, "北": 44, "白": 45, "發": 46, "中": 47, "春": 51, "夏": 52, "秋": 53, "冬": 54 };

        // ==========================================
        // ★ タイマー制御関数
        // ==========================================
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

                    // 🌟 修正：時間切れ時に登録された関数（スルーなど）を確実に実行
                    if (typeof finalAction === 'function') {
                        finalAction();
                    }
                }
            }, 1000); // ※タイマーの刻みは現実の1秒を維持
        }

        function stopTimer() {
            if (timerInterval) clearInterval(timerInterval);
            timerInterval = null;
            timerAction = null; // 🌟 修正4：ボタンを押した瞬間に「時間切れアクション」自体を空っぽにして爆破する
            document.getElementById('timer-display').style.display = "none";

            if (currentTickAudio) {
                currentTickAudio.pause();        // 再生を一時停止
                currentTickAudio.currentTime = 0; // 音声の再生位置を最初に戻す
                currentTickAudio = null;         // 記憶をリセット
            }
        }


        // ★ オートプレイ切り替え関数
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

        function logMsg(msg, isError = false) {
            if (isError) console.error(msg);
            else console.log(msg);

            const logDiv = document.getElementById('debug-log');
            if (logDiv) {
                // 🌟 修正：開発者モードがONの時だけ、画面上の黒いログ箱を表示する
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
                    flash.style.animationDuration = `${1.5 / speedMult}s`; // 🌟 追加
                    flash.classList.add('flash-animate');
                }
                const bigText = document.getElementById('big-yaku-text');
                if (bigText) {
                    bigText.innerText = text;
                    bigText.classList.remove('big-yaku-active');
                    void bigText.offsetWidth;
                    bigText.style.animationDuration = `${3.5 / speedMult}s`; // 🌟 追加：超巨大文字も倍速で引っ込む
                    bigText.classList.add('big-yaku-active');
                }
                el.innerText = "";
                return;
            }

            if (text.includes("Swap")) {
                el.classList.add('joker-swap-style');
                el.classList.add('call-active');
                el.style.animationDuration = `${1.0 / speedMult}s`; // 🌟 追加
                playSE(`jokerswap_${playerIdx}`);
                playSE(`jokerswap_se`);
            }
            else if (["妙手回春", "槍槓", "花天月地", "槓上開花"].includes(text)) {
                el.classList.add('special-yaku');
                el.style.animationDuration = `${1.5 / speedMult}s`; // 🌟 追加
                playSE('yaku');
            }
            else {
                el.classList.add('call-active');
                el.style.animationDuration = `${1.0 / speedMult}s`; // 🌟 追加
                if (text === "胡") playSE(`ron_${playerIdx}`);
                else if (text === "自摸") playSE(`zimo_${playerIdx}`);
                else if (text.includes("ポン") || text.includes("碰")) playSE(`pon_${playerIdx}`);
                else if (text.includes("カン") || text.includes("槓")) playSE(`kan_${playerIdx}`);
            }
        }

        // ==========================================
        // ★ アニメーション・演出用関数群
        // ==========================================
        function showCenterMessage(html) {
            const el = document.getElementById('center-message');
            if (!el) return;
            el.innerHTML = html;
            el.style.display = "block";
        }

        function hideCenterMessage() {
            const el = document.getElementById('center-message');
            if (el) el.style.display = "none";
        }

        function showCharlestonStatus(idx, isParticipating) {
            const el = document.getElementById(`c-status-${idx}`);
            if (isParticipating) {
                el.innerHTML = `<img class="tile" src="images/ura.png"><img class="tile" src="images/ura.png"><img class="tile" src="images/ura.png">`;
            } else {
                el.innerHTML = `<div class="guo-stamp">過</div>`;
            }
        }

        function clearCharlestonStatus() {
            for (let i = 0; i < 4; i++) document.getElementById(`c-status-${i}`).innerHTML = "";
        }

        function getPlayerPos(idx) {
            const positions = [
                { left: '50%', top: '75%', transform: 'translate(-50%, -50%) scale(1)' },
                { left: '85%', top: '50%', transform: 'translate(-50%, -50%) rotate(-90deg) scale(0.8)' },
                { left: '50%', top: '25%', transform: 'translate(-50%, -50%) rotate(180deg) scale(0.8)' },
                { left: '15%', top: '50%', transform: 'translate(-50%, -50%) rotate(90deg) scale(0.8)' }
            ];
            return positions[idx];
        }

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

        async function apiCall(endpoint, params = {}) {
            try {
                let url = `http://127.0.0.1:8080${endpoint}`;

                // キャッシュ破壊用のパラメータを追加
                params._t = new Date().getTime();

                if (Object.keys(params).length > 0) {
                    const query = new URLSearchParams(params).toString();
                    url += `?${query}`;
                }
                logMsg(`>>> 通信: ${url}`);

                // fetch に cache: 'no-store' を追加
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

        function updateInfoUI() {
            document.getElementById('round-info-center').innerText = `第 ${currentRound} 局`;

            for (let i = 0; i < 4; i++) {
                let nameEl = document.getElementById(`player-name-${i}`);
                let scoreEl = document.getElementById(`player-score-${i}`);

                // 🌟 レートと称号を取得して文字色を変える
                let title = getRatingTitle(playerRatings[i]);
                let titleColor = playerRatings[i] >= 2000 ? "#e74c3c" : (playerRatings[i] >= 1800 ? "#f1c40f" : "#3498db");
                let rateStr = `<span style="font-size:12px; color:#bdc3c7;">(R:${playerRatings[i]})</span>`;

                // 🌟 称号 → 名前とレート の順に改行して表示
                let name = i === 0 ? 
                    `<span style="color:${titleColor}; font-size:12px;">【${title}】</span><br>⚙️ あなた ${rateStr}` : 
                    `<span style="color:${titleColor}; font-size:12px;">【${title}】</span><br>CPU ${i} ${rateStr}`;

                let isDealer = (dealer === i) ? `<span class="dealer-mark">🀄親</span>` : "";

                let aiTarget = (i !== 0 && cpuTargets[i] && isDevMode) ? `<br><span style="color:#2ecc71; font-size:12px;">[${cpuPersonalities[i]}] ${cpuTargets[i]}</span>` : "";

                nameEl.innerHTML = `${isDealer}${name}${aiTarget}`;
                scoreEl.innerHTML = `持ち点: ${totalScores[i]}`;
            }
        }

        let currentNanikiru = null; // 🌟 新規追加

        async function updateWaitsButton() {
            const waitsBtn = document.getElementById('btn-show-waits');
            if (!waitsBtn) return;

            if (charlestonPhase) {
                waitsBtn.disabled = true;
                waitsBtn.innerText = "ノーテン";
                return;
            }

            try {
                // ここも 127.0.0.1 に変更し、キャッシュ破壊の記述を追加
                const res = await fetch(`http://127.0.0.1:8080/get_waits?player_idx=0&_t=${new Date().getTime()}`, { cache: 'no-store' });
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

        function showWaitsPanel() {
            const panel = document.getElementById('waits-panel');
            const list = document.getElementById('waits-list');

            // 🌟 修正1：トグル機能（開いていたら閉じる）
            if (panel.style.display === 'block') {
                hideWaitsPanel();
                return;
            }

            list.innerHTML = '';

            // 🌟 修正2：「何切る」モード（14枚の時）の表示処理
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

        function hideWaitsPanel() {
            document.getElementById('waits-panel').style.display = 'none';
        }

        async function loadDebugScenario(scenario) {
            if (!confirm("現在の局をリセットしてテストデータを読み込みますか？")) return;
            stopTimer(); // ★タイマー停止
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
            }

            render(); renderCPU();
            isProc = false;
            checkT();
        }

        async function init() {
            logMsg("=== ゲーム起動 ===");
            await apiCall('/start');
            charlestonCount = 1;
            startCharlestonSelection();
            render(); renderCPU();
        }

        function updateWall(c) { document.getElementById('wall-count').innerText = `山: ${c}`; }

        function startCharlestonSelection() {
            charlestonPhase = true;
            exchangeSelection = [];

            // ★ ここを追加：回数によってタイトルと色を出し分ける
            const cTitle = document.getElementById('c-title');
            if (charlestonCount === 1) {
                cTitle.innerText = "第1交換（換三張）";
                cTitle.style.color = "#3498db"; // 青
            } else {
                cTitle.innerText = "第2交換 (Second Charleston)";
                cTitle.style.color = "#f1c40f"; // 黄色
            }
            document.getElementById('msg').innerText = "";
            document.getElementById('charleston-ui').style.display = "block";
            document.getElementById('btn-exchange').style.display = "none";
            render();

            // ★ タイマー開始（30秒）
            startTimer(timeExchange, () => {
                let displayHand = [...myHand].sort((a, b) => SM[a] - SM[b]);
                // 左端から3枚を強制選択
                exchangeSelection = [0, 1, 2];
                execExchange();
            });
        }

        function toggleExchange(idx) {
            const pos = exchangeSelection.indexOf(idx);
            if (pos > -1) exchangeSelection.splice(pos, 1);
            else if (exchangeSelection.length < 3) exchangeSelection.push(idx);
            render();
            const btn = document.getElementById('btn-exchange');
            if (exchangeSelection.length === 3) btn.style.display = "block";
            else btn.style.display = "none";
        }

        async function execExchange() {
            stopTimer(); // ★タイマー停止
            if (exchangeSelection.length !== 3) {
                // タイムアウト等で強制実行された場合の保険
                exchangeSelection = [0, 1, 2];
            }

            isProc = true;
            document.getElementById('charleston-ui').style.display = "none";

            let displayHand = [...myHand].sort((a, b) => SM[a] - SM[b]);
            let t1 = displayHand[exchangeSelection[0]];
            let t2 = displayHand[exchangeSelection[1]];
            let t3 = displayHand[exchangeSelection[2]];

            if (charlestonCount === 1) {
                exchangeSelection.sort((a, b) => b - a).forEach(idx => displayHand.splice(idx, 1));
                myHand = displayHand;

                exchangeSelection = [];

                showCharlestonStatus(0, true);
                render();

                hideCpuTiles = [0, 3, 3, 3];
                for (let i = 1; i <= 3; i++) showCharlestonStatus(i, true);
                renderCPU();

                const data = await apiCall('/charleston', { player_idx: 0, t1: t1, t2: t2, t3: t3 });

                await showDiceAnimation(data.dice, data.direction);
                await playExchangeAnimation(data.direction, [true, true, true, true]);

                hideCpuTiles = [0, 0, 0, 0];
                clearCharlestonStatus();
                render(); renderCPU();

                askedCount = 0;
                charlestonAskResults = [];
                secondCharlestonParticipating = [false, false, false, false];

                isProc = false; // 🌟 ここを追加！ロックを解除してから次のフェーズへ
                askNextSecondCharleston();
            } else {
                execSecondCharleston(t1, t2, t3);
            }
        }

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

                // ★ タイマー開始（30秒）
                startTimer(timeExchange, () => {
                    confirmSecondCharleston(false); // タイムアウト時は不参加
                });
            } else {
                await sleep(500);
                let willDo = Math.random() < 0.7;
                processAskSecondCharleston(currentAsker, willDo);
            }
        }

        function confirmSecondCharleston(willDo) {
            stopTimer(); // ★タイマー停止
            document.getElementById('charleston-confirm-ui').style.display = "none";
            processAskSecondCharleston(0, willDo);
        }

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

        async function execSecondCharleston(t1 = "", t2 = "", t3 = "") {
            stopTimer(); // ★タイマー停止
            isProc = true;
            document.getElementById('charleston-ui').style.display = "none";

            if (secondCharlestonParticipating[0] && t1 !== "") {
                playerStats.secondCharlestonCount++;
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
                exchangeSelection = []; // 🌟 念のため、不参加だった場合もリセットしておく
            }

            const data = await apiCall('/second_charleston', {
                player_idx: 0, t1: t1, t2: t2, t3: t3,
                p0: secondCharlestonParticipating[0],
                p1: secondCharlestonParticipating[1],
                p2: secondCharlestonParticipating[2],
                p3: secondCharlestonParticipating[3]
            });

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
                    if (charlestonPhase && exchangeSelection.includes(idx)) i.classList.add('selected-exchange');

                    i.onclick = () => {
                        if (charlestonPhase) {
                            toggleExchange(idx);
                        } else if (!isProc && turn === 0) {
                            // 🌟 ここを追加！他家の鳴き判定待ちの時は打牌させない
                            if (document.getElementById('msg').innerText === "鳴き") return;

                            if (myWinTiles.length > 0) {
                                logMsg("アガリ後は手牌を入れ替えられません！右端のツモ牌を捨ててください。", true);
                            } else {
                                discard(t, false); // 手出し！
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
                            // 🌟 ツモ切りの方にも追加！
                            if (document.getElementById('msg').innerText === "鳴き") return;
                            discard(dTile, true);
                        }
                    };
                    c.appendChild(i);
                }

                renderMelds(0);
                renderWinTiles(0);

            } catch (e) {
                logMsg(`[描画エラー] ${e.message}`, true);
            }
        }

        function renderCPU() {
            for (let i = 1; i <= 3; i++) {
                const c = document.getElementById(`hand-${i}`); c.innerHTML = "";
                let cpuHand = myAllHands[i] || [];

                let limit = cpuHand.length - (hideCpuTiles[i] || 0);
                for (let j = 0; j < limit; j++) {
                    const t = cpuHand[j];
                    const img = document.createElement('img');
                    img.className = 'tile';

                    // 🌟 修正：開発者モードの時だけ表向き、通常は裏向き(ura.png)にする
                    img.src = isDevMode ? `images/${t}.png` : `images/ura.png`;

                    // 🌟 14枚目の牌（ツモ牌）は手牌全体がズレないように絶対位置(absolute)で配置
                    if (j === limit - 1 && limit % 3 === 2) {
                        img.style.position = 'absolute';
                        img.style.margin = '0'; // 重なり用のマイナスマージンを打ち消す

                        // 🌟 各プレイヤーから見て「右側」になるように配置
                        if (i === 1) { img.style.bottom = 'calc(100% + 10px)'; img.style.left = '0'; } // CPU1: 画面上側
                        if (i === 2) { img.style.right = 'calc(100% + 15px)'; img.style.top = '0'; }  // CPU2: 画面左側
                        if (i === 3) { img.style.top = 'calc(100% + 10px)'; img.style.left = '0'; }    // CPU3: 画面下側
                    }

                    c.appendChild(img);
                }

                renderMelds(i);
                renderWinTiles(i);
            }
        }

        function renderMelds(idx) {
            const m = document.getElementById(`meld-${idx}`); m.innerHTML = "";
            let melds = (idx === 0) ? myMelds : (myAllMelds[idx] || []);
            melds.forEach(meld => {
                if (!meld || !Array.isArray(meld.tiles)) return;
                const g = document.createElement('div'); g.className = 'meld-group';

                // 🌟 追加：伏せ状態の判定
                let isHidden = meld.is_hidden === true || meld.is_hidden === "true";

                meld.tiles.forEach((t, tileIdx) => {
                    const i = document.createElement('img'); i.className = 'tile';

                    // 🌟 条件分岐
                    if (idx !== 0 && isHidden && !isDevMode) {
                        // 1. 他家の暗槓で、伏せられていて、開発者モードでないなら全伏せ！
                        i.src = 'images/ura.png';
                    } else if (meld.type === 'ankan' && !isHidden) {
                        // 2. 通常の暗槓（伏せられていない）なら両端だけ裏
                        if (tileIdx === 0 || tileIdx === 3) i.src = 'images/ura.png';
                        else i.src = `images/${t}.png`;
                    } else {
                        // 3. 自分自身、または開発者モード、または明槓などは通常通り
                        i.src = `images/${t}.png`;
                    }
                    g.appendChild(i);
                });
                m.appendChild(g);
            });
        }

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

                // ★ここを追加！自分(0)と下家(1)は、新しい牌ほど奥(下)に潜り込むように設定
                if (idx === 0 || idx === 1) {
                    i.style.zIndex = 1000 + tIdx;
                }

                wz.appendChild(i);
            });
        }

        async function checkT() {
            isProc = true; // 🌟 追加：関数の最初で強制的にロックをかける！（これが最強の防御壁）

            // 🌟 修正：全員の名前の枠から光（active-turn）を消し、手番の人だけに付ける
            for (let i = 0; i < 4; i++) {
                const nameEl = document.getElementById(`player-name-${i}`);
                if (nameEl) nameEl.classList.remove('active-turn');
            }
            const activeNameEl = document.getElementById(`player-name-${turn}`);
            if (activeNameEl) activeNameEl.classList.add('active-turn');

            // （これ以下はそのまま）
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
                        // 🌟 checkWinPossible() が true を返すように後で書き換えます
                        canWin = await checkWinPossible();
                    }

                    const btnWin = document.getElementById('btn-win');
                    const selfActions = document.getElementById('self-actions');

                    // 🌟 修正：カンなどのアクションがない「完全な消化試合」なら音を鳴らさない
                    let shouldAlert = false;
                    if (btnWin.style.display === "block" || selfActions.innerHTML !== '') {
                        shouldAlert = true;
                        if (isAutoPlay && myWinTiles.length > 0 && selfActions.innerHTML === '') {
                            shouldAlert = false; // オートの消化試合なら無音！
                        }
                    }
                    if (shouldAlert) {
                        playSE('alert');
                    }

                    isProc = false; // ロック解除

                    let autoActed = false;
                    if (isAutoPlay && myWinTiles.length > 0) {
                        if (canWin && selfActions.innerHTML === '') {
                            isProc = true; // 待機中の誤操作を防ぐためにロック
                            setTimeout(() => execTsumo(), 800 / speedMult);
                            autoActed = true;
                        } else if (selfActions.innerHTML === '') {
                            // アクションがない時だけ自動ツモ切り
                            if (drawnTile !== "") {
                                isProc = true; // 🌟 ここを追加！ツモ切りの0.6秒間もロックして安全にする
                                setTimeout(() => discard(drawnTile, true), 600 / speedMult);
                                autoActed = true;
                            }
                        } else {
                            showCenterMessage(`<span style="color:#f39c12;font-size:24px;">アクション可能なため<br>オート進行を一時待機します</span>`);
                            setTimeout(hideCenterMessage, 2500);
                        }
                    }

                    // ★ 通常プレイ時 ＆ オートプレイ中でカン等の選択待ちになった場合はタイマー起動
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
                    // 🌟 13枚の時の処理（ここが重複していたので、この1箇所にまとめます）

                    // 🌟 海底牌（山が残り1枚）の時はオートでも停止！
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
                        return; // 処理をここで中断して自動drawを防ぐ
                    }

                    // 山が2枚以上なら、通常通りツモ処理へ
                    document.getElementById('msg').className = "";
                    document.getElementById('msg').innerText = "ツモ...";

                    setTimeout(() => {
                        isProc = false;
                        draw();
                    }, 500 / speedMult);
                }
            } else {
                // CPUのターンの処理...
                document.getElementById('msg').className = "";
                document.getElementById('msg').innerText = `CPU ${turn}...`;

                // 🌟 復活：CPUがツモる演出（裏向きのダミー牌を追加して絶対位置で配置）
                if (wallCount > 0) {
                    playSE('tsumo');
                    const c = document.getElementById(`hand-${turn}`);
                    const img = document.createElement('img');
                    img.className = 'tile';
                    img.src = 'images/ura.png';

                    img.style.position = 'absolute';
                    img.style.margin = '0';

                    // 各プレイヤーの右側に配置
                    if (turn === 1) { img.style.bottom = 'calc(100% + 10px)'; img.style.left = '0'; }
                    if (turn === 2) { img.style.right = 'calc(100% + 15px)'; img.style.top = '0'; }
                    if (turn === 3) { img.style.top = 'calc(100% + 10px)'; img.style.left = '0'; }

                    c.appendChild(img);

                    updateWall(wallCount - 1); // 山の数も先んじて減らす
                }

                setTimeout(cpu, 1000 / speedMult); // CPUの関数に繋ぐ
            }
        }

        function createBtn(html, cls, onClick, parent) {
            let b = document.createElement('button');
            b.className = `btn-act ${cls}`;

            // 🌟 文字列ではなくHTML（画像タグ）をそのままボタンの中に入れる
            b.innerHTML = html;

            // 🌟 画像と文字が綺麗に横に並ぶようにFlexboxを設定
            b.style.display = 'flex';
            b.style.alignItems = 'center';
            b.style.justifyContent = 'center';
            b.style.gap = '5px'; // 文字と画像の隙間

            b.onclick = onClick;
            parent.appendChild(b);
        }

        // ★ サブメニューで「戻る」を押した時用にデータを保持しておく変数
        let currentValidMelds = [];

        // ① 判定データの取得と分岐
        async function checkSelfMelds() {
            const actC = document.getElementById('self-actions'); actC.innerHTML = '';
            if (wallCount === 0) return;

            try {
                const data = await apiCall('/get_valid_self_melds', { player_idx: 0 });

                if (data.valid_melds) {
                    currentValidMelds = data.valid_melds;
                    renderSelfMeldsMenu(); // メインメニューの描画へ
                }
            } catch (e) {
                console.error("Self meld validation failed:", e);
            }
        }

        // ② メインメニュー（グループ化されたボタン）の描画
        function renderSelfMeldsMenu() {
            const actC = document.getElementById('self-actions'); actC.innerHTML = '';

            // 並び替えルール
            let melds = [...currentValidMelds];
            melds.sort((a, b) => {
                let diff = SM[a.tile] - SM[b.tile];
                if (diff !== 0) return diff;
                if (a.season && b.season) return SM[a.season] - SM[b.season];
                return 0;
            });

            // ★ 同種の牌とアクションごとにグループ化する
            let groups = {};
            melds.forEach(vm => {
                if (justPonged && (vm.type === "暗槓" || vm.type === "加槓")) return;

                let key = `${vm.type}_${vm.tile}`; // "暗花槓_1m" などのキーを作る
                if (!groups[key]) {
                    groups[key] = { type: vm.type, tile: vm.tile, seasons: [], original: vm };
                }
                if (vm.season) groups[key].seasons.push(vm.season);
            });

            const getImg = (tileName) => `<img src="images/${tileName}.png" style="height: 28px; border-radius: 2px; box-shadow: 1px 1px 3px rgba(0,0,0,0.5);">`;

            // グループごとにボタンを生成
            Object.values(groups).forEach(g => {
                if (g.type === "暗槓") {
                    // 🌟 修正：暗槓ボタンを押した際、サブメニュー(伏せる・伏せない)を表示
                    createBtn(`${g.type} ${getImg(g.tile)} <span style="font-size:14px;">(選択)</span>`, 'btn-purple', () => renderAnkanSubMenu(g.tile), actC);
                } else if (g.type === "加槓" || g.type === "JokerSwap") {
                    let btnClass = g.type.includes("槓") ? 'btn-purple' : 'btn-green';
                    let label = g.type === "JokerSwap" ? "Swap" : g.type;
                    createBtn(`${label} ${getImg(g.tile)}`, btnClass, () => {
                        if (g.type === "JokerSwap") execJokerSwap(g.tile, g.original.season, g.original.target_idx);
                        else execSelfMeld(g.type, g.tile, '');
                    }, actC);
                } else {
                    // 暗花槓・加花槓（昇格）の場合
                    let btnLabel = g.type === "暗花槓" ? "暗花槓" : "昇格";

                    if (g.seasons.length === 1) {
                        // 候補が1つしかないなら直接実行ボタン
                        createBtn(`${btnLabel} ${getImg(g.tile)}${getImg(g.seasons[0])}`, 'btn-green', () => execSelfMeld(g.type, g.tile, g.seasons[0]), actC);
                    } else {
                        // ★ 候補が複数ある場合は「選択ボタン」にしてサブメニューを展開！
                        createBtn(`${btnLabel} ${getImg(g.tile)} <span style="font-size:14px;">(選択)</span>`, 'btn-green', () => renderSelfMeldsSubMenu(g.type, g.tile, g.seasons), actC);
                    }
                }
            });
        }

        // ③ サブメニュー（複数の花牌から1つを選ぶ）の描画
        function renderSelfMeldsSubMenu(type, tile, seasons) {
            const actC = document.getElementById('self-actions'); actC.innerHTML = '';
            const getImg = (tileName) => `<img src="images/${tileName}.png" style="height: 28px; border-radius: 2px; box-shadow: 1px 1px 3px rgba(0,0,0,0.5);">`;

            // 戻るボタン
            createBtn(`◀ 戻る`, 'btn-gray', () => renderSelfMeldsMenu(), actC);

            // 選べる季節の数だけボタンを並べる
            seasons.forEach(s => {
                let btnLabel = type === "暗花槓" ? "暗花槓" : "昇格";
                createBtn(`${btnLabel} ${getImg(tile)}${getImg(s)}`, 'btn-green', () => execSelfMeld(type, tile, s), actC);
            });
        }

        function renderAnkanSubMenu(tile) {
            const actC = document.getElementById('self-actions'); actC.innerHTML = '';
            const getImg = (tileName) => `<img src="images/${tileName}.png" style="height: 28px; border-radius: 2px; box-shadow: 1px 1px 3px rgba(0,0,0,0.5);">`;

            createBtn(`◀ 戻る`, 'btn-gray', () => renderSelfMeldsMenu(), actC);

            // 🌟 オプション1：完全に伏せる (is_hidden=true)
            createBtn(`完全に伏せる ${getImg('ura')}${getImg('ura')}${getImg('ura')}${getImg('ura')}`, 'btn-purple', () => execSelfMeld('暗槓', tile, '', true), actC);

            // 🌟 オプション2：通常の暗槓 (is_hidden=false)
            createBtn(`通常通り ${getImg('ura')}${getImg(tile)}${getImg(tile)}${getImg('ura')}`, 'btn-blue', () => execSelfMeld('暗槓', tile, '', false), actC);
        }

        async function checkWinPossible() {
            const isHaitei = (wallCount === 0);
            const wd = await apiCall('/check_win', { player_idx: 0, is_ron: "false", is_rinshan: pendingIsRinshan, is_haitei: isHaitei, is_chankan: "false" });
            if (wd.can_win) {
                const btn = document.getElementById('btn-win');
                btn.onclick = () => execTsumo();

                // 🌟 オート中ならボタン自体を隠したままにする
                if (isAutoPlay && myWinTiles.length > 0 && document.getElementById('self-actions').innerHTML === '') {
                    btn.style.display = "none";
                } else {
                    btn.style.display = "block";
                }
                return true; // 🌟 追加：アガれるかどうかを checkT に教える
            }
            return false; // 🌟 追加
        }

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

        function removeLastDiscard() {
            if (lastDiscardPlayer !== -1) {
                const r = document.getElementById(`river-${lastDiscardPlayer}`);
                if (r && r.lastChild) r.removeChild(r.lastChild);
                lastDiscardPlayer = -1;
            }
        }

        async function discard(t, isTsumogiri = false) { // ★ 引数を追加
            stopTimer();
            if (isProc && !(isAutoPlay && myWinTiles.length > 0)) return;

            isProc = true;

            await apiCall('/discard', { player_idx: 0, tile: t });
            drawnTile = ""; lastDiscardPlayer = 0; justPonged = false;

            addR(0, t, isTsumogiri); // ★ そのまま渡す
            render(); renderCPU();
            await sleep(500);
            checkCpuReactions(0, t);
        }

        async function cpu() {
            try {
                let currentCpuTurn = turn;
                let prevMeldCount = myAllMelds[currentCpuTurn] ? myAllMelds[currentCpuTurn].length : 0;

                // 🌟 APIを呼ぶ前の手牌を保存しておく
                let oldHand = [...(myAllHands[currentCpuTurn] || [])];

                const data = await apiCall('/cpu_turn', { cpu_idx: currentCpuTurn });

                if (data.tsumo) {
                    showCallout(currentCpuTurn, "自摸");
                    await sleep(1500);

                    // 🌟 修正：Pythonから受け取った yaku を使って、天胡・地胡などの演出を出す！
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

                // 🌟 【修正3】新しくカンした時だけでなく、既存のポンを加槓(アップグレード)した時もアニメーションを出す
                let newMeldCount = myAllMelds[currentCpuTurn] ? myAllMelds[currentCpuTurn].length : 0;
                if (newMeldCount > prevMeldCount || data.did_kakan) {

                    // 🌟 修正：槍槓の受付中は「まだカンが成立していない」ため、山の表示を一時的に +1 して元に戻す
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
                                await execRon(true); // 槍槓としてアガリ実行！
                            };

                            btnSkip.onclick = async () => {
                                stopTimer();
                                isProc = true;
                                btnWin.style.display = "none";
                                btnSkip.style.display = "none";

                                // 🌟 スルーした場合はカンが成立するので、山の数を -1 して減らす
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
                            // 🌟 槍槓できない場合はスルーと同じくカン成立とするため、山の数を -1 して減らす
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

                // 🌟 ここからツモ切り判定の逆算ロジック
                let newHand = [...(myAllHands[currentCpuTurn] || [])];
                let combined = [...newHand, lastT]; // 今の手牌と捨てた牌を合体

                // 元々持っていた手牌を引き算していくと、最後に「引いた牌」が残る
                oldHand.forEach(t => {
                    let idx = combined.indexOf(t);
                    if (idx !== -1) combined.splice(idx, 1);
                });
                let drawnTileByCpu = combined[0];

                // 捨てた牌と引いた牌が同じならツモ切り！
                let isTsumogiri = (lastT === drawnTileByCpu);

                // 判定結果を渡す
                addR(currentCpuTurn, lastT, isTsumogiri);

                renderCPU();
                await sleep(500);
                await checkHumanReaction(currentCpuTurn, lastT);
            } catch (e) { if (e.message === "流局") handleRoundEnd(); }
        }

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
                    // 🌟 修正：時間切れになったら自動で「スルーボタン」をクリックする
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

        async function checkCpuReactions(discarderIdx, tile, isKakan = false) {
            try {
                isProc = true; // 🌟 処理開始時にロック
                const data = await apiCall('/check_cpu_reaction', { discarder_idx: discarderIdx, tile: tile, is_kakan: isKakan });

                // ❌ 以前ここにあった isProc = false; (早期ロック解除) を削除！

                if (data.reacted) {
                    if (data.type === "ron") {
                        showCallout(data.player, "胡");
                        await sleep(1500);

                        // 🌟 修正：こちらも yaku を使って、地胡などの演出を出す！
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

                        checkT(); // 🌟 isProc=false はせず、checkTにそのまま繋ぐ
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

                        await checkHumanReaction(data.player, lastT); // この中でロック解除される
                        return;
                    }
                }
                checkT(); // 🌟 そのまま繋ぐ
            } catch (e) {
                if (e.message === "流局") { handleRoundEnd(); return; }
                logMsg(`[Reaction Error] ${e.message}`, true);
                checkT();
            }
        }

        async function execTsumo() {
            stopTimer();
            if (isProc && !(isAutoPlay && myWinTiles.length > 0)) return;

            isProc = true;
            document.querySelectorAll('.action-layer .btn-act').forEach(b => b.style.display = "none");

            let currentDrawnTile = drawnTile;

            // 🌟 修正：戻り値を変数 data で受け取る
            const data = await apiCall('/win_tsumo', { player_idx: 0, is_joker_swap: pendingIsJokerSwap, is_rinshan: pendingIsRinshan });

            drawnTile = ""; render(); renderCPU();

            showCallout(0, "自摸");
            await sleep(1500);

            // 🌟 修正：Pythonから送られた役リストを使って演出を出す
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

        async function execRon(isChankan = false) {
            stopTimer();
            if (isProc && !(isAutoPlay && myWinTiles.length > 0)) return;

            isProc = true;
            document.querySelectorAll('.action-layer .btn-act').forEach(b => b.style.display = "none");
            if (!isChankan) removeLastDiscard();

            // 🌟 修正：戻り値を変数 data で受け取る
            const data = await apiCall('/win_ron', { player_idx: 0, tile: lastT, is_chankan: isChankan });
            render(); renderCPU();

            showCallout(0, "胡");
            await sleep(1500);

            // 🌟 修正：Pythonから送られた役リストを使って演出を出す
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

        async function execMeld(type) {
            stopTimer(); // ★タイマー停止
            if (isProc) return; isProc = true;
            document.querySelectorAll('.action-layer .btn-act').forEach(b => b.style.display = "none");
            removeLastDiscard();
            await apiCall('/meld', { player_idx: 0, type: type, tile: lastT });
            render(); renderCPU();

            let callText = (type.includes("槓") || type.includes("カン")) ? "槓" : "碰";
            showCallout(0, callText);
            await sleep(1500);

            if (type === 'カン' || type === '花槓') {
                if (type === '花槓') {
                    playerStats.hanakanCount++;
                    saveGameData();
                }
                pendingIsRinshan = true; justPonged = false;
            } else {
                justPonged = true;
            }

            isProc = false; checkT();
        }

        async function execSelfMeld(type, t, s, isHidden = false) {
            stopTimer();
            if (isProc) return; isProc = true; document.getElementById('self-actions').innerHTML = '';

            if (type.includes("花槓")) {
                playerStats.hanakanCount++;
                saveGameData();
            }

            // 🌟 APIに is_hidden を渡す
            const data = await apiCall('/self_meld', { player_idx: 0, type: type, tile: t, season: s, is_hidden: isHidden });
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

                // 3. 最後にアガリ処理を呼んで、牌が相手のゾーンへ移動するようにする
                if (data.winner === 0) {
                    await execRon(true); // 自分が槍槓した場合
                } else {
                    // CPUが槍槓した場合（サーバー側でwin_ron相当の処理を完遂させる）
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

        async function execJokerSwap(t, season, targetIdx) {
            stopTimer(); // ★タイマー停止
            if (isProc) return; isProc = true; document.getElementById('self-actions').innerHTML = '';
            await apiCall('/joker_swap', { player_idx: 0, tile: t, season: season, target_idx: targetIdx });
            render(); renderCPU();

            showCallout(0, "JokerSwap");
            await sleep(1500);

            playerStats.jokerSwapCount++;
            saveGameData();

            pendingIsJokerSwap = true;
            pendingIsMiaoshou = (season === "春");
            justPonged = false;

            isProc = false; checkT();
        }

        function skipAction() {
            stopTimer(); // ★タイマー停止
            if (isProc) return; isProc = true;
            document.querySelectorAll('.action-layer .btn-act').forEach(b => b.style.display = "none");
            checkCpuReactions(lastDiscardPlayer, lastT);
        }

        async function handleRoundEnd() {
            stopTimer(); // ★タイマー停止
            
            // 🌟 追加：局が終わるたびにプレイ局数を加算
            playerStats.totalRoundsPlayed++;
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

            // 🌟🌟🌟 「1点の重み」実績判定 🌟🌟🌟
            // この局の自分のスコアが「ピッタリ1点」で、かつ「順位点（3着以上）」を獲得できた場合
            if (calcData.scores[0] === 1 && calcData.ranking_points[0] > 0) {
                playerStats.clutch1PointCount++;
                saveGameData();
                console.log("🏆 実績解除：1点の重み（1点をもぎ取って順位を上げた！）");
            }

            for (let res of calcData.results) {
                if (res.player === 0) {
                    if (res.total_score > playerStats.maxScore) {
                        playerStats.maxScore = res.total_score; // 最高打点更新
                        
                        playerStats.maxScoreHand = {
                            tiles: [...myHand],
                            melds: JSON.parse(JSON.stringify(myMelds)),
                            winTile: res.details.length > 0 ? res.details[0].tile : ""
                        };
                    }
                    for (let detail of res.details) {
                        for (let y of detail.yaku) {
                            if (!playerStats.yakuCollected.includes(y)) {
                                playerStats.yakuCollected.push(y); // 新しい役を図鑑に登録
                            }
                        }
                    }
                    saveGameData();
                }

                // 🌟 1. 同じ和了牌での点数を「×枚数」でまとめる処理
                let groupedDetails = {};
                for (let detail of res.details) {
                    // 🌟 修正：牌の名前だけでなく「役の構成」もキーに含める！
                    // これで、同じ5sでも「天胡の5s」と「通常の5s」が別々の行として正しく表示されます。
                    let yakuKey = [...detail.yaku].sort().join(",");
                    let groupKey = `${detail.tile}_${yakuKey}`;

                    if (!groupedDetails[groupKey]) {
                        groupedDetails[groupKey] = {
                            tile: detail.tile, // 後でソートしやすいように牌の名前も持たせておく
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

                // 🌟 追加：まとめたデータを配列に変換して並び替える
                let sortedDetails = Object.values(groupedDetails);
                sortedDetails.sort((a, b) => {
                    // 第1条件：合計点数が高い順（降順）
                    if (b.total_score !== a.total_score) {
                        return b.total_score - a.total_score;
                    }
                    // 第2条件：同点の場合は牌の種類順（萬子→筒子→索子→字牌→四季牌）
                    return SM[a.tile] - SM[b.tile];
                });

                let yakuHtml = "";
                // 🌟 修正：for...in ではなく、ソート済みの配列(sortedDetails)をループで回す
                for (let d of sortedDetails) {
                    let tile = d.tile; // ここで牌の名前を取り出す

                    // 🌟 追加：役を点数（ランク）の高い順に並び替える
                    const tierOrder = {
                        "yaku-tier-64": 1, // 64点（最高）
                        "yaku-tier-32": 2, // 32点
                        "yaku-tier-16": 3, // 16点
                        "yaku-tier-8": 4,  // 8点
                        "yaku-tier-6": 5,  // 6点
                        "yaku-tier-4": 6,  // 4点
                        "yaku-tier-2": 7,  // 2点
                        "yaku-tier-1": 8,  // 1点（最低）
                        "yaku-tier-multi": 9 // 乗算役（一番最後）
                    };
                    d.yaku.sort((a, b) => {
                        let tierA = getYakuTierClass(a);
                        let tierB = getYakuTierClass(b);
                        
                        // 万が一、tierOrderにない謎の役が来たら一番最後にする安全対策
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

                // 🌟 2. 最終的な「閉じた手牌」と「副露（鳴き）」を描画するHTMLを組み立てる
                let closedHand = (res.player === 0) ? myHand : (myAllHands[res.player] || []);
                let melds = (res.player === 0) ? myMelds : (myAllMelds[res.player] || []);
                let sortedHand = [...closedHand].sort((a, b) => SM[a] - SM[b]);

                let handHtml = `<div style="display: flex; gap: 4px; align-items: center; justify-content: center; background: rgba(255,255,255,0.15); padding: 15px 25px; border-radius: 10px; margin-bottom: 20px; box-shadow: inset 0 0 10px rgba(0,0,0,0.5);">`;

                // 🌟 変更点1：閉じた手牌をひとつの塊にする
                handHtml += `<div style="display: flex; gap: 2px;">`;
                for (let t of sortedHand) {
                    handHtml += `<img src="images/${t}.png" style="width: 36px; height: 50px; border-radius: 3px; box-shadow: 2px 2px 5px rgba(0,0,0,0.5);">`;
                }
                handHtml += `</div>`;

                // 🌟 変更点2：副露（鳴き牌）があれば、黄金に光る「区切り線」を入れる
                if (melds.length > 0) {
                    handHtml += `<div style="width: 4px; height: 50px; background: #f1c40f; margin: 0 15px; border-radius: 2px; box-shadow: 0 0 8px #f39c12;"></div>`;

                    for (let m of melds) {
                        // 🌟 変更点3：鳴き牌の背景を少し濃くして、枠線をつけて「晒してる感」を出す
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

                // 🌟 3. 組み立てたUIを画面に反映
                document.getElementById('win-label-text').innerText = res.player === 0 ? "あなたの和了！" : `CPU ${res.player} の和了！`;
                document.getElementById('win-score').innerText = `${res.total_score} 点`;
                document.getElementById('win-hand-display').innerHTML = handHtml;
                document.getElementById('win-yaku').innerHTML = yakuHtml;

                // 🌟 修正：スクロール位置を一番上にリセットしておく
                document.getElementById('overlay').scrollTop = 0;
                document.getElementById('overlay').style.display = "flex";

                playSE('score');

                // ❌ 削除：await sleep(6000);
                // 🌟 追加：タイマー＆スキップ機能で待機（じっくり見れるよう8秒に設定）
                await waitWithTimerAndSkip(8);

                document.getElementById('overlay').style.display = "none";
                await sleep(500);
            }

            scores = calcData.scores;
            let rankingPoints = calcData.ranking_points || [0, 0, 0, 0];

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

            await sleep(3500);

            for (let i = 0; i < 4; i++) {
                document.getElementById(`player-round-score-${i}`).className = "player-round-score";
            }

            if (currentRound >= 4) {
                await apiCall('/next_round');
                
                let sortedIndices = [0, 1, 2, 3].sort((a, b) => totalScores[b] - totalScores[a]);
                let avgScore = totalScores.reduce((a, b) => a + b, 0) / 4;
                let myRank = sortedIndices.indexOf(0) + 1;

                // 🌟 実績や履歴の更新（これはCPU戦でも記録してOK）
                if (myRank === 1) {
                    playerStats.currentWinStreak++;
                    if (playerStats.currentWinStreak > playerStats.maxWinStreak) playerStats.maxWinStreak = playerStats.currentWinStreak;
                } else {
                    playerStats.currentWinStreak = 0;
                }
                playerStats.recentRecords.unshift(myRank);
                if (playerStats.recentRecords.length > 10) playerStats.recentRecords.pop();
                
                // 🌟🌟🌟 レート計算のガード 🌟🌟🌟
                let rateChanges = [0, 0, 0, 0];
                if (currentGameMode === 'online') {
                    let placementPoints = [15, 5, -5, -15];
                    for (let rank = 0; rank < 4; rank++) {
                        let pIdx = sortedIndices[rank];
                        let scoreBonus = Math.floor((totalScores[pIdx] - avgScore) / 100);
                        let change = placementPoints[rank] + scoreBonus;
                        rateChanges[pIdx] = change;
                        playerRatings[pIdx] += change;
                        if (playerRatings[pIdx] < 0) playerRatings[pIdx] = 0; 
                    }
                }
                // 🌟🌟🌟 ここまで 🌟🌟🌟

                saveGameData(); // 実績と（オンラインなら）レートを保存

                // 結果表示メッセージの組み立て
                let resultMsg = "【ゲーム終了！最終結果】\n\n";
                for (let rank = 0; rank < 4; rank++) {
                    let pIdx = sortedIndices[rank];
                    let name = pIdx === 0 ? playerStats.playerName : `CPU ${pIdx}`;
                    resultMsg += `${rank + 1}位: ${name} (${totalScores[pIdx]}点)\n`;
                    
                    // 🌟 オンラインの時だけレート変動を表示
                    if (currentGameMode === 'online') {
                        let sign = rateChanges[pIdx] >= 0 ? "+" : "";
                        resultMsg += ` ┗ レート: ${playerRatings[pIdx]} (${sign}${rateChanges[pIdx]})\n`;
                    }
                }

                alert(resultMsg);
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
            isProc = false; // 🌟 ここを追加！ロックを解除してから次の局へ
            startCharlestonSelection();
            renderCPU();
        }

        function addR(idx, t, isTsumogiri = false) {
            playSE('dahai');
            const r = document.getElementById(`river-${idx}`);
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
function showModeSelect() {
    // 派手な効果音を鳴らす
    playSE('start'); 
    
    // BGMの再生
    if (!audioState.initialized) {
        audioState.initialized = true;
        if (audioState.bgmOn) {
            sounds.bgm.play().catch(e => console.log("BGM自動再生ブロック:", e));
        }
    }

    document.getElementById('title-screen').style.display = 'none';
    document.getElementById('mode-select-screen').style.display = 'flex';
}

function backToTitle() {
    playSE('click');
    document.getElementById('mode-select-screen').style.display = 'none';
    document.getElementById('title-screen').style.display = 'flex';
}

function startCpuGame() {
    playSE('click');
    currentGameMode = 'cpu';
    const modeScreen = document.getElementById('mode-select-screen');
    
    // ボタンを押せないようにして、画面をフワッと消す
    modeScreen.style.opacity = '0'; 
    modeScreen.style.transition = 'opacity 1s';

    setTimeout(() => {
        modeScreen.style.display = 'none'; 
        modeScreen.style.opacity = '1'; // 元に戻しておく
        init(); // ゲーム初期化開始！
    }, 1000);
}

// ==========================================
// ★ 実績（アチーブメント）画面の描画
// ==========================================
function openAchievements() {
    playSE('click');
    renderAchievements(); // データをもとに描画
    document.getElementById('achievement-modal').style.display = 'flex';
}

function closeAchievements() {
    playSE('click');
    document.getElementById('achievement-modal').style.display = 'none';
}

function renderAchievements() {
    const container = document.getElementById('achieve-container');
    container.innerHTML = '';

    // 実績の定義（目標値：銅, 銀, 金）
    const achievements = [
        { id: "score", icon: "💰", title: "最高到達打点", desc: "1局での最高獲得点数", val: playerStats.maxScore, tiers: [100, 500, 1000], unit: "点" },
        { id: "streak", icon: "🔥", title: "連勝記録", desc: "総合1位を連続で獲得した回数", val: playerStats.maxWinStreak, tiers: [2, 5, 10], unit: "連勝" },
        { id: "rounds", icon: "⏳", title: "継続は力なり", desc: "対局を完了した累計局数", val: playerStats.totalRoundsPlayed, tiers: [10, 100, 500], unit: "局" },
        { id: "charleston", icon: "🔄", title: "チャールストンの愛し子", desc: "第2交換に参加した回数", val: playerStats.secondCharlestonCount, tiers: [10, 50, 100], unit: "回" },
        { id: "hanakan", icon: "🌸", title: "花槓マスター", desc: "四季牌を使って花槓を作った回数", val: playerStats.hanakanCount, tiers: [10, 50, 100], unit: "回" },
        { id: "jokerswap", icon: "🃏", title: "スワップの支配者", desc: "JokerSwapを成功させた回数", val: playerStats.jokerSwapCount, tiers: [1, 10, 50], unit: "回" },
        { id: "clutch", icon: "👑", title: "1点の重み", desc: "1点でアガり3着以上をもぎ取った回数", val: playerStats.clutch1PointCount, tiers: [1, 5, 10], unit: "回" }
    ];

    let gridHtml = `<div class="achieve-grid">`;

    achievements.forEach(a => {
        let rank = 0; // 0:未, 1:銅, 2:銀, 3:金
        if (a.val >= a.tiers[2]) rank = 3;
        else if (a.val >= a.tiers[1]) rank = 2;
        else if (a.val >= a.tiers[0]) rank = 1;

        let medalClass = ["medal-none", "medal-bronze", "medal-silver", "medal-gold"][rank];
        let statusText = rank === 0 ? "未達成" : ["", "ブロンズ", "シルバー", "ゴールド"][rank] + " 獲得！";
        let statusColor = rank === 0 ? "#7f8c8d" : ["", "#cd7f32", "#bdc3c7", "#f1c40f"][rank];

        // 次の目標値を計算
        let nextTarget = a.tiers[0];
        if (rank === 1) nextTarget = a.tiers[1];
        if (rank === 2) nextTarget = a.tiers[2];
        if (rank === 3) nextTarget = a.tiers[2]; // MAX

        let progressPercent = rank === 3 ? 100 : Math.min(100, (a.val / nextTarget) * 100);

        gridHtml += `
            <div class="achieve-card ${medalClass}">
                <div class="achieve-icon">${a.icon}</div>
                <div class="achieve-title">${a.title}</div>
                <div class="achieve-desc">${a.desc}</div>
                
                <div class="achieve-progress-bg">
                    <div class="achieve-progress-bar" style="width: ${progressPercent}%; background: ${statusColor};"></div>
                </div>
                
                <div style="width: 100%; display: flex; justify-content: space-between; font-size: 12px; color: #aaa; margin-bottom: 5px;">
                    <span>現在: ${a.val} ${a.unit}</span>
                    <span>次: ${nextTarget} ${a.unit}</span>
                </div>
                
                <div class="achieve-status" style="color: ${statusColor};">${statusText}</div>
            </div>
        `;
    });
    gridHtml += `</div>`;

    // 🌟 役コレクター図鑑の生成
    gridHtml += `<h3 style="color: #9b59b6; border-bottom: 1px solid #9b59b6; padding-bottom: 5px; margin-top: 30px;">📜 役コレクター図鑑</h3>`;
    gridHtml += `<p style="font-size: 12px; color: #aaa; text-align: center;">今まで和了したことのある役が記録されます。</p>`;
    gridHtml += `<div class="yaku-collection-grid">`;
    
    // 全ての役リスト (yakuJaMap のキーを利用)
    const allYakuList = Object.keys(yakuJaMap);
    let collectedCount = 0;

    allYakuList.forEach(yakuZh => {
        let isCollected = playerStats.yakuCollected.includes(yakuZh);
        let yakuJa = getJaYakuName(yakuZh);
        let badgeClass = isCollected ? "yaku-badge acquired" : "yaku-badge";
        let displayName = isCollected ? yakuJa : "？？？"; // 未取得は隠す
        
        if (isCollected) collectedCount++;
        gridHtml += `<div class="${badgeClass}">${displayName}</div>`;
    });

    gridHtml += `</div>`;
    gridHtml += `<div style="text-align: center; margin-top: 10px; font-weight: bold; color: #ecf0f1;">コンプリート率: ${collectedCount} / ${allYakuList.length}</div>`;

    container.innerHTML = gridHtml;
}

// ==========================================
// ★ マイページ・プロフィール制御
// ==========================================
function updateProfileUI() {
    document.getElementById('prof-name').innerText = playerStats.playerName;
    
    let rate = playerRatings[0];
    document.getElementById('prof-rank').innerText = `【${getRatingTitle(rate)}】 R:${rate}`;

    // 履歴アイコンの描画
    const historyContainer = document.getElementById('prof-history');
    historyContainer.innerHTML = '';
    playerStats.recentRecords.forEach(rank => {
        const div = document.createElement('div');
        div.className = `history-item rank-${rank}`;
        div.innerText = rank;
        historyContainer.appendChild(div);
    });

    // 最高打点と牌姿の描画
    document.getElementById('best-score-val').innerText = `${playerStats.maxScore} 点`;
    const handTiles = document.getElementById('best-hand-tiles');
    handTiles.innerHTML = '';
    
    if (playerStats.maxScoreHand) {
        const { tiles, melds, winTile } = playerStats.maxScoreHand;
        [...tiles].sort((a,b)=>SM[a]-SM[b]).forEach(t => {
            handTiles.innerHTML += `<img src="images/${t}.png" style="width:20px; height:28px;">`;
        });
        if (winTile) handTiles.innerHTML += `<div style="width:10px;"></div><img src="images/${winTile}.png" style="width:20px; height:28px; border:1px solid #f1c40f;">`;
    }
}

function openMyPage() {
    updateProfileUI();
    document.getElementById('input-player-name').value = playerStats.playerName;
    
    const statsContainer = document.getElementById('detailed-stats');
    let avgRank = playerStats.recentRecords.length > 0 ? (playerStats.recentRecords.reduce((a,b)=>a+b,0)/playerStats.recentRecords.length).toFixed(2) : "-";
    
    statsContainer.innerHTML = `
        <div class="stats-item"><small>累計局数</small><br><b style="font-size:18px; color:#3498db;">${playerStats.totalRoundsPlayed} 局</b></div>
        <div class="stats-item"><small>平均順位(直近)</small><br><b style="font-size:18px; color:#e67e22;">${avgRank} 位</b></div>
        <div class="stats-item"><small>最大連勝</small><br><b style="font-size:18px; color:#e74c3c;">${playerStats.maxWinStreak} 連勝</b></div>
        <div class="stats-item"><small>Joker Swap</small><br><b style="font-size:18px; color:#2ecc71;">${playerStats.jokerSwapCount} 回</b></div>
    `;
    
    document.getElementById('mypage-modal').style.display = 'flex';
    playSE('click');
}

function saveNewName() {
    const newName = document.getElementById('input-player-name').value.trim();
    if (newName) {
        playerStats.playerName = newName;
        saveGameData();
        updateProfileUI();
        alert("名前を変更しました！");
    }
}

function closeMyPage() {
    document.getElementById('mypage-modal').style.display = 'none';
    playSE('click');
}

function showModeSelect() {
    playSE('start');
    if (!audioState.initialized) {
        audioState.initialized = true;
        if (audioState.bgmOn) sounds.bgm.play().catch(e => console.log("BGM自動再生ブロック:", e));
    }
    updateProfileUI(); // 🌟 モード選択画面を開くときに最新のプロフィールを描画する
    document.getElementById('title-screen').style.display = 'none';
    document.getElementById('mode-select-screen').style.display = 'flex';
}

// ==========================================
// ★ デバッグ用：ダミーデータの注入
// ==========================================
function injectDummyData() {
    if (!confirm("現在のセーブデータを上書きして、テスト用の実績データを注入しますか？")) return;

    // 🌟 レートを「達人」クラスに
    playerRatings[0] = 1850; 
    
    playerStats.playerName = "四季の求道者";
    playerStats.totalRoundsPlayed = 342;
    playerStats.currentWinStreak = 4;
    playerStats.maxWinStreak = 12;
    playerStats.jokerSwapCount = 68;
    playerStats.secondCharlestonCount = 115;
    playerStats.hanakanCount = 204;
    playerStats.clutch1PointCount = 8;
    
    // 🌟 直近10戦の履歴（1位が多い優秀な成績）
    playerStats.recentRecords = [1, 2, 1, 1, 3, 2, 1, 4, 1, 2];

    // 🌟 最高打点：2048点（九連宝燈などの複合を想定）
    playerStats.maxScore = 2048;
    playerStats.maxScoreHand = {
        tiles: ["1s","1s","1s","2s","3s","4s","5s","6s","7s","8s","9s","9s","9s"],
        melds: [],
        winTile: "5s"
    };

    // 🌟 役コレクター（色々な役を適当に解放）
    playerStats.yakuCollected = [
        "天胡", "九連宝燈", "十八羅漢", "大三元", "清一色", "対々和", "七対", "混一色",
        "小三元", "無花果", "槓上開花", "妙手回春", "花天月地", "無番和", "断么", "刮風", "下雨"
    ];

    saveGameData();
    alert("ダミーデータを注入しました！\n画面をリロードして反映します。");
    location.reload();
}