# ==========================================
# 🔐 アカウントシステム (auth_routes.py)
# SQLite + pbkdf2 パスワードハッシュ + トークン認証
# ==========================================
import sqlite3
import hashlib
import secrets
import json
import os
import time
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/auth")

# DB ファイルのパス（Render では永続ディスクのパスを環境変数で指定可能）
DB_PATH = os.environ.get("SHIKI_DB_PATH", os.path.join(os.path.dirname(__file__), "accounts.db"))

# メモリ上のトークン → username マッピング（サーバー再起動で消えるが、再ログインで復帰可能）
_active_tokens = {}  # token -> {"username": str, "created": float}

TOKEN_TTL = 60 * 60 * 24 * 7  # トークン有効期間: 7日


def _get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """DB とテーブルを初期化（存在しなければ作成）"""
    conn = _get_db()
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                stats_json TEXT DEFAULT '{}',
                rating INTEGER DEFAULT 1500,
                replays_json TEXT DEFAULT '[]',
                created_at REAL
            )
        """)
        conn.commit()
    finally:
        conn.close()


# 起動時に DB 初期化
init_db()


def _hash_password(password: str, salt: str) -> str:
    """pbkdf2_hmac でパスワードをハッシュ化"""
    return hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000
    ).hex()


def _issue_token(username: str) -> str:
    token = secrets.token_urlsafe(32)
    _active_tokens[token] = {"username": username, "created": time.time()}
    return token


def _resolve_token(token: str) -> str:
    """トークンから username を取得。無効なら None"""
    info = _active_tokens.get(token)
    if not info:
        return None
    if time.time() - info["created"] > TOKEN_TTL:
        del _active_tokens[token]
        return None
    return info["username"]


# ==========================================
# リクエストボディの型
# ==========================================
class RegisterBody(BaseModel):
    username: str
    password: str
    # 初回マイグレーション用（任意）: localStorage から引き継ぐデータ
    stats: dict = None
    rating: int = None
    replays: list = None


class LoginBody(BaseModel):
    username: str
    password: str


class SaveBody(BaseModel):
    token: str
    stats: dict = None
    rating: int = None
    replays: list = None


# ==========================================
# 新規登録
# ==========================================
@router.post("/register")
def register(body: RegisterBody):
    username = (body.username or "").strip()
    password = body.password or ""

    if len(username) < 1 or len(username) > 20:
        raise HTTPException(status_code=400, detail="ユーザー名は1〜20文字で入力してください")
    if len(password) < 4:
        raise HTTPException(status_code=400, detail="パスワードは4文字以上で入力してください")

    conn = _get_db()
    try:
        existing = conn.execute("SELECT username FROM users WHERE username = ?", (username,)).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="そのユーザー名は既に使われています")

        salt = secrets.token_hex(16)
        pw_hash = _hash_password(password, salt)

        # 初回マイグレーション: 渡されたデータがあれば引き継ぐ
        stats_json = json.dumps(body.stats) if body.stats else "{}"
        rating = body.rating if body.rating is not None else 1500
        replays_json = json.dumps(body.replays) if body.replays else "[]"

        conn.execute(
            "INSERT INTO users (username, password_hash, salt, stats_json, rating, replays_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (username, pw_hash, salt, stats_json, rating, replays_json, time.time())
        )
        conn.commit()
    finally:
        conn.close()

    token = _issue_token(username)
    return {"status": "ok", "token": token, "username": username}


# ==========================================
# ログイン
# ==========================================
@router.post("/login")
def login(body: LoginBody):
    username = (body.username or "").strip()
    password = body.password or ""

    conn = _get_db()
    try:
        row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        if not row:
            raise HTTPException(status_code=401, detail="ユーザー名またはパスワードが違います")

        expected = _hash_password(password, row["salt"])
        if not secrets.compare_digest(expected, row["password_hash"]):
            raise HTTPException(status_code=401, detail="ユーザー名またはパスワードが違います")

        token = _issue_token(username)
        return {
            "status": "ok",
            "token": token,
            "username": username,
            "stats": json.loads(row["stats_json"] or "{}"),
            "rating": row["rating"],
            "replays": json.loads(row["replays_json"] or "[]"),
        }
    finally:
        conn.close()


# ==========================================
# データ取得（トークンで認証）
# ==========================================
@router.get("/load")
def load(token: str):
    username = _resolve_token(token)
    if not username:
        raise HTTPException(status_code=401, detail="セッションが無効です。再ログインしてください")

    conn = _get_db()
    try:
        row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="アカウントが見つかりません")
        return {
            "status": "ok",
            "username": username,
            "stats": json.loads(row["stats_json"] or "{}"),
            "rating": row["rating"],
            "replays": json.loads(row["replays_json"] or "[]"),
        }
    finally:
        conn.close()


# ==========================================
# データ保存（トークンで認証）
# ==========================================
@router.post("/save")
def save(body: SaveBody):
    username = _resolve_token(body.token)
    if not username:
        raise HTTPException(status_code=401, detail="セッションが無効です。再ログインしてください")

    conn = _get_db()
    try:
        # 部分更新: 渡されたフィールドだけ更新
        updates = []
        params = []
        if body.stats is not None:
            updates.append("stats_json = ?")
            params.append(json.dumps(body.stats))
        if body.rating is not None:
            updates.append("rating = ?")
            params.append(body.rating)
        if body.replays is not None:
            updates.append("replays_json = ?")
            params.append(json.dumps(body.replays))

        if updates:
            params.append(username)
            conn.execute(f"UPDATE users SET {', '.join(updates)} WHERE username = ?", params)
            conn.commit()
        return {"status": "ok"}
    finally:
        conn.close()


# ==========================================
# ログアウト（トークン破棄）
# ==========================================
@router.post("/logout")
def logout(body: SaveBody):
    if body.token in _active_tokens:
        del _active_tokens[body.token]
    return {"status": "ok"}