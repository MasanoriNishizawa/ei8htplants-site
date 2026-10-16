import { test, expect, type Page } from '@playwright/test'

// 管理情報ページの「搬入・搬出」（日付・時・分）を入力して保存したとき、
// 保存 API（PUT /api/events/:id/admin-info）に日時が送られることを確かめる画面テスト。
// VITE_MSW=true VITE_SKIP_ADMIN_AUTH=true（npm run mock:e2e）で実行する。本番には接続しない
// 認証まわりの前提は event-images.spec.ts と同じ（偽セッションを入れ、Supabase への通信は遮断する）

/**
 * 偽の管理者セッションを入れ、Supabase への通信を遮断する
 * @param page - 対象ページ（goto より前に呼ぶ）
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
    const originalGetItem = Storage.prototype.getItem
    Storage.prototype.getItem = function (key: string) {
      if (/^sb-.+-auth-token$/.test(key)) return JSON.stringify(fakeSession)
      return originalGetItem.call(this, key)
    }
  })
}

test.beforeEach(async ({ page }) => {
  await useFakeAdminSession(page)
})

/** 対象イベントの ID（MSW モックに収支・管理情報があるイベント） */
const EVENT_ID = 'mock-past-1'

test('搬入・搬出の日付・時・分を選んで保存すると、保存 API に日時が送られる', async ({ page }) => {
  // 1. 管理情報ページを開き、読み込みが終わるのを待つ
  await page.goto(`/admin/events/${EVENT_ID}/admin-info`)
  await expect(page.getByText('搬入日時')).toBeVisible()

  // 2. 搬入・搬出の日付 input と、時・分の select を取り出す（画面の並び順: 搬入の日付・時・分 → 搬出の日付・時・分）
  const dates = page.locator('input[type="date"]')
  const carryInDate = dates.nth(0)
  const carryOutDate = dates.nth(1)
  const carryIn = carryInDate.locator('xpath=..')
  const carryOut = carryOutDate.locator('xpath=..')

  // 3. 利用者と同じ操作で入力する（日付 → 時 → 分）
  await carryInDate.fill('2099-11-14')
  await carryIn.locator('select').nth(0).selectOption('08')
  await carryIn.locator('select').nth(1).selectOption('30')
  await carryOutDate.fill('2099-11-15')
  await carryOut.locator('select').nth(0).selectOption('17')
  await carryOut.locator('select').nth(1).selectOption('05')

  // 4. 保存ボタンを押し、送られた保存 API の中身を受け取る
  const putRequest = page.waitForRequest(
    (req) => req.method() === 'PUT' && req.url().endsWith(`/api/events/${EVENT_ID}/admin-info`),
  )
  await page.getByRole('button', { name: '保存する' }).click()
  const body = JSON.parse((await putRequest).postData() ?? '{}')

  // 5. 搬入・搬出の日時が「YYYY-MM-DDTHH:MM」で送られている
  expect(body.carry_in_time).toBe('2099-11-14T08:30')
  expect(body.carry_out_time).toBe('2099-11-15T17:05')
  await expect(page.getByText('保存しました')).toBeVisible()
})

test('搬入・搬出を保存した後にページを開き直すと、選んだ日付・時・分が表示され、収支にも出店料・宿泊費が同期される', async ({ page }) => {
  // MSW は保存（PUT）した値をブラウザのメモリに持つため、再読み込みせずに画面内リンクで開き直して確かめる
  // 1. 管理情報ページを開く
  await page.goto(`/admin/events/${EVENT_ID}/admin-info`)
  await expect(page.getByText('搬入日時')).toBeVisible()

  // 2. 搬入・搬出・宿泊料金・出店料を入力する
  const dates = page.locator('input[type="date"]')
  const carryIn = dates.nth(0).locator('xpath=..')
  const carryOut = dates.nth(1).locator('xpath=..')
  await dates.nth(0).fill('2099-11-14')
  await carryIn.locator('select').nth(0).selectOption('08')
  await carryIn.locator('select').nth(1).selectOption('30')
  await dates.nth(1).fill('2099-11-15')
  await carryOut.locator('select').nth(0).selectOption('17')
  await carryOut.locator('select').nth(1).selectOption('05')
  const hotelFee = page.locator('label').filter({ hasText: /^宿泊料金$/ }).locator('..').locator('input')
  const boothFee = page.locator('label').filter({ hasText: /^出店料$/ }).locator('..').locator('input')
  await hotelFee.fill('8000')
  await boothFee.fill('12000')

  // 3. 保存し、収支の保存（PUT /finances）の本文も受け取る
  const finPut = page.waitForRequest(
    (req) => req.method() === 'PUT' && req.url().endsWith(`/api/events/${EVENT_ID}/finances`),
  )
  await page.getByRole('button', { name: '保存する' }).click()
  const finBody = JSON.parse((await finPut).postData() ?? '{}')
  await expect(page.getByText('保存しました')).toBeVisible()

  // 4. 収支には出店料・宿泊費だけが管理情報の値で送られ、売上などはモックの値のまま
  expect(finBody.booth_fee).toBe(12000)
  expect(finBody.accommodation).toBe(8000)
  expect(finBody.sales).toBe(320000)
  expect(finBody.other_expenses_note).toBe('消耗品')
  // 保存用でない項目（id・event_id）は送らない
  expect(finBody).not.toHaveProperty('id')
  expect(finBody).not.toHaveProperty('event_id')

  // 5. 「← 戻る」で別のページ（遷移元が無いときはイベント編集ページ）へ移ってから、
  //    ブラウザの「戻る」で管理情報ページを開き直す（再読み込みはしない）
  await page.getByRole('link', { name: '← 戻る' }).click()
  await expect(page).not.toHaveURL(/\/admin-info$/)
  await page.goBack()
  await expect(page.getByText('搬入日時')).toBeVisible()

  // 6. 保存した日付・時・分・金額が表示される
  const reDates = page.locator('input[type="date"]')
  await expect(reDates.nth(0)).toHaveValue('2099-11-14')
  await expect(reDates.nth(1)).toHaveValue('2099-11-15')
  const reCarryIn = reDates.nth(0).locator('xpath=..')
  const reCarryOut = reDates.nth(1).locator('xpath=..')
  await expect(reCarryIn.locator('select').nth(0)).toHaveValue('08')
  await expect(reCarryIn.locator('select').nth(1)).toHaveValue('30')
  await expect(reCarryOut.locator('select').nth(0)).toHaveValue('17')
  await expect(reCarryOut.locator('select').nth(1)).toHaveValue('05')
  await expect(page.locator('label').filter({ hasText: /^宿泊料金$/ }).locator('..').locator('input')).toHaveValue('8000')
  await expect(page.locator('label').filter({ hasText: /^出店料$/ }).locator('..').locator('input')).toHaveValue('12000')
})
