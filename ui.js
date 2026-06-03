// ==========================================
// 🎨 UI・モーダル画面管理システム (ui.js)
// ==========================================

// 🛠️ 汎用DOM操作ヘルパー関数
const el = (id) => document.getElementById(id);
const show = (id, display = 'block') => { if (el(id)) el(id).style.display = display; };
const hide = (id) => { if (el(id)) el(id).style.display = 'none'; };

// 🛡️ セキュリティ対策：入力された文字列のHTMLタグを無害化する関数
function escapeHTML(str) {
    if (!str) return "";
    return str.replace(/[&<>'"]/g, function (match) {
        const escape = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        };
        return escape[match];
    });
}

// 🌟 すべてのモーダル（別画面）を一旦閉じる共通関数
function closeAllModals() {
    //console.log("[LOG] ▶ closeAllModals が呼ばれました");
    const modals = [
        'settings-modal', 'howto-modal', 'yaku-modal',
        'achievement-modal', 'friend-match-modal', 'learning-modal',
        'online-match-modal', 'rate-help-modal',
        'auth-modal', 'friend-settings-screen'
    ];
    modals.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.style.display = 'none';
    });
}

// 🌟 すべての「全画面」(game-screen) を閉じる共通関数
//   mypage-screen, achievement-screen など、 game-screen クラスを持つ要素を排他制御する
function closeAllScreens(except = null) {
    const screens = ['mypage-screen', 'achievement-screen'];
    screens.forEach(id => {
        if (id === except) return;
        const element = document.getElementById(id);
        if (element) {
            element.classList.remove('screen-active');
            element.style.display = 'none';
        }
    });
}

// 🌟 画面内のスクロール位置を強制リセットし、ログを出す共通関数
function resetScrollAreas(parentId, contextName) {
    const parent = document.getElementById(parentId);
    if (!parent) return;

    // スクロールバーが出うる要素をクラス名やstyle属性から一斉に探し出す
    const scrollAreas = parent.querySelectorAll('.modal-scroll-area, .settings-content, .rate-help-desc, [style*="overflow-y: auto"]');
    scrollAreas.forEach(area => {
        area.scrollTop = 0;
        //console.log(`[DEBUG スクロール初期化] ${contextName} (${parentId}) のスクロール位置を一番上(0)に戻しました。`);
    });
}

function openModal(modalId) {
    closeAllModals();
    show(modalId, 'flex');

    // 🌟 デバッグログ追加：パネルが開いた瞬間のスクロールバーの状態を確認
    const modalEl = document.getElementById(modalId);
    if (modalEl) {
        // 可能性があるクラスを順に探す
        const scrollEl = modalEl.querySelector('.settings-content, .rate-help-box, .learning-content, .modal-scroll-area');
        if (scrollEl) {
            const style = window.getComputedStyle(scrollEl, '::-webkit-scrollbar-thumb');
            console.log(`[DEBUG] パネル '${modalId}' を開きました。現在のthumb背景色: ${style.backgroundColor}`);
        } else {
            console.log(`[DEBUG] パネル '${modalId}' を開きましたが、スクロール領域が見つかりません。`);
        }
    }

    // 🌟 追加：開いた画面のスクロールを一番上に戻す
    resetScrollAreas(modalId, "共通モーダル展開");

    if (typeof playSE === 'function') playSE('click');
}

function closeModal(modalId) {
    hide(modalId);
    if (typeof playSE === 'function') playSE('click');
}

// ==========================================
// 📚 各種モーダル（画面）の個別開閉制御
// ==========================================

function openSettings() {
    openModal('settings-modal');
    // 対局中（CPU戦）のみ「中断してホームに戻る」ボタンを表示
    const titleScreen = el('title-screen');
    const modeSelectScreen = el('mode-select-screen');
    if (titleScreen && titleScreen.style.display === 'none' &&
        modeSelectScreen && modeSelectScreen.style.display === 'none' &&
        typeof currentGameMode !== 'undefined' && currentGameMode === 'cpu') {
        show('btn-settings-quit');
    } else {
        hide('btn-settings-quit');
    }
}
function closeSettings() { closeModal('settings-modal'); }

function openHowTo() {
    openModal('howto-modal');
    // 対局中はチュートリアル開始ボタンを隠す
    const titleScreen = el('title-screen');
    const modeSelectScreen = el('mode-select-screen');
    if (titleScreen && titleScreen.style.display === 'none' &&
        modeSelectScreen && modeSelectScreen.style.display === 'none') {
        hide('btn-start-tutorial');
    } else {
        show('btn-start-tutorial');
    }
}
function closeHowTo() { closeModal('howto-modal'); }

function openYakuList() { openModal('yaku-modal'); }
function closeYakuList() { closeModal('yaku-modal'); }

function openOnlineMatch() {
    openModal('online-match-modal');
    if (typeof playerRatings !== 'undefined') {
        el('online-current-rate').innerText = `R:${playerRatings[0]}`;

        // R1800未満なら上級卓をロック
        const btnAdv = el('btn-room-advanced');
        const lockAdv = el('lock-advanced');
        if (playerRatings[0] >= 1800) {
            btnAdv.style.background = '#8e44ad';
            btnAdv.style.opacity = '1';
            btnAdv.style.cursor = 'pointer';
            btnAdv.disabled = false;
            hide('lock-advanced');
        } else {
            btnAdv.style.background = '#2c3e50';
            btnAdv.style.opacity = '0.6';
            btnAdv.style.cursor = 'not-allowed';
            btnAdv.disabled = true;
            show('lock-advanced');
        }
    }
}
function closeOnlineMatch() { closeModal('online-match-modal'); }

function openFriendMatch() {
    openModal('friend-match-modal');
    show('friend-menu-select');
    hide('friend-menu-waiting');
    if (el('room-id-input')) el('room-id-input').value = "";
}
function closeFriendMatch() {
    closeModal('friend-match-modal');
    // ↓ friend モードへ遷移するときはWSを維持する。それ以外（キャンセル）のみ閉じる
    if (currentGameMode !== 'friend' && typeof lobbyWs !== 'undefined' && lobbyWs) {
        lobbyWs.close();
        lobbyWs = null;
    }
    if (typeof currentRoomId !== 'undefined') currentRoomId = "";
}

