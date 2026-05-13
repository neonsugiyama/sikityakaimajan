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
    console.log("[LOG] ▶ closeAllModals が呼ばれました");
    const modals = [
        'settings-modal', 'howto-modal', 'yaku-modal', 'mypage-modal',
        'achievement-modal', 'friend-match-modal', 'learning-modal',
        'online-match-modal', 'rate-help-modal'
    ];
    modals.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.style.display = 'none';
    });
}

function openModal(modalId) {
    closeAllModals();
    show(modalId, 'flex');
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
    if (typeof lobbyWs !== 'undefined' && lobbyWs) {
        lobbyWs.close();
        lobbyWs = null;
    }
    if (typeof currentRoomId !== 'undefined') currentRoomId = "";
}

function openMyPage() {
    openModal('mypage-modal');
    if (typeof playerStats !== 'undefined') {
        if (el('input-player-name')) el('input-player-name').value = playerStats.playerName;
        if (typeof updateNameCounter === 'function') updateNameCounter(playerStats.playerName);
        show('mypage-edit-mode', 'flex');
        hide('mypage-view-mode');
        if (typeof updateStatsModalUI === 'function') updateStatsModalUI(playerStats);
    }
}
function closeMyPage() { closeModal('mypage-modal'); }

function openPlayerStats(idx) {
    openModal('mypage-modal');
    if (typeof playerStats !== 'undefined' && typeof cpuStats !== 'undefined') {
        let targetStats = (idx === 0) ? playerStats : cpuStats[idx];
        hide('mypage-edit-mode');
        show('mypage-view-mode', 'flex');
        if (el('mypage-view-name')) el('mypage-view-name').innerText = targetStats.playerName;
        if (el('mypage-view-rate')) el('mypage-view-rate').innerText = playerRatings[idx];
        if (typeof updateStatsModalUI === 'function') updateStatsModalUI(targetStats);
    }
}

function openAchievements() {
    if (typeof renderAchievements === 'function') renderAchievements();
    openModal('achievement-modal');
}
function closeAchievements() { closeModal('achievement-modal'); }

function openLearningMenu() {
    openModal('learning-modal');
    let savedLessons = JSON.parse(localStorage.getItem('shiki_mahjong_lessons')) || [];
    for (let i = 1; i <= 4; i++) {
        if (savedLessons[i]) show(`stamp-lesson-${i}`);
        else hide(`stamp-lesson-${i}`);
    }
}
function closeLearningMenu() { closeModal('learning-modal'); }

