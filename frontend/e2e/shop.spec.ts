import { test, expect } from '@playwright/test'

test.describe('Shop', () => {
  test('商品一覧が表示される', async ({ page }) => {
    await page.goto('/shop')
    await expect(page.getByText('Habitat Style Pot S')).toBeVisible()
  })

  test('商品価格が表示される', async ({ page }) => {
    await page.goto('/shop')
    await expect(page.getByText(/3,800/)).toBeVisible()
  })

  test('商品をクリックすると詳細ページに遷移する', async ({ page }) => {
    await page.goto('/shop')
    await page.getByText('Habitat Style Pot S').first().click()
    await expect(page).toHaveURL(/\/shop\//)
    await expect(page.getByRole('heading', { name: 'Habitat Style Pot S' })).toBeVisible()
  })
})
