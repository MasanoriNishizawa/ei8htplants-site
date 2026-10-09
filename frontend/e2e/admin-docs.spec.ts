import { test, expect } from '@playwright/test'

test.describe('AdminDocs 設計書ビューア', () => {
  test('設計書ツリーが表示される', async ({ page }) => {
    await page.goto('/admin/docs')
    await expect(page.getByText('03_PM')).toBeVisible()
    await expect(page.getByText('04_TEST')).toBeVisible()
  })

  test('ファイルを選択するとマークダウンが H1 見出しとしてレンダリングされる', async ({ page }) => {
    await page.goto('/admin/docs')
    await page.getByText('04_TEST').click()
    await page.getByText('01_マスターテスト計画書').click()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('テーブルがレンダリングされる', async ({ page }) => {
    await page.goto('/admin/docs')
    await page.getByText('04_TEST').click()
    await page.getByText('01_マスターテスト計画書').click()
    await expect(page.locator('table').first()).toBeVisible()
  })

  test('コードブロックがレンダリングされる', async ({ page }) => {
    await page.goto('/admin/docs')
    await page.getByText('03_PM').click()
    await page.getByText('05_エージェント設計書').click()
    await expect(page.locator('pre').first()).toBeVisible()
  })
})
