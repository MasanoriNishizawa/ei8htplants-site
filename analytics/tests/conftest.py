"""analytics のテスト共通の準備。本番（Supabase・GA4）には一切接続しない。

1. lib.data は import 時にリポジトリ直下の .env を読み込むため、lib を import する前に
   dotenv.load_dotenv を何もしない関数に差し替え、本物の接続情報が環境変数に入らないようにする
2. 接続に関わる環境変数はテストごとに消し、必要なテストだけが架空の値を入れる
3. requests.get / requests.post は既定で「呼ばれたら失敗」にしておき、モックし忘れても外へ出ないようにする
4. Streamlit が secrets.toml を探す場所を空の一時フォルダに向け、手元の本物の secrets.toml
   （analytics/.streamlit・リポジトリ直下の .streamlit・~/.streamlit）を読まないようにする。
   万一読もうとしたらテストを失敗させる（本物の接続情報が環境変数に入るのを防ぐ）
"""

from __future__ import annotations

import sys
from pathlib import Path

import dotenv
import pytest
import requests
import streamlit
from streamlit import config as st_config
from streamlit.runtime.secrets import Secrets

# 1. analytics フォルダを import の起点にする（app.py と同じく `lib.xxx` で import できるように）
ANALYTICS_DIR = Path(__file__).resolve().parents[1]
if str(ANALYTICS_DIR) not in sys.path:
    sys.path.insert(0, str(ANALYTICS_DIR))

# 2. lib.data が import 時に .env を読まないようにする（lib を import する前に差し替える必要がある）
dotenv.load_dotenv = lambda *args, **kwargs: False  # type: ignore[assignment]

# テストで使う架空の接続情報（本物の値ではない）
FAKE_URL = "https://fake-project.example.invalid"
# 認証テストで使う架空の Supabase anon キー
FAKE_ANON_KEY = "fake-anon-key-for-test"
# 誤って認証に使わないことを検証するための架空 service_role キー
FAKE_SERVICE_KEY = "fake-service-role-key-for-test"

# 接続に関わる環境変数の名前（テストの前に必ず消す）
ENV_NAMES = (
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "ANALYTICS_ALLOWED_EMAILS",
    "GA_PROPERTY_ID",
    "GA_CREDENTIALS",
    "GA_CREDENTIALS_JSON",
)


# 本物の secrets.toml が置かれうる場所（テストでは絶対に読まない）。
# Streamlit の既定の探す場所（~/.streamlit と、起動したフォルダの .streamlit）に合わせ、
# analytics から起動した場合とリポジトリ直下から起動した場合の両方を含める
REAL_SECRETS_FILES = tuple(
    p.resolve()
    for p in (
        ANALYTICS_DIR / ".streamlit" / "secrets.toml",
        ANALYTICS_DIR.parent / ".streamlit" / "secrets.toml",
        Path.home() / ".streamlit" / "secrets.toml",
    )
)


def is_real_secrets_path(path: str) -> bool:
    """本物の secrets.toml の場所（またはそれを含むフォルダ）かどうか。

    Args:
        path: Streamlit が読もうとしている場所

    Returns:
        REAL_SECRETS_FILES のどれか、またはその親フォルダなら True
    """
    # 変数の内容: p: 展開・正規化した secrets.toml のパス。
    p = Path(path).expanduser().resolve()
    return any(p == real or p == real.parent for real in REAL_SECRETS_FILES)


def _blocked(*args, **kwargs):
    """モックし忘れた通信を止める（本番への接続を防ぐ安全装置）。

    Args:
        *args: 通信関数に渡された URL などの位置引数。
        **kwargs: 通信関数に渡されたリクエストオプション。

    Returns:
        なし。
    """
    raise AssertionError(f"テスト中に外部通信が呼ばれました: {args[:1]}")


