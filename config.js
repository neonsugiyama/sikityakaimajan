// ==========================================
// ⚙️ ゲーム設定・ローカライズ管理システム (config.js)
// ==========================================

// --- 設定用のグローバル変数 ---
const SM = {
    "1p": 11, "2p": 12, "3p": 13, "4p": 14, "5p": 15, "6p": 16, "7p": 17, "8p": 18, "9p": 19,
    "1s": 21, "2s": 22, "3s": 23, "4s": 24, "5s": 25, "6s": 26, "7s": 27, "8s": 28, "9s": 29,
    "1m": 31, "9m": 39,
    "東": 41, "南": 42, "西": 43, "北": 44, "白": 45, "發": 46, "中": 47,
    "春": 51, "夏": 52, "秋": 53, "冬": 54
};

let timeDiscard = 60;
let timeCall = 20;
let timeExchange = 30;
let confCpuLevel = 1;       // 0:よわい, 1:ふつう, 2:つよい
let confTsumogiri = true;   // ツモ切り表示ON/OFF
let confWaitsHint = true;   // 待ち牌ヒントON/OFF
let confEffective = false;  // 有効牌表示ON/OFF
let confRightClick = true;  // 右クリック操作ON/OFF
let confDoubleClick = true; // ダブルクリック操作ON/OFF
let confShowStamps = true;  // 他家のスタンプ表示ON/OFF

let speedMult = 1.0;
let isStartingGame = false;
let currentLangMode = 0; // 0: オリジナル, 1: 日本役化, 2: 英語

// 開発者モード・隠しコマンド用
let isDevMode = false;
let isDebugUIHidden = false;
let secretClickCount = 0;
let secretClickTimer = null;

// ==========================================
// 💾 セーブ＆ロード機能
// ==========================================

// 💾 現在の設定をローカルストレージに保存する関数
function saveSettings() {
    const config = {
        speed: speedMult,
        masterVolume: globalMasterVolume,
        bgmVolume: globalBgmVolume,
        seVolume: globalSeVolume,
        voiceVolume: globalVoiceVolume,
        tableColor1: document.getElementById('table-color-1')?.value || "#1a5e3a",
        tableColor2: document.getElementById('table-color-2')?.value || "#0d3b22",
        devMode: isDevMode,
        langMode: currentLangMode,
        bgmOn: audioState.bgmOn,
        rightClick: confRightClick,
        doubleClick: confDoubleClick,
        waitsHint: confWaitsHint,
        tsumogiriDark: confTsumogiri,
        showStamps: confShowStamps,
        timeDiscard: timeDiscard,
        timeCall: timeCall,
        timeExchange: timeExchange,
        cpuLevel: confCpuLevel,
        systemUnlocked: document.getElementById('btn-tab-system') ? (document.getElementById('btn-tab-system').style.display === "block") : false
    };
    // 🛡️ 設定は小さいので失敗しにくいが、 念のため safe wrapper
    if (typeof window.safeLocalStorageSet === 'function') {
        window.safeLocalStorageSet('shiki_mahjong_settings', config);
    } else {
        try { localStorage.setItem('shiki_mahjong_settings', JSON.stringify(config)); } catch (e) { console.warn('[CONFIG] save失敗:', e); }
    }
}

