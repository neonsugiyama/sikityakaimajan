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
window.charlestonAnimLock = false; // 🌟 追加：アニメーション中の連打防止ロック
let charlestonPhaseState = 0; // 🌟 0: 交換前の赤ハイライト, 1: 交換後の黄ハイライト

window.startReplay = function (id) {
    let savedReplays = JSON.parse(localStorage.getItem('shiki_mahjong_replays')) || [];
    replayDataObj = savedReplays.find(r => r.id === id);
    if (!replayDataObj || !replayDataObj.rounds || replayDataObj.rounds.length === 0) {
        return alert("牌譜データが見つからないか、破損しています。");
    }

    // 🌟 【強力パッチ】バックエンドのバグで「プレイヤーが鳴いたのに河に残り続ける」ゴースト牌のデータを全自動で修復する
    replayDataObj.rounds.forEach(round => {
        if (!round.actions) return;
        let activeGhosts = []; // 追跡中のゴースト牌

        round.actions.forEach(act => {
            const state = act.state_snapshot;
            if (!state || !state.discards || !state.last_discard_info) return;

            // アクションが「鳴き」または「ロン」の場合、その対象牌をゴーストとして登録
            let isMeld = (act.type === "meld" || act.type === "self_meld" || String(act.type).includes("kan") || act.type === "pon");
            let isRon = (act.type === "win" && String(act.player) !== String(state.last_discard_info.player));

            if (isMeld || isRon) {
                activeGhosts.push({
                    player: Number(state.last_discard_info.player),
                    tile: state.last_discard_info.tile
                });
            }

            // 登録されたゴースト牌が河の末尾に残っていれば、データから強制的に削除（ポップ）する
            activeGhosts.forEach(ghost => {
                let discards = state.discards[ghost.player];
                if (discards && discards.length > 0 && discards[discards.length - 1] === ghost.tile) {
                    state.discards[ghost.player] = [...discards]; // 過去のステップを壊さないよう参照を切る
                    state.discards[ghost.player].pop(); // 末尾のゴースト牌を抹消！
                }
            });
        });
    });

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
    if (window.charlestonAnimLock) return; // アニメーション中は操作をブロック

    const roundData = replayDataObj.rounds[replayRoundIdx];
    if (!roundData || !roundData.actions || roundData.actions.length === 0) return;

    const maxSteps = roundData.actions.length;
    if (replayStepIdx >= maxSteps) replayStepIdx = maxSteps - 1;
    if (replayStepIdx < 0) replayStepIdx = 0;

    const action = roundData.actions[replayStepIdx];
    if (!action || !action.state_snapshot) return;

    let isCharleston = (action.type === "first" || action.type === "second" || action.type === "charleston");
    let isSkippedCharleston = (action.direction && action.direction.includes("不成立"));

    // 🌟 描画する盤面の状態を決定（状態0の時は1つ前の盤面を借りる）
    let stateToRender = action.state_snapshot;
    if (isCharleston && !isSkippedCharleston && charlestonPhaseState === 0) {
        if (replayStepIdx > 0 && roundData.actions[replayStepIdx - 1].state_snapshot) {
            stateToRender = roundData.actions[replayStepIdx - 1].state_snapshot;
        }
    }

    // 🌟 内部の描画ヘルパー関数（再利用可能）
    const updateDOM = (stateToRender, compareState, highlightMode) => {
        // 局情報の同期
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
        // 🌟 修正: 比較対象を stateToRender に統一
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
                // 🌟 修正: stateData ではなく stateToRender に変更
                let hand = stateToRender.all_hands ? [...stateToRender.all_hands[i]] : [];

                let highlightTiles = [];
                // Pythonから送られた正確な配列を使ってハイライト対象をセット
                if (action.passed_tiles && action.received_tiles && highlightMode !== "none") {
                    if (highlightMode === "outgoing") highlightTiles = [...(action.passed_tiles[i] || [])];
                    if (highlightMode === "incoming") highlightTiles = [...(action.received_tiles[i] || [])];
                }

                let drawnTile = null;
                // 🌟 修正: stateData ではなく stateToRender に変更
                if (stateToRender.just_drawn === i && stateToRender.last_drawn && stateToRender.last_drawn[i]) {
                    const dTile = stateToRender.last_drawn[i];
                    const dIdx = hand.lastIndexOf(dTile);
                    if (dIdx !== -1) {
                        drawnTile = hand.splice(dIdx, 1)[0];
                    }
                }

                if (i === 1 || i === 2) hand.reverse();

                hand.forEach(t => {
                    let img = document.createElement('img');
                    img.className = 'tile';
                    img.src = `images/${t}.png`;

                    let transformStr = "";
                    if (i === 2) transformStr += "rotate(180deg) ";

                    // ハイライト演出
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
                // 🌟 修正: stateData ではなく stateToRender に変更
                const melds = stateToRender.all_melds ? stateToRender.all_melds[i] : [];
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
                // 🌟 修正: stateData ではなく stateToRender に変更
                const discards = stateToRender.discards ? stateToRender.discards[i] : [];
                discards.forEach((t, idx) => {
                    if (hideDiscardPlayer === i && idx === discards.length - 1 && hideDiscardTile === t) return;
                    let img = document.createElement('img');
                    img.className = 'tile';
                    img.src = `images/${t}.png`;
                    // 🌟 修正: stateData ではなく stateToRender に変更
                    if (stateToRender.last_discard_info && stateToRender.last_discard_info.player === i && idx === discards.length - 1 && stateToRender.last_discard_info.tile === t) {
                        img.style.boxShadow = "0 0 10px 3px rgba(255, 0, 0, 0.8)";
                    }
                    riverDiv.appendChild(img);
                });
            }

            const winDiv = document.getElementById(`win-zone-${i}`);
            if (winDiv) {
                winDiv.innerHTML = "";
                // 🌟 修正: stateData ではなく stateToRender に変更
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
        // 🌟 修正: stateData ではなく stateToRender に変更
        if (wallCountDiv) wallCountDiv.innerText = `山: ${stateToRender.wall_count}`;
    };

    // 🌟 描画の実行
    let msg = document.getElementById('msg');

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
            if (isCharleston && isSkippedCharleston) {
                msgText = `第2交換<br><span style="font-size:14px; color:#e74c3c;">不成立</span>`;
            } else if (action.type === "draw" || action.type === "discard") {
                msgText = (pIdx === 0) ? "↓打牌↓" : `CPU ${pIdx}`;
            } else if (action.type === "meld" || action.type === "self_meld") {
                msgText = (pIdx === 0) ? "鳴き" : `CPU ${pIdx} 鳴き`;
            } else if (action.type === "win") {
                msgText = (pIdx === 0) ? "和了！" : `CPU ${pIdx} 和了`;
            } else if (action.type === "start") {
                msgText = `配牌`;
            } else if (action.type === "round_end") {
                msgText = `局終了`;
            } else {
                msgText = `CPU ${pIdx}`;
            }
            msg.innerHTML = msgText;
        }
    }

    const stepText = document.getElementById('replay-step-text');
    if (stepText) stepText.innerText = `第${replayRoundIdx + 1}局 | Step: ${replayStepIdx + 1} / ${maxSteps}`;
};