function openMyPage() {
    const targetScreen = document.getElementById('mypage-screen');
    if (!targetScreen) return;

    if (typeof closeAllModals === 'function') closeAllModals();
    // 🌟 他の全画面（achievement-screen 等）を閉じて排他制御
    closeAllScreens('mypage-screen');

    if (typeof playerStats !== 'undefined') {
        if (el('input-player-name')) el('input-player-name').value = playerStats.playerName;
        if (typeof updateNameCounter === 'function') updateNameCounter(playerStats.playerName);
        // 🌟 名前変更フォームは一旦廃止。 アカウント名 = ゲーム中ユーザー名 で統一。
        //    （saveNewName 等のロジックは残しているので、 後で戻したい時は再表示するだけで OK）
        hide('mypage-edit-mode');
        show('mypage-view-mode', 'flex');
        if (el('mypage-view-name')) el('mypage-view-name').innerText = playerStats.playerName;
        if (el('mypage-view-rate') && typeof playerRatings !== 'undefined') {
            el('mypage-view-rate').innerText = playerRatings[0];
        }
        if (typeof updateStatsModalUI === 'function') updateStatsModalUI(playerStats);
    }

    // 全画面切替（achievements 画面と同じパターン）
    targetScreen.style.display = 'flex';
    setTimeout(() => {
        targetScreen.classList.add('screen-active');
    }, 10);

    if (typeof playSE === 'function') playSE('click');
}
function closeMyPage() {
    const targetScreen = document.getElementById('mypage-screen');
    if (targetScreen) {
        targetScreen.classList.remove('screen-active');
        if (typeof playSE === 'function') playSE('click');
        setTimeout(() => {
            targetScreen.style.display = 'none';
        }, 300);
    }
}

function openPlayerStats(idx) {
    const targetScreen = document.getElementById('mypage-screen');
    if (!targetScreen) return;

    if (typeof closeAllModals === 'function') closeAllModals();
    // 🌟 他の全画面（achievement-screen 等）を閉じて排他制御
    closeAllScreens('mypage-screen');

    if (typeof playerStats !== 'undefined' && typeof cpuStats !== 'undefined') {
        let targetStats = (idx === 0) ? playerStats : cpuStats[idx];
        hide('mypage-edit-mode');
        show('mypage-view-mode', 'flex');
        if (el('mypage-view-name')) el('mypage-view-name').innerText = targetStats.playerName;
        if (el('mypage-view-rate')) el('mypage-view-rate').innerText = playerRatings[idx];
        if (typeof updateStatsModalUI === 'function') updateStatsModalUI(targetStats);
    }

    targetScreen.style.display = 'flex';
    setTimeout(() => {
        targetScreen.classList.add('screen-active');
    }, 10);

    if (typeof playSE === 'function') playSE('click');
}

// 🌟 実績・役図鑑画面を開く (全画面)
function openAchievements() {
    //console.log("[SCREEN NAV] 🏆 実績・役図鑑画面への遷移を要求されました。");

    const targetScreen = document.getElementById('achievement-screen');
    if (!targetScreen) return;

    if (typeof closeAllModals === 'function') closeAllModals();
    // 🌟 他の全画面（mypage-screen 等）を閉じて排他制御
    closeAllScreens('achievement-screen');
    if (typeof renderAchievements === 'function') renderAchievements();

    // 🌟 1. まず画面を「存在」させる（※この時点ではCSSの設定でまだ透明です）
    targetScreen.style.display = 'flex';

    // 🌟 2. 画面が存在してからスクロールを一番上に戻す！（順番が命です）
    const scrollContainer = document.getElementById('achievement-list-container');
    if (scrollContainer) {
        scrollContainer.scrollTop = 0;
        //console.log(`[DEBUG スクロール初期化] 実績画面のスクロール位置を一番上(0)に戻しました。現在の scrollTop = ${scrollContainer.scrollTop}`);
    }

    // 🌟 3. フワッと表示させるアニメーションを開始
    setTimeout(() => {
        targetScreen.classList.add('screen-active');

        // 戻るボタンが描画されているかのログ確認
        const backBtn = document.getElementById('btn-achieve-back');
        if (backBtn) {
            const computedStyle = window.getComputedStyle(backBtn);
            console.log(`[DEBUG 画面遷移] 戻るボタンの最終的な display 状態: ${computedStyle.display}`);
        }
    }, 10);

    if (typeof playSE === 'function') playSE('click');
}

// 🌟 実績・役図鑑画面を閉じる (全画面)
function closeAchievements() {
    //console.log("[SCREEN NAV] 🏆 実績画面からメニューへ戻る要求を検知。");

    // 🚨 ここを screen に変更
    const targetScreen = document.getElementById('achievement-screen');

    if (targetScreen) {
        targetScreen.classList.remove('screen-active');
        if (typeof playSE === 'function') playSE('click');

        setTimeout(() => {
            targetScreen.style.display = 'none';
        }, 300);
    }
}
function openLearningMenu() {
    openModal('learning-modal');
    const _lkey = (typeof window.getLessonsStorageKey === 'function')
        ? window.getLessonsStorageKey() : 'shiki_mahjong_lessons';
    let savedLessons = JSON.parse(localStorage.getItem(_lkey)) || [];
    for (let i = 1; i <= 9; i++) {
        if (savedLessons[i]) show(`stamp-lesson-${i}`);
        else hide(`stamp-lesson-${i}`);
    }
}
function closeLearningMenu() { closeModal('learning-modal'); }

function openRateHelp() {
    show('rate-help-modal', 'flex');

    // 🌟 デバッグログを追加
    const modalEl = document.getElementById('rate-help-modal');
    if (modalEl) {
        const scrollEl = modalEl.querySelector('.rate-help-box');
        if (scrollEl) {
            const style = window.getComputedStyle(scrollEl, '::-webkit-scrollbar-thumb');
            console.log(`[DEBUG] パネル 'rate-help-modal' を開きました。現在のthumb背景色: ${style.backgroundColor}`);
        }
    }

    // 🌟 追加：レート説明画面のスクロールを一番上に戻す
    resetScrollAreas('rate-help-modal', "レート説明画面");

    if (typeof playSE === 'function') playSE('click');
}
function closeRateHelp() {
    hide('rate-help-modal');
    if (typeof playSE === 'function') playSE('click');
}

