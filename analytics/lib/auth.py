"""分析ダッシュボードのログイン（管理画面と同じ Supabase のアカウントで認証する）。

- 認証は Supabase Auth の REST API（パスワード方式）を anon キーで呼ぶ。service_role キーは使わない
- 環境変数 ANALYTICS_ALLOWED_EMAILS（カンマ区切り）があれば、そのメールアドレスだけ閲覧を許可する。
  未設定なら Supabase でログインできた人を全員許可する（管理画面と同じ扱い）
- ログイン状態は st.session_state にメールアドレスだけを持つ。パスワード・トークンは保持しない
  （ブラウザを再読み込みするとセッションが新しくなり、再ログインが必要になる）
- パスワード・トークンは画面にもログにも出さない
- 同じセッションで続けて失敗したら、しばらくログインを試させない（簡易的な総当たり対策）

テストしやすいように、通信・判定の関数（authenticate / is_allowed / is_locked）と
画面の関数（require_login / render_sidebar）を分けている。
"""

from __future__ import annotations

import logging
import os
import time

import requests
import streamlit as st
from dotenv import load_dotenv

from .data import ENV_PATH

# ログインの設定（Supabase の URL・anon キーなど）を os.getenv で読む前に、リポジトリ直下の .env を読み込んでおく。
# すでに環境変数にある値（Community Cloud の Secrets など）は上書きしない。.env が無ければ何もしない
load_dotenv(ENV_PATH)

logger = logging.getLogger(__name__)

# Supabase Auth への通信の待ち時間（秒）
AUTH_TIMEOUT = 10

# 続けて失敗してよい回数。これに達したらロックする
MAX_FAILS = 5

# ロックする時間（秒）。最後に失敗した時刻からこの秒数はログインを試さない
LOCK_SECONDS = 60

# st.session_state に置くキー
# ログイン中のメールアドレス（未ログインならキーなし）
SESSION_EMAIL = "auth_email"
# 続けて失敗した回数（成功したら 0 に戻す）
SESSION_FAIL_COUNT = "auth_fail_count"
# 最後に失敗した時刻（time.time() の値）
SESSION_LAST_FAIL = "auth_last_fail_at"
# ログインフォームのパスワード欄の key（ログイン後に値を消すために名前を付ける。値そのものは保持しない）
SESSION_PASSWORD_INPUT = "auth_password_input"

# 画面に出すメッセージ
MSG_BAD_CREDENTIALS = "メールアドレスまたはパスワードが違います。"
MSG_NETWORK_ERROR = "認証サーバーに接続できませんでした。時間をおいてもう一度お試しください。"
MSG_NOT_ALLOWED = "このアカウントでは閲覧できません。"
MSG_LOCKED = "ログインの失敗が続いたため、しばらく待ってからもう一度お試しください。"


def authenticate(email: str, password: str, url: str, anon_key: str) -> tuple[bool, str]:
    """Supabase Auth にメールアドレスとパスワードを送ってログインできるか確かめる。

    返ってきたトークンは使わずに捨てる（ダッシュボードのデータ取得は別の仕組みで行うため）。

    Args:
        email: 入力されたメールアドレス
        password: 入力されたパスワード
        url: Supabase の URL（NEXT_PUBLIC_SUPABASE_URL）
        anon_key: Supabase の anon キー（NEXT_PUBLIC_SUPABASE_ANON_KEY）

    Returns:
        (True, Supabase が返したメールアドレス) または (False, 画面に出すエラーメッセージ)
    """
    # 1. パスワード方式のトークン発行 API を呼ぶ。通信の失敗は「認証失敗」と分けて扱う
    try:
        res = requests.post(
            f"{url.rstrip('/')}/auth/v1/token",
            params={"grant_type": "password"},
            headers={"apikey": anon_key, "Content-Type": "application/json"},
            json={"email": email, "password": password},
            timeout=AUTH_TIMEOUT,
        )
    except requests.RequestException as e:
        # 例外の種類だけを記録する（例外の文字列に送信内容が含まれる可能性を避ける）
        logger.error("Supabase Auth への接続に失敗: %s", type(e).__name__)
        return False, MSG_NETWORK_ERROR

    # 2. 200 以外はすべて「メールアドレスまたはパスワードが違う」として扱う
    if res.status_code != 200:
        return False, MSG_BAD_CREDENTIALS

    # 3. 応答のユーザー情報からメールアドレスを取り出す。形が想定外なら失敗扱いにする
    try:
        user_email = (res.json().get("user") or {}).get("email") or ""
    except ValueError:
        user_email = ""
    if not user_email:
        logger.error("Supabase Auth の応答にメールアドレスがありません")
        return False, MSG_BAD_CREDENTIALS
    return True, user_email


def is_allowed(email: str, allowed_env: str | None) -> bool:
    """メールアドレスが閲覧を許可されているか判定する。

    Args:
        email: ログインできたメールアドレス
        allowed_env: ANALYTICS_ALLOWED_EMAILS の値（カンマ区切り。空や None なら制限なし）

    Returns:
        許可されていれば True。比較は前後の空白を除き、大文字小文字を無視する
    """
    # 1. 許可リストを作る。空の要素（「a@x, ,b@y」など）は捨てる
    allowed = {item.strip().lower() for item in (allowed_env or "").split(",") if item.strip()}
    # 2. リストが空なら Supabase でログインできた人を全員許可する
    if not allowed:
        return True
    return email.strip().lower() in allowed


