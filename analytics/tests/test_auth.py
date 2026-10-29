"""lib/auth.py の判定・通信の関数（authenticate / is_allowed / is_locked）のテスト。

Supabase Auth への通信は requests.post をモックに差し替えて確かめる（本番には接続しない）。
"""

from __future__ import annotations

import logging
from unittest.mock import MagicMock

import pytest
import requests

from lib import auth
from lib.auth import (
    LOCK_SECONDS,
    MAX_FAILS,
    MSG_BAD_CREDENTIALS,
    MSG_NETWORK_ERROR,
    authenticate,
    is_allowed,
    is_locked,
)

# テストで使う架空の接続情報とアカウント
URL = "https://fake-project.example.invalid"
# 認証リクエストに渡す架空 anon キー
ANON = "fake-anon-key-for-test"
# 認証に使う架空アカウントのメールアドレス
EMAIL = "admin@example.com"
# 認証に使う架空パスワード
PASSWORD = "S3cret-Pass!word"


def _response(status: int, body=None, json_error: bool = False) -> MagicMock:
    """requests.post が返す応答のモックを作る。

    Args:
        status: HTTP ステータスコード
        body: res.json() が返す値
        json_error: True なら res.json() が ValueError を出す（JSON でない応答）

    Returns:
        応答のモック
    """
    # 変数の内容: res: requests.post の応答を模したオブジェクト。
    res = MagicMock()
    res.status_code = status
    if json_error:
        res.json.side_effect = ValueError("not json")
    else:
        res.json.return_value = body if body is not None else {}
    return res


@pytest.fixture
def post(monkeypatch):
    """requests.post をモックに差し替えて返す（既定は 200 でメールアドレスあり）。

    Args:
        monkeypatch: 依存値を一時差し替えする pytest フィクスチャ。

    Returns:
        requests.post のモック応答を返す。"""
    # 変数の内容: mock: 対象依存処理を置き換えるモック。
    mock = MagicMock(return_value=_response(200, {"access_token": "tok-xyz", "user": {"email": EMAIL}}))
    monkeypatch.setattr(requests, "post", mock)
    return mock


# ---------------------------------------------------------------- authenticate


def test_authenticate_200でメールアドレスがあれば成功しSupabaseが返したメールを返す(post):
    """authenticate 200でメールアドレスがあれば成功しSupabaseが返したメールを返すことを確認する。

    Args:
        post: requests.post を差し替えた認証リクエストのモック。

    Returns:
        なし。"""
    # 1. authenticate 200でメールアドレスがあれば成功しSupabaseが返したメールを返すことを確認する。
    post.return_value = _response(200, {"access_token": "tok", "user": {"email": "Owner@Example.com"}})
    assert authenticate(EMAIL, PASSWORD, URL, ANON) == (True, "Owner@Example.com")


@pytest.mark.parametrize("status", [400, 401, 403, 422, 429, 500])
def test_authenticate_200以外のステータスはすべて資格情報エラーのメッセージになる(post, status):
    """authenticate 200以外のステータスはすべて資格情報エラーのメッセージになることを確認する。

    Args:
        post: requests.post を差し替えた認証リクエストのモック。
        status: モックする認証 API の HTTP ステータスコード。

    Returns:
        なし。"""
    # 1. authenticate 200以外のステータスはすべて資格情報エラーのメッセージになることを確認する。
    post.return_value = _response(status, {"error": "invalid_grant", "error_description": "Invalid login credentials"})
    assert authenticate(EMAIL, PASSWORD, URL, ANON) == (False, MSG_BAD_CREDENTIALS)
    assert MSG_BAD_CREDENTIALS == "メールアドレスまたはパスワードが違います。"


@pytest.mark.parametrize(
    "body",
    [
        {"access_token": "tok"},  # user がない
        {"user": None},  # user が null
        {"user": {}},  # email がない
        {"user": {"email": ""}},  # email が空
        {"user": {"email": None}},  # email が null
    ],
)
def test_authenticate_200でも応答にメールアドレスが無ければ失敗になる(post, body):
    """authenticate 200でも応答にメールアドレスが無ければ失敗になることを確認する。

    Args:
        post: requests.post を差し替えた認証リクエストのモック。
        body: 認証 API が返す JSON 応答。

    Returns:
        なし。"""
    # 1. authenticate 200でも応答にメールアドレスが無ければ失敗になることを確認する。
    post.return_value = _response(200, body)
    assert authenticate(EMAIL, PASSWORD, URL, ANON) == (False, MSG_BAD_CREDENTIALS)


