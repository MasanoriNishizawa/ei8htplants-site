"""
tests/conftest.py
=================
セッション共通フィクスチャ。

起動フロー:
  1. Google Sheets / Drive API をモックに差し替える
  2. FastAPI テストサーバーを localhost:8765 で起動する
  3. 管理者セッションを一度だけ作成してストレージに保存する（admin_page フィクスチャが再利用）

モックの差し替え先:
  - app.sheets.get_gc        … sheets.py 内の全 Sheets 呼び出し
  - app.routes.public.get_gc … public.py が直接使う Specimen / PROJECTS 呼び出し
  - app.drive.get_drive      … Drive API 呼び出し
"""

import os
import re
import threading
import time
from unittest.mock import MagicMock, patch

# テスト用パスワードを設定（app インポート前に行うこと）
os.environ.setdefault("ADMIN_PASS", "test-pw-ei8ht")
os.environ.setdefault("ADMIN_USER", "admin")

import httpx
import pytest
import uvicorn

from tests.fixtures.mock_data import (
    EVENTS_ALL_VALUES,
    EVENTS_HEADERS,
    PROJECTS_RECORDS,
    SPECIMEN_RECORDS,
    WS_RESERVATIONS_ALL_VALUES,
    WS_HEADERS,
)

PORT = 8765
BASE_URL = f"http://127.0.0.1:{PORT}"
ADMIN_USER = os.environ.get("ADMIN_USER", "admin")
ADMIN_PASS = os.environ.get("ADMIN_PASS", "test-pw-ei8ht")


# ------------------------------------------------------------------ #
# モック生成
# ------------------------------------------------------------------ #

def _make_mock_gc() -> MagicMock:
    """テストデータを返す gspread クライアントのモックを返す。"""
    mock_gc = MagicMock()
    mock_spreadsheet = MagicMock()
    mock_gc.return_value = mock_gc          # get_gc() → mock_gc
    mock_gc.open_by_key.return_value = mock_spreadsheet

    # ---- イベントシート（index=0） ----
    events_ws = MagicMock()
    events_ws.get_all_values.return_value = EVENTS_ALL_VALUES
    events_ws.row_values.side_effect = (
        lambda n: EVENTS_ALL_VALUES[n - 1] if 1 <= n <= len(EVENTS_ALL_VALUES) else []
    )
    events_ws.col_count = 20
    events_ws.row_count = 100
    mock_spreadsheet.get_worksheet.return_value = events_ws

    # ---- WS予約シート ----
    ws_ws = MagicMock()
    ws_ws.get_all_values.return_value = WS_RESERVATIONS_ALL_VALUES
    ws_ws.get_all_records.return_value = []
    ws_ws.row_values.return_value = WS_HEADERS
    ws_ws.col_count = 20
    ws_ws.row_count = 100

    # ---- Specimen シート ----
    specimen_ws = MagicMock()
    specimen_ws.get_all_records.return_value = SPECIMEN_RECORDS

    # ---- PROJECTS シート ----
    projects_ws = MagicMock()
    projects_ws.get_all_records.return_value = PROJECTS_RECORDS

    # ---- お問い合わせシート ----
    contact_ws = MagicMock()
    contact_ws.get_all_records.return_value = []

    def _worksheet(name: str) -> MagicMock:
        mapping = {
            "WS予約": ws_ws,
            "Specimen": specimen_ws,
            "PROJECTS": projects_ws,
            "お問い合わせ": contact_ws,
        }
        if name in mapping:
            return mapping[name]
        raise Exception(f"Worksheet '{name}' not found (mock)")

    mock_spreadsheet.worksheet.side_effect = _worksheet
    return mock_gc


def _make_mock_drive() -> MagicMock:
    """3枚のテスト画像 ID を返す Drive API クライアントのモックを返す。"""
    mock_drive = MagicMock()
    mock_drive.files.return_value.list.return_value.execute.return_value = {
        "files": [
            {"id": "mock_img_id_1"},
            {"id": "mock_img_id_2"},
            {"id": "mock_img_id_3"},
        ]
    }
    return mock_drive


# ------------------------------------------------------------------ #
# セッション共通フィクスチャ
# ------------------------------------------------------------------ #

@pytest.fixture(scope="session")
def base_url():
    """モックを差し替えてテストサーバーを起動し、base URL を返す。"""
    mock_gc = _make_mock_gc()
    mock_drive = _make_mock_drive()

    patchers = [
        patch("app.sheets.get_gc", return_value=mock_gc),
        patch("app.routes.public.get_gc", return_value=mock_gc),
        patch("app.drive.get_drive", return_value=mock_drive),
    ]
    for p in patchers:
        p.start()

    # キャッシュをクリアしてモックデータが必ず反映されるようにする
    from app.cache import cache
    cache.clear_prefix("")

    from main import app as fastapi_app

    config = uvicorn.Config(fastapi_app, host="127.0.0.1", port=PORT, log_level="error")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()

    # サーバー起動を待機（最大 10 秒）
    for _ in range(100):
        try:
            httpx.get(f"{BASE_URL}/", timeout=1)
            break
        except Exception:
            time.sleep(0.1)
    else:
        raise RuntimeError("テストサーバーの起動に失敗しました")

    yield BASE_URL

    server.should_exit = True
    for p in patchers:
        p.stop()


@pytest.fixture(scope="session")
def admin_storage_state(browser, base_url, tmp_path_factory):
    """管理者ログインを一度だけ行い、セッション状態をファイルに保存する。"""
    ctx = browser.new_context(base_url=base_url)
    page = ctx.new_page()
    page.goto("/admin/login")
    page.fill('input[name="username"]', ADMIN_USER)
    page.fill('input[name="password"]', ADMIN_PASS)
    page.click('button[type="submit"]')
    page.wait_for_url(re.compile(r"/admin/events"), timeout=10_000)

    storage_path = str(tmp_path_factory.mktemp("auth") / "admin.json")
    ctx.storage_state(path=storage_path)
    ctx.close()
    return storage_path


@pytest.fixture
def admin_page(browser, base_url, admin_storage_state):
    """認証済みの管理者ページ（テストごとに新しいページ）。"""
    ctx = browser.new_context(base_url=base_url, storage_state=admin_storage_state)
    page = ctx.new_page()
    yield page
    ctx.close()