// 🌟 牌譜一覧画面を開く
function openReplayList() {
    if (typeof closeAllModals === 'function') closeAllModals();

    // サイドバーが開いていたら閉じる
    const overlay = document.getElementById('sidebar-overlay');
    if (overlay && overlay.classList.contains('show')) {
        document.getElementById('hamburger-btn').click();
    }

    const container = document.getElementById('replay-list-container');
    const _replayKey = (typeof window.getReplaysStorageKey === 'function') ? window.getReplaysStorageKey() : 'shiki_mahjong_replays';
    let savedReplays = JSON.parse(localStorage.getItem(_replayKey)) || [];

    if (savedReplays.length === 0) {
        container.innerHTML = "<p style='text-align:center; color:#aaa; margin-top:50px;'>保存された牌譜がありません。<br>対局を終了してロビーに戻ると自動で保存されます。</p>";
    } else {
        // 新しい対局が上に来るように reverse() して表示
        container.innerHTML = savedReplays.slice().reverse().map(replay => {

            // 🌟 追加：牌譜の最後の瞬間から最終点数を抽出して順位を計算する
            let finalScores = [0, 0, 0, 0];
            if (replay.rounds && replay.rounds.length > 0) {
                let lastRound = replay.rounds[replay.rounds.length - 1];
                if (lastRound.actions && lastRound.actions.length > 0) {
                    // 後ろから遡って「total_scores」を持っているスナップショットを探す
                    for (let i = lastRound.actions.length - 1; i >= 0; i--) {
                        if (lastRound.actions[i].state_snapshot && lastRound.actions[i].state_snapshot.total_scores) {
                            finalScores = lastRound.actions[i].state_snapshot.total_scores;
                            break;
                        }
                    }
                }
            }

            let names = replay.player_names || ["あなた", "CPU 1", "CPU 2", "CPU 3"];
            let players = [0, 1, 2, 3].map(i => ({ name: names[i], score: finalScores[i] }));

            // 🌟 点数で降順（高い順）にソート
            players.sort((a, b) => b.score - a.score);

            // 🌟 順位表のHTMLを構築（2列のグリッドで綺麗に並べる）
            let scoreHtml = `<div style="margin-top: 10px; background: rgba(0,0,0,0.3); padding: 10px 15px; border-radius: 6px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px 20px; font-size: 14px;">`;
            players.forEach((p, rank) => {
                let rankColors = ["#f1c40f", "#bdc3c7", "#cd7f32", "#7f8c8d"]; // 1位:金, 2位:銀, 3位:銅, 4位:鉄
                let rColor = rankColors[rank];
                scoreHtml += `
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 3px;">
                        <span style="color: ${rColor}; font-weight: bold;">${rank + 1}位 ${p.name}</span>
                        <span style="color: #ecf0f1; font-weight: bold;">${p.score} <span style="font-size: 10px; color: #aaa; font-weight: normal;">点</span></span>
                    </div>`;
            });
            scoreHtml += `</div>`;

            // 🌟 UIの構造をリッチに変更（ボタンを右側に縦並びにしてスッキリさせる）
            return `
            <div style="background: rgba(0,0,0,0.5); border: 1px solid #555; padding: 15px; border-radius: 8px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center;">
                <div style="flex-grow: 1; padding-right: 20px;">
                    <div style="color: #3498db; font-weight: bold; margin-bottom: 5px; font-size: 16px;">
                        📅 ${replay.start_time || "日時不明"} 
                        <span style="color: #aaa; font-size: 12px; margin-left: 12px; font-weight: normal; background: #2c3e50; padding: 2px 6px; border-radius: 4px;">全 ${replay.rounds.length} 局</span>
                    </div>
                    ${scoreHtml}
                </div>
                <div style="display: flex; flex-direction: column; gap: 10px; flex-shrink: 0; width: 100px;">
                    <button class="btn-act btn-blue" style="display: block; padding: 10px; font-size: 14px; font-weight: bold;" onclick="startReplay('${replay.id}')">▶ 再生</button>
                    <button class="btn-act" style="display: block; padding: 8px; font-size: 12px; background: #c0392b; color: white; opacity: 0.8;" onclick="deleteReplay('${replay.id}')">🗑️ 削除</button>
                </div>
            </div>
            `;
        }).join('');
    }

    document.getElementById('replay-modal').style.display = 'flex';

    // 🌟 追加：牌譜一覧のスクロールを一番上に戻す
    resetScrollAreas('replay-modal', "牌譜一覧画面");
}

function closeReplayList() {
    document.getElementById('replay-modal').style.display = 'none';
}

// ==========================================
// 📼 牌譜（リプレイ）再生エンジン (完全修正版)
// ==========================================
let isReplayMode = false;
let replayDataObj = null;
let replayRoundIdx = 0;
let replayStepIdx = 0;
let replayAutoInterval = null;
window.charlestonAnimLock = false;
let charlestonPhaseState = 0;
let replayResultPlayerIdx = 0; // 🌟 追加：リザルト画面で現在見ているプレイヤー

// 🌟 統一プレイヤー名表示ヘルパー
// 友人戦・友人戦リプレイ・CPU戦・CPU戦リプレイで正しい名前を返す
function getDisplayPlayerName(idx) {
    // 1. リプレイ中: replayDataObj.player_names を優先
    if (typeof isReplayMode !== 'undefined' && isReplayMode
        && typeof replayDataObj !== 'undefined' && replayDataObj
        && Array.isArray(replayDataObj.player_names)
        && replayDataObj.player_names[idx]) {
        return replayDataObj.player_names[idx];
    }
    // 2. 友人戦中: getFriendPlayerName (相対インデックス)
    if (typeof currentGameMode !== 'undefined' && currentGameMode === 'friend'
        && typeof getFriendPlayerName === 'function') {
        return getFriendPlayerName(idx);
    }
    // 3. CPU戦: 自分=playerStats.playerName、他=CPU N
    return idx === 0 ? (typeof playerStats !== 'undefined' ? playerStats.playerName : "あなた") : `CPU ${idx}`;
}
window.getDisplayPlayerName = getDisplayPlayerName;

window.startReplay = function (id) {
    if (window.cleanupTutorialUI) window.cleanupTutorialUI();

    const _replayKey = (typeof window.getReplaysStorageKey === 'function') ? window.getReplaysStorageKey() : 'shiki_mahjong_replays';
    let savedReplays = JSON.parse(localStorage.getItem(_replayKey)) || [];
    replayDataObj = savedReplays.find(r => r.id === id);
    if (!replayDataObj || !replayDataObj.rounds || replayDataObj.rounds.length === 0) {
        return alert("牌譜データが見つからないか、破損しています。");
    }

    replayDataObj.rounds.forEach(round => {
        if (!round.actions) return;
        let activeGhosts = [];
        round.actions.forEach(act => {
            const state = act.state_snapshot;
            if (!state || !state.discards || !state.last_discard_info) return;

            let isMeld = (act.type === "meld" || act.type === "self_meld" || String(act.type).includes("kan") || act.type === "pon");
            let isRon = (act.type === "win" && String(act.player) !== String(state.last_discard_info.player));

            if (isMeld || isRon) {
                activeGhosts.push({ player: Number(state.last_discard_info.player), tile: state.last_discard_info.tile });
            }

            activeGhosts.forEach(ghost => {
                let discards = state.discards[ghost.player];
                if (discards && discards.length > 0 && discards[discards.length - 1] === ghost.tile) {
                    state.discards[ghost.player] = [...discards];
                    state.discards[ghost.player].pop();
                }
            });
        });
    });

    if (typeof closeReplayList === 'function') closeReplayList();
    isReplayMode = true;
    replayRoundIdx = 0;
    replayStepIdx = 0;
    charlestonPhaseState = 0;
    window.charlestonAnimLock = false;

    const hideList = ['title-screen', 'mode-select-screen', 'settings-screen', 'tutorial-review-container'];
    hideList.forEach(hideId => {
        const el = document.getElementById(hideId);
        if (el) el.style.display = 'none';
    });

    const table = document.querySelector('.table');
    if (table) table.style.opacity = 1;

    const gameContainer = document.getElementById('game-container');
    if (gameContainer) {
        gameContainer.style.display = 'block';
        gameContainer.style.opacity = 1;
    }

    document.querySelectorAll('.action-layer .btn-act').forEach(b => b.style.display = "none");

    const btnWaits = document.getElementById('btn-show-waits');
    const btnAuto = document.getElementById('btn-auto-play');
    if (btnWaits) btnWaits.style.display = 'none';
    if (btnAuto) btnAuto.style.display = 'none';

    const topExitBtn = document.getElementById('quick-exit-btn');
    const menuExitBtn = document.getElementById('sidebar-exit');
    if (topExitBtn) topExitBtn.style.setProperty('display', 'none', 'important');
    if (menuExitBtn) menuExitBtn.style.setProperty('display', 'none', 'important');

    const replayControls = document.getElementById('replay-controls');
    if (replayControls) {
        replayControls.style.display = 'flex';
        replayControls.style.pointerEvents = 'auto';
        replayControls.style.zIndex = '99999';

        replayControls.querySelectorAll('button').forEach(b => {
            b.style.display = 'block';
            b.style.pointerEvents = 'auto';
        });
    }

    applyReplayState();
};

