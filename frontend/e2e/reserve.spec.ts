import { test, expect } from '@playwright/test'

// 予約フォームページ（/official/reserve）の E2E テスト
// MSW モックモードで実行（本番 DB には接続しない）
// - POST /api/reserve は handlers.ts で { ok: true } を返す
// - 予約は event_id が必須。event_id が無い・イベントが見つからないときはフォームを出さず「イベントが見つかりません」を出す
// - 参加人数の上限は 10 名（lib/constants.ts の RESERVE_MAX_PARTICIPANTS）
// - 409（満席）・429（回数制限）・422（入力の誤り）の文言は Vitest（src/pages/__tests__/Reserve.test.tsx）で確かめる
//   （ブラウザの MSW の応答を E2E から差し替える仕組みが無いため）
// 使うモックのイベント（src/mocks/data.ts）
// - mock-no-time: 1 日だけ・WS の時間枠なし → 日付・時間枠を選ばずに送信できる（人数は数値の入力欄）
// - mock-upcoming-1: Green Market 2027（WS あり）
// - mock-past-1: 終了済み → 受付終了の案内

/** 日付・時間枠を選ばずに予約できるモックのイベント */
const SIMPLE_EVENT_ID = 'mock-no-time'

test.describe('Reserve', () => {
  // ページが正常にロードされることを確認
  test('/official/reserve を開くと共通ヘッダーとサイト名入りのタイトルが表示される', /**
     予約ページを開き、共通ヘッダーとサイト名を含むページタイトルが表示されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    await page.goto('/official/reserve')
    // ヘッダー（共通 Layout）が存在すること
    await expect(page.getByRole('banner').first()).toBeVisible()
    // タイトルにサイト名が含まれること
    await expect(page).toHaveTitle(/ei8ht plants/)
  })

  // 予約フォームの見出しが表示されることを確認
  test('/official/reserve を開くと「Workshop 予約」の見出しが表示される', /**
     * 「/official/reserve」を開く、「Workshop 予約」が画面に表示されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 予約ページを開き、H1「Workshop 予約」が表示されることを確認する。
    await page.goto('/official/reserve')
    await expect(page.getByRole('heading', { level: 1, name: 'Workshop 予約' })).toBeVisible()
  })

  // event_id が無いときはフォームを出さず、イベント一覧へ案内する
  test('event_id なしで開くと「イベントが見つかりません」が出て予約フォームは出ない', /**
     * 「/official/reserve」を開く、イベントIDのない予約ページで案内文とイベント一覧リンクを表示し、入力欄と予約ボタンを出さないことを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    await page.goto('/official/reserve')
    // 1. 案内とイベント一覧へのリンク
    await expect(page.getByRole('alert')).toContainText('イベントが見つかりません')
    await expect(page.getByText('予約するイベントをイベント一覧からお選びください。')).toBeVisible()
    await expect(page.getByRole('link', { name: 'イベント一覧へ' })).toHaveAttribute('href', '/official/events')
    // 2. 入力欄・予約ボタンは出ない
    await expect(page.getByRole('textbox')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /予約する/ })).toHaveCount(0)
  })

  // 存在しない event_id でもフォームを出さない（モックの GET /api/events/:id は 404）
  test('存在しない event_id で開くと「イベントが見つかりません」が出て予約フォームは出ない', /**
     * 「/official/reserve?event_id=no-such-event」を開く、存在しないイベントIDでエラー案内を表示し、予約ボタンを表示しないことを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 存在しないイベントIDで予約ページを開き、見つからない旨を表示して予約ボタンを出さないことを確認する。
    await page.goto('/official/reserve?event_id=no-such-event')
    await expect(page.getByRole('alert')).toContainText('イベントが見つかりません')
    await expect(page.getByRole('button', { name: /予約する/ })).toHaveCount(0)
  })

  // イベント ID を指定してアクセスするとイベント情報が表示されることを確認
  test('event_id を指定するとイベント名が表示される', /**
     * 「/official/reserve?event_id=mock-upcoming-1」を開く、「Green Market 2027」が画面に表示されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. Green Market 2027のIDを指定して予約ページを開き、イベント名が表示されることを確認する。
    await page.goto('/official/reserve?event_id=mock-upcoming-1')
    await expect(page.getByText('Green Market 2027').first()).toBeVisible()
  })

  // 終了したイベントは受付終了の案内を出す
  test('終了したイベントの event_id で開くと「受付を終了しました」が出て予約ボタンは出ない', /**
     * 「/official/reserve?event_id=mock-past-1」を開く、「受付を終了しました」が画面に表示されること、存在しないイベントIDでエラー案内を表示し、予約ボタンを表示しないことを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 終了済みイベントの予約ページを開き、受付終了の案内を出して予約ボタンを隠すことを確認する。
    await page.goto('/official/reserve?event_id=mock-past-1')
    await expect(page.getByText('受付を終了しました')).toBeVisible()
    await expect(page.getByRole('button', { name: /予約する/ })).toHaveCount(0)
  })

  // フォームの入力欄がそろっていることを確認
  test('event_id を指定するとお名前・メールアドレス・電話番号の入力欄と予約ボタンが表示される', /**
     * 「/official/reserve?event_id=…」を開く、「お名前」が画面に表示されること、「メールアドレス」が画面に表示されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    await page.goto(`/official/reserve?event_id=${SIMPLE_EVENT_ID}`)
    await expect(page.getByLabel('お名前')).toBeVisible()
    await expect(page.getByLabel('メールアドレス')).toBeVisible()
    // 電話番号は任意（placeholder「090-0000-0000」）
    await expect(page.getByPlaceholder('090-0000-0000')).toBeVisible()
    await expect(page.getByRole('button', { name: /予約する/ })).toBeVisible()
  })

  // 参加人数の上限（10 名）を確認
  test('時間枠の無いイベントでは参加人数の入力欄の範囲が 1〜10 になる', /**
     時間枠のないイベントの予約ページを開き、参加人数欄の最小値が1、最大値が10であることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 時間枠のないイベントを指定し、参加人数入力のminが1、maxが10であることを確認する。
    await page.goto(`/official/reserve?event_id=${SIMPLE_EVENT_ID}`)
    const participants = page.getByLabel('参加人数')
    await expect(participants).toHaveAttribute('min', '1')
    await expect(participants).toHaveAttribute('max', '10')
  })

  test('参加人数に 11 を入れて送信してもブラウザの入力チェックで止まり、完了の表示にならない', /**
     * 「/official/reserve?event_id=…」を開く、「お名前」へ入力する、「メールアドレス」へ入力する、氏名・メールアドレスを入力して予約を送信し、受付完了メッセージが表示されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    await page.goto(`/official/reserve?event_id=${SIMPLE_EVENT_ID}`)
    // 1. 必須項目を埋め、人数だけ上限を超える値にする
    await page.getByLabel('お名前').fill('山田 花子')
    await page.getByLabel('メールアドレス').fill('hanako@example.com')
    const participants = page.getByLabel('参加人数')
    await participants.fill('11')
    // 2. 送信しようとする
    await page.getByRole('button', { name: /予約する/ }).click()
    // 3. 入力欄が範囲外（rangeOverflow）として無効になり、完了の表示は出ない
    expect(await participants.evaluate((el: HTMLInputElement) => el.validity.rangeOverflow)).toBe(true)
    await expect(page.getByText('予約を受け付けました')).toHaveCount(0)
  })

  test('必要な項目を入れて予約すると「予約を受け付けました」と予約内容が表示される', /**
     * 「/official/reserve?event_id=…」を開く、「お名前」へ入力する、「メールアドレス」へ入力する、「予約を受け付けました」が画面に表示されること、「hanako@example.com」が画面に表示されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    await page.goto(`/official/reserve?event_id=${SIMPLE_EVENT_ID}`)
    // 1. 入力（人数は上限ちょうどの 10 名）
    await page.getByLabel('お名前').fill('山田 花子')
    await page.getByLabel('メールアドレス').fill('hanako@example.com')
    await page.getByLabel('参加人数').fill('10')
    // 2. 送信時に event_id がサーバーへ送られることを確かめる
    const reqPromise = page.waitForRequest((r) => r.url().endsWith('/api/reserve') && r.method() === 'POST')
    await page.getByRole('button', { name: /予約する/ }).click()
    const body = (await reqPromise).postDataJSON() as { event_id: string; participants: number }
    expect(body.event_id).toBe(SIMPLE_EVENT_ID)
    expect(body.participants).toBe(10)
    // 3. 完了の表示と予約内容
    await expect(page.getByText('予約を受け付けました')).toBeVisible()
    await expect(page.getByText('hanako@example.com').first()).toBeVisible()
    await expect(page.getByText('10 名')).toBeVisible()
  })
})
