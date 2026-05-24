// ==========================================
// 🎓 チュートリアル＆レッスン管理システム (tutorial.js)
// ==========================================
let isIngameTutorial = false;

// =========================================================
// 🌟 新規追加：全モード共通の「チュートリアルUI完全お掃除関数」
// =========================================================
window.cleanupTutorialUI = function () {
    // 1. レッスンのポップアップトーストを隠す
    if (window.hideLessonToast) window.hideLessonToast();

    // 2. パネルと暗転膜を完全に非表示にする
    const navPanel = document.getElementById('ingame-tutorial-nav');
    if (navPanel) navPanel.style.display = 'none';

    const reviewPanel = document.getElementById('tutorial-review-container');
    if (reviewPanel) reviewPanel.style.display = 'none';

    const overlay = document.getElementById('tut-dark-overlay');
    if (overlay) overlay.style.display = 'none';

    // 3. 指差し矢印を全削除
    document.querySelectorAll('.tut-dynamic-arrow').forEach(e => {
        clearInterval(e.dataset.animInterval);
        e.remove();
    });

    // 4. ハイライト用のインラインスタイル（Z-indexや光など）を完全消去
    document.querySelectorAll('.tut-highlight').forEach(el => {
        el.classList.remove('tut-highlight');
        el.style.removeProperty('z-index');
        el.style.removeProperty('box-shadow');
        el.style.removeProperty('border-radius');
        if (el.dataset.tutPosModified) {
            el.style.removeProperty('position');
            delete el.dataset.tutPosModified;
        }
        el.style.filter = 'none';
    });

    // 5. 物理的に暗くされていたUIの明るさを元に戻す
    const backgroundUI = [
        'center-info', 'player-name-0', 'player-name-1', 'player-name-2', 'player-name-3',
        'player-score-0', 'player-score-1', 'player-score-2', 'player-score-3',
        'btn-auto-play', 'btn-show-waits', 'charleston-confirm-ui'
    ];
    backgroundUI.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            // 🚨 修正：アニメーションを殺す 'none' の直書きをやめ、CSSに主導権を返す！
            el.style.removeProperty('filter');
            el.style.removeProperty('transition');
        }
    });

    // 🌟 追加：待ち牌ボタンのイベントを「本編の標準動作」に完全リセット！
    const waitsBtn = document.getElementById('btn-show-waits');
    if (waitsBtn) {
        waitsBtn.onclick = () => {
            const wp = document.getElementById('waits-panel');
            if (wp.style.display === 'block') hideWaitsPanel();
            else showWaitsPanel();
        };
    }

    // 6. 退出ボタンの復活
    const topExitBtn = document.getElementById('quick-exit-btn');
    const menuExitBtn = document.getElementById('sidebar-exit');
    if (topExitBtn) topExitBtn.style.removeProperty('display');
    if (menuExitBtn) menuExitBtn.style.removeProperty('display');

    // 7. グローバル変数のリセット
    selectedTileIndex = -1; // 🌟 ここに追加
    isIngameTutorial = false;
    // 🌟 修正：tutorial/lesson から来た時だけ 'cpu' に戻す。friend モードを破壊しないように。
    if (currentGameMode === 'tutorial' || currentGameMode === 'lesson') {
        currentGameMode = 'cpu';
    }
    window.currentLessonId = null;

    // 8. 🌟 追加：グローバルなゲーム状態を強制リセット（ここで前の対局の残骸を消す！）
    currentWaits = [];
    currentNanikiru = null;
    isAlreadyTenpai = false;
    myHand = [];
    myMelds = [];
    myWinTiles = [];

    // 🌟 これを1つ追加（チュートリアルのロック状態も確実に解除）
    if (typeof tutLock !== 'undefined') tutLock = false;

    console.log("[DEBUG] チュートリアルとレッスンのUIを完全にクリーンアップしました。");
};

// 🌟 新規追加：退出ボタンが押された時の処理をここで「1回だけ」確実に登録！
if (!window.tutExitHooked) {
    const originalReturn = window.returnToHomeGracefully;
    window.returnToHomeGracefully = function () {
        selectedTileIndex = -1;
        window.cleanupTutorialUI(); // 退出時にお掃除を自動実行！
        if (originalReturn) originalReturn();
    };
    window.tutExitHooked = true;
}
// =========================================================

