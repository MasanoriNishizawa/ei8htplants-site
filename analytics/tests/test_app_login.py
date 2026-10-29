"""app.py のログインの流れ（lib/auth.py の require_login / render_sidebar / logout）を
streamlit.testing.v1.AppTest で確かめるテスト。

- Supabase Auth への通信（requests.post）はモックにする
- ログイン後のデータ取得（lib.context.load_all）と requests.get もモックにして、本番の Supabase には届かないようにする
  （requests.get のモックは、呼ばれたかどうかの確認にも使う）
- 環境変数は架空の値（conftest.py の fake_env）だけを使う
"""

from __future__ import annotations

import time
from pathlib import Path
from unittest.mock import MagicMock

import pytest
import requests
import streamlit as st
from streamlit.proto.TextInput_pb2 import TextInput as TextInputProto
from streamlit.testing.v1 import AppTest

import lib.context
from lib.auth import (
    LOCK_SECONDS,
    MSG_BAD_CREDENTIALS,
    MSG_LOCKED,
    MSG_NETWORK_ERROR,
    MSG_NOT_ALLOWED,
    SESSION_EMAIL,
    SESSION_FAIL_COUNT,
    SESSION_LAST_FAIL,
    SESSION_PASSWORD_INPUT,
)

# 確かめる app.py の場所（このファイルから見て1つ上）
APP_PATH = str(Path(__file__).resolve().parents[1] / "app.py")

# テストで使う架空のアカウント
EMAIL = "admin@example.com"
# ログインフォームへ入力する架空パスワード
PASSWORD = "S3cret-Pass!word"

# ログインの設定がないときのメッセージ（require_login が出す文言の一部）
MSG_NO_SETTINGS = "ログインの設定がありません"

# ログイン後の画面が描かれた目印（load_all のモックが失敗したときに概要画面が出すメッセージ）
MSG_DATA_ERROR = "データを読み込めませんでした"


def _response(status: int, body: dict | None = None) -> MagicMock:
    """requests.post が返す応答のモックを作る。

    Args:
        status: HTTP ステータスコード
        body: res.json() が返す値

    Returns:
        応答のモック
    """
    # 変数の内容: res: requests.post の応答を模したオブジェクト。
    res = MagicMock()
    res.status_code = status
    res.json.return_value = body or {}
    return res


@pytest.fixture
def post(monkeypatch):
    """requests.post を差し替える（既定はログイン成功。メールは EMAIL）。

    Args:
        monkeypatch: 依存値を一時差し替えする pytest フィクスチャ。

    Returns:
        requests.post のモック応答を返す。"""
    # 変数の内容: mock: 対象依存処理を置き換えるモック。
    mock = MagicMock(return_value=_response(200, {"access_token": "tok-SECRET", "user": {"email": EMAIL}}))
    monkeypatch.setattr(requests, "post", mock)
    return mock


@pytest.fixture
def data_get(monkeypatch):
    """データ取得まわりをモックにする。

    Returns:
        (load_all のモック, requests.get のモック)。どちらも本番には届かない

    Args:
        monkeypatch: 依存値を一時差し替えする pytest フィクスチャ。"""
    # 1. 概要画面などが呼ぶ load_all は失敗させる（画面には「データを読み込めませんでした」が出る）
    load_all = MagicMock(side_effect=RuntimeError("テスト用：データ取得はしない"))
    monkeypatch.setattr(lib.context, "load_all", load_all)
    # 2. 念のため requests.get もモックにし、呼ばれたかを記録する
    get = MagicMock(side_effect=RuntimeError("テスト用：通信しない"))
    monkeypatch.setattr(requests, "get", get)
    return load_all, get


def _new_app() -> AppTest:
    """app.py の AppTest を作って1回描画する。

    Returns:
        描画後の AppTest
    """
    return AppTest.from_file(APP_PATH, default_timeout=30).run()


def _submit(at: AppTest, email: str = EMAIL, password: str = PASSWORD) -> AppTest:
    """ログインフォームに入力して送信する。

    Args:
        at: AppTest
        email: 入力するメールアドレス
        password: 入力するパスワード

    Returns:
        送信後の AppTest
    """
    at.text_input[0].input(email)
    at.text_input[1].input(password)
    return at.button(key="FormSubmitter:login_form-ログイン").click().run()


def _errors(at: AppTest) -> list[str]:
    """画面に出ているエラーメッセージの一覧。

    Args:
        at: 描画済みの Streamlit AppTest。

    Returns:
        list[str] を返す。"""
    return [e.value for e in at.error]


def _is_login_form(at: AppTest) -> bool:
    """ログインフォームだけが出ている状態かどうか。

    Args:
        at: 描画済みの Streamlit AppTest。

    Returns:
        bool を返す。"""
    # 変数の内容: labels: 画面に表示するラベル一覧。
    labels = [t.label for t in at.text_input]
    return labels == ["メールアドレス", "パスワード"] and len(at.sidebar.button) == 0


def _internal_state_text(at: AppTest) -> str:
    """Streamlit 内部のセッション（キーなしウィジェットの値も含む全体）を文字列にする。

    Args:
        at: AppTest

    Returns:
        内部状態の repr
    """
    return repr(at.session_state._state._state)  # noqa: SLF001


# ---------------------------------------------------------------- 未ログイン


