// ==========================================
// 📊 戦績・実績・マイページ管理システム (stats.js)
// ==========================================

let playerRatings = [1500, 1500, 1500, 1500];

// 📊 プレイヤーの実績・戦績を管理するデータオブジェクト
let playerStats = {
    playerName: "あなた",
    maxScore: 0,
    maxScoreHand: null,
    currentWinStreak: 0,
    maxWinStreak: 0,
    yakuCollected: {},
    jokerSwapCount: 0,
    secondCharlestonCount: 0,
    hanakanCount: 0,
    totalRoundsPlayed: 0,
    clutch1PointCount: 0,
    recentRecords: [],

    // 詳細戦績・グラフ用の指標データ
    totalGamesPlayed: 0,
    rankCounts: [0, 0, 0, 0],
    totalWins: 0,
    totalTsumoWins: 0,
    totalCalls: 0,
    totalScoreSum: 0,
    maxComboCount: 0,
    welcomeHomeCount: 0,
    comebackCount: 0,
    masterOfSeasonsCount: 0,
    pacifistCount: 0,
    wideWaitCount: 0,
    sacrilegeCount: 0,
    suankoTrollCount: 0,
    chantaTrollCount: 0,
    evilRationalismCount: 0,
    kyukaSanfukuCount: 0,
    senshuBandaiCount: 0,
    tougetsuSekisokuCount: 0,
    tousenKaroCount: 0,
    noWinGameCount: 0,
    muhanaAddictionCount: 0,
    hezuezhangCount: 0
};

// 📊 CPU用のダミー戦績データ
const cpuStats = {
    1: { playerName: "CPU 1", totalGamesPlayed: 50, totalRoundsPlayed: 200, totalWins: 45, totalScoreSum: 75000, rankCounts: [12, 13, 13, 12], maxWinStreak: 3, yakuCollected: { "無花果": 20, "嶺上開花": 3 } },
    2: { playerName: "CPU 2", totalGamesPlayed: 48, totalRoundsPlayed: 190, totalWins: 38, totalScoreSum: 68000, rankCounts: [10, 12, 14, 12], maxWinStreak: 2, yakuCollected: { "無花果": 15, "妙手回春": 2 } },
    3: { playerName: "CPU 3", totalGamesPlayed: 55, totalRoundsPlayed: 220, totalWins: 52, totalScoreSum: 82000, rankCounts: [18, 12, 15, 10], maxWinStreak: 4, yakuCollected: { "無花果": 25, "花天月地": 4 } }
};

// 🏆 レート数値に応じたプレイヤーの「称号」文字列を返す関数
function getRatingTitle(rate) {
    if (rate < 1500) return "ざこ";
    if (rate < 1600) return "よわい";
    if (rate < 1700) return "ふつう";
    if (rate < 1800) return "つよい";
    if (rate < 1900) return "すごい";
    if (rate < 2000) return "やばい";
    return "あたまおかしい";
}

// 💾 プレイヤーのレートと実績（戦績）データをローカルストレージに保存する関数
function saveGameData() {
    if (typeof currentGameMode !== 'undefined' && (currentGameMode === 'lesson' || currentGameMode === 'tutorial')) return;
    const data = { ratings: playerRatings, stats: playerStats };
    // 🔐 ログイン中はアカウント別キーに保存（タブ独立）＋サーバーにも同期
    if (typeof isLoggedIn === 'function' && isLoggedIn()) {
        localStorage.setItem(`shiki_mahjong_data_${authUsername}`, JSON.stringify(data));
        // サーバーへ非同期保存（投げっぱなし）
        if (typeof authSave === 'function') authSave();
    } else {
        localStorage.setItem('shiki_mahjong_data', JSON.stringify(data));
    }
}

// 📂 ブラウザから実績とレートデータを読み込み、既存データとマージする関数
function loadGameData() {
    // 🔐 ログイン中は localStorage から読まない（サーバーが真のデータ源。authLoadAndApply が担当）
    // → これでログイン中の「一瞬古いデータが見える」ちらつきを防ぐ
    if (typeof isLoggedIn === 'function' && isLoggedIn()) {
        return;
    }
    const saved = localStorage.getItem('shiki_mahjong_data');
    if (saved) {
        const data = JSON.parse(saved);
        if (data.ratings) playerRatings = data.ratings;
        if (data.stats) playerStats = { ...playerStats, ...data.stats };
    }
}
window.addEventListener('DOMContentLoaded', loadGameData);

// ==========================================
// ★ マイページ・プロフィール関連
// ==========================================
let radarChart = null;
let pieChart = null;
let lineChart = null;