function openRateHelp() {
    show('rate-help-modal', 'flex');
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
    let savedReplays = JSON.parse(localStorage.getItem('shiki_mahjong_replays')) || [];

    if (savedReplays.length === 0) {
        container.innerHTML = "<p style='text-align:center; color:#aaa; margin-top:50px;'>保存された牌譜がありません。<br>対局を終了してロビーに戻ると自動で保存されます。</p>";
    } else {
        // 新しい対局が上に来るように reverse() して表示
        container.innerHTML = savedReplays.slice().reverse().map(replay => `
            <div style="background: rgba(0,0,0,0.5); border: 1px solid #555; padding: 15px; border-radius: 8px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="color: #3498db; font-weight: bold; margin-bottom: 5px;">📅 ${replay.start_time || "日時不明"}</div>
                    <div style="color: #ecf0f1; font-size: 14px;">対局者: ${replay.player_names ? replay.player_names.join(" / ") : "不明"}</div>
                    <div style="color: #aaa; font-size: 12px; margin-top: 5px;">収録局数: ${replay.rounds.length}局</div>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button class="btn-act" style="display: block; padding: 8px 15px; font-size: 14px; background: #c0392b; color: white;" onclick="deleteReplay('${replay.id}')">削除 🗑️</button>
                    <button class="btn-act btn-blue" style="display: block; padding: 8px 15px; font-size: 14px;" onclick="startReplay('${replay.id}')">再生 ▶</button>
                </div>
            </div>
        `).join('');
    }

    document.getElementById('replay-modal').style.display = 'flex';
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

window.startReplay = function (id) {
    let savedReplays = JSON.parse(localStorage.getItem('shiki_mahjong_replays')) || [];
    replayDataObj = savedReplays.find(r => r.id === id);
    if (!replayDataObj || !replayDataObj.rounds || replayDataObj.rounds.length === 0) {
        return alert("牌譜データが見つからないか、破損しています。");
    }

    if (typeof closeReplayList === 'function') closeReplayList();
    isReplayMode = true;
    replayRoundIdx = 0;
    replayStepIdx = 0;

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

    // 🌟 不要な「待ち牌確認」「オート」ボタンを非表示にする
    const btnWaits = document.getElementById('btn-show-waits');
    const btnAuto = document.getElementById('btn-auto-play');
    if (btnWaits) btnWaits.style.display = 'none';
    if (btnAuto) btnAuto.style.display = 'none';

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

window.applyReplayState = function () {
    const roundData = replayDataObj.rounds[replayRoundIdx];
    if (!roundData || !roundData.actions || roundData.actions.length === 0) return;

    const maxSteps = roundData.actions.length;
    if (replayStepIdx >= maxSteps) replayStepIdx = maxSteps - 1;
    if (replayStepIdx < 0) replayStepIdx = 0;

    const stepText = document.getElementById('replay-step-text');
    if (stepText) stepText.innerText = `Step: ${replayStepIdx + 1} / ${maxSteps}`;

    const action = roundData.actions[replayStepIdx];

    if (action && action.state_snapshot) {
        const state = action.state_snapshot;

        for (let i = 0; i < 4; i++) {
            let av = document.getElementById(`avatar-${i}`);
            if (av) {
                if (state.turn === i) av.classList.add('active-turn');
                else av.classList.remove('active-turn');
            }
        }

        for (let i = 0; i < 4; i++) {
            const handDiv = document.getElementById(`hand-${i}`);
            if (handDiv) {
                handDiv.innerHTML = "";
                const hand = state.all_hands ? [...state.all_hands[i]] : [];

                // 🌟 ツモ牌を特定して手牌配列から抜き取る
                let drawnTile = null;
                if (state.just_drawn === i && state.last_drawn && state.last_drawn[i]) {
                    const dTile = state.last_drawn[i];
                    const dIdx = hand.indexOf(dTile);
                    if (dIdx !== -1) {
                        drawnTile = hand.splice(dIdx, 1)[0]; // 手牌から1枚だけ除外
                    }
                }

                // ツモ牌以外を描画
                hand.forEach(t => {
                    let img = document.createElement('img');
                    img.className = 'tile';
                    img.src = `images/${t}.png`;
                    handDiv.appendChild(img);
                });

                // 🌟 ツモ牌をマージン（隙間）を空けて描画
                if (drawnTile) {
                    let img = document.createElement('img');
                    img.className = 'tile';
                    img.src = `images/${drawnTile}.png`;
                    if (i === 0) img.style.marginLeft = "15px";
                    else if (i === 1) img.style.marginTop = "15px";
                    else if (i === 2) img.style.marginRight = "15px";
                    else if (i === 3) img.style.marginBottom = "15px";
                    handDiv.appendChild(img);
                }
            }

            const meldDiv = document.getElementById(`meld-${i}`);
            if (meldDiv) {
                meldDiv.innerHTML = "";
                const melds = state.all_melds ? state.all_melds[i] : [];
                melds.forEach(m => {
                    let mWrap = document.createElement('div');
                    mWrap.className = 'meld-group';
                    m.tiles.forEach(t => {
                        let img = document.createElement('img');
                        img.className = 'tile';
                        img.src = `images/${t}.png`;
                        if (m.type === "ankan") img.style.opacity = "0.6";
                        mWrap.appendChild(img);
                    });
                    meldDiv.appendChild(mWrap);
                });
            }

            const riverDiv = document.getElementById(`river-${i}`);
            if (riverDiv) {
                riverDiv.innerHTML = "";
                const discards = state.discards ? state.discards[i] : [];
                discards.forEach((t, idx) => {
                    let img = document.createElement('img');
                    img.className = 'tile';
                    img.src = `images/${t}.png`;
                    if (state.last_discard_info && state.last_discard_info.player === i && idx === discards.length - 1 && state.last_discard_info.tile === t) {
                        img.style.boxShadow = "0 0 10px 3px rgba(255, 0, 0, 0.8)";
                    }
                    riverDiv.appendChild(img);
                });
            }

            const winDiv = document.getElementById(`win-zone-${i}`);
            if (winDiv) {
                winDiv.innerHTML = "";
                const winTiles = state.all_win_tiles ? state.all_win_tiles[i] : [];
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
        if (wallCountDiv) wallCountDiv.innerText = `山: ${state.wall_count}`;
    }

    // 4. メッセージ解説（画面中央にアクションを表示）
    let msg = document.getElementById('msg');
    if (msg && action) {
        msg.style.display = 'block';
        msg.className = "fade-in";
        const pIdx = action.player !== undefined ? action.player : action.turn;

        let msgText = "";
        if (action.type === "draw" || action.type === "discard") {
            msgText = (pIdx === 0) ? "↓打牌↓" : `CPU ${pIdx}`;
        } else if (action.type === "meld" || action.type === "self_meld") {
            msgText = (pIdx === 0) ? "鳴き" : `CPU ${pIdx} 鳴き`;
        } else if (action.type === "win") {
            msgText = (pIdx === 0) ? "和了！" : `CPU ${pIdx} 和了`;
        } else if (action.type === "charleston") {
            msgText = `交換`;
        } else if (action.type === "round_end") {
            msgText = `局終了`;
        } else {
            msgText = `CPU ${pIdx}`;
        }
        msg.innerText = msgText;
    }
};

window.nextReplayStep = function () {
    if (!replayDataObj) return;
    const roundData = replayDataObj.rounds[replayRoundIdx];
    if (replayStepIdx < roundData.actions.length - 1) {
        if (typeof playSE === 'function') playSE('click');
        replayStepIdx++;
        applyReplayState();
    }
};

window.prevReplayStep = function () {
    if (replayStepIdx > 0) {
        if (typeof playSE === 'function') playSE('click');
        replayStepIdx--;
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
            const roundData = replayDataObj.rounds[replayRoundIdx];
            if (replayStepIdx < roundData.actions.length - 1) {
                replayStepIdx++;
                applyReplayState();
            } else {
                toggleReplayAuto();
            }
        }, 800);
    }
};

window.exitReplay = function () {
    if (typeof playSE === 'function') playSE('click');
    isReplayMode = false;
    if (replayAutoInterval) clearInterval(replayAutoInterval);
    replayAutoInterval = null;
    const replayControls = document.getElementById('replay-controls');
    if (replayControls) replayControls.style.display = 'none';
    if (typeof returnToHomeGracefully === 'function') returnToHomeGracefully();
};

// 🌟 牌譜を削除する関数
window.deleteReplay = function (id) {
    if (typeof playSE === 'function') playSE('click');

    // 間違えて押した時のために確認を出す
    if (confirm("本当にこの牌譜を削除しますか？\n※この操作は取り消せません。")) {
        let savedReplays = JSON.parse(localStorage.getItem('shiki_mahjong_replays')) || [];

        // 選択されたID「以外」のデータだけを残す（＝削除）
        savedReplays = savedReplays.filter(r => r.id !== id);

        // ローカルストレージを上書きして保存
        localStorage.setItem('shiki_mahjong_replays', JSON.stringify(savedReplays));

        // リストを再描画して画面を更新
        openReplayList();
    }
};

// ==========================================
// 🌟 アクション＆リプレイボタン透過機能
// ==========================================
setTimeout(() => {
    const hideBtn = document.getElementById('action-hide-area');

    if (hideBtn) {
        const hideActions = () => {
            const actionLayer = document.querySelector('.action-layer');
            const replayControls = document.getElementById('replay-controls');
            // 通常のアクションボタンを隠す
            if (actionLayer) {
                actionLayer.style.opacity = '0';
                actionLayer.style.pointerEvents = 'none';
            }
            // 🌟 リプレイ用のボタンパネルも一緒に隠す
            if (replayControls) {
                replayControls.style.opacity = '0';
                replayControls.style.pointerEvents = 'none';
            }
        };
        const showActions = () => {
            const actionLayer = document.querySelector('.action-layer');
            const replayControls = document.getElementById('replay-controls');
            // 元に戻す
            if (actionLayer) {
                actionLayer.style.opacity = '1';
                actionLayer.style.pointerEvents = 'auto';
            }
            if (replayControls) {
                replayControls.style.opacity = '1';
                replayControls.style.pointerEvents = 'auto';
            }
        };

        // PC向け：マウスを乗せている間隠す
        hideBtn.addEventListener('mouseenter', hideActions);
        hideBtn.addEventListener('mouseleave', showActions);

        // スマホ向け：指で押さえている間隠す
        hideBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            hideActions();
        }, { passive: false });

        window.addEventListener('touchend', showActions);
        window.addEventListener('touchcancel', showActions);
    }
}, 1000);