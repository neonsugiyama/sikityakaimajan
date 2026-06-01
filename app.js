// ==========================================
// 📱 アプリケーション制御・メニュー遷移・補助UI (app.js)
// ==========================================

// ⏱️ 指定秒数待機しつつ、スキップ可能なタイマーUIを表示する関数
let resultWaitResolver = null;
let resultTimerInterval = null;
let currentGameMode = 'cpu'; // 'cpu' または 'online'

function waitWithTimerAndSkip(seconds) {
    const controls = document.getElementById('result-controls');
    const timerText = document.getElementById('result-timer-text');
    controls.style.display = "flex";

    let timeLeft = Math.max(0, Math.floor(seconds));
    timerText.innerText = `次へ: ${timeLeft}s`;

    return new Promise(resolve => {
        resultWaitResolver = resolve;
        if (timeLeft <= 0) {
            skipResultWait();
            return;
        }
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
    const resultWrapper = document.getElementById('result-wrapper');
    // 🌟 CPU戦用・牌譜用の両方のボタンIDに対応できるように修正
    const btn = document.getElementById('btn-cpu-screenshot') || document.getElementById('btn-replay-screenshot') || document.querySelector('#result-controls .btn-blue');

    if (!resultWrapper || !btn) {
        console.error("[DEBUG 撮影エラー] result-wrapper または 撮影ボタンが見つかりません。");
        return;
    }

    const originalText = btn.innerText;
    btn.innerText = "📸 撮影中...";
    btn.disabled = true;

    try {
        //console.log("[DEBUG 撮影] クローンを作成して撮影準備を開始します...");
        const clone = resultWrapper.cloneNode(true);
        document.body.appendChild(clone);

        // 🌟 役リストの実際の高さを取得し、見切れないようにキャンバスの高さを計算
        const winYakuOrig = document.getElementById('win-yaku');
        const neededHeight = winYakuOrig ? Math.max(940, winYakuOrig.scrollHeight + 100) : 940;
        //console.log(`[DEBUG 撮影] 撮影サイズ設定: Width = 1750px, Height = ${neededHeight}px`);

        // 🌟 幅1750pxを強制し、不要なpaddingなどを削除して絶対配置のズレを防ぐ
        clone.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 1750px !important; 
            height: ${neededHeight}px !important;
            transform: none !important;
            background-color: #0a0a0a !important;
            z-index: -99999 !important;
        `;

        const winYaku = clone.querySelector('#win-yaku');
        if (winYaku) {
            winYaku.style.setProperty('overflow', 'visible', 'important');
            winYaku.style.setProperty('max-height', 'none', 'important');
            winYaku.style.setProperty('height', 'auto', 'important');
        }

        const cloneControls = clone.querySelector('#result-controls');
        if (cloneControls) cloneControls.remove();

        const yakuTags = clone.querySelectorAll('.yaku-tag');
        yakuTags.forEach(tag => {
            tag.style.setProperty('animation', 'none', 'important');
            tag.style.setProperty('display', 'inline-block', 'important');

            if (tag.classList.contains('yaku-tier-64')) {
                tag.style.setProperty('box-shadow', '0 0 12px 2px #f1c40f', 'important');
                tag.style.setProperty('border', '2px solid #f1c40f', 'important');
            } else if (tag.classList.contains('yaku-tier-32')) {
                tag.style.setProperty('box-shadow', '0 0 12px 2px #e67e22', 'important');
                tag.style.setProperty('border', '2px solid #e67e22', 'important');
            } else if (tag.classList.contains('yaku-tier-16')) {
                tag.style.setProperty('box-shadow', '0 0 12px 2px #e74c3c', 'important');
                tag.style.setProperty('border', '2px solid #e74c3c', 'important');
            } else if (tag.classList.contains('yaku-tier-multi')) {
                tag.style.setProperty('box-shadow', '0 0 12px 2px #00d2d3', 'important');
                tag.style.setProperty('border', '2px solid #00d2d3', 'important');
            }
        });

        await new Promise(r => setTimeout(r, 200));

        //console.log("[DEBUG 撮影] html2canvasによる描画を開始します...");
        const canvas = await html2canvas(clone, {
            backgroundColor: "#0a0a0a",
            scale: 2,
            useCORS: true,
            logging: false,
            width: 1750, // 🌟 html2canvasの内部キャンバスサイズも強制
            height: neededHeight,
            windowWidth: 1750,
            windowHeight: neededHeight
        });

        clone.remove();
        //console.log("[DEBUG 撮影] 描画完了。画像を出力します。");

        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error("画像データの生成に失敗しました");

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        // 保存ファイル名の日付フォーマット
        const date = new Date();
        const dateStr = `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}`;
        link.download = `mahjong_result_${dateStr}.png`;

        link.href = url;
        link.click();

        setTimeout(() => URL.revokeObjectURL(url), 1000);
        //console.log("[DEBUG 撮影] 正常に保存が完了しました。");

    } catch (e) {
        //console.error("[DEBUG 撮影エラー] Screenshot Error:", e);
        alert("スクリーンショットの保存に失敗しました。\n" + e.message);
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

async function returnToHomeGracefully() {
    //console.log("[App] 🏠 returnToHomeGracefully 呼び出し");

    // 🌟 追加：途中で退出した時は、実績のストック状態を強制リセットして元に戻す
    if (window.originalShowAchievementUnlock) {
        window.showAchievementUnlock = window.originalShowAchievementUnlock;
        window.pendingAchievements = [];
    }

    if (typeof fetchAndSaveReplay === 'function') {
        //console.log("[App] 📼 牌譜の保存処理を開始します...");
        await fetchAndSaveReplay();
        //console.log("[App] 📼 牌譜の保存処理が完了しました");
    }

    if (typeof isReplayMode !== 'undefined') isReplayMode = false;
    if (typeof replayAutoInterval !== 'undefined' && replayAutoInterval) {
        clearInterval(replayAutoInterval);
        replayAutoInterval = null;
    }
    const actionWrapper = document.getElementById('action-wrapper');
    if (actionWrapper) actionWrapper.style.display = ''; // 隠していた操作ボタンを復活！

    if (typeof stopTimer === 'function') stopTimer();
    isProc = false;
    if (typeof charlestonPhase !== 'undefined') charlestonPhase = false;
    // 🌟 friend_round_end のガードがロックされたまま残らないよう、退出時にも解除する
    if (typeof _handleRoundEndInProgress !== 'undefined') _handleRoundEndInProgress = false;

    if (currentGameMode === 'lesson' || currentGameMode === 'tutorial') {
        if (typeof loadGameData === 'function') loadGameData();
    }

    if (typeof charlestonCount !== 'undefined') charlestonCount = 1;
    if (typeof exchangeSelection !== 'undefined') exchangeSelection = [];
    if (typeof askedCount !== 'undefined') askedCount = 0;
    if (typeof secondCharlestonParticipating !== 'undefined') secondCharlestonParticipating = [false, false, false, false];
    if (typeof charlestonAskResults !== 'undefined') charlestonAskResults = [];
    if (typeof humanSecondCharlestonTiles !== 'undefined') humanSecondCharlestonTiles = [];
    if (typeof hideCpuTiles !== 'undefined') hideCpuTiles = [0, 0, 0, 0];
    if (typeof charlestonDoneServer !== 'undefined') charlestonDoneServer = false;
    if (typeof secondCharlestonDoneServer !== 'undefined') secondCharlestonDoneServer = false;

    if (typeof currentSessionRoomId !== 'undefined' && currentSessionRoomId) {
        sessionStorage.removeItem(`result_display_idx_${currentSessionRoomId}`);
        sessionStorage.removeItem(`result_end_time_${currentSessionRoomId}`);
        sessionStorage.removeItem(`result_phase_start_${currentSessionRoomId}`);

        fetch(`/exit_room?room_id=${currentSessionRoomId}&_t=${new Date().getTime()}`).catch(e => console.log(e));
        currentSessionRoomId = "";
        localStorage.removeItem('shiki_mahjong_room_id');
        localStorage.removeItem('shiki_mahjong_game_mode');
    }

    const table = document.querySelector('.table');
    if (table) table.style.opacity = 0;
    const overlay = document.getElementById('overlay');
    if (overlay) overlay.style.display = 'none';

    const uiList = ['charleston-ui', 'charleston-confirm-ui', 'center-message', 'dice-overlay', 'tutorial-review-container', 'replay-controls'];
    uiList.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    const navPanel = document.getElementById('ingame-tutorial-nav');
    if (navPanel) navPanel.style.display = 'none';

    const settingsScreen = document.getElementById('settings-screen');
    if (settingsScreen) {
        settingsScreen.style.display = 'none';
        settingsScreen.style.opacity = '1';
    }

    for (let i = 0; i < 4; i++) {
        const r = document.getElementById(`river-${i}`);
        if (r) r.innerHTML = "";
        const m = document.getElementById(`meld-${i}`);
        if (m) m.innerHTML = "";
        const wz = document.getElementById(`win-zone-${i}`);
        if (wz) {
            wz.innerHTML = "";
            wz.style.display = "none";
        }

        let callText = document.getElementById(`call-text-${i}`);
        if (callText) {
            callText.className = "call-text";
            callText.innerText = "";
        }
        let roundScore = document.getElementById(`player-round-score-${i}`);
        if (roundScore) roundScore.className = "player-round-score";

        let stamp = document.getElementById(`stamp-display-${i}`);
        if (stamp) stamp.classList.remove('show');
    }

    const msgEl = document.getElementById('msg');
    if (msgEl) {
        msgEl.innerText = "";
        msgEl.className = "";
    }
    document.querySelectorAll('.action-layer .btn-act').forEach(b => b.style.display = "none");

    const btnHaitei = document.getElementById('btn-haitei-tsumo');
    const btnRyukyoku = document.getElementById('btn-ryukyoku');
    if (btnHaitei) btnHaitei.style.display = "none";
    if (btnRyukyoku) btnRyukyoku.style.display = "none";

    if (typeof hideWaitsPanel === 'function') hideWaitsPanel();

    if (typeof isAutoPlay !== 'undefined') isAutoPlay = false;
    const btnAuto = document.getElementById('btn-auto-play');
    if (btnAuto) {
        btnAuto.innerText = "オート(和了後): OFF";
        btnAuto.style.background = "#7f8c8d";
        btnAuto.style.boxShadow = "0 3px #95a5a6";
        btnAuto.classList.add('auto-off');
    }

    if (typeof updateProfileUI === 'function') updateProfileUI();
    const modeScreen = document.getElementById('mode-select-screen');
    if (modeScreen) {
        modeScreen.style.display = 'flex';
        setTimeout(() => { modeScreen.style.opacity = '1'; }, 50);
    }

    updateStampVisibility();

    if (typeof applyBGMVolume === 'function') applyBGMVolume();
    //console.log("[App] 🏠 タイトル画面への帰還処理完了");
}

function quitGame() {
    if (!confirm("本当に対局を中断してホーム画面に戻りますか？\n（進行中のスコアや戦績は保存されません）")) {
        return;
    }
    if (typeof playSE === 'function') playSE('click');
    returnToHomeGracefully();
}

function switchYakuTab(evt, tabId) {
    const tabContents = document.getElementsByClassName("yaku-tab-content");
    for (let i = 0; i < tabContents.length; i++) {
        tabContents[i].style.display = "none";
    }
    const tabLinks = document.getElementsByClassName("yaku-tab-btn");
    for (let i = 0; i < tabLinks.length; i++) {
        tabLinks[i].classList.remove("active");
    }
    const target = document.getElementById(tabId);
    if (target) target.style.display = "block";
    evt.currentTarget.classList.add("active");

    // 🌟 修正：既存のスクロールリセットにログ出力を追加
    const container = document.getElementById('yaku-list-container');
    if (container) {
        container.scrollTop = 0;
        //console.log(`[DEBUG タブ切り替え] 役一覧タブ変更 [${tabId}]: スクロール位置を一番上に戻しました。現在の scrollTop = ${container.scrollTop}`);
    } else {
        //console.error(`[DEBUG タブ切り替え] 🚨 スクロール対象の 'yaku-list-container' が見つかりません。`);
    }
}

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

function resizeGame() {
    // 🌟 1. 卓の「ベースサイズ（箱の大きさ）」と「視覚的な広さ（余白込み）」を定義
    const BASE_WIDTH = 1520;
    const BASE_HEIGHT = 1080;
    const VISUAL_WIDTH = 1620;
    const VISUAL_HEIGHT = 900;

    const scaleX = window.innerWidth / VISUAL_WIDTH;
    const scaleY = window.innerHeight / VISUAL_HEIGHT;
    const scale = Math.min(scaleX, scaleY);

    document.documentElement.style.setProperty('--game-scale', scale);

    // 🌟 2. ゲームコンテナ本体（ついに完成する完璧な中央固定ロジック）
    const container = document.getElementById('game-container');
    if (container) {
        container.style.width = `${BASE_WIDTH}px`;
        container.style.height = `${BASE_HEIGHT}px`;
        container.style.position = "absolute";
        container.style.left = "50%";
        container.style.top = "43%";
        container.style.setProperty('margin', '0', 'important');
        container.style.transformOrigin = "center center";
        container.style.transform = `translate(-50%, -50%) scale(${scale})`;
        container.classList.add('ready');
    }

    // 🌟 3. タイトルとモード選択
    const screens = ['.title-content', '#mode-select-container'];
    screens.forEach(selector => {
        const el = document.querySelector(selector);
        if (el) {
            el.style.position = "absolute";
            el.style.left = "50%";
            el.style.top = "50%";
            el.style.setProperty('margin', '0', 'important');
            el.style.transformOrigin = "center center";
            el.style.transform = `translate(-50%, -50%) scale(${scale})`;
            el.classList.add('ready');
        }
    });

    // 🌟 4. モーダル群（0.95倍マージン）
    const modalElements = [
        '#settings-modal > div', '#howto-modal > div', '#yaku-modal > div',
        /* 🚨 古い achievement-modal は削除しました */
        '#mypage-modal > div', '#friend-match-modal > div',
        '#settings-screen > div', '#friend-settings-screen > div', '#learning-modal > div', '#online-match-modal > div',
        '#rate-help-modal > div', '#replay-modal > div', '#auth-modal > div'
    ];
    modalElements.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
            el.style.setProperty('position', 'absolute', 'important');
            el.style.setProperty('left', '50%', 'important');
            el.style.setProperty('top', '50%', 'important');
            el.style.setProperty('margin', '0', 'important');
            el.style.setProperty('transform-origin', 'center center', 'important');
            el.style.setProperty('transform', `translate(-50%, -50%) scale(${scale * 0.95})`, 'important');
        });
    });

    // 🌟 5. 特殊要素のスケール調整
    const resultWrapper = document.getElementById('result-wrapper');
    if (resultWrapper) {
        resultWrapper.style.position = "absolute";
        resultWrapper.style.left = "50%";
        resultWrapper.style.top = "50%";
        resultWrapper.style.setProperty('margin', '0', 'important');
        resultWrapper.style.transformOrigin = "center center";
        resultWrapper.style.transform = `translate(-50%, -50%) scale(${scale * 0.85})`;
    }

    const bigYaku = document.getElementById('big-yaku-text');
    if (bigYaku) {
        bigYaku.style.fontSize = `${180 * scale}px`;
        bigYaku.style.webkitTextStrokeWidth = `${4 * scale}px`;
    }

    const debugPanels = [
        { selector: '.debug-panel', origin: 'top right' },
        { selector: '#achieve-debug-panel', origin: 'top left' }
    ];
    debugPanels.forEach(panel => {
        const el = document.querySelector(panel.selector);
        if (el) {
            el.style.transformOrigin = panel.origin;
            el.style.transform = `scale(${scale})`;
        }
    });

    // 🌟 6. 新設：全画面スクリーン（実績・役図鑑など）のスマホ対応レイアウト保護
    const gameScreens = document.querySelectorAll('.game-screen');
    gameScreens.forEach(el => {
        // 画面を 1620x900 の固定キャンバスにして、スマホの画面サイズに合わせて自動縮小させる
        el.style.width = `${VISUAL_WIDTH}px`;
        el.style.height = `${VISUAL_HEIGHT}px`;
        el.style.position = "absolute";
        el.style.left = "50%";
        el.style.top = "50%";
        el.style.setProperty('margin', '0', 'important');
        el.style.transformOrigin = "center center";
        el.style.transform = `translate(-50%, -50%) scale(${scale})`;
    });
}

window.addEventListener('resize', resizeGame);
window.addEventListener('DOMContentLoaded', resizeGame);
resizeGame();

// ==========================================
// ★ 画面遷移・モード選択制御
// ==========================================
async function showModeSelect() {
    if (typeof playSE === 'function') playSE('start');

    // 🔐 ページロード時の認証データ読み込みがまだ終わってなければ待つ
    // （これでログイン中なら一瞬古いデータが見える現象を防ぐ）
    if (_authInitPromise) {
        try {
            await _authInitPromise;
        } catch (e) { /* ignore */ }
        _authInitPromise = null; // 一度待ったら以降不要
    }

    // 🔁 ログイン中 + 進行中の対局があれば自動的に復帰
    if (typeof isLoggedIn === 'function' && isLoggedIn()
        && typeof currentRoomIdInDb !== 'undefined' && currentRoomIdInDb) {
        if (typeof rejoinFriendGame === 'function') {
            const ok = await rejoinFriendGame();
            if (ok) {
                return; // 復帰成功 → 対局画面へ
            }
            // 復帰失敗（部屋が消えている等）→ そのまま通常モード選択へフォールスルー
        }
    }

    // 🔐 未ログインならまず認証モーダルを表示（ゲストで続行も可能）
    if (typeof isLoggedIn === 'function' && !isLoggedIn()) {
        _authModalForModeSelect = true;
        openAuthModal();
        return;
    }

    return _afterAuthShowModeSelect();
}

async function _afterAuthShowModeSelect() {
    if (typeof playSE === 'function') playSE('start');

    if (typeof audioState !== 'undefined' && !audioState.initialized) {
        audioState.initialized = true;
        if (audioState.bgmOn && typeof sounds !== 'undefined') {
            sounds.bgm.play().catch(e => console.log("BGM自動再生ブロック:", e));
        }
    }

    if (typeof currentSessionRoomId !== 'undefined' && currentSessionRoomId) {
        const savedMode = localStorage.getItem('shiki_mahjong_game_mode');

        if (savedMode === 'tutorial' || savedMode === 'lesson') {
            await fetch(`/exit_room?room_id=${currentSessionRoomId}`);
            currentSessionRoomId = "";
            localStorage.removeItem('shiki_mahjong_room_id');
            localStorage.removeItem('shiki_mahjong_game_mode');
        } else {
            try {
                const res = await fetch(`/check_room?room_id=${currentSessionRoomId}&_t=${new Date().getTime()}`);
                const data = await res.json();

                if (data.exists) {
                    if (confirm("中断された対局データが見つかりました。再開しますか？\n（「キャンセル」でデータを破棄して新規開始します）")) {
                        isResuming = true;
                        currentGameMode = savedMode || 'cpu';

                        let stateData = await apiCall('/get_room_state');

                        if (stateData.round_calculated) {
                            const startTime = sessionStorage.getItem(`result_phase_start_${currentSessionRoomId}`);
                            if (startTime) {
                                const elapsed = (Date.now() - parseInt(startTime)) / 1000;
                                if (elapsed > 35) {
                                    for (let i = 0; i < 4; i++) {
                                        const els = ['river', 'meld', 'win-zone', 'call-text'];
                                        els.forEach(prefix => {
                                            const el = document.getElementById(`${prefix}-${i}`);
                                            if (el) {
                                                if (prefix === 'call-text') {
                                                    el.className = "call-text";
                                                    el.innerText = "";
                                                } else {
                                                    el.innerHTML = "";
                                                    if (prefix === 'win-zone') el.style.display = "none";
                                                }
                                            }
                                        });
                                    }

                                    stateData = await apiCall('/next_round');
                                    sessionStorage.removeItem(`result_phase_start_${currentSessionRoomId}`);
                                    sessionStorage.removeItem(`timer_end_time_${currentSessionRoomId}`);
                                    isResuming = false;
                                } else {
                                    isResumingResult = true;

                                    document.getElementById('title-screen').style.display = 'none';
                                    document.getElementById('mode-select-screen').style.display = 'none';
                                    document.querySelector('.table').style.opacity = 1;
                                    document.getElementById('game-container').style.opacity = 1;

                                    safeUpdate(stateData);
                                    if (typeof handleRoundEnd === 'function') handleRoundEnd(true);
                                    return;
                                }
                            } else {
                                stateData = await apiCall('/next_round');
                                sessionStorage.removeItem(`timer_end_time_${currentSessionRoomId}`);
                                isResuming = false;
                            }
                        }

                        document.getElementById('title-screen').style.display = 'none';
                        document.getElementById('mode-select-screen').style.display = 'none';
                        document.querySelector('.table').style.opacity = 1;
                        document.getElementById('game-container').style.opacity = 1;

                        safeUpdate(stateData);
                        if (typeof render === 'function') render();
                        if (typeof renderCPU === 'function') renderCPU();

                        // ▼▼▼ ここから修正 ▼▼▼
                        // 🌟 修正：河の牌だけでなく、山札の減りや副露・和了の状態も含めて「対局が進行しているか」を判定する
                        let isGameStarted = false;

                        // 1. 河に牌があるか
                        if (stateData.discards) {
                            for (let i = 0; i < 4; i++) {
                                if (stateData.discards[i].length > 0) isGameStarted = true;
                            }
                        }
                        // 2. 誰かがすでに副露（鳴き）しているか
                        if (stateData.all_melds) {
                            for (let i = 0; i < 4; i++) {
                                if (stateData.all_melds[i] && stateData.all_melds[i].length > 0) isGameStarted = true;
                            }
                        }
                        // 3. 誰かがすでに和了（アガリ）しているか
                        if (stateData.all_win_tiles) {
                            for (let i = 0; i < 4; i++) {
                                if (stateData.all_win_tiles[i] && stateData.all_win_tiles[i].length > 0) isGameStarted = true;
                            }
                        }
                        // 4. 山札が初期値(60)より減っているか（ゲームが動いた証拠）
                        if (stateData.wall_count !== undefined && stateData.wall_count < 60) {
                            isGameStarted = true;
                        }
                        // 5. サーバーからのチャールストン完了フラグ
                        if (typeof charlestonDoneServer !== 'undefined' && charlestonDoneServer &&
                            typeof secondCharlestonDoneServer !== 'undefined' && secondCharlestonDoneServer) {
                            isGameStarted = true;
                        }

                        // 判定結果を使って分岐
                        if (isGameStarted) {
                            if (typeof charlestonPhase !== 'undefined') charlestonPhase = false;
                            document.getElementById('charleston-ui').style.display = "none";

                            if (typeof lastDiscardPlayer !== 'undefined' && lastDiscardPlayer !== -1 && typeof lastT !== 'undefined' && lastT !== "") {
                                if (lastDiscardPlayer !== 0) {
                                    if (typeof checkHumanReaction === 'function') checkHumanReaction(lastDiscardPlayer, lastT);
                                } else {
                                    if (typeof checkT === 'function') checkT();
                                }
                            } else {
                                if (typeof checkT === 'function') checkT();
                            }
                        } else if (typeof charlestonDoneServer !== 'undefined' && !charlestonDoneServer) {
                            if (typeof charlestonCount !== 'undefined') charlestonCount = 1;
                            if (typeof startCharlestonSelection === 'function') startCharlestonSelection();
                        } else {
                            if (typeof charlestonCount !== 'undefined') charlestonCount = 2;
                            if (typeof askNextSecondCharleston === 'function') askNextSecondCharleston();
                        }
                        return;
                    } else {
                        await fetch(`/exit_room?room_id=${currentSessionRoomId}`);
                        currentSessionRoomId = "";
                        localStorage.removeItem('shiki_mahjong_room_id');
                        localStorage.removeItem('shiki_mahjong_game_mode');
                    }
                } else {
                    currentSessionRoomId = "";
                    localStorage.removeItem('shiki_mahjong_room_id');
                    localStorage.removeItem('shiki_mahjong_game_mode');
                }
            } catch (e) {
                //console.log("[再開ロジック] ❌ エラー発生:", e);
            }
        }
    }

    if (typeof updateProfileUI === 'function') updateProfileUI();
    const ts = document.getElementById('title-screen');
    if (ts) ts.style.display = 'none';
    const ms = document.getElementById('mode-select-screen');
    if (ms) ms.style.display = 'flex';
}

function backToTitle() {
    if (typeof playSE === 'function') playSE('click');
    const ms = document.getElementById('mode-select-screen');
    if (ms) ms.style.display = 'none';
    const ts = document.getElementById('title-screen');
    if (ts) ts.style.display = 'flex';
}

function startCpuGame() {
    if (typeof playSE === 'function') playSE('click');
    currentGameMode = 'cpu';
    const modeScreen = document.getElementById('mode-select-screen');

    if (modeScreen) {
        modeScreen.style.opacity = '0';
        modeScreen.style.transition = 'opacity 0.5s';

        setTimeout(() => {
            modeScreen.style.display = 'none';
            modeScreen.style.opacity = '1';

            const settingsScreen = document.getElementById('settings-screen');
            if (settingsScreen) {
                settingsScreen.style.display = 'flex';
                settingsScreen.style.zIndex = '35000';
            }
        }, 500);
    }
}

function cancelCpuGame() {
    if (typeof playSE === 'function') playSE('click');
    const settingsScreen = document.getElementById('settings-screen');
    if (settingsScreen) settingsScreen.style.display = 'none';

    const modeScreen = document.getElementById('mode-select-screen');
    if (modeScreen) {
        modeScreen.style.display = 'flex';
        modeScreen.style.opacity = '1';
    }
}

// ==========================================
// ★ 友人戦（オンラインロビー）制御
// ==========================================
let currentRoomId = "";
let lobbyWs = null;

// 🌟 ホストが作成中のルームID（設定画面 → 待機画面で使う）
let pendingHostRoomId = "";

// ==========================================
// 🔐 アカウントモーダル UI（ログイン/登録）
// ==========================================
function openAuthModal() {
    if (typeof playSE === 'function') playSE('click');
    // 🌟 他のモーダル（設定/役一覧/遊び方など）を全部閉じてから開く
    if (typeof closeAllModals === 'function') closeAllModals();
    const modal = document.getElementById('auth-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    _refreshAuthModalUI();
}

function closeAuthModal() {
    if (typeof playSE === 'function') playSE('click');
    const modal = document.getElementById('auth-modal');
    if (modal) modal.style.display = 'none';
    const err = document.getElementById('auth-error');
    if (err) err.innerText = '';
    // 🔐 GAME START からモーダルを開いていた場合、続きの処理へ
    if (_authModalForModeSelect) {
        _authModalForModeSelect = false;
        if (typeof _afterAuthShowModeSelect === 'function') _afterAuthShowModeSelect();
    }
}

// 🔐 GAME START 直後にモーダルを開いたかフラグ
let _authModalForModeSelect = false;

function _refreshAuthModalUI() {
    const loginSection = document.getElementById('auth-login-section');
    const loggedinSection = document.getElementById('auth-loggedin-section');
    const statusText = document.getElementById('auth-status-text');
    const currentUser = document.getElementById('auth-current-username');
    const menuStatus = document.getElementById('auth-menu-status');
    const closeBtn = document.getElementById('auth-close-btn');

    if (typeof isLoggedIn === 'function' && isLoggedIn()) {
        if (loginSection) loginSection.style.display = 'none';
        if (loggedinSection) loggedinSection.style.display = 'block';
        if (statusText) statusText.innerText = `ログイン中: ${authUsername}`;
        if (currentUser) currentUser.innerText = authUsername;
        if (menuStatus) menuStatus.innerText = `(${authUsername})`;
        if (closeBtn) closeBtn.innerText = '閉じる';
    } else {
        if (loginSection) loginSection.style.display = 'block';
        if (loggedinSection) loggedinSection.style.display = 'none';
        if (statusText) statusText.innerText = '未ログイン（ゲスト）';
        if (menuStatus) menuStatus.innerText = '';
        if (closeBtn) closeBtn.innerText = '閉じる / ゲストで遊ぶ';
    }
}

async function uiAuthLogin() {
    if (typeof playSE === 'function') playSE('click');
    const username = (document.getElementById('auth-username').value || '').trim();
    const password = document.getElementById('auth-password').value || '';
    const errEl = document.getElementById('auth-error');
    if (errEl) errEl.innerText = '';
    if (!username || !password) {
        if (errEl) errEl.innerText = 'ユーザー名とパスワードを入力してください';
        return;
    }
    try {
        await authLogin(username, password);
        _refreshAuthModalUI();
        document.getElementById('auth-username').value = '';
        document.getElementById('auth-password').value = '';
        if (typeof playerStats !== 'undefined' && authUsername) {
            playerStats.playerName = authUsername;
        }
        if (typeof updateProfileUI === 'function') updateProfileUI();
        if (typeof updateInfoUI === 'function') updateInfoUI();
        alert(`ログインしました: ${authUsername}`);
        // 🔐 GAME START からモーダルを開いていた場合、自動で閉じてモード選択へ
        if (_authModalForModeSelect) {
            _authModalForModeSelect = false;
            const modal = document.getElementById('auth-modal');
            if (modal) modal.style.display = 'none';
            if (typeof _afterAuthShowModeSelect === 'function') _afterAuthShowModeSelect();
        }
    } catch (e) {
        if (errEl) errEl.innerText = e.message || 'ログインに失敗しました';
    }
}

async function uiAuthRegister() {
    if (typeof playSE === 'function') playSE('click');
    const username = (document.getElementById('auth-username').value || '').trim();
    const password = document.getElementById('auth-password').value || '';
    const migrate = document.getElementById('auth-migrate-checkbox').checked;
    const errEl = document.getElementById('auth-error');
    if (errEl) errEl.innerText = '';
    if (!username || !password) {
        if (errEl) errEl.innerText = 'ユーザー名とパスワードを入力してください';
        return;
    }
    if (password.length < 4) {
        if (errEl) errEl.innerText = 'パスワードは4文字以上で入力してください';
        return;
    }
    try {
        await authRegister(username, password, migrate);
        _refreshAuthModalUI();
        document.getElementById('auth-username').value = '';
        document.getElementById('auth-password').value = '';
        if (typeof playerStats !== 'undefined') {
            playerStats.playerName = authUsername;
        }
        if (typeof updateProfileUI === 'function') updateProfileUI();
        if (typeof updateInfoUI === 'function') updateInfoUI();
        const msg = migrate
            ? `アカウント作成完了: ${authUsername}\n（既存の戦績・牌譜を引き継ぎました）`
            : `アカウント作成完了: ${authUsername}`;
        alert(msg);
        // 🔐 GAME START からモーダルを開いていた場合、自動で閉じてモード選択へ
        if (_authModalForModeSelect) {
            _authModalForModeSelect = false;
            const modal = document.getElementById('auth-modal');
            if (modal) modal.style.display = 'none';
            if (typeof _afterAuthShowModeSelect === 'function') _afterAuthShowModeSelect();
        }
    } catch (e) {
        if (errEl) errEl.innerText = e.message || '登録に失敗しました';
    }
}

async function uiAuthLogout() {
    if (typeof playSE === 'function') playSE('click');
    if (!confirm('ログアウトしますか?\n（戦績・牌譜はサーバーに保存されています）')) return;
    await authLogout();
    _refreshAuthModalUI();
    alert('ログアウトしました');
    location.reload();
}

// 🔐 ページロード時の認証データ読み込み Promise（showModeSelect 等から await できる）
let _authInitPromise = null;

// ページロード時、トークンが残っていればサーバーからデータ取得
window.addEventListener('DOMContentLoaded', () => {
    if (typeof isLoggedIn === 'function' && isLoggedIn()) {
        _authInitPromise = (async () => {
            const ok = await authLoadAndApply();
            if (ok && typeof playerStats !== 'undefined' && authUsername) {
                playerStats.playerName = authUsername;
            }
            if (typeof updateProfileUI === 'function') updateProfileUI();
            if (typeof updateInfoUI === 'function') updateInfoUI();
            const menuStatus = document.getElementById('auth-menu-status');
            if (menuStatus && authUsername) menuStatus.innerText = `(${authUsername})`;
        })();
    }
});

function createRoom() {
    if (typeof playSE === 'function') playSE('click');
    // 🌟 ルームIDを先に発行
    pendingHostRoomId = Math.random().toString(36).substring(2, 6).toUpperCase();
    // 友人戦のホスト設定画面を表示
    showFriendSettings();
}

// 🌟 友人戦のホスト設定画面を表示
function showFriendSettings() {
    // 友人戦モーダルを閉じる
    const friendModal = document.getElementById('friend-match-modal');
    if (friendModal) friendModal.style.display = 'none';
    // 設定画面を表示
    const settingsModal = document.getElementById('friend-settings-screen');
    if (settingsModal) settingsModal.style.display = 'flex';

    // ルームIDを設定画面に表示
    const roomIdEl = document.getElementById('friend-settings-room-id');
    if (roomIdEl) roomIdEl.innerText = pendingHostRoomId;

    // 前回の値を localStorage から復元
    const saved = JSON.parse(localStorage.getItem('shiki_mahjong_friend_settings') || '{}');
    if (saved.timeDiscard !== undefined) {
        document.getElementById('set-friend-discard').value = saved.timeDiscard;
        document.getElementById('val-friend-discard').innerText = saved.timeDiscard;
    }
    if (saved.timeCall !== undefined) {
        document.getElementById('set-friend-call').value = saved.timeCall;
        document.getElementById('val-friend-call').innerText = saved.timeCall;
    }
    if (saved.timeExchange !== undefined) {
        document.getElementById('set-friend-exchange').value = saved.timeExchange;
        document.getElementById('val-friend-exchange').innerText = saved.timeExchange;
    }
}

// 🌟 戻るボタン
function cancelFriendSettings() {
    if (typeof playSE === 'function') playSE('click');
    pendingHostRoomId = ""; // ルームIDをクリア
    const settingsModal = document.getElementById('friend-settings-screen');
    if (settingsModal) settingsModal.style.display = 'none';
    // 友人戦モーダルを再表示
    const friendModal = document.getElementById('friend-match-modal');
    if (friendModal) friendModal.style.display = 'flex';
}

// 🌟 初期化ボタン
function resetFriendSettingsUI() {
    if (typeof playSE === 'function') playSE('click');
    document.getElementById('set-friend-discard').value = 60;
    document.getElementById('val-friend-discard').innerText = 60;
    document.getElementById('set-friend-call').value = 20;
    document.getElementById('val-friend-call').innerText = 20;
    document.getElementById('set-friend-exchange').value = 60;
    document.getElementById('val-friend-exchange').innerText = 60;
}

// 🌟 設定完了ボタン: 設定値を保存してルーム作成 + 待機画面へ
function applyFriendSettingsAndCreate() {
    if (typeof playSE === 'function') playSE('click');
    const timeDiscard = parseInt(document.getElementById('set-friend-discard').value, 10);
    const timeCall = parseInt(document.getElementById('set-friend-call').value, 10);
    const timeExchange = parseInt(document.getElementById('set-friend-exchange').value, 10);

    const settings = { timeDiscard, timeCall, timeExchange };
    localStorage.setItem('shiki_mahjong_friend_settings', JSON.stringify(settings));

    // 設定画面を閉じる
    const settingsModal = document.getElementById('friend-settings-screen');
    if (settingsModal) settingsModal.style.display = 'none';

    // 友人戦モーダルを再表示（待機画面用）
    const friendModal = document.getElementById('friend-match-modal');
    if (friendModal) friendModal.style.display = 'flex';

    // 既に発行済みのルームIDで接続（ホストとして）
    const roomId = pendingHostRoomId || Math.random().toString(36).substring(2, 6).toUpperCase();
    pendingHostRoomId = "";
    enterWaitingRoom(roomId, settings);
}

function joinRoom() {
    if (typeof playSE === 'function') playSE('click');
    const inputEl = document.getElementById('room-id-input');
    if (!inputEl) return;
    const inputVal = inputEl.value.trim().toUpperCase();
    if (!inputVal) {
        alert("ルームIDを入力してください！");
        return;
    }
    enterWaitingRoom(inputVal);
}

function enterWaitingRoom(roomId, hostSettings = null) {
    currentRoomId = roomId;
    const selectEl = document.getElementById('friend-menu-select');
    if (selectEl) selectEl.style.display = 'none';
    const waitingEl = document.getElementById('friend-menu-waiting');
    if (waitingEl) waitingEl.style.display = 'block';
    const displayEl = document.getElementById('display-room-id');
    if (displayEl) displayEl.innerText = roomId;
    const countEl = document.getElementById('room-player-count');
    if (countEl) countEl.innerText = "1";

    const wsUrl = `ws://${window.location.host}/ws/lobby/${roomId}`;
    lobbyWs = new WebSocket(wsUrl);

    // 🌟 接続直後にプレイヤー名と（ホストなら）設定値、ログイン中ならトークンも送信
    lobbyWs.onopen = () => {
        const myName = (typeof playerStats !== 'undefined' && playerStats.playerName)
            ? playerStats.playerName : "Player";
        const payload = { name: myName };
        if (hostSettings) {
            payload.settings = hostSettings;
        }
        // 🌟 ログイン中ならトークンも送信（途中復帰機能用）
        if (typeof authToken !== 'undefined' && authToken) {
            payload.token = authToken;
        }
        lobbyWs.send(JSON.stringify(payload));
    };

    lobbyWs.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "lobby_update") {
            // 旧仕様の互換（使用しない可能性大）
            const countEl = document.getElementById('room-player-count');
            if (countEl) countEl.innerText = data.player_count;
        }
        if (data.type === "lobby_welcome") {
            // 自分の席番号 + ホスト判定を受け取る
            window.lobbyMySeat = data.my_seat;
            window.lobbyIsHost = data.is_host;
            // ホスト用UIの表示制御
            const hostCtrl = document.getElementById('lobby-host-controls');
            if (hostCtrl) hostCtrl.style.display = data.is_host ? 'block' : 'none';
        }
        if (data.type === "seats_update") {
            // 席の表示を更新
            renderLobbySeats(data.seats);
        }
        if (data.type === "lobby_full") {
            alert("このルームは満員です");
            if (typeof closeFriendMatch === 'function') closeFriendMatch();
        }
        if (data.type === "lobby_error") {
            alert(data.message || "ロビーエラー");
        }
        if (data.type === "game_start") {
            // 🤝 友人戦の本対局開始 → friend.js に処理を委譲
            if (typeof startFriendGame === 'function') {
                startFriendGame(data);
            } else {
                console.error("friend.js が読み込まれていません");
            }
        }
    };

    lobbyWs.onclose = () => {
        console.log("ロビーから切断されました");
    };
}

