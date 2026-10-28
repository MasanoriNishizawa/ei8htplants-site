"""lib/ga.py の鍵の受け取り方（GA_CREDENTIALS_JSON / GA_CREDENTIALS）を確かめるテスト。

- 鍵はすべて架空の値（本物の鍵ではない）。GA4 の Data API には一切接続しない
- google の Credentials 作成と Data API のクライアント作成はモックにする
- 確かめること:
  1. parse_credentials_json: 正常・Secrets（TOML）で ''' / \"\"\" で囲んだときの改行・壊れた JSON・
     必須項目の欠け・type 違い、エラーメッセージに鍵の中身が出ないこと
  2. ga_config: GA_CREDENTIALS_JSON の優先・パスだけ・どちらも無い・JSON が壊れているときのメッセージ
  3. load_credentials: "env:GA_CREDENTIALS_JSON" の目印なら環境変数から、それ以外はファイルの場所から作る
  4. run_report: st.cache_data のキーになる引数に鍵の中身が入らないこと
"""

from __future__ import annotations

import json
import tomllib
from unittest.mock import MagicMock

import pytest
import streamlit.runtime.caching.cache_utils as cache_utils
from google.oauth2 import service_account

import lib.ga as ga
from lib.ga import (
    CREDENTIALS_JSON_ENV,
    JSON_CREDENTIALS_REF,
    SCOPES,
    CredentialsError,
    GaConfig,
    ga_config,
    load_credentials,
    parse_credentials_json,
)

# 架空の鍵の中身（本物の鍵ではない。エラーメッセージやキャッシュのキーに出ていないかの目印に使う）
FAKE_PRIVATE_KEY_BODY = "FAKE-PRIVATE-KEY-BODY-FOR-TEST-ONLY"
FAKE_PRIVATE_KEY = f"-----BEGIN PRIVATE KEY-----\n{FAKE_PRIVATE_KEY_BODY}\n-----END PRIVATE KEY-----\n"
FAKE_PRIVATE_KEY_ID = "fake-private-key-id-0123456789"
FAKE_CLIENT_EMAIL = "fake-sa@fake-project.iam.gserviceaccount.com"

# 架空のサービスアカウントの鍵（鍵ファイルの中身と同じ形）
FAKE_KEY_INFO = {
    "type": "service_account",
    "project_id": "fake-project",
    "private_key_id": FAKE_PRIVATE_KEY_ID,
    "private_key": FAKE_PRIVATE_KEY,
    "client_email": FAKE_CLIENT_EMAIL,
    "client_id": "000000000000000000000",
    "token_uri": "https://oauth2.example.invalid/token",
}

# 鍵ファイルの中身そのもの（JSON 文字列。private_key の改行は「\n」の2文字で書かれている）
FAKE_KEY_JSON = json.dumps(FAKE_KEY_INFO, indent=2)

# 架空のプロパティ ID
FAKE_PROPERTY_ID = "123456789"

# エラーメッセージ・キャッシュのキーに出てはいけない秘密の値
SECRET_VALUES = (FAKE_PRIVATE_KEY_BODY, FAKE_PRIVATE_KEY_ID, FAKE_CLIENT_EMAIL)


def _assert_no_secret(text: str) -> None:
    """文字列に鍵の中身（private_key・private_key_id・client_email）が含まれていないことを確かめる。

    Args:
        text: 確かめる文字列（エラーメッセージなど）

    Returns:
        なし。"""
    for secret in SECRET_VALUES:
        assert secret not in text


# ---------------------------------------------------------------- 1. parse_credentials_json


def test_鍵ファイルの中身をそのまま渡すと鍵の辞書が返る():
    """鍵ファイルの中身をそのまま渡すと鍵の辞書が返ることを確認する。

    Returns:
        なし。"""
    info = parse_credentials_json(FAKE_KEY_JSON)
    assert info == FAKE_KEY_INFO
    # private_key は本物の改行を含む PEM の形になる
    assert info["private_key"].startswith("-----BEGIN PRIVATE KEY-----\n")