// 🎮 実戦形式のチュートリアルを開始する関数
async function startTutorial() {
    closeAllModals();
    playSE('start');

    selectedTileIndex = -1; // 🌟 ここに追加
    window.cleanupTutorialUI();
    currentWaits = [];
    currentNanikiru = null;

    // 🚨 修正1：全モーダル画面のIDを明示的に指定し、チュートリアルパネルよりも確実に手前に来るようZ-indexを固定
    if (!document.getElementById('tut-zindex-fix')) {
        const style = document.createElement('style');
        style.id = 'tut-zindex-fix';
        style.innerHTML = `
            .modal-overlay, #settings-modal, #friend-match-modal, #howto-modal, #yaku-modal, #mypage-modal, #achievement-modal { z-index: 100000 !important; }
            #sidebar-overlay { z-index: 99998 !important; }
            #sidebar-menu { z-index: 99999 !important; }
        `;
        document.head.appendChild(style);
    }

    // 🌟 実際のゲーム画面（雀卓）へ遷移
    document.getElementById('title-screen').style.display = 'none';
    document.getElementById('mode-select-screen').style.display = 'none';
    document.querySelector('.table').style.opacity = 1;
    document.getElementById('game-container').style.opacity = 1;
    document.getElementById('overlay').style.display = 'none';

    isIngameTutorial = true;
    currentGameMode = 'tutorial';

    // 盤面をクリアして初期化
    for (let i = 0; i < 4; i++) {
        document.getElementById(`river-${i}`).innerHTML = "";
        document.getElementById(`meld-${i}`).innerHTML = "";
        document.getElementById(`win-zone-${i}`).innerHTML = "";
        document.getElementById(`win-zone-${i}`).style.display = "none";
    }
    clearCharlestonStatus();
    resetActionBtnPool();
    document.querySelectorAll('.action-layer .btn-act').forEach(b => b.style.display = "none");

    const btnHaitei = document.getElementById('btn-haitei-tsumo');
    const btnRyukyoku = document.getElementById('btn-ryukyoku');
    if (btnHaitei) btnHaitei.style.display = "none";
    if (btnRyukyoku) btnRyukyoku.style.display = "none";

    document.getElementById('msg').innerText = "";

    wallCount = 80;
    currentRound = 1;
    scores = [150, 200, 100, 0];
    totalScores = [150, 200, 100, 0];
    dealer = 1;
    turn = 1;
    updateInfoUI();
    updateWall(wallCount);

    // 🌟 メッセージパネルとボタンの準備
    const navPanel = document.getElementById('ingame-tutorial-nav');
    const navText = document.getElementById('ingame-tutorial-text');
    const nextBtnOld = document.getElementById('ingame-tutorial-next-btn');

    // 🚨 パネルをゲーム全体のコンテナ（#game-container）の直下に移動させます。
    const gameContainer = document.getElementById('game-container');
    if (navPanel.parentNode !== gameContainer) {
        gameContainer.appendChild(navPanel);
    }

    let btnContainer = document.getElementById('tut-btn-container');
    if (!btnContainer) {
        btnContainer = document.createElement('div');
        btnContainer.id = 'tut-btn-container';
        btnContainer.style.display = 'flex';
        btnContainer.style.justifyContent = 'center';
        btnContainer.style.gap = '20px';

        const prevBtn = document.createElement('button');
        prevBtn.id = 'ingame-tutorial-prev-btn';
        prevBtn.className = 'btn-act btn-gray';
        prevBtn.style.cssText = 'display: none; padding: 12px 30px; font-size: 20px; box-shadow: 0 5px #7f8c8d;';
        prevBtn.innerHTML = '◀ 戻る';

        nextBtnOld.parentNode.insertBefore(btnContainer, nextBtnOld);
        btnContainer.appendChild(prevBtn);
        btnContainer.appendChild(nextBtnOld);
    }

    const prevBtn = document.getElementById('ingame-tutorial-prev-btn');
    const nextBtn = document.getElementById('ingame-tutorial-next-btn');

    // 🚨 修正：他のパネルと同じロジックで「卓の傾き」を相殺し、サイズを最適化する
    navPanel.style.setProperty('width', '800px', 'important');
    navPanel.style.setProperty('padding', '20px', 'important');
    navPanel.style.setProperty('z-index', '95000', 'important');
    navPanel.style.top = '55%';
    navPanel.style.left = '50%';
    navPanel.style.transform = 'translate(-50%, -50%)';

    navText.style.setProperty('font-size', '22px', 'important');
    navPanel.style.display = 'block';

    const showMsg = (msg) => { navText.innerHTML = msg; };
    const getImg = (t) => `<img src="images/${t}.png" style="height: 28px; border-radius: 2px; vertical-align: middle;">`;

    // 🌟 暗転＆ハイライト管理システム
    let overlay = document.getElementById('tut-dark-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'tut-dark-overlay';
        document.querySelector('.table').appendChild(overlay);
    }
    overlay.style.cssText = 'display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 85000; pointer-events: none; transition: opacity 0.3s ease; border-radius: inherit;';

    const setOverlay = (enable) => {
        if (overlay) overlay.style.display = enable ? 'block' : 'none';

        const backgroundUI = [
            'center-info', 'player-name-0', 'player-name-1', 'player-name-2', 'player-name-3',
            'player-score-0', 'player-score-1', 'player-score-2', 'player-score-3',
            'btn-auto-play', 'btn-show-waits', 'charleston-confirm-ui'
        ];

        setTimeout(() => {
            backgroundUI.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    if (enable && !el.classList.contains('tut-highlight')) {
                        el.style.filter = 'brightness(0.2)';
                    } else {
                        el.style.removeProperty('filter');
                    }
                    // 🚨 修正：ここでもアニメーション殺しの元凶を削除！
                    el.style.removeProperty('transition');
                }
            });
        }, 10);
    };

    const hlIds = (ids, enable, useGlow = true) => {
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                if (enable) {
                    el.classList.add('tut-highlight');
                    el.style.setProperty('z-index', '90000', 'important');
                    if (useGlow) {
                        el.style.setProperty('box-shadow', '0 0 20px rgba(241, 196, 15, 1)', 'important');
                        el.style.setProperty('border-radius', '8px', 'important');
                    }
                    if (window.getComputedStyle(el).position === 'static') {
                        el.style.setProperty('position', 'relative', 'important');
                        el.dataset.tutPosModified = 'true';
                    }
                    el.style.filter = 'none';
                }
            }
        });
    };

    const clearArrows = () => {
        document.querySelectorAll('.tut-dynamic-arrow').forEach(e => {
            clearInterval(e.dataset.animInterval);
            e.remove();
        });
    };

    const pointArrow = (selector, isOpposite = false) => {
        clearArrows();
        if (!selector) return;
        setTimeout(() => {
            const target = document.querySelector(selector);
            if (target && target.parentElement) {
                const arrow = document.createElement('div');
                arrow.className = 'tut-dynamic-arrow';
                arrow.innerHTML = '👇';
                arrow.style.position = 'absolute';
                arrow.style.fontSize = '40px';
                arrow.style.zIndex = '90000';
                arrow.style.pointerEvents = 'none';
                arrow.style.filter = 'drop-shadow(0px 2px 4px rgba(0,0,0,0.8))';

                if (isOpposite) {
                    arrow.style.transform = 'rotate(180deg)';
                }

                target.parentElement.appendChild(arrow);

                let up = true;
                const baseTop = target.offsetTop + (isOpposite ? target.offsetHeight + 10 : -55);
                arrow.style.left = (target.offsetLeft + (target.offsetWidth / 2) - 30) + 'px';
                arrow.style.top = baseTop + 'px';

                arrow.dataset.animInterval = setInterval(() => {
                    up = !up;
                    arrow.style.top = (baseTop + (up ? 0 : (isOpposite ? 10 : -10))) + 'px';
                }, 500);
            }
        }, 50);
    };

    // ==========================================
    // 🎬 究極の「紙芝居」方式シナリオデータ
    // ==========================================
    let currentTutStep = 0;
    let tutLock = false;

    // 手牌のセーブデータ
    const hand_start = ["1p", "2p", "3p", "4p", "5p", "6p", "7p", "8s", "9s", "1s", "2s", "中", "發"];
    const hand_postEx = ["1p", "2p", "3p", "4p", "5p", "6p", "7p", "8s", "9s", "1s", "東", "1m", "春"];
    const hand_hanakanPre = ["2p", "3p", "4p", "5p", "6p", "7p", "東", "東", "2p", "1s", "5s", "5s", "5s", "春"];
    const hand_hanakanPost = ["2p", "3p", "4p", "5p", "6p", "7p", "東", "東", "2p", "1s"];
    const hand_swapPost = ["2p", "3p", "4p", "5p", "6p", "7p", "東", "東", "2p", "秋"];

    const setupDummyRivers = () => {
        const dummyDiscards = [
            ["白", "發", "中", "8p", "9s"],     // 自分(0)
            ["1m", "1p", "4p", "5p", "6p"],     // 下家(1)
            ["7s", "8s", "9m", "2p", "3s"],     // 対面(2)
            ["3p", "4p", "5s", "6s", "西"]      // 上家(3)
        ];
        for (let i = 0; i < 4; i++) {
            const r = document.getElementById(`river-${i}`);
            if (r) {
                let html = "";
                dummyDiscards[i].forEach(t => {
                    html += `<img class="tile" src="images/${t}.png" style="box-shadow: none; border: none;">`;
                });
                r.innerHTML = html;
            }
        }
    };

    const steps = [
        { // 0: 挨拶
            msg: "ようこそ<span style='color:#f1c40f;'>『四季茶会麻雀』</span>へ！<br>ここでは実際の対局画面を使って、独自の特殊ルールを体験します。",
            setup: () => {
                myHand = [...hand_start]; myMelds = []; myAllMelds = [[], [], [], []]; myWinTiles = [];
            }
        },
        { // 1: 交換説明
            msg: "<span style='color:#3498db; font-size:1.2em; display:inline-block; margin-bottom:8px;'>【STEP 1: 交換フェーズ】</span><br>対局開始時、不要な牌を他家と交換して手牌を整えます。",
            setup: () => {
                myHand = [...hand_start]; myMelds = []; myAllMelds = [[], [], [], []]; myWinTiles = [];
            }
        },
        { // 2: 交換アクション（決定待ち）
            msg: "手牌の中からいらない牌を <span style='color:#f1c40f;'>3枚クリック</span> して選び、<br>画面中央に出現する「📤 決定」ボタンを押してください！",
            hideNext: true,
            setup: () => {
                myHand = [...hand_start]; myMelds = [];
                charlestonPhase = true; charlestonCount = 1; exchangeSelection = [];
                document.getElementById('charleston-ui').style.display = "block";
                document.getElementById('c-title').innerText = "第1交換（換三張）";
                document.getElementById('btn-exchange').style.display = "none";
                setOverlay(true); hlIds(['charleston-ui'], true, true);

                // 🚨 修正前： window.execExchange = async () => {
                // 🌟 修正後： 本編を上書きせず、チュートリアル専用の関数として定義する！
                window.tutExecExchange = async () => {
                    tutLock = true;
                    if (navPanel) navPanel.style.display = 'none';
                    setOverlay(false);
                    let displayHand = [...myHand].sort((a, b) => SM[a] - SM[b]);
                    exchangeSelection.sort((a, b) => b - a).forEach(idx => displayHand.splice(idx, 1));
                    myHand = displayHand; exchangeSelection = [];
                    document.getElementById('charleston-ui').style.display = "none";
                    showCharlestonStatus(0, true);
                    hideCpuTiles = [0, 3, 3, 3];
                    for (let i = 1; i <= 3; i++) showCharlestonStatus(i, true);
                    render(); renderCPU();

                    await playExchangeAnimation("対面(正面)へ", [true, true, true, true]);
                    clearCharlestonStatus(); hideCpuTiles = [0, 0, 0, 0];
                    myHand.push("東", "1m", "春"); render(); renderCPU();

                    tutLock = false;
                    goToStep(3);
                };
            }
        },
        { // 3: 花槓説明
            msg: "素晴らしい！新しい牌が手元に届きました。<br>次は<span style='color:#2ecc71;'>「花槓」</span>を体験しましょう。",
            setup: () => { myHand = [...hand_postEx]; myMelds = []; }
        },
        { // 4: 花槓説明2
            msg: "<span style='color:#2ecc71; font-size:1.2em; display:inline-block; margin-bottom:8px;'>【STEP 2: 花槓（ホァガン）】</span><br>「春」などの四季牌は、<span style='color:#f1c40f;'>万能牌（Joker）</span>として使えます。<br>万能なので槓の素材にも使えます。",
            setup: () => {
                myHand = [...hand_hanakanPre]; myMelds = [];
                setOverlay(true); pointArrow('#hand-0 img[src*="春"]');
            }
        },
        { // 5: 花槓アクション（決定待ち）
            msg: "手牌に「5s」の暗刻と「春」があります。<br>四季牌をくっつけて明槓扱いにできるのが<span style='color:#2ecc71;'>「花槓」</span>です。<br>出現した「花槓」ボタンを押してください。",
            hideNext: true,
            setup: () => {
                myHand = [...hand_hanakanPre]; myMelds = [];
                setOverlay(true);
                setupActionBtn(`花槓 ${getImg('5s')}${getImg('春')}`, 'btn-flower', async () => {
                    tutLock = true;
                    if (navPanel) navPanel.style.display = 'none';
                    setOverlay(false); clearArrows(); playSE('kan_0');
                    document.querySelectorAll('.action-layer .btn-act').forEach(b => b.style.display = "none");
                    showCallout(0, "槓");
                    myHand = [...hand_hanakanPost];
                    myMelds = [{ type: "hanakan", tiles: ["5s", "春", "5s", "5s"] }];
                    render();
                    await sleep(1000);
                    tutLock = false;
                    goToStep(6);
                });
                setTimeout(() => hlIds(['btn-self-0'], true, true), 50);
            }
        },
        { // 6: Swap説明
            msg: "見事<span style='color:#2ecc71;'>「花槓」</span>が決まりました！点数も上がり、進行も有利になります。<br>もちろん花槓せずに万能牌として使っても大丈夫です。<br>次は<span style='color:#9b59b6;'>「Joker Swap」</span>です！",
            setup: () => { myHand = [...hand_hanakanPost]; myMelds = [{ type: "hanakan", tiles: ["5s", "春", "5s", "5s"] }]; myAllMelds[1] = []; }
        },
        { // 7: Swap説明2
            msg: "<span style='color:#9b59b6; font-size:1.2em; display:inline-block; margin-bottom:8px;'>【STEP 3: Joker Swap】</span><br>花槓に使われている牌と<span style='color:#f1c40f;'>同じ牌</span>を持っていれば、<br>四季牌との交換が可能です。",
            setup: () => {
                myHand = [...hand_hanakanPost]; myMelds = [{ type: "hanakan", tiles: ["5s", "春", "5s", "5s"] }];
                myAllMelds[1] = [{ type: "hanakan", tiles: ["1s", "秋", "1s", "1s"], is_hidden: false }];
            }
        },
        { // 8: Swap説明3
            msg: "下家(右)が「1s」と「秋」を使って花槓していますね。<br>あなたの手牌には「1s」があります。",
            setup: () => {
                myHand = [...hand_hanakanPost]; myMelds = [{ type: "hanakan", tiles: ["5s", "春", "5s", "5s"] }];
                myAllMelds[1] = [{ type: "hanakan", tiles: ["1s", "秋", "1s", "1s"], is_hidden: false }];
                setOverlay(true); hlIds(['meld-1'], true, false); pointArrow('#hand-0 img[src*="1s"]');
            }
        },
        { // 9: Swapアクション（決定待ち）
            msg: "「<span style='color:#9b59b6;'>Joker Swap</span>」ボタンを押して、1sを押し付ける代わりに<br>「秋」を強奪しましょう！",
            hideNext: true,
            setup: () => {
                myHand = [...hand_hanakanPost]; myMelds = [{ type: "hanakan", tiles: ["5s", "春", "5s", "5s"] }];
                myAllMelds[1] = [{ type: "hanakan", tiles: ["1s", "秋", "1s", "1s"], is_hidden: false }];

                setupActionBtn(`Joker Swap ${getImg('1s')}`, 'btn-purple', async () => {
                    tutLock = true;
                    if (navPanel) navPanel.style.display = 'none';
                    setOverlay(false); clearArrows();
                    playSE('jokerswap_0'); playSE('jokerswap_se');
                    document.querySelectorAll('.action-layer .btn-act').forEach(b => b.style.display = "none");
                    showCallout(0, "JokerSwap");

                    myHand = [...hand_swapPost];
                    myAllMelds[1][0] = { type: "minkan", tiles: ["1s", "1s", "1s", "1s"], is_hidden: false };
                    render(); renderCPU();
                    await sleep(1000);
                    tutLock = false;
                    goToStep(10);
                });
                setTimeout(() => hlIds(['btn-self-0'], true, true), 50);
            }
        },
        { // 10: 無限継続 説明
            msg: "見事、「秋」を奪い取りました！<br>これで一気に和了（アガリ）に近づきました。",
            setup: () => {
                myHand = [...hand_swapPost]; myMelds = [{ type: "hanakan", tiles: ["5s", "春", "5s", "5s"] }];
                myAllMelds[1] = [{ type: "minkan", tiles: ["1s", "1s", "1s", "1s"], is_hidden: false }];
                currentWaits = []; isAlreadyTenpai = false; hideWaitsPanel();
            }
        },
        { // 11: 胡アクション（決定待ち）
            msg: "<span style='color:#e74c3c; font-size:1.2em; display:inline-block; margin-bottom:8px;'>【STEP 4: 和了後の無限継続】</span><br>聴牌(テンパイ)しました！万能牌のおかげで<span style='color:#f1c40f;'>超多面待ち</span>です！<br>左下の<span style='color:#e67e22;'>「待ち牌確認」</span>で待ち牌をチェックしたら「胡(フー)」ボタンを<br>押してください。",
            hideNext: true,
            setup: () => {
                myHand = [...hand_swapPost];
                myMelds = [{ type: "hanakan", tiles: ["5s", "春", "5s", "5s"] }];
                myAllMelds[1] = [{ type: "minkan", tiles: ["1s", "1s", "1s", "1s"], is_hidden: false }];
                setupDummyRivers(); // 🌟 ダミー牌配置
                currentWaits = ["1p", "2p", "3p", "4p", "5p", "8p", "東"]; isAlreadyTenpai = true;
                lastT = "1p"; lastDiscardPlayer = 2; addR(2, lastT);

                const river2 = document.getElementById('river-2');
                if (river2 && river2.lastChild) {
                    river2.lastChild.id = 'tut-target-discard';
                }

                if (navPanel) {
                    navPanel.style.top = "58%";
                }

                setOverlay(true);

                setupActionBtn(`胡 ${getImg('1p')}`, 'btn-red', async () => {
                    tutLock = true;
                    if (navPanel) navPanel.style.display = 'none';
                    setOverlay(false);
                    clearArrows();

                    document.querySelectorAll('.tut-highlight').forEach(el => {
                        el.classList.remove('tut-highlight');
                        el.style.removeProperty('z-index');
                        el.style.removeProperty('box-shadow');
                        el.style.removeProperty('border-radius');
                        if (el.dataset.tutPosModified) {
                            el.style.removeProperty('position');
                            delete el.dataset.tutPosModified;
                        }
                    });

                    document.querySelectorAll('.action-layer .btn-act').forEach(b => b.style.display = "none");
                    hideWaitsPanel();

                    showCallout(0, "胡");
                    removeLastDiscard();
                    myWinTiles = ["1p"];

                    myAllMelds[1] = [{ type: "minkan", tiles: ["1s", "1s", "1s", "1s"], is_hidden: false }];

                    render(); renderCPU();
                    await sleep(1000);
                    tutLock = false;
                    goToStep(12);
                });

                setTimeout(() => {
                    hlIds(['btn-show-waits', 'btn-self-0'], true, true);
                    if (river2) {
                        river2.style.setProperty('z-index', '90000', 'important');
                        river2.classList.add('tut-highlight');
                    }
                    pointArrow('#tut-target-discard', true);
                }, 50);
            }
        },
        { // 12: 和了後1
            msg: "<span style='color:#e74c3c; font-size:1.2em; display:inline-block; margin-bottom:8px;'>【STEP 4: 和了後の無限継続】</span><br>和了おめでとうございます！<br>通常の麻雀ならここで終了ですが…<br><span style='color:#e74c3c;'>四季茶会麻雀は山札が尽きるまで局が継続します！</span>",
            setup: () => {
                myWinTiles = ["1p"]; removeLastDiscard();
                myAllMelds[1] = [{ type: "minkan", tiles: ["1s", "1s", "1s", "1s"], is_hidden: false }];
                setupDummyRivers();
            }
        },
        { // 13: 和了後2
            msg: "<span style='color:#e74c3c; font-size:1.2em; display:inline-block; margin-bottom:8px;'>【STEP 4: 和了後の無限継続】</span><br>和了ったら和了った分だけ<span style='color:#f1c40f;'>成立した役の点数がどんどん加算</span>されていきます。<br>最高打点を目指して、いざ本編へ！……とその前に、<br>いくつか<span style='color:#3498db;'>便利なUIや機能</span>をご紹介します。",
            setup: () => {
                myWinTiles = ["1p"];
                myAllMelds[1] = [{ type: "minkan", tiles: ["1s", "1s", "1s", "1s"], is_hidden: false }];
                setupDummyRivers();
            }
        },
        { // 14: オート機能
            msg: "<span style='color:#3498db; font-size:1.2em; display:inline-block; margin-bottom:8px;'>【その他の便利機能】</span><br>右下の<span style='color:#2ecc71;'>「オート(和了後)」</span>をONにすると、<br>和了できる時は自動で和了り、それ以外の時はツモ切りするようになります。",
            setup: () => {
                setupDummyRivers();
                setOverlay(true); hlIds(['btn-auto-play'], true, true); myWinTiles = ["1p"];
                myAllMelds[1] = [{ type: "minkan", tiles: ["1s", "1s", "1s", "1s"], is_hidden: false }];
            }
        },
        { // 15: 操作ショートカット
            msg: "<span style='color:#3498db; font-size:1.2em; display:inline-block; margin-bottom:8px;'>【その他の便利機能】</span><br>PCでは<span style='color:#f1c40f;'>右クリック</span>や盤面の<span style='color:#f1c40f;'>ダブルクリック</span>、<br>スマホでは盤面を<span style='color:#f1c40f;'>ダブルタップ</span>することで、<br>引いてきた牌をそのまま捨てる（ツモ切り）ことや、<br>碰(ポン)・槓(ガン)等の鳴き、和了をスルーすることができます！",
            setup: () => {
                setupDummyRivers();
                setOverlay(false); myWinTiles = ["1p"];
                myAllMelds[1] = [{ type: "minkan", tiles: ["1s", "1s", "1s", "1s"], is_hidden: false }];
            }
        },
        { // 16: 点差パネル1
            msg: "<span style='color:#3498db; font-size:1.2em; display:inline-block; margin-bottom:8px;'>【その他の便利機能】</span><br>画面中央には現在の「局」や「山の残り枚数」が表示されています。<br>さらに、各プレイヤーの<span style='color:#3498db;'>「持ち点」部分をクリック</span>すると……",
            setup: () => {
                setupDummyRivers();
                if (navPanel) navPanel.style.top = "26%";
                setOverlay(true);
                hlIds(['center-info', 'player-score-0', 'player-score-1', 'player-score-2', 'player-score-3'], true, false);
                const panel = document.getElementById('score-diff-panel');
                if (panel) panel.style.display = 'none';
                myAllMelds[1] = [{ type: "minkan", tiles: ["1s", "1s", "1s", "1s"], is_hidden: false }];
            }
        },
        { // 17: 点差パネル2
            msg: "<span style='color:#3498db; font-size:1.2em; display:inline-block; margin-bottom:8px;'>【その他の便利機能】</span><br>このように、<span style='color:#f1c40f;'>他プレイヤーとの点差</span>をサッと確認できます！<br>（「持ち点」をもう一度クリックするか、数秒で自然に消えます）",
            setup: () => {
                setupDummyRivers();
                if (navPanel) navPanel.style.top = "26%";
                setOverlay(true);
                hlIds(['center-info', 'player-score-0', 'player-score-1', 'player-score-2', 'player-score-3'], true, false);
                showScoreDiff(0);
                setTimeout(() => hlIds(['score-diff-panel'], true, false), 50);
                myAllMelds[1] = [{ type: "minkan", tiles: ["1s", "1s", "1s", "1s"], is_hidden: false }];
            }
        },
        { // 18: 終了
            msg: "<span style='color:#f1c40f; font-size:1.2em; display:inline-block; margin-bottom:8px;'>【チュートリアル完了】</span><br>説明は以上です！お疲れ様でした。<br>それでは、<span style='color:#f1c40f;'>『四季茶会麻雀』</span>の世界をお楽しみください！",
            setup: () => {
                setupDummyRivers();
                setOverlay(false);
                if (navPanel) navPanel.style.top = "55%";
                myAllMelds[1] = [{ type: "minkan", tiles: ["1s", "1s", "1s", "1s"], is_hidden: false }];
            }
        }
    ];

    // 🌟 ステップ遷移と画面リセットを司るコア関数
    const goToStep = (stepIndex) => {
        if (tutLock || stepIndex < 0 || stepIndex >= steps.length) return;
        currentTutStep = stepIndex;
        const step = steps[stepIndex];

        clearArrows();
        setOverlay(false);
        if (navPanel) navPanel.style.display = 'block';
        document.querySelectorAll('.tut-highlight').forEach(el => {
            el.classList.remove('tut-highlight');
            el.style.removeProperty('z-index');
            el.style.removeProperty('box-shadow');
            el.style.removeProperty('border-radius');
            if (el.dataset.tutPosModified) {
                el.style.removeProperty('position');
                delete el.dataset.tutPosModified;
            }
            el.style.filter = 'none';
        });
        document.querySelectorAll('.action-layer .btn-act').forEach(b => b.style.display = 'none');
        resetActionBtnPool();
        for (let i = 0; i < 4; i++) {
            document.getElementById(`river-${i}`).innerHTML = "";
            document.getElementById(`win-zone-${i}`).innerHTML = "";
            document.getElementById(`win-zone-${i}`).style.display = "none";
        }
        document.getElementById('charleston-ui').style.display = "none";
        hideWaitsPanel();

        const waitsBtn = document.getElementById('btn-show-waits');
        if (waitsBtn) {
            waitsBtn.style.display = 'block';

            if (stepIndex >= 11) {
                currentWaits = ["1p", "2p", "3p", "4p", "5p", "8p", "東"];
                isAlreadyTenpai = true;
                waitsBtn.disabled = false;
                waitsBtn.innerText = "待ち牌確認";

                waitsBtn.onclick = () => {
                    const wp = document.getElementById('waits-panel');
                    if (wp && wp.style.display === 'block') {
                        hideWaitsPanel();
                    } else {
                        showWaitsPanel();
                        if (navPanel && wp) {
                            navPanel.dataset.returnTop = navPanel.style.top;
                            navPanel.style.top = "35%";
                            wp.classList.add('tut-highlight');
                            wp.style.setProperty('z-index', '90000', 'important');
                        }
                    }
                };
            } else {
                waitsBtn.disabled = true;
                waitsBtn.innerText = 'ノーテン';
                waitsBtn.onclick = null;
            }
        }

        const scorePanel = document.getElementById('score-diff-panel');
        if (scorePanel) scorePanel.style.display = 'none';
        if (navPanel) navPanel.style.top = "55%";
        charlestonPhase = false;
        myWinTiles = [];

        hideCpuTiles = [0, 0, 0, 0];
        myAllMelds = [[], [], [], []];

        if (step.setup) step.setup();

        for (let i = 1; i <= 3; i++) {
            let meldCount = myAllMelds[i] ? myAllMelds[i].length : 0;
            myAllHands[i] = new Array(Math.max(0, 13 - (meldCount * 3))).fill("ura");
        }
        render(); renderCPU();

        showMsg(step.msg);
        prevBtn.style.display = (stepIndex > 0) ? 'block' : 'none';
        nextBtn.style.display = step.hideNext ? 'none' : 'block';

        if (stepIndex === steps.length - 1) {
            nextBtn.innerHTML = "終了する";
            nextBtn.onclick = () => {
                playSE('click');
                isIngameTutorial = false;
                navPanel.style.display = "none";
                returnToHomeGracefully();
            };
        } else {
            nextBtn.innerHTML = "次へ ▶";
            nextBtn.onclick = () => { if (!tutLock) { playSE('click'); goToStep(currentTutStep + 1); } };
        }

        prevBtn.onclick = () => { if (!tutLock) { playSE('click'); goToStep(currentTutStep - 1); } };
    };

    goToStep(0);
}

