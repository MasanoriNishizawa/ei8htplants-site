"""lib/secrets_env.py（Streamlit の Secrets を環境変数に反映させる処理）を確かめるテスト。

- 本物の secrets.toml は読まない。Streamlit が読む場所（secrets.files）を一時フォルダに向け、
  架空の値だけを書いた secrets.toml を使う
- st.secrets はテストごとに新しい Secrets に差し替える（ほかのテストや本物の設定に影響しない）
- 確かめること:
  1. secrets.toml が無い → False（環境変数は変わらない）
  2. ダミーの secrets.toml がある → True、トップレベルの文字列などが os.environ に入る
  3. secrets.toml の書き方が誤っている → False
  4. 読み取れない（OSError）→ False。ログには例外の種類だけが出て、値やパスは出ない
"""

from __future__ import annotations

import errno
import logging
import os

import pytest
import streamlit
from streamlit import config as st_config
from streamlit.runtime.secrets import Secrets

import lib.secrets_env as secrets_env
from lib.secrets_env import load_secrets_into_env

# テストの secrets.toml に書く環境変数の名前（本物の設定とぶつからないよう、テスト専用の名前も使う）
TEST_ENV_NAMES = (
    "GA_PROPERTY_ID",
    "GA_CREDENTIALS_JSON",
    "ANALYTICS_TEST_SECRET_STR",
    "ANALYTICS_TEST_SECRET_INT",
    "ANALYTICS_TEST_SECRET_BOOL",
    "ANALYTICS_TEST_SECRET_TABLE",
)

# 架空の値（本物ではない）
FAKE_SECRET_VALUE = "fake-secret-value-for-test"
FAKE_JSON_VALUE = '{"type": "service_account", "client_email": "fake@example.invalid"}'


@pytest.fixture
def clean_env(monkeypatch):
    """テストで使う環境変数を消し、テストの後にも必ず消えるようにする。

    Streamlit は os.environ を直接書き換えるため、monkeypatch に「元は無かった」ことを記録させておく
    （一度 setenv してから delenv すると、テストの後に削除される）。

    Args:
        monkeypatch: 依存値を一時差し替えする pytest フィクスチャ。

    Returns:
        なし。"""
    for name in TEST_ENV_NAMES:
        monkeypatch.setenv(name, "placeholder")
        monkeypatch.delenv(name)
    yield


@pytest.fixture
def use_secrets_files(monkeypatch, clean_env):
    """Streamlit が secrets.toml を探す場所を差し替え、新しい Secrets を st.secrets にする。

    Returns:
        探す場所（文字列のリスト）を受け取って設定する関数

    Args:
        monkeypatch: 依存値を一時差し替えする pytest フィクスチャ。
        clean_env: 環境変数の名前と値。"""

    def apply(paths: list[str]) -> Secrets:
        # 1. secrets.files の値だけを差し替える（ほかの設定はそのまま）
        """apply のテスト用処理を行う。

        Args:
            paths: secrets.toml の検索対象パス一覧。

        Returns:
            なし。"""
        original_get_option = st_config.get_option

        def fake_get_option(key: str):
            """fake_get_option のテスト用処理を行う。

            Args:
                key: 検証対象のキー値。

            Returns:
                なし。"""
            if key == "secrets.files":
                return paths
            return original_get_option(key)

        monkeypatch.setattr(st_config, "get_option", fake_get_option)
        # 2. まだ何も読み込んでいない Secrets を使う。ファイルの監視は始めない
        #    （Secrets は属性の書き換えを受け付けないので、クラスの側で差し替える）
        monkeypatch.setattr(Secrets, "_maybe_install_file_watchers", lambda self: None)
        secrets = Secrets()
        monkeypatch.setattr(streamlit, "secrets", secrets)
        return secrets

    return apply


def test_secrets_tomlが無いとFalseを返し環境変数は変わらない(use_secrets_files, tmp_path):
    """secrets tomlが無いとFalseを返し環境変数は変わらないことを確認する。

    Args:
        use_secrets_files: Streamlit の secrets 読み込み先を一時領域へ切り替えるフィクスチャ。
        tmp_path: テスト用の一時ディレクトリ。

    Returns:
        なし。"""
    # 1. secrets tomlが無いとFalseを返し環境変数は変わらないことを確認する。
    use_secrets_files([str(tmp_path / ".streamlit" / "secrets.toml"), str(tmp_path / "missing" / "secrets.toml")])
    before = dict(os.environ)
    assert load_secrets_into_env() is False
    assert dict(os.environ) == before