def test_Secretsでシングルクォート3つで囲むと改行がそのまま残り鍵として読める():
    # 1. Secrets の書き方（''' は「\n」を変換しないリテラル文字列）で TOML を作り、Streamlit と同じく tomllib で読む
    """Secretsでシングルクォート3つで囲むと改行がそのまま残り鍵として読めることを確認する。

    Returns:
        なし。"""
    toml_text = f"GA_CREDENTIALS_JSON = '''\n{FAKE_KEY_JSON}\n'''\n"
    value = tomllib.loads(toml_text)["GA_CREDENTIALS_JSON"]
    # 2. 「\n」の2文字のまま残っている
    assert "\\n" in value
    # 3. 鍵として読め、private_key は元と同じになる
    assert parse_credentials_json(value)["private_key"] == FAKE_PRIVATE_KEY


def test_Secretsでダブルクォート3つで囲むと改行が本物になっても鍵として読める():
    # 1. \"\"\" は基本文字列なので、JSON の中の「\n」が TOML の段階で本物の改行に変わる
    """Secretsでダブルクォート3つで囲むと改行が本物になっても鍵として読めることを確認する。

    Returns:
        なし。"""
    toml_text = f'GA_CREDENTIALS_JSON = """\n{FAKE_KEY_JSON}\n"""\n'
    value = tomllib.loads(toml_text)["GA_CREDENTIALS_JSON"]
    # 2. 文字列の中に本物の改行が入っている（通常の json.loads では読めない形）
    assert f"\n{FAKE_PRIVATE_KEY_BODY}\n" in value
    with pytest.raises(json.JSONDecodeError):
        json.loads(value)
    # 3. parse_credentials_json は読め、private_key は元と同じ PEM になる
    info = parse_credentials_json(value)
    assert info["private_key"] == FAKE_PRIVATE_KEY
    assert info["client_email"] == FAKE_CLIENT_EMAIL


def test_JSONでない文字列を渡すとCredentialsErrorになり位置だけが伝わり中身は出ない():
    # 1. 途中で切れた JSON（鍵の中身を含む）
    """JSONでない文字列を渡すとCredentialsErrorになり位置だけが伝わり中身は出ないことを確認する。

    Returns:
        なし。"""
    broken = FAKE_KEY_JSON[: FAKE_KEY_JSON.index(FAKE_PRIVATE_KEY_BODY) + len(FAKE_PRIVATE_KEY_BODY)]
    with pytest.raises(CredentialsError) as exc_info:
        parse_credentials_json(broken)
    message = str(exc_info.value)
    # 2. どの環境変数か・どのあたりかは伝わる
    assert "GA_CREDENTIALS_JSON を JSON として読めません" in message
    assert "行" in message and "文字目付近" in message
    # 3. 鍵の中身は出ない。元の例外（JSONDecodeError は doc に入力全体を持つ）もつながない
    _assert_no_secret(message)
    assert exc_info.value.__cause__ is None
    assert exc_info.value.__suppress_context__ is True


def test_空文字を渡すとCredentialsErrorになる():
    """空文字を渡すとCredentialsErrorになることを確認する。

    Returns:
        なし。"""
    with pytest.raises(CredentialsError, match="JSON として読めません"):
        parse_credentials_json("")


@pytest.mark.parametrize("text", ['["service_account"]', '"service_account"', "123"])
def test_JSONでもオブジェクトでないとCredentialsErrorになる(text):
    """JSONでもオブジェクトでないとCredentialsErrorになることを確認する。

    Args:
        text: 検証対象の表示テキスト。

    Returns:
        なし。"""
    with pytest.raises(CredentialsError, match="サービスアカウントの鍵の形"):
        parse_credentials_json(text)


@pytest.mark.parametrize("field", ["client_email", "private_key", "token_uri"])
def test_必須項目が欠けているとCredentialsErrorになり項目名だけが伝わる(field):
    # 1. 1項目を抜いた鍵
    """必須項目が欠けているとCredentialsErrorになり項目名だけが伝わることを確認する。

    Args:
        field: 基準月からの月差。

    Returns:
        なし。"""
    info = {k: v for k, v in FAKE_KEY_INFO.items() if k != field}
    with pytest.raises(CredentialsError) as exc_info:
        parse_credentials_json(json.dumps(info))
    message = str(exc_info.value)
    # 2. 足りない項目の名前は出るが、ほかの項目の値は出ない
    assert f"必要な項目がありません: {field}" in message
    _assert_no_secret(message)


def test_必須項目が空文字だと欠けているのと同じ扱いになる():
    """必須項目が空文字だと欠けているのと同じ扱いになることを確認する。

    Returns:
        なし。"""
    info = {**FAKE_KEY_INFO, "private_key": ""}
    with pytest.raises(CredentialsError, match="必要な項目がありません: private_key"):
        parse_credentials_json(json.dumps(info))