// ==========================================
// 🎓 レッスン紙芝居データ管理用グローバル変数
// ==========================================
let lessonTitle = "";
let lessonIntro = "";
let lessonQuizData = null;
let lessonMission = "";
let currentLessonPage = 0;
let isQuizAnswered = false;

// 🌟 牌の画像を簡単にHTMLに埋め込むためのヘルパー関数
const getTutImg = (t) => `<img src="images/${t}.png" style="height: 40px; border-radius: 3px; box-shadow: 2px 2px 5px rgba(0,0,0,0.6); vertical-align: middle; margin: 0 2px;">`;

// 🎓 各レッスンを開始する関数（紙芝居UIの立ち上げ）
async function startLesson(lessonId) {
    closeAllModals();
    playSE('start');

    selectedTileIndex = -1; // 🌟 ここに追加
    window.cleanupTutorialUI();
    currentWaits = [];
    currentNanikiru = null;

    if (!document.getElementById('tut-zindex-fix')) {
        const style = document.createElement('style');
        style.id = 'tut-zindex-fix';
        style.innerHTML = `
            .modal-overlay, #settings-modal, #friend-match-modal, #howto-modal, #yaku-modal, #mypage-modal, #achievement-modal { z-index: 100000 !important; }
            #sidebar-overlay { z-index: 99998 !important; }
            #sidebar-menu { z-index: 99999 !important; }
            .quiz-option-btn:hover { background: #34495e !important; box-shadow: 0 0 15px rgba(52, 152, 219, 0.8) !important; }
        `;
        document.head.appendChild(style);
    }

    isIngameTutorial = true;
    window.currentLessonId = lessonId;
    isQuizAnswered = false; // クイズの回答状態をリセット

    // 🌟 1. 各レッスンのテキストとクイズデータをセット (画像を埋め込み)
    switch (lessonId) {
        case 1:
            lessonTitle = "レッスン①：斬新で簡単な和了形【全単】";
            lessonIntro = `奇数の牌「1, 3, 5, 7, 9」だけで構成する役です。<br>碰と槓をしていなければどんな形でも奇数の牌全てが和了牌になります！
            <div style="margin-top: 15px; background: rgba(0,0,0,0.5); padding: 15px; border-radius: 8px; text-align: center;">
                <span style="color:#bdc3c7; font-size: 16px;">対象牌一覧：</span><br>
                ${getTutImg('1m')}${getTutImg('9m')}
                ${getTutImg('1p')}${getTutImg('3p')}${getTutImg('5p')}${getTutImg('7p')}${getTutImg('9p')}
                ${getTutImg('1s')}${getTutImg('3s')}${getTutImg('5s')}${getTutImg('7s')}${getTutImg('9s')}
            </div>`;
            lessonQuizData = {
                qText: "Q. 次のうち、全単で【使えない】牌はどれ？",
                options: [
                    { text: "1萬", img: "1m" },
                    { text: "5筒", img: "5p" },
                    { text: "6索", img: "6s" }
                ],
                correctIndex: 2,
                explanation: "6索 は偶数なので全単には使えません。"
            };
            lessonMission = "「全単」で和了！";
            break;

        case 2:
            lessonTitle = "レッスン②：点対称の美学【推不倒】";
            lessonIntro = `「上下逆さまにしても図柄が同じ牌」だけで構成する役です。<br>四季牌を使っても点対称な牌の代わりになっていれば成立します。
            <div style="margin-top: 15px; background: rgba(0,0,0,0.5); padding: 15px; border-radius: 8px; text-align: center;">
                <span style="color:#bdc3c7; font-size: 16px;">対象牌一覧：</span><br>
                ${getTutImg('1p')}${getTutImg('2p')}${getTutImg('3p')}${getTutImg('4p')}${getTutImg('5p')}${getTutImg('8p')}${getTutImg('9p')} <br>
                ${getTutImg('2s')}${getTutImg('4s')}${getTutImg('5s')}${getTutImg('6s')}${getTutImg('8s')}${getTutImg('9s')}${getTutImg('白')}
            </div>`;
            lessonQuizData = {
                qText: "Q. 次のうち「推不倒」で【使える】牌はどれ？",
                options: [
                    { text: "7索", img: "7s" },
                    { text: "6筒", img: "6p" },
                    { text: "4索", img: "4s" }
                ],
                correctIndex: 2,
                explanation: "4索 は点対称ですが、7索と6筒は点対称ではない図柄です。"
            };
            lessonMission = "「推不倒」で和了！";
            break;

        case 3:
            lessonTitle = "レッスン③：狭き門【全大、全中、全小】";
            lessonIntro = `数字の「7, 8, 9」だけで構成すると『全大』が成立します。<br>他にも「1, 2, 3」だけなら『全小』、「4, 5, 6」と「中」だけなら『全中』になります。
            <div style="margin-top: 15px; background: rgba(0,0,0,0.5); padding: 15px; border-radius: 8px; text-align: center;">
                <span style="color:#bdc3c7; font-size: 16px;">全大で使える牌：</span><br>
                ${getTutImg('9m')}${getTutImg('7p')}${getTutImg('8p')}${getTutImg('9p')}${getTutImg('7s')}${getTutImg('8s')}${getTutImg('9s')}
            </div>`;
            lessonQuizData = {
                qText: "Q. 次のうち、「全中」で【使える】牌はどれ？",
                options: [
                    { text: "東", img: "東" },
                    { text: "中", img: "中" },
                    { text: "9萬", img: "9m" }
                ],
                correctIndex: 1,
                explanation: "全中だけは中が使えます。"
            };
            lessonMission = "7から9の数字の牌だけを集めて「全大」で和了！";
            break;

        case 4:
            lessonTitle = "レッスン④：古の手役三連刻【三節高】";
            lessonIntro = `同じ色で「111」「222」「333」のように、数字が1つずつズレた「刻子」を3つ作る役です。<br>さらに、1萬と2筒と3索のように3色で三連刻の場合も三節高になります！
            <div style="margin-top: 15px; background: rgba(0,0,0,0.5); padding: 15px; border-radius: 8px; text-align: center;">
                <span style="color:#bdc3c7; font-size: 16px;">三節高の例</span><br>1色の三節高<br>
                ${getTutImg('2p')}${getTutImg('2p')}${getTutImg('2p')} &nbsp; 
                ${getTutImg('3p')}${getTutImg('3p')}${getTutImg('3p')} &nbsp; 
                ${getTutImg('4p')}${getTutImg('4p')}${getTutImg('4p')} <br>3色の三節高<br>
                ${getTutImg('7s')}${getTutImg('7s')}${getTutImg('7s')} &nbsp; 
                ${getTutImg('8p')}${getTutImg('8p')}${getTutImg('8p')} &nbsp; 
                ${getTutImg('9m')}${getTutImg('9m')}${getTutImg('9m')}                
            </div>`;
            lessonQuizData = {
                qText: "Q. 「2筒」と「3筒」と「3索」が刻子になっているとき、「三節高」に【ならない】刻子はどれ？",
                options: [
                    { text: "1筒", img: "1p" },
                    { text: "1索", img: "1s" },
                    { text: "1萬", img: "1m" }
                ],
                correctIndex: 1,
                explanation: "1筒と4筒は1色、1萬は3色の三節高です。"
            };
            lessonMission = "「三節高」を和了！";
            break;

        case 5:
            lessonTitle = 'レッスン⑤："赤"抜けた手役【断紅胡】';
            lessonIntro = `牌の図柄に「赤」が一切使われていない牌だけで構成する役です。<br>四季牌を使っても赤が使われていない牌の代わりになっていれば成立します。
            <div style="margin-top: 15px; background: rgba(0,0,0,0.5); padding: 15px; border-radius: 8px; text-align: center;">
                <span style="color:#bdc3c7; font-size: 16px;">使える牌一覧：</span><br>
                ${getTutImg('2p')}${getTutImg('4p')}${getTutImg('8p')} &nbsp; 
                ${getTutImg('2s')}${getTutImg('3s')}${getTutImg('4s')}${getTutImg('6s')}${getTutImg('8s')} &nbsp; 
                ${getTutImg('東')}${getTutImg('南')}${getTutImg('西')}${getTutImg('北')}${getTutImg('白')}${getTutImg('發')}
            </div>`;
            lessonQuizData = {
                qText: "Q. 次のうち、「断紅胡」で【使えない】字牌はどれ？",
                options: [
                    { text: "白", img: "白" },
                    { text: "發", img: "發" },
                    { text: "中", img: "中" }
                ],
                correctIndex: 2,
                explanation: "中は真っ赤なのでアウト！"
            };
            lessonMission = "「断紅胡」を和了！";
            break;

        case 6:
            lessonTitle = "レッスン⑥：最強の最終形態【寒江独釣】";
            lessonIntro = `4回副露（ポンやカン等）を行い、手牌を「1枚（裸単騎）」にして和了する役です。<br>鳴けば鳴くほど打点が高くなる、このゲームを象徴する役です。
            <div style="margin-top: 15px; background: rgba(0,0,0,0.5); padding: 15px; border-radius: 8px; text-align: center;">
                <span style="color:#bdc3c7; font-size: 16px;">寒江独釣の特徴：</span><br>
                必ず単騎待ちで、複合できる役も多い！<br><br>
                ${getTutImg('ura')}${getTutImg('1m')}${getTutImg('1m')}${getTutImg('ura')} &nbsp;
                ${getTutImg('3p')}${getTutImg('3p')}${getTutImg('3p')} &nbsp;
                ${getTutImg('4p')}${getTutImg('4p')}${getTutImg('4p')} &nbsp;
                ${getTutImg('5p')}${getTutImg('5p')}${getTutImg('5p')}<br>${getTutImg('3s')}
            </div>`;
            lessonQuizData = {
                qText: "Q. 次のうち、「寒江独釣」の待ち牌で最高形なのはどれ？",
                options: [
                    { text: "四季牌", img: "春" },
                    { text: "1m", img: "1m" },
                    { text: "中", img: "中" }
                ],
                correctIndex: 0,
                explanation: "四季牌単騎で無限待ちは無敵！"
            };
            lessonMission = "手牌を1枚にし、「寒江独釣」を和了！";
            break;

        case 7:
            lessonTitle = "レッスン⑦：対子がいらない唯一の和了【七星不靠】";
            lessonIntro = `字牌7種（東南西北白發中）を1枚ずつと<br>各色で「1」「258」「369」か「147」「258」「9」を組み合わせた特殊な和了形です。
            <div style="margin-top: 15px; background: rgba(0,0,0,0.5); padding: 15px; border-radius: 8px; text-align: center;">
                <span style="color:#bdc3c7; font-size: 16px;">七星不靠の一例：</span><br>
                ${getTutImg('東')}${getTutImg('南')}${getTutImg('西')}${getTutImg('北')}${getTutImg('白')}${getTutImg('發')}${getTutImg('中')} <br><br>
                ${getTutImg('1m')} &nbsp; &nbsp; 
                ${getTutImg('2p')}${getTutImg('5p')}${getTutImg('8p')} &nbsp; &nbsp; 
                ${getTutImg('3s')}${getTutImg('6s')}${getTutImg('9s')}
            </div>`;
            lessonQuizData = {
                qText: "Q. 字牌7種と「1, 4, 7筒」と「2, 5, 8索」があるなら、どれが和了牌になる？",
                options: [
                    { text: "1萬", img: "1m" },
                    { text: "白", img: "白" },
                    { text: "9萬", img: "9m" }
                ],
                correctIndex: 2,
                explanation: "各色で別の筋を集めます。"
            };
            lessonMission = "正しい有効牌を見極めて「七星不靠」を和了！";
            break;

        case 8:
            lessonTitle = "レッスン⑧：面前のロマン役【一色四歩高】";
            lessonIntro = `1色で数字が1つまたは2つずつズレた「順子」を4つ作る役です。<br>刻子が無い和了形になるため副露で揃えられないのが大きな特徴です。
            <div style="margin-top: 15px; background: rgba(0,0,0,0.5); padding: 15px; border-radius: 8px; text-align: center;">
                <span style="color:#bdc3c7; font-size: 16px;">一色四歩高の例</span><br>1つズレの例
                ${getTutImg('2s')}${getTutImg('3s')}${getTutImg('4s')} &nbsp; 
                ${getTutImg('3s')}${getTutImg('4s')}${getTutImg('5s')} &nbsp; 
                ${getTutImg('4s')}${getTutImg('5s')}${getTutImg('6s')} &nbsp; 
                ${getTutImg('5s')}${getTutImg('6s')}${getTutImg('7s')}<br>2つズレの例
                ${getTutImg('1s')}${getTutImg('2s')}${getTutImg('3s')} &nbsp; 
                ${getTutImg('3s')}${getTutImg('4s')}${getTutImg('5s')} &nbsp; 
                ${getTutImg('5s')}${getTutImg('6s')}${getTutImg('7s')} &nbsp; 
                ${getTutImg('7s')}${getTutImg('8s')}${getTutImg('9s')}
            </div>`;
            lessonQuizData = {
                qText: "Q. 筒子が「345」「456」「567」と揃っています。四歩高にするにはどの面子が必要？",
                options: [
                    { text: "234", img: "2p" },
                    { text: "345", img: "3p" },
                    { text: "666", img: "6p" }
                ],
                correctIndex: 0,
                explanation: "今回は1つズレなので一色四歩高のためには「234」か「678」の面子が必要です。"
            };
            lessonMission = "「一色四歩高」を和了！";
            break;

        case 9:
            lessonTitle = "レッスン⑨：乗算の複合【無花果、槓上開花、花天月地】";
            lessonIntro = `手牌の中に四季牌が無い和了「無花果（ウーファーグオ）」は×3。<br>カンをしたときの補充牌で和了「槓上開花（ガンシャンカイホァ）」×2。<br>海底牌での和了「花天月地（ホァティエンユエディ）」×2。<br>これらが複合したときは乗算が重なるので恐ろしくインフレします。
            <div style="margin-top: 15px; background: rgba(0,0,0,0.5); padding: 15px; border-radius: 8px; text-align: center;">
                <span style="color:#bdc3c7; font-size: 16px;">乗算の複合例：</span><br>
                無花果の状態で「槓上開花」で6倍の和了になります！
            </div>`;
            lessonQuizData = {
                qText: "Q. 無花果と槓上開花と花天月地が重なると何倍になる？",
                options: [
                    { text: "8倍", img: "8p" },
                    { text: "12倍", img: "春" },
                    { text: "18倍", img: "冬" }
                ],
                correctIndex: 1,
                explanation: "乗算の最大値はこの3つの役が複合したときで12倍にもなります。"
            };
            lessonMission = "無花果と槓上開花を複合させて和了！";
            break;
    }

    // 🌟 2. サーバー通信で盤面をセットアップ
    let apiScenario = `lesson_${lessonId}`;
    stopTimer();
    isProc = true;

    document.getElementById('title-screen').style.display = 'none';
    document.getElementById('mode-select-screen').style.display = 'none';
    document.querySelector('.table').style.opacity = 1;
    document.getElementById('game-container').style.opacity = 1;
    document.getElementById('overlay').style.display = 'none';
    currentGameMode = 'lesson';

    try {
        if (typeof currentSessionRoomId === 'undefined' || !currentSessionRoomId) {
            await apiCall('/start', { cpu_level: -1 });
        }
        await apiCall('/debug_setup', { scenario: apiScenario });
    } catch (e) {
        console.error("サーバーとの通信エラー:", e);
        try {
            await apiCall('/start', { cpu_level: -1 });
            await apiCall('/debug_setup', { scenario: apiScenario });
        } catch (retryError) {
            alert("通信に失敗しました。画面をリロードしてください。");
            returnToHomeGracefully();
            return;
        }
    }

    // 🌟 3. 盤面表示の初期化
    charlestonPhase = false;
    document.getElementById('charleston-ui').style.display = "none";
    document.getElementById('charleston-confirm-ui').style.display = "none";
    document.querySelectorAll('.action-layer .btn-act').forEach(b => b.style.display = "none");
    for (let i = 0; i < 4; i++) {
        let r = document.getElementById(`river-${i}`); if (r) r.innerHTML = "";
        let m = document.getElementById(`meld-${i}`); if (m) m.innerHTML = "";
        let wz = document.getElementById(`win-zone-${i}`); if (wz) { wz.innerHTML = ""; wz.style.display = "none"; }
    }
    drawnTile = ""; lastDiscardPlayer = -1; justPonged = false;
    pendingIsJokerSwap = false; pendingIsRinshan = false; pendingIsMiaoshou = false;
    hideCpuTiles = [0, 0, 0, 0];
    if (typeof clearCharlestonStatus === 'function') clearCharlestonStatus();

    render(); renderCPU();

    // 🌟 4. 紙芝居パネル（UI）の設定と表示
    const navPanel = document.getElementById('ingame-tutorial-nav');

    // =====================================================================
    // 🚨 追加：レッスン時もパネルの所属をゲーム画面内部（#game-container）へ強制移動！
    // これにより配置基準が麻雀卓と完全に同期し、画面比率を変えても絶対に位置がズレなくなります。
    const gameContainer = document.getElementById('game-container');
    if (navPanel && gameContainer && navPanel.parentNode !== gameContainer) {
        //console.log("[DEBUG レッスンUI調整] 役紹介パネルの配置基準をゲーム卓内部（#game-container）へ同期しました。");
        gameContainer.appendChild(navPanel);
    }
    // =====================================================================

    navPanel.style.setProperty('width', '950px', 'important');
    navPanel.style.setProperty('padding', '25px', 'important');
    navPanel.style.setProperty('z-index', '95000', 'important');
    navPanel.style.top = '50%';
    navPanel.style.left = '50%';
    navPanel.style.transform = 'translate(-50%, -50%)';
    navPanel.style.display = 'block';

    currentLessonPage = 0;
    renderLessonPage();
}