// 📂 ブラウザから設定を読み込み、スライダーや画面状態に反映する関数
function loadSettings() {
    const saved = localStorage.getItem('shiki_mahjong_settings');
    if (!saved) return;
    const config = JSON.parse(saved);

    if (config.systemUnlocked) {
        const btnTabSystem = document.getElementById('btn-tab-system');
        if (btnTabSystem) btnTabSystem.style.display = "block";
    }

    changeSpeed(config.speed || 1.0);
    if (document.getElementById('settings-speed-slider')) document.getElementById('settings-speed-slider').value = config.speed || 1.0;
    if (document.getElementById('settings-speed-label')) document.getElementById('settings-speed-label').innerText = 'x' + parseFloat(config.speed || 1.0).toFixed(1);

    if (config.timeDiscard !== undefined) {
        timeDiscard = config.timeDiscard;
        if (document.getElementById('set-discard')) document.getElementById('set-discard').value = timeDiscard;
        if (document.getElementById('val-discard')) document.getElementById('val-discard').innerText = timeDiscard;
    }
    if (config.timeCall !== undefined) {
        timeCall = config.timeCall;
        if (document.getElementById('set-call')) document.getElementById('set-call').value = timeCall;
        if (document.getElementById('val-call')) document.getElementById('val-call').innerText = timeCall;
    }
    if (config.timeExchange !== undefined) {
        timeExchange = config.timeExchange;
        if (document.getElementById('set-exchange')) document.getElementById('set-exchange').value = timeExchange;
        if (document.getElementById('val-exchange')) document.getElementById('val-exchange').innerText = timeExchange;
    }
    if (config.cpuLevel !== undefined) {
        confCpuLevel = config.cpuLevel;
        if (document.getElementById('set-cpu')) document.getElementById('set-cpu').value = confCpuLevel;
    }

    if (config.masterVolume !== undefined) {
        updateMasterVolume(config.masterVolume);
        if (document.getElementById('settings-master-slider')) document.getElementById('settings-master-slider').value = config.masterVolume;
    }
    if (config.bgmVolume !== undefined) {
        updateBGMVolume(config.bgmVolume);
        if (document.getElementById('settings-bgm-slider')) document.getElementById('settings-bgm-slider').value = config.bgmVolume;
    }
    if (config.seVolume !== undefined) {
        updateSEVolume(config.seVolume);
        if (document.getElementById('settings-se-slider')) document.getElementById('settings-se-slider').value = config.seVolume;
    }
    if (config.voiceVolume !== undefined) {
        updateVoiceVolume(config.voiceVolume);
        if (document.getElementById('settings-voice-slider')) document.getElementById('settings-voice-slider').value = config.voiceVolume;
    } else if (config.seVolume !== undefined) {
        updateVoiceVolume(config.seVolume);
        if (document.getElementById('settings-voice-slider')) document.getElementById('settings-voice-slider').value = config.seVolume;
    }

    if (document.getElementById('table-color-1')) document.getElementById('table-color-1').value = config.tableColor1 || "#1a5e3a";
    if (document.getElementById('table-color-2')) document.getElementById('table-color-2').value = config.tableColor2 || "#0d3b22";
    updateTableGradient();

    if (config.devMode) {
        if (document.getElementById('dev-mode-container')) document.getElementById('dev-mode-container').style.display = "block";
        toggleDevMode(true);
    }
    if (config.langMode !== undefined) {
        currentLangMode = config.langMode;
        applyLangMode();
    }
    if (config.bgmOn !== undefined) {
        audioState.bgmOn = config.bgmOn;
        const btn = document.getElementById('btn-toggle-bgm');
        if (!audioState.bgmOn && btn) {
            btn.innerText = "🔇"; btn.title = "BGM切替: OFF";
            btn.style.color = "#e74c3c"; btn.style.borderColor = "rgba(231, 76, 60, 0.4)";
        } else if (btn) {
            btn.innerText = "🎵"; btn.title = "BGM切替: ON";
            btn.style.color = "rgba(255,255,255,0.5)";
            btn.style.borderColor = "rgba(255,255,255,0.25)";
        }
        if (typeof applyBGMVolume === 'function') applyBGMVolume();
    }

    if (config.rightClick !== undefined) {
        confRightClick = config.rightClick;
        if (document.getElementById('set-right-click')) document.getElementById('set-right-click').checked = confRightClick;
    }
    if (config.doubleClick !== undefined) {
        confDoubleClick = config.doubleClick;
        if (document.getElementById('set-double-click')) document.getElementById('set-double-click').checked = confDoubleClick;
    }
    if (config.waitsHint !== undefined) {
        confWaitsHint = config.waitsHint;
        if (document.getElementById('set-waits-hint')) document.getElementById('set-waits-hint').checked = confWaitsHint;
    }
    if (config.tsumogiriDark !== undefined) {
        confTsumogiri = config.tsumogiriDark;
        if (document.getElementById('set-tsumogiri-dark')) document.getElementById('set-tsumogiri-dark').checked = confTsumogiri;
    }
    if (config.showStamps !== undefined) {
        confShowStamps = config.showStamps;
        if (document.getElementById('set-show-stamps')) document.getElementById('set-show-stamps').checked = confShowStamps;
    }
}

