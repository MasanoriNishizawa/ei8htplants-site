import { test, expect } from '@playwright/test'

test.describe('Contact フォーム', () => {
  test('初期状態: 送信ボタンが表示される', /**
     * 「/official/contact」を開く、「送信する」が画面に表示されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. お問い合わせページを開き、送信前のフォームに「送信する」ボタンが表示されることを確認する。
    await page.goto('/official/contact')
    await expect(page.getByRole('button', { name: '送信する' })).toBeVisible()
  })

  test('フォーム送信 → 完了メッセージが表示される', /**
     * 「/official/contact」を開く、「例: 山田 花子」へ入力する、「yourname@example.com」へ入力する、「お問い合わせを受け付けました」が画面に表示されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. お問い合わせフォームを開き、必須項目を入力する
    await page.goto('/official/contact')
    await page.getByPlaceholder('例: 山田 花子').fill('テスト太郎')
    await page.getByPlaceholder('yourname@example.com').fill('test@example.com')
    await page.getByPlaceholder('お問い合わせ内容をご記入ください').fill('テストメッセージです。')
    // 2. 送信し、受付完了の案内が表示されることを確認する
    await page.getByRole('button', { name: '送信する' }).click()
    await expect(page.getByText('お問い合わせを受け付けました')).toBeVisible()
  })

  test('送信完了後はフォームが非表示になる', /**
     お問い合わせフォームに氏名とメールアドレスを入力して送信し、完了後に送信ボタンが非表示になることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
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
