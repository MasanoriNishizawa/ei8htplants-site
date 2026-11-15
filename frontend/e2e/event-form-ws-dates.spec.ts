import { test, expect } from './fixtures'

// イベント登録画面（/admin/events/:id/edit）のワークショップ実施日の E2E テスト（2026-11-13 追加）
// MSW モックモード・管理画面のログイン省略（npm run mock:e2e）で実行する（本番 DB には接続しない）
// 使うモックのイベント（src/mocks/data.ts の mock-ws-dates）
// - Plants Weekend 2027: 7/1（木）〜7/4（日）開催、ワークショップは 7/2（金）と 7/4（日）だけ。7/2 は枠 2 つ、7/4 は枠なし
// - 7/2 の 11:00〜12:00 に予約が 1 件（2 名。MOCK_RESERVATIONS）入っている
// 保存はイベントと枠を 1 回の PUT /api/events/:id（本文の sessions）で送る。予約の移し先が無ければ 409
// 保存で送る形（イベントと枠を別々に送るか、まとめて送るか）には依存しないよう、
// 保存したあとに一覧から開き直して、画面に出る内容（実施日・日ごとの枠）で確かめる
// （モックのデータはブラウザのメモリにあるので、開き直しは再読み込みせず画面の中のリンクで移る）

/** 編集画面の URL */
const EDIT_URL = '/admin/events/mock-ws-dates/edit'

