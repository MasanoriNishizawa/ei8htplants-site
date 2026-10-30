import { test, expect } from '@playwright/test'

// ei8ht plants のブランドサイトと公式サイトを別 URL・別ヘッダーで公開する導線を確認する

test.describe('ブランドサイトと公式サイトのルーティング', () => {
  test('トップ URL は ei8ht plants ブランドホームを表示する', /**
     ルートURLを開き、ei8ht plantsのブランドホームとブランド用ナビゲーションを表示し、公式サイトのトップヒーローを表示しないことを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. ルートを開き、ブランドホームとブランドナビを表示し、公式用ヒーローが出ないことを確認する。
    await page.goto('/')

    await expect(page.locator('.ep-home-page')).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'ei8ht plants' }).getByRole('link', { name: 'Our Story' })).toHaveAttribute('href', '/about')
    await expect(page.getByRole('navigation', { name: 'ei8ht plants' }).getByRole('link', { name: 'Official Site' })).toHaveAttribute('href', '/official')
    await expect(page.locator('.home-hero')).toHaveCount(0)
  })

  test('公式 URL は公式ホームを表示し、ブランドホームと異なるヘッダーを使う', /**
     * /officialを開き、公式ホームのヒーローとBrandsリンクを表示し、ei8ht plants用ナビが存在しないことを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. /officialを開き、公式ヒーローとBrandsリンクがあり、ブランド用ナビが表示されないことを確認する。
    await page.goto('/official')

    await expect(page.locator('.home-hero')).toBeVisible()
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Brands', exact: true })).toHaveAttribute('href', '/official/brands')
    await expect(page.getByRole('navigation', { name: 'ei8ht plants' })).toHaveCount(0)
    // OUR APPROACH の表示・親から渡した紹介リンクも公式ホーム上で確認する。
    const approach = page.locator('.home-action')
    await expect(approach.getByRole('heading', { name: /植物を育て|Grow plants/ })).toBeVisible()
    await expect(approach.getByText(/ひとつの植物から|From one remarkable plant/)).toBeVisible()
    await expect(approach.getByRole('link', { name: /私たちについて|OUR POINT OF VIEW/ })).toHaveAttribute('href', '/official/concept')
  })

  test('公式サイトの Brands メニューを押すと OUR BRANDS ページへ遷移する', /**
     * 「/official」を開く、「Brands」をクリックする、URLが「\/official\/brands$」になること、「Our Brands\.」が画面に表示されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 公式サイトの HOME を開き、Brands メニューを選ぶ
    await page.goto('/official')
    await page.getByRole('link', { name: 'Brands', exact: true }).click()
    // 2. OUR BRANDS の URL とページ見出しに遷移することを確認する
    await expect(page).toHaveURL(/\/official\/brands$/)
    await expect(page.getByRole('heading', { name: /Our Brands\./ })).toBeVisible()
  })

  test('旧 /ei8htplants URL からブランドホームへ移動する', /**
     * 「/ei8htplants」を開く、URLが「\/$」になることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 旧ブランドURLを開くとルートへ転送され、ブランドホームが表示されることを確認する。
    await page.goto('/ei8htplants')

    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator('.ep-home-page')).toBeVisible()
  })

  test('旧 /brands URL から公式 OUR BRANDS へ移動する', /**
     * 「/brands」を開く、URLが「\/official\/brands$」になること、「Our Brands\.」が画面に表示されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 旧Brands URLを開くと/official/brandsへ転送され、OUR BRANDSの見出しが表示されることを確認する。
    await page.goto('/brands')

    await expect(page).toHaveURL(/\/official\/brands$/)
    await expect(page.getByRole('heading', { name: /Our Brands\./ })).toBeVisible()
  })
})
