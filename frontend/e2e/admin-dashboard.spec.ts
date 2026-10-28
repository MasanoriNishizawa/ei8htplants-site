import { test, expect, type Page } from '@playwright/test'

// 管理画面ダッシュボードの「出店料の支払い」「今後の搬入予定」と、サイドメニューでの「未保存の変更」の確認の画面テスト。
// VITE_MSW=true VITE_SKIP_ADMIN_AUTH=true（npm run mock:e2e）で実行する。本番には接続しない。
// モックの一覧は src/mocks/data.ts の MOCK_ADMIN_DASHBOARD。日付の表示が変わらないよう、ブラウザの時計を 2027-03-15 に固定する。
//   - mock-past-1（期限 2026-09-10・未払い）→ 期限切れ
//   - mock-upcoming-1（期限 2027-03-20・未払い・開始 2027-04-05）→ 期限間近（あと5日）・搬入予定に出る
//   - mock-upcoming-2（期限なし・未払い・開始 2027-05-15 ＝ 61日後）→ 期限未設定・搬入予定には出ない
//   - mock-no-time（支払い済み・開始 2027-06-01）→ どちらにも出ない

/**
 * 偽の管理者セッションを入れ、Supabase への通信を遮断する（admin-info-carry.spec.ts と同じ）
 * @param page - 対象ページ（goto より前に呼ぶ）
 * @returns なし。偽の管理者セッションを登録し、Supabase への通信を遮断する。
 */
