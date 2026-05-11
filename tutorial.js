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
            title = "レッスン①：脱・平和主義【脳死の全単アタック】";
            msg = "通常の麻雀では順子に使いやすい「4」や「6」ですが、『全単』を狙うときはただのゴミです。<br>すべて切り捨てて、脳みそを空っぽにして奇数だけを集めましょう！<br>碰・槓もダメですよ！<br><br><span style='color:#f1c40f;'>🏆クリア条件：「全単」で和了！</span>";
            apiScenario = "lesson_1";
            break;
        case 2:
            title = "レッスン②：面前信仰の破壊【寒江独釣で裸になれ】";
            msg = "「鳴いたら安くなる」という常識は捨ててください。<br>全部鳴いて手牌を1枚にすれば、強力な役『寒江独釣』が付きます。<br>四季牌で待てば、他家が何を捨てても和了り放題です！<br><br><span style='color:#f1c40f;'>🏆ミッション：4回碰・槓をして、手牌を1枚（裸単騎）にして和了！</span>";
            apiScenario = "lesson_2";
            break;
        case 3:
            title = "レッスン③：未知の幾何学【七星不靠ってなんだ？】";
            msg = "バラバラのクズ配牌に見えますか？<br>いいえ、これは四季茶会麻雀における黄金の形です。<br>「東南西北白發中」の7枚に、「147」「258」「369」の3色の筋。<br>面子を作らなくても和了れる美しい星の並びを覚えましょう。<br><br><span style='color:#f1c40f;'>🏆ミッション：正しい有効牌を見極めて「七星不靠」を和了！</span>";
            apiScenario = "lesson_3";
            break;
        case 4:
            title = "レッスン④：面前のロマン【一色四歩高 / 連七対】";
            msg = "基本は鳴きが強いゲームですが、『一色四歩高』や『連七対』だけは別格です。<br>普段お目にかかれない芸術的な手役を完成させましょう。<br><br><span style='color:#f1c40f;'>🏆ミッション：鳴かずに門前で『一色四歩高』か『連七対』を和了！</span>";
            apiScenario = "lesson_4";
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