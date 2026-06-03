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
    if (_sessionRevokedNotified) return; // 多重表示を防ぐ
    _sessionRevokedNotified = true;
    // 少し遅延させて、 他の即時アラート（例: alert）と重ならないようにする
    setTimeout(() => {
        alert("他の場所（タブ・デバイス）で同じアカウントにログインされました。\nこのセッションは終了します。");
        // ホーム画面に戻すためリロード
        try { location.reload(); } catch (e) { /* ignore */ }
    }, 100);
}

// ==========================================
// 内部: ログイン状態を適用
// ==========================================
function _applyLogin(token, username) {
    authToken = token;
    authUsername = username;
    sessionStorage.setItem('shiki_auth_token', token);
    sessionStorage.setItem('shiki_auth_username', username);
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
        // 🛡️ サーバーから来た牌譜はサイズが大きい可能性 → safe wrapper で容量超過対応
        const replayKey = _replaysKey();
        if (typeof safeLocalStorageSet === 'function') {
            safeLocalStorageSet(replayKey, data.replays, { cleanupKey: replayKey });
        } else {
            try { localStorage.setItem(replayKey, JSON.stringify(data.replays)); } catch (e) { console.warn('[AUTH] replay保存失敗:', e); }
        }
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

// ==========================================
// 🛡️ localStorage 書き込みの安全ラッパ
//   QuotaExceededError (容量超過) や その他の例外で setItem が失敗するのを補足する。
//   options:
//     - cleanupKey: 容量超過時に古いデータを削除して再試行する対象キー
//       (主に牌譜・lessons 等、 配列で保存されているもの)
//     - notifyOnFail: true なら失敗時にユーザーへ alert で通知
//   戻り値: 成功 true / 失敗 false
// ==========================================
function safeLocalStorageSet(key, value, options = {}) {
    const valueStr = (typeof value === 'string') ? value : JSON.stringify(value);
    try {
        localStorage.setItem(key, valueStr);
        return true;
    } catch (e) {
        const isQuota = (e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014));
        console.warn(`[STORAGE] setItem '${key}' 失敗 (quota=${isQuota}):`, e);

        // 容量超過 + 配列データなら、 古い半分を削除して再試行
        if (isQuota && options.cleanupKey) {
            try {
                const arr = JSON.parse(localStorage.getItem(options.cleanupKey) || '[]');
                if (Array.isArray(arr) && arr.length > 1) {
                    const halved = arr.slice(Math.floor(arr.length / 2));  // 古い半分を捨てる
                    localStorage.setItem(options.cleanupKey, JSON.stringify(halved));
                    console.warn(`[STORAGE] '${options.cleanupKey}' を ${arr.length}→${halved.length} 件に圧縮して再試行`);
                    // 再試行
                    try {
                        localStorage.setItem(key, valueStr);
                        return true;
                    } catch (e2) { /* 諦める */ }
                }
            } catch (e3) { /* cleanup 失敗、 そのまま諦める */ }
        }

        if (options.notifyOnFail) {
            const msg = isQuota
                ? "ブラウザの保存容量が不足しています。\n古い牌譜を削除するか、 ブラウザのキャッシュをクリアしてください。"
                : "データの保存に失敗しました: " + (e && e.message ? e.message : '不明なエラー');
            try { alert(msg); } catch (_) { /* ignore */ }
        }
        return false;
    }
}
window.safeLocalStorageSet = safeLocalStorageSet;