// 🤝 ロビー: 席リストを描画
function renderLobbySeats(seats) {
    const list = document.getElementById('lobby-seats-list');
    if (!list) return;
    list.innerHTML = '';
    const cpuLevelLabel = ['よわい', 'ふつう', 'つよい'];
    for (let i = 0; i < 4; i++) {
        const seat = seats[i];
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; align-items:center; gap:8px; padding:8px 12px; background:rgba(255,255,255,0.08); border-radius:6px;';

        const idxLabel = document.createElement('span');
        idxLabel.style.cssText = 'color:#bdc3c7; font-size:12px; min-width:36px;';
        idxLabel.innerText = `席${i + 1}`;
        row.appendChild(idxLabel);

        const nameLabel = document.createElement('span');
        nameLabel.style.cssText = 'flex:1; color:white; font-size:15px;';
        if (!seat) {
            nameLabel.innerText = '（空席）';
            nameLabel.style.color = '#7f8c8d';
        } else if (seat.type === 'human') {
            nameLabel.innerText = '👤 ' + (seat.name || 'Player');
            if (i === (window.lobbyMySeat ?? -1)) {
                nameLabel.innerHTML += ' <span style="color:#f1c40f; font-size:12px;">(あなた)</span>';
            }
        } else if (seat.type === 'cpu') {
            const lvl = (seat.cpu_level !== undefined && seat.cpu_level !== null) ? cpuLevelLabel[seat.cpu_level] : '?';
            nameLabel.innerHTML = `🤖 ${seat.name} <span style="color:#3498db; font-size:12px;">(${lvl})</span>`;
        }
        row.appendChild(nameLabel);

        // ホストのみ: CPU 削除ボタン
        if (window.lobbyIsHost && seat && seat.type === 'cpu') {
            const btnRm = document.createElement('button');
            btnRm.innerText = '✕';
            btnRm.style.cssText = 'background:#c0392b; color:white; border:none; border-radius:4px; padding:4px 10px; cursor:pointer; font-size:14px;';
            btnRm.onclick = () => removeCpuFromLobby(i);
            row.appendChild(btnRm);
        }

        list.appendChild(row);
    }

    // 「対局開始」ボタンの有効化（席が全部埋まっていれば押せる）
    const btnStart = document.getElementById('btn-host-start');
    if (btnStart && window.lobbyIsHost) {
        const allFilled = seats.every(s => s !== null);
        if (allFilled) {
            btnStart.style.opacity = '1';
            btnStart.style.pointerEvents = 'auto';
        } else {
            btnStart.style.opacity = '0.5';
            btnStart.style.pointerEvents = 'none';
        }
    }
}

