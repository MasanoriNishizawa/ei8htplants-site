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

for (const path of routes) {
  test(`${path} ページが正常にロードされる`, async ({ page }) => {
    await page.goto(path)
    // ナビゲーションが表示されていればレイアウトが正常にレンダリングされている
    await expect(page.getByRole('navigation').first()).toBeVisible()
    // タイトルにサイト名が含まれる
    await expect(page).toHaveTitle(/ei8ht plants/)
  })
}
