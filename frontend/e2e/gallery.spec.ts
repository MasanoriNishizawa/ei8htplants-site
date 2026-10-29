import { test, expect } from '@playwright/test'

test.describe('Gallery', () => {
  test('ギャラリー画像が表示される', /**
     公開ギャラリーを開き、掲載画像の先頭が画面に表示されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 公開ギャラリーを開き、最初の掲載画像が表示されることを確認する。
    await page.goto('/official/gallery')
    await expect(page.locator('img').first()).toBeVisible()
  })

  test('ブランドフィルタが表示される', /**
     * 「/official/gallery」を開く、「All」が画面に表示されること、「ei8ht plants」が画面に表示されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 公開ギャラリーを開き、全ブランドと各ブランドの切替ボタンが表示されることを確認する。
    await page.goto('/official/gallery')
    // ブランドの切り替えタブ（ボタン）が並ぶ。ヘッダーのメニュー内の同名リンク（閉じていると非表示）と区別するためボタンで探す
    await expect(page.getByRole('button', { name: 'All', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'ei8ht plants', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Habitat Oides', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'HUE by ei8ht plants', exact: true })).toBeVisible()
  })
})
