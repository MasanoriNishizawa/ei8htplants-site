import { test, expect } from '@playwright/test'

test.describe('Contact フォーム', () => {
  test('初期状態: 送信ボタンが表示される', async ({ page }) => {
    await page.goto('/contact')
    await expect(page.getByRole('button', { name: '送信する' })).toBeVisible()
  })

  test('フォーム送信 → 完了メッセージが表示される', async ({ page }) => {
    await page.goto('/contact')
    await page.getByPlaceholder('例: 山田 花子').fill('テスト太郎')
    await page.getByPlaceholder('yourname@example.com').fill('test@example.com')
    await page.getByPlaceholder('お問い合わせ内容をご記入ください').fill('テストメッセージです。')
    await page.getByRole('button', { name: '送信する' }).click()
    await expect(page.getByText('お問い合わせを受け付けました')).toBeVisible()
  })

  test('送信完了後はフォームが非表示になる', async ({ page }) => {
    await page.goto('/contact')
    await page.getByPlaceholder('例: 山田 花子').fill('テスト太郎')
    await page.getByPlaceholder('yourname@example.com').fill('test@example.com')
    await page.getByPlaceholder('お問い合わせ内容をご記入ください').fill('メッセージ')
    await page.getByRole('button', { name: '送信する' }).click()
    await expect(page.getByRole('button', { name: '送信する' })).not.toBeVisible()
  })
})
