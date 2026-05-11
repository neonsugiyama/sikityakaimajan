// ==========================================
// 🔊 オーディオ管理システム (audio.js)
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

// 🌟 音量管理のグローバル変数
let globalMasterVolume = 1.0;
let globalBgmVolume = 0.3;
let globalSeVolume = 1.0;
let globalVoiceVolume = 1.0;
let masterSEVolume = 1.0; // 後方互換用

// スライダー連続再生防止用のタイマー
let testSoundTimer = null;

// 🔈 ユーザーの初回クリック時にBGMの再生を開始する関数
function initAudio() {
    if (audioState.initialized) return;
    audioState.initialized = true;

    // 🌟 修正：ミュートになる場合でも、まずは必ず再生命令を出してブラウザの「自動再生ブロック」を解除する
    sounds.bgm.play().catch(e => console.log("BGM自動再生ブロック:", e));

    applyBGMVolume();
}
window.addEventListener('click', initAudio, { once: true });

// 🔊 マスター音量（全体）の変更
function updateMasterVolume(val, playTest = false) {
    globalMasterVolume = parseFloat(val);
    const label = document.getElementById('settings-master-label');
    if (label) label.innerText = `${Math.round(globalMasterVolume * 100)}%`;

    applyBGMVolume();

    if (playTest) {
        if (testSoundTimer) clearTimeout(testSoundTimer);
        testSoundTimer = setTimeout(() => { playSE('dahai'); }, 100);
    }
    // 注意: saveSettings() は game.js 側にあるためそのまま呼び出します
    if (typeof saveSettings === 'function') saveSettings();
}

// 🎵 BGM音量の変更
function updateBGMVolume(val) {
    globalBgmVolume = parseFloat(val);
    const label = document.getElementById('settings-bgm-label');
    if (label) label.innerText = `${Math.round(globalBgmVolume * 100)}%`;

    applyBGMVolume();
    if (typeof saveSettings === 'function') saveSettings();
}

// ==========================================
// 🌟 BGM自動同期システム
// ==========================================

// 画面の状態をチェックし、BGMを鳴らすべきか判断して自動調整する関数
function syncBgmState() {
    if (!audioState.initialized) return;

    // 「雀卓」が見えているかどうかで対局中かを判定する（最も確実な方法）
    const table = document.querySelector('.table');
    const isMatchActive = table && (table.style.opacity === '1' || table.style.opacity === 1);

    // 対局中はBGMボタンの設定（bgmOn）に従い、それ以外（ホーム等）は必ずON（ミュート解除）
    const shouldMute = isMatchActive ? !audioState.bgmOn : false;

    // 1. まずはミュート状態にズレがあれば修正する
    if (sounds.bgm.muted !== shouldMute) {
        sounds.bgm.muted = shouldMute;
    }

    // 2. 🌟 修正：「ミュートではない（音を出すべき）」かつ「音量がある」のに
    // 確認ダイアログ等で勝手に再生が止まってしまっている場合は、無条件で再開させる！
    let finalV = globalBgmVolume * globalMasterVolume;
    if (!sounds.bgm.muted && finalV > 0 && sounds.bgm.paused) {
        sounds.bgm.play().catch(e => { });
    }
}

// 0.5秒ごとに画面状態を監視して、自動で音を切り替える
setInterval(syncBgmState, 500);

// 内部でBGMの最終的な音量を計算して反映する関数
function applyBGMVolume() {
    let finalV = globalBgmVolume * globalMasterVolume;
    sounds.bgm.volume = Math.max(0, Math.min(1.0, finalV));

    if (!sounds.bgm.muted && audioState.initialized && sounds.bgm.paused && finalV > 0) {
        sounds.bgm.play().catch(e => { });
    }
}

// 🔊 効果音（SE）音量の変更
function updateSEVolume(val, playTest = false) {
    globalSeVolume = parseFloat(val);
    const label = document.getElementById('settings-se-label');
    if (label) label.innerText = `${Math.round(globalSeVolume * 100)}%`;

    if (playTest) {
        if (testSoundTimer) clearTimeout(testSoundTimer);
        testSoundTimer = setTimeout(() => { playSE('dahai'); }, 100);
    }
    if (typeof saveSettings === 'function') saveSettings();
}

// 🗣️ ボイス（発声）音量の変更
function updateVoiceVolume(val, playTest = false) {
    globalVoiceVolume = parseFloat(val);
    const label = document.getElementById('settings-voice-label');
    if (label) label.innerText = `${Math.round(globalVoiceVolume * 100)}%`;

    if (playTest) {
        if (testSoundTimer) clearTimeout(testSoundTimer);
        testSoundTimer = setTimeout(() => { playSE('pon_0'); }, 100);
    }
    if (typeof saveSettings === 'function') saveSettings();
}

// 🔊 指定された名前の効果音（ボイス含む）を適切な音量で再生する関数
function playSE(soundName) {
    if (!audioState.seOn || !sounds[soundName]) return null;

    let baseVol = 0.6;
    if (soundVolumes[soundName] !== undefined) {
        baseVol = soundVolumes[soundName];
    } else {
        let baseName = soundName.split('_')[0];
        if (soundVolumes[baseName] !== undefined) {
            baseVol = soundVolumes[baseName];
        }
    }

    let isVoice = voiceTypes.some(v => soundName.startsWith(v));
    let typeVol = isVoice ? globalVoiceVolume : globalSeVolume;
    let finalVol = Math.min(1.0, baseVol * typeVol * globalMasterVolume);

    if (finalVol <= 0) return null;

    let clone = sounds[soundName].cloneNode();
    clone.volume = finalVol;
    clone.play().catch(e => console.log("SE再生エラー:", e));
    return clone;
}

// 🎵 BGMの切替ボタンが押された時の関数
function toggleBGM() {
    audioState.bgmOn = !audioState.bgmOn;

    // 即座にミュート状態を同期
    syncBgmState();

    // ボタンの見た目更新
    const btn = document.getElementById('btn-toggle-bgm');
    if (btn) {
        if (audioState.bgmOn) {
            btn.innerText = "🎵";
            btn.title = "BGM切替: ON";
            btn.style.color = "rgba(255,255,255,0.5)";
            btn.style.borderColor = "rgba(255,255,255,0.25)";
        } else {
            btn.innerText = "🔇";
            btn.title = "BGM切替: OFF";
            btn.style.color = "rgba(231, 76, 60, 0.6)";
            btn.style.borderColor = "rgba(231, 76, 60, 0.3)";
        }
    }

    if (typeof saveSettings === 'function') saveSettings();
    playSE('click');
}