def test_ダミーのsecrets_tomlがあるとTrueを返しトップレベルの値が環境変数に入る(use_secrets_files, tmp_path):
    # 1. Community Cloud の Secrets 欄と同じ形の TOML を一時フォルダに置く
    """ダミーのsecrets tomlがあるとTrueを返しトップレベルの値が環境変数に入ることを確認する。

    Args:
        use_secrets_files: Streamlit の secrets 読み込み先を一時領域へ切り替えるフィクスチャ。
        tmp_path: テスト用の一時ディレクトリ。

    Returns:
        なし。"""
    path = tmp_path / "secrets.toml"
    path.write_text(
        "\n".join(
            [
                'GA_PROPERTY_ID = "123456789"',
                f"GA_CREDENTIALS_JSON = '''\n{FAKE_JSON_VALUE}\n'''",
                f'ANALYTICS_TEST_SECRET_STR = "{FAKE_SECRET_VALUE}"',
                "ANALYTICS_TEST_SECRET_INT = 42",
                "ANALYTICS_TEST_SECRET_BOOL = true",
                "[ANALYTICS_TEST_SECRET_TABLE]",
                'inner = "nested"',
            ]
        ),
        encoding="utf-8",
    )
    use_secrets_files([str(path)])
    # 2. 読み込めた
    assert load_secrets_into_env() is True
    # 3. トップレベルの文字列・整数は os.environ に入る（os.getenv で読めるようになる）
    assert os.environ["GA_PROPERTY_ID"] == "123456789"
    assert os.environ["GA_CREDENTIALS_JSON"].strip() == FAKE_JSON_VALUE
    assert os.environ["ANALYTICS_TEST_SECRET_STR"] == FAKE_SECRET_VALUE
    assert os.environ["ANALYTICS_TEST_SECRET_INT"] == "42"
    # 4. 真偽値と入れ子のテーブルは入らない（Streamlit 1.66 の仕様）
    assert "ANALYTICS_TEST_SECRET_BOOL" not in os.environ
    assert "ANALYTICS_TEST_SECRET_TABLE" not in os.environ


def test_secrets_tomlの値は同じ名前の環境変数より優先される(use_secrets_files, tmp_path, monkeypatch):
    """secrets tomlの値は同じ名前の環境変数より優先されることを確認する。

    Args:
        use_secrets_files: Streamlit の secrets 読み込み先を一時領域へ切り替えるフィクスチャ。
        tmp_path: テスト用の一時ディレクトリ。
        monkeypatch: 依存値を一時差し替えする pytest フィクスチャ。

    Returns:
        なし。"""
    # 1. secrets tomlの値は同じ名前の環境変数より優先されることを確認する。
    monkeypatch.setenv("ANALYTICS_TEST_SECRET_STR", "value-from-shell")
    path = tmp_path / "secrets.toml"
    path.write_text(f'ANALYTICS_TEST_SECRET_STR = "{FAKE_SECRET_VALUE}"\n', encoding="utf-8")
    use_secrets_files([str(path)])
    assert load_secrets_into_env() is True
    assert os.environ["ANALYTICS_TEST_SECRET_STR"] == FAKE_SECRET_VALUE


def test_2回呼んでもTrueを返し値は変わらない(use_secrets_files, tmp_path):
    """2回呼んでもTrueを返し値は変わらないことを確認する。

    Args:
        use_secrets_files: Streamlit の secrets 読み込み先を一時領域へ切り替えるフィクスチャ。
        tmp_path: テスト用の一時ディレクトリ。

    Returns:
        なし。"""
    # 1. 2回呼んでもTrueを返し値は変わらないことを確認する。
    path = tmp_path / "secrets.toml"
    path.write_text(f'ANALYTICS_TEST_SECRET_STR = "{FAKE_SECRET_VALUE}"\n', encoding="utf-8")
    use_secrets_files([str(path)])
    assert load_secrets_into_env() is True
    assert load_secrets_into_env() is True
    assert os.environ["ANALYTICS_TEST_SECRET_STR"] == FAKE_SECRET_VALUE


