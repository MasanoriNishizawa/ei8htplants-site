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
  '/official/chat',
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

test('公式チャットに入力欄を表示し、空の送信ボタンを無効にする', /**
 * /official/chat の入力欄と、空欄の間は送信できない初期状態を確認する。
 * @param page 操作・検証対象の Playwright ページ。
 * @returns {Promise<void>} 画面アサーションが完了したときに解決する。
 */ async ({ page }) => {
  // 1. 公式チャットを開き、入力欄が表示されていることを確認する
  await page.goto('/official/chat')
  await expect(page.getByRole('textbox', { name: /メッセージを入力|Type a message/ })).toBeVisible()
  // 2. 入力が空の初期状態では送信ボタンを押せないことを確認する
  await expect(page.getByRole('button', { name: /送信|Send/ })).toBeDisabled()
})