def test_未ログインで開くとログインフォームだけが出てダッシュボードもデータ取得も行わない(fake_env, post, data_get):
    """未ログインで開くとログインフォームだけが出てダッシュボードもデータ取得も行わないことを確認する。

    Args:
        fake_env: 架空の Supabase 接続情報を設定する pytest フィクスチャ。
        post: requests.post を差し替えた認証リクエストのモック。
        data_get: load_all と requests.get を遮断する pytest フィクスチャ。

    Returns:
        なし。"""
    # 変数の内容: load_all: 本番データ取得を置き換えるモック関数。、get: 外部通信を防ぐ requests.get のモック。
    load_all, get = data_get
    # 変数の内容: at: Streamlit AppTest の現在の画面状態。
    at = _new_app()
    assert not at.exception
    # 1. タイトル・メールアドレス・パスワード・ログインボタンが出る
    assert [t.value for t in at.title] == ["ei8ht plants 分析"]
    assert _is_login_form(at)
    assert [b.label for b in at.button] == ["ログイン"]
    # 2. パスワード欄は伏せ字
    assert at.text_input[1].proto.type == TextInputProto.PASSWORD
    assert at.text_input[0].proto.type != TextInputProto.PASSWORD
    # 3. サイドバー（ログイン中・ログアウト・再読み込み）もダッシュボードのページも出ない
    assert len(at.sidebar.caption) == 0
    assert all(b.label != "データを再読み込み" for b in at.button)
    assert MSG_DATA_ERROR not in " ".join(_errors(at))
    # 4. 認証もデータ取得も呼ばれない
    post.assert_not_called()
    load_all.assert_not_called()
    get.assert_not_called()
    assert SESSION_EMAIL not in at.session_state


@pytest.mark.parametrize(
    "env",
    [
        {},  # どちらもない
        {"NEXT_PUBLIC_SUPABASE_URL": "https://fake-project.example.invalid"},  # anon キーがない
        {"NEXT_PUBLIC_SUPABASE_ANON_KEY": "fake-anon-key-for-test"},  # URL がない
        {"NEXT_PUBLIC_SUPABASE_URL": "   ", "NEXT_PUBLIC_SUPABASE_ANON_KEY": "  "},  # 空白だけ
    ],
    ids=["両方なし", "anonキーなし", "URLなし", "空白だけ"],
)
def test_接続情報が無いと設定不足のメッセージを出してフォームを出さずに止まる(monkeypatch, post, data_get, env):
    """接続情報が無いと設定不足のメッセージを出してフォームを出さずに止まることを確認する。

    Args:
        monkeypatch: 依存値を一時差し替えする pytest フィクスチャ。
        post: requests.post を差し替えた認証リクエストのモック。
        data_get: load_all と requests.get を遮断する pytest フィクスチャ。
        env: 環境変数の名前と値。

    Returns:
        なし。"""
    # 1. 接続情報が無いと設定不足のメッセージを出してフォームを出さずに止まることを確認する。
    # load_all: データ読み込みモック。破棄値はこのテストでは検査しない。
    load_all, _ = data_get
    # k / v: 接続設定として差し込む環境変数名と、そのテスト値。
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    # 変数の内容: at: Streamlit AppTest の現在の画面状態。
    at = _new_app()
    assert not at.exception
    assert any(MSG_NO_SETTINGS in e for e in _errors(at))
    assert len(at.text_input) == 0
    assert len(at.button) == 0
    post.assert_not_called()
    load_all.assert_not_called()


# ---------------------------------------------------------------- ログイン成功


def test_ログインに成功するとauth_emailが入りサイドバーにログイン中とログアウトが出てダッシュボードが描かれる(
    fake_env, post, data_get
):
    """ログインに成功するとauth emailが入りサイドバーにログイン中とログアウトが出てダッシュボードが描かれることを確認する。

    Args:
        fake_env: 架空の Supabase 接続情報を設定する pytest フィクスチャ。
        post: requests.post を差し替えた認証リクエストのモック。
        data_get: load_all と requests.get を遮断する pytest フィクスチャ。

    Returns:
        なし。"""
    # 変数の内容: load_all: 本番データ取得を置き換えるモック関数。、_: このテストでは呼び出し回数を確認しない戻り値。
    load_all, _ = data_get
    # 変数の内容: at: Streamlit AppTest の現在の画面状態。
    at = _submit(_new_app())
    assert not at.exception
    # 1. セッションにはメールアドレスだけが入る
    assert at.session_state[SESSION_EMAIL] == EMAIL
    assert SESSION_FAIL_COUNT not in at.session_state
    assert SESSION_LAST_FAIL not in at.session_state
    # 2. サイドバーに「ログイン中: メール」とログアウト・再読み込みボタン
    # captions: サイドバーに表示された説明文の一覧。
    captions = [c.value for c in at.sidebar.caption]
    assert f"ログイン中: {EMAIL}" in captions
    # 変数の内容: sidebar_buttons: サイドバーに表示された操作ボタン。
    sidebar_buttons = [b.label for b in at.sidebar.button]
    assert "ログアウト" in sidebar_buttons
    assert "データを再読み込み" in sidebar_buttons
    # 3. ログインフォームは消え、ダッシュボードのページ（概要）が描かれた（データ取得はモック）
    assert len(at.text_input) == 0
    load_all.assert_called()
    assert any(MSG_DATA_ERROR in e for e in _errors(at))
    # 4. 認証は1回だけ
    assert post.call_count == 1