def test_authenticate_200でも応答がJSONでなければ失敗になる(post):
    """authenticate 200でも応答がJSONでなければ失敗になることを確認する。

    Args:
        post: requests.post を差し替えた認証リクエストのモック。

    Returns:
        なし。"""
    # 1. authenticate 200でも応答がJSONでなければ失敗になることを確認する。
    post.return_value = _response(200, json_error=True)
    assert authenticate(EMAIL, PASSWORD, URL, ANON) == (False, MSG_BAD_CREDENTIALS)


@pytest.mark.parametrize(
    "exc",
    [
        requests.Timeout("timed out"),
        requests.ConnectionError("connection refused"),
        requests.RequestException("other"),
    ],
)
def test_authenticate_タイムアウトや接続エラーは通信エラーのメッセージになり資格情報エラーと区別される(post, exc):
    """authenticate タイムアウトや接続エラーは通信エラーのメッセージになり資格情報エラーと区別されることを確認する。

    Args:
        post: requests.post を差し替えた認証リクエストのモック。
        exc: 処理時に発生する例外。

    Returns:
        なし。"""
    # 1. authenticate タイムアウトや接続エラーは通信エラーのメッセージになり資格情報エラーと区別されることを確認する。
    post.side_effect = exc
    # 変数の内容: ok: 認証が成功したかを示す結果。；msg: 認証処理が返した表示用メッセージ。
    ok, msg = authenticate(EMAIL, PASSWORD, URL, ANON)
    assert ok is False
    assert msg == MSG_NETWORK_ERROR
    assert msg != MSG_BAD_CREDENTIALS


def test_authenticate_送信先URL_apikeyヘッダー_本文_timeout10秒が正しい(post):
    """authenticate 送信先URL apikeyヘッダー 本文 timeout10秒が正しいことを確認する。

    Args:
        post: requests.post を差し替えた認証リクエストのモック。

    Returns:
        なし。"""
    authenticate(EMAIL, PASSWORD, URL, ANON)
    post.assert_called_once()
    # 変数の内容: args, kwargs: モックされた HTTP 呼び出しの位置引数と名前付き引数。
    args, kwargs = post.call_args
    # 1. 送信先は {url}/auth/v1/token、grant_type=password はクエリで渡す
    assert args[0] == f"{URL}/auth/v1/token"
    assert kwargs["params"] == {"grant_type": "password"}
    # 2. anon キーは apikey ヘッダーで送り、JSON で送る
    assert kwargs["headers"]["apikey"] == ANON
    assert kwargs["headers"]["Content-Type"] == "application/json"
    # 3. 本文はメールアドレスとパスワード
    assert kwargs["json"] == {"email": EMAIL, "password": PASSWORD}
    # 4. 待ち時間は 10 秒
    assert kwargs["timeout"] == 10
    assert auth.AUTH_TIMEOUT == 10


def test_authenticate_URLの末尾にスラッシュがあっても二重にならない(post):
    """authenticate URLの末尾にスラッシュがあっても二重にならないことを確認する。

    Args:
        post: requests.post を差し替えた認証リクエストのモック。

    Returns:
        なし。"""
    # 1. authenticate URLの末尾にスラッシュがあっても二重にならないことを確認する。
    authenticate(EMAIL, PASSWORD, URL + "/", ANON)
    assert post.call_args.args[0] == f"{URL}/auth/v1/token"


