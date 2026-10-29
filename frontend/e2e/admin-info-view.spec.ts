import { test, expect, type Page, type Locator } from '@playwright/test'

// 管理情報の確認画面（/admin/events/:id/admin-info）と編集画面（/admin-info/edit）の行き来の画面テスト
// 流れ: イベント一覧 →「管理情報」→ 確認画面 →「編集」→ 編集画面 → 保存 → 確認画面（「保存しました」）→「← 戻る」→ イベント一覧
// VITE_MSW=true VITE_SKIP_ADMIN_AUTH=true（npm run mock:e2e）で実行する。本番には接続しない
// 認証まわりの前提は event-images.spec.ts と同じ（偽セッションを入れ、Supabase への通信は遮断する）
// モックデータ: mock-past-1（Habitat Exhibition 2026）は出店要項（文章 + 画像3枚）だけを持ち、ほかの項目は未入力
//               mock-upcoming-2 は管理情報が未入力（{}）

/** スクリーンショットの保存先（PM が見た目を確認するための一時フォルダ。frontend/test-results には置かない） */
const SCREENSHOT_DIR = '/private/tmp/claude-501/-Users-nishizawamasanori-Documents-workspace-ei8htplants-site/7b998fee-324a-432a-a620-20e5d8e16d18/scratchpad'

/** 対象イベントの ID（出店要項のモックがある） */
const EVENT_ID = 'mock-past-1'
/** 対象イベントの名前 */
const EVENT_NAME = 'Habitat Exhibition 2026'
/** 管理情報が未入力のイベントの ID */
const EMPTY_EVENT_ID = 'mock-upcoming-2'
/** ブラウザの「今日」として固定する日時（支払い期限の「期限切れ」表示を安定させるため） */
const FIXED_NOW = new Date('2026-10-16T12:00:00+09:00')

/**
 * 偽の管理者セッションを入れ、Supabase への通信を遮断する
 * @param page - 対象ページ（goto より前に呼ぶ）
 * @returns なし。偽の管理者セッションを登録し、Supabase への通信を遮断する。
 */