def test_ログイン後はセッションにパスワードもトークンも残らない(fake_env, post, data_get):
    """ログイン後はセッションにパスワードもトークンも残らないことを確認する。

    Args:
        fake_env: 架空の Supabase 接続情報を設定する pytest フィクスチャ。
        post: requests.post を差し替えた認証リクエストのモック。
        data_get: load_all と requests.get を遮断する pytest フィクスチャ。

    Returns:
        なし。"""
    # 変数の内容: at: Streamlit AppTest の現在の画面状態。
    at = _submit(_new_app())
    # 1. アプリが置いたセッションのキーは auth_email だけ（ログイン成功後は失敗回数も消える）
    # app_keys: Streamlitフォーム管理用キーを除いた、アプリが保持するセッションキー。
    app_keys = {k for k in at.session_state.keys() if not k.startswith("FormSubmitter")}
    assert app_keys == {SESSION_EMAIL}
    # 2. アプリが置いた値にパスワード・トークンが含まれない
    # （Streamlit 内部のウィジェット状態にパスワードが残らないかは
    #   test_ログイン後に画面を最後まで描くとパスワード欄の値がセッションの内部状態に残らない で確かめる）
    # key: パスワードやトークンが含まれないか確認するセッションキー。
    for key in app_keys:
        # 変数の内容: value: テストケースとして渡す値。
        value = str(at.session_state[key])
        assert PASSWORD not in value, key
        assert "tok-SECRET" not in value, key
    # 画面に出ている文字列にもパスワード・トークンが出ない
    # shown: 画面に表示された説明・エラー・サイドバー文言を連結した検査対象。
    shown = " ".join(str(c.value) for c in at.caption) + " ".join(_errors(at)) + " ".join(
        str(c.value) for c in at.sidebar.caption
    )
    assert PASSWORD not in shown
    assert "tok-SECRET" not in shown


def test_入力したメールの前後の空白は除いて認証に送る(fake_env, post, data_get):
    """入力したメールの前後の空白は除いて認証に送ることを確認する。

    Args:
        fake_env: 架空の Supabase 接続情報を設定する pytest フィクスチャ。
        post: requests.post を差し替えた認証リクエストのモック。
        data_get: load_all と requests.get を遮断する pytest フィクスチャ。

    Returns:
        なし。"""
    # 1. 入力したメールの前後の空白は除いて認証に送ることを確認する。
    _submit(_new_app(), email="  admin@example.com  ")
    assert post.call_args.kwargs["json"]["email"] == EMAIL


def test_ログイン後に再描画しても認証を呼び直さない(fake_env, post, data_get):
    """ログイン後に再描画しても認証を呼び直さないことを確認する。

    Args:
        fake_env: 架空の Supabase 接続情報を設定する pytest フィクスチャ。
        post: requests.post を差し替えた認証リクエストのモック。
        data_get: load_all と requests.get を遮断する pytest フィクスチャ。

    Returns:
        なし。"""
    # 1. ログイン後に再描画しても認証を呼び直さないことを確認する。
    # at: ログイン送信後に再描画されたアプリ状態。
    at = _submit(_new_app())
    at.run()
    assert at.session_state[SESSION_EMAIL] == EMAIL
    assert post.call_count == 1


def test_ログイン前に失敗していても成功すれば失敗回数が消える(fake_env, post, data_get):
    """ログイン前に失敗していても成功すれば失敗回数が消えることを確認する。

    Args:
        fake_env: 架空の Supabase 接続情報を設定する pytest フィクスチャ。
        post: requests.post を差し替えた認証リクエストのモック。
        data_get: load_all と requests.get を遮断する pytest フィクスチャ。

    Returns:
        なし。"""
    # 1. ログイン前に失敗していても成功すれば失敗回数が消えることを確認する。
    # at: 初回描画直後のログイン画面状態。
    at = _new_app()
    post.return_value = _response(400)
    # 変数の内容: at: 操作を反映した Streamlit AppTest の画面状態。
    at = _submit(at)
    assert at.session_state[SESSION_FAIL_COUNT] == 1
    post.return_value = _response(200, {"user": {"email": EMAIL}})
    # 変数の内容: at: 操作を反映した Streamlit AppTest の画面状態。
    at = _submit(at)
    assert at.session_state[SESSION_EMAIL] == EMAIL
    assert SESSION_FAIL_COUNT not in at.session_state
    assert SESSION_LAST_FAIL not in at.session_state


# ---------------------------------------------------------------- ログイン失敗


def test_パスワードが違うとエラーが出て失敗回数が1増えフォームのまま(fake_env, post, data_get):
    """パスワードが違うとエラーが出て失敗回数が1増えフォームのままことを確認する。

    Args:
        fake_env: 架空の Supabase 接続情報を設定する pytest フィクスチャ。
        post: requests.post を差し替えた認証リクエストのモック。
        data_get: load_all と requests.get を遮断する pytest フィクスチャ。

    Returns:
        なし。"""
    # 1. パスワードが違うとエラーが出て失敗回数が1増えフォームのままことを確認する。
    # load_all: 本番データ取得を置き換えるモック。破棄値は未使用。
    load_all, _ = data_get
    post.return_value = _response(400, {"error": "invalid_grant"})
    # 変数の内容: at: Streamlit AppTest の現在の画面状態。
    at = _submit(_new_app())
    assert not at.exception
    assert MSG_BAD_CREDENTIALS in _errors(at)
    assert at.session_state[SESSION_FAIL_COUNT] == 1
    assert at.session_state[SESSION_LAST_FAIL] == pytest.approx(time.time(), abs=10)
    assert SESSION_EMAIL not in at.session_state
    assert _is_login_form(at)
    load_all.assert_not_called()


