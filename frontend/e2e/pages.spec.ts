import { test, expect } from '@playwright/test'

// 各ページがエラーなくロードされることを確認するスモークテスト
// 本番DBには接続しない（MSW モックモードで起動）

const routes = [
  '/',
  '/official',
  '/events',
  '/gallery',
  '/contact',
  '/stockists',
  '/shop',
  '/collaborations',
  '/media',
  '/reserve',
  // コンセプトページ（共通 Layout）
  '/concept',
  // ジャーナルページ（StoreLayout）
  '/journal',
  // ブランドページ（App.tsx のルートパスに合わせた正確なパス）
  '/ei8htplants',
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