// 🌟 ボタンが押された時の処理を async にし、アニメーション待機を挟む
window.nextReplayStep = async function () {
    if (!replayDataObj || window.charlestonAnimLock) return;
    const roundData = replayDataObj.rounds[replayRoundIdx];
    const currentAction = roundData.actions[replayStepIdx];

    let isCharleston = (currentAction && (currentAction.type === "first" || currentAction.type === "second" || currentAction.type === "charleston"));
    let isSkippedCharleston = (currentAction && currentAction.direction && currentAction.direction.includes("不成立"));

    // 🌟 チャールストン待機状態（0）なら、アニメーションしてから状態を（1）にする！
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
        return; // ここで止まる（StepIdxは増やさない）
    }

    charlestonPhaseState = 0; // 次のステップへ行く時は必ずリセット

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

    // 交換直後なら、交換前に戻す
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
            charlestonPhaseState = 1; // 戻った先がチャールストンなら、完了状態にする
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
            nextReplayStep(); // 🌟 修正：直接 nextReplayStep を呼ぶことでアニメーションを同期させる
        }, 1200); // 🌟 少し長めに待つ
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

    if (typeof returnToHomeGracefully === 'function') returnToHomeGracefully();
};

window.deleteReplay = function (id) {
    if (typeof playSE === 'function') playSE('click');
    if (confirm("本当にこの牌譜を削除しますか？\n※この操作は取り消せません。")) {
        let savedReplays = JSON.parse(localStorage.getItem('shiki_mahjong_replays')) || [];
        savedReplays = savedReplays.filter(r => r.id !== id);
        localStorage.setItem('shiki_mahjong_replays', JSON.stringify(savedReplays));
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