async function useFakeAdminSession(page: Page) {
  // 1. Supabase（認証・DB）への通信をすべて遮断する
  await page.context().route(/supabase\.co/, (route) => route.abort())
  // 2. localStorage の Supabase セッションキーだけ、有効期限の遠い偽セッションを返す
  await page.addInitScript(() => {
    const fakeSession = {
      access_token: 'e2e-fake-access-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: 4102444800,
      refresh_token: 'e2e-fake-refresh-token',
      user: { id: 'e2e-admin', aud: 'authenticated', role: 'authenticated', email: 'e2e@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }
    // テスト用セッション以外の localStorage 読み取りに使う元の getItem 関数。
    const originalGetItem = Storage.prototype.getItem
    /**
     * Supabase の認証トークンだけをテスト用セッションに差し替える。
     * @param key - localStorage から取得するキー
     * @returns 認証キーなら偽セッションの JSON、それ以外なら元の値
     */
    Storage.prototype.getItem = function (key: string) {
      if (/^sb-.+-auth-token$/.test(key)) return JSON.stringify(fakeSession)
      return originalGetItem.call(this, key)
    }
  })
}

/**
 * 横スクロールが出ていないことを確かめる（document・body・管理画面の main の3つ）
 * @param page - 対象ページ
 * @returns なし。横スクロールがないことを検証する。
 */

async function expectNoHorizontalScroll(page: Page) {
  const sizes = await page.evaluate(() => {
    // 管理画面内で独立してスクロールする main 要素。
    const main = document.querySelector('main')
    return {
      docScroll: document.documentElement.scrollWidth,
      bodyScroll: document.body.scrollWidth,
      inner: window.innerWidth,
      mainScroll: main?.scrollWidth ?? 0,
      mainClient: main?.clientWidth ?? 0,
    }
  })
  expect(sizes.docScroll, `document の scrollWidth=${sizes.docScroll} / innerWidth=${sizes.inner}`).toBeLessThanOrEqual(sizes.inner)
  expect(sizes.bodyScroll, `body の scrollWidth=${sizes.bodyScroll} / innerWidth=${sizes.inner}`).toBeLessThanOrEqual(sizes.inner)
  expect(sizes.mainScroll, `main の scrollWidth=${sizes.mainScroll} / clientWidth=${sizes.mainClient}`).toBeLessThanOrEqual(sizes.mainClient)
}

/**
 * 要素が画面の横幅の内側に収まっていることを確かめる
 * @param page - 対象ページ
 * @param locator - 対象の要素
 * @param label - 失敗時のメッセージに出す要素名
 * @returns なし。要素が画面の横幅内に収まることを検証する。
 */

async function expectWithinViewportX(page: Page, locator: Locator, label: string) {
  await locator.scrollIntoViewIfNeeded()
  // 対象 Locator の画面上の位置と寸法。
  const box = await locator.boundingBox()
  // 現在のビューポートの横幅（px）。
  const width = page.viewportSize()!.width
  expect(box, `${label} が表示されていない`).not.toBeNull()
  expect(box!.x, `${label} の左端 x=${box!.x}`).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width, `${label} の右端 ${box!.x + box!.width} / 画面幅 ${width}`).toBeLessThanOrEqual(width)
}

/**
 * 確認画面の「ラベル: 値」の行を取り出す（ラベルの親要素＝行）
 * 「出店料」はセクション見出しにもあるため、行ラベルである最後の一致を使う
 * @param page - 対象ページ
 * @param label - 行のラベル
 * @returns 確認画面で指定したラベルを持つ行の Locator。
 */

function viewRow(page: Page, label: string): Locator {
  return page.getByText(label, { exact: true }).last().locator('..')
}

/**
 * 編集画面のラベルの文字から、同じ欄の入力要素（input / select）を取り出す
 * @param page - 対象ページ
 * @param label - ラベルの文字（完全一致）
 * @param tag - 取り出す要素（input または select）
 * @returns 指定したラベルに対応する input または select の Locator。
 */

function editField(page: Page, label: string, tag: 'input' | 'select' = 'input'): Locator {
  return page.locator('label').filter({ hasText: new RegExp(`^${label}$`) }).locator('..').locator(tag)
}

/**
 * 編集画面で管理情報の全項目を入力して保存し、確認画面に戻るまで待つ
 * （スクリーンショット用に、確認画面のすべてのカードに値が入った状態を作る）
 * @param page - 編集画面を開いたページ
 * @returns なし。管理情報を入力して保存し、確認画面を表示する。
 */

async function fillAllAndSave(page: Page) {
  // 1. 搬入・搬出の日付・時・分
  const dates = page.locator('input[type="date"]')
  await dates.nth(0).fill('2026-10-24')
  await dates.nth(0).locator('xpath=..').locator('select').nth(0).selectOption('09')
  await dates.nth(0).locator('xpath=..').locator('select').nth(1).selectOption('00')
  await dates.nth(1).fill('2026-10-25')
  await dates.nth(1).locator('xpath=..').locator('select').nth(0).selectOption('18')
  await dates.nth(1).locator('xpath=..').locator('select').nth(1).selectOption('30')
  // 2. 宿泊・出店料（期限は固定した今日より前にして「期限切れ」を出す）
  await editField(page, 'ホテル名').fill('ホテル確認テスト')
  await editField(page, '宿泊料金').fill('8000')
  await editField(page, '出店料').fill('14000')
  await editField(page, '支払い方法', 'select').selectOption('事前振込')
  await editField(page, '支払い期限').fill('2026-10-10')
  // 3. メモ（改行あり）
  await page.locator('textarea').last().fill('台車を持参する\n駐車場は会場裏')
  // 4. 保存して確認画面に戻るのを待つ
  await page.getByRole('button', { name: '保存する' }).click()
  await expect(page).toHaveURL(new RegExp(`/admin/events/${EVENT_ID}/admin-info$`))
}

/**
 * 確認画面のスクリーンショットを2枚保存する（1枚目: 開いたときに見える範囲、2枚目: 下まで全部）
 * 管理画面は main 要素の中だけがスクロールするため fullPage では下が写らない。
 * 2枚目は一時的に画面の高さを main の中身の高さまで広げて撮り、撮ったら元の大きさに戻す
 * @param page - 対象ページ
 * @param name - ファイル名（拡張子なし）
 * @returns なし。指定名の画面キャプチャを保存する。
 */

async function saveScreenshots(page: Page, name: string) {
  // 1. 開いたときに見える範囲
  await page.evaluate(() => document.querySelector('main')?.scrollTo(0, 0))
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png` })
  // 2. main の中身の高さまで画面を伸ばして全体を撮る
  const original = page.viewportSize()!
  const extra = await page.evaluate(() => {
    const main = document.querySelector('main')
    return main ? main.scrollHeight - main.clientHeight : 0
  })
  await page.setViewportSize({ width: original.width, height: original.height + Math.max(0, extra) })
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}-full.png`, fullPage: true })
  await page.setViewportSize(original)
}

