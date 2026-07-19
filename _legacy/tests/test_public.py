"""
tests/test_public.py
=====================
公開ページの表示テスト。
モックデータを使ってページが正しく描画されることを確認する。
"""

import pytest
from playwright.sync_api import Page, expect


# ------------------------------------------------------------------ #
# ホームページ
# ------------------------------------------------------------------ #

def test_home_loads(page: Page, base_url: str):
    page.goto(base_url + "/")
    expect(page.locator("header")).to_be_visible()
    expect(page.locator("footer")).to_be_visible()


def test_home_has_nav_links(page: Page, base_url: str):
    page.goto(base_url + "/")
    nav = page.locator("header nav")
    expect(nav).to_be_visible()
    # 主要ナビリンクが存在する
    expect(nav.get_by_role("link", name="EVENT")).to_be_visible()


def test_home_next_event_section(page: Page, base_url: str):
    """モックデータに開催予定イベントがあるので NEXT EVENT エリアが表示される。"""
    page.goto(base_url + "/")
    # イベントカードかイベント名が存在することを確認
    expect(page.locator(".event-card").first).to_be_visible()


# ------------------------------------------------------------------ #
# イベント一覧
# ------------------------------------------------------------------ #

def test_events_page_loads(page: Page, base_url: str):
    page.goto(base_url + "/events")
    expect(page.locator("main")).to_be_visible()


def test_events_page_shows_upcoming_events(page: Page, base_url: str):
    """モックの開催予定イベント名がページに表示される。"""
    page.goto(base_url + "/events")
    expect(page.get_by_text("テスト フラワーマーケット 2026")).to_be_visible()
    expect(page.get_by_text("Habitat Style Workshop テスト")).to_be_visible()


def test_events_page_shows_ws_reservation_button(page: Page, base_url: str):
    """WSフラグ=TRUE かつ予約フラグ=TRUE のイベントに予約ボタンが表示される。"""
    page.goto(base_url + "/events")
    expect(page.locator(".ws-link")).to_be_visible()


def test_events_page_shows_no_reserve_message(page: Page, base_url: str):
    """予約フラグ=FALSE のイベントに「予約不要」メッセージが表示される。"""
    page.goto(base_url + "/events")
    expect(page.locator(".ws-no-reserve")).to_be_visible()


def test_events_past_tab_loads(page: Page, base_url: str):
    page.goto(base_url + "/events?page=past")
    expect(page.locator("main")).to_be_visible()
    expect(page.get_by_text("テスト 過去イベント 2026春")).to_be_visible()


def test_events_schedule_rows_multi_day(page: Page, base_url: str):
    """複数日イベントは日付ごとに時間が展開表示される。"""
    page.goto(base_url + "/events")
    # Row 2 のイベントは "10:00-17:00,10:00-16:00" → 2行になる
    rows = page.locator(".event-card").first.locator(".info-row")
    # 日付行が2行以上あることを確認（日付+時間 x 2日分）
    assert rows.count() >= 2


# ------------------------------------------------------------------ #
# ブランドページ
# ------------------------------------------------------------------ #

def test_ei8htplants_page_loads(page: Page, base_url: str):
    page.goto(base_url + "/ei8htplants")
    expect(page.locator("main")).to_be_visible()
    expect(page.locator(".brand-subnav")).to_be_visible()


def test_habitatoides_page_loads(page: Page, base_url: str):
    page.goto(base_url + "/habitatoides")
    expect(page.locator("main")).to_be_visible()
    expect(page.locator(".brand-subnav")).to_be_visible()


def test_hue_page_loads(page: Page, base_url: str):
    page.goto(base_url + "/hue")
    expect(page.locator("main")).to_be_visible()
    expect(page.locator(".brand-subnav")).to_be_visible()


# ------------------------------------------------------------------ #
# その他の公開ページ
# ------------------------------------------------------------------ #

def test_concept_page_loads(page: Page, base_url: str):
    page.goto(base_url + "/concept")
    expect(page.locator("main")).to_be_visible()


def test_gallery_page_loads(page: Page, base_url: str):
    page.goto(base_url + "/gallery")
    expect(page.locator("main")).to_be_visible()


def test_contact_page_loads(page: Page, base_url: str):
    page.goto(base_url + "/contact")
    expect(page.locator("main")).to_be_visible()


# ------------------------------------------------------------------ #
# リダイレクト
# ------------------------------------------------------------------ #

def test_reserve_without_row_redirects_to_events(page: Page, base_url: str):
    """/reserve に row パラメータなしでアクセスするとイベント一覧へリダイレクトされる。"""
    page.goto(base_url + "/reserve")
    expect(page).to_have_url(f"{base_url}/events")


def test_reserve_non_ws_event_redirects(page: Page, base_url: str):
    """WSフラグ=FALSE のイベント行（Row 2）に /reserve でアクセスするとリダイレクトされる。"""
    page.goto(base_url + "/reserve?row=2")
    expect(page).to_have_url(f"{base_url}/events")
