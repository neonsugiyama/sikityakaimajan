// ==========================================
// 🔐 アカウントシステム フロントエンド (auth.js)
// トークンは sessionStorage に保存 → タブごとに別アカウントでログイン可能
// ==========================================

// ログイン状態（sessionStorage がタブ独立なので、4窓で別アカウントにできる）
let authToken = sessionStorage.getItem('shiki_auth_token') || null;
let authUsername = sessionStorage.getItem('shiki_auth_username') || null;
// 🌟 途中復帰用: ログイン時に取得した進行中の対局ルームID
let currentRoomIdInDb = null;

// ログイン中かどうか
function isLoggedIn() {
    return !!authToken;
}

// ==========================================
// 新規登録
// ==========================================
async function authRegister(username, password) {
    let payload = { username, password };

    const res = await fetch('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: '登録に失敗しました' }));
        throw new Error(err.detail || '登録に失敗しました');
    }
    const data = await res.json();
    _applyLogin(data.token, data.username);
    // 登録直後はサーバーからデータ取得して反映
    await authLoadAndApply();
    return data;
}

// ==========================================
// ログイン
// ==========================================
async function authLogin(username, password) {
    const res = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'ログインに失敗しました' }));
        throw new Error(err.detail || 'ログインに失敗しました');
    }
    const data = await res.json();
    _applyLogin(data.token, data.username);
    // サーバーのデータをゲーム変数に反映
    _applyServerData(data);
    return data;
}

// ==========================================
// ログアウト
// ==========================================
async function authLogout() {
    // 🌟 セッション生存確認ポーリングを停止
    if (typeof _stopSessionPingPolling === 'function') _stopSessionPingPolling();

    if (authToken) {
        try {
            await fetch('/auth/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: authToken })
            });
        } catch (e) { /* ignore */ }
    }
    authToken = null;
    authUsername = null;
    sessionStorage.removeItem('shiki_auth_token');
    sessionStorage.removeItem('shiki_auth_username');
}

