"""
tests/test_admin.py
====================
管理画面のテスト。
認証フロー・イベント一覧タブ・WS予約タブ・フォームの動作を確認する。
"""

import os
import re

import pytest
from playwright.sync_api import Page, expect

ADMIN_USER = os.environ.get("ADMIN_USER", "admin")
ADMIN_PASS = os.environ.get("ADMIN_PASS", "test-pw-ei8ht")


# ------------------------------------------------------------------ #
# 認証
# ------------------------------------------------------------------ #

def test_admin_unauthenticated_redirects_to_login(page: Page, base_url: str):
    """未認証で /admin/events にアクセスするとログインページへリダイレクトされる。"""
    page.goto(base_url + "/admin/events")
    expect(page).to_have_url(re.compile(r"/admin/login"))


def test_admin_login_page_has_form(page: Page, base_url: str):
    page.goto(base_url + "/admin/login")
    expect(page.locator('input[name="username"]')).to_be_visible()
    expect(page.locator('input[name="password"]')).to_be_visible()
    expect(page.locator('button[type="submit"]')).to_be_visible()


def test_admin_login_wrong_credentials_shows_error(page: Page, base_url: str):
    page.goto(base_url + "/admin/login")
    page.fill('input[name="username"]', "wrong")
    page.fill('input[name="password"]', "wrong")
    page.click('button[type="submit"]')
    expect(page.get_by_text("IDまたはパスワードが違います")).to_be_visible()


def test_admin_login_success_redirects_to_events(page: Page, base_url: str):
    page.goto(base_url + "/admin/login")
    page.fill('input[name="username"]', ADMIN_USER)
    page.fill('input[name="password"]', ADMIN_PASS)
    page.click('button[type="submit"]')
    expect(page).to_have_url(re.compile(r"/admin/events"), timeout=10_000)


def test_admin_logout_clears_session(page: Page, base_url: str):
    # ログイン
    page.goto(base_url + "/admin/login")
    page.fill('input[name="username"]', ADMIN_USER)
    page.fill('input[name="password"]', ADMIN_PASS)
    page.click('button[type="submit"]')
    page.wait_for_url(re.compile(r"/admin/events"), timeout=10_000)
    # ログアウト
    page.goto(base_url + "/admin/logout")
    expect(page).to_have_url(re.compile(r"/admin/login"))
    # ログアウト後は /admin/events にアクセスできない
    page.goto(base_url + "/admin/events")
    expect(page).to_have_url(re.compile(r"/admin/login"))


# ------------------------------------------------------------------ #
# イベント一覧タブ
# ------------------------------------------------------------------ #

def test_admin_events_has_current_tab(admin_page: Page, base_url: str):
    admin_page.goto(base_url + "/admin/events")
    expect(admin_page.get_by_role("button", name="イベント", exact=True)).to_be_visible()


def test_admin_events_has_past_tab(admin_page: Page, base_url: str):
    admin_page.goto(base_url + "/admin/events")
    expect(admin_page.locator(".tab-btn", has_text="過去のイベント")).to_be_visible()


def test_admin_events_current_tab_is_default(admin_page: Page, base_url: str):
    admin_page.goto(base_url + "/admin/events")
    expect(admin_page.locator("#tab-current")).to_be_visible()
    expect(admin_page.locator("#tab-past")).to_be_hidden()


def test_admin_events_tab_switch_to_past(admin_page: Page, base_url: str):
    admin_page.goto(base_url + "/admin/events")
    admin_page.locator(".tab-btn", has_text="過去のイベント").click()
    expect(admin_page.locator("#tab-past")).to_be_visible()
    expect(admin_page.locator("#tab-current")).to_be_hidden()


def test_admin_events_current_tab_shows_upcoming(admin_page: Page, base_url: str):
    """現在タブにモックの開催予定イベントが表示される。"""
    admin_page.goto(base_url + "/admin/events")
    expect(admin_page.locator("#tab-current").get_by_text(
        "テスト フラワーマーケット 2026"
    )).to_be_visible()


def test_admin_events_past_tab_shows_past_event(admin_page: Page, base_url: str):
    """過去タブにモックの過去イベントが表示される。"""
    admin_page.goto(base_url + "/admin/events")
    admin_page.locator(".tab-btn", has_text="過去のイベント").click()
    expect(admin_page.locator("#tab-past").get_by_text(
        "テスト 過去イベント 2026春"
    )).to_be_visible()


def test_admin_events_has_add_button(admin_page: Page, base_url: str):
    admin_page.goto(base_url + "/admin/events")
    expect(admin_page.get_by_role("link", name=re.compile(r"新規追加"))).to_be_visible()


# ------------------------------------------------------------------ #
# 新規イベントフォーム
# ------------------------------------------------------------------ #

