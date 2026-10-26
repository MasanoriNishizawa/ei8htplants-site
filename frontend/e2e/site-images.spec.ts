import { test, expect } from '@playwright/test'

test('HUEの6つの色見本を管理画面から同じ形の写真に差し替えられる', async ({ page }) => {
  await page.goto('/admin/site-images')
  await expect(page.getByRole('heading', { name: 'サイト画像管理' })).toBeVisible()
  await expect(page.locator('.admin-site-image-card')).toHaveCount(6)

  await page.locator('#hue-color-01-image').setInputFiles('public/img/habitatOides/habitat_oides_hero.jpg')
  await expect(page.getByRole('img', { name: '写真 1 の切り抜きプレビュー' })).toBeVisible()
  await page.locator('.admin-site-image-card').first().getByRole('button', { name: '写真を保存' }).click()
  await expect(page.getByRole('status')).toHaveText('写真を保存しました。')

  // デスクトップで6枚が横一列、同じブラウザーセッション内で保存した1枚が表示されることを確かめる。
  await page.evaluate(() => {
    window.history.pushState({}, '', '/hue')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page.locator('.hue-photo-grid .hue-photo-shape')).toHaveCount(6)
  await expect(page.locator('.hue-photo-grid img')).toHaveCount(1)
  const desktopColumns = await page.locator('.hue-photo-grid').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
  expect(desktopColumns).toBe(6)

  // スマホでは3列×2段になり、写真の形も保たれることを確かめる。
  await page.setViewportSize({ width: 390, height: 844 })
  const mobileColumns = await page.locator('.hue-photo-grid').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
  expect(mobileColumns).toBe(3)
  await expect(page.locator('.hue-photo-grid .hue-photo-shape').first()).toHaveCSS('border-radius', '48% 52% 44% 56% / 48% 42% 58% 52%')
})
