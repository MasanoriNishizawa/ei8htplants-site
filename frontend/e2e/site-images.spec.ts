import { test, expect } from '@playwright/test'

test('HUEの色見本を管理画面で写真に差し替えられる', async ({ page }) => {
  await page.goto('/admin/site-images')
  await expect(page.getByRole('heading', { name: 'サイト画像管理' })).toBeVisible()
  await expect(page.getByText('写真はまだ設定されていません')).toBeVisible()

  await page.locator('#hue-color-study-image').setInputFiles('public/img/habitatOides/habitat_oides_hero.jpg')
  await expect(page.getByRole('img', { name: 'HUE by ei8ht plants 掲載写真のプレビュー' })).toBeVisible()
  await page.getByRole('button', { name: '写真を保存' }).click()
  await expect(page.getByRole('status')).toHaveText('写真を保存しました。')

  // 同じブラウザーセッションで公開ページへ移り、保存した写真が表示されることを確かめる。
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => {
    window.history.pushState({}, '', '/hue')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page.locator('.hue-color-photo img')).toBeVisible()
  await expect(page.locator('.hue-palette')).toHaveCount(0)
})
