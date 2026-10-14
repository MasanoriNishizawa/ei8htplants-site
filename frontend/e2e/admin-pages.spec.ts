import { test, expect } from '@playwright/test'

// 管理画面ページのスモークテスト
// VITE_SKIP_ADMIN_AUTH=true で認証スキップ済みの環境で実行（npm run mock:e2e）
// 各ページが 404 / エラーなくロードされることを確認する
// MSW ハンドラーで全 API コールをインターセプト（本番 DB には接続しない）

test.describe('管理画面スモークテスト', () => {
  // ダッシュボード: h2 見出し「ダッシュボード」と管理メニューリンクが表示されること
  test('/admin — ダッシュボードが表示される', async ({ page }) => {
    await page.goto('/admin')
    // ダッシュボードの見出しが表示されること
    await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible()
  })

  // イベント一覧: ページに何らかのコンテンツが表示されること
  test('/admin/events — イベント一覧ページが表示される', async ({ page }) => {
    await page.goto('/admin/events')
    // 「イベント」を含む見出しまたは「新規作成」ボタンが存在すること
    await expect(page.getByRole('link', { name: /新規作成|イベント追加|新規/ }).or(
      page.getByRole('heading')
    ).first()).toBeVisible()
  })

  // イベント新規作成フォーム: フォームの見出しが表示されること
  test('/admin/events/new — 新規作成フォームが表示される', async ({ page }) => {
    await page.goto('/admin/events/new')
    // フォームが存在すること（見出しまたは input）
    await expect(page.getByRole('heading').or(page.getByRole('textbox').first()).first()).toBeVisible()
  })

  // ギャラリー管理: ページが表示されること
  test('/admin/gallery — ギャラリー管理ページが表示される', async ({ page }) => {
    await page.goto('/admin/gallery')
    // ページ内に何らかの管理画面らしい要素が表示されること
    await expect(page.getByRole('heading').or(page.getByRole('button')).first()).toBeVisible()
  })

  // 商品管理: ページが表示されること
  test('/admin/products — 商品管理ページが表示される', async ({ page }) => {
    await page.goto('/admin/products')
    await expect(page.getByRole('heading').or(page.getByRole('button')).first()).toBeVisible()
  })

  // 注文管理: ページが表示されること（GET /api/orders → [] ハンドラー追加済み）
  test('/admin/orders — 注文管理ページが表示される', async ({ page }) => {
    await page.goto('/admin/orders')
    await expect(page.getByRole('heading').or(page.getByRole('button')).first()).toBeVisible()
  })

  // 予約管理: ページが表示されること（GET /api/reserves → [] ハンドラー追加済み）
  test('/admin/reservations — 予約管理ページが表示される', async ({ page }) => {
    await page.goto('/admin/reservations')
    await expect(page.getByRole('heading').or(page.getByRole('button')).first()).toBeVisible()
  })

  // お問い合わせ一覧: ページが表示されること（GET /api/contacts → [] ハンドラー追加済み）
  test('/admin/contacts — お問い合わせ一覧ページが表示される', async ({ page }) => {
    await page.goto('/admin/contacts')
    await expect(page.getByRole('heading').or(page.getByRole('button')).first()).toBeVisible()
  })

  // 取扱店管理: ページが表示されること
  test('/admin/stockists — 取扱店管理ページが表示される', async ({ page }) => {
    await page.goto('/admin/stockists')
    await expect(page.getByRole('heading').or(page.getByRole('button')).first()).toBeVisible()
  })

  // コラボレーション管理: ページが表示されること
  test('/admin/collaborations — コラボレーション管理ページが表示される', async ({ page }) => {
    await page.goto('/admin/collaborations')
    await expect(page.getByRole('heading').or(page.getByRole('button')).first()).toBeVisible()
  })

  // 記事管理: ページが表示されること（GET /api/articles → [] ハンドラー済み）
  test('/admin/articles — 記事管理ページが表示される', async ({ page }) => {
    await page.goto('/admin/articles')
    await expect(page.getByRole('heading').or(page.getByRole('button')).first()).toBeVisible()
  })

  // 収支一覧: ページが表示されること（GET /api/events/finances ハンドラー済み）
  test('/admin/finances — 収支一覧ページが表示される', async ({ page }) => {
    await page.goto('/admin/finances')
    await expect(page.getByRole('heading').or(page.getByRole('button')).first()).toBeVisible()
  })

  // ワークショップ集計: ページが表示されること
  test('/admin/ws-summary — ワークショップ集計ページが表示される', async ({ page }) => {
    await page.goto('/admin/ws-summary')
    await expect(page.getByRole('heading').or(page.getByRole('button')).first()).toBeVisible()
  })

  // 価格計算: ページが表示されること（GET /api/price-calc-entries・/api/pot-artists ハンドラー追加済み）
  test('/admin/price-calc — 価格計算ページが表示される', async ({ page }) => {
    await page.goto('/admin/price-calc')
    await expect(page.getByRole('heading').or(page.getByRole('button')).first()).toBeVisible()
  })
})