async function updateProfileUI() {
    const profNameEl = document.getElementById('prof-name');
    if (profNameEl) {
        profNameEl.innerHTML = `${escapeHTML(playerStats.playerName)} <span style="font-size: 16px; margin-left: 8px; opacity: 0.7;">✏️</span>`;
        profNameEl.style.cursor = "pointer";
        profNameEl.title = "名前と詳細戦績を確認・変更";
        profNameEl.onclick = () => openMyPage();
    }

    const profRankEl = document.getElementById('prof-rank');
    if (profRankEl) {
        let rate = playerRatings[0];
        profRankEl.innerText = `【${getRatingTitle(rate)}】 R:${rate}`;
        profRankEl.style.cursor = "pointer";
        profRankEl.onclick = () => openMyPage();
    }

    let retryCount = 0;
    while (typeof Chart === 'undefined' && retryCount < 10) {
        await new Promise(res => setTimeout(res, 200));
        retryCount++;
    }

    if (typeof Chart !== 'undefined') {
        if (lineChart) lineChart.destroy();
        const ctxLine = document.getElementById('prof-history-chart').getContext('2d');
        let recordsRev = playerStats.recentRecords.length > 0 ? [...playerStats.recentRecords].reverse() : [0];
        let lineData = recordsRev.map(r => (typeof r === 'object') ? r.rank : r);
        let scoreData = recordsRev.map(r => (typeof r === 'object') ? r.score : null);

        Chart.defaults.color = '#fff';
        lineChart = new Chart(ctxLine, {
            type: 'line',
            data: {
                labels: lineData.map((_, i) => `${lineData.length - i}戦前`),
                datasets: [{
                    label: '順位', data: lineData, borderColor: '#e67e22', backgroundColor: 'rgba(230, 126, 34, 0.2)',
                    borderWidth: 3, tension: 0.3, fill: true, pointBackgroundColor: '#f1c40f',
                    pointRadius: 6, pointHoverRadius: 8, clip: false
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                layout: { padding: { top: 15, bottom: 15, left: 10, right: 10 } },
                scales: {
                    y: { reverse: true, min: 1, max: 4, ticks: { stepSize: 1, color: '#fff', font: { size: 14, weight: 'bold' }, callback: function (value) { return value + "位"; } }, grid: { color: '#444' } },
                    x: { display: false }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)', titleFont: { size: 14 }, bodyFont: { size: 16, weight: 'bold' }, displayColors: false,
                        callbacks: {
                            label: function (context) {
                                let idx = context.dataIndex;
                                let score = scoreData[idx];
                                if (score !== null && score !== undefined) return `獲得スコア: ${score} 点`;
                                return `順位: ${context.parsed.y}位`;
                            }
                        }
                    }
                }
            }
        });
    }

    document.getElementById('best-score-val').innerText = `${playerStats.maxScore} 点`;
    const handTiles = document.getElementById('best-hand-tiles');
    handTiles.innerHTML = '';

    if (playerStats.maxScoreHand) {
        const { tiles, melds, winTile } = playerStats.maxScoreHand;
        if (melds && melds.length > 0) {
            melds.forEach((m) => {
                m.tiles.forEach((t, i) => {
                    let src = (m.type === 'ankan' && (i === 0 || i === 3)) ? 'ura' : t;
                    handTiles.innerHTML += `<img src="images/${src}.png" style="width:20px; height:28px; border-radius:2px; margin-right:1px;">`;
                });
                handTiles.innerHTML += `<div style="width:3px; display:inline-block;"></div>`;
            });
            handTiles.innerHTML += `<div style="width:2px; height:24px; background:#f1c40f; display:inline-block; vertical-align:middle; margin: 0 6px; opacity: 0.8;"></div>`;
        }

        [...tiles].sort((a, b) => SM[a] - SM[b]).forEach(t => {
            handTiles.innerHTML += `<img src="images/${t}.png" style="width:20px; height:28px; border-radius:2px; margin-right:1px;">`;
        });

        if (winTile) {
            handTiles.innerHTML += `<div style="width:8px; display:inline-block;"></div><img src="images/${winTile}.png" style="width:20px; height:28px; border:2px solid #f1c40f; border-radius:2px; box-sizing:border-box; box-shadow: 0 0 5px #f1c40f;">`;
        }
    }
    updateHomeStats();
}

function updateHomeStats() {
    let totalScore = playerStats.totalScoreSum || 0;
    const scoreEl = document.getElementById('home-lifetime-score');
    if (scoreEl) scoreEl.innerHTML = `${totalScore.toLocaleString()} <span style="font-size: 14px; color: #aaa;">点</span>`;

    let yakuData = playerStats.yakuCollected || {};
    let collectedCount = Object.values(yakuData).filter(count => count > 0).length;
    let totalYaku = 45;
    let progressPercent = Math.min(Math.floor((collectedCount / totalYaku) * 100), 100);

    const textEl = document.getElementById('home-yaku-progress-text');
    const barEl = document.getElementById('home-yaku-progress-bar');
    if (textEl && barEl) {
        textEl.innerText = `${collectedCount} / ${totalYaku} 役 (${progressPercent}%)`;
        setTimeout(() => { barEl.style.width = `${progressPercent}%`; }, 100);
    }
}

