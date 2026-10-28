import { test, expect } from '@playwright/test'

test.describe('Contact フォーム', () => {
  test('初期状態: 送信ボタンが表示される', async ({ page }) => {
    await page.goto('/official/contact')
    await expect(page.getByRole('button', { name: '送信する' })).toBeVisible()
  })

  test('フォーム送信 → 完了メッセージが表示される', async ({ page }) => {
    // 1. お問い合わせフォームを開き、必須項目を入力する
    await page.goto('/official/contact')
    await page.getByPlaceholder('例: 山田 花子').fill('テスト太郎')
    await page.getByPlaceholder('yourname@example.com').fill('test@example.com')
    await page.getByPlaceholder('お問い合わせ内容をご記入ください').fill('テストメッセージです。')
    // 2. 送信し、受付完了の案内が表示されることを確認する
    await page.getByRole('button', { name: '送信する' }).click()
    await expect(page.getByText('お問い合わせを受け付けました')).toBeVisible()
  })

  test('送信完了後はフォームが非表示になる', async ({ page }) => {
    // 1. フォームを入力して送信する
    await page.goto('/official/contact')
    await page.getByPlaceholder('例: 山田 花子').fill('テスト太郎')
    await page.getByPlaceholder('yourname@example.com').fill('test@example.com')
    await page.getByPlaceholder('お問い合わせ内容をご記入ください').fill('メッセージ')
    // 2. 送信後にフォーム操作ができない状態になることを確認する
    await page.getByRole('button', { name: '送信する' }).click()
    await expect(page.getByRole('button', { name: '送信する' })).not.toBeVisible()
  })
})