test.beforeEach(async ({ page }) => {
  await useFakeAdminSession(page)
  // ブラウザの今日を固定する（タイマーは止めないので「保存しました」の 3 秒後の消去はそのまま動く）
  await page.clock.setFixedTime(FIXED_NOW)
})

test.describe('管理情報 — 確認画面と編集画面の行き来', () => {
  test('一覧 →「管理情報」→ 確認画面 →「編集」→ 保存 → 確認画面に「保存しました」と新しい値 →「← 戻る」で一覧に戻る', /**
     * 「/admin/events」を開く、「管理情報」をクリックする、「編集」をクリックする、「管理情報」が画面に表示されること、「要項の画像（3 枚）」が画面に表示されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. イベント一覧から対象イベントの「管理情報」を押す
    await page.goto('/admin/events')
    const listRow = page.getByText(EVENT_NAME, { exact: true }).locator('../..')
    await listRow.getByRole('link', { name: '管理情報' }).click()

    // 2. 確認画面が開き、見出し・イベント名・まだ入力していない項目の「未入力」・出店要項が表示される
    await expect(page).toHaveURL(new RegExp(`/admin/events/${EVENT_ID}/admin-info$`))
    await expect(page.getByRole('heading', { name: '管理情報' })).toBeVisible()
    await expect(page.getByText(new RegExp(`${EVENT_NAME} —`))).toBeVisible()
    await expect(viewRow(page, 'ホテル名')).toContainText('未入力')
    await expect(page.getByText('要項の画像（3 枚）')).toBeVisible()
    // 入力欄は無く、編集ボタンが上下2か所にある
    await expect(page.getByRole('button', { name: '保存する' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: '編集' })).toHaveCount(2)

    // 3. 「編集」で編集画面へ
    await page.getByRole('link', { name: '編集' }).first().click()
    await expect(page).toHaveURL(new RegExp(`/admin/events/${EVENT_ID}/admin-info/edit$`))
    await expect(page.getByRole('button', { name: '保存する' })).toBeVisible()

    // 4. ホテル名・宿泊料金・出店料を変えて保存する
    await editField(page, 'ホテル名').fill('E2E確認ホテル')
    await editField(page, '宿泊料金').fill('9500')
    await editField(page, '出店料').fill('1234567')
    await page.getByRole('button', { name: '保存する' }).click()

    // 5. 確認画面に戻り「保存しました」と新しい値が表示される
    await expect(page).toHaveURL(new RegExp(`/admin/events/${EVENT_ID}/admin-info$`))
    await expect(page.getByRole('status')).toHaveText('保存しました')
    await expect(viewRow(page, 'ホテル名')).toContainText('E2E確認ホテル')
    await expect(viewRow(page, '宿泊料金')).toContainText('9,500円')
    await expect(viewRow(page, '出店料')).toContainText('1,234,567円')
    // 出店料を入れたので支払い状況は「未払い」
    await expect(viewRow(page, '支払い状況')).toContainText('未払い')

    // 6. 「保存しました」は3秒ほどで消える
    await expect(page.getByRole('status')).toBeHidden({ timeout: 6000 })

    // 7. 「← 戻る」でイベント一覧に戻る（一覧から来たときの from が保存後も引き継がれている）
    await page.getByRole('link', { name: '← 戻る' }).click()
    await expect(page).toHaveURL(/\/admin\/events$/)
    await expect(page.getByText(EVENT_NAME, { exact: true })).toBeVisible()
  })

  test('編集画面の「← 戻る」は保存せずに確認画面へ戻り、確認画面の「← 戻る」は一覧へ戻る', /**
     * 「/admin/events」を開く、「管理情報」をクリックする、「編集」をクリックする、「未保存の変更があります」が画面に表示されること、URLが「\/admin\/events$」になることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 一覧 → 確認画面 → 編集画面
    await page.goto('/admin/events')
    await page.getByText(EVENT_NAME, { exact: true }).locator('../..').getByRole('link', { name: '管理情報' }).click()
    // 確認画面に移ってから「編集」を押す（一覧の各行にも「編集」があるので、移る前に押すと別の画面へ行く）
    await expect(page).toHaveURL(new RegExp(`/admin/events/${EVENT_ID}/admin-info$`))
    await page.getByRole('link', { name: '編集' }).last().click()
    await expect(page).toHaveURL(new RegExp(`/admin-info/edit$`))

    // 2. ホテル名を入れても保存せずに「← 戻る」。未保存の確認ダイアログは OK（破棄して戻る）にする
    await editField(page, 'ホテル名').fill('保存しないホテル')
    await expect(page.getByText('未保存の変更があります')).toBeVisible()
    /** 表示された確認ダイアログの文言 */
    let dialogMessage = ''
    page.once('dialog', (d) => { dialogMessage = d.message(); void d.accept() })
    await page.getByRole('link', { name: '← 戻る' }).click()
    await expect.poll(() => dialogMessage).toBe('保存していない変更があります。破棄して移動しますか？')

    // 3. 確認画面に戻り、「保存しました」は出ず、値も変わっていない
    await expect(page).toHaveURL(new RegExp(`/admin/events/${EVENT_ID}/admin-info$`))
    await expect(viewRow(page, 'ホテル名')).toContainText('未入力')
    await expect(page.getByRole('status')).toHaveCount(0)

    // 4. 確認画面の「← 戻る」で一覧へ
    await page.getByRole('link', { name: '← 戻る' }).click()
    await expect(page).toHaveURL(/\/admin\/events$/)
  })

  test('未保存の変更があるとき「← 戻る」の確認ダイアログでキャンセルすると編集画面に留まり、入力も残る', /**
     * 「/admin/events/…/admin-info/edit」を開く、「要項の文章」へ入力する、「← 戻る」をクリックする、「要項の画像（3 枚）」が画面に表示されること、要項の文章を編集して戻る操作を行い、要項画像と未保存確認が表示されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    await page.goto(`/admin/events/${EVENT_ID}/admin-info/edit`)
    await expect(page.getByText('要項の画像（3 枚）')).toBeVisible()
    // 1. 変更なしでは「未保存の変更があります」は出ない
    await expect(page.getByText('未保存の変更があります')).toHaveCount(0)

    // 2. 要項の文章だけを変えると出る
    await page.getByLabel('要項の文章').fill('文章だけ変更')
    await expect(page.getByText('未保存の変更があります')).toBeVisible()

    // 3. 「← 戻る」の確認でキャンセル → 編集画面に留まる
    let dialogMessage = ''
    page.once('dialog', (d) => { dialogMessage = d.message(); void d.dismiss() })
    await page.getByRole('link', { name: '← 戻る' }).click()
    await expect.poll(() => dialogMessage).toBe('保存していない変更があります。破棄して移動しますか？')
    await expect(page).toHaveURL(new RegExp(`/admin/events/${EVENT_ID}/admin-info/edit$`))
    await expect(page.getByLabel('要項の文章')).toHaveValue('文章だけ変更')
  })

  test('変更が無いとき編集画面の「← 戻る」は確認ダイアログを出さずに確認画面へ戻る', /**
     * 「/admin/events/…/admin-info/edit」を開く、「← 戻る」をクリックする、「要項の画像（3 枚）」が画面に表示されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 未変更の編集画面を開き、確認ダイアログを監視する
    await page.goto(`/admin/events/${EVENT_ID}/admin-info/edit`)
    await expect(page.getByText('要項の画像（3 枚）')).toBeVisible()
    /** ダイアログが出たかどうか */
    let dialogShown = false
    page.on('dialog', (d) => { dialogShown = true; void d.dismiss() })
    // 2. 確認なしで確認画面に戻ることを確かめる
    await page.getByRole('link', { name: '← 戻る' }).click()
    await expect(page).toHaveURL(new RegExp(`/admin/events/${EVENT_ID}/admin-info$`))
    expect(dialogShown).toBe(false)
  })

  test('保存後にブラウザの「戻る」を押しても編集画面には戻らず、確認画面 → イベント一覧の順に戻る（保存後の遷移が replace）', /**
     * 「/admin/events」を開く、「管理情報」をクリックする、「編集」をクリックする、イベント一覧から管理情報の確認・編集画面へ進み、保存後に確認画面へ戻ることを確かめる。ブラウザの戻る操作では編集画面を再表示せず、イベント一覧へ戻ることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 一覧 → 確認画面 →「編集」→ 編集画面
    await page.goto('/admin/events')
    await page.getByText(EVENT_NAME, { exact: true }).locator('../..').getByRole('link', { name: '管理情報' }).click()
    await expect(page).toHaveURL(new RegExp(`/admin/events/${EVENT_ID}/admin-info$`))
    await page.getByRole('link', { name: '編集' }).first().click()
    await expect(page).toHaveURL(new RegExp(`/admin-info/edit$`))

    // 2. 値を変えて保存 → 確認画面
    await editField(page, 'ホテル名').fill('戻る確認ホテル')
    await page.getByRole('button', { name: '保存する' }).click()
    await expect(page.getByRole('status')).toHaveText('保存しました')

    // 3. ブラウザの戻る → 編集画面ではなく確認画面（保存した値が出ている）
    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`/admin/events/${EVENT_ID}/admin-info$`))
    await expect(page.getByRole('button', { name: '保存する' })).toHaveCount(0)
    await expect(viewRow(page, 'ホテル名')).toContainText('戻る確認ホテル')

    // 4. もう一度戻る → イベント一覧
    await page.goBack()
    await expect(page).toHaveURL(/\/admin\/events$/)
    await expect(page.getByText(EVENT_NAME, { exact: true })).toBeVisible()
  })

  test('編集画面の「← 戻る」の後にブラウザの「戻る」を押しても編集画面には戻らない（「← 戻る」が replace）。確認画面の「編集」は push なので戻ると確認画面', /**
     * 「/admin/events」を開く、「管理情報」をクリックする、「編集」をクリックする、「保存する」が画面に表示されること、管理情報の編集画面へ移動し、保存ボタンが表示されていることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 一覧 → 確認画面 →「編集」
    await page.goto('/admin/events')
    await page.getByText(EVENT_NAME, { exact: true }).locator('../..').getByRole('link', { name: '管理情報' }).click()
    // 確認画面に移ってから「編集」を押す（一覧の各行にも「編集」があるので、移る前に押すと別の画面へ行く）
    await expect(page).toHaveURL(new RegExp(`/admin/events/${EVENT_ID}/admin-info$`))
    await page.getByRole('link', { name: '編集' }).first().click()
    await expect(page).toHaveURL(new RegExp(`/admin-info/edit$`))

    // 2. 「編集」は push なので、ブラウザの戻るで確認画面へ戻り、進むで編集画面に戻れる
    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`/admin/events/${EVENT_ID}/admin-info$`))
    await page.goForward()
    await expect(page).toHaveURL(new RegExp(`/admin-info/edit$`))
    await expect(page.getByRole('button', { name: '保存する' })).toBeVisible()

    // 3. 変更せずに「← 戻る」→ 確認画面。ブラウザの戻るで編集画面ではなく確認画面 → 一覧
    await page.getByRole('link', { name: '← 戻る' }).click()
    await expect(page).toHaveURL(new RegExp(`/admin/events/${EVENT_ID}/admin-info$`))
    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`/admin/events/${EVENT_ID}/admin-info$`))
    await expect(page.getByRole('button', { name: '保存する' })).toHaveCount(0)
    await page.goBack()
    await expect(page).toHaveURL(/\/admin\/events$/)
  })

  test('管理情報の出店料が未入力のとき、確認画面は収支の出店料（モック 50,000円）を「（収支から）」付きで表示し、収支 0 の宿泊料金は「未入力」', /**
     イベントの管理情報画面を開き、出店料に収支由来の50,000円、宿泊料金に「未入力」、支払い状況に「未払い」を表示することを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 管理情報の確認画面を開き、収支から補われる出店料と未入力の宿泊料金を確認する。
    // MSW の mock-past-1 の収支は booth_fee: 50000・accommodation: 0、管理情報は出店要項だけ
    await page.goto(`/admin/events/${EVENT_ID}/admin-info`)
    await expect(viewRow(page, '出店料')).toContainText('50,000円（収支から）')
    await expect(viewRow(page, '宿泊料金')).toContainText('未入力')
    // 補った出店料があるので支払い状況は「未払い」
    await expect(viewRow(page, '支払い状況')).toContainText('未払い')
  })

  test('URL を直接開いた（遷移元なし）確認画面の「← 戻る」はイベント一覧へ戻る', /**
     * 「/admin/events/…/admin-info」を開く、管理情報確認ページを直接開き、「戻る」がイベント一覧へ遷移することを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 遷移元なしで管理情報確認URLを開き、「← 戻る」を押すとイベント一覧へ戻ることを確認する。
    await page.goto(`/admin/events/${EVENT_ID}/admin-info`)
    await expect(page.getByRole('link', { name: '← 戻る' })).toHaveAttribute('href', '/admin/events')
  })

  test('保存後に再読み込みしても「保存しました」は出ない（履歴から saved が消えている）', /**
     * 「/admin/events/…/admin-info/edit」を開く、入力欄へ値を入力する、「保存する」をクリックする、「管理情報」が画面に表示されること、「要項の画像（3 枚）」が画面に表示されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 編集画面から保存して確認画面へ
    await page.goto(`/admin/events/${EVENT_ID}/admin-info/edit`)
    await editField(page, 'ホテル名').fill('再読み込み確認')
    await page.getByRole('button', { name: '保存する' }).click()
    await expect(page.getByRole('status')).toHaveText('保存しました')

    // 2. 再読み込みすると「保存しました」は出ない
    await page.reload()
    await expect(page.getByRole('heading', { name: '管理情報' })).toBeVisible()
    await expect(page.getByText('要項の画像（3 枚）')).toBeVisible()
    await expect(page.getByRole('status')).toHaveCount(0)
  })

  test('全項目を入力して保存すると、搬入・搬出（曜日つき）・金額・支払い方法・期限・「期限切れ」・メモが確認画面に表示される', /**
     * 「/admin/events/…/admin-info/edit」を開く、「搬入日時」が画面に表示されること、「台車を持参する」に「台車を持参する
駐車場は会場裏」が表示されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 管理情報の編集画面を開き、全項目を入力して保存する
    await page.goto(`/admin/events/${EVENT_ID}/admin-info/edit`)
    await expect(page.getByText('搬入日時')).toBeVisible()
    await fillAllAndSave(page)

    // 2. 保存後の確認画面で、日時・金額・支払い状態・メモを検証する
    await expect(viewRow(page, '搬入日時')).toContainText('2026年10月24日（土） 09:00')
    await expect(viewRow(page, '搬出日時')).toContainText('2026年10月25日（日） 18:30')
    await expect(viewRow(page, 'ホテル名')).toContainText('ホテル確認テスト')
    await expect(viewRow(page, '宿泊料金')).toContainText('8,000円')
    await expect(viewRow(page, '出店料')).toContainText('14,000円')
    await expect(viewRow(page, '支払い方法')).toContainText('事前振込')
    await expect(viewRow(page, '支払い期限')).toContainText('2026年10月10日（土）')
    // 今日（10/16 固定）は期限（10/10）を過ぎていて未払いなので「未払い」と「期限切れ」
    await expect(viewRow(page, '支払い状況')).toContainText('未払い')
    await expect(viewRow(page, '支払い状況')).toContainText('期限切れ')
    // メモは改行がそのまま残る
    await expect(page.getByText(/台車を持参する/)).toHaveText('台車を持参する\n駐車場は会場裏')
  })

  test('管理情報が未入力のイベントの確認画面では「まだ管理情報が登録されていません」が出る', /**
     * 「/admin/events/…/admin-info」を開く、「まだ管理情報が登録されていません」が画面に表示されること、未登録案内の下に編集操作が表示されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 管理情報未登録のイベントを開き、未登録案内と編集ボタンが表示されることを確認する。
    await page.goto(`/admin/events/${EMPTY_EVENT_ID}/admin-info`)
    await expect(page.getByText(/まだ管理情報が登録されていません/)).toBeVisible()
    await expect(viewRow(page, '支払い状況')).toContainText('未入力')
    await expect(page.getByRole('link', { name: '編集' })).toHaveCount(2)
  })

  test('確認画面で出店要項のサムネイルを押すと拡大表示が開き、閉じるで閉じる', /**
     * 「/admin/events/…/admin-info」を開く、「出店要項の画像 2 を拡大表示」をクリックする、「次へ」をクリックする、「2 / 3」が画面に表示されること、「3 / 3」が画面に表示されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 確認画面で2枚目のサムネイルを拡大する
    await page.goto(`/admin/events/${EVENT_ID}/admin-info`)
    await page.getByRole('button', { name: '出店要項の画像 2 を拡大表示' }).click()
    const dialog = page.getByRole('dialog', { name: '出店要項の画像の拡大表示' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('2 / 3')).toBeVisible()
    // 2. 表示画像を次へ切り替えた後、閉じる操作でダイアログを閉じる
    await expect(dialog.getByRole('img')).toHaveAttribute('src', '/img/logo-habitatoides.png')
    await dialog.getByRole('button', { name: /次へ/ }).click()
    await expect(dialog.getByText('3 / 3')).toBeVisible()
    await dialog.getByRole('button', { name: '閉じる' }).click()
    await expect(dialog).toBeHidden()
  })
})

test.describe('管理情報の確認画面 — スマホ幅（375x812）', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('確認画面で横スクロールが出ず、戻る・編集ボタン・サムネイルが画面内に収まる', /**
     * 「/admin/events/…/admin-info/edit」を開く、「搬入日時」が画面に表示されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 全項目を入れた状態の確認画面にする
    await page.goto(`/admin/events/${EVENT_ID}/admin-info/edit`)
    await expect(page.getByText('搬入日時')).toBeVisible()
    await fillAllAndSave(page)
    await expect(viewRow(page, '支払い状況')).toContainText('期限切れ')

    // 2. 横スクロールが出ていない
    await expectNoHorizontalScroll(page)

    // 3. 主要な要素が画面の横幅に収まる
    await expectWithinViewportX(page, page.getByRole('link', { name: '← 戻る' }), '戻るリンク')
    const edits = page.getByRole('link', { name: '編集' })
    await expectWithinViewportX(page, edits.nth(0), '上の編集ボタン')
    await expectWithinViewportX(page, edits.nth(1), '下の編集ボタン')
    // 3 枚の出店要項サムネイルを順に確認するための 1 始まり番号。
    for (let i = 1; i <= 3; i++) {
      await expectWithinViewportX(page, page.getByRole('button', { name: `出店要項の画像 ${i} を拡大表示` }), `サムネイル ${i}`)
    }
    await expectWithinViewportX(page, viewRow(page, '支払い状況'), '支払い状況の行')

    // 4. 編集ボタンはスマホで押しやすい高さ（44px 以上）
    const box = await edits.nth(0).boundingBox()
    expect(box!.height).toBeGreaterThanOrEqual(44)

    // 5. 「保存しました」が消えてから全体のスクリーンショットを保存する（PM の見た目確認用）
    await expect(page.getByRole('status')).toBeHidden({ timeout: 6000 })
    await saveScreenshots(page, 'admin-info-view-375x812')
  })

  test('編集画面でも横スクロールが出ない', /**
     * 「/admin/events/…/admin-info/edit」を開く、「要項の画像（3 枚）」が画面に表示されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 管理情報編集画面を表示し、入力欄がビューポート幅に収まり横スクロールがないことを確認する。
    await page.goto(`/admin/events/${EVENT_ID}/admin-info/edit`)
    await expect(page.getByText('要項の画像（3 枚）')).toBeVisible()
    await expectNoHorizontalScroll(page)
    await expectWithinViewportX(page, page.getByRole('link', { name: '← 戻る' }), '戻るリンク')
    await expectWithinViewportX(page, page.getByRole('button', { name: '保存する' }), '保存するボタン')
  })

  test('全部未入力の確認画面でも横スクロールが出ない（スクリーンショットも保存）', /**
     * 「/admin/events/…/admin-info」を開く、「まだ管理情報が登録されていません」が画面に表示されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 全項目未入力の管理情報確認画面で横スクロールが発生しないことを確認し、画面キャプチャを保存する。
    await page.goto(`/admin/events/${EMPTY_EVENT_ID}/admin-info`)
    await expect(page.getByText(/まだ管理情報が登録されていません/)).toBeVisible()
    await expectNoHorizontalScroll(page)
    await saveScreenshots(page, 'admin-info-view-empty-375x812')
  })
})

test.describe('管理情報の確認画面 — デスクトップ幅（1280x800）', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('確認画面の見た目のスクリーンショットを保存する（全項目入力・保存直後の「保存しました」あり）', /**
     * 「/admin/events/…/admin-info/edit」を開く、「搬入日時」が画面に表示されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    await page.goto(`/admin/events/${EVENT_ID}/admin-info/edit`)
    await expect(page.getByText('搬入日時')).toBeVisible()
    await fillAllAndSave(page)
    await expect(page.getByRole('status')).toHaveText('保存しました')
    await expectNoHorizontalScroll(page)
    // 1. 保存直後（「保存しました」あり）
    await page.screenshot({ path: `${SCREENSHOT_DIR}/admin-info-view-1280x800-saved.png` })
    // 2. 「保存しました」が消えた後
    await expect(page.getByRole('status')).toBeHidden({ timeout: 6000 })
    await saveScreenshots(page, 'admin-info-view-1280x800')
  })
})