function updateStatsModalUI(targetStats) {
    //console.log("[DEBUG] 📊 updateStatsModalUI 開始 (絶対アニメーション発動版)");

    // --- 指標計算 ---
    let totalG = targetStats.totalGamesPlayed || 0;
    let totalR = targetStats.totalRoundsPlayed || 1;
    let totalW = targetStats.totalWins || 0;
    let totalScore = targetStats.totalScoreSum || 0;
    let avgRank = totalG > 0 ? ((targetStats.rankCounts[0] * 1 + targetStats.rankCounts[1] * 2 + targetStats.rankCounts[2] * 3 + targetStats.rankCounts[3] * 4) / totalG).toFixed(2) : "0.00";
    let topRate = totalG > 0 ? ((targetStats.rankCounts[0] / totalG) * 100).toFixed(2) : "0.00";
    let avgWins = (totalW / totalR).toFixed(1);
    let avgWinScore = totalW > 0 ? Math.floor(totalScore / totalW) : 0;
    let muhanaRate = totalW > 0 ? (((targetStats.yakuCollected["無花果"] || 0) / totalW) * 100).toFixed(2) : "0.00";
    let luckRate = totalW > 0 ? ((((targetStats.yakuCollected["嶺上開花"] || 0) + (targetStats.yakuCollected["妙手回春"] || 0) + (targetStats.yakuCollected["花天月地"] || 0)) / totalW) * 100).toFixed(2) : "0.00";

    document.getElementById('stat-total-games').innerText = totalG;
    document.getElementById('stat-avg-rank').innerText = avgRank;
    document.getElementById('stat-top-rate').innerText = topRate + "%";
    document.getElementById('stat-lifetime-score').innerHTML = `${totalScore.toLocaleString()} <span style="font-size: 18px; color: #aaa;">点</span>`;

    // ========================================================
    // 1. レーダーチャート（ゼロから実数値へアニメーションさせる）
    // ========================================================
    let radarContainer = document.getElementById('mypage-radar-wrapper');
    if (radarContainer) {
        // DOMを綺麗に初期化（余計な非表示処理を排除）
        radarContainer.innerHTML = `<canvas id="mypage-radar-chart" style="width:100%; height:100%; display:block;"></canvas>`;
        let canvasRadar = document.getElementById('mypage-radar-chart');

        if (typeof radarChart !== 'undefined' && radarChart) radarChart.destroy();

        let chartAvgWins = Math.min(Math.sqrt(avgWins / 60) * 100, 100);
        let chartAvgScore = Math.min(Math.sqrt(avgWinScore / 2000) * 100, 100);
        let chartMuhana = Math.min((muhanaRate / 80) * 100, 100);
        let chartLuckRate = Math.min((luckRate / 15) * 100, 100);

        // ① 初期データは「すべて0」で作る（画面表示時のスキップバグを無効化）
        radarChart = new Chart(canvasRadar.getContext('2d'), {
            type: 'radar',
            data: {
                labels: ['トップ率', '1局平均和了', '1局平均スコア', '無花果率', '天運'],
                datasets: [{
                    data: [0, 0, 0, 0, 0], // 🌟 最初はゼロ
                    backgroundColor: 'rgba(52, 152, 219, 0.4)', borderColor: '#3498db', pointBackgroundColor: '#f1c40f', borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 1200, easing: 'easeOutQuart' },
                devicePixelRatio: window.devicePixelRatio || 1,
                scales: { r: { min: 0, max: 100, ticks: { display: false }, grid: { color: '#555' }, pointLabels: { color: '#ecf0f1', font: { size: 14, weight: 'bold' } } } },
                plugins: { legend: { display: false } }
            }
        });

        // ② モーダルが完全に開いた後（100ms後）に実数値を流し込んで更新する！
        setTimeout(() => {
            if (radarChart) {
                radarChart.data.datasets[0].data = [topRate, chartAvgWins, chartAvgScore, chartMuhana, chartLuckRate];
                radarChart.update();
            }
        }, 100);
    }

    // ========================================================
    // 2. 円グラフ（0度から360度へアニメーションさせる）
    // ========================================================
    let pieWrapper = document.getElementById('mypage-pie-wrapper');
    if (pieWrapper) {
        // 🌟 レイアウト崩れを永久に防ぐ、強固なHTML構造で上書き
        pieWrapper.style.display = 'flex';
        pieWrapper.style.flexDirection = 'row';
        pieWrapper.style.alignItems = 'center';
        pieWrapper.style.justifyContent = 'center';
        pieWrapper.style.gap = '20px';
        pieWrapper.innerHTML = `
            <div style="width: 180px; height: 180px; flex-shrink: 0; position: relative;">
                <canvas id="mypage-rank-pie-chart" style="width:100%; height:100%; display:block;"></canvas>
            </div>
            <div id="mypage-pie-legend" style="display: flex; flex-direction: column; justify-content: center; gap: 10px; font-size: 14px; color: #fff; min-width: 120px;"></div>
        `;

        if (typeof pieChart !== 'undefined' && pieChart) pieChart.destroy();
        let isZeroData = totalG === 0;
        let canvasPie = document.getElementById('mypage-rank-pie-chart');

        // ① 初期設定で circumference: 0 (角度0＝見えない状態) にしておく
        pieChart = new Chart(canvasPie.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: isZeroData ? ['未プレイ'] : ['1位', '2位', '3位', '4位'],
                datasets: [{
                    data: isZeroData ? [1] : targetStats.rankCounts,
                    backgroundColor: isZeroData ? ['#333333'] : ['#e74c3c', '#e67e22', '#3498db', '#95a5a6'],
                    borderColor: '#2c3e50',
                    borderWidth: 2
                }]
            },
            options: {
                circumference: 0, // 🌟 最初は0度（見えない）
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 1200, easing: 'easeOutQuart' },
                devicePixelRatio: window.devicePixelRatio || 1,
                layout: { padding: 0 },
                plugins: { legend: { display: false }, tooltip: { enabled: !isZeroData } }
            }
        });

        // ② モーダルが開いた後（100ms後）に360度へ展開するよう指示を出す！
        setTimeout(() => {
            if (pieChart) {
                pieChart.options.circumference = 360;
                pieChart.update();
            }
        }, 100);

        // 凡例の生成
        let legendDiv = document.getElementById('mypage-pie-legend');
        if (isZeroData) {
            legendDiv.innerHTML = `<span style="color: #aaa;">データなし</span>`;
        } else {
            const colors = ['#e74c3c', '#e67e22', '#3498db', '#95a5a6'];
            const labels = ['1位', '2位', '3位', '4位'];
            let html = '';
            for (let i = 0; i < 4; i++) {
                const count = targetStats.rankCounts[i];
                const percentage = totalG > 0 ? ((count / totalG) * 100).toFixed(1) : 0;
                html += `
                <div style="display:flex; align-items:center; gap:8px; white-space:nowrap;">
                    <div style="width:12px; height:12px; background-color:${colors[i]}; border-radius:2px; flex-shrink:0;"></div>
                    <div style="display:flex; flex-direction:column; line-height:1.2;">
                        <span style="font-weight:bold;">${labels[i]} ${percentage}%</span>
                        <span style="font-size:11px; color:#aaa;">(${count}回)</span>
                    </div>
                </div>`;
            }
            legendDiv.innerHTML = html;
        }
    }
    //console.log("[DEBUG] 🏁 updateStatsModalUI 終了");
}

function updateNameCounter(val) {
    const counter = document.getElementById('name-char-counter');
    if (counter) {
        counter.innerText = `${val.length}/10`;
        counter.style.color = val.length >= 10 ? '#e74c3c' : '#aaa';
    }
}

function saveNewName() {
    let newName = document.getElementById('input-player-name').value.trim();
    if (!newName) {
        newName = "名無し";
        document.getElementById('input-player-name').value = newName;
    }
    const safeNameRegex = /^[ぁ-んァ-ヶ一-龠々a-zA-Z0-9_ー]+$/;
    if (newName !== "名無し" && !safeNameRegex.test(newName)) {
        playSE('alert');
        alert("【エラー】名前には「ひらがな・カタカナ・漢字・英数字・アンダーバー」のみ使用できます。");
        return;
    }
    playerStats.playerName = newName;
    saveGameData();
    updateProfileUI();
    updateNameCounter(newName);

    if (typeof updateInfoUI === 'function') updateInfoUI();

    alert(`名前を「${newName}」に変更しました！`);
    if (typeof closeMyPage === 'function') closeMyPage();
}

