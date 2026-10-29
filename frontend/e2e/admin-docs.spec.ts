import { test, expect } from '@playwright/test'

test.describe('AdminDocs 設計書ビューア', () => {
  test('設計書ツリーが表示される', /**
     * 「/admin/docs」を開く、「03_PM」が画面に表示されること、「04_TEST」が画面に表示されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 設計書管理ページを開き、文書ツリーのフォルダーとファイルが表示されることを確認する。
    await page.goto('/admin/docs')
    await expect(page.getByText('03_PM')).toBeVisible()
    await expect(page.getByText('04_TEST')).toBeVisible()
  })

  test('ファイルを選択するとマークダウンが H1 見出しとしてレンダリングされる', /**
     文書一覧からテスト計画書を選び、本文の最上位見出しが表示されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 設計書ビューアを開き、テスト計画書のフォルダーを選ぶ
    await page.goto('/admin/docs')
    await page.getByText('04_TEST').click()
    // 2. ファイルを選び、本文が H1 見出しとして表示されることを確認する
    await page.getByText('01_マスターテスト計画書').click()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('テーブルがレンダリングされる', /**
     テスト計画書を開き、Markdownの表がページ内に表示されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. テーブルを含む設計書を開く
    await page.goto('/admin/docs')
    await page.getByText('04_TEST').click()
    // 2. 本文内にテーブルが描画されることを確認する
    await page.getByText('01_マスターテスト計画書').click()
    await expect(page.locator('table').first()).toBeVisible()
  })

  test('コードブロックがレンダリングされる', /**
     エージェント設計書を開き、Markdownのコードブロックが表示されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. コードブロックを含む設計書を開く
    await page.goto('/admin/docs')
    await page.getByText('03_PM').click()
    // 2. 本文内にコードブロックが描画されることを確認する
    await page.getByText('05_エージェント設計書').click()
    await expect(page.locator('pre').first()).toBeVisible()
  })
})