// 🤝 ロビー: CPU 追加（ホスト用）
function addCpuToLobby(level) {
    if (typeof playSE === 'function') playSE('click');
    if (!lobbyWs || lobbyWs.readyState !== WebSocket.OPEN) return;
    lobbyWs.send(JSON.stringify({ type: 'host_add_cpu', cpu_level: level }));
}

// 🤝 ロビー: CPU 削除（ホスト用）
function removeCpuFromLobby(seatIdx) {
    if (typeof playSE === 'function') playSE('click');
    if (!lobbyWs || lobbyWs.readyState !== WebSocket.OPEN) return;
    lobbyWs.send(JSON.stringify({ type: 'host_remove_cpu', seat: seatIdx }));
}

// 🤝 ロビー: 対局開始（ホスト用）
function hostStartGame() {
    if (typeof playSE === 'function') playSE('click');
    if (!lobbyWs || lobbyWs.readyState !== WebSocket.OPEN) return;
    lobbyWs.send(JSON.stringify({ type: 'host_start_game' }));
}

function copyRoomUrl() {
    if (typeof playSE === 'function') playSE('click');
    const url = window.location.origin + window.location.pathname + "?room=" + currentRoomId;

    navigator.clipboard.writeText(url).then(() => {
        alert("招待URLをコピーしました！\n" + url + "\n友達にLINE等で送って招待しましょう。");
    }).catch(err => {
        alert("コピーに失敗しました。手動でURLを共有してください。");
    });
}