window.applyReplayState = async function () {
    if (window.charlestonAnimLock) return;

    const roundData = replayDataObj.rounds[replayRoundIdx];
    if (!roundData || !roundData.actions || roundData.actions.length === 0) return;

    const maxSteps = roundData.actions.length;
    if (replayStepIdx >= maxSteps) replayStepIdx = maxSteps - 1;
    if (replayStepIdx < 0) replayStepIdx = 0;

    const action = roundData.actions[replayStepIdx];
    if (!action || !action.state_snapshot) return;

    let isCharleston = (action.type === "first" || action.type === "second" || action.type === "charleston");
    let isSkippedCharleston = (action.direction && action.direction.includes("不成立"));

    let stateToRender = action.state_snapshot;
    if (isCharleston && !isSkippedCharleston && charlestonPhaseState === 0) {
        if (replayStepIdx > 0 && roundData.actions[replayStepIdx - 1].state_snapshot) {
            stateToRender = roundData.actions[replayStepIdx - 1].state_snapshot;
        }
    }

    const updateDOM = (stateToRender, compareState, highlightMode) => {
        if (stateToRender.current_round !== undefined) currentRound = stateToRender.current_round;
        if (stateToRender.dealer !== undefined) dealer = stateToRender.dealer;
        if (stateToRender.scores !== undefined) scores = stateToRender.scores;
        if (stateToRender.total_scores !== undefined) totalScores = stateToRender.total_scores;
        if (typeof updateInfoUI === 'function') updateInfoUI();

        for (let i = 0; i < 4; i++) {
            let av = document.getElementById(`avatar-${i}`);
            if (av) {
                if (stateToRender.turn === i) av.classList.add('active-turn');
                else av.classList.remove('active-turn');
            }
        }

        let hideDiscardPlayer = -1;
        let hideDiscardTile = "";
        if (action && stateToRender.last_discard_info && highlightMode !== "outgoing") {
            if (action.type === "meld" || action.type === "self_meld") {
                hideDiscardPlayer = stateToRender.last_discard_info.player;
                hideDiscardTile = stateToRender.last_discard_info.tile;
            } else if (action.type === "win" && action.player !== undefined && action.player !== stateToRender.last_discard_info.player) {
                hideDiscardPlayer = stateToRender.last_discard_info.player;
                hideDiscardTile = stateToRender.last_discard_info.tile;
            }
        }

        for (let i = 0; i < 4; i++) {
            const handDiv = document.getElementById(`hand-${i}`);
            if (handDiv) {
                handDiv.innerHTML = "";
                let hand = stateToRender.all_hands ? [...stateToRender.all_hands[i]] : [];

                // ========================================================
                // 🌟 CPU戦の修正と同じロジック：
                // 理牌（ソート）する「前」に、配列の末尾からツモ牌を抽出する！
                // ========================================================
                let drawnTile = null;
                if (stateToRender.just_drawn === i && stateToRender.last_drawn && stateToRender.last_drawn[i]) {
                    drawnTile = stateToRender.last_drawn[i];

                    // 手牌がツモ牌を含んで14枚（余り2）になっている場合のみ抽出
                    if (hand.length % 3 === 2) {
                        if (hand[hand.length - 1] === drawnTile) {
                            hand.pop();
                        } else {
                            const dIdx = hand.lastIndexOf(drawnTile);
                            if (dIdx !== -1) hand.splice(dIdx, 1);
                        }
                    }

                    // 🌟 追加：「自摸」の文字が出るとき（自摸和了の瞬間）は自摸牌を完全に消去する
                    if (action.type === "win" && stateToRender.just_drawn === i) {
                        //console.log(`[DEBUG 牌譜再生] プレイヤー${i}の「自摸」表示に合わせ、画面から自摸牌を消去しました。`);
                        drawnTile = null;
                    }
                }

                // 🌟 ツモ牌を安全に分離した「後」に理牌（ソート）する
                if (typeof SM !== 'undefined') {
                    hand.sort((a, b) => SM[a] - SM[b]);
                }

                let highlightTiles = [];
                if (action.passed_tiles && action.received_tiles && highlightMode !== "none") {
                    if (highlightMode === "outgoing") highlightTiles = [...(action.passed_tiles[i] || [])];
                    if (highlightMode === "incoming") highlightTiles = [...(action.received_tiles[i] || [])];
                }

                if (i === 1 || i === 2) hand.reverse();

                hand.forEach(t => {
                    let img = document.createElement('img');
                    img.className = 'tile';
                    img.src = `images/${t}.png`;

                    let transformStr = "";
                    if (i === 2) transformStr += "rotate(180deg) ";

                    let hIdx = highlightTiles.indexOf(t);
                    if (hIdx !== -1) {
                        let color = highlightMode === "outgoing" ? "#e74c3c" : "#f1c40f";
                        img.style.boxShadow = `0 0 15px 3px ${color}`;
                        img.style.border = `2px solid ${color}`;
                        img.style.zIndex = "100";
                        img.style.position = "relative";
                        if (i === 0) img.style.top = "-15px";
                        if (i === 1) img.style.left = "-15px";
                        if (i === 2) img.style.top = "15px";
                        if (i === 3) img.style.left = "15px";
                        highlightTiles.splice(hIdx, 1);
                    }

                    if (transformStr.trim() !== "") {
                        img.style.transform = transformStr.trim();
                    }

                    handDiv.appendChild(img);
                });

                if (drawnTile) {
                    let img = document.createElement('img');
                    img.className = 'tile';
                    img.src = `images/${drawnTile}.png`;
                    img.style.position = 'absolute';
                    img.style.margin = '0';

                    if (i === 0) {
                        img.style.left = 'calc(100% + 15px)';
                        img.style.top = '0';
                    } else if (i === 1) {
                        img.style.bottom = 'calc(100% + 10px)';
                        img.style.left = '0';
                    } else if (i === 2) {
                        img.style.right = 'calc(100% + 15px)';
                        img.style.top = '0';
                        img.style.transform = 'rotate(180deg)';
                    } else if (i === 3) {
                        img.style.top = 'calc(100% + 10px)';
                        img.style.left = '0';
                    }
                    handDiv.appendChild(img);
                }
            }

            const meldDiv = document.getElementById(`meld-${i}`);
            if (meldDiv) {
                meldDiv.innerHTML = "";
                const melds = stateToRender.all_melds ? stateToRender.all_melds[i] : [];
                melds.forEach(m => {
                    let mWrap = document.createElement('div');
                    mWrap.className = 'meld-group';

                    // 🌟 修正：インデックス(idx)を取得して、両端の牌を判定する
                    m.tiles.forEach((t, idx) => {
                        let img = document.createElement('img');
                        img.className = 'tile';

                        // 🌟 修正：暗槓かつ、1枚目(idx:0)または4枚目(idx:3)なら画像ファイル名を 'ura' にする
                        let src = (m.type === 'ankan' && (idx === 0 || idx === 3)) ? 'ura' : t;
                        img.src = `images/${src}.png`;

                        // ログを出力して暗槓の描画処理が走ったことを確認
                        if (m.type === 'ankan') {
                            //console.log(`[DEBUG 牌譜再生] プレイヤー${i}の暗槓を描画: ${idx + 1}枚目を ${src}.png に設定しました。`);
                        }

                        mWrap.appendChild(img);
                    });
                    meldDiv.appendChild(mWrap);
                });
            }

            const riverDiv = document.getElementById(`river-${i}`);
            if (riverDiv) {
                riverDiv.innerHTML = "";
                const discards = stateToRender.discards ? stateToRender.discards[i] : [];
                discards.forEach((t, idx) => {
                    if (hideDiscardPlayer === i && idx === discards.length - 1 && hideDiscardTile === t) return;
                    let img = document.createElement('img');
                    img.className = 'tile';
                    img.src = `images/${t}.png`;
                    if (stateToRender.last_discard_info && stateToRender.last_discard_info.player === i && idx === discards.length - 1 && stateToRender.last_discard_info.tile === t) {
                        img.style.boxShadow = "0 0 10px 3px rgba(255, 0, 0, 0.8)";
                    }
                    riverDiv.appendChild(img);
                });
            }

            const winDiv = document.getElementById(`win-zone-${i}`);
            if (winDiv) {
                winDiv.innerHTML = "";
                const winTiles = stateToRender.all_win_tiles ? stateToRender.all_win_tiles[i] : [];
                if (winTiles && winTiles.length > 0) {
                    winDiv.style.display = "flex";
                    winTiles.forEach(t => {
                        let img = document.createElement('img');
                        img.className = 'tile';
                        img.src = `images/${t}.png`;
                        winDiv.appendChild(img);
                    });
                } else {
                    winDiv.style.display = "none";
                }
            }
        }
        const wallCountDiv = document.getElementById('wall-count');
        if (wallCountDiv) wallCountDiv.innerText = `山: ${stateToRender.wall_count}`;
    };

    let msg = document.getElementById('msg');

    // 🌟 リザルト画面を閉じる（局終了時以外）
    if (action.type !== "round_end") {
        document.getElementById('overlay').style.display = 'none';
    }

    if (isCharleston && !isSkippedCharleston) {
        if (charlestonPhaseState === 0) {
            updateDOM(stateToRender, null, "outgoing");
            if (msg) {
                msg.style.display = 'block';
                msg.className = "fade-in";
                let msgText = action.type === "first" ? "第1交換" : "第2交換";
                msg.innerHTML = `${msgText}<br><span style="font-size:14px; color:#f1c40f;">待機中</span>`;
            }
        } else {
            updateDOM(stateToRender, null, "incoming");
            if (msg) {
                let msgText = action.type === "first" ? "第1交換" : "第2交換";
                msg.innerHTML = `${msgText}<br><span style="font-size:14px; color:#2ecc71;">完了</span>`;
            }
        }
    } else {
        updateDOM(stateToRender, null, "none");

        if (msg && action) {
            msg.style.display = 'block';
            msg.className = "fade-in";
            const pIdx = action.player !== undefined ? action.player : action.turn;

            let msgText = "";
            const _nm = (typeof getDisplayPlayerName === 'function') ? getDisplayPlayerName(pIdx) : (pIdx === 0 ? "あなた" : `CPU ${pIdx}`);
            if (isCharleston && isSkippedCharleston) {
                msgText = `第2交換<br><span style="font-size:14px; color:#e74c3c;">不成立</span>`;
            } else if (action.type === "draw" || action.type === "discard") {
                msgText = (pIdx === 0) ? "↓打牌↓" : _nm;
            } else if (action.type === "meld" || action.type === "self_meld") {
                msgText = (pIdx === 0) ? "鳴き" : `${_nm} 鳴き`;
            } else if (action.type === "win") {
                msgText = (pIdx === 0) ? "和了！" : `${_nm} 和了`;
            } else if (action.type === "start") {
                msgText = `配牌`;
            } else if (action.type === "haitei_skip") {
                msgText = (pIdx === 0) ? "海底スルー" : `${_nm} 海底スルー`;
            } else if (action.type === "round_end") {
                msgText = `局終了`;
                // 🌟 局終了ステップに来たらリザルト画面を描画
                if (document.getElementById('overlay').style.display !== "flex") {
                    replayResultPlayerIdx = 0;
                    renderReplayResult(replayResultPlayerIdx);

                    // 🌟 追加：リザルト画面に入ったら自動再生を強制的にストップする
                    if (replayAutoInterval) {
                        clearInterval(replayAutoInterval);
                        replayAutoInterval = null;
                        const btnAuto = document.getElementById('btn-replay-auto');
                        if (btnAuto) {
                            btnAuto.innerText = "自動再生: OFF";
                            btnAuto.style.background = "#273c75";
                        }
                        // 🌟 ご指示通り、原因・挙動がわかるようにログを出力
                        //console.log("[DEBUG 牌譜再生] 局終了ステップに到達したため、自動再生を一時停止しました。");
                    }
                }
            } else {
                msgText = _nm;
            }
            msg.innerHTML = msgText;

            // ========================================================
            // 🌟 修正：カタカナ（カン）や漢字（暗槓）の表記ブレに完全対応！
            // ========================================================
            let callTextStr = "";

            if (action.type === "win") {
                if (stateToRender.just_drawn === pIdx) {
                    callTextStr = "自摸";
                } else {
                    callTextStr = "胡";
                }
            } else if (action.type === "haitei_skip") {
                callTextStr = "過";
            } else if (action.type === "meld" || action.type === "self_meld" || String(action.type).includes("kan") || action.type === "pon") {
                let mType = action.meld_type || action.type;

                if (mType === "meld" || mType === "self_meld") {
                    const melds = stateToRender.all_melds ? stateToRender.all_melds[pIdx] : [];
                    if (melds && melds.length > 0) {
                        mType = melds[melds.length - 1].type;
                    }
                }

                // 🌟 文字列に変換して、カタカナ・漢字・ローマ字の「部分一致」で拾う
                let typeStr = String(mType);

                if (typeStr.includes("pon") || typeStr.includes("ポン") || typeStr.includes("碰")) {
                    callTextStr = "碰";
                } else if (typeStr.includes("flower") || typeStr.includes("花")) {
                    callTextStr = "花槓";
                } else if (typeStr.includes("kan") || typeStr.includes("カン") || typeStr.includes("槓")) {
                    callTextStr = "槓";
                } else {
                    callTextStr = "鳴"; // 万が一不明な場合
                }

                // 原因がわかるようにコンソールにログを出力
                //console.log(`[DEBUG 牌譜再生] アクション判定: 内部タイプ名='${mType}' -> 画面表示='${callTextStr}'`);
            }

            if (callTextStr !== "" && typeof showCallout === 'function') {
                showCallout(pIdx, callTextStr);
            }
            // ========================================================

        }
    }

    const stepText = document.getElementById('replay-step-text');
    if (stepText) {
        // 🌟 修正：画面中央の「第○局」と、下のバーの局数表示がズレないように同期する！
        const actualRoundNum = roundData.round !== undefined ? roundData.round : (replayRoundIdx + 1);
        stepText.innerText = `第${actualRoundNum}局 | Step: ${replayStepIdx + 1} / ${maxSteps}`;
    }
};