def test_必須項目が複数欠けているとすべての項目名が伝わる():
    """必須項目が複数欠けているとすべての項目名が伝わることを確認する。

    Returns:
        なし。"""
    info = {"type": "service_account"}
    with pytest.raises(CredentialsError) as exc_info:
        parse_credentials_json(json.dumps(info))
    assert "client_email, private_key, token_uri" in str(exc_info.value)


def test_typeがservice_accountでないとCredentialsErrorになり中身は出ない():
    # 1. OAuth クライアントの鍵など、別の種類の JSON を貼った場合
    """typeがservice accountでないとCredentialsErrorになり中身は出ないことを確認する。

    Returns:
        なし。"""
    info = {**FAKE_KEY_INFO, "type": "authorized_user"}
    with pytest.raises(CredentialsError) as exc_info:
        parse_credentials_json(json.dumps(info))
    message = str(exc_info.value)
    assert "サービスアカウントの鍵ではありません" in message
    _assert_no_secret(message)


# ---------------------------------------------------------------- 2. ga_config


@pytest.fixture
def key_file(tmp_path):
    """一時フォルダに架空の鍵ファイルを作る。

    Args:
        tmp_path: pytest の一時フォルダ

    Returns:
        鍵ファイルの場所
    """
    path = tmp_path / "fake-ga-service-account.json"
    path.write_text(FAKE_KEY_JSON, encoding="utf-8")
    return path


def test_GA_CREDENTIALS_JSONとGA_CREDENTIALSの両方があるとJSONを優先する(monkeypatch, key_file):
    """GA CREDENTIALS JSONとGA CREDENTIALSの両方があるとJSONを優先することを確認する。

    Args:
        monkeypatch: 依存値を一時差し替えする pytest フィクスチャ。
        key_file: 架空の Google サービスアカウント鍵ファイル。

    Returns:
        なし。"""
    monkeypatch.setenv("GA_PROPERTY_ID", FAKE_PROPERTY_ID)
    monkeypatch.setenv("GA_CREDENTIALS", str(key_file))
    monkeypatch.setenv(CREDENTIALS_JSON_ENV, FAKE_KEY_JSON)
    cfg, problem = ga_config()
    # 1. 設定は作られ、鍵ファイルの場所は使わない
    assert problem is None
    assert cfg == GaConfig(property_id=FAKE_PROPERTY_ID, credentials_path=None)
    # 2. run_report へは目印だけを渡す（鍵の中身ではない）
    assert cfg.credentials_ref == JSON_CREDENTIALS_REF == "env:GA_CREDENTIALS_JSON"


def test_GA_CREDENTIALS_JSONだけでも設定が作られる(monkeypatch):
    """GA CREDENTIALS JSONだけでも設定が作られることを確認する。

    Args:
        monkeypatch: 依存値を一時差し替えする pytest フィクスチャ。

    Returns:
        なし。"""
    monkeypatch.setenv("GA_PROPERTY_ID", FAKE_PROPERTY_ID)
    monkeypatch.setenv(CREDENTIALS_JSON_ENV, FAKE_KEY_JSON)
    cfg, problem = ga_config()
    assert problem is None
    assert cfg.credentials_ref == JSON_CREDENTIALS_REF


def test_GA_CREDENTIALSのパスだけだと鍵ファイルの場所が目印になる(monkeypatch, key_file):
    """GA CREDENTIALSのパスだけだと鍵ファイルの場所が目印になることを確認する。

    Args:
        monkeypatch: 依存値を一時差し替えする pytest フィクスチャ。
        key_file: 架空の Google サービスアカウント鍵ファイル。

    Returns:
        なし。"""
    monkeypatch.setenv("GA_PROPERTY_ID", FAKE_PROPERTY_ID)
    monkeypatch.setenv("GA_CREDENTIALS", str(key_file))
    cfg, problem = ga_config()
    assert problem is None
    assert cfg.credentials_path == key_file
    assert cfg.credentials_ref == str(key_file)


