"""analytics のテスト共通の準備。本番（Supabase・GA4）には一切接続しない。

1. lib.data は import 時にリポジトリ直下の .env を読み込むため、lib を import する前に
   dotenv.load_dotenv を何もしない関数に差し替え、本物の接続情報が環境変数に入らないようにする
2. 接続に関わる環境変数はテストごとに消し、必要なテストだけが架空の値を入れる
3. requests.get / requests.post は既定で「呼ばれたら失敗」にしておき、モックし忘れても外へ出ないようにする
"""

from __future__ import annotations

import sys
from pathlib import Path

import dotenv
import pytest
import requests

# 1. analytics フォルダを import の起点にする（app.py と同じく `lib.xxx` で import できるように）
ANALYTICS_DIR = Path(__file__).resolve().parents[1]
if str(ANALYTICS_DIR) not in sys.path:
    sys.path.insert(0, str(ANALYTICS_DIR))

# 2. lib.data が import 時に .env を読まないようにする（lib を import する前に差し替える必要がある）
dotenv.load_dotenv = lambda *args, **kwargs: False  # type: ignore[assignment]

# テストで使う架空の接続情報（本物の値ではない）
FAKE_URL = "https://fake-project.example.invalid"
FAKE_ANON_KEY = "fake-anon-key-for-test"
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


def _blocked(*args, **kwargs):
    """モックし忘れた通信を止める（本番への接続を防ぐ安全装置）。"""
    raise AssertionError(f"テスト中に外部通信が呼ばれました: {args[:1]}")


@pytest.fixture(autouse=True)
def isolate_env(monkeypatch):
    """各テストの前に接続情報の環境変数を消し、外部通信を止める。

    Args:
        monkeypatch: pytest の monkeypatch
    """
    # 1. 接続情報を消す（シェルや .env から入っていても使わせない）
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
    """
    monkeypatch.setenv("NEXT_PUBLIC_SUPABASE_URL", FAKE_URL)
    monkeypatch.setenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", FAKE_ANON_KEY)
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", FAKE_SERVICE_KEY)
    yield
