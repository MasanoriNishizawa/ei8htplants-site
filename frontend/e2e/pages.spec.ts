import { test, expect } from '@playwright/test'

// 各ページがエラーなくロードされることを確認するスモークテスト
// 本番DBには接続しない（MSW モックモードで起動）

const routes = [
  '/',
  '/official',
  '/official/brands',
  '/official/events',
  '/official/gallery',
  '/official/contact',
  '/official/stockists',
  '/official/shop',
  '/official/collaborations',
  '/official/media',
  '/official/reserve',
  // コンセプトページ（共通 Layout）
  '/official/concept',
  // ジャーナルページ（StoreLayout）
  '/official/journal',
  // ei8ht plants のブランドページはルート直下、公式サイトは /official 配下
  '/about',
  '/plants',
  '/habitatoides',
  '/habitatoides/workshop',
  '/hue',
]

// スモークテストで順番に開く公開ページの URL。
for (const path of routes) {
  test(`${path} ページが正常にロードされる`, /**
     対象の公開ページへ直接移動し、共通ナビゲーションとサイト名入りのページタイトルが表示されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 対象 URL を直接開き、ナビゲーションとサイト名入りページタイトルが表示されることを確認する。
    await page.goto(path)
    // ナビゲーションが表示されていればレイアウトが正常にレンダリングされている
    await expect(page.getByRole('navigation').first()).toBeVisible()
    // タイトルにサイト名が含まれる
    await expect(page).toHaveTitle(/ei8ht plants/)
  })
}