def test_GA_CREDENTIALS_JSONが空白だけなら無いものとしてパスを使う(monkeypatch, key_file):
    """GA CREDENTIALS JSONが空白だけなら無いものとしてパスを使うことを確認する。

    Args:
        monkeypatch: 依存値を一時差し替えする pytest フィクスチャ。
        key_file: 架空の Google サービスアカウント鍵ファイル。

    Returns:
        なし。"""
    monkeypatch.setenv("GA_PROPERTY_ID", FAKE_PROPERTY_ID)
    monkeypatch.setenv("GA_CREDENTIALS", str(key_file))
    monkeypatch.setenv(CREDENTIALS_JSON_ENV, "  \n  ")
    cfg, problem = ga_config()
    assert problem is None
    assert cfg.credentials_ref == str(key_file)


def test_鍵がどちらも無いと両方の名前を挙げたメッセージが返る(monkeypatch):
    """鍵がどちらも無いと両方の名前を挙げたメッセージが返ることを確認する。

    Args:
        monkeypatch: 依存値を一時差し替えする pytest フィクスチャ。

    Returns:
        なし。"""
    monkeypatch.setenv("GA_PROPERTY_ID", FAKE_PROPERTY_ID)
    cfg, problem = ga_config()
    assert cfg is None
    assert "GA の鍵が設定されていません" in problem
    assert "GA_CREDENTIALS" in problem and "GA_CREDENTIALS_JSON" in problem


def test_GA_CREDENTIALSの場所にファイルが無いとメッセージが返る(monkeypatch, tmp_path):
    """GA CREDENTIALSの場所にファイルが無いとメッセージが返ることを確認する。

    Args:
        monkeypatch: 依存値を一時差し替えする pytest フィクスチャ。
        tmp_path: テスト用の一時ディレクトリ。

    Returns:
        なし。"""
    monkeypatch.setenv("GA_PROPERTY_ID", FAKE_PROPERTY_ID)
    monkeypatch.setenv("GA_CREDENTIALS", str(tmp_path / "missing.json"))
    cfg, problem = ga_config()
    assert cfg is None
    assert problem == "GA_CREDENTIALS に書いた場所に鍵ファイルが見つかりません。"


def test_GA_CREDENTIALS_JSONが壊れていると読めない理由が返り中身は出ない(monkeypatch):
    """GA CREDENTIALS JSONが壊れていると読めない理由が返り中身は出ないことを確認する。

    Args:
        monkeypatch: 依存値を一時差し替えする pytest フィクスチャ。

    Returns:
        なし。"""
    monkeypatch.setenv("GA_PROPERTY_ID", FAKE_PROPERTY_ID)
    monkeypatch.setenv(CREDENTIALS_JSON_ENV, FAKE_KEY_JSON[:-5])
    cfg, problem = ga_config()
    assert cfg is None
    assert "GA_CREDENTIALS_JSON を JSON として読めません" in problem
    _assert_no_secret(problem)


def test_GA_CREDENTIALS_JSONが壊れているとパスが正しくてもパスに切り替えずエラーになる(monkeypatch, key_file):
    # JSON を優先するので、壊れた JSON に気づけるよう黙ってパスに切り替えない
    """GA CREDENTIALS JSONが壊れているとパスが正しくてもパスに切り替えずエラーになることを確認する。

    Args:
        monkeypatch: 依存値を一時差し替えする pytest フィクスチャ。
        key_file: 架空の Google サービスアカウント鍵ファイル。

    Returns:
        なし。"""
    monkeypatch.setenv("GA_PROPERTY_ID", FAKE_PROPERTY_ID)
    monkeypatch.setenv("GA_CREDENTIALS", str(key_file))
    monkeypatch.setenv(CREDENTIALS_JSON_ENV, json.dumps({**FAKE_KEY_INFO, "type": "authorized_user"}))
    cfg, problem = ga_config()
    assert cfg is None
    assert "サービスアカウントの鍵ではありません" in problem
    _assert_no_secret(problem)


def test_GA_CREDENTIALS_JSONがあってもプロパティIDが無ければプロパティIDのメッセージが返る(monkeypatch):
    """GA CREDENTIALS JSONがあってもプロパティIDが無ければプロパティIDのメッセージが返ることを確認する。

    Args:
        monkeypatch: 依存値を一時差し替えする pytest フィクスチャ。

    Returns:
        なし。"""
    monkeypatch.setenv(CREDENTIALS_JSON_ENV, FAKE_KEY_JSON)
    cfg, problem = ga_config()
    assert cfg is None
    assert "GA_PROPERTY_ID が設定されていません" in problem


# ---------------------------------------------------------------- 3. load_credentials


