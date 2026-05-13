// ==========================================
// 🎓 チュートリアル＆レッスン管理システム (tutorial.js)
// ==========================================
let isIngameTutorial = false;

// 🎮 実戦形式のチュートリアルを開始する関数
async function startTutorial() {
    closeAllModals();
    playSE('start');

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

    // 🚨 修正：退出時にチュートリアルパネルや暗転設定が残らないよう、完全にお掃除する
    if (!window.tutExitHooked) {
        // 🚨 追加：本編の正常な「交換関数」をバックアップしておく
        window.originalExecExchange = window.execExchange;

        const originalReturn = window.returnToHomeGracefully;
        window.returnToHomeGracefully = () => {
            if (originalReturn) originalReturn();

            // 1. パネルと暗転膜を隠す
            const navPanel = document.getElementById('ingame-tutorial-nav');
            if (navPanel) navPanel.style.display = 'none';
            const overlay = document.getElementById('tut-dark-overlay');
            if (overlay) overlay.style.display = 'none';

            // 2. 指差し矢印を全削除
            document.querySelectorAll('.tut-dynamic-arrow').forEach(e => {
                clearInterval(e.dataset.animInterval);
                e.remove();
            });

            // 3. ハイライト用のインラインスタイル（Z-indexや光など）を完全消去
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

            // 4. brightness(0.2) で物理的に暗くされていたUIの明るさを元に戻す
            const backgroundUI = [
                'center-info', 'player-name-0', 'player-name-1', 'player-name-2', 'player-name-3',
                'player-score-0', 'player-score-1', 'player-score-2', 'player-score-3',
                'btn-auto-play', 'btn-show-waits', 'charleston-confirm-ui'
            ];
            backgroundUI.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.style.filter = 'none';
                    el.style.transition = 'none';
                }
            });

            // 🚨 追加：チュートリアル用に書き換えた「交換関数」を本編の正常な処理に戻す！
            if (window.originalExecExchange) {
                window.execExchange = window.originalExecExchange;
            }

            isIngameTutorial = false;
        };
        window.tutExitHooked = true;
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
                        el.style.transition = 'filter 0.3s ease';
                        el.style.filter = 'brightness(0.2)';
                    } else {
                        el.style.transition = 'filter 0.3s ease';
                        el.style.filter = 'none';
                    }
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

                window.execExchange = async () => {
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
                setupActionBtn(`花槓 ${getImg('5s')}${getImg('春')}`, 'btn-blue', async () => {
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
                    navPanel.style.top = "60%";
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
            msg: "<span style='color:#3498db; font-size:1.2em; display:inline-block; margin-bottom:8px;'>【その他の便利機能】</span><br>このように、<span style='color:#f1c40f;'>他プレイヤーとの点差</span>をサッと確認できます！<br>（画面をクリックするか、数秒で自然に消えます）",
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
// 🎓 英才教育（レッスン）モード制御
// ==========================================
async function startLesson(lessonId) {
    closeAllModals();
    playSE('start');

    document.getElementById('title-screen').style.display = 'none';
    document.getElementById('mode-select-screen').style.display = 'none';
    document.querySelector('.table').style.opacity = 1;
    document.getElementById('game-container').style.opacity = 1;
    document.getElementById('overlay').style.display = 'none';

    isProc = true;

    for (let i = 0; i < 4; i++) {
        document.getElementById(`river-${i}`).innerHTML = "";
        document.getElementById(`meld-${i}`).innerHTML = "";
        document.getElementById(`win-zone-${i}`).innerHTML = "";
        document.getElementById(`win-zone-${i}`).style.display = "none";
    }
    clearCharlestonStatus();
    resetActionBtnPool();
    document.querySelectorAll('.action-layer .btn-act').forEach(b => b.style.display = "none");
    document.getElementById('tutorial-review-container').style.display = 'block';

    let title, msg, apiScenario;
    switch (lessonId) {
        case 1:
            title = "レッスン①：脱・平和主義【全単アタック】";
            msg = `
                <div class='learning-wrap'>
                    <div class='learning-box-blue'>
                        <div class='learning-box-blue-title'>📖 役の紹介：全単（チャンタン）</div>
                        数字の「1, 3, 5, 7, 9」と字牌だけで構成する役です。<br>
                        偶数牌はすべてノイズ。漢は黙って奇数と字牌だけを集めましょう！
                    </div>
                    <div class='learning-box-red'>
                        <div class='learning-box-red-title'>🧠 ミニクイズ</div>
                        <details>
                            <summary style='cursor:pointer; font-weight:bold;'>Q. 次のうち、全単に【使えない】牌はどれ？<br>① 1m　② 5p　③ 6s　④ 中</summary>
                            <div style='margin-top:10px; color:#f1c40f;'>正解：③ 6s（偶数だから）</div>
                        </details>
                    </div>
                </div>
                <br><span style='color:#f1c40f;'>🏆 ミッション：不要な偶数を捨てて「全単」を和了せよ！</span>
            `;
            apiScenario = "lesson_1";
            break;

        case 2:
            title = "レッスン②：上下対称の美学【推不倒】";
            msg = `
                <div class='learning-wrap'>
                    <div class='learning-box-blue'>
                        <div class='learning-box-blue-title'>📖 役の紹介：推不倒（推しても倒れない）</div>
                        「上下逆さまにしても図柄が同じ牌」だけで構成する役です。<br>
                        【対象牌】1,2,3,4,5,8,9筒 / 2,4,5,6,8,9索 / 白
                    </div>
                    <div class='learning-box-red'>
                        <div class='learning-box-red-title'>🧠 ミニクイズ</div>
                        <details>
                            <summary style='cursor:pointer; font-weight:bold;'>Q. 次のうち「推不倒」に使える牌は？<br>① 7s　② 6p　③ 4s</summary>
                            <div style='margin-top:10px; color:#f1c40f;'>正解：③ 4s（7sと6pは上下非対称なデザインです）</div>
                        </details>
                    </div>
                </div>
                <br><span style='color:#f1c40f;'>🏆 ミッション：対象外の牌を捨てて「推不倒」を和了せよ！</span>
            `;
            apiScenario = "lesson_2";
            break;

        case 3:
            title = "レッスン③：圧倒的スケール【全大】";
            msg = `
                <div class='learning-wrap'>
                    <div class='learning-box-blue'>
                        <div class='learning-box-blue-title'>📖 役の紹介：全大（＆ 全小 / 全中）</div>
                        数字の「7, 8, 9」だけで構成すると『全大』。<br>
                        逆に「1, 2, 3」だけなら『全小』、「4, 5, 6」だけなら『全中』という役になります。
                    </div>
                    <div class='learning-box-red'>
                        <div class='learning-box-red-title'>🧠 ミニクイズ</div>
                        <details>
                            <summary style='cursor:pointer; font-weight:bold;'>Q. 全小・全中・全大を狙うとき、絶対に入れてはいけない牌は？<br>① 字牌　② 索子　③ 萬子</summary>
                            <div style='margin-top:10px; color:#f1c40f;'>正解：① 字牌（数字の縛りなので字牌はすべてノイズになります）</div>
                        </details>
                    </div>
                </div>
                <br><span style='color:#f1c40f;'>🏆 ミッション：デカい数字だけを集めて「全大」を和了せよ！</span>
            `;
            apiScenario = "lesson_3";
            break;

        case 4:
            title = "レッスン④：階段状の刻子【一色四節高】";
            msg = `
                <div class='learning-wrap'>
                    <div class='learning-box-blue'>
                        <div class='learning-box-blue-title'>📖 役の紹介：一色四節高（いっしょくよんせつこう）</div>
                        同じ色で「111」「222」「333」「444」のように、数字が1つずつズレた「刻子」を4つ作る役です。（3つなら三節高）
                    </div>
                    <div class='learning-box-red'>
                        <div class='learning-box-red-title'>🧠 ミニクイズ</div>
                        <details>
                            <summary style='cursor:pointer; font-weight:bold;'>Q. 「222p」「333p」「444p」と揃っています。四節高にするにはあと何が必要？<br>① 111p か 555p　② 555p か 666p</summary>
                            <div style='margin-top:10px; color:#f1c40f;'>正解：①（階段状に繋げるため、上下に隣接する刻子が必要です）</div>
                        </details>
                    </div>
                </div>
                <br><span style='color:#f1c40f;'>🏆 ミッション：連続した刻子を完成させ「一色四節高」を和了せよ！</span>
            `;
            apiScenario = "lesson_4";
            break;

        case 5:
            title = "レッスン⑤：赤を憎む者【陰陽両儀】";
            msg = `
                <div class='learning-wrap'>
                    <div class='learning-box-blue'>
                        <div class='learning-box-blue-title'>📖 役の紹介：陰陽両儀（黒一色）</div>
                        牌の図柄に「赤い塗料」が一切使われていない牌だけで構成する役です。<br>
                        【対象牌】2,4,8筒 / 2,3,4,6,8索 / 東,南,西,北,白,發
                    </div>
                    <div class='learning-box-red'>
                        <div class='learning-box-red-title'>🧠 ミニクイズ</div>
                        <details>
                            <summary style='cursor:pointer; font-weight:bold;'>Q. 次のうち「陰陽両儀」で【使えない】字牌はどれ？<br>① 白　② 發　③ 中</summary>
                            <div style='margin-top:10px; color:#f1c40f;'>正解：③ 中（真っ赤なのでアウトです！）</div>
                        </details>
                    </div>
                </div>
                <br><span style='color:#f1c40f;'>🏆 ミッション：赤をすべて切り捨て「陰陽両儀」を和了せよ！</span>
            `;
            apiScenario = "lesson_5";
            break;

        case 6:
            title = "レッスン⑥：面前信仰の破壊【寒江独釣で裸になれ】";
            msg = `
                <div class='learning-wrap'>
                    <div class='learning-box-blue'>
                        <div class='learning-box-blue-title'>📖 役の紹介：寒江独釣（かんこうどくちょう）</div>
                        4回副露（ポンやカン等）を行い、手牌を「たった1枚（裸単騎）」にして和了する役です。<br>
                        鳴けば鳴くほど強くなる、このゲームの象徴です。
                    </div>
                    <div class='learning-box-red'>
                        <div class='learning-box-red-title'>🧠 ミニクイズ</div>
                        <details>
                            <summary style='cursor:pointer; font-weight:bold;'>Q. 寒江独釣の待ち牌として最強なのはどれ？<br>① 四季牌（春など）　② 1m　③ 中</summary>
                            <div style='margin-top:10px; color:#f1c40f;'>正解：① 四季牌（万能牌なので、他家が何を捨てても絶対和了れます！）</div>
                        </details>
                    </div>
                </div>
                <br><span style='color:#f1c40f;'>🏆 ミッション：4回鳴いて手牌を1枚にし「寒江独釣」を和了せよ！</span>
            `;
            apiScenario = "lesson_6";
            break;

        case 7:
            title = "レッスン⑦：未知の幾何学【七星不靠】";
            msg = `
                <div class='learning-wrap'>
                    <div class='learning-box-blue'>
                        <div class='learning-box-blue-title'>📖 役の紹介：七星不靠（チーシンブーカオ）</div>
                        字牌7種（東南西北白發中）すべてと、各色で筋が被らない「147」「258」「369」を組み合わせた特殊形です。（面子不要）
                    </div>
                    <div class='learning-box-red'>
                        <div class='learning-box-red-title'>🧠 ミニクイズ</div>
                        <details>
                            <summary style='cursor:pointer; font-weight:bold;'>Q. 手牌に「1m・4m・7m」「2p・5p・8p」があります。索子は何を集めればいい？<br>① 1s・4s・7s　② 2s・5s・8s　③ 3s・6s・9s</summary>
                            <div style='margin-top:10px; color:#f1c40f;'>正解：③ 3s・6s・9s（各色で別の筋を担当させます）</div>
                        </details>
                    </div>
                </div>
                <br><span style='color:#f1c40f;'>🏆 ミッション：正しい有効牌を見極めて「七星不靠」を和了せよ！</span>
            `;
            apiScenario = "lesson_7";
            break;

        case 8:
            title = "レッスン⑧：面前のロマン【一色四歩高】";
            msg = `
                <div class='learning-wrap'>
                    <div class='learning-box-blue'>
                        <div class='learning-box-blue-title'>📖 役の紹介：一色四歩高（いっしょくよんほこう）</div>
                        同じ色で「123」「234」「345」「456」のように、数字が1つずつズレた「順子」を4つ作る役です。<br>
                        鳴かずに門前で狙うと美しさが際立ちます。
                    </div>
                    <div class='learning-box-red'>
                        <div class='learning-box-red-title'>🧠 ミニクイズ</div>
                        <details>
                            <summary style='cursor:pointer; font-weight:bold;'>Q. 「345p」「456p」「567p」と揃っています。四歩高にするにはあと何が必要？<br>① 234p か 678p　② 345p か 567p</summary>
                            <div style='margin-top:10px; color:#f1c40f;'>正解：①（階段状に繋げるため、上下の順子が必要です）</div>
                        </details>
                    </div>
                </div>
                <br><span style='color:#f1c40f;'>🏆 ミッション：階段状の順子を完成させ「一色四歩高」を和了せよ！</span>
            `;
            apiScenario = "lesson_8";
            break;

        case 9:
            title = "レッスン⑨：最終試験【無花果＆槓上開花】";
            msg = `
                <div class='learning-wrap'>
                    <div class='learning-box-blue'>
                        <div class='learning-box-blue-title'>📖 役の紹介：無花果 / 槓上開花</div>
                        四季牌を1枚も持たずに和了する縛りプレイ「無花果（むいちじく）」。<br>
                        そして、カンをした補充牌で和了する「槓上開花（リンシャンカイホウ）」。<br>
                        これらを複合させて脳汁を出しましょう！
                    </div>
                    <div class='learning-box-red'>
                        <div class='learning-box-red-title'>🧠 ミニクイズ</div>
                        <details>
                            <summary style='cursor:pointer; font-weight:bold;'>Q. 暗槓（アンカン）をすると、山札から嶺上牌を引くことができますか？<br>① はい　② いいえ</summary>
                            <div style='margin-top:10px; color:#f1c40f;'>正解：① はい（この性質を利用して強引にツモ和了りをもぎ取ります）</div>
                        </details>
                    </div>
                </div>
                <br><span style='color:#f1c40f;'>🏆 ミッション：暗槓からの嶺上ツモで、美しく暴力的な和了をキメろ！</span>
            `;
            apiScenario = "lesson_9";
            break;
    }

    currentGameMode = 'lesson';
    window.currentLessonId = lessonId;
    await apiCall('/start', { cpu_level: -1 });

    await apiCall('/debug_setup', { scenario: apiScenario });

    charlestonPhase = false;
    document.getElementById('charleston-ui').style.display = "none";
    document.getElementById('charleston-confirm-ui').style.display = "none";
    document.querySelectorAll('.action-layer .btn-act').forEach(b => b.style.display = "none");

    const btnHaitei = document.getElementById('btn-haitei-tsumo');
    const btnRyukyoku = document.getElementById('btn-ryukyoku');
    if (btnHaitei) btnHaitei.style.display = "none";
    if (btnRyukyoku) btnRyukyoku.style.display = "none";

    drawnTile = "";
    lastDiscardPlayer = -1;
    justPonged = false;
    pendingIsRinshan = false;
    pendingIsMiaoshou = false;

    hideCpuTiles = [0, 0, 0, 0];
    clearCharlestonStatus();

    render(); renderCPU();

    const navPanel = document.getElementById('ingame-tutorial-nav');
    const navText = document.getElementById('ingame-tutorial-text');
    const nextBtn = document.getElementById('ingame-tutorial-next-btn');
    const prevBtn = document.getElementById('ingame-tutorial-prev-btn');
    if (prevBtn) prevBtn.style.display = 'none';

    const gameContainer = document.getElementById('game-container');
    if (navPanel.parentNode !== gameContainer) {
        gameContainer.appendChild(navPanel);
    }

    navPanel.style.setProperty('width', '950px', 'important');
    navPanel.style.setProperty('padding', '25px', 'important');
    navPanel.style.setProperty('z-index', '95000', 'important');
    navPanel.style.top = '50%';
    navPanel.style.left = '50%';
    navPanel.style.transform = 'translate(-50%, -50%)';

    navText.innerHTML = `<span style='color:#e74c3c; font-size:1.3em; font-weight:bold;'>${title}</span><br><br><span style='font-size: 22px; line-height: 1.6;'>${msg}</span>`;

    nextBtn.style.display = "inline-block";
    nextBtn.innerHTML = "挑戦する！ ⚔️";
    navPanel.style.display = 'block';

    nextBtn.onclick = () => {
        playSE('start');
        navPanel.style.display = 'none';
        isProc = false;
        checkT();
    };
}

// 💡 プレイ中にチュートリアルのメッセージを再表示・非表示する関数
function reviewTutorial() {
    playSE('click');
    const nav = document.getElementById('ingame-tutorial-nav');

    if (nav) {
        if (nav.style.display === 'block') {
            nav.style.display = 'none';
        } else {
            nav.style.top = '20%';
            nav.style.left = '50%';
            nav.style.transform = 'translateX(-50%)';
            nav.style.display = 'block';
        }
    }
}