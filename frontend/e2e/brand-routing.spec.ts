import { test, expect } from '@playwright/test'

// ei8ht plants のブランドサイトと公式サイトを別 URL・別ヘッダーで公開する導線を確認する
test.describe('ブランドサイトと公式サイトのルーティング', () => {
  test('トップ URL は ei8ht plants ブランドホームを表示する', async ({ page }) => {
    // 1. 「トップ URL は ei8ht plants ブランドホームを表示する」の期待状態が画面に表示されることを確認する。
    await page.goto('/')

    await expect(page.locator('.ep-home-page')).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'ei8ht plants' }).getByRole('link', { name: 'Our Story' })).toHaveAttribute('href', '/about')
    await expect(page.getByRole('navigation', { name: 'ei8ht plants' }).getByRole('link', { name: 'Official Site' })).toHaveAttribute('href', '/official')
    await expect(page.locator('.home-hero')).toHaveCount(0)
  })

  test('公式 URL は公式ホームを表示し、ブランドホームと異なるヘッダーを使う', async ({ page }) => {
    // 1. 「公式 URL は公式ホームを表示し、ブランドホームと異なるヘッダーを使う」の期待状態が画面に表示されることを確認する。
    await page.goto('/official')

    await expect(page.locator('.home-hero')).toBeVisible()
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Brands', exact: true })).toHaveAttribute('href', '/official/brands')
    await expect(page.getByRole('navigation', { name: 'ei8ht plants' })).toHaveCount(0)
  })

  test('公式サイトの Brands メニューを押すと OUR BRANDS ページへ遷移する', async ({ page }) => {
    // 1. 公式サイトの HOME を開き、Brands メニューを選ぶ
    await page.goto('/official')
    await page.getByRole('link', { name: 'Brands', exact: true }).click()
    // 2. OUR BRANDS の URL とページ見出しに遷移することを確認する
    await expect(page).toHaveURL(/\/official\/brands$/)
    await expect(page.getByRole('heading', { name: /Our Brands\./ })).toBeVisible()
  })

  test('旧 /ei8htplants URL からブランドホームへ移動する', async ({ page }) => {
    // 1. 「旧 /ei8htplants URL からブランドホームへ移動する」の期待状態が画面に表示されることを確認する。
    await page.goto('/ei8htplants')

    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator('.ep-home-page')).toBeVisible()
  })

  test('旧 /brands URL から公式 OUR BRANDS へ移動する', async ({ page }) => {
    // 1. 「旧 /brands URL から公式 OUR BRANDS へ移動する」の期待状態が画面に表示されることを確認する。
    await page.goto('/brands')

    await expect(page).toHaveURL(/\/official\/brands$/)
    await expect(page.getByRole('heading', { name: /Our Brands\./ })).toBeVisible()
  })
})
