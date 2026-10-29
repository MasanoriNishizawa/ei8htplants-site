/**
 * 管理画面の注文一覧が、注文0件の状態でも正常に表示されることを確認する。
 * MSW の GET /api/orders は空配列を返し、本番データベースには接続しない。
 */
import { test, expect } from '@playwright/test'

test.describe('管理画面の注文管理', () => {
  test('/admin/orders — 注文0件でも見出し・一覧表・空状態を表示する', /**
     * 「/admin/orders」を開く、「注文管理」が画面に表示されること、「日時」が画面に表示されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. MSW の空の注文一覧を使う管理画面を開く。
    await page.goto('/admin/orders')

    // 2. ページ見出し・一覧表・表の項目名を表示する。
    await expect(page.getByRole('heading', { name: '注文管理' })).toBeVisible()
    const table = page.getByRole('table')
    await expect(table).toBeVisible()
    await expect(table.getByRole('columnheader', { name: '日時' })).toBeVisible()
    await expect(table.getByRole('columnheader', { name: 'お名前' })).toBeVisible()
    await expect(table.getByRole('columnheader', { name: '状態' })).toBeVisible()

    // 3. 注文行がなく、0 件の案内が表示されることを確認する。
    await expect(table.locator('tbody tr')).toHaveCount(0)
    await expect(page.getByText('注文がありません。')).toBeVisible()
  })
})