// ページ読み込み時にセーブデータを復元
window.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem('shiki_mahjong_settings');
    if (saved) {
        loadSettings();
    } else {
        updateTableGradient();
    }
});

// ==========================================
// 🔄 設定の初期化機能
// ==========================================
function resetSettings() {
    changeSpeed(1.0);
    if (document.getElementById('settings-speed-slider')) document.getElementById('settings-speed-slider').value = 1.0;
    if (document.getElementById('settings-speed-label')) document.getElementById('settings-speed-label').innerText = 'x1.0';

    updateMasterVolume(1.0);
    if (document.getElementById('settings-master-slider')) document.getElementById('settings-master-slider').value = 1.0;

    updateBGMVolume(0.3);
    if (document.getElementById('settings-bgm-slider')) document.getElementById('settings-bgm-slider').value = 0.3;

    updateSEVolume(1.0);
    if (document.getElementById('settings-se-slider')) document.getElementById('settings-se-slider').value = 1.0;

    updateVoiceVolume(1.0);
    if (document.getElementById('settings-voice-slider')) document.getElementById('settings-voice-slider').value = 1.0;

    if (document.getElementById('table-color-1')) document.getElementById('table-color-1').value = "#1a5e3a";
    if (document.getElementById('table-color-2')) document.getElementById('table-color-2').value = "#0d3b22";
    updateTableGradient();

    toggleDevMode(false);
    if (document.getElementById('dev-mode-container')) document.getElementById('dev-mode-container').style.display = "none";

    confRightClick = true;
    if (document.getElementById('set-right-click')) document.getElementById('set-right-click').checked = true;

    confDoubleClick = true;
    if (document.getElementById('set-double-click')) document.getElementById('set-double-click').checked = true;

    confWaitsHint = true;
    if (document.getElementById('set-waits-hint')) document.getElementById('set-waits-hint').checked = true;

    confTsumogiri = true;
    if (document.getElementById('set-tsumogiri-dark')) document.getElementById('set-tsumogiri-dark').checked = true;

    confShowStamps = true;
    if (document.getElementById('set-show-stamps')) document.getElementById('set-show-stamps').checked = true;

    saveSettings();
    if (typeof playSE === 'function') playSE('click');
}

function resetControlSettings() {
    changeSpeed(1.0);
    if (document.getElementById('settings-speed-slider')) document.getElementById('settings-speed-slider').value = 1.0;
    if (document.getElementById('settings-speed-label')) document.getElementById('settings-speed-label').innerText = 'x1.0';

    confRightClick = true;
    if (document.getElementById('set-right-click')) document.getElementById('set-right-click').checked = true;

    confDoubleClick = true;
    if (document.getElementById('set-double-click')) document.getElementById('set-double-click').checked = true;

    confWaitsHint = true;
    if (document.getElementById('set-waits-hint')) document.getElementById('set-waits-hint').checked = true;
    if (typeof updateWaitsButton === 'function') updateWaitsButton();

    confTsumogiri = true;
    if (document.getElementById('set-tsumogiri-dark')) document.getElementById('set-tsumogiri-dark').checked = true;

    saveSettings();
    if (typeof playSE === 'function') playSE('click');
}

function resetAudioSettings() {
    updateMasterVolume(1.0);
    if (document.getElementById('settings-master-slider')) document.getElementById('settings-master-slider').value = 1.0;

    updateBGMVolume(0.3);
    if (document.getElementById('settings-bgm-slider')) document.getElementById('settings-bgm-slider').value = 0.3;

    updateSEVolume(1.0);
    if (document.getElementById('settings-se-slider')) document.getElementById('settings-se-slider').value = 1.0;

    updateVoiceVolume(1.0);
    if (document.getElementById('settings-voice-slider')) document.getElementById('settings-voice-slider').value = 1.0;

    saveSettings();
    if (typeof playSE === 'function') playSE('click');
}