@pytest.fixture(autouse=True)
def isolate_env(monkeypatch):
    """各テストの前に接続情報の環境変数を消し、外部通信を止める。

    Args:
        monkeypatch: pytest の monkeypatch

    Returns:
        なし。"""
    # 1. 接続情報を消す（シェルや .env から入っていても使わせない）
    # name: 初期化時に削除する接続情報環境変数の名前。
    for name in ENV_NAMES:
        monkeypatch.delenv(name, raising=False)
    # 2. 通信は既定で失敗させる。必要なテストだけがモックで上書きする
    monkeypatch.setattr(requests, "get", _blocked)
    monkeypatch.setattr(requests, "post", _blocked)
    yield


@pytest.fixture
def fake_env(monkeypatch):
    """架空の接続情報を環境変数に入れる。

    Args:
        monkeypatch: pytest の monkeypatch

    Returns:
        なし。"""
    monkeypatch.setenv("NEXT_PUBLIC_SUPABASE_URL", FAKE_URL)
    monkeypatch.setenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", FAKE_ANON_KEY)
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", FAKE_SERVICE_KEY)
    yield


@pytest.fixture(autouse=True)
def isolate_secrets(monkeypatch, tmp_path_factory):
    """各テストで、Streamlit が本物の secrets.toml を読まないようにする。

    1. secrets.files（探す場所）を、何も置いていない一時フォルダの secrets.toml だけにする
    2. st.secrets をまだ何も読み込んでいない新しい Secrets にする（前のテストで読んだ値を持ち越さない）
    3. 本物の secrets.toml を読もうとしたら記録して例外にし、テストの最後に失敗させる
       （AppTest の中で起きた例外は画面のエラーになるだけなので、記録を見て確実に落とす）

    test_secrets_env.py のように、テストの中で探す場所を一時フォルダの secrets.toml に向け直すテストは
    そのまま動く（そのテストの差し替えがこの fixture より内側で効く）。

    Args:
        monkeypatch: pytest の monkeypatch
        tmp_path_factory: 一時フォルダを作る pytest の fixture

    Yields:
        本物の secrets.toml を読もうとした場所のリスト（空のはず）

    Returns:
        なし。"""
    # 1. 探す場所を空の一時フォルダに向ける（ほかの設定はそのまま）
    # empty: secrets.tomlが存在しない状態を作るための一時ファイルパス。
    empty = tmp_path_factory.mktemp("no_secrets") / ".streamlit" / "secrets.toml"
    # 変数の内容: original_get_option: テスト後に復元する Streamlit 設定取得関数。
    original_get_option = st_config.get_option

    def get_option(key: str):
        """get_option のテスト用処理を行う。

        Args:
            key: 検証対象のキー値。

        Returns:
            なし。"""
        if key == "secrets.files":
            return [str(empty)]
        return original_get_option(key)

    monkeypatch.setattr(st_config, "get_option", get_option)

    # 2. 本物の場所を読もうとしたら記録して止める
    # attempts: テスト中に本物のSecretsパスを読もうとした記録。
    attempts: list[str] = []
    # 変数の内容: original_parse_file_path: テスト後に復元する Secrets のパス解決関数。
    original_parse_file_path = Secrets._parse_file_path

    def guarded_parse_file_path(self, path: str):
        """guarded_parse_file_path のテスト用処理を行う。

        Args:
            path: 検証対象のファイルパス。

        Returns:
            なし。"""
        if is_real_secrets_path(path):
            attempts.append(path)
            raise AssertionError("テスト中に本物の secrets.toml を読もうとしました")
        return original_parse_file_path(self, path)

    monkeypatch.setattr(Secrets, "_parse_file_path", guarded_parse_file_path)

    # 3. 何も読み込んでいない Secrets を使う。ファイルの監視は始めない
    monkeypatch.setattr(Secrets, "_maybe_install_file_watchers", lambda self: None)
    monkeypatch.setattr(streamlit, "secrets", Secrets())
    yield attempts
    assert not attempts, f"テスト中に本物の secrets.toml を読もうとしました: {attempts}"