async function useFakeAdminSession(page: Page) {
  await page.context().route(/supabase\.co/, (route) => route.abort())
  await page.addInitScript(() => {
    const fakeSession = {
      access_token: 'e2e-fake-access-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: 4102444800,
      refresh_token: 'e2e-fake-refresh-token',
      user: { id: 'e2e-admin', aud: 'authenticated', role: 'authenticated', email: 'e2e@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }
    const originalGetItem = Storage.prototype.getItem
    Storage.prototype.getItem = function (key: string) {
      if (/^sb-.+-auth-token$/.test(key)) return JSON.stringify(fakeSession)
      return originalGetItem.call(this, key)
    }
  })
}

/**
 * 横スクロールが出ていないかを確かめる（文書の幅が画面の幅を超えていない）
 * @param page - 対象ページ
 * @returns なし。横スクロールがないことを検証する。
 */
async function expectNoHorizontalScroll(page: Page) {
  // 文書全体と、管理画面で中身だけがスクロールする <main> の両方を確かめる
  const widths = await page.evaluate(() => {
    const main = document.querySelector('main')
    return {
      doc: [document.documentElement.scrollWidth, document.documentElement.clientWidth],
      main: main ? [main.scrollWidth, main.clientWidth] : [0, 0],
    }
  })
  expect(widths.doc[0]).toBeLessThanOrEqual(widths.doc[1])
  expect(widths.main[0]).toBeLessThanOrEqual(widths.main[1])
}

test.beforeEach(async ({ page }) => {
  await useFakeAdminSession(page)
})

test.describe('ダッシュボードの出店料の支払い・今後の搬入予定', () => {
  test.beforeEach(async ({ page }) => {
    // Date だけを 2027-03-15 10:00（日本時間）に固定する
    await page.clock.setFixedTime(new Date('2027-03-15T10:00:00+09:00'))
  })

  test('出店料の支払いは期限切れ→期限間近→期限未設定の順に並び、支払い済みは出ない', async ({ page }) => {
    // 1. 固定した日付でダッシュボードを開き、支払い一覧を読み込む
    await page.goto('/admin')
    const section = page.getByRole('region', { name: '出店料の支払い' })
    const rows = section.getByTestId('dashboard-payment-row')
    // 開発サーバーの最初の読み込みは遅いことがあるので長めに待つ
    await expect(rows).toHaveCount(3, { timeout: 20000 })
    // 2. 期限状態ごとの順序・表示内容と、支払い済みイベントの除外を確かめる
    await expect(rows.nth(0)).toHaveAttribute('data-due-status', 'overdue')
    await expect(rows.nth(0)).toContainText('Habitat Exhibition 2026')
    await expect(rows.nth(0)).toContainText('期限切れ')
    await expect(rows.nth(0)).toContainText('50,000')
    await expect(rows.nth(1)).toHaveAttribute('data-due-status', 'soon')
    await expect(rows.nth(1)).toContainText('Green Market 2027')
    await expect(rows.nth(1)).toContainText('期限間近')
    await expect(rows.nth(1)).toContainText('あと5日')
    await expect(rows.nth(2)).toHaveAttribute('data-due-status', 'none')
    await expect(rows.nth(2)).toContainText('HUE POP-UP at Spiral')
    await expect(rows.nth(2)).toContainText('期限未設定')
    await expect(section).not.toContainText('time 未設定のイベント')
  })

  test('今後の搬入予定は今日から60日以内に始まるイベントだけが出る', async ({ page }) => {
    // 1. 固定日付のダッシュボードを開き、搬入予定を読み込む
    await page.goto('/admin')
    const section = page.getByRole('region', { name: '今後の搬入予定' })
    const rows = section.getByTestId('dashboard-carry-in-row')
    await expect(rows).toHaveCount(1)
    // 2. 60日以内の予定の詳細と、範囲外・終了済みイベントの除外を確かめる
    await expect(rows.first()).toContainText('Green Market 2027')
    await expect(rows.first()).toContainText('代々木公園 イベント広場')
    await expect(rows.first()).toContainText('2027年4月5日（月） 08:00')
    await expect(rows.first()).toContainText('ホテル代々木')
    // 61日後に始まるイベント・終了済みのイベントは出ない
    await expect(section).not.toContainText('HUE POP-UP at Spiral')
    await expect(section).not.toContainText('Habitat Exhibition 2026')
  })

  test('行を押すと管理情報の確認画面に移り、戻るリンクでダッシュボードに戻れる', async ({ page }) => {
    // 1. ダッシュボードの支払い行から対象イベントを開く
    await page.goto('/admin')
    await page.getByRole('region', { name: '出店料の支払い' }).getByTestId('dashboard-payment-row').first().click()
    // 2. 管理情報画面の戻るリンクがダッシュボードを指し、戻れることを確かめる
    await expect(page).toHaveURL(/\/admin\/events\/mock-past-1\/admin-info$/)
    // state.from に /admin が渡っているので「← 戻る」はダッシュボードへ戻る（無ければイベント一覧へ戻る）
    const back = page.getByRole('link', { name: '← 戻る' })
    await expect(back).toHaveAttribute('href', '/admin')
    await back.click()
    await expect(page).toHaveURL(/\/admin$/)
    await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible()
  })

  // 一覧の読み込みに失敗したときの表示は Vitest（Dashboard.test.tsx）で確かめる。
  // API は MSW のサービスワーカーが応答するため、page.route では 500 に差し替えられない

  test('375px 幅でもダッシュボードに横スクロールが出ない', async ({ page }) => {
    // 1. 375px の表示幅でダッシュボードを開く
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/admin')
    await expect(page.getByTestId('dashboard-payment-row')).toHaveCount(3)
    // 2. 一覧件数・横幅・各行の画面内配置を確認する
    await expect(page.getByTestId('dashboard-carry-in-row')).toHaveCount(1)
    await expectNoHorizontalScroll(page)
    // 各行が画面の幅に収まっている
    for (const row of await page.getByTestId('dashboard-payment-row').all()) {
      const box = await row.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.x + box!.width).toBeLessThanOrEqual(375)
    }
  })
})

test.describe('サイドメニューでの未保存の変更の確認', () => {
  /**
   * 管理情報の編集画面を開き、ホテル名を入力して未保存の状態にする
   * @param page - 対象の管理画面ページ
   * @returns なし。未保存の変更がある編集画面を用意する。
   */
  async function openDirtyEditor(page: Page) {
    await page.goto('/admin/events/mock-past-1/admin-info/edit')
    await expect(page.getByText('搬入日時')).toBeVisible({ timeout: 20000 })
    await page.locator('input[type="date"]').first().fill('2099-01-02')
  }

  test('未保存でサイドメニューの別の画面を押し、キャンセルすると移動しない', async ({ page }) => {
    // 1. 編集画面に未保存変更を作り、移動確認をキャンセルする
    await openDirtyEditor(page)
    const messages: string[] = []
    page.once('dialog', async (d) => { messages.push(d.message()); await d.dismiss() })
    await page.getByRole('complementary').getByRole('link', { name: 'ギャラリー' }).click()
    // 2. 確認文言・URL・入力値が保たれたことを確かめる
    await expect.poll(() => messages).toEqual(['保存していない変更があります。破棄して移動しますか？'])
    await expect(page).toHaveURL(/\/admin\/events\/mock-past-1\/admin-info\/edit$/)
    await expect(page.locator('input[type="date"]').first()).toHaveValue('2099-01-02')
  })

  test('未保存でサイドメニューの別の画面を押し、OK すると移動する', async ({ page }) => {
    // 1. 編集画面に未保存変更を作り、移動確認を承認する
    await openDirtyEditor(page)
    page.once('dialog', (d) => d.accept())
    // 2. 確認後にギャラリーへ移動することを確かめる
    await page.getByRole('complementary').getByRole('link', { name: 'ギャラリー' }).click()
    await expect(page).toHaveURL(/\/admin\/gallery$/)
  })

  test('未保存の変更が無ければ確認なしで移動する', async ({ page }) => {
    // 1. 変更を加えず編集画面を開き、確認ダイアログを監視する
    await page.goto('/admin/events/mock-past-1/admin-info/edit')
    await expect(page.getByText('搬入日時')).toBeVisible({ timeout: 20000 })
    let dialogs = 0
    page.on('dialog', async (d) => { dialogs++; await d.dismiss() })
    // 2. サイドメニューから移動でき、ダイアログが発生しないことを確認する
    await page.getByRole('complementary').getByRole('link', { name: 'ギャラリー' }).click()
    await expect(page).toHaveURL(/\/admin\/gallery$/)
    expect(dialogs).toBe(0)
  })

  test('375px 幅のメニュー（ドロワー）でも未保存ならキャンセルで移動しない', async ({ page }) => {
    // 1. 375px 幅で未保存変更を作り、ドロワーを開く
    await page.setViewportSize({ width: 375, height: 812 })
    await openDirtyEditor(page)
    // モバイルのヘッダーにあるメニューボタンでドロワーを開く
    await page.getByRole('button', { name: 'メニューを開く' }).click()
    // 閉じたドロワーは非表示でアクセシビリティツリーから外れるので、要素そのものを指す
    const aside = page.locator('aside')
    await expect(aside).toHaveClass(/drawer-open/)
    page.once('dialog', (d) => d.dismiss())
    await aside.getByRole('link', { name: 'ギャラリー' }).click()
    await expect(page).toHaveURL(/\/admin\/events\/mock-past-1\/admin-info\/edit$/)
    // キャンセルしたときはメニューも開いたまま
    await expect(aside).toHaveClass(/drawer-open/)
    await expectNoHorizontalScroll(page)
    // OK すると移動してメニューが閉じる
    page.once('dialog', (d) => d.accept())
    await aside.getByRole('link', { name: 'ギャラリー' }).click()
    await expect(page).toHaveURL(/\/admin\/gallery$/)
    await expect(aside).not.toHaveClass(/drawer-open/)
  })
})