function clearNameInput() {
    const input = document.getElementById('input-player-name');
    input.value = '';
    input.focus();
    updateNameCounter('');
}

// ==========================================
// ★ 実績描画とポップアップ制御
// ==========================================

function switchAchieveTab(evt, tabId) {
    const tabContents = document.getElementsByClassName("achieve-tab-content");
    for (let i = 0; i < tabContents.length; i++) tabContents[i].style.display = "none";
    const tabLinks = document.getElementsByClassName("yaku-tab-btn");
    for (let i = 0; i < tabLinks.length; i++) tabLinks[i].classList.remove("active");
    document.getElementById(tabId).style.display = "block";
    evt.currentTarget.classList.add("active");

    // 🌟 ここに追加：タブ切り替え時にスクロール位置を一番上（0）に戻す
    const container = document.getElementById('achievement-list-container');
    if (container) {
        container.scrollTop = 0;
        //console.log(`[DEBUG タブ切り替え] 表示タブ変更 [${tabId}]: スクロール位置を一番上に戻しました。現在の scrollTop = ${container.scrollTop}`);
    } else {
        //console.error("[DEBUG タブ切り替え] 🚨 スクロール対象の 'achievement-list-container' が見つかりません。");
    }
}

function getYakuRankClass(yakuName, count) {
    if (count <= 0) return "locked";
    const specialThresholds = {
        "七星不靠": { silver: 10, gold: 50, platinum: 200 },
        "十三幺九": { silver: 10, gold: 100, platinum: 500 },
        "寒江独釣": { silver: 10, gold: 50, platinum: 200 },
        "無番和": { silver: 20, gold: 50, platinum: 200 },
        "槍槓": { silver: 3, gold: 5, platinum: 10 },
    };

    let thresholds;
    if (specialThresholds[yakuName]) {
        thresholds = specialThresholds[yakuName];
    } else {
        const tier = typeof getYakuTierClass === 'function' ? getYakuTierClass(yakuName) : "yaku-tier-1";
        thresholds = { silver: 50, gold: 200, platinum: 1000 };
        if (tier === "yaku-tier-64") thresholds = { silver: 3, gold: 5, platinum: 10 };
        else if (tier === "yaku-tier-32") thresholds = { silver: 5, gold: 10, platinum: 15 };
        else if (tier === "yaku-tier-16") thresholds = { silver: 5, gold: 20, platinum: 50 };
        else if (tier === "yaku-tier-8") thresholds = { silver: 20, gold: 50, platinum: 100 };
        else if (tier === "yaku-tier-6") thresholds = { silver: 20, gold: 50, platinum: 150 };
        else if (tier === "yaku-tier-4") thresholds = { silver: 50, gold: 100, platinum: 500 };
        else if (tier === "yaku-tier-2") thresholds = { silver: 50, gold: 200, platinum: 1000 };
        else if (tier === "yaku-tier-multi") thresholds = { silver: 10, gold: 20, platinum: 50 };
    }

    if (count >= thresholds.platinum) return "platinum";
    if (count >= thresholds.gold) return "gold";
    if (count >= thresholds.silver) return "silver";
    return "bronze";
}