function resetDisplaySettings() {
    if (document.getElementById('table-color-1')) document.getElementById('table-color-1').value = "#1a5e3a";
    if (document.getElementById('table-color-2')) document.getElementById('table-color-2').value = "#0d3b22";
    updateTableGradient();

    confShowStamps = true;
    if (document.getElementById('set-show-stamps')) document.getElementById('set-show-stamps').checked = true;

    saveSettings();
    if (typeof playSE === 'function') playSE('click');
}

function resetSystemSettings() {
    toggleDevMode(false);
    if (document.getElementById('dev-mode-container')) document.getElementById('dev-mode-container').style.display = "none";

    saveSettings();
    if (typeof playSE === 'function') playSE('click');
}

function resetMatchSettingsUI() {
    if (typeof playSE === 'function') playSE('click');

    const elCpu = document.getElementById('set-cpu');
    if (elCpu) elCpu.value = "1";

    const elDiscard = document.getElementById('set-discard');
    if (elDiscard) { elDiscard.value = 60; document.getElementById('val-discard').innerText = "60"; }

    const elCall = document.getElementById('set-call');
    if (elCall) { elCall.value = 20; document.getElementById('val-call').innerText = "20"; }

    const elExchange = document.getElementById('set-exchange');
    if (elExchange) { elExchange.value = 30; document.getElementById('val-exchange').innerText = "30"; }
}

// ==========================================
// ⚙️ 設定の適用と画面反映
// ==========================================
function changeSpeed(val) {
    speedMult = parseFloat(val);
    const oldLabel = document.getElementById('speed-label');
    if (oldLabel) {
        oldLabel.innerText = `x${speedMult.toFixed(1)}`;
    }
    saveSettings();
}

function updateTableGradient() {
    const c1 = document.getElementById('table-color-1');
    const c2 = document.getElementById('table-color-2');
    if (c1 && c2) {
        document.querySelector('.table').style.background = `radial-gradient(circle at center, ${c1.value} 0%, ${c2.value} 100%)`;
        saveSettings();
    }
}

function toggleDevMode(isChecked) {
    isDevMode = isChecked;
    const settingsDevMode = document.getElementById('settings-dev-mode');
    if (settingsDevMode) settingsDevMode.checked = isDevMode;

    const debugPanel = document.querySelector('.debug-panel');
    const debugLog = document.getElementById('debug-log');
    const achieveDebugPanel = document.getElementById('achieve-debug-panel');

    let toggleBtn = document.getElementById('btn-toggle-debug-ui');
    if (!toggleBtn) {
        toggleBtn = document.createElement('button');
        toggleBtn.id = 'btn-toggle-debug-ui';
        toggleBtn.innerHTML = '👁️ UI非表示';
        toggleBtn.style.position = 'absolute';
        toggleBtn.style.bottom = '15px';
        toggleBtn.style.right = '15px';
        toggleBtn.style.zIndex = '99999';
        toggleBtn.style.padding = '8px 12px';
        toggleBtn.style.background = 'rgba(44, 62, 80, 0.8)';
        toggleBtn.style.color = '#fff';
        toggleBtn.style.border = '2px solid #f1c40f';
        toggleBtn.style.borderRadius = '5px';
        toggleBtn.style.cursor = 'pointer';
        toggleBtn.style.fontWeight = 'bold';
        toggleBtn.style.transition = 'all 0.2s';

        toggleBtn.onmouseover = () => toggleBtn.style.background = 'rgba(44, 62, 80, 1)';
        toggleBtn.onmouseout = () => toggleBtn.style.background = 'rgba(44, 62, 80, 0.8)';

        toggleBtn.onclick = () => {
            if (typeof playSE === 'function') playSE('click');
            isDebugUIHidden = !isDebugUIHidden;

            if (isDebugUIHidden) {
                toggleBtn.innerHTML = '👁️ UI表示';
                toggleBtn.style.borderColor = '#e74c3c';
                if (debugPanel) debugPanel.style.display = 'none';
                if (debugLog) debugLog.style.display = 'none';
                if (achieveDebugPanel) achieveDebugPanel.style.display = 'none';
            } else {
                toggleBtn.innerHTML = '👁️ UI非表示';
                toggleBtn.style.borderColor = '#f1c40f';
                if (isDevMode) {
                    if (debugPanel) debugPanel.style.display = 'flex';
                    if (debugLog && debugLog.innerHTML !== '') debugLog.style.display = 'block';
                    if (achieveDebugPanel) achieveDebugPanel.style.display = 'flex';
                }
            }
        };
        document.body.appendChild(toggleBtn);
    }

    if (isDevMode) {
        toggleBtn.style.display = 'block';
        if (!isDebugUIHidden) {
            if (debugPanel) debugPanel.style.display = 'flex';
            if (achieveDebugPanel) achieveDebugPanel.style.display = 'flex';
            if (debugLog && debugLog.innerHTML !== '') debugLog.style.display = 'block';
        }
    } else {
        toggleBtn.style.display = 'none';
        isDebugUIHidden = false;
        toggleBtn.innerHTML = '👁️ UI非表示';
        toggleBtn.style.borderColor = '#f1c40f';

        if (debugPanel) debugPanel.style.display = 'none';
        if (achieveDebugPanel) achieveDebugPanel.style.display = 'none';
        if (debugLog) debugLog.style.display = 'none';
    }

    if (typeof updateInfoUI === 'function') updateInfoUI();
    if (typeof renderCPU === 'function') renderCPU();

    saveSettings();
}