def is_locked(fail_count: int, last_fail_at: float | None, now: float) -> bool:
    """続けて失敗したため、ログインを試させない状態かどうかを判定する。

    Args:
        fail_count: 続けて失敗した回数
        last_fail_at: 最後に失敗した時刻（秒。失敗がなければ None）
        now: 現在時刻（秒）

    Returns:
        失敗が MAX_FAILS 回以上で、最後の失敗から LOCK_SECONDS 秒たっていなければ True
    """
    if fail_count < MAX_FAILS or last_fail_at is None:
        return False
    return now - last_fail_at < LOCK_SECONDS


def _auth_settings() -> tuple[str, str]:
    """認証に使う接続情報を環境変数（ローカルでは .env）から読む。

    Returns:
        (Supabase の URL, anon キー)。無いものは空文字
    """
    return (
        os.getenv("NEXT_PUBLIC_SUPABASE_URL", "").strip(),
        os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "").strip(),
    )


def _record_failure() -> None:
    """ログインの失敗を1回分 st.session_state に記録する。

    ロックの時間が過ぎたあとの失敗は、回数を 1 から数え直す。

    Returns:
        なし。"""
    # 変数の内容: now: 現在時刻。ログイン失敗時刻とロック期限の比較に使う。
    now = time.time()
    # 変数の内容: count: セッションに記録された連続ログイン失敗回数。
    count = st.session_state.get(SESSION_FAIL_COUNT, 0)
    # 変数の内容: last: セッションに記録された直近のログイン失敗時刻。
    last = st.session_state.get(SESSION_LAST_FAIL)
    # ロックが明けたあとなら回数をリセットしてから数える（明けた直後の1回で再ロックしないように）
    if count >= MAX_FAILS and last is not None and now - last >= LOCK_SECONDS:
        # 変数の内容: count: セッションに記録された連続ログイン失敗回数。
        count = 0
    st.session_state[SESSION_FAIL_COUNT] = count + 1
    st.session_state[SESSION_LAST_FAIL] = now


def require_login() -> str:
    """ログインしていればそのメールアドレスを返し、していなければログインフォームを出して止める。

    app.py で st.navigation より前に呼ぶ。未ログインのときは st.stop() で以降の描画を止めるため、
    ダッシュボードの画面やデータの読み込みは行われない。

    Returns:
        ログイン中のメールアドレス
    """
    # 1. すでにログインしていればそのまま通す。
    #    ただし許可リストは毎回確かめ直し、リストから外された人は開いたままの画面でもログアウトさせる
    email = st.session_state.get(SESSION_EMAIL)
    if email:
        # ログイン後の実行ではパスワード欄を作らないので、ここで入力値をサーバー側の状態から確実に消す
        # （ログイン直後の画面が st.stop() で終わると、Streamlit は使われなくなった入力欄の値を片付けないため）
        st.session_state.pop(SESSION_PASSWORD_INPUT, None)
        if is_allowed(email, os.getenv("ANALYTICS_ALLOWED_EMAILS", "")):
            return email
        logout()

    st.title("ei8ht plants 分析")
    st.caption("管理画面と同じアカウントでログインしてください。")

    # 2. 接続情報が無ければ認証できないので、その旨を出して止める
    url, anon_key = _auth_settings()
    if not url or not anon_key:
        st.error("ログインの設定がありません（NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY）。")
        st.stop()

    # 3. ログインフォーム（送信ボタンを押すまで再実行されないよう st.form にする）。
    #    送信後は入力欄を空にし、パスワードが画面の部品の状態に残らないようにする
    with st.form("login_form", clear_on_submit=True):
        input_email = st.text_input("メールアドレス", autocomplete="username")
        input_password = st.text_input(
            "パスワード", type="password", autocomplete="current-password", key=SESSION_PASSWORD_INPUT,
        )
        submitted = st.form_submit_button("ログイン", type="primary")

    if submitted:
        # 4. 失敗が続いているあいだは Supabase に問い合わせない
        if is_locked(
            st.session_state.get(SESSION_FAIL_COUNT, 0),
            st.session_state.get(SESSION_LAST_FAIL),
            time.time(),
        ):
            st.error(MSG_LOCKED)
            st.stop()
        if not input_email.strip() or not input_password:
            st.error("メールアドレスとパスワードを入力してください。")
            st.stop()

        # 5. Supabase Auth で認証し、許可リストに入っているか確かめる
        ok, result = authenticate(input_email.strip(), input_password, url, anon_key)
        if not ok:
            # 通信エラーは本人の入力ミスではないので、失敗回数に数えない
            if result != MSG_NETWORK_ERROR:
                _record_failure()
            st.error(result)
            st.stop()
        if not is_allowed(result, os.getenv("ANALYTICS_ALLOWED_EMAILS")):
            _record_failure()
            st.error(MSG_NOT_ALLOWED)
            st.stop()

        # 6. 成功したらメールアドレスだけを保持し、失敗回数を消して画面を描き直す
        st.session_state[SESSION_EMAIL] = result
        st.session_state.pop(SESSION_FAIL_COUNT, None)
        st.session_state.pop(SESSION_LAST_FAIL, None)
        st.rerun()

    st.stop()


def logout() -> None:
    """ログイン状態を消す（ログアウトボタンから呼ぶ）。

    Returns:
        なし。"""
    st.session_state.pop(SESSION_EMAIL, None)


def render_sidebar(email: str) -> None:
    """サイドバーにログイン中のメールアドレスとログアウトボタンを出す。

    Args:
        email: ログイン中のメールアドレス

    Returns:
        なし。"""
    with st.sidebar:
        st.caption(f"ログイン中: {email}")
        if st.button("ログアウト", icon=":material/logout:", width="stretch"):
            logout()
            st.rerun()
