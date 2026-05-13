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

    if (!window.tutExitHooked) {
        window.originalExecExchange = window.execExchange;
        const originalReturn = window.returnToHomeGracefully;
        window.returnToHomeGracefully = function () {
            isIngameTutorial = false;
            window.currentLessonId = null;
            document.getElementById('tut-dark-overlay').style.display = "none";
            document.getElementById('ingame-tutorial-nav').style.display = "none";
            document.getElementById('tutorial-review-container').style.display = "none";
            if (originalReturn) originalReturn();
        };
        window.tutExitHooked = true;
    }

    isIngameTutorial = true;
    window.currentLessonId = lessonId;
    isQuizAnswered = false; // クイズの回答状態をリセット

    // 🌟 1. 各レッスンのテキストとクイズデータをセット (画像を埋め込み)
    switch (lessonId) {
        case 1:
            lessonTitle = "レッスン①：脱・平和主義【全単アタック】";
            lessonIntro = `数字の「1, 3, 5, 7, 9」と字牌だけで構成する役です。<br>偶数牌はすべてノイズ。漢は黙って奇数と字牌だけを集めましょう！
            <div style="margin-top: 15px; background: rgba(0,0,0,0.5); padding: 15px; border-radius: 8px; text-align: center;">
                <span style="color:#bdc3c7; font-size: 16px;">使える牌の例：</span><br>
                ${getTutImg('1m')}${getTutImg('3p')}${getTutImg('5p')}${getTutImg('7s')}${getTutImg('9s')} &nbsp; &nbsp; ${getTutImg('東')}${getTutImg('白')}${getTutImg('發')}${getTutImg('中')}
            </div>`;
            lessonQuizData = {
                qText: "Q. 次のうち、全単に【使えない】牌はどれ？",
                options: [
                    { text: "1m", img: "1m" },
                    { text: "5p", img: "5p" },
                    { text: "6s", img: "6s" },
                    { text: "中", img: "中" }
                ],
                correctIndex: 2,
                explanation: "6s は偶数なので全単には使えません。"
            };
            lessonMission = "不要な偶数を捨てて「全単」を和了せよ！";
            break;

        case 2:
            lessonTitle = "レッスン②：上下対称の美学【推不倒】";
            lessonIntro = `「上下逆さまにしても図柄が同じ牌」だけで構成する役です。<br>【対象牌】1,2,3,4,5,8,9筒 / 2,4,5,6,8,9索 / 白
            <div style="margin-top: 15px; background: rgba(0,0,0,0.5); padding: 15px; border-radius: 8px; text-align: center;">
                <span style="color:#bdc3c7; font-size: 16px;">すべての対象牌：</span><br>
                ${getTutImg('1p')}${getTutImg('2p')}${getTutImg('3p')}${getTutImg('4p')}${getTutImg('5p')}${getTutImg('8p')}${getTutImg('9p')} <br>
                ${getTutImg('2s')}${getTutImg('4s')}${getTutImg('5s')}${getTutImg('6s')}${getTutImg('8s')}${getTutImg('9s')} &nbsp; &nbsp;
                ${getTutImg('白')}
            </div>`;
            lessonQuizData = {
                qText: "Q. 次のうち「推不倒」に【使える】牌はどれ？",
                options: [
                    { text: "7s", img: "7s" },
                    { text: "6p", img: "6p" },
                    { text: "4s", img: "4s" }
                ],
                correctIndex: 2,
                explanation: "4s は上下対称ですが、7sと6pは非対称なデザインです。"
            };
            lessonMission = "対象外の牌を捨てて「推不倒」を和了せよ！";
            break;

        case 3:
            lessonTitle = "レッスン③：圧倒的スケール【全大】";
            lessonIntro = `数字の「7, 8, 9」だけで構成すると『全大』。<br>逆に「1, 2, 3」だけなら『全小』、「4, 5, 6」だけなら『全中』という役になります。
            <div style="margin-top: 15px; background: rgba(0,0,0,0.5); padding: 15px; border-radius: 8px; text-align: center;">
                <span style="color:#bdc3c7; font-size: 16px;">全大の例：</span><br>
                ${getTutImg('7p')}${getTutImg('8p')}${getTutImg('9p')} &nbsp; &nbsp; ${getTutImg('7s')}${getTutImg('8s')}${getTutImg('9s')} &nbsp; &nbsp; ${getTutImg('9s')}${getTutImg('9s')}${getTutImg('9s')}
            </div>`;
            lessonQuizData = {
                qText: "Q. 全小・全中・全大を狙うとき、絶対に入れてはいけない牌は？",
                options: [
                    { text: "字牌", img: "東" },
                    { text: "索子", img: "8s" },
                    { text: "萬子", img: "9m" }
                ],
                correctIndex: 0,
                explanation: "数字の縛りなので、字牌はすべてノイズになります。"
            };
            lessonMission = "デカい数字だけを集めて「全大」を和了せよ！";
            break;

        case 4:
            lessonTitle = "レッスン④：階段状の刻子【一色四節高】";
            lessonIntro = `同じ色で「111」「222」「333」「444」のように、数字が1つずつズレた「刻子」を4つ作る役です。（3つなら三節高）
            <div style="margin-top: 15px; background: rgba(0,0,0,0.5); padding: 15px; border-radius: 8px; text-align: center;">
                <span style="color:#bdc3c7; font-size: 16px;">一色四節高の例：</span><br>
                ${getTutImg('2p')}${getTutImg('2p')}${getTutImg('2p')} &nbsp; 
                ${getTutImg('3p')}${getTutImg('3p')}${getTutImg('3p')} &nbsp; 
                ${getTutImg('4p')}${getTutImg('4p')}${getTutImg('4p')} &nbsp; 
                ${getTutImg('5p')}${getTutImg('5p')}${getTutImg('5p')}
            </div>`;
            lessonQuizData = {
                qText: "Q. 「222p」「333p」「444p」と揃っています。四節高にするにはあと何が必要？",
                options: [
                    { text: "111p か 555p", img: "1p" },
                    { text: "567p の順子", img: "6p" },
                    { text: "666p か 777p", img: "7p" }
                ],
                correctIndex: 0,
                explanation: "階段状に繋げるため、上下に隣接する刻子（111pか555p）が必要です。"
            };
            lessonMission = "連続した刻子を完成させ「一色四節高」を和了せよ！";
            break;

        case 5:
            lessonTitle = "レッスン⑤：赤を憎む者【陰陽両儀】";
            lessonIntro = `牌の図柄に「赤い塗料」が一切使われていない牌だけで構成する役です。<br>【対象牌】2,4,8筒 / 2,3,4,6,8索 / 東,南,西,北,白,發
            <div style="margin-top: 15px; background: rgba(0,0,0,0.5); padding: 15px; border-radius: 8px; text-align: center;">
                <span style="color:#bdc3c7; font-size: 16px;">使える牌の例（一切赤がない）：</span><br>
                ${getTutImg('2p')}${getTutImg('4p')}${getTutImg('8p')} &nbsp; 
                ${getTutImg('2s')}${getTutImg('3s')}${getTutImg('4s')}${getTutImg('6s')}${getTutImg('8s')} &nbsp; 
                ${getTutImg('東')}${getTutImg('北')}${getTutImg('白')}${getTutImg('發')}
            </div>`;
            lessonQuizData = {
                qText: "Q. 次のうち「陰陽両儀」で【使えない】字牌はどれ？",
                options: [
                    { text: "白", img: "白" },
                    { text: "發", img: "發" },
                    { text: "中", img: "中" }
                ],
                correctIndex: 2,
                explanation: "中は真っ赤なのでアウトです！"
            };
            lessonMission = "赤をすべて切り捨て「陰陽両儀」を和了せよ！";
            break;

        case 6:
            lessonTitle = "レッスン⑥：面前信仰の破壊【寒江独釣で裸になれ】";
            lessonIntro = `4回副露（ポンやカン等）を行い、手牌を「たった1枚（裸単騎）」にして和了する役です。<br>鳴けば鳴くほど強くなる、このゲームの象徴です。
            <div style="margin-top: 15px; background: rgba(0,0,0,0.5); padding: 15px; border-radius: 8px; text-align: center;">
                <span style="color:#bdc3c7; font-size: 16px;">寒江独釣のイメージ：</span><br>
                ${getTutImg('3s')} 単騎待ちなのに、横には副露の山！<br><br>
                ${getTutImg('ura')}${getTutImg('1m')}${getTutImg('1m')}${getTutImg('ura')} &nbsp;
                ${getTutImg('3p')}${getTutImg('3p')}${getTutImg('3p')} &nbsp;
                ${getTutImg('5p')}${getTutImg('5p')}${getTutImg('5p')} &nbsp;
                ${getTutImg('白')}${getTutImg('白')}${getTutImg('白')}
            </div>`;
            lessonQuizData = {
                qText: "Q. 寒江独釣の待ち牌として最強なのはどれ？",
                options: [
                    { text: "四季牌", img: "春" },
                    { text: "1m", img: "1m" },
                    { text: "中", img: "中" }
                ],
                correctIndex: 0,
                explanation: "四季牌は万能牌なので、他家が何を捨てても絶対和了れます！"
            };
            lessonMission = "4回鳴いて手牌を1枚にし「寒江独釣」を和了せよ！";
            break;

        case 7:
            lessonTitle = "レッスン⑦：未知の幾何学【七星不靠】";
            lessonIntro = `字牌7種（東南西北白發中）すべてと、各色で筋が被らない「147」「258」「369」を組み合わせた特殊形です。（面子不要）
            <div style="margin-top: 15px; background: rgba(0,0,0,0.5); padding: 15px; border-radius: 8px; text-align: center;">
                <span style="color:#bdc3c7; font-size: 16px;">七星不靠の例：</span><br>
                ${getTutImg('東')}${getTutImg('南')}${getTutImg('西')}${getTutImg('北')}${getTutImg('白')}${getTutImg('發')}${getTutImg('中')} <br><br>
                ${getTutImg('1m')} &nbsp; &nbsp; 
                ${getTutImg('2p')}${getTutImg('5p')}${getTutImg('8p')} &nbsp; &nbsp; 
                ${getTutImg('3s')}${getTutImg('6s')}${getTutImg('9s')}
            </div>`;
            lessonQuizData = {
                qText: "Q. 手牌に「1m・4m・7m」「2p・5p・8p」があります。索子は何を集めればいい？",
                options: [
                    { text: "1s・4s・7s", img: "4s" },
                    { text: "2s・5s・8s", img: "5s" },
                    { text: "3s・6s・9s", img: "6s" }
                ],
                correctIndex: 2,
                explanation: "各色で別の筋（今回は 3, 6, 9）を担当させます。"
            };
            lessonMission = "正しい有効牌を見極めて「七星不靠」を和了せよ！";
            break;

        case 8:
            lessonTitle = "レッスン⑧：面前のロマン【一色四歩高】";
            lessonIntro = `同じ色で「123」「234」「345」「456」のように、数字が1つずつズレた「順子」を4つ作る役です。<br>鳴かずに門前で狙うと美しさが際立ちます。
            <div style="margin-top: 15px; background: rgba(0,0,0,0.5); padding: 15px; border-radius: 8px; text-align: center;">
                <span style="color:#bdc3c7; font-size: 16px;">一色四歩高の例：</span><br>
                ${getTutImg('2s')}${getTutImg('3s')}${getTutImg('4s')} &nbsp; 
                ${getTutImg('3s')}${getTutImg('4s')}${getTutImg('5s')} &nbsp; 
                ${getTutImg('4s')}${getTutImg('5s')}${getTutImg('6s')} &nbsp; 
                ${getTutImg('5s')}${getTutImg('6s')}${getTutImg('7s')}
            </div>`;
            lessonQuizData = {
                qText: "Q. 「345p」「456p」「567p」と揃っています。四歩高にするにはあと何が必要？",
                options: [
                    { text: "234p", img: "2p" },
                    { text: "345p", img: "3p" },
                    { text: "666p", img: "6p" }
                ],
                correctIndex: 0,
                explanation: "階段状に繋げるため、前後に隣接する順子（234p か 678p）が必要です。"
            };
            lessonMission = "階段状の順子を完成させ「一色四歩高」を和了せよ！";
            break;

        case 9:
            lessonTitle = "レッスン⑨：最終試験【無花果＆槓上開花】";
            lessonIntro = `四季牌を1枚も持たずに和了する縛りプレイ「無花果（むいちじく）」。<br>そして、カンをした補充牌で和了する「槓上開花（リンシャンカイホウ）」。<br>これらを複合させて脳汁を出しましょう！
            <div style="margin-top: 15px; background: rgba(0,0,0,0.5); padding: 15px; border-radius: 8px; text-align: center;">
                <span style="color:#bdc3c7; font-size: 16px;">最高の脳汁展開：</span><br>
                ${getTutImg('1s')}${getTutImg('1s')}${getTutImg('1s')}${getTutImg('1s')} を暗槓！ <br>
                ➔ 嶺上から ${getTutImg('8p')} を引いて「ツモ！」
            </div>`;
            lessonQuizData = {
                qText: "Q. 暗槓（アンカン）をすると、山札から嶺上牌を引くことができますか？",
                options: [
                    { text: "はい", img: "ura" },
                    { text: "いいえ", img: "1m" }
                ],
                correctIndex: 0,
                explanation: "この性質を利用して、強引にツモ和了りをもぎ取ります。"
            };
            lessonMission = "暗槓からの嶺上ツモで、美しく暴力的な和了をキメろ！";
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
            await apiCall('/start', { cpu_level: 1 });
        }
        await apiCall('/debug_setup', { scenario: apiScenario });
    } catch (e) {
        console.error("サーバーとの通信エラー:", e);
        try {
            await apiCall('/start', { cpu_level: 1 });
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
    navPanel.style.setProperty('width', '950px', 'important');
    navPanel.style.setProperty('padding', '25px', 'important');
    navPanel.style.setProperty('z-index', '95000', 'important');
    navPanel.style.top = '50%';
    navPanel.style.left = '50%';
    navPanel.style.transform = 'translate(-50%, -50%) scale(var(--game-scale, 1))';
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
    navPanel.style.transform = 'translate(-50%, -50%) scale(var(--game-scale, 1))';
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