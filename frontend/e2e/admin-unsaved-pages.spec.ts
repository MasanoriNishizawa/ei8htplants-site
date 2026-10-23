import { test, expect, type Page } from '@playwright/test'

// 管理画面の「書きかけ保護」（保存していない変更があるまま別の画面へ移るときの確認）の画面テスト。
// VITE_MSW=true VITE_SKIP_ADMIN_AUTH=true（npm run mock:e2e）で実行する。本番には接続しない（保存は MSW のモック）。
// 確かめること（画面ごと）:
//   1. 入力したあとサイドメニューで移ろうとすると確認が出る。キャンセルすれば移らない
//   2. 画面の中の「キャンセル」「戻る」でも確認が出る（ある画面だけ）
//   3. 保存に成功したあとは確認が出ずに移れる
// 対象: EventForm・EventFinance・AdminEventSite・Collaborations・AdminPotArtists・AdminMedia・AdminChatQA・
//       Stockists（追加欄と編集のダイアログ）・PriceCalc（タブの切り替えも）

/** 移るときの確認の文言（UnsavedChanges.ts の UNSAVED_LEAVE_MESSAGE） */
const LEAVE_MESSAGE = '保存していない変更があります。破棄して移動しますか？'
/** モーダル・ダイアログを閉じるときの確認の文言（UNSAVED_CLOSE_MESSAGE） */
const CLOSE_MESSAGE = '保存していない変更があります。破棄して閉じますか？'

/**
 * 偽の管理者セッションを入れ、Supabase への通信を遮断する（admin-dashboard.spec.ts と同じ）
 * @param page - 対象ページ（goto より前に呼ぶ）
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
 * 次に出る確認ダイアログをキャンセルし、その文言を返す Promise を作る
 * @param page - 対象ページ
 * @returns ダイアログの文言
 */
function dismissNextDialog(page: Page): Promise<string> {
  return new Promise((resolve) => {
    page.once('dialog', async (d) => {
      const message = d.message()
      await d.dismiss()
      resolve(message)
    })
  })
}

/**
 * サイドメニューで「ダッシュボード」へ移ろうとし、確認が出てキャンセルすると今の画面に残ることを確かめる
 * @param page - 対象ページ
 */
async function expectSidebarBlocked(page: Page) {
  const url = page.url()
  const dialog = dismissNextDialog(page)
  await page.getByRole('complementary').getByRole('link', { name: 'ダッシュボード' }).click()
  expect(await dialog).toBe(LEAVE_MESSAGE)
  await expect(page).toHaveURL(url)
}

/**
 * 確認が出ずにサイドメニューで「ダッシュボード」へ移れることを確かめる
 * @param page - 対象ページ
 */
async function expectSidebarFree(page: Page) {
  let dialogs = 0
  const onDialog = async (d: { dismiss: () => Promise<void> }) => { dialogs += 1; await d.dismiss() }
  page.on('dialog', onDialog)
  await page.getByRole('complementary').getByRole('link', { name: 'ダッシュボード' }).click()
  await expect(page).toHaveURL(/\/admin$/)
  page.off('dialog', onDialog)
  expect(dialogs).toBe(0)
}

test.beforeEach(async ({ page }) => {
  await useFakeAdminSession(page)
})