function renderAchievements() {
    const container = document.getElementById('achieve-container');
    if (!container) return;
    container.innerHTML = '';

    let currentRate = playerRatings[0];
    let totalScore = playerStats.totalScoreSum || 0;

    const achievements = [
        { id: "rating", icon: "📈", title: "レートの階段", desc: "自身のレート(R)を指定値まで上げる", val: currentRate, tiers: [1600, 1700, 1800, 1900], unit: "R" },
        { id: "billionaire", icon: "🏦", title: "大富豪", desc: "生涯の累計獲得点数", val: totalScore, tiers: [1000, 10000, 50000, 1000000], unit: "点" },
        { id: "score", icon: "💰", title: "最高到達打点", desc: "1局での最高獲得点数", val: playerStats.maxScore, tiers: [100, 500, 1000, 2000], unit: "点" },
        { id: "streak", icon: "🔥", title: "連勝記録", desc: "総合1位を連続で獲得した回数", val: playerStats.maxWinStreak, tiers: [2, 5, 7, 10], unit: "連勝" },
        { id: "rounds", icon: "⏳", title: "継続は力なり", desc: "対局を完了した累計局数", val: playerStats.totalRoundsPlayed, tiers: [10, 100, 1000, 5000], unit: "局" },
        { id: "charleston", icon: "🔄", title: "チャールストンの愛し子", desc: "第2交換に参加した回数", val: playerStats.secondCharlestonCount, tiers: [5, 50, 500, 2500], unit: "回" },
        { id: "hanakan", icon: "🌸", title: "花槓マスター", desc: "四季牌を使って花槓を作った回数", val: playerStats.hanakanCount, tiers: [10, 50, 100, 500], unit: "回" },
        { id: "jokerswap", icon: "🃏", title: "スワップの支配者", desc: "JokerSwapを成功させた回数", val: playerStats.jokerSwapCount, tiers: [1, 10, 50, 150], unit: "回" },

        { id: "rating_god", icon: "👑", title: "頂に立つ者", desc: "レート2000(称号「あたまおかしい」)到達", val: currentRate >= 2000 ? 1 : 0, tiers: [1, 1, 1, 1], unit: "回" },
        { id: "wide_wait", icon: "🌀", title: "無限の選択肢", desc: "聴牌時の待ち牌が「27種類」ある状態で和了", val: playerStats.wideWaitCount, tiers: [1, 1, 1, 1], unit: "回" },
        { id: "master_of_seasons", icon: "🌍", title: "四季常春", desc: "1局の手牌に四季牌4種すべてを揃えて和了", val: playerStats.masterOfSeasonsCount, tiers: [1, 1, 1, 1], unit: "回" },
        { id: "full_house", icon: "🌈", title: "インフレの体現者", desc: "1局で7種類以上の役を複合させる", val: playerStats.maxComboCount >= 7 ? 1 : 0, tiers: [1, 1, 1, 1], unit: "回" },
        { id: "welcomehome", icon: "🎲", title: "おかえりなさい", desc: "交換で出した3枚と同じ3枚を受け取る", val: playerStats.welcomeHomeCount, tiers: [1, 1, 1, 1], unit: "回" },
        { id: "pacifist", icon: "🕊️", title: "漁夫の利", desc: "和了0回でその局の順位が1位になる", val: playerStats.pacifistCount, tiers: [1, 1, 1, 1], unit: "回" },
        { id: "comeback", icon: "💊", title: "逆転の劇薬", desc: "4局開始時4位から1位で終了する", val: playerStats.comebackCount, tiers: [1, 1, 1, 1], unit: "回" },

        { id: "fastest_strongest", icon: "⚡", title: "最速最強", desc: "天胡を和了する", val: playerStats.yakuCollected["天胡"] || 0, tiers: [1, 1, 1, 1], unit: "回" },
        { id: "earthly_surprise", icon: "😲", title: "あっ！(胡！)", desc: "地胡を和了する", val: playerStats.yakuCollected["地胡"] || 0, tiers: [1, 1, 1, 1], unit: "回" },
        { id: "meteor_shower", icon: "🌠", title: "流星群", desc: "七星攬月を和了する", val: playerStats.yakuCollected["七星攬月"] || 0, tiers: [1, 1, 1, 1], unit: "回" },
        { id: "mature_wisdom", icon: "👴", title: "老成円熟", desc: "清幺九を和了する", val: playerStats.yakuCollected["清幺九"] || 0, tiers: [1, 1, 1, 1], unit: "回" },
        { id: "ryanpeiko", icon: "👯", title: "二盃口！", desc: "連七対を和了する", val: playerStats.yakuCollected["連七対"] || 0, tiers: [1, 1, 1, 1], unit: "回" },
        { id: "namu_amida_butsu", icon: "🙏", title: "南無阿弥陀仏", desc: "九連宝燈を和了する", val: playerStats.yakuCollected["九連宝燈"] || 0, tiers: [1, 1, 1, 1], unit: "回" },
        { id: "buddha_face", icon: "💢", title: "仏の顔も三度まで", desc: "十八羅漢を和了する", val: playerStats.yakuCollected["十八羅漢"] || 0, tiers: [1, 1, 1, 1], unit: "回" },
        { id: "wind_god", icon: "🌪️", title: "風神降臨", desc: "大四風会を和了する", val: playerStats.yakuCollected["大四風会"] || 0, tiers: [1, 1, 1, 1], unit: "回" },
        { id: "golden_gate", icon: "🌉", title: "金門橋", desc: "一色四節高を和了する", val: playerStats.yakuCollected["一色四節高"] || 0, tiers: [1, 1, 1, 1], unit: "回" },
        { id: "tiger_glare", icon: "🐅", title: "虎視眈々", desc: "一色四歩高を和了する", val: playerStats.yakuCollected["一色四歩高"] || 0, tiers: [1, 1, 1, 1], unit: "回" },
        { id: "peacock_joy", icon: "🦚", title: "孔雀報喜", desc: "紅孔雀を和了する", val: playerStats.yakuCollected["紅孔雀"] || 0, tiers: [1, 1, 1, 1], unit: "回" },
        { id: "is_this_agari", icon: "🤔", title: "これ和了なの？", desc: "七星不靠を和了する", val: playerStats.yakuCollected["七星不靠"] || 0, tiers: [1, 1, 1, 1], unit: "回" },
        { id: "black_monochrome", icon: "⬛", title: "黒一色", desc: "陰陽両儀を和了する", val: playerStats.yakuCollected["陰陽両儀"] || 0, tiers: [1, 1, 1, 1], unit: "回" },
        { id: "trinity", icon: "🐉", title: "三位一体", desc: "大三元を和了する", val: playerStats.yakuCollected["大三元"] || 0, tiers: [1, 1, 1, 1], unit: "回" },
        { id: "dizzy", icon: "🌀", title: "目が回る", desc: "推不倒を累計8回和了する", val: playerStats.yakuCollected["推不倒"] || 0, tiers: [8, 8, 8, 8], unit: "回" },
        { id: "now_is_the_time", icon: "🎯", title: "今だ！(仮)", desc: "槍槓を和了する", val: playerStats.yakuCollected["槍槓"] || 0, tiers: [1, 1, 1, 1], unit: "回" },
        { id: "falling_flowers", icon: "🥀", title: "花落知多少", desc: "花天月地を和了する", val: playerStats.yakuCollected["花天月地"] || 0, tiers: [1, 1, 1, 1], unit: "回" },

        { id: "sacrilege", icon: "🚮", title: "罰当たり", desc: "1局で四季牌を2枚切る", val: playerStats.sacrilegeCount, tiers: [1, 1, 1, 1], unit: "回", secret: false },
        { id: "suanko_troll", icon: "😎", title: "四暗刻！", desc: "碰碰胡を面前で和了する", val: playerStats.suankoTrollCount, tiers: [1, 1, 1, 1], unit: "回", secret: false },
        { id: "chanta_troll", icon: "🤪", title: "チャンタってある？", desc: "無番和かつチャンタの形で和了する", val: playerStats.chantaTrollCount, tiers: [1, 1, 1, 1], unit: "回", secret: false },
        { id: "evil_rationalism", icon: "😈", title: "悪の合理主義", desc: "4局全て全単で和了する", val: playerStats.evilRationalismCount, tiers: [1, 1, 1, 1], unit: "回", secret: false },
        { id: "kyuka_sanfuku", icon: "☀️", title: "九夏三伏", desc: "手牌の数牌の数の合計が30以下もしくは90以上", val: playerStats.kyukaSanfukuCount, tiers: [1, 1, 1, 1], unit: "回", secret: false },
        { id: "senshu_bandai", icon: "⏳", title: "千秋万代", desc: "1局の中で最初の和了と最後の和了をする", val: playerStats.senshuBandaiCount, tiers: [1, 1, 1, 1], unit: "回", secret: false },
        { id: "tougetsu_sekisoku", icon: "👣", title: "冬月赤足", desc: "1,9萬と1,6,7筒を手牌に含めて和了", val: playerStats.tougetsuSekisokuCount, tiers: [1, 1, 1, 1], unit: "回", secret: false },
        { id: "tousen_karo", icon: "⛄", title: "冬扇夏炉", desc: "無花の状態で春を自摸", val: playerStats.tousenKaroCount, tiers: [1, 1, 1, 1], unit: "回", secret: false },
        { id: "no_win_game", icon: "☕", title: "暖かい紅茶でもいかが？", desc: "一度も和了をせずに対局終了", val: playerStats.noWinGameCount, tiers: [1, 1, 1, 1], unit: "回", secret: false },
        { id: "muhana_addiction", icon: "🍂", title: "無花果依存症", desc: "4局全てで一回以上無花果で和了する", val: playerStats.muhanaAddictionCount, tiers: [1, 1, 1, 1], unit: "回", secret: false },
        { id: "he_jue_zhang", icon: "🀄", title: "和絶張", desc: "場に3枚見えている牌の最後の1枚で和了する(四季牌除く)", val: playerStats.hezuezhangCount || 0, tiers: [1, 1, 1, 1], unit: "回", secret: false },
        { id: "oya_shirazu", icon: "🦷", title: "親知らず", desc: "一回も荘家（親番）をやらずに連帯（2位以上）する", val: playerStats.oyaShirazuCount || 0, tiers: [1, 1, 1, 1], unit: "回", secret: false }
    ];

    let gridHtml = ``;

    achievements.forEach(a => {
        let rank = 0;
        if (a.val >= a.tiers[3]) rank = 4;
        else if (a.val >= a.tiers[2]) rank = 3;
        else if (a.val >= a.tiers[1]) rank = 2;
        else if (a.val >= a.tiers[0]) rank = 1;

        let medalClass = ["medal-none", "medal-bronze", "medal-silver", "medal-gold", "medal-platinum"][rank];
        let statusText = rank === 0 ? "未達成" : ["", "ブロンズ", "シルバー", "ゴールド", "プラチナ"][rank] + " 獲得！";
        let statusColor = rank === 0 ? "#7f8c8d" : ["", "#cd7f32", "#bdc3c7", "#f1c40f", "#00d2d3"][rank];

        let nextTarget = a.tiers[Math.min(rank, 3)];
        let isOneShot = (a.tiers[0] === 1 && a.tiers[3] === 1);
        let progressPercent = (rank >= 4 || (isOneShot && rank >= 1)) ? 100 : Math.min(100, (a.val / nextTarget) * 100);

        let displayTitle = a.title;
        let displayDesc = a.desc;
        let displayIcon = a.icon;

        if (a.secret && rank === 0) {
            displayTitle = "？？？";
            displayDesc = "秘密の条件を達成して実績を解除しよう";
            displayIcon = "🔒";
            medalClass += " secret-achievement";
        }

        gridHtml += `
            <div class="achieve-card ${medalClass}">
                <div class="achieve-icon">${displayIcon}</div>
                <div class="achieve-title">${displayTitle}</div>
                <div class="achieve-desc">${displayDesc}</div>
                <div class="achieve-progress-bg">
                    <div class="achieve-progress-bar" style="width: ${progressPercent}%; background: ${statusColor};"></div>
                </div>
                <div style="width: 100%; display: flex; justify-content: space-between; font-size: 11px; color: #aaa; margin-bottom: 5px;">
                    <span>現在: ${a.secret && rank === 0 ? "?" : a.val} ${a.unit === "R" ? "" : a.unit}</span>
                    <span>${(rank >= 4 || (isOneShot && rank >= 1)) ? "MAX" : "次: " + (a.secret && rank === 0 ? "?" : nextTarget) + (a.unit === "R" ? "" : " " + a.unit)}</span>
                </div>
                <div class="achieve-status" style="color: ${statusColor};">${statusText}</div>
            </div>
        `;
    });
    container.innerHTML = gridHtml;

    // --- 役図鑑 ---
    const dexContainer = document.getElementById('yaku-dex-container');
    if (!dexContainer || typeof yakuJaMap === 'undefined') return;
    dexContainer.innerHTML = '';

    const allYakuList = Object.keys(yakuJaMap);
    let collectedCount = 0;
    let yakuByTier = { "64": [], "32": [], "16": [], "8": [], "6": [], "4": [], "2": [], "multi": [] };

    allYakuList.forEach(yakuZh => {
        let tierClass = getYakuTierClass(yakuZh);
        let key = "2";
        if (tierClass.includes("64")) key = "64";
        else if (tierClass.includes("32")) key = "32";
        else if (tierClass.includes("16")) key = "16";
        else if (tierClass.includes("8")) key = "8";
        else if (tierClass.includes("6")) key = "6";
        else if (tierClass.includes("4")) key = "4";
        else if (tierClass.includes("multi")) key = "multi";
        if (yakuByTier[key]) yakuByTier[key].push(yakuZh);
    });

    const tierNameMap = {
        "64": { ja: "👑 64点役", zh: "64点", en: "64 Points" },
        "32": { ja: "🔥 32点役", zh: "32点", en: "32 Points" },
        "16": { ja: "⚔️ 16点役", zh: "16点", en: "16 Points" },
        "8": { ja: "🔮 8点役", zh: "8点", en: "8 Points" },
        "6": { ja: "💎 6点役", zh: "6点", en: "6 Points" },
        "4": { ja: "🛡️ 4点役", zh: "4点", en: "4 Points" },
        "2": { ja: "🛡️ 2点・1点役", zh: "2点・1点", en: "2 , 1 Points" },
        "multi": { ja: "✨ 特殊役 (乗算)", zh: "特殊", en: "Special" }
    };

    ["64", "32", "16", "8", "6", "4", "2", "multi"].forEach(tierKey => {
        const yakuList = yakuByTier[tierKey];
        if (yakuList.length === 0) return;
        let names = tierNameMap[tierKey];
        let tierHtml = `
            <div class="yaku-dex-tier-group">
                <div class="yaku-dex-tier-header">
                    <span class="zh">${names.zh}</span><span class="ja">${names.ja}</span><span class="en">${names.en}</span>
                </div>
                <div class="yaku-dex-card-grid">`;

        yakuList.forEach(yakuZh => {
            let count = playerStats.yakuCollected[yakuZh] || 0;
            if (count > 0) collectedCount++;
            let rankClass = getYakuRankClass(yakuZh, count);

            tierHtml += `
                <div class="yaku-dex-card ${rankClass}">
                    <div class="dex-title-area" style="margin-bottom: 0;">
                        <span class="dex-yaku-name">
                            <span class="zh">${yakuZh}</span>
                            <span class="ja">${getJaYakuName(yakuZh)}</span>
                            <span class="en">${getEnYakuName(yakuZh)}</span>
                        </span>
                        <span class="dex-points">和了: ${count} 回</span>
                    </div>
                </div>`;
        });
        tierHtml += `</div></div>`;
        dexContainer.innerHTML += tierHtml;
    });

    document.getElementById('dex-comp-count').innerText = collectedCount;
    document.getElementById('dex-total-count').innerText = allYakuList.length;
}

