import { test, expect } from '@playwright/test'

test.describe('Shop', () => {
  test('商品一覧が表示される', async ({ page }) => {
    await page.goto('/official/shop')
    await expect(page.getByText('Habitat Style Pot S')).toBeVisible()
  })

  test('商品価格が表示される', async ({ page }) => {
    await page.goto('/official/shop')
    await expect(page.getByText(/3,800/)).toBeVisible()
  })

  test('商品をクリックすると詳細ページに遷移する', async ({ page }) => {
    await page.goto('/official/shop')
    await page.getByText('Habitat Style Pot S').first().click()
    await expect(page).toHaveURL(/\/official\/shop\//)
    await expect(page.getByRole('heading', { name: 'Habitat Style Pot S' })).toBeVisible()
  })

  // 商品詳細ページに「カートに入れる」ボタンが表示されることを確認
  // MOCK_PRODUCTS の p-1（Habitat Style Pot S、stock=5）を使用
  test('商品詳細ページに「カートに入れる」ボタンが表示される', async ({ page }) => {
    await page.goto('/official/shop/p-1')
    // ShopProduct コンポーネントの「カートに入れる」ボタンが表示されること
    await expect(page.getByRole('button', { name: /カートに入れる/ })).toBeVisible()
  })

  // 品切れ商品（stock=0）の詳細ページに「現在売り切れです」が表示されることを確認
  // data.ts に追加した p-sold-out（Habitat Style Pot L, stock=0）を使用
  test('品切れ商品の詳細ページに「現在売り切れです」が表示される', async ({ page }) => {
    await page.goto('/official/shop/p-sold-out')
    // ShopProduct コンポーネントは stock===0 のとき「現在売り切れです」を表示する
    await expect(page.getByText('現在売り切れです')).toBeVisible()
  })

  // 品切れ商品では「カートに入れる」ボタンが表示されないことを確認
  // ShopProduct は soldOut===true のとき購入ボタンブロック全体を非表示にする
  test('品切れ商品では「カートに入れる」ボタンが表示されない', async ({ page }) => {
    await page.goto('/official/shop/p-sold-out')
    // 「現在売り切れです」テキストが表示されること
    await expect(page.getByText('現在売り切れです')).toBeVisible()
    // stock===0 のときカートボタンは DOM に存在しない（非表示ではなく未描画）
    await expect(page.getByRole('button', { name: /カートに入れる/ })).not.toBeAttached()
  })
})