// ==========================================
// サーバーからデータ取得してゲーム変数に反映
// ==========================================
async function authLoadAndApply() {
    if (!authToken) return false;
    try {
        const res = await fetch(`/auth/load?token=${encodeURIComponent(authToken)}&_t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) {
            // トークン無効 → ログアウト扱い
            if (res.status === 401) {
                await authLogout();
                _notifySessionRevoked();
            }
            return false;
        }
        const data = await res.json();
        _applyServerData(data);
        // 🌟 ページリロード時の自動ログインでもポーリングを開始する
        //   （_applyLogin は通らないので明示的に呼ぶ）
        if (typeof _startSessionPingPolling === 'function') _startSessionPingPolling();
        return true;
    } catch (e) {
        console.error('[AUTH] load失敗:', e);
        return false;
    }
}

// ==========================================
// サーバーへデータ保存
// ==========================================
async function authSave() {
    if (!authToken) return false;
    try {
        const payload = {
            token: authToken,
            stats: (typeof playerStats !== 'undefined') ? playerStats : null,
            rating: (typeof playerRatings !== 'undefined') ? playerRatings[0] : null,
            replays: JSON.parse(localStorage.getItem(_replaysKey()) || '[]')
        };
        const res = await fetch('/auth/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            if (res.status === 401) {
                await authLogout();
                _notifySessionRevoked();
            }
            return false;
        }
        return true;
    } catch (e) {
        console.error('[AUTH] save失敗:', e);
        return false;
    }
}

// ==========================================
// 内部: セッションが他の場所からのログインで無効化された時の通知
// ==========================================
let _sessionRevokedNotified = false;
function _notifySessionRevoked() {
    console.log("[AUTH] _notifySessionRevoked が呼ばれました。 既に通知済み?", _sessionRevokedNotified);
    if (_sessionRevokedNotified) return; // 多重表示を防ぐ
    _sessionRevokedNotified = true;
    // 🌟 alert() はブラウザのバックグラウンドタブ抑制ポリシーで表示されない場合があるため、
    //    ページ内モーダル DOM で確実に通知する。 (Chrome は非アクティブタブからの alert を block)
    setTimeout(() => {
        _showSessionRevokedModal();
    }, 100);
}

// 🌟 セッション失効モーダル: alert() の代わりに DOM で表示
function _showSessionRevokedModal() {
    // 既に表示済みなら何もしない
    if (document.getElementById('session-revoked-modal')) return;

    // 🌟 ゲーム進行を完全停止
    //   ・apiCall は window._sessionRevoked を見て即座に return するようになる
    //   ・タイマー、 ポーリング等の setInterval も停止
    //   ・CPU 戦のローカル進行（時間切れの自動打牌等）もこれで止まる
    window._sessionRevoked = true;
    try { if (typeof stopTimer === 'function') stopTimer(); } catch (e) { /* ignore */ }
    try { if (typeof isProc !== 'undefined') isProc = true; } catch (e) { /* ignore */ }
    try { if (typeof _stopSessionPingPolling === 'function') _stopSessionPingPolling(); } catch (e) { /* ignore */ }
    // 友人戦 WS が残っていれば閉じる
    try {
        if (typeof friendWs !== 'undefined' && friendWs && friendWs.readyState === WebSocket.OPEN) {
            friendWs.close();
        }
    } catch (e) { /* ignore */ }

    const overlay = document.createElement('div');
    overlay.id = 'session-revoked-modal';
    overlay.style.cssText = [
        'position:fixed', 'top:0', 'left:0', 'right:0', 'bottom:0',
        'background:rgba(0,0,0,0.75)', 'z-index:2147483647',
        'display:flex', 'align-items:center', 'justify-content:center',
        'font-family:sans-serif'
    ].join(';');

    const box = document.createElement('div');
    box.style.cssText = [
        'background:#fff', 'padding:24px 28px', 'border-radius:12px',
        'max-width:380px', 'width:90%', 'text-align:center',
        'box-shadow:0 12px 40px rgba(0,0,0,0.6)'
    ].join(';');

    const title = document.createElement('h2');
    title.textContent = 'セッション終了';
    title.style.cssText = 'margin:0 0 14px;font-size:18px;color:#c00;font-weight:bold;';
    box.appendChild(title);

    const msg = document.createElement('p');
    msg.style.cssText = 'margin:0 0 18px;font-size:14px;line-height:1.6;color:#333;';
    msg.innerHTML = '他の場所（タブ・デバイス）で<br>同じアカウントにログインされました。<br>このセッションは終了します。';
    box.appendChild(msg);

    // 🌟 自動リロード用カウントダウン表示
    const countdown = document.createElement('p');
    countdown.style.cssText = 'margin:0 0 16px;font-size:12px;color:#888;';
    box.appendChild(countdown);

    const okBtn = document.createElement('button');
    okBtn.textContent = 'OK';
    okBtn.style.cssText = [
        'padding:10px 36px', 'font-size:15px', 'font-weight:bold',
        'background:#2a7d4f', 'color:#fff', 'border:none', 'border-radius:8px',
        'cursor:pointer'
    ].join(';');
    okBtn.addEventListener('click', () => {
        try { location.reload(); } catch (e) { /* ignore */ }
    });
    box.appendChild(okBtn);

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // フォーカス（バックグラウンドタブでも Enter で閉じられるよう）
    try { okBtn.focus(); } catch (e) { /* ignore */ }

    // 🌟 10秒のカウントダウン後に自動リロード（ユーザーが OK を押さなくてもホームに戻る）
    let remaining = 10;
    const updateCountdown = () => {
        countdown.textContent = `${remaining}秒後に自動でホーム画面に戻ります`;
    };
    updateCountdown();
    const cd = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
            clearInterval(cd);
            try { location.reload(); } catch (e) { /* ignore */ }
            return;
        }
        updateCountdown();
    }, 1000);
}

// ==========================================
// 内部: ログイン状態を適用
// ==========================================
function _applyLogin(token, username) {
    authToken = token;
    authUsername = username;
    sessionStorage.setItem('shiki_auth_token', token);
    sessionStorage.setItem('shiki_auth_username', username);
    // 🌟 後勝ちログイン時に旧セッションを即時切断するため、 定期ポーリングを開始
    _startSessionPingPolling();
}

// ==========================================
// 🌟 セッション生存確認ポーリング
//   5 秒ごとにサーバーへ ping を投げ、 トークンが無効化されていれば
//   即座に「他の場所でログインされました」 通知を表示してリロード。
// ==========================================
let _sessionPingTimer = null;
const _SESSION_PING_INTERVAL_MS = 1500;  // 雀魂並みの即時切断のため短縮（1.5秒）

function _startSessionPingPolling() {
    if (_sessionPingTimer) return; // 既に動いている
    _sessionPingTimer = setInterval(async () => {
        if (!authToken) {
            _stopSessionPingPolling();
            return;
        }
        try {
            const res = await fetch(`/auth/ping?token=${encodeURIComponent(authToken)}&_t=${Date.now()}`, { cache: 'no-store' });
            if (res.status === 401) {
                _stopSessionPingPolling();
                await authLogout();
                _notifySessionRevoked();
            }
        } catch (e) {
            // ネットワークエラーは無視（次の ping で再試行）
        }
    }, _SESSION_PING_INTERVAL_MS);
}

function _stopSessionPingPolling() {
    if (_sessionPingTimer) {
        clearInterval(_sessionPingTimer);
        _sessionPingTimer = null;
    }
}

// 内部: サーバーから受け取ったデータをゲーム変数に反映
function _applyServerData(data) {
    // 🌟 アカウント切り替え時に前アカウントのデータが UI に残るのを防ぐため、
    //    playerStats と playerRatings を完全に初期値にリセットしてから上書き反映する
    if (typeof window._resetPlayerStatsToDefaults === 'function') {
        window._resetPlayerStatsToDefaults();
    }

    if (data.stats && typeof playerStats !== 'undefined') {
        playerStats = { ...playerStats, ...data.stats };
    }
    if (data.rating !== undefined && typeof playerRatings !== 'undefined') {
        playerRatings[0] = data.rating;
    } else if (typeof playerRatings !== 'undefined') {
        // サーバーに rating がなければ初期値 1500 に戻す
        playerRatings[0] = 1500;
    }
    if (data.replays !== undefined) {
        // 牌譜はアカウント別キーに保存（タブ独立のため username 付き）
        localStorage.setItem(_replaysKey(), JSON.stringify(data.replays));
    }
    // 🌟 進行中の対局ルームIDを保持
    currentRoomIdInDb = data.current_room_id || null;
    // UIを更新
    if (typeof updateProfileUI === 'function') updateProfileUI();
    if (typeof updateInfoUI === 'function') updateInfoUI();
}

// ==========================================
// 牌譜の保存キー（ログイン中はアカウント別、ゲストは従来通り）
// ==========================================
function _replaysKey() {
    if (authUsername) return `shiki_mahjong_replays_${authUsername}`;
    return 'shiki_mahjong_replays';
}

// 🌟 レッスンクリアデータのキー（アカウント別）
function _lessonsKey() {
    if (authUsername) return `shiki_mahjong_lessons_${authUsername}`;
    return 'shiki_mahjong_lessons';
}

// グローバルに公開（他ファイルから参照）
window.getReplaysStorageKey = _replaysKey;
window.getLessonsStorageKey = _lessonsKey;
// 🌟 friend.js から「他の場所でログインされました」 通知を呼べるよう公開
window._notifySessionRevoked = _notifySessionRevoked;