// ==========================================
// ★ マウス操作・ショートカット制御 (海底流局スルー対応版)
// ==========================================
document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (typeof confRightClick !== 'undefined' && !confRightClick) return;
    if (typeof isProc !== 'undefined' && isProc) return;

    // 🌟 修正：通常のスキップボタンだけでなく、海底スルー（流局）ボタンも取得対象にする
    const btnSkip = document.getElementById('btn-skip');
    const btnRyukyoku = document.getElementById('btn-ryukyoku');

    // 1. 海底牌をスルーして流局させるボタン（#btn-ryukyoku）が出ていれば最優先でクリック
    if (btnRyukyoku && (btnRyukyoku.style.display === "block" || btnRyukyoku.style.display === "flex")) {
        //console.log("[DEBUG 操作] 右クリックを検知: #btn-ryukyoku をクリックして海底選択をスルー（流局）します。");
        btnRyukyoku.click();
        return;
    }

    // 2. 通常の鳴きスキップボタン（#btn-skip）が出ていればクリック
    if (btnSkip && (btnSkip.style.display === "block" || btnSkip.style.display === "flex")) {
        //console.log("[DEBUG 操作] 右クリックを検知: #btn-skip をクリックしてスルーします。");
        btnSkip.click();
        return;
    }

    // 3. ボタンが出ていない通常のツモ番の時だけツモ切り処理へ
    if (typeof turn !== 'undefined' && turn === 0 && typeof drawnTile !== 'undefined' && drawnTile !== "" && typeof charlestonPhase !== 'undefined' && !charlestonPhase) {
        const msgEl = document.getElementById('msg');
        if (msgEl) {
            const msgText = msgEl.innerText;
            if (msgText === "鳴き" || msgText === "胡！" || msgText === "海底牌" || msgText === "槍槓チャンス") return;
        }
        if (typeof discard === 'function') discard(drawnTile, true, 'drawn');
    }
});