@pytest.fixture
def credentials_factories(monkeypatch):
    """google の Credentials 作成をモックにする（鍵の検証や通信はしない）。

    Returns:
        (from_service_account_info のモック, from_service_account_file のモック)

    Args:
        monkeypatch: 依存値を一時差し替えする pytest フィクスチャ。"""
    from_info = MagicMock(return_value="credentials-from-info")
    from_file = MagicMock(return_value="credentials-from-file")
    monkeypatch.setattr(service_account.Credentials, "from_service_account_info", from_info)
    monkeypatch.setattr(service_account.Credentials, "from_service_account_file", from_file)
    return from_info, from_file


def test_envの目印を渡すとGA_CREDENTIALS_JSONの中身から読み取り専用の認証情報を作る(monkeypatch, credentials_factories):
    """envの目印を渡すとGA CREDENTIALS JSONの中身から読み取り専用の認証情報を作ることを確認する。

    Args:
        monkeypatch: 依存値を一時差し替えする pytest フィクスチャ。
        credentials_factories: Google 認証情報の生成を差し替えるモック。

    Returns:
        なし。"""
    from_info, from_file = credentials_factories
    monkeypatch.setenv(CREDENTIALS_JSON_ENV, FAKE_KEY_JSON)
    assert load_credentials(JSON_CREDENTIALS_REF) == "credentials-from-info"
    # 1. 環境変数の中身を辞書にして渡し、権限は読み取り専用だけ
    from_info.assert_called_once_with(FAKE_KEY_INFO, scopes=SCOPES)
    assert SCOPES == ["https://www.googleapis.com/auth/analytics.readonly"]
    # 2. ファイルとしては読まない
    from_file.assert_not_called()


def test_パスを渡すと鍵ファイルから読み取り専用の認証情報を作る(credentials_factories, key_file):
    """パスを渡すと鍵ファイルから読み取り専用の認証情報を作ることを確認する。

    Args:
        credentials_factories: Google 認証情報の生成を差し替えるモック。
        key_file: 架空の Google サービスアカウント鍵ファイル。

    Returns:
        なし。"""
    from_info, from_file = credentials_factories
    assert load_credentials(str(key_file)) == "credentials-from-file"
    from_file.assert_called_once_with(str(key_file), scopes=SCOPES)
    from_info.assert_not_called()


def test_envの目印なのにGA_CREDENTIALS_JSONが無いとCredentialsErrorになる(credentials_factories):
    """envの目印なのにGA CREDENTIALS JSONが無いとCredentialsErrorになることを確認する。

    Args:
        credentials_factories: Google 認証情報の生成を差し替えるモック。

    Returns:
        なし。"""
    from_info, from_file = credentials_factories
    with pytest.raises(CredentialsError):
        load_credentials(JSON_CREDENTIALS_REF)
    from_info.assert_not_called()
    from_file.assert_not_called()


def test_envの目印でGA_CREDENTIALS_JSONの改行が本物でも認証情報を作れる(monkeypatch, credentials_factories):
    """envの目印でGA CREDENTIALS JSONの改行が本物でも認証情報を作れることを確認する。

    Args:
        monkeypatch: 依存値を一時差し替えする pytest フィクスチャ。
        credentials_factories: Google 認証情報の生成を差し替えるモック。

    Returns:
        なし。"""
    from_info, _ = credentials_factories
    value = tomllib.loads(f'GA_CREDENTIALS_JSON = """\n{FAKE_KEY_JSON}\n"""\n')["GA_CREDENTIALS_JSON"]
    monkeypatch.setenv(CREDENTIALS_JSON_ENV, value)
    load_credentials(JSON_CREDENTIALS_REF)
    assert from_info.call_args.args[0]["private_key"] == FAKE_PRIVATE_KEY


# ---------------------------------------------------------------- 4. run_report のキャッシュ


@pytest.fixture
def fake_client(monkeypatch):
    """Data API のクライアント作成（ga._client）をモックにし、空の応答を返すようにする。

    Returns:
        ga._client のモック（呼ばれた引数を確かめる）

    Args:
        monkeypatch: 依存値を一時差し替えする pytest フィクスチャ。"""
    # 1. run_report の結果をテストごとにやり直すため、キャッシュを空にする
    ga.run_report.clear()
    client = MagicMock()
    client.run_report.return_value = MagicMock(rows=[])
    make_client = MagicMock(return_value=client)
    monkeypatch.setattr(ga, "_client", make_client)
    yield make_client
    ga.run_report.clear()