// ==========================================
// 🏆 実績解除ポップアップ表示システム
// ==========================================
let toastQueue = [];
let isToastShowing = false;

function showAchievementUnlock(name, icon = "🏆") {
    if (typeof currentGameMode !== 'undefined' && (currentGameMode === 'lesson' || currentGameMode === 'tutorial')) return;
    toastQueue.push({ name, icon });
    if (!isToastShowing) processToastQueue();
}

async function processToastQueue() {
    if (toastQueue.length === 0) {
        isToastShowing = false;
        return;
    }
    isToastShowing = true;
    let achieve = toastQueue.shift();

    const toast = document.getElementById('achievement-toast');
    if (!toast) {
        isToastShowing = false;
        return;
    }

    document.getElementById('toast-icon').innerText = achieve.icon;
    document.getElementById('toast-name').innerText = achieve.name;

    if (typeof playSE === 'function') playSE('coin');

    // 🌟 マウスを乗せたら「押せるよ」と分かるようにカーソルを指マークにする
    toast.style.cursor = "pointer";

    toast.classList.add('toast-show');

    // 🌟 修正：トースト自体ではなく「画面全体（document.body）」のクリック・タップを監視する！
    await new Promise(resolve => {
        let timeoutId;

        // クリック・タップされた時のスキップ処理
        const skipHandler = (e) => {
            if (typeof playSE === 'function') playSE('click');
            clearTimeout(timeoutId); // 4秒待つタイマーを即座に破壊
            document.body.removeEventListener('mousedown', skipHandler);
            document.body.removeEventListener('touchstart', skipHandler);
            resolve(); // 待機を終了させる
        };

        // 誤爆（トーストが出た瞬間のクリックを拾ってしまう現象）を防ぐため、0.1秒だけ待ってから判定を有効にする
        setTimeout(() => {
            document.body.addEventListener('mousedown', skipHandler);
            document.body.addEventListener('touchstart', skipHandler);
        }, 100);

        // 誰もクリックしなかった場合の通常処理（4秒後に自動で消える）
        timeoutId = setTimeout(() => {
            document.body.removeEventListener('mousedown', skipHandler);
            document.body.removeEventListener('touchstart', skipHandler);
            resolve(); // 待機を終了させる
        }, 4000);
    });

    toast.classList.remove('toast-show');

    // 🌟 引っ込んだ後、次の実績が出るまでのインターバル
    await new Promise(res => setTimeout(res, 300));
    processToastQueue();
}