const gameTable = document.querySelector('.table');
if (gameTable) {
    gameTable.addEventListener('dblclick', (e) => {
        if (typeof confDoubleClick !== 'undefined' && !confDoubleClick) return;
        if (e.target !== gameTable && !e.target.classList.contains('river')) return;
        if (typeof isProc !== 'undefined' && isProc) return;

        const btnSkip = document.getElementById('btn-skip');
        const btnRyukyoku = document.getElementById('btn-ryukyoku');

        // 1. 海底牌をスルーして流局させるボタン（#btn-ryukyoku）が出ていれば最優先でクリック
        if (btnRyukyoku && (btnRyukyoku.style.display === "block" || btnRyukyoku.style.display === "flex")) {
            //console.log("[DEBUG 操作] ダブルクリックを検知: #btn-ryukyoku をクリックして海底選択をスルー（流局）します。");
            btnRyukyoku.click();
            window.getSelection().removeAllRanges();
            return;
        }

        // 2. 通常の鳴きスキップボタン（#btn-skip）が出ていればクリック
        if (btnSkip && (btnSkip.style.display === "block" || btnSkip.style.display === "flex")) {
            //console.log("[DEBUG 操作] ダブルクリックを検知: #btn-skip をクリックしてスルーします。");
            btnSkip.click();
            window.getSelection().removeAllRanges();
            return;
        }

        if (typeof turn !== 'undefined' && turn === 0 && typeof drawnTile !== 'undefined' && drawnTile !== "" && typeof charlestonPhase !== 'undefined' && !charlestonPhase) {
            const msgEl = document.getElementById('msg');
            if (msgEl) {
                const msgText = msgEl.innerText;
                if (msgText === "鳴き" || msgText === "胡！" || msgText === "海底牌" || msgText === "槍槓チャンス") return;
            }
            if (typeof discard === 'function') discard(drawnTile, true, 'drawn');
            window.getSelection().removeAllRanges();
        }
    });
}