def test_authenticate_service_roleキーではなく渡されたanonキーだけを使う(post, monkeypatch):
    """authenticate service roleキーではなく渡されたanonキーだけを使うことを確認する。

    Args:
        post: requests.post を差し替えた認証リクエストのモック。
        monkeypatch: 依存値を一時差し替えする pytest フィクスチャ。

    Returns:
        なし。"""
    # 1. authenticate service roleキーではなく渡されたanonキーだけを使うことを確認する。
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "fake-service-role-should-not-be-used")
    authenticate(EMAIL, PASSWORD, URL, ANON)
    # 変数の内容: headers: 認証リクエストの HTTP ヘッダー。
    headers = post.call_args.kwargs["headers"]
    assert "fake-service-role-should-not-be-used" not in str(headers)
    assert "Authorization" not in headers


@pytest.mark.parametrize(
    "setup",
    [
        lambda m: setattr(m, "return_value", _response(200, {"access_token": "tok-SECRET", "user": {"email": EMAIL}})),
        lambda m: setattr(m, "return_value", _response(400, {"error": "invalid_grant"})),
        lambda m: setattr(m, "return_value", _response(200, {"access_token": "tok-SECRET"})),
        lambda m: setattr(m, "side_effect", requests.ConnectionError(f"failed: password={PASSWORD}")),
        lambda m: setattr(m, "side_effect", requests.Timeout(f"timeout: password={PASSWORD}")),
    ],
    ids=["成功", "400", "メールなし", "接続エラー", "タイムアウト"],
)
def test_authenticate_パスワードとトークンは戻り値にもログにも出ない(post, setup, caplog):
    """authenticate パスワードとトークンは戻り値にもログにも出ないことを確認する。

    Args:
        post: requests.post を差し替えた認証リクエストのモック。
        setup: テスト対象に適用する初期設定。
        caplog: ログを取得する pytest フィクスチャ。

    Returns:
        なし。"""
    setup(post)
    with caplog.at_level(logging.DEBUG):
        # 変数の内容: result: authenticate が返した認証結果（機密値が含まれないことを検証する値）。
        result = authenticate(EMAIL, PASSWORD, URL, ANON)
    # 1. 戻り値にパスワード・トークンが含まれない
    assert PASSWORD not in str(result)
    assert "tok-SECRET" not in str(result)
    # 2. ログにもパスワード・トークン・anon キーが出ない（例外の文字列にパスワードが入っていても）
    assert PASSWORD not in caplog.text
    assert "tok-SECRET" not in caplog.text
    assert ANON not in caplog.text


def test_authenticate_通信エラーのログには例外の種類だけが残る(post, caplog):
    """authenticate 通信エラーのログには例外の種類だけが残ることを確認する。

    Args:
        post: requests.post を差し替えた認証リクエストのモック。
        caplog: ログを取得する pytest フィクスチャ。

    Returns:
        なし。"""
    # 1. authenticate 通信エラーのログには例外の種類だけが残ることを確認する。
    post.side_effect = requests.ConnectionError("detail-should-not-appear")
    with caplog.at_level(logging.ERROR):
        authenticate(EMAIL, PASSWORD, URL, ANON)
    assert "ConnectionError" in caplog.text
    assert "detail-should-not-appear" not in caplog.text


# ---------------------------------------------------------------- is_allowed


@pytest.mark.parametrize("allowed_env", [None, "", "   ", ",", " , , "])
def test_is_allowed_許可リストが未設定や空なら誰でも許可される(allowed_env):
    """is allowed 許可リストが未設定や空なら誰でも許可されることを確認する。

    Args:
        allowed_env: 環境変数の名前と値。

    Returns:
        なし。"""
    # 1. is allowed 許可リストが未設定や空なら誰でも許可されることを確認する。
    assert is_allowed("anyone@example.com", allowed_env) is True


def test_is_allowed_許可リストにあるメールは許可され無いメールは拒否される():
    """is allowed 許可リストにあるメールは許可され無いメールは拒否されることを確認する。

    Returns:
        なし。"""
    # 1. is allowed 許可リストにあるメールは許可され無いメールは拒否されることを確認する。
    env = "a@example.com,b@example.com"
    assert is_allowed("a@example.com", env) is True
    assert is_allowed("b@example.com", env) is True
    assert is_allowed("c@example.com", env) is False