def test_失敗を続けると回数が1ずつ増える(fake_env, post, data_get):
    """失敗を続けると回数が1ずつ増えることを確認する。

    Args:
        fake_env: 架空の Supabase 接続情報を設定する pytest フィクスチャ。
        post: requests.post を差し替えた認証リクエストのモック。
        data_get: load_all と requests.get を遮断する pytest フィクスチャ。

    Returns:
        なし。"""
    # 1. 失敗を続けると回数が1ずつ増えることを確認する。
    post.return_value = _response(401)
    # 変数の内容: at: Streamlit AppTest の現在の画面状態。
    at = _new_app()
    # n: 連続ログイン失敗回数の期待値。
    for n in range(1, 4):
        # 変数の内容: at: 操作を反映した Streamlit AppTest の画面状態。
        at = _submit(at)
        assert at.session_state[SESSION_FAIL_COUNT] == n


@pytest.mark.parametrize("exc", [requests.Timeout("t"), requests.ConnectionError("c")], ids=["Timeout", "ConnectionError"])
def test_通信エラーは別のメッセージを出し失敗回数に数えない(fake_env, post, data_get, exc):
    """通信エラーは別のメッセージを出し失敗回数に数えないことを確認する。

    Args:
        fake_env: 架空の Supabase 接続情報を設定する pytest フィクスチャ。
        post: requests.post を差し替えた認証リクエストのモック。
        data_get: load_all と requests.get を遮断する pytest フィクスチャ。
        exc: 処理時に発生する例外。

    Returns:
        なし。"""
    # 1. 通信エラーは別のメッセージを出し失敗回数に数えないことを確認する。
    post.side_effect = exc
    # 変数の内容: at: Streamlit AppTest の現在の画面状態。
    at = _submit(_new_app())
    assert MSG_NETWORK_ERROR in _errors(at)
    assert MSG_BAD_CREDENTIALS not in _errors(at)
    assert SESSION_FAIL_COUNT not in at.session_state
    assert SESSION_EMAIL not in at.session_state


@pytest.mark.parametrize("email,password", [("", PASSWORD), ("   ", PASSWORD), (EMAIL, "")], ids=["メール空", "メール空白", "パスワード空"])
def test_未入力で送ると入力を促すエラーを出し認証を呼ばず失敗回数にも数えない(fake_env, post, data_get, email, password):
    """未入力で送ると入力を促すエラーを出し認証を呼ばず失敗回数にも数えないことを確認する。

    Args:
        fake_env: 架空の Supabase 接続情報を設定する pytest フィクスチャ。
        post: requests.post を差し替えた認証リクエストのモック。
        data_get: load_all と requests.get を遮断する pytest フィクスチャ。
        email: ログインに使うメールアドレス。
        password: ログインに使うパスワード。

    Returns:
        なし。"""
    # 1. 未入力で送ると入力を促すエラーを出し認証を呼ばず失敗回数にも数えないことを確認する。
    # at: 指定した入力値を送信した後の画面状態。
    at = _submit(_new_app(), email=email, password=password)
    assert "メールアドレスとパスワードを入力してください。" in _errors(at)
    post.assert_not_called()
    assert SESSION_FAIL_COUNT not in at.session_state


# ---------------------------------------------------------------- ロック


def test_5回続けて失敗すると6回目はロック表示になりrequests_postを呼ばない(fake_env, post, data_get):
    """5回続けて失敗すると6回目はロック表示になりrequests postを呼ばないことを確認する。

    Args:
        fake_env: 架空の Supabase 接続情報を設定する pytest フィクスチャ。
        post: requests.post を差し替えた認証リクエストのモック。
        data_get: load_all と requests.get を遮断する pytest フィクスチャ。

    Returns:
        なし。"""
    post.return_value = _response(400)
    # 変数の内容: at: 初回描画後、ロック状態を設定するログイン画面。
    at = _new_app()
    # 1. 5回失敗する（5回目まではふつうのエラー）
    for _ in range(5):
        # 変数の内容: at: 操作を反映した Streamlit AppTest の画面状態。
        at = _submit(at)
        assert MSG_BAD_CREDENTIALS in _errors(at)
    assert at.session_state[SESSION_FAIL_COUNT] == 5
    assert post.call_count == 5
    # 2. 6回目はロック。正しいパスワードでも Supabase に問い合わせない
    post.return_value = _response(200, {"user": {"email": EMAIL}})
    # 変数の内容: at: ロック中の6回目送信後の Streamlit AppTest 画面。
    at = _submit(at)
    assert MSG_LOCKED in _errors(at)
    assert post.call_count == 5
    assert SESSION_EMAIL not in at.session_state
    # 3. ロック中の試行は失敗回数に足さない
    assert at.session_state[SESSION_FAIL_COUNT] == 5