// 📖 紙芝居（スライドショー）のページを描画する関数
function renderLessonPage() {
    const navText = document.getElementById('ingame-tutorial-text');
    const prevBtn = document.getElementById('ingame-tutorial-prev-btn');
    const nextBtn = document.getElementById('ingame-tutorial-next-btn');
    const navPanel = document.getElementById('ingame-tutorial-nav');

    let contentHtml = `<span style='color:#e74c3c; font-size:1.3em; font-weight:bold;'>${lessonTitle}</span><br><br>`;

    if (currentLessonPage === 0) {
        // --- 1ページ目：役の紹介 ---
        // 🌟 修正：見出しの文字サイズを24pxに拡大
        contentHtml += `<div class='learning-box-blue'><div class='learning-box-blue-title' style='font-size: 24px; margin-bottom: 15px;'>📖 役の紹介</div><span style='font-size: 22px; line-height: 1.6;'>${lessonIntro}</span></div>`;
        prevBtn.style.display = "none";
        nextBtn.style.display = "inline-block";
        nextBtn.className = "btn-act btn-blue tut-btn-next";
        nextBtn.innerHTML = "次へ ▶";
        nextBtn.onclick = () => { playSE('click'); currentLessonPage++; renderLessonPage(); };

    } else if (currentLessonPage === 1) {
        // --- 2ページ目：インタラクティブ・ミニクイズ ---
        let quizHtml = `
            <div style="font-size: 22px; font-weight: bold; margin-bottom: 20px; color: white;">${lessonQuizData.qText}</div>
            <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
        `;

        // 選択肢ボタンの生成
        lessonQuizData.options.forEach((opt, idx) => {
            let btnStyle = `background: #2c3e50; border: 2px solid #3498db; border-radius: 10px; padding: 15px; color: white; font-size: 16px; font-weight: bold; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 8px; width: 140px; transition: 0.2s; box-sizing: border-box; outline: none;`;

            // すでに正解している場合は、正解のボタンだけを光らせる
            if (isQuizAnswered) {
                if (idx === lessonQuizData.correctIndex) {
                    btnStyle = `background: rgba(46, 204, 113, 0.3); border: 2px solid #2ecc71; border-radius: 10px; padding: 15px; color: white; font-size: 16px; font-weight: bold; display: flex; flex-direction: column; align-items: center; gap: 8px; width: 140px; box-sizing: border-box; outline: none; transform: scale(1.05);`;
                } else {
                    btnStyle = `background: #2c3e50; border: 2px solid #7f8c8d; border-radius: 10px; padding: 15px; color: white; font-size: 16px; font-weight: bold; display: flex; flex-direction: column; align-items: center; gap: 8px; width: 140px; box-sizing: border-box; outline: none; opacity: 0.5;`;
                }
            }

            quizHtml += `
                <button class="quiz-option-btn" id="quiz-opt-${idx}" onclick="selectQuizOption(${idx})" style="${btnStyle}">
                    <img src="images/${opt.img}.png" style="height: 50px; border-radius: 3px; box-shadow: 2px 2px 5px rgba(0,0,0,0.5);">
                    <span>${opt.text}</span>
                </button>
            `;
        });

        quizHtml += `</div>`;

        // 結果表示用メッセージエリア
        let msgColor = isQuizAnswered ? "#2ecc71" : "transparent";
        let msgText = isQuizAnswered ? `⭕ 正解！<br><span style="font-size: 18px; color: #ecf0f1;">${lessonQuizData.explanation}</span>` : "";
        quizHtml += `<div id="quiz-result-msg" style="margin-top: 25px; font-size: 24px; font-weight: bold; color: ${msgColor}; min-height: 60px; display: flex; align-items: center; justify-content: center; flex-direction: column; line-height: 1.4;">${msgText}</div>`;

        // 🌟 修正：見出しの文字サイズを24pxに拡大
        contentHtml += `<div class='learning-box-red'><div class='learning-box-red-title' style='font-size: 24px; margin-bottom: 15px;'>🧠 ミニクイズ (正解するまで進めません)</div>${quizHtml}</div>`;

        prevBtn.style.display = "inline-block";
        prevBtn.onclick = () => { playSE('click'); currentLessonPage--; renderLessonPage(); };

        // 正解するまでは「次へ」ボタンを隠す
        nextBtn.style.display = isQuizAnswered ? "inline-block" : "none";
        nextBtn.className = "btn-act btn-blue tut-btn-next";
        nextBtn.innerHTML = "次へ ▶";
        nextBtn.onclick = () => { playSE('click'); currentLessonPage++; renderLessonPage(); };

    } else if (currentLessonPage === 2) {
        // --- 3ページ目：ミッション提示＆スタート ---
        contentHtml += `<div style='font-size: 26px; font-weight: bold; color: #f1c40f; margin-top: 20px; line-height: 1.5;'>🏆 ミッション：<br>${lessonMission}</div>`;
        prevBtn.style.display = "inline-block";
        prevBtn.onclick = () => { playSE('click'); currentLessonPage--; renderLessonPage(); };
        nextBtn.style.display = "inline-block";
        nextBtn.className = "btn-act btn-red tut-btn-next";
        nextBtn.innerHTML = "挑戦する！ ⚔️";
        nextBtn.onclick = () => {
            playSE('start');
            navPanel.style.display = 'none';
            document.getElementById('tutorial-review-container').style.display = "block";

            // 🌟 ここに仕込む！
            // 各メッセージの「shown（表示済み）」状態をリセットしてからスタート
            if (LESSON_MESSAGES[window.currentLessonId]) {
                LESSON_MESSAGES[window.currentLessonId].forEach(m => m.shown = false);
            }
            checkLessonMessage('start');

            isProc = false;
            checkT();
        };
    }

    navText.innerHTML = contentHtml;
}