def test_admin_new_event_form_loads(admin_page: Page, base_url: str):
    admin_page.goto(base_url + "/admin/events/new")
    expect(admin_page.locator('input[name="イベント名"]')).to_be_visible()
    expect(admin_page.locator('input[name="開始日"]')).to_be_visible()
    expect(admin_page.locator('input[name="終了日"]')).to_be_visible()
    expect(admin_page.locator('input[name="場所"]')).to_be_visible()


def test_admin_new_event_ws_flag_hidden_by_default(admin_page: Page, base_url: str):
    """WSフラグ未チェック時は予約フラグフィールドが非表示。"""
    admin_page.goto(base_url + "/admin/events/new")
    expect(admin_page.locator("#reserve-flag-wrap")).to_be_hidden()


def test_admin_new_event_ws_flag_toggle_shows_reserve(admin_page: Page, base_url: str):
    """WSフラグをチェックすると予約フラグフィールドが表示される。"""
    admin_page.goto(base_url + "/admin/events/new")
    admin_page.check('input[id="ws-flag-cb"]')
    expect(admin_page.locator("#reserve-flag-wrap")).to_be_visible()


def test_admin_new_event_ws_flag_uncheck_hides_reserve(admin_page: Page, base_url: str):
    """WSフラグのチェックを外すと予約フラグフィールドが再び非表示になる。"""
    admin_page.goto(base_url + "/admin/events/new")
    admin_page.check('input[id="ws-flag-cb"]')
    expect(admin_page.locator("#reserve-flag-wrap")).to_be_visible()
    admin_page.uncheck('input[id="ws-flag-cb"]')
    expect(admin_page.locator("#reserve-flag-wrap")).to_be_hidden()


def test_admin_edit_event_form_loads(admin_page: Page, base_url: str):
    """イベント編集フォームに既存データが反映される（Row 2 のモックデータ）。"""
    admin_page.goto(base_url + "/admin/events/2")
    expect(admin_page.locator('input[name="イベント名"]')).to_have_value(
        "テスト フラワーマーケット 2026"
    )


# ------------------------------------------------------------------ #
# WS予約一覧タブ
# ------------------------------------------------------------------ #

def test_admin_reservations_has_current_tab(admin_page: Page, base_url: str):
    admin_page.goto(base_url + "/admin/reservations")
    expect(admin_page.locator(".tab-btn", has_text="予約一覧")).to_be_visible()


def test_admin_reservations_has_past_tab(admin_page: Page, base_url: str):
    admin_page.goto(base_url + "/admin/reservations")
    expect(admin_page.locator(".tab-btn", has_text="過去の予約")).to_be_visible()


def test_admin_reservations_current_tab_is_default(admin_page: Page, base_url: str):
    admin_page.goto(base_url + "/admin/reservations")
    expect(admin_page.locator("#tab-current")).to_be_visible()
    expect(admin_page.locator("#tab-past")).to_be_hidden()


def test_admin_reservations_tab_switch_to_past(admin_page: Page, base_url: str):
    admin_page.goto(base_url + "/admin/reservations")
    admin_page.locator(".tab-btn", has_text="過去の予約").click()
    expect(admin_page.locator("#tab-past")).to_be_visible()
    expect(admin_page.locator("#tab-current")).to_be_hidden()


def test_admin_reservations_current_shows_future_reservation(admin_page: Page, base_url: str):
    """現在タブに将来日付の予約が表示される。"""
    admin_page.goto(base_url + "/admin/reservations")
    expect(admin_page.locator("#tab-current").get_by_text("テスト太郎")).to_be_visible()


def test_admin_reservations_past_shows_past_reservation(admin_page: Page, base_url: str):
    """過去タブに過去日付の予約が表示される。"""
    admin_page.goto(base_url + "/admin/reservations")
    admin_page.locator(".tab-btn", has_text="過去の予約").click()
    expect(admin_page.locator("#tab-past").get_by_text("テスト花子")).to_be_visible()


def test_admin_reservations_url_tab_param_activates_past_tab(admin_page: Page, base_url: str):
    """URL に tab=past を指定すると過去タブがアクティブになる。"""
    admin_page.goto(base_url + "/admin/reservations?tab=past")
    expect(admin_page.locator("#tab-past")).to_be_visible()
    expect(admin_page.locator("#tab-current")).to_be_hidden()


def test_admin_reservations_table_header_shows_yoyakubi(admin_page: Page, base_url: str):
    """テーブルヘッダーが「希望日」でなく「予約日」と表示される。"""
    admin_page.goto(base_url + "/admin/reservations")
    expect(admin_page.get_by_role("columnheader", name="予約日")).to_be_visible()