def test_4回失敗のあとはまだロックされず5回目も認証を呼ぶ(fake_env, post, data_get):
    """4回失敗のあとはまだロックされず5回目も認証を呼ぶことを確認する。

    Args:
        fake_env: 架空の Supabase 接続情報を設定する pytest フィクスチャ。
        post: requests.post を差し替えた認証リクエストのモック。
        data_get: load_all と requests.get を遮断する pytest フィクスチャ。

    Returns:
        なし。"""
    # 1. 4回失敗のあとはまだロックされず5回目も認証を呼ぶことを確認する。
    post.return_value = _response(400)
    # 変数の内容: at: Streamlit AppTest の現在の画面状態。
    at = _new_app()
    at.session_state[SESSION_FAIL_COUNT] = 4
    at.session_state[SESSION_LAST_FAIL] = time.time()
    # 変数の内容: at: 操作を反映した Streamlit AppTest の画面状態。
    # at: 1回目の失敗を反映した画面状態。
    at = _submit(at)
    assert MSG_BAD_CREDENTIALS in _errors(at)
    assert post.call_count == 1
    assert at.session_state[SESSION_FAIL_COUNT] == 5


def test_ロック時間が過ぎれば再びログインでき成功する(fake_env, post, data_get):
    """ロック時間が過ぎれば再びログインでき成功することを確認する。

    Args:
        fake_env: 架空の Supabase 接続情報を設定する pytest フィクスチャ。
        post: requests.post を差し替えた認証リクエストのモック。
        data_get: load_all と requests.get を遮断する pytest フィクスチャ。

    Returns:
        なし。"""
    # 1. ロック時間が過ぎれば再びログインでき成功することを確認する。
    at = _new_app()
    at.session_state[SESSION_FAIL_COUNT] = 5
    at.session_state[SESSION_LAST_FAIL] = time.time() - LOCK_SECONDS - 1
    # 変数の内容: at: ロック期間終了後にログイン成功した Streamlit AppTest 画面。
    at = _submit(at)
    assert MSG_LOCKED not in _errors(at)
    assert post.call_count == 1
    assert at.session_state[SESSION_EMAIL] == EMAIL


def test_ロック時間が過ぎた後の失敗は1回目から数え直し直後に再ロックしない(fake_env, post, data_get):
    """ロック時間が過ぎた後の失敗は1回目から数え直し直後に再ロックしないことを確認する。

    Args:
        fake_env: 架空の Supabase 接続情報を設定する pytest フィクスチャ。
        post: requests.post を差し替えた認証リクエストのモック。
        data_get: load_all と requests.get を遮断する pytest フィクスチャ。

    Returns:
        なし。"""
    post.return_value = _response(400)
    # 変数の内容: at: Streamlit AppTest の現在の画面状態。
    at = _new_app()
    at.session_state[SESSION_FAIL_COUNT] = 5
    at.session_state[SESSION_LAST_FAIL] = time.time() - LOCK_SECONDS - 1
    # 1. ロック明けの失敗は 1 回目として数える
    at = _submit(at)
    assert MSG_BAD_CREDENTIALS in _errors(at)
    assert at.session_state[SESSION_FAIL_COUNT] == 1
    # 2. 次の試行もロックされず認証を呼ぶ
    at = _submit(at)
    assert MSG_LOCKED not in _errors(at)
    assert post.call_count == 2
    assert at.session_state[SESSION_FAIL_COUNT] == 2


def test_ロック中に通信エラーが起きる状況でもロック表示が優先される(fake_env, post, data_get):
    """ロック中に通信エラーが起きる状況でもロック表示が優先されることを確認する。

    Args:
        fake_env: 架空の Supabase 接続情報を設定する pytest フィクスチャ。
        post: requests.post を差し替えた認証リクエストのモック。
        data_get: load_all と requests.get を遮断する pytest フィクスチャ。

    Returns:
        なし。"""
    # 1. ロック中に通信エラーが起きる状況でもロック表示が優先されることを確認する。
    post.side_effect = requests.ConnectionError("c")
    # 変数の内容: at: Streamlit AppTest の現在の画面状態。
    at = _new_app()
    at.session_state[SESSION_FAIL_COUNT] = 5
    at.session_state[SESSION_LAST_FAIL] = time.time()
    # 変数の内容: at: 操作を反映した Streamlit AppTest の画面状態。
    at = _submit(at)
    assert MSG_LOCKED in _errors(at)
    post.assert_not_called()


# ---------------------------------------------------------------- 許可リスト


def test_許可リストに無いアカウントは認証に成功しても拒否され失敗回数に数える(fake_env, monkeypatch, post, data_get):
    """許可リストに無いアカウントは認証に成功しても拒否され失敗回数に数えることを確認する。

    Args:
        fake_env: 架空の Supabase 接続情報を設定する pytest フィクスチャ。
        monkeypatch: 依存値を一時差し替えする pytest フィクスチャ。
        post: requests.post を差し替えた認証リクエストのモック。
        data_get: load_all と requests.get を遮断する pytest フィクスチャ。

    Returns:
        なし。"""
    # 1. 許可リストに無いアカウントは認証に成功しても拒否され失敗回数に数えることを確認する。
    # load_all: 本番データ取得を置き換えるモック。破棄値は未使用。
    load_all, _ = data_get
    monkeypatch.setenv("ANALYTICS_ALLOWED_EMAILS", "owner@example.com, staff@example.com")
    # 変数の内容: at: Streamlit AppTest の現在の画面状態。
    at = _submit(_new_app())
    assert MSG_NOT_ALLOWED in _errors(at)
    assert SESSION_EMAIL not in at.session_state
    assert at.session_state[SESSION_FAIL_COUNT] == 1
    assert _is_login_form(at)
    load_all.assert_not_called()