// 🎯 クイズの選択肢をクリックした時の正誤判定処理
function selectQuizOption(idx) {
    if (isQuizAnswered) return; // 既に正解済みなら何もしない

    const resultMsg = document.getElementById('quiz-result-msg');

    // 一旦すべてのボタンをリセット
    for (let i = 0; i < lessonQuizData.options.length; i++) {
        let btn = document.getElementById(`quiz-opt-${i}`);
        if (btn) {
            btn.style.borderColor = "#7f8c8d";
            btn.style.opacity = "0.5";
            btn.style.transform = "none";
        }
    }

    const selectedBtn = document.getElementById(`quiz-opt-${idx}`);

    if (idx === lessonQuizData.correctIndex) {
        // ⭕ 正解の処理
        playSE('yaku');
        selectedBtn.style.borderColor = "#2ecc71";
        selectedBtn.style.background = "rgba(46, 204, 113, 0.3)";
        selectedBtn.style.opacity = "1";
        selectedBtn.style.transform = "scale(1.05)";

        resultMsg.style.color = "#2ecc71";
        resultMsg.innerHTML = `⭕ 正解！<br><span style="font-size: 18px; color: #ecf0f1;">${lessonQuizData.explanation}</span>`;

        isQuizAnswered = true;

        // 「次へ」ボタンを出現させる
        const nextBtn = document.getElementById('ingame-tutorial-next-btn');
        nextBtn.style.display = "inline-block";
        // ボタンが出現したことを強調するアニメーション
        nextBtn.animate([{ transform: 'scale(0.8)' }, { transform: 'scale(1.1)' }, { transform: 'scale(1)' }], { duration: 300 });

    } else {
        // ❌ 不正解の処理
        playSE('alert');
        selectedBtn.style.borderColor = "#e74c3c";
        selectedBtn.style.background = "rgba(231, 76, 60, 0.3)";
        selectedBtn.style.opacity = "1";

        // ブルブル震えるアニメーション
        selectedBtn.animate([
            { transform: 'translateX(0)' }, { transform: 'translateX(-5px)' },
            { transform: 'translateX(5px)' }, { transform: 'translateX(-5px)' },
            { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }
        ], { duration: 300 });

        resultMsg.style.color = "#e74c3c";
        resultMsg.innerHTML = "❌ ざんねん！もう一度考えてみよう。";

        // 1秒後に元に戻して再選択可能にする
        setTimeout(() => {
            if (isQuizAnswered) return;
            for (let i = 0; i < lessonQuizData.options.length; i++) {
                let btn = document.getElementById(`quiz-opt-${i}`);
                if (btn) {
                    btn.style.borderColor = "#3498db";
                    btn.style.background = "#2c3e50";
                    btn.style.opacity = "1";
                }
            }
            resultMsg.innerHTML = "";
        }, 1200);
    }
}