// 🌟 新規：リザルト画面の描画関数 (牌譜再生用・カウントアップ演出対応版)
window.renderReplayResult = function (pIdx) {
    const roundData = replayDataObj.rounds[replayRoundIdx];
    if (!roundData || !roundData.results) return;

    const calcData = roundData.results;
    let isWinner = false;
    let winData = null;

    for (let res of (calcData.results || [])) {
        if (res.player === pIdx) {
            isWinner = true;
            winData = res;
            break;
        }
    }

    let diff = (calcData.scores && calcData.scores[pIdx]) !== undefined ? calcData.scores[pIdx] : 0;
    let yakuHtml = "";
    let titleText = "";
    let scoreText = "";

    if (isWinner && winData) {
        const _nmW = (typeof getDisplayPlayerName === 'function') ? getDisplayPlayerName(pIdx) : (pIdx === 0 ? "あなた" : `CPU ${pIdx}`);
        titleText = (pIdx === 0 && !isReplayMode) ? "あなたの和了！" : `${_nmW} の和了！`;
        scoreText = `${winData.total_score} 点`; // 🌟 文字列の組み立ては後でアニメーション関数が上書きします

        let groupedDetails = {};
        for (let detail of (winData.details || [])) {
            let yakuKey = [...(detail.yaku || [])].sort().join(",");
            let groupKey = `${detail.tile}_${yakuKey}`;
            if (!groupedDetails[groupKey]) {
                groupedDetails[groupKey] = { tile: detail.tile, yaku: (detail.yaku || []), score: detail.score || 0, count: 1, total_score: detail.score || 0 };
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

            let countStr = d.count > 1 ? `<span style="color: #ff9ff3; font-weight: bold; margin-left: 5px; font-size: 18px; white-space: nowrap;">×${d.count}枚</span>` : "";
            let scoreDetailStr = d.count > 1 ? `<span style="font-size: 14px; color:#aaa; white-space: nowrap;">(${d.score}点 × ${d.count})</span> <br> <span style="white-space: nowrap;">${d.total_score}点</span>` : `<span style="white-space: nowrap;">${d.score}点</span>`;

            // 🌟 修正：「和了牌」の文字を完全に削除したバージョンで統一
            yakuHtml += `
                <div style="font-size: 20px; display: flex; align-items: center; justify-content: space-between; width: 100%; background: rgba(0,0,0,0.6); padding: 8px 15px; border-radius: 8px; border-left: 5px solid #f39c12; box-sizing: border-box; margin-bottom: 5px;">
                    <div style="display: flex; align-items: center; width: 100px; flex-shrink: 0;">
                        <img src="images/${tile}.png" style="width:28px; height:39px; border-radius: 2px; flex-shrink: 0;">
                        ${countStr}
                    </div>
                    <div style="flex-grow: 1; text-align: center; display: flex; flex-wrap: wrap; justify-content: center; gap: 4px; padding: 0 10px;">
                        ${d.yaku.map(y => `<span class="yaku-tag ${getYakuTierClass(y)}"><span class="zh">${y}</span><span class="ja">${typeof getJaYakuName === 'function' ? getJaYakuName(y) : ''}</span><span class="en">${typeof getEnYakuName === 'function' ? getEnYakuName(y) : ''}</span></span>`).join("")}
                    </div>
                    <div style="color: #2ecc71; font-weight: bold; min-width: 140px; text-align: right; flex-shrink: 0;">
                        ${scoreDetailStr}
                    </div>
                </div>`;
        }
    } else {
        const _nmR = (typeof getDisplayPlayerName === 'function') ? getDisplayPlayerName(pIdx) : (pIdx === 0 ? "あなた" : `CPU ${pIdx}`);
        titleText = (pIdx === 0 && !isReplayMode) ? "あなたの結果" : `${_nmR} の結果`;
        let diffStr = diff > 0 ? `${diff}` : (diff === 0 ? `0` : `${diff}`);
        scoreText = `${diffStr} 点`;

        // 🌟 修正：こちらも同様に条件分岐を完全に削除して「ー」で固定
        let resultLabel = "ー";

        yakuHtml = `
            <div style="font-size: 24px; font-weight: bold; color: #bdc3c7; background: rgba(0,0,0,0.6); padding: 15px 40px; border-radius: 8px; border: 2px solid #555; text-align: center; margin-top: 10px;">
                ${resultLabel}
            </div>`;
    }

    let endAction = roundData.actions[roundData.actions.length - 1];
    let closedHand = endAction.state_snapshot.all_hands[pIdx] || [];
    let melds = endAction.state_snapshot.all_melds[pIdx] || [];
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
    document.getElementById('win-yaku').innerHTML = yakuHtml; // 🌟 修正：アニメーション関数の「前」に役リストをDOMに入れる！
    document.getElementById('win-hand-display').innerHTML = handHtml;

    // 🌟 修正：点数カウントアップのアニメーション関数を呼び出す
    let finalScoreAmount = (isWinner && winData) ? winData.total_score : diff;
    window.animateWinScore(document.getElementById('win-score'), finalScoreAmount, isWinner);

    const controls = document.getElementById('result-controls');
    if (!controls.dataset.originalHtml) {
        controls.dataset.originalHtml = controls.innerHTML;
    }

    controls.style.cssText = "display: block !important;";
    controls.innerHTML = `
        <button id="btn-replay-screenshot" class="btn-act btn-blue" onclick="takeResultScreenshot()">📸 撮影</button>
        <button id="btn-replay-prev" class="btn-act btn-gray" onclick="prevReplayResult()">⏮️ 前へ</button>
        <button id="btn-replay-next" class="btn-act btn-blue" onclick="nextReplayResult()">次へ ⏭️</button>
        <div id="btn-replay-peek" class="btn-act btn-red" style="cursor: help; user-select: none;">盤面を見る</div>
    `;

    document.getElementById('overlay').scrollTop = 0;
    document.getElementById('overlay').style.display = "flex";

    const peekBtn = document.getElementById('btn-replay-peek');
    const overlay = document.getElementById('overlay');
    const replayControls = document.getElementById('replay-controls');

    if (peekBtn) {
        // マウスが乗った時
        peekBtn.onmouseenter = () => {
            //console.log("[DEBUG 盤面プレビュー] ホバー検知: リザルト画面を透過し、牌譜操作パネルを非表示にします。");
            overlay.classList.add('peek-mode');
            if (replayControls) replayControls.classList.add('peek-hidden');
        };
        // マウスが外れた時
        peekBtn.onmouseleave = () => {
            //console.log("[DEBUG 盤面プレビュー] ホバー解除: リザルト画面と牌譜操作パネルの表示を元に戻しました。");
            overlay.classList.remove('peek-mode');
            if (replayControls) replayControls.classList.remove('peek-hidden');
        };
    }
};

// 🌟 新規：リザルト画面で「次へ」を押した時
window.nextReplayResult = function () {
    if (typeof playSE === 'function') playSE('click');
    if (replayResultPlayerIdx < 3) {
        replayResultPlayerIdx++;
        renderReplayResult(replayResultPlayerIdx);
    } else {
        document.getElementById('overlay').style.display = 'none';
        nextReplayStep(); // 4人目を見終わったら次の局へ
    }
};

// 🌟 新規：リザルト画面で「戻る」を押した時
window.prevReplayResult = function () {
    if (typeof playSE === 'function') playSE('click');
    if (replayResultPlayerIdx > 0) {
        replayResultPlayerIdx--;
        renderReplayResult(replayResultPlayerIdx);
    } else {
        document.getElementById('overlay').style.display = 'none';
        prevReplayStep(); // 1人目から戻る時は1つ前のステップへ
    }
};

window.closeReplayResult = function () {
    if (typeof playSE === 'function') playSE('click');
    document.getElementById('overlay').style.display = 'none';
};

window.nextReplayStep = async function () {
    if (!replayDataObj || window.charlestonAnimLock) return;
    const roundData = replayDataObj.rounds[replayRoundIdx];
    const currentAction = roundData.actions[replayStepIdx];

    let isCharleston = (currentAction && (currentAction.type === "first" || currentAction.type === "second" || currentAction.type === "charleston"));
    let isSkippedCharleston = (currentAction && currentAction.direction && currentAction.direction.includes("不成立"));

    if (isCharleston && !isSkippedCharleston && charlestonPhaseState === 0) {
        if (typeof playSE === 'function') playSE('click');
        window.charlestonAnimLock = true;

        let participants = [true, true, true, true];
        if (currentAction.active_players) {
            participants = [false, false, false, false];
            currentAction.active_players.forEach(p => participants[p] = true);
        }

        if (typeof playExchangeAnimation === 'function') {
            await playExchangeAnimation(currentAction.direction, participants).catch(e => { });
        }

        charlestonPhaseState = 1;
        window.charlestonAnimLock = false;
        applyReplayState();
        return;
    }

    charlestonPhaseState = 0;

    if (replayStepIdx < roundData.actions.length - 1) {
        if (typeof playSE === 'function') playSE('click');
        replayStepIdx++;
        applyReplayState();
    } else if (replayRoundIdx < replayDataObj.rounds.length - 1) {
        if (typeof playSE === 'function') playSE('click');
        replayRoundIdx++;
        replayStepIdx = 0;
        applyReplayState();
    }
};

window.prevReplayStep = function () {
    if (!replayDataObj || window.charlestonAnimLock) return;

    if (charlestonPhaseState === 1) {
        if (typeof playSE === 'function') playSE('click');
        charlestonPhaseState = 0;
        applyReplayState();
        return;
    }

    charlestonPhaseState = 0;
    if (replayStepIdx > 0) {
        if (typeof playSE === 'function') playSE('click');
        replayStepIdx--;
        const prevAction = replayDataObj.rounds[replayRoundIdx].actions[replayStepIdx];
        if (prevAction && (prevAction.type === "first" || prevAction.type === "second" || prevAction.type === "charleston")) {
            charlestonPhaseState = 1;
        }
        applyReplayState();
    } else if (replayRoundIdx > 0) {
        if (typeof playSE === 'function') playSE('click');
        replayRoundIdx--;
        replayStepIdx = replayDataObj.rounds[replayRoundIdx].actions.length - 1;
        applyReplayState();
    }
};

window.skipToMyTurn = function () {
    if (!replayDataObj || window.charlestonAnimLock) return;
    if (typeof playSE === 'function') playSE('click');
    charlestonPhaseState = 0;

    let found = false;
    while (replayRoundIdx < replayDataObj.rounds.length) {
        const roundData = replayDataObj.rounds[replayRoundIdx];

        for (let i = replayStepIdx + 1; i < roundData.actions.length; i++) {
            const act = roundData.actions[i];
            if ((act.type === "draw" && (act.player === 0 || act.turn === 0)) ||
                (act.type === "meld" && (act.player === 0 || act.turn === 0)) ||
                (act.type === "self_meld" && (act.player === 0 || act.turn === 0)) ||
                (act.type === "first" || act.type === "second" || act.type === "charleston" || act.type === "start")) {
                replayStepIdx = i;
                found = true;
                break;
            }
        }
        if (found) break;

        if (replayRoundIdx < replayDataObj.rounds.length - 1) {
            replayRoundIdx++;
            replayStepIdx = -1;
        } else {
            replayStepIdx = roundData.actions.length - 1;
            break;
        }
    }
    applyReplayState();
};

window.prevToMyTurn = function () {
    if (!replayDataObj || window.charlestonAnimLock) return;
    if (typeof playSE === 'function') playSE('click');
    charlestonPhaseState = 0;

    let found = false;
    while (replayRoundIdx >= 0) {
        const roundData = replayDataObj.rounds[replayRoundIdx];
        let startIdx = replayStepIdx - 1;

        if (startIdx >= roundData.actions.length) startIdx = roundData.actions.length - 1;

        for (let i = startIdx; i >= 0; i--) {
            const act = roundData.actions[i];
            if ((act.type === "draw" && (act.player === 0 || act.turn === 0)) ||
                (act.type === "meld" && (act.player === 0 || act.turn === 0)) ||
                (act.type === "self_meld" && (act.player === 0 || act.turn === 0)) ||
                (act.type === "first" || act.type === "second" || act.type === "charleston" || act.type === "start")) {
                replayStepIdx = i;
                found = true;
                break;
            }
        }
        if (found) break;

        if (replayRoundIdx > 0) {
            replayRoundIdx--;
            replayStepIdx = replayDataObj.rounds[replayRoundIdx].actions.length;
        } else {
            replayStepIdx = 0;
            break;
        }
    }
    applyReplayState();
};

window.skipToNextRound = function () {
    if (!replayDataObj || window.charlestonAnimLock) return;
    if (typeof playSE === 'function') playSE('click');
    if (replayRoundIdx < replayDataObj.rounds.length - 1) {
        charlestonPhaseState = 0;
        replayRoundIdx++;
        replayStepIdx = 0;
        applyReplayState();
    }
};

window.prevToRoundStart = function () {
    if (!replayDataObj || window.charlestonAnimLock) return;
    if (typeof playSE === 'function') playSE('click');
    charlestonPhaseState = 0;
    if (replayStepIdx > 0) {
        replayStepIdx = 0;
        applyReplayState();
    } else if (replayRoundIdx > 0) {
        replayRoundIdx--;
        replayStepIdx = 0;
        applyReplayState();
    }
};

window.toggleReplayAuto = function () {
    if (typeof playSE === 'function') playSE('click');
    const btn = document.getElementById('btn-replay-auto');
    if (replayAutoInterval) {
        clearInterval(replayAutoInterval);
        replayAutoInterval = null;
        if (btn) {
            btn.innerText = "自動再生: OFF";
            btn.style.background = "#273c75";
        }
    } else {
        if (btn) {
            btn.innerText = "自動再生: ON";
            btn.style.background = "#e74c3c";
        }
        replayAutoInterval = setInterval(() => {
            if (window.charlestonAnimLock) return;
            nextReplayStep();
        }, 1200);
    }
};

window.exitReplay = function () {
    if (typeof playSE === 'function') playSE('click');
    isReplayMode = false;
    if (replayAutoInterval) clearInterval(replayAutoInterval);
    replayAutoInterval = null;
    const replayControls = document.getElementById('replay-controls');
    if (replayControls) replayControls.style.display = 'none';

    const btnAuto = document.getElementById('btn-auto-play');
    if (btnAuto) btnAuto.style.display = 'block';

    // =========================================================
    // 🌟 ここを追加！：隠していた退出ボタンの設定を解除し元に戻す
    const topExitBtn = document.getElementById('quick-exit-btn');
    const menuExitBtn = document.getElementById('sidebar-exit');
    if (topExitBtn) topExitBtn.style.removeProperty('display');
    if (menuExitBtn) menuExitBtn.style.removeProperty('display');
    //console.log("[DEBUG 牌譜退出] 非表示にしていた退出ボタンのスタイルを解除しました。");
    // =========================================================

    // 🌟 リザルト画面のボタンをCPU戦用の元の状態に戻す
    const resultControls = document.getElementById('result-controls');
    if (resultControls && resultControls.dataset.originalHtml) {
        resultControls.innerHTML = resultControls.dataset.originalHtml;
    }

    if (typeof returnToHomeGracefully === 'function') returnToHomeGracefully();
};

window.deleteReplay = function (id) {
    if (typeof playSE === 'function') playSE('click');
    if (confirm("本当にこの牌譜を削除しますか？\n※この操作は取り消せません。")) {
        const _replayKey = (typeof window.getReplaysStorageKey === 'function') ? window.getReplaysStorageKey() : 'shiki_mahjong_replays';
        let savedReplays = JSON.parse(localStorage.getItem(_replayKey)) || [];
        savedReplays = savedReplays.filter(r => r.id !== id);
        // 🛡️ 削除後の保存は容量が減るので失敗しにくいが、 念のため safe wrapper を使う
        if (typeof window.safeLocalStorageSet === 'function') {
            window.safeLocalStorageSet(_replayKey, savedReplays);
        } else {
            try { localStorage.setItem(_replayKey, JSON.stringify(savedReplays)); } catch (e) { console.warn('[REPLAY] delete save失敗:', e); }
        }
        if (typeof isLoggedIn === 'function' && isLoggedIn() && typeof authSave === 'function') authSave();
        openReplayList();
    }
};

setTimeout(() => {
    const hideBtn = document.getElementById('action-hide-area');
    if (hideBtn) {
        const hideActions = () => {
            const actionLayer = document.querySelector('.action-layer');
            const replayControls = document.getElementById('replay-controls');
            if (actionLayer) {
                actionLayer.style.opacity = '0';
                actionLayer.style.pointerEvents = 'none';
            }
            if (replayControls) {
                replayControls.style.opacity = '0';
                replayControls.style.pointerEvents = 'none';
            }
        };
        const showActions = () => {
            const actionLayer = document.querySelector('.action-layer');
            const replayControls = document.getElementById('replay-controls');
            if (actionLayer) {
                actionLayer.style.opacity = '1';
                actionLayer.style.pointerEvents = 'auto';
            }
            if (replayControls) {
                replayControls.style.opacity = '1';
                replayControls.style.pointerEvents = 'auto';
            }
        };
        hideBtn.addEventListener('mouseenter', hideActions);
        hideBtn.addEventListener('mouseleave', showActions);
        hideBtn.addEventListener('touchstart', (e) => {
            e.preventDefault(); hideActions();
        }, { passive: false });
        window.addEventListener('touchend', showActions);
        window.addEventListener('touchcancel', showActions);
    }
}, 1000);

// 🌟 リザルト画面の点数をカウントアップし、到達点数に応じてリアルタイムに色を変化させる関数（待機時間可変・記号排除版）
window.animateWinScore = function (element, targetScore, isWinner) {
    if (!element) return;

    element.className = "res-score";
    element.style.color = "";

    let duration = 1400;
    let startTime = null;

    // 🌟 修正：役リストの表示完了を待たずに即時カウントアップ開始
    let delay = 0;

    let absTargetScore = Math.abs(targetScore);
    let suffix = " 点";

    element.innerText = "0" + suffix;
    element.classList.add('score-tier-0');
    let lastTier = 0;

    function getTier(score) {
        if (!isWinner && targetScore < 0) return -1;
        let absS = Math.abs(score);
        if (absS === 0) return 0;
        if (absS <= 99) return 1;
        if (absS <= 499) return 2;
        if (absS <= 999) return 3;
        return 4;
    }

    function applyTierClass(tier) {
        element.className = "res-score";
        if (tier === -1) element.classList.add('score-tier-minus');
        else if (tier === 0) element.classList.add('score-tier-0');
        else if (tier === 1) element.classList.add('score-tier-1');
        else if (tier === 2) element.classList.add('score-tier-2');
        else if (tier === 3) element.classList.add('score-tier-3');
        else if (tier === 4) element.classList.add('score-tier-4');
    }

    function updateScore(timestamp) {
        if (!startTime) startTime = timestamp;
        let progress = (timestamp - startTime) / duration;
        if (progress > 1) progress = 1;

        let easeInOut = progress < 0.5
            ? 4 * progress * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;

        let currentVal = Math.floor(easeInOut * absTargetScore);

        element.innerText = currentVal + suffix;

        let currentTier = getTier(currentVal);
        if (currentTier !== lastTier) {
            applyTierClass(currentTier);
            lastTier = currentTier;
        }

        if (progress < 1) {
            requestAnimationFrame(updateScore);
        } else {
            element.innerText = absTargetScore + suffix;
            let finalTier = getTier(absTargetScore);
            if (finalTier !== lastTier) {
                applyTierClass(finalTier);
            }
        }
    }

    // 計算された待機時間分だけ待ってから、アニメーションをスタート！
    setTimeout(() => {
        requestAnimationFrame(updateScore);
    }, delay);
};