function checkTieredAchievement(id, title, icon, oldVal, newVal, tiers) {
    if (typeof currentGameMode !== 'undefined' && (currentGameMode === 'lesson' || currentGameMode === 'tutorial')) return;
    for (let i = 0; i < tiers.length; i++) {
        if (oldVal < tiers[i] && newVal >= tiers[i]) {
            let rankName = ["ブロンズ", "シルバー", "ゴールド", "プラチナ"][i];
            showAchievementUnlock(`${title} (${rankName})`, icon);
        }
    }
}

// ==========================================
// ★ デバッグ用：ダミーデータの注入
// ==========================================
function injectDummyData() {
    if (!confirm("現在のセーブデータを上書きして、テスト用の実績データを注入しますか？")) return;
    playerRatings[0] = 1850;
    playerStats.playerName = "DummyData";
    playerStats.totalGamesPlayed = 100;
    playerStats.rankCounts = [97, 1, 1, 1];
    playerStats.totalRoundsPlayed = 342;
    playerStats.totalWins = 8550;
    playerStats.totalScoreSum = 4702500;
    playerStats.totalTsumoWins = 3500;
    playerStats.totalCalls = 16500;
    playerStats.currentWinStreak = 4;
    playerStats.maxWinStreak = 12;
    playerStats.jokerSwapCount = 420;
    playerStats.secondCharlestonCount = 115;
    playerStats.hanakanCount = 204;
    playerStats.clutch1PointCount = 85;
    playerStats.recentRecords = [
        { rank: 1, score: 2048 }, { rank: 2, score: 850 }, { rank: 1, score: 1420 }, { rank: 1, score: 1900 }, { rank: 3, score: -200 },
        { rank: 2, score: 400 }, { rank: 1, score: 1100 }, { rank: 4, score: -850 }, { rank: 1, score: 1600 }, { rank: 2, score: 300 },
        { rank: 3, score: -100 }, { rank: 1, score: 2100 }, { rank: 2, score: 500 }, { rank: 4, score: -1200 }, { rank: 1, score: 1300 },
        { rank: 2, score: 600 }, { rank: 1, score: 1750 }, { rank: 3, score: -400 }, { rank: 2, score: 700 }, { rank: 1, score: 1550 }
    ];
    playerStats.maxScore = 2048;
    playerStats.maxScoreHand = { tiles: ["1s", "1s", "1s", "2s", "3s", "4s", "5s", "6s", "7s", "8s", "9s", "9s", "9s"], melds: [], winTile: "5s" };
    playerStats.yakuCollected = {
        "天胡": 5, "地胡": 1, "九連宝燈": 3, "十八羅漢": 12, "大四風会": 8, "大三元": 40, "清一色": 150,
        "無花果": 3800, "槓上開花": 450, "妙手回春": 120, "花天月地": 80,
        "対々和": 1242, "七対": 828, "混一色": 933, "小三元": 108, "無番和": 2500, "断么": 3120, "刮風": 1045, "下雨": 830
    };
    saveGameData();
    alert("超絶インフレ版ダミーデータを注入しました！\n画面をリロードして反映します。");
    location.reload();
}

