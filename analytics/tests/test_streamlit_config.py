"""Streamlit Community Cloud 向けの設定（.streamlit/config.toml と app.py の先頭）を確かめるテスト。

- 確かめること:
  1. リポジトリ直下の .streamlit/config.toml（Community Cloud が読む）に showErrorDetails = "none" があり、
     [server] が無く、[theme]・[client]・[browser] が analytics/.streamlit/config.toml（ローカル用）と一致する
  2. app.py が st.set_option で client.showErrorDetails を "none" にしている（AppTest で実際に動かして確かめる）
  3. app.py で set_option がほかの import より前、load_secrets_into_env() が require_login() より前にある
- 本番には接続しない（conftest.py の fake_env の架空の値と、requests のモックだけを使う）
"""

from __future__ import annotations

import ast
import tomllib
from pathlib import Path

import pytest
import streamlit as st
from streamlit.testing.v1 import AppTest

# analytics フォルダとリポジトリ直下
ANALYTICS_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = ANALYTICS_DIR.parent

# Community Cloud が読む設定（リポジトリ直下）とローカル用の設定
CLOUD_CONFIG = REPO_ROOT / ".streamlit" / "config.toml"
LOCAL_CONFIG = ANALYTICS_DIR / ".streamlit" / "config.toml"

# 確かめる app.py の場所
APP_PATH = ANALYTICS_DIR / "app.py"


def _load(path: Path) -> dict:
    """TOML を読む（Streamlit と同じく tomllib で）。

    Args:
        path: 設定ファイルの場所

    Returns:
        設定の辞書
    """
    return tomllib.loads(path.read_text(encoding="utf-8"))


# ---------------------------------------------------------------- 1. config.toml


def test_リポジトリ直下のconfig_tomlでエラーの詳細を画面に出さない設定になっている():
    """リポジトリ直下のconfig tomlでエラーの詳細を画面に出さない設定になっていることを確認する。

    Returns:
        なし。"""
    cfg = _load(CLOUD_CONFIG)
    assert cfg["client"]["showErrorDetails"] == "none"


def test_リポジトリ直下のconfig_tomlにserverの設定が無い():
    # アドレス・ポートは Community Cloud が決めるため書かない（XSRF・CORS を無効にする設定も入れない）
    """リポジトリ直下のconfig tomlにserverの設定が無いことを確認する。

    Returns:
        なし。"""
    cfg = _load(CLOUD_CONFIG)
    assert "server" not in cfg
    text = CLOUD_CONFIG.read_text(encoding="utf-8")
    assert "enableXsrfProtection = false" not in text
    assert "enableCORS = false" not in text


def test_リポジトリ直下のconfig_tomlは利用状況を送らない():
    """リポジトリ直下のconfig tomlは利用状況を送らないことを確認する。

    Returns:
        なし。"""
    assert _load(CLOUD_CONFIG)["browser"]["gatherUsageStats"] is False


@pytest.mark.parametrize("section", ["theme", "client", "browser"])
def test_リポジトリ直下とローカル用のconfig_tomlで同じ項目の設定が一致する(section):
    # 片方だけ変えて、公開時とローカルで見た目や挙動が食い違うのを防ぐ
    """リポジトリ直下とローカル用のconfig tomlで同じ項目の設定が一致することを確認する。

    Args:
        section: 検証対象の件数または数値。

    Returns:
        なし。"""
    assert _load(CLOUD_CONFIG)[section] == _load(LOCAL_CONFIG)[section]


def test_ローカル用のconfig_tomlもエラーの詳細を出さずserverはlocalhostだけで待ち受ける():
    """ローカル用のconfig tomlもエラーの詳細を出さずserverはlocalhostだけで待ち受けることを確認する。

    Returns:
        なし。"""
    cfg = _load(LOCAL_CONFIG)
    assert cfg["client"]["showErrorDetails"] == "none"
    assert cfg["server"]["address"] == "localhost"
    assert cfg["server"].get("enableXsrfProtection", True) is True
    assert cfg["server"].get("enableCORS", True) is True


def test_リポジトリ直下のconfig_tomlの項目はStreamlitが知っている設定名だけ():
    # 書き間違えた設定名は Streamlit に黙って無視されるため、実在する設定名か確かめる
    """リポジトリ直下のconfig tomlの項目はStreamlitが知っている設定名だけことを確認する。

    Returns:
        なし。"""
    from streamlit import config as st_config

    for section, values in _load(CLOUD_CONFIG).items():
        for key in values:
            assert f"{section}.{key}" in st_config._config_options_template  # noqa: SLF001


# ---------------------------------------------------------------- 2. app.py の set_option


def test_app_pyを動かすとshowErrorDetailsがnoneになる(fake_env):
    # 1. 先に別の値にしておき、app.py が "none" に戻すことを確かめる
    """app pyを動かすとshowErrorDetailsがnoneになることを確認する。

    Args:
        fake_env: 架空の Supabase 接続情報を設定する pytest フィクスチャ。

    Returns:
        なし。"""
    original = st.get_option("client.showErrorDetails")
    st.set_option("client.showErrorDetails", "full")
    try:
        # 2. 未ログインで1回描画する（ログインフォームで止まるので通信は起きない）
        at = AppTest.from_file(str(APP_PATH), default_timeout=30).run()
        assert not at.exception
        assert st.get_option("client.showErrorDetails") == "none"
    finally:
        st.set_option("client.showErrorDetails", original)


# ---------------------------------------------------------------- 3. app.py の並び順


def _app_tree() -> ast.Module:
    """app.py を構文木にする。

    Returns:
        ast.Module を返す。"""
    return ast.parse(APP_PATH.read_text(encoding="utf-8"))


def _call_name(node: ast.AST) -> str | None:
    """文が関数呼び出しなら、その名前（例: "st.set_option"・"require_login"）を返す。

    Args:
        node: トップレベルの文

    Returns:
        呼び出しの名前。呼び出しでなければ None
    """
    value = node.value if isinstance(node, (ast.Expr, ast.Assign)) else None
    if not isinstance(value, ast.Call):
        return None
    return ast.unparse(value.func)


def test_app_pyでset_optionがlibとviewsのimportより前にある():
    """app pyでset optionがlibとviewsのimportより前にあることを確認する。

    Returns:
        なし。"""
    body = _app_tree().body
    names = [_call_name(n) for n in body]
    set_option_at = names.index("st.set_option")
    # 1. 呼び出しの引数が client.showErrorDetails と "none"
    call = body[set_option_at].value
    assert [ast.literal_eval(a) for a in call.args] == ["client.showErrorDetails", "none"]
    # 2. lib・views の import はすべて set_option より後
    for i, node in enumerate(body):
        if isinstance(node, ast.ImportFrom) and (node.module or "").split(".")[0] in ("lib", "views"):
            assert i > set_option_at


def test_app_pyでload_secrets_into_envがrequire_loginより前に呼ばれる():
    """app pyでload secrets into envがrequire loginより前に呼ばれることを確認する。

    Returns:
        なし。"""
    names = [_call_name(n) for n in _app_tree().body]
    assert "load_secrets_into_env" in names
    assert names.index("load_secrets_into_env") < names.index("require_login")
