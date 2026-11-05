import { test, expect } from '@playwright/test'

// 古い「サイト画像」の URL（/admin/site-images）は「ページ画像の編集」の HUE に転送される。
// 転送先で HUE の写真を差し替えて保存し、同じタブで開いた HUE のトップページに反映されることを確かめる。
// API は MSW のモックで受ける（保存値はこのタブのメモリにだけ持つので、ページは再読み込みせずに移る）。

test('E2E-V-01: 古いサイト画像の URL はページ画像の編集（HUE）へ転送され、保存した写真が HUE のトップの6つの色見本に出る', /**
   * /admin/site-images を開くと /admin/page-editor/hue に転送されることを確かめ、hue-color-01 に画像を入れて保存する。
   * そのあと同じタブで /hue に移り、6つの切り抜き枠と保存した写真1枚が出ること、PC は6列・スマホは3列で形が保たれることを確かめる。
   * @param page 操作・検証対象の Playwright ページ。
   * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
   */
  async ({ page }) => {
  // 1. 古い URL を開くと HUE の編集画面へ転送され、写真をアップロードして保存できる
  await page.goto('/admin/site-images')
  await expect(page).toHaveURL(/\/admin\/page-editor\/hue$/)
  await expect(page.getByRole('heading', { name: 'ページ画像の編集' })).toBeVisible()
  await page.getByTestId('page-editor-slot-hue-color-01').click()
  await page.getByLabel('画像を選ぶ').setInputFiles('public/img/habitatOides/habitat_oides_hero.jpg')
  await expect(page.getByTestId('page-editor-changed-count')).toHaveText('変更 1 件（未保存）')
  await page.getByTestId('page-editor-save').click()
  await expect(page.getByText('1 件を保存しました。公開ページに反映されます。')).toBeVisible()

  // 2. デスクトップでは6つの切り抜き枠と、保存した写真が1枚だけ表示されることを確かめる。
  await page.evaluate(() => {
    window.history.pushState({}, '', '/hue')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  // React Router と遅延読み込みされた HUE ページの描画完了を待つ。
  await expect(page.locator('.hue-photo-grid')).toBeVisible()
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
