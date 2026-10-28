import { test, expect, type Page } from '@playwright/test'

// 管理画面の「書きかけ保護」（保存していない変更があるまま別の画面へ移るときの確認）の画面テスト。
// VITE_MSW=true VITE_SKIP_ADMIN_AUTH=true（npm run mock:e2e）で実行する。本番には接続しない（保存は MSW のモック）。
// 確かめること（画面ごと）:
//   1. 入力したあとサイドメニューで移ろうとすると確認が出る。キャンセルすれば移らない
//   2. 画面の中の「キャンセル」「戻る」でも確認が出る（ある画面だけ）
//   3. 保存に成功したあとは確認が出ずに移れる
// 対象: EventForm・EventFinance・AdminEventSite・Collaborations・AdminPotArtists・AdminMedia・AdminChatQA・
//       Stockists（追加欄と編集のダイアログ）・PriceCalc（ブランドと生産・仕入れのタブの切り替えも。HUE のフォームと登録も）

/** 移るときの確認の文言（UnsavedChanges.ts の UNSAVED_LEAVE_MESSAGE） */
const LEAVE_MESSAGE = '保存していない変更があります。破棄して移動しますか？'
/** モーダル・ダイアログを閉じるときの確認の文言（UNSAVED_CLOSE_MESSAGE） */
const CLOSE_MESSAGE = '保存していない変更があります。破棄して閉じますか？'

/**
 * 偽の管理者セッションを入れ、Supabase への通信を遮断する（admin-dashboard.spec.ts と同じ）
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
 * @returns なし。確認ダイアログをキャンセルした後も現在の画面に留まることを検証する。
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
 * @returns なし。確認ダイアログなしでダッシュボードへ移動できることを検証する。
 */
async function expectSidebarFree(page: Page) {
  let dialogs = 0
  /**
   * ダイアログの発生数を記録し、検証を続けるために閉じる
   * @param d - 発生したブラウザーの確認ダイアログ
   * @returns ダイアログを閉じる処理の Promise
   */
  const onDialog = async (d: { dismiss: () => Promise<void> }) => { dialogs += 1; await d.dismiss() }
  page.on('dialog', onDialog)
  await page.getByRole('complementary').getByRole('link', { name: 'ダッシュボード' }).click()
  await expect(page).toHaveURL(/\/admin$/)
  page.off('dialog', onDialog)
  expect(dialogs).toBe(0)
}

/**
 * 販売価格計算の、計算フォームのブランドのタブを返す
 * （登録リストの絞り込み（role="group"）にも同じ文言のボタンがあるので、group の直下ではないボタンを選ぶ）
 * @param page - 対象ページ
 * @param name - ブランドの表示名
 * @returns 計算フォームのタブのボタン
 */
function brandTab(page: Page, name: string) {
  return page.locator(':not([role="group"]) > button').filter({ hasText: new RegExp(`^${name}$`) })
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
    // 1. 「読み込み直後（何も入力していない）なら確認なしで移れる」の期待状態が画面に表示されることを確認する。
    await page.goto('/admin/events/mock-upcoming-1/edit')
    await expect(page.locator('#event-name')).toHaveValue('Green Market 2027')
    await expectSidebarFree(page)
  })

  test('画面の「キャンセル」でも確認が出て、キャンセルすると残る', async ({ page }) => {
    // 1. イベント編集フォームを変更し、画面内のキャンセル操作を行う
    await page.goto('/admin/events/mock-upcoming-1/edit')
    // 読み込みが終わってから入力する（読み込み前に入れると、読み込んだ値で上書きされる）
    await expect(page.locator('#event-name')).toHaveValue('Green Market 2027')
    await page.locator('#event-name').fill('書きかけ')
    const dialog = dismissNextDialog(page)
    // 2. 確認ダイアログの文言と編集画面に留まることを確認する
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
    // 1. イベント名を変更して保存する
    await page.goto('/admin/events/mock-upcoming-1/edit')
    // 読み込みが終わってから入力する（読み込み前に入れると、読み込んだ値で上書きされる）
    await expect(page.locator('#event-name')).toHaveValue('Green Market 2027')
    await page.locator('#event-name').fill('Green Market 2027 改')
    let dialogs = 0
    page.on('dialog', async (d) => { dialogs += 1; await d.dismiss() })
    // 2. 一覧へ遷移し、破棄確認が出なかったことを確かめる
    await page.getByRole('button', { name: '保存する' }).click()
    await expect(page).toHaveURL(/\/admin\/events$/)
    expect(dialogs).toBe(0)
  })
})