async function applySettingsAndStart() {
    if (isStartingGame) return;
    isStartingGame = true;

    if (typeof playSE === 'function') playSE('start');

    let elDiscard = document.getElementById('set-discard');
    if (elDiscard) timeDiscard = parseInt(elDiscard.value);
    let elCall = document.getElementById('set-call');
    if (elCall) timeCall = parseInt(elCall.value);
    let elExchange = document.getElementById('set-exchange');
    if (elExchange) timeExchange = parseInt(elExchange.value);
    let elCpu = document.getElementById('set-cpu');
    if (elCpu) confCpuLevel = parseInt(elCpu.value);

    saveSettings();

    const gameContainer = document.getElementById('game-container');
    if (gameContainer) gameContainer.style.opacity = '1';

    const tableEl = document.querySelector('.table');
    if (tableEl) tableEl.style.opacity = '1';

    if (typeof init === 'function') await init();
    if (typeof resizeGame === 'function') resizeGame();

    await new Promise(res => setTimeout(res, 150));

    const settingsScreen = document.getElementById('settings-screen');
    if (settingsScreen) {
        settingsScreen.style.transition = 'opacity 0.4s ease-out';
        settingsScreen.style.opacity = '0';

        setTimeout(() => {
            settingsScreen.style.display = 'none';
            settingsScreen.style.transition = 'none';
            settingsScreen.style.opacity = '1';
            isStartingGame = false;
        }, 400);
    } else {
        isStartingGame = false;
    }

    //console.log("適用された設定:", { timeCall, timeExchange, confCpuLevel });
}

// ==========================================
// 📑 UI制御（タブ切替・隠しコマンド・ログ出力）
// ==========================================
function dumpModalStatus(actionName) {
    //console.log(`\n[LOG] 🔍 【${actionName}】実行直後の状態`);
    const targets = [
        'settings-screen', 'settings-modal', 'howto-modal',
        'yaku-modal', 'mypage-modal', 'achievement-modal'
    ];

    targets.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const style = window.getComputedStyle(el);
            const isVisible = style.display !== 'none';
            if (isVisible) {
                //console.log(`  ✅ [表示中] #${id} | z-index: ${style.zIndex} | display: ${style.display}`);
            } else {
                //console.log(`  ❌ [非表示] #${id} | z-index: ${style.zIndex} | display: ${style.display}`);
            }
        } else {
            //console.log(`  ⚠️ [要素なし] #${id}`);
        }
    });
    //console.log(`--------------------------------------------------\n`);
}