@pytest.fixture
def cache_key_args(monkeypatch):
    """st.cache_data がキャッシュのキーを作るときに使った引数を記録する。

    Returns:
        記録のリスト（1回の呼び出しごとに (位置引数, キーワード引数)）

    Args:
        monkeypatch: 依存値を一時差し替えする pytest フィクスチャ。"""
    records: list[tuple[tuple, dict]] = []
    original = cache_utils._make_value_key  # noqa: SLF001

    def spy(cache_type, func, func_args, func_kwargs, hash_funcs):
        """spy のテスト補助処理を行う。

        Args:
            cache_type: 検証するキャッシュの種類。
            func: 呼び出しを記録する関数。
            func_args: 対象関数へ渡す位置引数。
            func_kwargs: 対象関数へ渡すキーワード引数。
            hash_funcs: Streamlit キャッシュへ渡す型別ハッシュ関数。

        Returns:
            なし。"""
        records.append((func_args, func_kwargs))
        return original(cache_type, func, func_args, func_kwargs, hash_funcs)

    monkeypatch.setattr(cache_utils, "_make_value_key", spy)
    return records


def test_run_reportのキャッシュのキーに鍵の中身が入らない(monkeypatch, fake_client, cache_key_args):
    # 1. Community Cloud と同じく、鍵は GA_CREDENTIALS_JSON に入っている
    """run reportのキャッシュのキーに鍵の中身が入らないことを確認する。

    Args:
        monkeypatch: 依存値を一時差し替えする pytest フィクスチャ。
        fake_client: GA Data API クライアントを生成するモック。
        cache_key_args: キャッシュキー生成時に記録された呼び出し引数。

    Returns:
        なし。"""
    monkeypatch.setenv("GA_PROPERTY_ID", FAKE_PROPERTY_ID)
    monkeypatch.setenv(CREDENTIALS_JSON_ENV, FAKE_KEY_JSON)
    cfg, _ = ga_config()
    # 2. traffic.py と同じ呼び方で取得する
    df = ga.run_report(cfg.property_id, cfg.credentials_ref, ("date",), ("sessions",), "28daysAgo", "today", None, 1000)
    assert list(df.columns) == ["date", "sessions"]
    # 3. キャッシュのキーに使われた引数は目印だけで、鍵の中身は含まれない
    assert len(cache_key_args) == 1
    key_text = repr(cache_key_args)
    assert JSON_CREDENTIALS_REF in key_text
    _assert_no_secret(key_text)
    assert FAKE_KEY_JSON not in key_text
    # 4. クライアントにも目印だけが渡る（中身は load_credentials の中で初めて読む）
    fake_client.assert_called_once_with(JSON_CREDENTIALS_REF)


def test_GA_CREDENTIALS_JSONの中身を変えても同じ引数ならキャッシュが使われる(monkeypatch, fake_client):
    # 中身がキャッシュのキーに入っていないことを、動きの面からも確かめる
    """GA CREDENTIALS JSONの中身を変えても同じ引数ならキャッシュが使われることを確認する。

    Args:
        monkeypatch: 依存値を一時差し替えする pytest フィクスチャ。
        fake_client: GA Data API クライアントを生成するモック。

    Returns:
        なし。"""
    monkeypatch.setenv(CREDENTIALS_JSON_ENV, FAKE_KEY_JSON)
    args = (FAKE_PROPERTY_ID, JSON_CREDENTIALS_REF, (), ("activeUsers",), "7daysAgo")
    ga.run_report(*args)
    monkeypatch.setenv(CREDENTIALS_JSON_ENV, json.dumps({**FAKE_KEY_INFO, "private_key_id": "another-fake-id"}))
    ga.run_report(*args)
    assert fake_client.call_count == 1


def test_trafficの画面はrun_reportに鍵の中身ではなくcredentials_refを渡している():
    # traffic.py のソースで、run_report の呼び出しが cfg.credentials_ref を使っていることを確かめる
    """trafficの画面はrun reportに鍵の中身ではなくcredentials refを渡していることを確認する。

    Returns:
        なし。"""
    from pathlib import Path

    source = (Path(__file__).resolve().parents[1] / "views" / "traffic.py").read_text(encoding="utf-8")
    assert "run_report(cfg.property_id, cfg.credentials_ref," in source
    assert "GA_CREDENTIALS_JSON\")" not in source and "os.getenv" not in source
