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

  test('/admin — スマートフォン幅でも開けてメニューから移動できる', async ({ page }) => {
    // 1. スマートフォン幅でダッシュボードを開き、メニューを展開する
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'メニューを開く' })).toBeVisible()

    // 2. ドロワーからギャラリーへ移動し、遷移先の表示を確かめる
    await page.getByRole('button', { name: 'メニューを開く' }).click()
    await expect(page.locator('.admin-sidebar')).toBeVisible()
    await page.locator('.admin-sidebar').getByRole('link', { name: 'ギャラリー', exact: true }).click()
    await expect(page).toHaveURL(/\/admin\/gallery$/)
    await expect(page.getByRole('heading').first()).toBeVisible()
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
    // 1. 「/admin/products — 商品管理ページが表示される」の期待状態が画面に表示されることを確認する。
    await page.goto('/admin/products')
    await expect(page.getByRole('heading').or(page.getByRole('button')).first()).toBeVisible()
  })

  // 注文管理: ページが表示されること（GET /api/orders → [] ハンドラー追加済み）
  test('/admin/orders — 注文管理ページが表示される', async ({ page }) => {
    // 1. 「/admin/orders — 注文管理ページが表示される」の期待状態が画面に表示されることを確認する。
    await page.goto('/admin/orders')
    await expect(page.getByRole('heading').or(page.getByRole('button')).first()).toBeVisible()
  })

  // 予約管理: ページが表示されること（GET /api/reserves → [] ハンドラー追加済み）
  test('/admin/reservations — 予約管理ページが表示される', async ({ page }) => {
    // 1. 「/admin/reservations — 予約管理ページが表示される」の期待状態が画面に表示されることを確認する。
    await page.goto('/admin/reservations')
    await expect(page.getByRole('heading').or(page.getByRole('button')).first()).toBeVisible()
  })

  // お問い合わせ一覧: ページが表示されること（GET /api/contacts → [] ハンドラー追加済み）
  test('/admin/contacts — お問い合わせ一覧ページが表示される', async ({ page }) => {
    // 1. 「/admin/contacts — お問い合わせ一覧ページが表示される」の期待状態が画面に表示されることを確認する。
    await page.goto('/admin/contacts')
    await expect(page.getByRole('heading').or(page.getByRole('button')).first()).toBeVisible()
  })

  // 取扱店管理: ページが表示されること
  test('/admin/stockists — 取扱店管理ページが表示される', async ({ page }) => {
    // 1. 「/admin/stockists — 取扱店管理ページが表示される」の期待状態が画面に表示されることを確認する。
    await page.goto('/admin/stockists')
    await expect(page.getByRole('heading').or(page.getByRole('button')).first()).toBeVisible()
  })

  // コラボレーション管理: ページが表示されること
  test('/admin/collaborations — コラボレーション管理ページが表示される', async ({ page }) => {
    // 1. 「/admin/collaborations — コラボレーション管理ページが表示される」の期待状態が画面に表示されることを確認する。
    await page.goto('/admin/collaborations')
    await expect(page.getByRole('heading').or(page.getByRole('button')).first()).toBeVisible()
  })

  // 記事管理: ページが表示されること（GET /api/articles → [] ハンドラー済み）
  test('/admin/articles — 記事管理ページが表示される', async ({ page }) => {
    // 1. 「/admin/articles — 記事管理ページが表示される」の期待状態が画面に表示されることを確認する。
    await page.goto('/admin/articles')
    await expect(page.getByRole('heading').or(page.getByRole('button')).first()).toBeVisible()
  })

  // 収支一覧: ページが表示されること（GET /api/events/finances ハンドラー済み）
  test('/admin/finances — 収支一覧ページが表示される', async ({ page }) => {
    // 1. 「/admin/finances — 収支一覧ページが表示される」の期待状態が画面に表示されることを確認する。
    await page.goto('/admin/finances')
    await expect(page.getByRole('heading').or(page.getByRole('button')).first()).toBeVisible()
  })

  // ワークショップ集計: ページが表示されること
  test('/admin/ws-summary — ワークショップ集計ページが表示される', async ({ page }) => {
    // 1. 「/admin/ws-summary — ワークショップ集計ページが表示される」の期待状態が画面に表示されることを確認する。
    await page.goto('/admin/ws-summary')
    await expect(page.getByRole('heading').or(page.getByRole('button')).first()).toBeVisible()
  })

  // 価格計算: ページが表示されること（GET /api/price-calc-entries・/api/pot-artists ハンドラー追加済み）
  test('/admin/price-calc — 価格計算ページが表示される', async ({ page }) => {
    // 1. 「/admin/price-calc — 価格計算ページが表示される」の期待状態が画面に表示されることを確認する。
    await page.goto('/admin/price-calc')
    await expect(page.getByRole('heading').or(page.getByRole('button')).first()).toBeVisible()
  })
})

// 認証つき API（authRequest）がダミートークンで MSW まで届き、モックのデータが画面に出ることの確認
// VITE_SKIP_ADMIN_AUTH=true の開発サーバーでは、Supabase のセッションが無くても lib/devAuth.ts のダミートークンを付けて送る。
// 以前は authRequest が fetch の前に 401 を投げていたため、イベント一覧が「予定なし」・ダッシュボードの数が「-」になっていた
test.describe('管理画面: 認証つき API がモックまで届く', () => {
  // イベント一覧は events.list と reserve.list（authRequest）を Promise.all でまとめて読むため、
  // reserve.list が 401 になると一覧全体が空になる。モックのイベント名が出ていれば MSW まで届いている
  test('/admin/events — モックの今後・過去のイベント名が一覧に表示される', async ({ page }) => {
    await page.goto('/admin/events')
    // 今後のイベント（src/mocks/data.ts の MOCK_EVENTS）
    await expect(page.getByText('Green Market 2027').first()).toBeVisible()
    await expect(page.getByText('HUE POP-UP at Spiral').first()).toBeVisible()
    // 過去のイベント（MOCK_PAST_EVENTS）
    await expect(page.getByText('Habitat Exhibition 2026').first()).toBeVisible()
    // 「予定なし」は出ていない
    await expect(page.getByText('予定なし')).toHaveCount(0)
  })

  // ダッシュボードの統計（api.stats）は contacts・orders（authRequest）を含むため、401 だと全項目が「-」のまま
  test('/admin — ダッシュボードの「公開中のイベント」にモックの件数（3）が表示される', async ({ page }) => {
    await page.goto('/admin')
    // 統計カード（リンク）の中に件数とラベルが並ぶ
    const card = page.getByRole('link', { name: /公開中のイベント/ })
    await expect(card).toContainText('3')
    // お問い合わせ・注文のモックは空配列なので 0 件になる（「-」ではない）
    await expect(page.getByRole('link', { name: /未読お問い合わせ/ })).toContainText('0')
    await expect(page.getByRole('link', { name: /未発送の注文/ })).toContainText('0')
  })
})