test.describe('イベントの編集（EventForm）', () => {
  test('入力したあとサイドメニューで移ろうとすると確認が出て、キャンセルすると残る', async ({ page }) => {
    await page.goto('/admin/events/mock-upcoming-1/edit')
    const name = page.locator('#event-name')
    await expect(name).toHaveValue('Green Market 2027')
    // 読み込み直後は確認なし（ほかのテストで確かめるため、ここでは入力してから）
    await name.fill('Green Market 2027 改')
    await expectSidebarBlocked(page)
  })

  test('読み込み直後（何も入力していない）なら確認なしで移れる', async ({ page }) => {
    await page.goto('/admin/events/mock-upcoming-1/edit')
    await expect(page.locator('#event-name')).toHaveValue('Green Market 2027')
    await expectSidebarFree(page)
  })

  test('画面の「キャンセル」でも確認が出て、キャンセルすると残る', async ({ page }) => {
    await page.goto('/admin/events/mock-upcoming-1/edit')
    // 読み込みが終わってから入力する（読み込み前に入れると、読み込んだ値で上書きされる）
    await expect(page.locator('#event-name')).toHaveValue('Green Market 2027')
    await page.locator('#event-name').fill('書きかけ')
    const dialog = dismissNextDialog(page)
    await page.getByRole('button', { name: 'キャンセル' }).click()
    expect(await dialog).toBe(LEAVE_MESSAGE)
    await expect(page).toHaveURL(/\/edit$/)
  })

  test('「管理情報」へのリンクでも確認が出る', async ({ page }) => {
    await page.goto('/admin/events/mock-upcoming-1/edit')
    // 読み込みが終わってから入力する（読み込み前に入れると、読み込んだ値で上書きされる）
    await expect(page.locator('#event-name')).toHaveValue('Green Market 2027')
    await page.locator('#event-name').fill('書きかけ')
    const dialog = dismissNextDialog(page)
    await page.getByRole('main').getByRole('link', { name: /管理情報/ }).click()
    expect(await dialog).toBe(LEAVE_MESSAGE)
    await expect(page).toHaveURL(/\/edit$/)
  })

  test('保存に成功すると確認なしでイベント一覧へ移る', async ({ page }) => {
    await page.goto('/admin/events/mock-upcoming-1/edit')
    // 読み込みが終わってから入力する（読み込み前に入れると、読み込んだ値で上書きされる）
    await expect(page.locator('#event-name')).toHaveValue('Green Market 2027')
    await page.locator('#event-name').fill('Green Market 2027 改')
    let dialogs = 0
    page.on('dialog', async (d) => { dialogs += 1; await d.dismiss() })
    await page.getByRole('button', { name: '保存する' }).click()
    await expect(page).toHaveURL(/\/admin\/events$/)
    expect(dialogs).toBe(0)
  })
})

test.describe('イベントの収支（EventFinance）', () => {
  test('売上を入力したあとサイドメニュー・「← イベント管理」で移ろうとすると確認が出る', async ({ page }) => {
    await page.goto('/admin/events/mock-past-1/finances')
    const sales = page.getByText('売上', { exact: true }).locator('..').getByRole('textbox')
    await expect(sales).toBeVisible()
    await sales.fill('12345')
    await expectSidebarBlocked(page)
    const dialog = dismissNextDialog(page)
    await page.getByRole('link', { name: /イベント管理/ }).click()
    expect(await dialog).toBe(LEAVE_MESSAGE)
    await expect(page).toHaveURL(/\/finances$/)
  })

  test('保存に成功すると確認なしで元の画面へ戻る', async ({ page }) => {
    await page.goto('/admin/events/mock-past-1/finances')
    const sales = page.getByText('売上', { exact: true }).locator('..').getByRole('textbox')
    await sales.fill('12345')
    let dialogs = 0
    page.on('dialog', async (d) => { dialogs += 1; await d.dismiss() })
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page).toHaveURL(/\/admin\/events$/)
    expect(dialogs).toBe(0)
  })
})

test.describe('イベントページの編集（AdminEventSite）', () => {
  test('入力したあと移ろうとすると確認が出て、保存に成功したあとは確認なしで移れる', async ({ page }) => {
    await page.goto('/admin/events/mock-upcoming-1/site')
    const tagline = page.getByLabel('キャッチコピー')
    await expect(tagline).toBeVisible()
    await tagline.fill('新しいキャッチコピー')
    await expectSidebarBlocked(page)
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page.getByRole('button', { name: '保存しました' })).toBeVisible()
    await expectSidebarFree(page)
  })
})

test.describe('コラボレーション・鉢作家・メディア出演の追加欄', () => {
  test('コラボレーション: タイトルを入れたら確認が出て、追加に成功したら確認なし', async ({ page }) => {
    await page.goto('/admin/collaborations')
    await page.getByLabel('タイトル').fill('新しいコラボ')
    await expectSidebarBlocked(page)
    await page.getByRole('button', { name: '追加', exact: true }).click()
    await expect(page.getByLabel('タイトル')).toHaveValue('')
    await expectSidebarFree(page)
  })

  test('鉢作家: 名前を入れたら確認が出て、追加に成功したら確認なし', async ({ page }) => {
    await page.goto('/admin/pot-artists')
    const input = page.getByPlaceholder('鉢作家名を入力')
    await input.fill('山田陶房')
    await expectSidebarBlocked(page)
    await page.locator('form button[type="submit"]').click()
    await expect(input).toHaveValue('')
    await expect(page.getByText('山田陶房')).toBeVisible()
    await expectSidebarFree(page)
  })

  test('メディア出演: タイトルを入れたら確認が出て、追加に成功したら確認なし', async ({ page }) => {
    await page.goto('/admin/media')
    await page.locator('#media-title').fill('テレビ出演')
    await expectSidebarBlocked(page)
    await page.locator('#media-youtube-url').fill('https://www.youtube.com/watch?v=abcdefghijk')
    await page.locator('form button[type="submit"]').click()
    await expect(page.locator('#media-title')).toHaveValue('')
    await expectSidebarFree(page)
  })
})