def test_許可リストにあるアカウントは大文字小文字が違ってもログインできる(fake_env, monkeypatch, post, data_get):
    """許可リストにあるアカウントは大文字小文字が違ってもログインできることを確認する。

    Args:
        fake_env: 架空の Supabase 接続情報を設定する pytest フィクスチャ。
        monkeypatch: 依存値を一時差し替えする pytest フィクスチャ。
        post: requests.post を差し替えた認証リクエストのモック。
        data_get: load_all と requests.get を遮断する pytest フィクスチャ。

    Returns:
        なし。"""
    # 1. 許可リストにあるアカウントは大文字小文字が違ってもログインできることを確認する。
    monkeypatch.setenv("ANALYTICS_ALLOWED_EMAILS", " ADMIN@example.com ,owner@example.com")
    # 変数の内容: at: Streamlit AppTest の現在の画面状態。
    at = _submit(_new_app())
    assert MSG_NOT_ALLOWED not in _errors(at)
    assert at.session_state[SESSION_EMAIL] == EMAIL


def test_許可リストの判定は入力ではなくSupabaseが返したメールで行う(fake_env, monkeypatch, post, data_get):
    # 入力は許可リストのメールでも、Supabase が返したのが別のメールなら拒否する
    """許可リストの判定は入力ではなくSupabaseが返したメールで行うことを確認する。

    Args:
        fake_env: 架空の Supabase 接続情報を設定する pytest フィクスチャ。
        monkeypatch: 依存値を一時差し替えする pytest フィクスチャ。
        post: requests.post を差し替えた認証リクエストのモック。
        data_get: load_all と requests.get を遮断する pytest フィクスチャ。

    Returns:
        なし。"""
    # 1. 許可リストの判定は入力ではなくSupabaseが返したメールで行うことを確認する。
    monkeypatch.setenv("ANALYTICS_ALLOWED_EMAILS", "owner@example.com")
    post.return_value = _response(200, {"user": {"email": "other@example.com"}})
    # 変数の内容: at: Streamlit AppTest の現在の画面状態。
    at = _submit(_new_app(), email="owner@example.com")
    assert MSG_NOT_ALLOWED in _errors(at)
    assert SESSION_EMAIL not in at.session_state


# ---------------------------------------------------------------- ログアウト


def test_ログアウトするとauth_emailが消えてログインフォームに戻る(fake_env, post, data_get):
    """ログアウトするとauth emailが消えてログインフォームに戻ることを確認する。

    Args:
        fake_env: 架空の Supabase 接続情報を設定する pytest フィクスチャ。
        post: requests.post を差し替えた認証リクエストのモック。
        data_get: load_all と requests.get を遮断する pytest フィクスチャ。

    Returns:
        なし。"""
    # 変数の内容: at: Streamlit AppTest の現在の画面状態。
    at = _submit(_new_app())
    assert at.session_state[SESSION_EMAIL] == EMAIL
    # 変数の内容: load_all: 本番データ取得を置き換えるモック関数。、_: このテストでは呼び出し回数を確認しない戻り値。
    load_all, _ = data_get
    # 変数の内容: calls_before: ログアウトや再実行の前に記録したデータ取得呼び出し回数。
    calls_before = load_all.call_count
    # 1. サイドバーのログアウトを押す
    # logout: AppTest上のサイドバーから見つけたログアウトボタン。
    logout = next(b for b in at.sidebar.button if b.label == "ログアウト")
    # 変数の内容: at: 操作を反映した Streamlit AppTest の画面状態。
    at = logout.click().run()
    assert not at.exception
    # 2. セッションからメールが消え、ログインフォームだけになる
    assert SESSION_EMAIL not in at.session_state
    assert _is_login_form(at)
    assert all(not c.value.startswith("ログイン中") for c in at.sidebar.caption)
    # 3. ログアウト後の描画ではデータを読み込まない
    assert load_all.call_count == calls_before
    # 4. 再ログインには認証をもう一度通す
    # at: ログアウト後に再ログインした画面状態。
    at = _submit(at)
    assert at.session_state[SESSION_EMAIL] == EMAIL
    assert post.call_count == 2


# ---------------------------------------------------------------- ログイン中の許可リストの確かめ直し


def test_ログイン後に許可リストからアドレスを外して再実行するとログアウトされフォームに戻る(fake_env, monkeypatch, post, data_get):
    """ログイン後に許可リストからアドレスを外して再実行するとログアウトされフォームに戻ることを確認する。

    Args:
        fake_env: 架空の Supabase 接続情報を設定する pytest フィクスチャ。
        monkeypatch: 依存値を一時差し替えする pytest フィクスチャ。
        post: requests.post を差し替えた認証リクエストのモック。
        data_get: load_all と requests.get を遮断する pytest フィクスチャ。

    Returns:
        なし。"""
    # 変数の内容: load_all: 本番データ取得を置き換えるモック関数。、get: 外部通信を防ぐ requests.get のモック。
    load_all, get = data_get
    # 1. 許可リストに入った状態でログインする
    monkeypatch.setenv("ANALYTICS_ALLOWED_EMAILS", f"{EMAIL},owner@example.com")
    # 変数の内容: at: Streamlit AppTest の現在の画面状態。
    at = _submit(_new_app())
    assert at.session_state[SESSION_EMAIL] == EMAIL
    # 変数の内容: calls_before: ログアウトや再実行の前に記録したデータ取得呼び出し回数。
    calls_before = load_all.call_count
    # 2. 許可リストからそのアドレスを外して描き直す
    monkeypatch.setenv("ANALYTICS_ALLOWED_EMAILS", "owner@example.com")
    at.run()
    assert not at.exception
    # 3. ログイン状態が消え、ログインフォームだけになる
    assert SESSION_EMAIL not in at.session_state
    assert _is_login_form(at)
    assert all(not c.value.startswith("ログイン中") for c in at.sidebar.caption)
    # 4. ダッシュボードのデータ取得は呼ばれず、認証も呼び直さない
    assert load_all.call_count == calls_before
    get.assert_not_called()
    assert post.call_count == 1


