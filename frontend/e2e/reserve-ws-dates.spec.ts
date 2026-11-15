import { test, expect } from './fixtures'

// ワークショップを特定の日だけ実施するイベントの予約（/official/reserve）の E2E テスト（2026-11-13 追加）
// MSW モックモードで実行（本番 DB には接続しない）
// 使うモックのイベント（src/mocks/data.ts の mock-ws-dates）
// - Plants Weekend 2027: 7/1（木）〜7/4（日）開催、ワークショップは 7/2（金）と 7/4（日）だけ
// - 7/2 は枠 2 つ（11:00〜12:00 は空きあり、13:00〜14:00 は満席）。7/4 は枠なし（時間指定なしで受付）
// POST /api/reserve のモックは本番と同じく、実施しない日・枠の選び忘れ・別の日の枠を 400 にする
// 今日（2026-11 時点）より後の日付なので、7/2・7/4 のどちらも予約日に選べる

/** 予約するイベントの URL */
const URL = '/official/reserve?event_id=mock-ws-dates'

test.describe('Reserve — ワークショップ実施日（特定の日だけ・日ごとの枠）', () => {
  test('E2E-AG-01 実施日（7/2・7/4）だけが予約日に出て、「ワークショップ実施日」を案内する', /**
     * 予約ページを開き、予約日の選択肢と左の案内に実施日だけが出ることを確かめる。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} 画面の確認が終わったときに解決する。
     */
    async ({ page }) => {
    await page.goto(URL)
    // 1. 左の案内に実施日
    await expect(page.getByText('ワークショップ実施日: 7/2（金）・7/4（日）')).toBeVisible()
    // 2. 予約日の選択肢は 2 つだけ（7/1・7/3 は出ない）
    const dates = page.getByRole('radiogroup', { name: /予約日/ }).getByRole('radio')
    await expect(dates).toHaveCount(2)
    await expect(page.getByRole('radio', { name: /7月2日/ })).toBeVisible()
    await expect(page.getByRole('radio', { name: /7月4日/ })).toBeVisible()
    await expect(page.getByRole('radio', { name: /7月1日/ })).toHaveCount(0)
    await expect(page.getByRole('radio', { name: /7月3日/ })).toHaveCount(0)
  })

  test('E2E-AG-02 7/2 は満席の枠を選べず、空きのある枠を選んで予約できる', /**
     * 7/2 を選び、満席の枠が無効で、空きのある枠で予約が完了することを確かめる。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} 画面の確認が終わったときに解決する。
     */
    async ({ page }) => {
    await page.goto(URL)
    // 1. 7/2 を選ぶと、その日の枠が 2 つ出る
    await page.getByRole('radio', { name: /7月2日/ }).check()
    const full = page.getByRole('radio', { name: /13:00〜14:00.*満席/ })
    await expect(full).toBeDisabled()
    // 2. 空きのある枠を選び、お客様情報を入れて送る
    await page.getByRole('radio', { name: /11:00〜12:00/ }).check()
    await page.getByLabel('お名前').fill('山田 花子')
    await page.getByLabel('メールアドレス').fill('hanako@example.com')
    // 送った内容を控える
    const request = page.waitForRequest((r) => r.url().endsWith('/api/reserve') && r.method() === 'POST')
    await page.getByRole('button', { name: '予約する' }).click()
    const body = (await request).postDataJSON() as Record<string, unknown>
    expect(body).toMatchObject({ event_id: 'mock-ws-dates', preferred_date: '2027-07-02', session_id: 'mock-ws-dates-s1' })
    // 3. 完了の表示
    await expect(page.getByText('予約を受け付けました')).toBeVisible()
  })

  test('E2E-AG-03 7/2 で枠を選ばないと「予約時間を選択してください」が出て送れない', /**
     * 枠のある日に枠を選ばないと、送信できないことを確かめる。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} 画面の確認が終わったときに解決する。
     */
    async ({ page }) => {
    await page.goto(URL)
    await page.getByRole('radio', { name: /7月2日/ }).check()
    await expect(page.getByRole('radio', { name: /11:00〜12:00/ })).toBeVisible()
    await page.getByLabel('お名前').fill('山田 花子')
    await page.getByLabel('メールアドレス').fill('hanako@example.com')
    await expect(page.getByText('予約時間を選択してください')).toBeVisible()
    await expect(page.getByRole('button', { name: '予約する' })).toBeDisabled()
  })

  test('E2E-AG-04 枠の無い 7/4 は、時間を選ばずに予約できる（モックのサーバーも受け付ける）', /**
     * 7/4 を選ぶと時間の指定なしの案内が出て、枠を選ばずに予約が完了することを確かめる。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} 画面の確認が終わったときに解決する。
     */
    async ({ page }) => {
    await page.goto(URL)
    // 1. 7/4 を選ぶと、時間の指定なしの案内
    await page.getByRole('radio', { name: /7月4日/ }).check()
    await expect(page.getByText('この日は時間の指定はありません。参加人数とお客様情報を入力してご予約ください。')).toBeVisible()
    await expect(page.getByRole('radio', { name: /11:00〜12:00/ })).toHaveCount(0)
    // 2. 人数とお客様情報を入れて送る
    await page.getByLabel(/参加人数/).fill('2')
    await page.getByLabel('お名前').fill('山田 花子')
    await page.getByLabel('メールアドレス').fill('hanako@example.com')
    const request = page.waitForRequest((r) => r.url().endsWith('/api/reserve') && r.method() === 'POST')
    await page.getByRole('button', { name: '予約する' }).click()
    const body = (await request).postDataJSON() as Record<string, unknown>
    expect(body).toMatchObject({ event_id: 'mock-ws-dates', preferred_date: '2027-07-04', participants: 2 })
    expect(body.session_id ?? '').toBe('')
    // 3. 400 にならず完了する
    await expect(page.getByText('予約を受け付けました')).toBeVisible()
  })

  test('E2E-AG-05 イベントページにも「ワークショップ実施日」が出る', /**
     * 公開のイベントページ（スラッグ）に実施日の案内が出ることを確かめる。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} 画面の確認が終わったときに解決する。
     */
    async ({ page }) => {
    await page.goto('/official/events/plants-weekend-2027')
    await expect(page.getByText('ワークショップ実施日: 7/2（金）・7/4（日）').first()).toBeVisible()
  })
})
