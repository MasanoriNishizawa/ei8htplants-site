import { test, expect } from '@playwright/test'

// 予約フォームページ（/reserve）の E2E テスト
// MSW モックモードで実行（本番 DB には接続しない）
// POST /api/reserve は handlers.ts で { ok: true } を返す設定済み

test.describe('Reserve', () => {
  // ページが正常にロードされることを確認
  test('/reserve が正常に表示される', async ({ page }) => {
    await page.goto('/reserve')
    // ナビゲーションが存在すること（共通 Layout のヘッダー）
    await expect(page.getByRole('navigation').first()).toBeVisible()
    // タイトルにサイト名が含まれること
    await expect(page).toHaveTitle(/ei8ht plants/)
  })

  // 予約フォームの見出しが表示されることを確認
  test('Workshop 予約の見出しが表示される', async ({ page }) => {
    await page.goto('/reserve')
    // h1 に「Workshop 予約」が表示される
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  // フォームに名前・メールアドレスの入力フィールドが存在することを確認
  // event_id なしでアクセスすると、イベント情報なしでフォームが表示される
  test('お名前・メールアドレスの入力フィールドが存在する', async ({ page }) => {
    await page.goto('/reserve')
    // テキスト入力フィールド（お名前）が表示されること
    await expect(page.getByRole('textbox').first()).toBeVisible()
  })

  // 送信ボタンが表示されることを確認
  test('予約するボタンが存在する', async ({ page }) => {
    await page.goto('/reserve')
    // 送信ボタンが表示されること
    await expect(page.getByRole('button', { name: /予約する/ })).toBeVisible()
  })

  // イベント ID を指定してアクセスするとイベント情報が表示されることを確認
  // MOCK_EVENTS の mock-upcoming-1（Green Market 2027）を使用
  test('event_id を指定するとイベント名が表示される', async ({ page }) => {
    await page.goto('/reserve?event_id=mock-upcoming-1')
    // イベント名「Green Market 2027」が表示されること
    await expect(page.getByText('Green Market 2027')).toBeVisible()
  })

  // 電話番号フィールドが任意項目として存在することを確認
  test('電話番号フィールド（任意）が存在する', async ({ page }) => {
    await page.goto('/reserve')
    // placeholder に「090-0000-0000」が指定された電話番号フィールドがある
    await expect(page.getByPlaceholder('090-0000-0000')).toBeVisible()
  })
})