def test_is_allowed_大文字小文字を無視して比較する():
    """is allowed 大文字小文字を無視して比較することを確認する。

    Returns:
        なし。"""
    # 1. is allowed 大文字小文字を無視して比較することを確認する。
    assert is_allowed("Admin@Example.COM", "admin@example.com") is True
    assert is_allowed("admin@example.com", "ADMIN@EXAMPLE.COM") is True


def test_is_allowed_リスト側とメール側の前後の空白を除いて比較する():
    """is allowed リスト側とメール側の前後の空白を除いて比較することを確認する。

    Returns:
        なし。"""
    # 1. is allowed リスト側とメール側の前後の空白を除いて比較することを確認する。
    env = "  a@example.com ,\tb@example.com  , "
    assert is_allowed("a@example.com", env) is True
    assert is_allowed("b@example.com", env) is True
    assert is_allowed("  a@example.com  ", env) is True


def test_is_allowed_部分一致では許可しない():
    """is allowed 部分一致では許可しないことを確認する。

    Returns:
        なし。"""
    # 1. is allowed 部分一致では許可しないことを確認する。
    env = "admin@example.com"
    assert is_allowed("admin@example.co", env) is False
    assert is_allowed("xadmin@example.com", env) is False
    assert is_allowed("admin@example.com.evil", env) is False


def test_is_allowed_空の要素が混ざっていても空文字のメールは許可されない():
    """is allowed 空の要素が混ざっていても空文字のメールは許可されないことを確認する。

    Returns:
        なし。"""
    # 1. is allowed 空の要素が混ざっていても空文字のメールは許可されないことを確認する。
    assert is_allowed("", "a@example.com, ,") is False


# ---------------------------------------------------------------- is_locked

# ロック期間を比較するときに固定する架空の現在時刻（秒）
NOW = 1_000_000.0


def test_is_locked_定数は5回と60秒():
    """is locked 定数は5回と60秒ことを確認する。

    Returns:
        なし。"""
    # 1. is locked 定数は5回と60秒ことを確認する。
    assert MAX_FAILS == 5
    assert LOCK_SECONDS == 60


@pytest.mark.parametrize("count", [0, 1, 4])
def test_is_locked_失敗が5回未満ならロックしない(count):
    """is locked 失敗が5回未満ならロックしないことを確認する。

    Args:
        count: 検証する呼び出し回数。

    Returns:
        なし。"""
    # 1. is locked 失敗が5回未満ならロックしないことを確認する。
    assert is_locked(count, NOW, NOW) is False


@pytest.mark.parametrize("count", [5, 6, 100])
def test_is_locked_失敗が5回以上で直後ならロックする(count):
    """is locked 失敗が5回以上で直後ならロックすることを確認する。

    Args:
        count: 検証する呼び出し回数。

    Returns:
        なし。"""
    # 1. is locked 失敗が5回以上で直後ならロックすることを確認する。
    assert is_locked(count, NOW, NOW) is True


def test_is_locked_5回目の失敗から59_9秒ではまだロック中():
    """is locked 5回目の失敗から59 9秒ではまだロック中ことを確認する。

    Returns:
        なし。"""
    # 1. is locked 5回目の失敗から59 9秒ではまだロック中ことを確認する。
    assert is_locked(5, NOW, NOW + 59.9) is True


def test_is_locked_5回目の失敗からちょうど60秒でロックが解ける():
    """is locked 5回目の失敗からちょうど60秒でロックが解けることを確認する。

    Returns:
        なし。"""
    # 1. is locked 5回目の失敗からちょうど60秒でロックが解けることを確認する。
    assert is_locked(5, NOW, NOW + 60) is False


def test_is_locked_60秒を過ぎればロックしない():
    """is locked 60秒を過ぎればロックしないことを確認する。

    Returns:
        なし。"""
    # 1. is locked 60秒を過ぎればロックしないことを確認する。
    assert is_locked(5, NOW, NOW + 61) is False


def test_is_locked_最後の失敗時刻がNoneならロックしない():
    """is locked 最後の失敗時刻がNoneならロックしないことを確認する。

    Returns:
        なし。"""
    # 1. is locked 最後の失敗時刻がNoneならロックしないことを確認する。
    assert is_locked(5, None, NOW) is False
