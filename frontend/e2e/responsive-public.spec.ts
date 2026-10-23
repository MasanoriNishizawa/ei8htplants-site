import { test, expect, type Page } from '@playwright/test'

// 公開サイトの画面幅ごとの見た目の確認（MSW モックで実行。本番には接続しない）
// 1. ヘッダーの言語切り替えボタン
//    - PC（1280px）では PC のナビの 1 つだけが読み上げ対象になる（閉じたスマホのメニューの中のボタンは inert・非表示で数えない）
//    - スマホ（375px）ではメニューを開くと中に言語切り替えボタンがあり、押すと英語に変わる（メニューは閉じない）
// 2. 注文手続き（/checkout）は狭い画面では 1 列（フォームの下に注文サマリー）、768px 以上で 2 列
//    カートは商品詳細（MOCK_PRODUCTS の p-1）から「カートに入れる」で入れる

/**
 * 横スクロールが出ていないかを確かめる
 * @param page - 対象ページ
 */
async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
}

/**
 * 注文手続きの 2 つの列（フォームと注文サマリー）の位置を返す
 * @param page - 対象ページ
 * @returns 1 列目（フォーム）と 2 列目（サマリー）の位置と大きさ
 */
async function checkoutColumns(page: Page) {
  const layout = page.locator('.checkout-layout')
  await expect(layout).toBeVisible()
  const form = layout.locator(':scope > *').nth(0)
  const summary = layout.locator(':scope > *').nth(1)
  return { form: (await form.boundingBox())!, summary: (await summary.boundingBox())! }
}

/**
 * 商品詳細から 1 つカートに入れて、注文手続きを開く
 * @param page - 対象ページ
 */
async function openCheckoutWithItem(page: Page) {
  await page.goto('/shop/p-1')
  await page.getByRole('button', { name: /カートに入れる/ }).click()
  await page.goto('/checkout')
}

test.describe('ヘッダーの言語切り替えボタン', () => {
  test('PC 幅（1280px）では言語切り替えボタンが読み上げ対象として 1 つだけ出る', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    await expect(page.getByRole('banner')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Switch to English' })).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Switch to English' })).toBeVisible()
  })

  test('スマホ幅（375px）ではメニューを開くと言語切り替えボタンがあり、押すと英語になってメニューは開いたまま', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/')
    // 1. 閉じているあいだは読み上げ対象の言語ボタンは無い（PC のナビは隠れている）
    await expect(page.getByRole('button', { name: 'Switch to English' })).toHaveCount(0)
    // 2. メニューを開くと中に 1 つ出る
    await page.getByRole('button', { name: 'メニューを開く' }).click()
    const menu = page.getByRole('navigation', { name: 'メニュー' })
    const langBtn = menu.getByRole('button', { name: 'Switch to English' })
    await expect(langBtn).toBeVisible()
    await expect(page.getByRole('button', { name: 'Switch to English' })).toHaveCount(1)
    // 3. 押すと英語になる（ボタンは「日本語に切り替える」に変わり、メニューは閉じない）
    await langBtn.click()
    await expect(page.getByRole('navigation', { name: 'Menu' }).getByRole('button', { name: '日本語に切り替える' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true')
  })
})

test.describe('注文手続き（/checkout）の列', () => {
  test.beforeEach(async ({ page }) => {
    // 前のテストのカートが残らないよう、最初に localStorage を空にする
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
  })

  test('スマホ幅（375px）ではフォームの下に注文サマリーが並ぶ 1 列になり、横スクロールが出ない', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await openCheckoutWithItem(page)
    const { form, summary } = await checkoutColumns(page)
    // 左端がそろい、サマリーはフォームより下にある
    expect(Math.abs(form.x - summary.x)).toBeLessThanOrEqual(1)
    expect(summary.y).toBeGreaterThanOrEqual(form.y + form.height)
    await expectNoHorizontalScroll(page)
  })

  test('767px でも 1 列、768px では 2 列（サマリーがフォームの右）になる', async ({ page }) => {
    await page.setViewportSize({ width: 767, height: 900 })
    await openCheckoutWithItem(page)
    let cols = await checkoutColumns(page)
    expect(cols.summary.y).toBeGreaterThanOrEqual(cols.form.y + cols.form.height)
    // 768px に広げると 2 列
    await page.setViewportSize({ width: 768, height: 900 })
    cols = await checkoutColumns(page)
    expect(cols.summary.x).toBeGreaterThan(cols.form.x + cols.form.width - 1)
    expect(Math.abs(cols.summary.y - cols.form.y)).toBeLessThanOrEqual(1)
  })
})