// 💡 プレイ中にチュートリアル・レッスンのメッセージを再表示する関数
function reviewTutorial() {
    playSE('click');
    const navPanel = document.getElementById('ingame-tutorial-nav');
    const navText = document.getElementById('ingame-tutorial-text');
    const prevBtn = document.getElementById('ingame-tutorial-prev-btn');
    const nextBtn = document.getElementById('ingame-tutorial-next-btn');

    navPanel.style.top = '50%';
    navPanel.style.left = '50%';
    navPanel.style.transform = 'translate(-50%, -50%)';
    if (navPanel.dataset) navPanel.dataset.returnTop = "";

    if (window.currentLessonId) {
        // 🌟 レッスンの再確認（役の紹介 ＋ ミッションを1つのパネルで合体表示）
        let contentHtml = `
            <span style='color:#e74c3c; font-size:1.3em; font-weight:bold;'>${lessonTitle}</span><br><br>
            <div class='learning-box-blue'>
                <div class='learning-box-blue-title' style='font-size: 24px; margin-bottom: 15px;'>📖 役の紹介</div>
                <span style='font-size: 20px; line-height: 1.5;'>${lessonIntro}</span>
            </div>
            <div style='font-size: 24px; font-weight: bold; color: #f1c40f; margin-top: 20px; line-height: 1.5;'>
                🏆 ミッション：<br>${lessonMission}
            </div>
        `;
        navText.innerHTML = contentHtml;
        prevBtn.style.display = "none";

        nextBtn.style.display = "inline-block";
        nextBtn.className = "btn-act btn-gray tut-btn-next";
        nextBtn.innerHTML = "閉じる";
        nextBtn.onclick = () => {
            playSE('click');
            navPanel.style.display = 'none';
        };
        navPanel.style.display = 'block';
    } else {
        navText.innerHTML = "チュートリアルの進行状況を確認します...";
        prevBtn.style.display = "none";
        nextBtn.style.display = "inline-block";
        nextBtn.className = "btn-act btn-gray tut-btn-next";
        nextBtn.innerHTML = "閉じる";
        nextBtn.onclick = () => { navPanel.style.display = 'none'; };
        navPanel.style.display = 'block';
    }
}