// ==========================================
// 🍔 サイドバーメニューの開閉とボタン連動
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const sidebarCloseBtn = document.getElementById('sidebar-close-btn');
    const sidebarOverlay = document.getElementById('sidebar-overlay');

    function openSidebar() {
        if (typeof playSE === 'function') playSE('click');
        const ts = document.getElementById('title-screen');
        const ms = document.getElementById('mode-select-screen');
        const exitBtn = document.getElementById('sidebar-exit');
        if (ts && ms && exitBtn) {
            // 🌟 修正：牌譜再生中（isReplayModeがtrue）の場合も、タイトル画面と同様に非表示にする！
            const isReplaying = (typeof isReplayMode !== 'undefined' && isReplayMode);

            if (ts.style.display === 'none' && ms.style.display === 'none' && !isReplaying) {
                // タイトルでもモード選択でもなく、リプレイ中でもない（＝通常の対局中）
                exitBtn.style.display = 'block';
            } else {
                // タイトル画面、モード選択画面、または牌譜再生中のいずれか
                exitBtn.style.setProperty('display', 'none', 'important');
            }
        }
        const menu = document.getElementById('sidebar-menu');
        if (menu) menu.classList.add('open');
        if (sidebarOverlay) sidebarOverlay.classList.add('show');
    }

    function closeSidebar(playClickSound = false) {
        if (playClickSound && typeof playSE === 'function') playSE('click');
        const menu = document.getElementById('sidebar-menu');
        if (menu) menu.classList.remove('open');
        if (sidebarOverlay) sidebarOverlay.classList.remove('show');
    }

    if (hamburgerBtn) hamburgerBtn.addEventListener('click', openSidebar);
    if (sidebarCloseBtn) sidebarCloseBtn.addEventListener('click', () => closeSidebar(true));
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', () => closeSidebar(true));

    document.getElementById('sidebar-settings')?.addEventListener('click', () => {
        closeSidebar(false);
        if (typeof openSettings === 'function') openSettings();
    });

    document.getElementById('sidebar-account')?.addEventListener('click', () => {
        closeSidebar(false);
        if (typeof openAuthModal === 'function') openAuthModal();
    });

    document.getElementById('sidebar-rules')?.addEventListener('click', () => {
        closeSidebar(false);
        if (typeof openHowTo === 'function') openHowTo();
    });

    document.getElementById('sidebar-yaku')?.addEventListener('click', () => {
        closeSidebar(false);
        if (typeof openYakuList === 'function') openYakuList();
    });

    document.getElementById('sidebar-exit')?.addEventListener('click', () => {
        closeSidebar(false);
        if (confirm("本当に対局を中断してホーム画面に戻りますか？\n（進行中のスコアや戦績は保存されません）")) {
            if (typeof playSE === 'function') playSE('click');
            returnToHomeGracefully();
        }
    });
});

