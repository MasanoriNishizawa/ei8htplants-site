import { test, expect } from '@playwright/test'

test('HUEの6つの色見本を管理画面から同じ形の写真に差し替えられる', /**
   * 「/admin/site-images」を開く、390×844px幅で表示する、「写真を保存」をクリックする、「サイト画像管理」が画面に表示されること、「写真 1 の切り抜きプレビュー」が画面に表示されることを確認する。
   * @param page 操作・検証対象の Playwright ページ。
   * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
   */
  async ({ page }) => {
  // 1. 管理画面で写真をアップロードして保存する
  await page.goto('/admin/site-images')
  await expect(page.getByRole('heading', { name: 'サイト画像管理' })).toBeVisible()
  await expect(page.locator('.admin-site-image-card')).toHaveCount(6)

  await page.locator('#hue-color-01-image').setInputFiles('public/img/habitatOides/habitat_oides_hero.jpg')
  await expect(page.getByRole('img', { name: '写真 1 の切り抜きプレビュー' })).toBeVisible()
  await page.locator('.admin-site-image-card').first().getByRole('button', { name: '写真を保存' }).click()
  await expect(page.getByRole('status')).toHaveText('写真を保存しました。')

  // 2. デスクトップでは6つの切り抜き枠と、保存した写真が1枚だけ表示されることを確かめる。
  await page.evaluate(() => {
    window.history.pushState({}, '', '/hue')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page.locator('.hue-photo-grid .hue-photo-shape')).toHaveCount(6)
  await expect(page.locator('.hue-photo-grid img')).toHaveCount(1)
  // デスクトップ幅で写真グリッドに設定された列数。
  const desktopColumns = await page.locator('.hue-photo-grid').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
  expect(desktopColumns).toBe(6)

  // 3. スマホでは3列×2段になり、写真の形も保たれることを確かめる。
  await page.setViewportSize({ width: 390, height: 844 })
  const mobileColumns = await page.locator('.hue-photo-grid').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
  expect(mobileColumns).toBe(3)
  await expect(page.locator('.hue-photo-grid .hue-photo-shape').first()).toHaveCSS('border-radius', '48% 52% 44% 56% / 48% 42% 58% 52%')
})
