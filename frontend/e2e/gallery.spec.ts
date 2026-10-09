import { test, expect } from '@playwright/test'

test.describe('Gallery', () => {
  test('ギャラリー画像が表示される', async ({ page }) => {
    await page.goto('/gallery')
    await expect(page.locator('img').first()).toBeVisible()
  })

  test('ブランドフィルタが表示される', async ({ page }) => {
    await page.goto('/gallery')
    // フィルタ UI（ブランド選択）が存在する
    await expect(page.getByText(/HUE|ei8ht plants|Habitat/).first()).toBeVisible()
  })
})
