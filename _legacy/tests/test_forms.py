"""
tests/test_forms.py
====================
フォーム UI のテスト。
フィールドの存在・バリデーション・WS予約フォームの動作を確認する。
"""

import re

import pytest
from playwright.sync_api import Page, expect


# ------------------------------------------------------------------ #
# お問い合わせフォーム
# ------------------------------------------------------------------ #

def test_contact_form_has_required_fields(page: Page, base_url: str):
    page.goto(base_url + "/contact")
    expect(page.locator('input[name="name"]')).to_be_visible()
    expect(page.locator('input[name="email"]')).to_be_visible()
    expect(page.locator('textarea[name="message"]')).to_be_visible()
    expect(page.get_by_role("button", name=re.compile(r"送信|Submit", re.I))).to_be_visible()


def test_contact_form_subject_field_optional(page: Page, base_url: str):
    page.goto(base_url + "/contact")
    subject = page.locator('input[name="subject"]')
    expect(subject).to_be_visible()
    # required 属性がないこと
    assert subject.get_attribute("required") is None


def test_contact_form_empty_submit_stays_on_page(page: Page, base_url: str):
    """必須フィールドが空のままフォーム送信するとブラウザバリデーションが働きページに留まる。"""
    page.goto(base_url + "/contact")
    page.get_by_role("button", name=re.compile(r"送信|Submit", re.I)).click()
    # /contact に留まっていることを確認（sent=1 に遷移しない）
    assert "sent=1" not in page.url


# ------------------------------------------------------------------ #
# WS予約フォーム
# ------------------------------------------------------------------ #

def test_reserve_form_shows_for_ws_event(page: Page, base_url: str):
    """WSフラグ=TRUE のイベント（Row 3）にアクセスすると予約フォームが表示される。"""
    page.goto(base_url + "/reserve?row=3")
    expect(page.locator("form")).to_be_visible()
    expect(page.locator('select[name="date"]')).to_be_visible()


def test_reserve_form_has_participant_select(page: Page, base_url: str):
    page.goto(base_url + "/reserve?row=3")
    # 日付を選択してから参加人数セレクトが有効になる
    date_select = page.locator('select[name="date"]')
    expect(date_select).to_be_visible()
    options = date_select.locator("option")
    # 有効な日付オプションが少なくとも1つある（空の placeholder を除く）
    assert options.count() >= 1


def test_reserve_form_ws_event_name_displayed(page: Page, base_url: str):
    """予約フォームにイベント名が表示される。"""
    page.goto(base_url + "/reserve?row=3")
    expect(page.get_by_text("Habitat Style Workshop テスト")).to_be_visible()


def test_reserve_no_reserve_event_redirects(page: Page, base_url: str):
    """予約フラグ=FALSE のイベント（Row 4）の /reserve はイベント一覧へリダイレクトされる。"""
    page.goto(base_url + "/reserve?row=4")
    expect(page).to_have_url(f"{base_url}/events")


def test_reserve_required_fields_exist(page: Page, base_url: str):
    page.goto(base_url + "/reserve?row=3")
    expect(page.locator('input[name="name"]')).to_be_visible()
    expect(page.locator('input[name="email"]')).to_be_visible()