test.describe('チャットの Q&A（AdminChatQA）', () => {
  test('追加のフォームに入力すると移るときに確認が出て、フォームの「キャンセル」でも閉じる確認が出る', async ({ page }) => {
    await page.goto('/admin/chat-qa')
    await page.getByRole('button', { name: '+ 追加' }).click()
    await page.getByLabel('質問').fill('営業時間は？')
    await expectSidebarBlocked(page)
    const dialog = dismissNextDialog(page)
    await page.getByRole('button', { name: 'キャンセル' }).click()
    expect(await dialog).toBe(CLOSE_MESSAGE)
    // キャンセルしたのでフォームは開いたまま
    await expect(page.getByLabel('質問')).toHaveValue('営業時間は？')
  })

  test('開いただけのフォームは確認なしで移れ、保存に成功したあとも確認なし', async ({ page }) => {
    await page.goto('/admin/chat-qa')
    await page.getByRole('button', { name: '+ 追加' }).click()
    await expect(page.getByLabel('質問')).toBeVisible()
    await page.getByLabel('質問').fill('営業時間は？')
    await page.getByLabel('回答').fill('イベントごとに異なります')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page.getByLabel('質問')).toHaveCount(0)
    await expectSidebarFree(page)
  })
})

test.describe('取扱店（Stockists）', () => {
  test('追加欄に入力すると移るときに確認が出る', async ({ page }) => {
    await page.goto('/admin/stockists')
    await page.getByLabel('店舗名').first().fill('新しいお店')
    await expectSidebarBlocked(page)
  })

  test('編集のダイアログで変えて「キャンセル」すると閉じる確認が出て、キャンセルすれば開いたまま', async ({ page }) => {
    await page.goto('/admin/stockists')
    await page.getByRole('button', { name: '編集' }).first().click()
    const dialogBox = page.getByRole('dialog', { name: '取扱店を編集' })
    // （ダイアログを開いているあいだは暗い幕がサイドメニューを覆うので、閉じる操作だけを確かめる）
    await dialogBox.getByLabel('エリア').fill('名古屋')
    const dialog = dismissNextDialog(page)
    await dialogBox.getByRole('button', { name: 'キャンセル' }).click()
    expect(await dialog).toBe(CLOSE_MESSAGE)
    await expect(dialogBox).toBeVisible()
  })

  test('編集のダイアログを開いただけなら「キャンセル」で確認なしに閉じ、移るときも確認なし', async ({ page }) => {
    await page.goto('/admin/stockists')
    await page.getByRole('button', { name: '編集' }).first().click()
    let dialogs = 0
    page.on('dialog', async (d) => { dialogs += 1; await d.dismiss() })
    await page.getByRole('dialog', { name: '取扱店を編集' }).getByRole('button', { name: 'キャンセル' }).click()
    await expect(page.getByRole('dialog', { name: '取扱店を編集' })).toHaveCount(0)
    expect(dialogs).toBe(0)
    await expectSidebarFree(page)
  })
})

test.describe('販売価格計算（PriceCalc）', () => {
  test('植物名を入れると移るときに確認が出て、ブランドのタブを切り替えるときも確認が出る（キャンセルで残る）', async ({ page }) => {
    await page.goto('/admin/price-calc')
    const plant = page.getByPlaceholder('例: アガベ チタノタ')
    await plant.fill('アガベ')
    await expectSidebarBlocked(page)
    const dialog = dismissNextDialog(page)
    await page.getByRole('button', { name: 'Habitat Oides' }).click()
    expect(await dialog).toBe(LEAVE_MESSAGE)
    // タブは切り替わらず、入力も残る
    await expect(plant).toHaveValue('アガベ')
  })

  test('何も入れていなければタブを確認なしで切り替えられる', async ({ page }) => {
    await page.goto('/admin/price-calc')
    let dialogs = 0
    page.on('dialog', async (d) => { dialogs += 1; await d.dismiss() })
    await page.getByRole('button', { name: 'Habitat Oides' }).click()
    await expect(page.getByPlaceholder('例: アガベ ポタトルム')).toBeVisible()
    expect(dialogs).toBe(0)
  })
})