test.describe('イベントフォーム ワークショップ実施日', () => {
  test('E2E-AH-01 編集で開くと「実施する日を選ぶ」で、選んだ日（7/2・7/4）と日ごとの枠が出る', /**
     * 実施日のあるイベントの編集画面を開き、実施のしかた・選んだ日・日ごとの枠の表示を確かめる。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} 画面の確認が終わったときに解決する。
     */
    async ({ page }) => {
    await page.goto(EDIT_URL)
    const mode = page.getByRole('radiogroup', { name: 'ワークショップの実施のしかた' })
    await expect(mode.getByRole('radio', { name: '実施する日を選ぶ' })).toBeChecked()
    const days = page.getByRole('group', { name: '実施する日（1日以上）' })
    await expect(days.getByRole('checkbox', { name: '7月1日（木）' })).not.toBeChecked()
    await expect(days.getByRole('checkbox', { name: '7月2日（金）' })).toBeChecked()
    await expect(days.getByRole('checkbox', { name: '7月3日（土）' })).not.toBeChecked()
    await expect(days.getByRole('checkbox', { name: '7月4日（日）' })).toBeChecked()
    await expect(page.getByRole('textbox', { name: '7月2日（金）の1回目の時間' })).toHaveValue('11:00〜12:00')
    await expect(page.getByRole('textbox', { name: '7月2日（金）の2回目の時間' })).toHaveValue('13:00〜14:00')
    await expect(page.getByRole('region', { name: '7月4日（日）の時間枠' }).getByText('枠なし（時間指定なしで予約受付）')).toBeVisible()
  })

  test('E2E-AH-02 7/3 を足して枠をコピーし、保存して開き直すと、実施日と日ごとの枠が残っている', /**
     * 実施日を足し、ほかの日の枠をコピーして保存し、一覧から開き直して保存された内容を確かめる。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} 画面の確認が終わったときに解決する。
     */
    async ({ page }) => {
    await page.goto(EDIT_URL)
    const days = page.getByRole('group', { name: '実施する日（1日以上）' })
    // 1. 7/3 を足し、7/2 の枠をコピーする
    await days.getByRole('checkbox', { name: '7月3日（土）' }).check()
    await page.getByRole('combobox', { name: '7月3日（土）にほかの日の枠をコピー' }).selectOption('2027-07-02')
    await expect(page.getByRole('textbox', { name: '7月3日（土）の1回目の時間' })).toHaveValue('11:00〜12:00')
    await expect(page.getByRole('textbox', { name: '7月3日（土）の2回目の時間' })).toHaveValue('13:00〜14:00')
    // 2. 7/3 の 2 回目の定員を 3 にして保存する
    await page.getByRole('spinbutton', { name: '7月3日（土）の2回目の定員' }).fill('3')
    await page.getByRole('button', { name: '保存する' }).click()
    await expect(page).toHaveURL(/\/admin\/events$/)
    // 3. 一覧から開き直す（再読み込みしない）
    const row = page.getByText('Plants Weekend 2027', { exact: true }).locator('..').locator('..')
    await row.getByRole('link', { name: '編集' }).click()
    await expect(page.getByRole('radiogroup', { name: 'ワークショップの実施のしかた' }).getByRole('radio', { name: '実施する日を選ぶ' })).toBeChecked()
    const reopened = page.getByRole('group', { name: '実施する日（1日以上）' })
    await expect(reopened.getByRole('checkbox', { name: '7月2日（金）' })).toBeChecked()
    await expect(reopened.getByRole('checkbox', { name: '7月3日（土）' })).toBeChecked()
    await expect(reopened.getByRole('checkbox', { name: '7月4日（日）' })).toBeChecked()
    await expect(page.getByRole('textbox', { name: '7月3日（土）の2回目の時間' })).toHaveValue('13:00〜14:00')
    await expect(page.getByRole('spinbutton', { name: '7月3日（土）の2回目の定員' })).toHaveValue('3')
    await expect(page.getByRole('textbox', { name: '7月2日（金）の1回目の時間' })).toHaveValue('11:00〜12:00')
    await expect(page.getByRole('region', { name: '7月4日（日）の時間枠' }).getByText('枠なし（時間指定なしで予約受付）')).toBeVisible()
  })

  test('E2E-AH-03 全日程に切り替えて保存すると、開き直したときも全日程で、7/2 の枠が共通の枠になっている', /**
     * 「全日程で実施」に切り替えて保存し、開き直して共通の枠になっていることを確かめる。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} 画面の確認が終わったときに解決する。
     */
    async ({ page }) => {
    await page.goto(EDIT_URL)
    const mode = page.getByRole('radiogroup', { name: 'ワークショップの実施のしかた' })
    await expect(mode.getByRole('radio', { name: '実施する日を選ぶ' })).toBeChecked()
    // 1. 全日程に切り替える（7/4 は枠なしなので、消える枠は無く確認は出ない）
    await mode.getByRole('radio', { name: '全日程で実施（共通の枠）' }).check()
    await expect(page.getByRole('group', { name: '実施する日（1日以上）' })).toHaveCount(0)
    await expect(page.getByRole('textbox', { name: '1回目の時間', exact: true })).toHaveValue('11:00〜12:00')
    await expect(page.getByRole('textbox', { name: '2回目の時間', exact: true })).toHaveValue('13:00〜14:00')
    // 2. 保存して一覧から開き直す
    await page.getByRole('button', { name: '保存する' }).click()
    await expect(page).toHaveURL(/\/admin\/events$/)
    const row = page.getByText('Plants Weekend 2027', { exact: true }).locator('..').locator('..')
    await row.getByRole('link', { name: '編集' }).click()
    await expect(page.getByRole('radiogroup', { name: 'ワークショップの実施のしかた' }).getByRole('radio', { name: '全日程で実施（共通の枠）' })).toBeChecked()
    await expect(page.getByRole('textbox', { name: '1回目の時間', exact: true })).toHaveValue('11:00〜12:00')
    await expect(page.getByRole('textbox', { name: '2回目の時間', exact: true })).toHaveValue('13:00〜14:00')
  })

  test('E2E-AH-04 終了日を 7/3 にすると 7/4 の選択と枠が消え、ほかの日の枠が消えるときは切り替えの確認が出る', /**
     * 開催期間の変更で外れた日が消えること、ほかの日の枠が消える切り替えで確認が出ることを確かめる。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} 画面の確認が終わったときに解決する。
     */
    async ({ page }) => {
    await page.goto(EDIT_URL)
    const days = page.getByRole('group', { name: '実施する日（1日以上）' })
    await expect(days.getByRole('checkbox', { name: '7月4日（日）' })).toBeChecked()
    // 1. 終了日を 7/3 にする
    await page.getByLabel('終了日').fill('2027-07-03')
    await expect(days.getByRole('checkbox', { name: '7月4日（日）' })).toHaveCount(0)
    await expect(page.getByRole('region', { name: '7月4日（日）の時間枠' })).toHaveCount(0)
    // 2. 7/3 を足して枠を 1 つ入れ、全日程に切り替えようとすると確認が出る（キャンセルで残る）
    await days.getByRole('checkbox', { name: '7月3日（土）' }).check()
    await page.getByRole('button', { name: '7月3日（土）に枠を追加' }).click()
    await page.getByRole('textbox', { name: '7月3日（土）の1回目の時間' }).fill('15:00〜16:00')
    /** 出た確認の文 */
    let message = ''
    page.once('dialog', (dialog) => { message = dialog.message(); void dialog.dismiss() })
    await page.getByRole('radiogroup', { name: 'ワークショップの実施のしかた' }).getByRole('radio', { name: '全日程で実施（共通の枠）' }).click()
    await expect.poll(() => message).toBe('全日程で実施に切り替えると、7月2日（金）の枠を共通の枠にし、ほかの日の枠（1件）は消えます。よろしいですか？')
    await expect(page.getByRole('textbox', { name: '7月3日（土）の1回目の時間' })).toHaveValue('15:00〜16:00')
  })

  test('E2E-AH-05 予約の入っている 7/2 を外して保存すると 409 の一覧が出て、入力を残したまま保存されない', /**
     * 予約のある日を外して保存し、移し先の無い予約の一覧・予約の画面へのリンクが出て、イベントが保存されていないことを確かめる。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} 画面の確認が終わったときに解決する。
     */
    async ({ page }) => {
    await page.goto(EDIT_URL)
    const days = page.getByRole('group', { name: '実施する日（1日以上）' })
    // 1. 7/2 を外して保存する（送るのは 1 回の PUT /api/events/mock-ws-dates）
    await days.getByRole('checkbox', { name: '7月2日（金）' }).uncheck()
    const response = page.waitForResponse((r) => r.url().endsWith('/api/events/mock-ws-dates') && r.request().method() === 'PUT')
    await page.getByRole('button', { name: '保存する' }).click()
    const res = await response
    expect(res.status()).toBe(409)
    const sent = res.request().postDataJSON() as { ws_dates: string[]; sessions: unknown[] }
    expect(sent.ws_dates).toEqual(['2027-07-04'])
    expect(sent.sessions).toEqual([])
    // 2. 案内・一覧・予約の画面へのリンク
    const alert = page.getByRole('alert')
    await expect(alert).toContainText('予約が入っている日時を変更・削除しようとしています。')
    await expect(alert.getByRole('listitem')).toHaveText(['7/2（金） 11:00〜12:00 に予約 1 件'])
    await expect(alert.getByRole('link', { name: 'このイベントの予約を見る（別のタブ）' })).toHaveAttribute('href', '/admin/events/mock-ws-dates/reservations')
    // 3. 画面は編集のまま、入力（7/2 を外した状態）も残る
    await expect(page).toHaveURL(/\/admin\/events\/mock-ws-dates\/edit$/)
    await expect(days.getByRole('checkbox', { name: '7月2日（金）' })).not.toBeChecked()
    // 4. 保存されていない: 「キャンセル」で破棄の確認が出る（受け入れて一覧へ移り、開き直すと 7/2 が残っている）
    page.once('dialog', (dialog) => { void dialog.accept() })
    await page.getByRole('button', { name: 'キャンセル' }).click()
    await expect(page).toHaveURL(/\/admin\/events$/)
    const row = page.getByText('Plants Weekend 2027', { exact: true }).locator('..').locator('..')
    await row.getByRole('link', { name: '編集' }).click()
    await expect(page.getByRole('group', { name: '実施する日（1日以上）' }).getByRole('checkbox', { name: '7月2日（金）' })).toBeChecked()
    await expect(page.getByRole('textbox', { name: '7月2日（金）の1回目の時間' })).toHaveValue('11:00〜12:00')
  })
})