def test_ログイン後に許可リストを別のアドレスだけにして再実行してもダッシュボードは描かれない(fake_env, monkeypatch, post, data_get):
    # 許可リストが未設定の状態でログインし、あとから別のアドレスだけを許可するよう設定された場合
    """ログイン後に許可リストを別のアドレスだけにして再実行してもダッシュボードは描かれないことを確認する。

    Args:
        fake_env: 架空の Supabase 接続情報を設定する pytest フィクスチャ。
        monkeypatch: 依存値を一時差し替えする pytest フィクスチャ。
        post: requests.post を差し替えた認証リクエストのモック。
        data_get: load_all と requests.get を遮断する pytest フィクスチャ。

    Returns:
        なし。"""
    # 1. ログイン後に許可リストを別のアドレスだけにして再実行してもダッシュボードは描かれないことを確認する。
    # load_all: 本番データ取得を置き換えるモック。破棄値は未使用。
    load_all, _ = data_get
    # 変数の内容: at: Streamlit AppTest の現在の画面状態。
    at = _submit(_new_app())
    assert at.session_state[SESSION_EMAIL] == EMAIL
    # 変数の内容: calls_before: ログアウトや再実行の前に記録したデータ取得呼び出し回数。
    calls_before = load_all.call_count
    monkeypatch.setenv("ANALYTICS_ALLOWED_EMAILS", "owner@example.com")
    at.run()
    assert SESSION_EMAIL not in at.session_state
    assert _is_login_form(at)
    assert load_all.call_count == calls_before


@pytest.mark.parametrize("allowed", [None, "", "  "], ids=["未設定", "空文字", "空白だけ"])
def test_許可リストが未設定や空のままなら再実行してもログイン状態が続く(fake_env, monkeypatch, post, data_get, allowed):
    """許可リストが未設定や空のままなら再実行してもログイン状態が続くことを確認する。

    Args:
        fake_env: 架空の Supabase 接続情報を設定する pytest フィクスチャ。
        monkeypatch: 依存値を一時差し替えする pytest フィクスチャ。
        post: requests.post を差し替えた認証リクエストのモック。
        data_get: load_all と requests.get を遮断する pytest フィクスチャ。
        allowed: ログインを許可するメールアドレス一覧。

    Returns:
        なし。"""
    # 1. 許可リストが未設定や空のままなら再実行してもログイン状態が続くことを確認する。
    # load_all: 本番データ取得を置き換えるモック。破棄値は未使用。
    load_all, _ = data_get
    if allowed is not None:
        monkeypatch.setenv("ANALYTICS_ALLOWED_EMAILS", allowed)
    # 変数の内容: at: Streamlit AppTest の現在の画面状態。
    at = _submit(_new_app())
    # 2回描き直してもログインしたまま、ダッシュボードが描かれ続ける
    for _ in range(2):
        # 変数の内容: calls_before: ログアウトや再実行の前に記録したデータ取得呼び出し回数。
        calls_before = load_all.call_count
        at.run()
        assert not at.exception
        assert at.session_state[SESSION_EMAIL] == EMAIL
        assert f"ログイン中: {EMAIL}" in [c.value for c in at.sidebar.caption]
        assert len(at.text_input) == 0
        assert load_all.call_count > calls_before
    assert post.call_count == 1


def test_許可リストに残っていれば大文字小文字が違っても再実行後もログイン状態が続く(fake_env, monkeypatch, post, data_get):
    """許可リストに残っていれば大文字小文字が違っても再実行後もログイン状態が続くことを確認する。

    Args:
        fake_env: 架空の Supabase 接続情報を設定する pytest フィクスチャ。
        monkeypatch: 依存値を一時差し替えする pytest フィクスチャ。
        post: requests.post を差し替えた認証リクエストのモック。
        data_get: load_all と requests.get を遮断する pytest フィクスチャ。

    Returns:
        なし。"""
    # 1. 許可リストに残っていれば大文字小文字が違っても再実行後もログイン状態が続くことを確認する。
    monkeypatch.setenv("ANALYTICS_ALLOWED_EMAILS", EMAIL)
    # 変数の内容: at: Streamlit AppTest の現在の画面状態。
    at = _submit(_new_app())
    monkeypatch.setenv("ANALYTICS_ALLOWED_EMAILS", f" {EMAIL.upper()} , owner@example.com")
    at.run()
    assert at.session_state[SESSION_EMAIL] == EMAIL
    assert len(at.text_input) == 0


# ---------------------------------------------------------------- 送信後の入力欄のクリア（clear_on_submit）