function resetToInitialData() {
    if (!confirm("データを完全に初期化し、インストール直後の状態に戻しますか？")) return;
    _resetPlayerStatsToDefaults();
    saveGameData();
    // 🌟 レッスンクリアデータもアカウント別キーで削除
    const _lkey = (typeof window.getLessonsStorageKey === 'function')
        ? window.getLessonsStorageKey() : 'shiki_mahjong_lessons';
    localStorage.removeItem(_lkey);
    alert("データを完全初期化しました！\n画面をリロードして反映します。");
    location.reload();
}

// 🌟 playerStats と playerRatings を完全に初期値にリセット（アカウント切り替え等で使用）
function _resetPlayerStatsToDefaults() {
    playerRatings = [1500, 1500, 1500, 1500];
    playerStats = {
        playerName: "あなた",
        maxScore: 0,
        maxScoreHand: null,
        currentWinStreak: 0,
        maxWinStreak: 0,
        yakuCollected: {},
        jokerSwapCount: 0,
        secondCharlestonCount: 0,
        hanakanCount: 0,
        totalRoundsPlayed: 0,
        clutch1PointCount: 0,
        recentRecords: [],
        totalGamesPlayed: 0,
        rankCounts: [0, 0, 0, 0],
        totalWins: 0,
        totalTsumoWins: 0,
        totalCalls: 0,
        totalScoreSum: 0,
        maxComboCount: 0,
        welcomeHomeCount: 0,
        comebackCount: 0,
        masterOfSeasonsCount: 0,
        pacifistCount: 0,
        wideWaitCount: 0,
        sacrilegeCount: 0,
        suankoTrollCount: 0,
        chantaTrollCount: 0,
        evilRationalismCount: 0,
        kyukaSanfukuCount: 0,
        senshuBandaiCount: 0,
        tougetsuSekisokuCount: 0,
        tousenKaroCount: 0,
        noWinGameCount: 0,
        muhanaAddictionCount: 0,
        hezuezhangCount: 0
    };
}
// グローバル公開（auth.js から呼ぶため）
window._resetPlayerStatsToDefaults = _resetPlayerStatsToDefaults;

function injectBeginnerData() {
    if (!confirm("現在のセーブデータを上書きして、初心者(10ゲームプレイ済み)のデータを注入しますか？")) return;
    playerRatings[0] = 1599;
    playerStats.playerName = "ビギナー";
    playerStats.totalGamesPlayed = 10;
    playerStats.rankCounts = [3, 4, 2, 1];
    playerStats.totalRoundsPlayed = 38;
    playerStats.totalWins = 8;
    playerStats.totalScoreSum = 8500;
    playerStats.currentWinStreak = 1;
    playerStats.maxWinStreak = 2;
    playerStats.jokerSwapCount = 2;
    playerStats.secondCharlestonCount = 8;
    playerStats.hanakanCount = 5;
    playerStats.recentRecords = [
        { rank: 1, score: 1200 }, { rank: 2, score: 800 }, { rank: 4, score: -500 }, { rank: 2, score: 900 }, { rank: 3, score: 100 },
        { rank: 1, score: 1500 }, { rank: 2, score: 600 }, { rank: 3, score: 200 }, { rank: 2, score: 700 }, { rank: 1, score: 1800 }
    ];
    playerStats.maxScore = 1800;
    playerStats.maxScoreHand = { tiles: ["1m", "1m", "1m", "5p", "6p", "7p", "2s", "3s", "4s", "東", "東"], melds: [{ type: "pon", tiles: ["白", "白", "白"] }], winTile: "東" };
    playerStats.yakuCollected = { "断么": 3, "碰碰胡": 2, "混一色": 1, "無番和": 4, "刮風": 2 };
    playerStats.maxComboCount = 2;
    playerStats.welcomeHomeCount = 0;
    playerStats.comebackCount = 0;
    playerStats.masterOfSeasonsCount = 0;
    playerStats.pacifistCount = 0;
    playerStats.wideWaitCount = 0;
    saveGameData();
    alert("初心者用ダミーデータを注入しました！\n画面をリロードして反映します。");
    location.reload();
}

function testUnlockAchievement(id) {
    if (id === 'rating_god') playerRatings[0] = 2000;
    else if (id === 'wide_wait') playerStats.wideWaitCount = 1;
    else if (id === 'master_of_seasons') playerStats.masterOfSeasonsCount = 1;
    else if (id === 'full_house') playerStats.maxComboCount = 7;
    else if (id === 'welcomehome') playerStats.welcomeHomeCount = 1;
    else if (id === 'pacifist') playerStats.pacifistCount = 1;
    else if (id === 'comeback') playerStats.comebackCount = 1;
    else if (id === 'clutch') playerStats.clutch1PointCount = 1;
    saveGameData();
    alert(`実績を解除状態にしました！\n実績画面を開いて「プラチナ」になっているか確認してください。`);
}

function resetTestAchievements() {
    playerRatings[0] = 1500;
    playerStats.wideWaitCount = 0;
    playerStats.masterOfSeasonsCount = 0;
    playerStats.maxComboCount = 0;
    playerStats.welcomeHomeCount = 0;
    playerStats.pacifistCount = 0;
    playerStats.comebackCount = 0;
    playerStats.clutch1PointCount = 0;
    saveGameData();
    alert("テスト用の実績をリセット（未達成）に戻しました。");
}