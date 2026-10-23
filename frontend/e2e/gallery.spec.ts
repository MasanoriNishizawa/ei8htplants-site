import { test, expect } from '@playwright/test'

test.describe('Gallery', () => {
  test('ギャラリー画像が表示される', async ({ page }) => {
    await page.goto('/gallery')
    await expect(page.locator('img').first()).toBeVisible()
  })

  test('ブランドフィルタが表示される', async ({ page }) => {
    await page.goto('/gallery')
    // ブランドの切り替えタブ（ボタン）が並ぶ。ヘッダーのメニュー内の同名リンク（閉じていると非表示）と区別するためボタンで探す
    await expect(page.getByRole('button', { name: 'All', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'ei8ht plants', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Habitat Oides', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'HUE by ei8ht plants', exact: true })).toBeVisible()
  })
})