// =====================================================================
// 📚 各レッスンの状況に応じたアドバイスメッセージ定義（ルールブック）
// trigger種類: 'start'(局開始), 'draw'(自分がツモ), 'discard'(他家が打牌)
// =====================================================================
const LESSON_MESSAGES = {
    1: [
        {
            trigger: 'discard', tile: '1p', from: 1, shown: false, type: 'warn',
            // 🌟 【requireTiles の例】 手牌に 1p が対子で残っている（想定通りの手牌）時だけ鳴き警告を出す
            requireTiles: ["1p", "1p"],
            text: "碰（ポン）すると全単の特殊形和了が出来ないよ！"
        },
        {
            trigger: 'draw', tile: '5p', count: 2, shown: false, type: 'hint',
            meldCount: { max: 0 }, // 副露ゼロのときだけ発動
            requireNotTiles: ["北", "發"],
            text: "5pで和了でもいいけど……<br>四季牌を切ると「無花果」になって、待ちを減らさずに2点から6点に打点上昇するよ！"
        },
        {
            trigger: 'discard', tile: '3s', from: 1, shown: false, type: 'hint',
            meldCount: { max: 0 }, // 副露ゼロのときだけ発動
            requireNotTiles: ["北", "發"],
            requireTiles: ["冬"],
            text: "3sで和了でもいいけど……<br>四季牌を切ると「無花果」になって、待ちを減らさずに2点から6点に打点上昇するよ！"
        }
    ],
    2: [
        { trigger: 'draw', tile: '6s', shown: false, type: 'warn', text: "点対称な牌の順子を崩さないように！" },
        { trigger: 'draw', tile: '白', shown: false, type: 'hint', text: "唯一点対称な字牌の白を大事にしよう！" }
    ],
    4: [
        { trigger: 'start', shown: false, type: 'hint', text: "今回は2,3,4の筒子で完成しそう！" },
        {
            trigger: 'discard', tile: '9p', shown: false, type: 'warn',
            requireTiles: ["9p", "9p"],
            text: "関係のない牌を碰（ポン）し過ぎると三節高にならないよ！"
        },
        {
            trigger: 'discard', tile: '4p', shown: false, type: 'hint',
            // 🌟 手牌に 4p が対子で残っている（ポンできる状態の）時だけヒントを出す
            requireTiles: ["4p", "4p"],
            text: "これは関係のある牌だから碰（ポン）しよう！"
        }
    ],
    6: [
        { trigger: 'start', shown: false, type: 'hint', text: "副露できるものは全部してみよう！" }
    ],
    7: [
        { trigger: 'start', shown: false, type: 'hint', text: "分からなくなったらミッション確認を見てみよう！" }
    ],
    8: [
        { trigger: 'start', shown: false, type: 'warn', text: "一色四歩高は碰（ポン）ができないよ！" }
    ],
    9: [
        { trigger: 'draw', tile: '2s', shown: false, type: 'hint', text: "和了後も四季牌が手牌になければ暗槓ができるよ！" }
    ]
};