// ==========================================
// ★ スタンプ機能制御
// ==========================================
let stampTimers = [null, null, null, null];

function toggleStampMenu() {
    if (typeof playSE === 'function') playSE('click');
    const menu = document.getElementById('stamp-menu');
    if (menu) menu.style.display = (menu.style.display === 'none' || menu.style.display === '') ? 'flex' : 'none';
}

function sendStamp(stampContent) {
    const menu = document.getElementById('stamp-menu');
    if (menu) menu.style.display = 'none';
    showStamp(0, stampContent);
}

function showStamp(playerIdx, content) {
    if (typeof confShowStamps !== 'undefined' && !confShowStamps && playerIdx !== 0) return;

    const el = document.getElementById(`stamp-display-${playerIdx}`);
    if (!el) return;

    el.classList.remove('show');
    void el.offsetWidth;

    el.innerText = content;
    el.classList.add('show');

    if (typeof playSE === 'function') playSE('click');

    if (stampTimers[playerIdx]) clearTimeout(stampTimers[playerIdx]);
    stampTimers[playerIdx] = setTimeout(() => {
        el.classList.remove('show');
    }, 3000);
}

function updateStampVisibility() {
    const btn = document.getElementById('btn-open-stamp');
    const menu = document.getElementById('stamp-menu');
    if (!btn) return;

    const ts = document.getElementById('title-screen');
    const ms = document.getElementById('mode-select-screen');
    const isGameActive = ts && ts.style.display === 'none' && ms && ms.style.display === 'none';

    const modalList = ['settings-modal', 'mypage-modal', 'howto-modal', 'yaku-modal', 'achievement-modal', 'overlay'];
    let noModalsOpen = true;
    modalList.forEach(id => {
        const el = document.getElementById(id);
        if (el && el.style.display === 'flex') noModalsOpen = false;
    });

    if (isGameActive && noModalsOpen) {
        btn.style.display = 'flex';
    } else {
        btn.style.display = 'none';
        if (menu) menu.style.display = 'none';
    }
}