test.describe('イベントの収支（EventFinance）', () => {
  test('売上を入力したあとサイドメニュー・「← イベント管理」で移ろうとすると確認が出る', async ({ page }) => {
    // 1. 「売上を入力したあとサイドメニュー・「← イベント管理」で移ろうとすると確認が出る」の期待状態が画面に表示されることを確認する。
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
    // 1. 「保存に成功すると確認なしで元の画面へ戻る」の期待状態が画面に表示されることを確認する。
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
    // 1. 「入力したあと移ろうとすると確認が出て、保存に成功したあとは確認なしで移れる」の期待状態が画面に表示されることを確認する。
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
    // 1. 「コラボレーション: タイトルを入れたら確認が出て、追加に成功したら確認なし」の期待状態が画面に表示されることを確認する。
    await page.goto('/admin/collaborations')
    await page.getByLabel('タイトル').fill('新しいコラボ')
    await expectSidebarBlocked(page)
    await page.getByRole('button', { name: '追加', exact: true }).click()
    await expect(page.getByLabel('タイトル')).toHaveValue('')
    await expectSidebarFree(page)
  })

  test('鉢作家: 名前を入れたら確認が出て、追加に成功したら確認なし', async ({ page }) => {
    // 1. 「鉢作家: 名前を入れたら確認が出て、追加に成功したら確認なし」の期待状態が画面に表示されることを確認する。
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
    // 1. メディア出演の追加フォームにタイトルと動画 URL を入力する
    await page.goto('/admin/media')
    await page.locator('#media-title').fill('テレビ出演')
    await expectSidebarBlocked(page)
    await page.locator('#media-youtube-url').fill('https://www.youtube.com/watch?v=abcdefghijk')
    // 2. 登録後にフォームが初期化され、未保存確認なしで移動できることを確かめる
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
    // 1. 「開いただけのフォームは確認なしで移れ、保存に成功したあとも確認なし」の期待状態が画面に表示されることを確認する。
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
    // 1. 「追加欄に入力すると移るときに確認が出る」の期待状態が画面に表示されることを確認する。
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
    // 1. 「編集のダイアログを開いただけなら「キャンセル」で確認なしに閉じ、移るときも確認なし」の期待状態が画面に表示されることを確認する。
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
    await brandTab(page, 'Habitat Oides').click()
    expect(await dialog).toBe(LEAVE_MESSAGE)
    // タブは切り替わらず、入力も残る
    await expect(plant).toHaveValue('アガベ')
  })

  test('何も入れていなければタブを確認なしで切り替えられる', async ({ page }) => {
    // 1. 「何も入れていなければタブを確認なしで切り替えられる」の期待状態が画面に表示されることを確認する。
    await page.goto('/admin/price-calc')
    let dialogs = 0
    page.on('dialog', async (d) => { dialogs += 1; await d.dismiss() })
    await brandTab(page, 'Habitat Oides').click()
    await expect(page.getByPlaceholder('例: アガベ ポタトルム')).toBeVisible()
    expect(dialogs).toBe(0)
  })

  test('HUE のタブで植物仕入れ値を入れると、移るときもタブを切り替えるときも確認が出る（キャンセルで HUE のまま残る）', async ({ page }) => {
    // 1. HUE の仕入れフォームを開き、植物仕入れ値を入力する
    await page.goto('/admin/price-calc')
    await brandTab(page, 'HUE').click()
    // 初期は「生産」なので、2 段目の「仕入れ」に切り替える
    await page.getByRole('button', { name: '仕入れ' }).click()
    // HUE のフォームには鉢作家の選択が無い
    await expect(page.getByPlaceholder('例: ユーフォルビア オベサ')).toBeVisible()
    await expect(page.getByRole('combobox')).toHaveCount(0)
    const plantPrice = page.getByPlaceholder('例: 3000')
    await plantPrice.fill('1000')
    // 2. 画面移動を試みて確認をキャンセルし、入力が保持されることを確認する
    await expectSidebarBlocked(page)
    const dialog = dismissNextDialog(page)
    await brandTab(page, 'ei8ht plants').click()
    expect(await dialog).toBe(LEAVE_MESSAGE)
    // タブは切り替わらず、入力も残る
    await expect(plantPrice).toHaveValue('1000')
    await expect(page.getByPlaceholder('例: アガベ チタノタ')).toHaveCount(0)
  })

  test('HUE で登録すると登録リストに HUE の行が出て（植物名の下の 2 行目は無い）、そのあとは確認なしで移れる', async ({ page }) => {
    // 1. HUE の仕入れフォームで植物名・原価・鉢代を入力し、推奨価格を確認する
    await page.goto('/admin/price-calc')
    await brandTab(page, 'HUE').click()
    // 初期は「生産」なので、2 段目の「仕入れ」に切り替える
    await page.getByRole('button', { name: '仕入れ' }).click()
    await page.getByPlaceholder('例: ユーフォルビア オベサ').fill('オベサ E2E')
    await page.getByPlaceholder('例: 3000').fill('1000')
    await page.getByPlaceholder('例: 5000').fill('500')
    // 原価 1,500 円 → 推奨価格 ¥3,800（1,500 ÷ 0.4 = 3,750 を 100 円単位で切り上げ。原価率 39.5%）
    await expect(page.getByText('原価率 39.5%')).toBeVisible()
    // 2. 推奨販売価格で登録し、リスト行のブランド・種類・価格を確認する
    await page.getByRole('button', { name: /^登録\s+¥3,800$/ }).click()
    // 登録リストの行（ブランドは HUE、元値 ¥1,500、販売価格 ¥3,800、2 行目の「量産鉢」は無い）
    const row = page.getByRole('row').filter({ hasText: 'オベサ E2E' })
    await expect(row).toBeVisible()
    // ブランドの列は 1 行目がブランド名、2 行目が種類（仕入れ）
    await expect(row.getByRole('cell').nth(1).locator('div')).toHaveText(['HUE', '仕入れ'])
    await expect(row.getByRole('cell').nth(2)).toHaveText('¥1,500')
    await expect(row.getByRole('cell').nth(3)).toHaveText('¥3,800')
    await expect(row.getByRole('cell').first()).toHaveText('オベサ E2E')
    // 入力が空になり、確認なしで移れる
    await expect(page.getByPlaceholder('例: ユーフォルビア オベサ')).toHaveValue('')
    await expectSidebarFree(page)
  })
  test('目標原価率はブランドごとに保存され、初期値と再読み込み後の値を保つ', async ({ page }) => {
    await page.goto('/admin/price-calc')
    // 目標原価率の欄は仕入れのときだけ出る
    await page.getByRole('button', { name: '仕入れ' }).click()
    const rate = page.getByRole('textbox', { name: '目標原価率（%）' })
    await expect(rate).toHaveValue('33.4')
    await rate.fill('35')
    await expect(page.getByText('推奨販売価格（原価率 35% 以下）')).toBeVisible()
    // 1. 率だけなら確認なしでタブを切り替えられ、率は残る
    let dialogs = 0
    /**
     * ダイアログの発生数を記録し、確認なしで切り替わるかの検証を続けるため閉じる
     * @param d - 発生したブラウザーの確認ダイアログ
     * @returns ダイアログを閉じる処理の Promise
     */
    const onDialog = async (d: { dismiss: () => Promise<void> }) => { dialogs += 1; await d.dismiss() }
    page.on('dialog', onDialog)
    await brandTab(page, 'HUE').click()
    await expect(page.getByPlaceholder('例: ユーフォルビア オベサ')).toBeVisible()
    await expect(rate).toHaveValue('40')
    await rate.fill('35')
    await expect(rate).toHaveValue('35')
    // 原価 1,500 円 → ¥4,300（1,500 ÷ 0.35 = 4,285.7… を 100 円単位で切り上げ）
    await page.getByPlaceholder('例: 3000').fill('1500')
    await expect(page.getByRole('button', { name: /^登録\s+¥4,300$/ })).toBeVisible()
    await page.getByPlaceholder('例: 3000').fill('')
    page.off('dialog', onDialog)
    expect(dialogs).toBe(0)
    // 2. 再読み込みしても localStorage から 35 が戻る
    await page.reload()
    // 再読み込みすると種類は初期の「生産」に戻るので、仕入れに切り替える
    await page.getByRole('button', { name: '仕入れ' }).click()
    await expect(page.getByRole('textbox', { name: '目標原価率（%）' })).toHaveValue('35')
    // 3. ei8ht plants の既定値 33.4% に戻り、ボタンは消える
    await page.getByRole('button', { name: '33.4% に戻す' }).click()
    await expect(page.getByRole('textbox', { name: '目標原価率（%）' })).toHaveValue('33.4')
    await expect(page.getByRole('button', { name: '33.4% に戻す' })).toHaveCount(0)
    await expectSidebarFree(page)
  })

  test('生産（初期）で卸価格を入れて「仕入れ」を押すと確認が出て、キャンセルすると生産のまま入力が残る', async ({ page }) => {
    // 1. 生産フォームに卸価格を入力し、販売価格が2倍で表示されることを確認する
    await page.goto('/admin/price-calc')
    await expect(page.getByText('販売価格（卸価格の 2 倍）')).toBeVisible()
    await expect(page.getByRole('textbox', { name: '目標原価率（%）' })).toHaveCount(0)
    const wholesale = page.getByPlaceholder('例: 1500')
    await wholesale.fill('1500')
    await expect(page.getByText('¥3,000', { exact: true })).toBeVisible()
    await expectSidebarBlocked(page)
    // 2. 仕入れへの切り替え確認をキャンセルし、生産フォームと入力値が残ることを確認する
    const dialog = dismissNextDialog(page)
    await page.getByRole('button', { name: '仕入れ' }).click()
    expect(await dialog).toBe(LEAVE_MESSAGE)
    await expect(wholesale).toHaveValue('1500')
    await expect(page.getByText('販売価格（卸価格の 2 倍）')).toBeVisible()
  })

  test('登録リストの絞り込みで HUE を選ぶと HUE の行だけになり、書きかけがあっても確認は出ない', async ({ page }) => {
    await page.goto('/admin/price-calc')
    // 1. ei8ht plants の生産で 1 件登録する
    await page.getByPlaceholder('例: アガベ チタノタ').fill('エイト E2E')
    await page.getByPlaceholder('例: 1500').fill('1000')
    await page.getByRole('button', { name: /^登録\s+¥2,000$/ }).click()
    await expect(page.getByRole('row').filter({ hasText: 'エイト E2E' })).toBeVisible()
    // 2. 書きかけを作ってから、絞り込みで HUE を選ぶ（確認は出ない）
    await page.getByPlaceholder('例: アガベ チタノタ').fill('書きかけ')
    let dialogs = 0
    page.on('dialog', async (d) => { dialogs += 1; await d.dismiss() })
    const filter = page.getByRole('group', { name: '登録リストの絞り込み' })
    await filter.getByRole('button', { name: 'HUE', exact: true }).click()
    await expect(page.getByText('このブランドの登録はありません。')).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: 'エイト E2E' })).toHaveCount(0)
    // 3. 「すべて」に戻すと出る。計算フォームの入力は残っている
    await filter.getByRole('button', { name: 'すべて' }).click()
    await expect(page.getByRole('row').filter({ hasText: 'エイト E2E' })).toBeVisible()
    await expect(page.getByPlaceholder('例: アガベ チタノタ')).toHaveValue('書きかけ')
    expect(dialogs).toBe(0)
  })

  test('HUE の生産で登録すると登録リストに卸価格と 2 倍の販売価格の行が出て、そのあとは確認なしで仕入れに切り替えられる', async ({ page }) => {
    // 1. HUE の生産フォームに植物名と卸価格を入力し、登録する
    await page.goto('/admin/price-calc')
    await brandTab(page, 'HUE').click()
    await expect(page.getByRole('combobox')).toHaveCount(0)
    await page.getByPlaceholder('例: ユーフォルビア オベサ').fill('オベサ 生産 E2E')
    await page.getByPlaceholder('例: 1500').fill('735')
    await page.getByRole('button', { name: /^登録\s+¥1,470$/ }).click()
    // 2. 登録行のブランド・種類・卸価格・販売価格を確認する
    const row = page.getByRole('row').filter({ hasText: 'オベサ 生産 E2E' })
    await expect(row).toBeVisible()
    // ブランドの列は 1 行目がブランド名、2 行目が種類（生産）
    await expect(row.getByRole('cell').nth(1).locator('div')).toHaveText(['HUE', '生産'])
    await expect(row.getByRole('cell').nth(2)).toHaveText('¥735')
    await expect(row.getByRole('cell').nth(3)).toHaveText('¥1,470')
    await expect(row.getByRole('cell').first()).toHaveText('オベサ 生産 E2E')
    let dialogs = 0
    page.on('dialog', async (d) => { dialogs += 1; await d.dismiss() })
    // 3. 入力変更の確認なしで仕入れへ切り替えられることを確認する
    await page.getByRole('button', { name: '仕入れ' }).click()
    await expect(page.getByPlaceholder('例: 3000')).toBeVisible()
    expect(dialogs).toBe(0)
  })
})