def test_送信後は入力欄が空に戻り同じパスワードは再送されない(fake_env, post, data_get):
    # clear_on_submit=True のため、失敗後に入力し直さず再送すると空のまま送られ、入力を促すエラーになる
    """送信後は入力欄が空に戻り同じパスワードは再送されないことを確認する。

    Args:
        fake_env: 架空の Supabase 接続情報を設定する pytest フィクスチャ。
        post: requests.post を差し替えた認証リクエストのモック。
        data_get: load_all と requests.get を遮断する pytest フィクスチャ。

    Returns:
        なし。"""
    # 1. 送信後は入力欄が空に戻り同じパスワードは再送されないことを確認する。
    post.return_value = _response(400)
    # 変数の内容: at: Streamlit AppTest の現在の画面状態。
    at = _submit(_new_app())
    assert MSG_BAD_CREDENTIALS in _errors(at)
    assert post.call_count == 1
    # 入力し直さずにもう一度ログインを押す
    # at: 入力し直さず再送信操作をした後の画面状態。
    at = at.button(key="FormSubmitter:login_form-ログイン").click().run()
    assert "メールアドレスとパスワードを入力してください。" in _errors(at)
    assert post.call_count == 1


def test_ログイン後に画面を最後まで描くとパスワード欄の値がセッションの内部状態に残らない(fake_env, monkeypatch, post, data_get):
    # 概要ページを最後まで描き終える軽い関数に差し替える（データ取得もしない）
    """ログイン後に画面を最後まで描くとパスワード欄の値がセッションの内部状態に残らないことを確認する。

    Args:
        fake_env: 架空の Supabase 接続情報を設定する pytest フィクスチャ。
        monkeypatch: 依存値を一時差し替えする pytest フィクスチャ。
        post: requests.post を差し替えた認証リクエストのモック。
        data_get: load_all と requests.get を遮断する pytest フィクスチャ。

    Returns:
        なし。"""
    # 1. ログイン後に画面を最後まで描くとパスワード欄の値がセッションの内部状態に残らないことを確認する。
    import views.overview

    monkeypatch.setattr(views.overview, "render", lambda: st.write("概要（テスト用）"))
    # 変数の内容: at: Streamlit AppTest の現在の画面状態。
    # at: ログイン後に概要ページまで描画されたアプリ状態。
    at = _submit(_new_app())
    assert at.session_state[SESSION_EMAIL] == EMAIL
    assert "概要（テスト用）" in [m.value for m in at.markdown]
    # Streamlit 内部の状態（キーなしウィジェットの値も含む）にパスワードが残らない
    assert PASSWORD not in _internal_state_text(at)


def test_ログイン直後の描画がst_stopで終わってもパスワードは内部状態にもsession_stateにも残らない(fake_env, post, data_get):
    # 概要ページはデータを読み込めず st.stop() で終わる（data_get のモック）。
    # Streamlit はこのとき古いウィジェットを片付けないが、require_login がログイン済みの実行の最初に
    # パスワード欄の値（auth_password_input）を消すので残らない
    """ログイン直後の描画がst stopで終わってもパスワードは内部状態にもsession stateにも残らないことを確認する。

    Args:
        fake_env: 架空の Supabase 接続情報を設定する pytest フィクスチャ。
        post: requests.post を差し替えた認証リクエストのモック。
        data_get: load_all と requests.get を遮断する pytest フィクスチャ。

    Returns:
        なし。"""
    # 変数の内容: at: Streamlit AppTest の現在の画面状態。
    at = _submit(_new_app())
    assert at.session_state[SESSION_EMAIL] == EMAIL
    assert any(MSG_DATA_ERROR in e for e in _errors(at))  # st.stop() で終わったことの確認
    # 1. ログイン成功直後の実行（st.rerun 後の描画）の時点で、すでに残っていない
    assert PASSWORD not in _internal_state_text(at)
    assert SESSION_PASSWORD_INPUT not in at.session_state
    # 2. 次の実行のあとも、内部のウィジェット状態・session_state のどこにも無い
    at.run()
    assert any(MSG_DATA_ERROR in e for e in _errors(at))
    assert PASSWORD not in _internal_state_text(at)
    assert SESSION_PASSWORD_INPUT not in at.session_state
    # key: セッションに残る値をパスワードと照合するキー名。
    for key in at.session_state.keys():
        assert PASSWORD not in str(at.session_state[key]), key


def test_パスワード欄のキーはauth_password_input():
    """パスワード欄のキーはauth password inputことを確認する。

    Returns:
        なし。"""
    # 1. パスワード欄のキーはauth password inputことを確認する。
    assert SESSION_PASSWORD_INPUT == "auth_password_input"


# ---------------------------------------------------------------- 公開時の設定


def test_config_tomlでエラーの詳細を画面に出さない設定になっている():
    """config tomlでエラーの詳細を画面に出さない設定になっていることを確認する。

    Returns:
        なし。"""
    # 1. config tomlでエラーの詳細を画面に出さない設定になっていることを確認する。
    import tomllib

    # 変数の内容: config_path: 確認対象の Streamlit 設定ファイルのパス。
    config_path = Path(__file__).resolve().parents[1] / ".streamlit" / "config.toml"
    # 変数の内容: config: テスト対象の設定。
    config = tomllib.loads(config_path.read_text(encoding="utf-8"))
    assert config["client"]["showErrorDetails"] == "none"
    # XSRF 保護・CORS を無効にしていない（README の約束）
    assert config.get("server", {}).get("enableXsrfProtection", True) is True
    assert config.get("server", {}).get("enableCORS", True) is True