function debugShowAllStamps() {
    for (let i = 1; i <= 3; i++) {
        if (stampTimers[i]) clearTimeout(stampTimers[i]);
        const el = document.getElementById(`stamp-display-${i}`);
        if (el) {
            el.innerText = "😎";
            el.classList.add('show');
        }
    }
    alert("CPUのスタンプを常時表示モードにしました。\n位置調整に利用してください。");
}

// ==========================================
// 📱 スマホ用：フルスクリーン＆横画面強制ロック関数
// ==========================================
async function lockScreen() {
    try {
        let elem = document.documentElement;
        if (elem.requestFullscreen) {
            await elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) {
            await elem.webkitRequestFullscreen();
        }

        if (screen.orientation && screen.orientation.lock) {
            await screen.orientation.lock("landscape");
        }
    } catch (e) {
        //console.log("フルスクリーン/画面ロックがブロックされました:", e);
    }
}

// ==========================================
// 👁️ アクションボタン透過（3Dバグ回避）
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
    const hideArea = document.getElementById('action-hide-area');
    const actionWrapper = document.querySelector('.action-wrapper');
    const gameContainer = document.getElementById('game-container');

    if (hideArea && actionWrapper && gameContainer) {
        if (hideArea.parentNode !== gameContainer) {
            gameContainer.appendChild(hideArea);
        }

        actionWrapper.style.transition = 'opacity 0.2s ease';

        hideArea.addEventListener('mouseenter', () => {
            actionWrapper.style.setProperty('opacity', '0', 'important');
            document.querySelectorAll('.action-layer .btn-act').forEach(btn => {
                btn.style.setProperty('pointer-events', 'none', 'important');
            });
            hideArea.style.background = 'rgba(0, 0, 0, 0.7)';
            hideArea.style.color = '#f1c40f';
            hideArea.style.borderColor = '#f1c40f';
        });

        hideArea.addEventListener('mouseleave', () => {
            actionWrapper.style.removeProperty('opacity');
            document.querySelectorAll('.action-layer .btn-act').forEach(btn => {
                btn.style.removeProperty('pointer-events');
            });
            hideArea.style.background = 'rgba(0, 0, 0, 0.4)';
            hideArea.style.color = '#bdc3c7';
            hideArea.style.borderColor = '#7f8c8d';
        });

        setInterval(() => {
            const visibleBtns = Array.from(document.querySelectorAll('.action-layer .btn-act'))
                .filter(b => b.style.display === 'block' || b.style.display === 'flex');

            if (visibleBtns.length > 0) {
                if (hideArea.style.display === 'none') hideArea.style.display = 'flex';
            } else {
                if (hideArea.style.display !== 'none') {
                    hideArea.style.display = 'none';
                    actionWrapper.style.removeProperty('opacity');
                    document.querySelectorAll('.action-layer .btn-act').forEach(btn => {
                        btn.style.removeProperty('pointer-events');
                    });
                    hideArea.style.background = 'rgba(0, 0, 0, 0.4)';
                    hideArea.style.color = '#bdc3c7';
                    hideArea.style.borderColor = '#7f8c8d';
                }
            }
        }, 200);
    }
});

// ==========================================
// 🔠 中央パネル #msg の文字サイズ自動調整（最大18px・一行収まり）
// ==========================================
(function () {
    const MAX_FONT_SIZE = 18;
    const MIN_FONT_SIZE = 8;
    const TARGET_WIDTH = 126;
    let measureEl = null;

    function getMeasureEl() {
        if (measureEl && document.body.contains(measureEl)) return measureEl;
        measureEl = document.createElement('div');
        measureEl.setAttribute('aria-hidden', 'true');
        measureEl.style.cssText =
            'position:absolute;visibility:hidden;pointer-events:none;' +
            'white-space:nowrap;font-weight:bold;left:-9999px;top:-9999px;';
        document.body.appendChild(measureEl);
        return measureEl;
    }

    function fitMsgFontSize() {
        const msg = document.getElementById('msg');
        if (!msg) return;

        const m = getMeasureEl();
        m.style.fontSize = MAX_FONT_SIZE + 'px';
        m.innerHTML = msg.innerHTML;

        const naturalWidth = m.offsetWidth;
        let size = MAX_FONT_SIZE;
        if (naturalWidth > TARGET_WIDTH && naturalWidth > 0) {
            size = Math.max(MIN_FONT_SIZE, (MAX_FONT_SIZE * TARGET_WIDTH) / naturalWidth);
            size = Math.floor(size * 10) / 10;
        }
        const next = size + 'px';
        if (msg.style.fontSize !== next) {
            msg.style.fontSize = next;
        }
    }

    window.addEventListener('DOMContentLoaded', () => {
        const msg = document.getElementById('msg');
        if (!msg) return;
        fitMsgFontSize();
        const observer = new MutationObserver(fitMsgFontSize);
        observer.observe(msg, { childList: true, characterData: true, subtree: true });
    });
})();

// ==========================================
// ★ オンライン対戦（卓選択）制御
// ==========================================
function startOnlineGame(roomType) {
    if (typeof playSE === 'function') playSE('click');
    let roomName = "";
    if (roomType === "free") roomName = "🎪 フリー卓";
    if (roomType === "standard") roomName = "⚔️ 一般卓";
    if (roomType === "advanced") roomName = "👹 上級卓";
    alert(`${roomName} のマッチング待機画面へ移行します！\n（※バックエンドのマッチング処理は今後実装）`);
}