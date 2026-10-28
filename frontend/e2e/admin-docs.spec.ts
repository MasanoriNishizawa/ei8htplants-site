import { test, expect } from '@playwright/test'

test.describe('AdminDocs 設計書ビューア', () => {
  test('設計書ツリーが表示される', async ({ page }) => {
    // 1. 「設計書ツリーが表示される」の期待状態が画面に表示されることを確認する。
    await page.goto('/admin/docs')
    await expect(page.getByText('03_PM')).toBeVisible()
    await expect(page.getByText('04_TEST')).toBeVisible()
  })

  test('ファイルを選択するとマークダウンが H1 見出しとしてレンダリングされる', async ({ page }) => {
    // 1. 設計書ビューアを開き、テスト計画書のフォルダーを選ぶ
    await page.goto('/admin/docs')
    await page.getByText('04_TEST').click()
    // 2. ファイルを選び、本文が H1 見出しとして表示されることを確認する
    await page.getByText('01_マスターテスト計画書').click()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('テーブルがレンダリングされる', async ({ page }) => {
    // 1. テーブルを含む設計書を開く
    await page.goto('/admin/docs')
    await page.getByText('04_TEST').click()
    // 2. 本文内にテーブルが描画されることを確認する
    await page.getByText('01_マスターテスト計画書').click()
    await expect(page.locator('table').first()).toBeVisible()
  })

  test('コードブロックがレンダリングされる', async ({ page }) => {
    // 1. コードブロックを含む設計書を開く
    await page.goto('/admin/docs')
    await page.getByText('03_PM').click()
    // 2. 本文内にコードブロックが描画されることを確認する
    await page.getByText('05_エージェント設計書').click()
    await expect(page.locator('pre').first()).toBeVisible()
  })
})
