"""テスト中に手元の本物の secrets.toml が読まれないこと（conftest.py の isolate_secrets）を確かめるテスト。

本物のファイルの中身は読まない・表示しない。確かめるのは「読もうとしない」「読もうとしたら止まる」ことだけ。
"""

from __future__ import annotations

from pathlib import Path

import pytest
import streamlit
from streamlit import config as st_config
from streamlit.runtime.secrets import Secrets
from streamlit.testing.v1 import AppTest

from conftest import REAL_SECRETS_FILES, is_real_secrets_path
from lib.secrets_env import load_secrets_into_env

# 確かめる app.py の場所（このファイルから見て1つ上）
APP_PATH = str(Path(__file__).resolve().parents[1] / "app.py")


def test_secretsを探す場所は空の一時フォルダだけで本物の場所を含まない():
    """secretsを探す場所は空の一時フォルダだけで本物の場所を含まないことを確認する。

    Returns:
        なし。"""
    files = st_config.get_option("secrets.files")
    # 1. 探す場所は1つだけで、本物の場所ではない
    assert len(files) == 1
    assert not is_real_secrets_path(files[0])
    # 2. その場所にファイルは置かれていない
    assert not Path(files[0]).exists()


def test_本物のsecrets_tomlの場所はanalyticsとリポジトリ直下とホームの3か所():
    """本物のsecrets tomlの場所はanalyticsとリポジトリ直下とホームの3か所ことを確認する。

    Returns:
        なし。"""
    # 1. 本物のsecrets tomlの場所はanalyticsとリポジトリ直下とホームの3か所ことを確認する。
    analytics = Path(__file__).resolve().parents[1]
    assert set(REAL_SECRETS_FILES) == {
        (analytics / ".streamlit" / "secrets.toml").resolve(),
        (analytics.parent / ".streamlit" / "secrets.toml").resolve(),
        (Path.home() / ".streamlit" / "secrets.toml").resolve(),
    }


@pytest.mark.parametrize("index", [0, 1, 2], ids=["analytics", "repo-root", "home"])
def test_本物のsecrets_tomlを読もうとすると仕掛けが止めて記録する(isolate_secrets, index):
    """本物のsecrets tomlを読もうとすると仕掛けが止めて記録することを確認する。

    Args:
        isolate_secrets: 本物の secrets.toml を隔離する pytest フィクスチャ。
        index: 対象データ内の行番号。

    Returns:
        なし。"""
    real = str(REAL_SECRETS_FILES[index])
    # 1. 読もうとすると例外になり、中身は返らない
    with pytest.raises(AssertionError, match="本物の secrets.toml"):
        Secrets()._parse_file_path(real)  # noqa: SLF001
    # 2. 読もうとした場所が記録される（記録があるとテストの最後に失敗するので、確かめたら消す）
    assert isolate_secrets == [real]
    isolate_secrets.clear()


def test_本物のsecrets_tomlのフォルダを読もうとしても止める(isolate_secrets):
    """本物のsecrets tomlのフォルダを読もうとしても止めることを確認する。

    Args:
        isolate_secrets: 本物の secrets.toml を隔離する pytest フィクスチャ。

    Returns:
        なし。"""
    # 1. 本物のsecrets tomlのフォルダを読もうとしても止めることを確認する。
    folder = str(REAL_SECRETS_FILES[0].parent)
    with pytest.raises(AssertionError):
        Secrets()._parse_file_path(folder)  # noqa: SLF001
    assert isolate_secrets == [folder]
    isolate_secrets.clear()


def test_load_secrets_into_envはsecrets_tomlが無い扱いになりFalseを返す(isolate_secrets):
    """load secrets into envはsecrets tomlが無い扱いになりFalseを返すことを確認する。

    Args:
        isolate_secrets: 本物の secrets.toml を隔離する pytest フィクスチャ。

    Returns:
        なし。"""
    # 1. load secrets into envはsecrets tomlが無い扱いになりFalseを返すことを確認する。
    assert load_secrets_into_env() is False
    assert isolate_secrets == []


def test_app_pyをAppTestで描いても本物のsecrets_tomlを読まない(isolate_secrets):
    # 1. at.secrets を渡さずに描く（app.py は最初に st.secrets を読み込む）
    """app pyをAppTestで描いても本物のsecrets tomlを読まないことを確認する。

    Args:
        isolate_secrets: 本物の secrets.toml を隔離する pytest フィクスチャ。

    Returns:
        なし。"""
    # 変数の内容: at: 画面上で対象要素を探すロケーター。
    at = AppTest.from_file(APP_PATH, default_timeout=30).run()
    assert not at.exception
    # 2. 本物の場所は読もうともしていない
    assert isolate_secrets == []
    # 3. st.secrets は空のまま（読み込んだ値が無い）
    assert dict(streamlit.secrets._secrets or {}) == {}  # noqa: SLF001


def test_テストごとにst_secretsは新しく作り直される():
    # 前のテストで読んだ値を持ち越さないよう、まだ何も読み込んでいない Secrets になっている
    """テストごとにst secretsは新しく作り直されることを確認する。

    Returns:
        なし。"""
    # 1. テストごとにst secretsは新しく作り直されることを確認する。
    assert streamlit.secrets._secrets is None  # noqa: SLF001