function switchSettingsTab(evt, tabId) {
    const tabContents = document.getElementsByClassName("settings-tab-pane");
    for (let i = 0; i < tabContents.length; i++) {
        tabContents[i].style.display = "none";
    }

    const tabLinks = document.getElementsByClassName("settings-tab-btn");
    for (let i = 0; i < tabLinks.length; i++) {
        tabLinks[i].classList.remove("active");
    }

    document.getElementById(tabId).style.display = "block";
    evt.currentTarget.classList.add("active");

    if (typeof playSE === 'function') playSE('click');

    // 🌟 ここに追加：タブ切り替え時にスクロール位置を一番上（0）に戻し、ログを出す
    const container = document.querySelector('.settings-content');
    if (container) {
        container.scrollTop = 0;
        //console.log(`[DEBUG タブ切り替え] 設定タブ変更 [${tabId}]: スクロール位置を一番上に戻しました。現在の scrollTop = ${container.scrollTop}`);
    } else {
        //console.error(`[DEBUG タブ切り替え] 🚨 スクロール対象の '.settings-content' が見つかりません。`);
    }
}

function secretClick() {
    secretClickCount++;

    clearTimeout(secretClickTimer);
    secretClickTimer = setTimeout(() => {
        secretClickCount = 0;
    }, 1000);

    if (secretClickCount >= 7) {
        const btnTabSystem = document.getElementById('btn-tab-system');

        if (btnTabSystem.style.display === "none" || btnTabSystem.style.display === "") {
            btnTabSystem.style.display = "block";
            if (typeof playSE === 'function') playSE('jokerswap_se');
            alert("【システム解放】\n設定メニューに「🔧 システム」タブが出現しました。");
        } else {
            btnTabSystem.style.display = "none";
            toggleDevMode(false);

            if (document.getElementById('set-tab-system').style.display === "block") {
                document.querySelector('.settings-tab-btn').click();
            }
            alert("【システム封印】\n「🔧 システム」タブを隠しました。");
        }
        secretClickCount = 0;
        saveSettings();
    }
}

// ==========================================
// 🌐 ローカライズ（翻訳）制御
// ==========================================
function applyLangMode() {
    document.body.classList.remove('lang-ja', 'lang-en');
    if (currentLangMode === 1) document.body.classList.add('lang-ja');
    if (currentLangMode === 2) document.body.classList.add('lang-en');

    const label = document.getElementById('current-lang-label');
    if (label) {
        if (currentLangMode === 0) {
            label.innerText = "オリジナル";
            label.style.color = "#f1c40f";
        } else if (currentLangMode === 1) {
            label.innerText = "日本役化";
            label.style.color = "#e74c3c";
        } else {
            label.innerText = "English";
            label.style.color = "#3498db";
        }
    }
}

function toggleYakuLang() {
    currentLangMode = (currentLangMode + 1) % 3;
    applyLangMode();
    if (typeof playSE === 'function') playSE('click');
    saveSettings();
}

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
function getJaYakuName(zhName) { return yakuJaMap[zhName] || zhName; }

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
function getEnYakuName(zhName) { return yakuEnMap[zhName] || zhName; }

// ==========================================
// 🌟 設定タブのチェックボックスイベントを紐付け
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
    const chkRight = document.getElementById('set-right-click');
    if (chkRight) chkRight.addEventListener('change', (e) => { confRightClick = e.target.checked; saveSettings(); });

    const chkDouble = document.getElementById('set-double-click');
    if (chkDouble) chkDouble.addEventListener('change', (e) => { confDoubleClick = e.target.checked; saveSettings(); });

    const chkStamps = document.getElementById('set-show-stamps');
    if (chkStamps) chkStamps.addEventListener('change', (e) => { confShowStamps = e.target.checked; saveSettings(); });

    const chkTsumogiri = document.getElementById('set-tsumogiri-dark');
    if (chkTsumogiri) chkTsumogiri.addEventListener('change', (e) => { confTsumogiri = e.target.checked; saveSettings(); });

    const chkWaits = document.getElementById('set-waits-hint');
    if (chkWaits) chkWaits.addEventListener('change', (e) => {
        confWaitsHint = e.target.checked;
        if (typeof updateWaitsButton === 'function') updateWaitsButton();
        saveSettings();
    });
});
/*デプロイ用コメント1*/