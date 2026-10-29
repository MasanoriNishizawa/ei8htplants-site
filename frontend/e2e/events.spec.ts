import { test, expect } from '@playwright/test'

test.describe('Events', () => {
  test('開催予定イベントが表示される', /**
     * 「/official/events」を開く、「Green Market 2027」が画面に表示されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. イベント一覧を開き、開催予定のGreen Market 2027が表示されることを確認する。
    await page.goto('/official/events')
    await expect(page.getByText('Green Market 2027')).toBeVisible()
  })

  test('イベント開催地が表示される', /**
     * 「/official/events」を開く、「代々木公園」が画面に表示されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. イベント一覧を開き、開催地の代々木公園が表示されることを確認する。
    await page.goto('/official/events')
    await expect(page.getByText(/代々木公園/)).toBeVisible()
  })

  test('複数イベントが表示される', /**
     * 「/official/events」を開く、「HUE POP-UP at Spiral」が画面に表示されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. イベント一覧を開き、HUE POP-UP at Spiralも掲載されていることを確認する。
    await page.goto('/official/events')
    await expect(page.getByText('HUE POP-UP at Spiral')).toBeVisible()
  })
})