let lessonToastTimeout;

/**
 * 🌟 レッスンのゲーム進行状況をチェックしてトーストを出すメイン関数
 * @param {string} eventType - 'start' | 'draw' | 'discard'
 * @param {string|null} tile - 発生した牌のID (例: '1p', '白')
 * @param {number} fromPlayer - 打牌したプレイヤー番号 (0:自分, 1:下家, 2:対面, 3:上家)
 */
function checkLessonMessage(eventType, tile = null, fromPlayer = -1) {
    // レッスンモードではない、または現在のレッスンIDが未定義なら即座に終了
    if (typeof currentGameMode === 'undefined' || currentGameMode !== 'lesson') return;
    const lessonId = window.currentLessonId;
    if (!lessonId || !LESSON_MESSAGES[lessonId]) return;

    // =====================================================================
    // 🌟 追加：比率ズレを防ぐため、ポップアップの所属をゲーム画面内部(#game-container)へ強制移動
    const toast = document.getElementById('lesson-toast');
    const gameContainer = document.getElementById('game-container');
    if (toast && gameContainer && toast.parentNode !== gameContainer) {
        //console.log("[DEBUG レッスンUI調整] ポップアップの配置基準をブラウザ画面からゲーム卓内部（#game-container）へ同期しました。");
        gameContainer.appendChild(toast);
    }
    // =====================================================================

    //console.log(`[DEBUG レッスン監視] イベント検知 -> タイプ: ${eventType}, 牌: ${tile}, プレイヤー: ${fromPlayer}`);

    const messages = LESSON_MESSAGES[lessonId];

    messages.forEach((msg, idx) => {
        if (msg.shown) return; // すでに表示済みのメッセージはスルー
        if (msg.trigger !== eventType) return; // トリガー条件が一致しない場合はスルー

        let isMatch = true;

        // 1. 牌の種類指定チェック
        if (msg.tile && msg.tile !== tile) isMatch = false;

        // 2. 誰が捨てたかのチェック
        if (msg.from !== undefined && msg.from !== fromPlayer) isMatch = false;

        // 3. 手牌の枚数チェック
        if (eventType === 'draw' && msg.count) {
            if (typeof myHand !== 'undefined' && Array.isArray(myHand)) {
                const currentCount = myHand.filter(t => t === msg.tile).length;
                if (currentCount < msg.count) {
                    //console.log(`[DEBUG レッスン監視] 条件不一致: ${msg.tile} の枚数が足りません (${currentCount}/${msg.count})`);
                    isMatch = false;
                }
            } else {
                isMatch = false;
            }
        }

        // =====================================================================
        // 🌟 条件1: 必須手牌チェック (requireTiles)
        // 手牌にこれらの牌が全て含まれている必要がある（重複対応）
        // 例: requireTiles: ["1p", "1p"] → 1pが2枚以上手牌にあるときだけ発動
        // =====================================================================
        if (isMatch && msg.requireTiles && typeof myHand !== 'undefined') {
            let tempHand = [...myHand];
            let hasAll = true;
            for (let reqTile of msg.requireTiles) {
                let tidx = tempHand.indexOf(reqTile);
                if (tidx === -1) { hasAll = false; break; }
                tempHand.splice(tidx, 1);
            }
            if (!hasAll) isMatch = false;
        }

        // =====================================================================
        // 🌟 条件2: 禁止手牌チェック (requireNotTiles)
        // 手牌にこれらの牌が1枚でも含まれていたら発動しない（requireTilesの逆）
        // 例: requireNotTiles: ["3p"] → 3pをまだ切っていない（手牌に残っている）場合は出さない
        // =====================================================================
        if (isMatch && msg.requireNotTiles && typeof myHand !== 'undefined') {
            for (let forbidTile of msg.requireNotTiles) {
                if (myHand.indexOf(forbidTile) !== -1) {
                    isMatch = false;
                    break;
                }
            }
        }

        // =====================================================================
        // 🌟 条件3: 副露数チェック (meldCount)
        // { min, max } で副露数の範囲を指定。片方だけでも可。
        // 例: meldCount: { max: 0 } → 一度も鳴いていないときだけ発動
        // 例: meldCount: { min: 1 }  → 1回以上鳴いているときだけ発動
        // =====================================================================
        if (isMatch && msg.meldCount && typeof myMelds !== 'undefined') {
            const n = myMelds.length;
            if (msg.meldCount.min !== undefined && n < msg.meldCount.min) isMatch = false;
            if (msg.meldCount.max !== undefined && n > msg.meldCount.max) isMatch = false;
        }

        // =====================================================================
        // 🌟 条件4: 副露内容チェック (requireMelds)
        // 副露の中に指定した牌群が含まれている必要がある（配列の配列で複数指定可）
        // 例: requireMelds: [["1p","1p","1p"]] → 1pをポンしているときだけ発動
        // =====================================================================
        if (isMatch && msg.requireMelds && typeof myMelds !== 'undefined') {
            for (let reqMeld of msg.requireMelds) {
                const reqSorted = [...reqMeld].sort().join(',');
                const found = myMelds.some(meld => {
                    const meldTiles = Array.isArray(meld) ? meld : (meld.tiles || []);
                    return [...meldTiles].sort().join(',') === reqSorted;
                });
                if (!found) { isMatch = false; break; }
            }
        }

        // =====================================================================
        // 🌟 条件5: カスタム条件関数 (condition)
        // 上記フィールドで表現できない複雑な条件を自由に書ける最終手段
        // 例: condition: () => myMelds.length === 0
        // =====================================================================
        if (isMatch && msg.condition && typeof msg.condition === 'function') {
            if (!msg.condition()) isMatch = false;
        }

        // 🎯 すべての条件が完全に一致した場合、トーストを画面内に降臨させる
        if (isMatch) {
            msg.shown = true; // 表示済みフラグをON
            console.log(`[DEBUG レッスン通知発動] レッスン ${lessonId} - アイテム番号 [${idx}] の条件が成立しました。内容: "${msg.text}"`);

            const toast = document.getElementById('lesson-toast');
            const icon = document.getElementById('lesson-toast-icon');
            const text = document.getElementById('lesson-toast-text');

            if (toast && icon && text) {
                if (msg.type === 'warn') {
                    toast.className = 'toast-warn';
                    icon.innerText = '⚠️';
                } else {
                    toast.className = 'toast-hint';
                    icon.innerText = '💡';
                }
                text.innerHTML = msg.text; // 🌟 念のため改行タグ等も効くように innerHTML に変更

                toast.classList.add('show');
                if (typeof playSE === 'function') playSE('click');

                // 🚨🚨 修正：ここにあった「7秒後に自動で隠す setTimeout」を完全削除しました！
            }
        }
    });
}

// =========================================================
// 🌟 新規追加：プレイヤーが行動を起こした瞬間にトーストを引っ込める関数
window.hideLessonToast = function () {
    const toast = document.getElementById('lesson-toast');
    if (toast && toast.classList.contains('show')) {
        toast.classList.remove('show');
        //console.log("[DEBUG レッスン通知終了] プレイヤーのアクションを検知したため、トーストを格納しました。");
    }
};
// =========================================================

// =====================================================================
// 🛠️ 原因特定用：リサイズ時に裏で二重縮小の命令が走っていないか監視するログ
// =====================================================================
window.addEventListener('resize', () => {
    const navPanel = document.getElementById('ingame-tutorial-nav');
    if (navPanel) {
        const computedStyle = window.getComputedStyle(navPanel);
        /*console.log(`[DEBUG リサイズ検証ログ] 
            元の指定値(top): ${navPanel.style.top} 
            現在の生のtransform属性: "${navPanel.style.transform}" 
            ブラウザが最終計算した実質位置(computed top): ${computedStyle.top}
            ※CSSの !important 制御により、二重縮小（scale）は完全にガードされています。`);*/
    }
});