def test_secrets_tomlの書き方が誤っているとFalseを返し環境変数は変わらない(use_secrets_files, tmp_path):
    """secrets tomlの書き方が誤っているとFalseを返し環境変数は変わらないことを確認する。

    Args:
        use_secrets_files: Streamlit の secrets 読み込み先を一時領域へ切り替えるフィクスチャ。
        tmp_path: テスト用の一時ディレクトリ。

    Returns:
        なし。"""
    # 1. secrets tomlの書き方が誤っているとFalseを返し環境変数は変わらないことを確認する。
    path = tmp_path / "secrets.toml"
    path.write_text(f'ANALYTICS_TEST_SECRET_STR = "{FAKE_SECRET_VALUE}\nBROKEN = \n', encoding="utf-8")
    use_secrets_files([str(path)])
    assert load_secrets_into_env() is False
    assert "ANALYTICS_TEST_SECRET_STR" not in os.environ


class _UnreadableSecrets:
    """len() を呼ぶと OSError（権限が無いなど）を出す st.secrets の代わり。

    Attributes:
        error: len() で出す例外（メッセージに架空の秘密の値とパスを入れておく）
    """

    def __init__(self, error: OSError) -> None:
        """__init__ で必要なテスト状態を初期化する。

        Args:
            error: テスト対象に渡す例外。

        Returns:
            なし。"""
        self.error = error

    def __len__(self) -> int:
        """テスト用オブジェクトの要素数を返す。

        Returns:
            なし。"""
        raise self.error


@pytest.mark.parametrize(
    ("error_type", "error_no"),
    # errno によって OSError は PermissionError などに自動で変わるため、種類に合った番号を使う
    [(PermissionError, errno.EACCES), (OSError, errno.EIO)],
)
def test_secrets_tomlを読み取れないとFalseを返しログには例外の種類だけが出る(monkeypatch, caplog, error_type, error_no):
    # 1. 例外のメッセージに秘密の値と場所を入れておき、ログに出ないことを確かめる
    """secrets tomlを読み取れないとFalseを返しログには例外の種類だけが出ることを確認する。

    Args:
        monkeypatch: 依存値を一時差し替えする pytest フィクスチャ。
        caplog: ログを取得する pytest フィクスチャ。
        error_type: 発生させる例外クラス。
        error_no: 検証するエラーコード。

    Returns:
        なし。"""
    error = error_type(error_no, f"Permission denied: /fake/secret/path {FAKE_SECRET_VALUE}")
    monkeypatch.setattr(streamlit, "secrets", _UnreadableSecrets(error))
    with caplog.at_level(logging.ERROR, logger=secrets_env.logger.name):
        assert load_secrets_into_env() is False
    # 2. エラーのログは1件で、例外の種類だけが入っている
    records = [r for r in caplog.records if r.name == secrets_env.logger.name]
    assert len(records) == 1
    assert records[0].levelno == logging.ERROR
    # 変数の内容: message: 例外または応答から得たメッセージ。
    message = records[0].getMessage()
    assert message == f"Secrets を読み込めませんでした: {error_type.__name__}"
    # 3. 値・パス・例外のメッセージは出ず、スタックトレースも付けない
    assert FAKE_SECRET_VALUE not in caplog.text
    assert "/fake/secret/path" not in caplog.text
    assert records[0].exc_info is None


def test_OSError以外の予期しない例外は握りつぶさない(monkeypatch):
    # 想定外の不具合を隠さないよう、OSError と StreamlitSecretNotFoundError 以外はそのまま上に伝わる
    """OSError以外の予期しない例外は握りつぶさないことを確認する。

    Args:
        monkeypatch: 依存値を一時差し替えする pytest フィクスチャ。

    Returns:
        なし。"""
    # 1. OSError以外の予期しない例外は握りつぶさないことを確認する。
    class _Broken:
        """例外時のテスト用応答を扱うクラス。"""
        def __len__(self) -> int:
            """テスト用オブジェクトの要素数を返す。

            Returns:
                なし。"""
            raise RuntimeError("想定外")

    monkeypatch.setattr(streamlit, "secrets", _Broken())
    with pytest.raises(RuntimeError):
        load_secrets_into_env()
