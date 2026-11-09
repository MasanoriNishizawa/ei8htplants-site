import { test, expect, type Page } from './fixtures'

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
    // Supabase の認証要求を通すためにブラウザーへ登録するテスト用セッション。
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
 * 次に出る確認ダイアログをキャンセルし、その文言を返す Promise を作る
 * @param page - 対象ページ
 * @returns ダイアログの文言
 */

function dismissNextDialog(page: Page): Promise<string> {
  return new Promise      ((resolve) => {
    page.once('dialog', async (d) => {
      // 確認ダイアログに表示されたメッセージ本文。
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
  // 次に表示される確認ダイアログを監視する Promise。
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
  test('入力したあとサイドメニューで移ろうとすると確認が出て、キャンセルすると残る', /**
     イベント名を変更してサイドメニューへの移動を試み、未保存確認が出た後にキャンセルすると編集値が保持されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. イベント名を変更してサイドメニューへの移動を試し、確認をキャンセルした後も編集状態が保たれることを確認する。
    await page.goto('/admin/events/mock-upcoming-1/edit')
    const name = page.locator('#event-name')
    await expect(name).toHaveValue('Green Market 2027', { timeout: 20000 })
    // 読み込み直後は確認なし（ほかのテストで確かめるため、ここでは入力してから）
    await name.fill('Green Market 2027 改')
    await expectSidebarBlocked(page)
  })

  test('読み込み直後（何も入力していない）なら確認なしで移れる', /**
     未編集のイベント編集画面からサイドメニューへ移動し、確認を挟まず移動できることと初期値が保たれることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 未編集のイベント編集画面からサイドメニューを選び、確認ダイアログなしで遷移できることを確認する。
    await page.goto('/admin/events/mock-upcoming-1/edit')
    await expect(page.locator('#event-name')).toHaveValue('Green Market 2027', { timeout: 20000 })
    await expectSidebarFree(page)
  })

  test('画面の「キャンセル」でも確認が出て、キャンセルすると残る', /**
     * 「/admin/events/mock-upcoming-1/edit」を開く、入力欄へ値を入力する、「キャンセル」をクリックする、URLが「\/edit$」になることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
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

  test('「管理情報」へのリンクでも確認が出る', /**
     * 「/admin/events/mock-upcoming-1/edit」を開く、入力欄へ値を入力する、「管理情報」をクリックする、URLが「\/edit$」になることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. イベント名を変更して管理情報への移動を試し、未保存確認が出ることを確認する。
    await page.goto('/admin/events/mock-upcoming-1/edit')
    // 読み込みが終わってから入力する（読み込み前に入れると、読み込んだ値で上書きされる）
    await expect(page.locator('#event-name')).toHaveValue('Green Market 2027')
    await page.locator('#event-name').fill('書きかけ')
    const dialog = dismissNextDialog(page)
    await page.getByRole('main').getByRole('link', { name: /管理情報/ }).click()
    expect(await dialog).toBe(LEAVE_MESSAGE)
    await expect(page).toHaveURL(/\/edit$/)
  })

  test('保存に成功すると確認なしでイベント一覧へ移る', /**
     * 「/admin/events/mock-upcoming-1/edit」を開く、入力欄へ値を入力する、「保存する」をクリックする、URLが「\/admin\/events$」になることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
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
  test('売上を入力したあとサイドメニュー・「← イベント管理」で移ろうとすると確認が出る', /**
     * 「/admin/events/mock-past-1/finances」を開く、入力欄へ値を入力する、「イベント管理」をクリックする、URLが「\/finances$」になることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 売上を編集した状態でサイドメニューまたはイベント管理への移動を試み、未保存確認が出ることを確認する。
    await page.goto('/admin/events/mock-past-1/finances')
    const sales = page.getByText('売上', { exact: true }).locator('..').getByRole('textbox')
    await expect(sales).toBeVisible({ timeout: 20000 })
    await sales.fill('12345')
    await expectSidebarBlocked(page)
    // 次に表示される確認ダイアログを監視する Promise。
    const dialog = dismissNextDialog(page)
    await page.getByRole('link', { name: /イベント管理/ }).click()
    expect(await dialog).toBe(LEAVE_MESSAGE)
    await expect(page).toHaveURL(/\/finances$/)
  })

  test('保存に成功すると確認なしで元の画面へ戻る', /**
     * 「/admin/events/mock-past-1/finances」を開く、入力欄へ値を入力する、「保存」をクリックする、URLが「\/admin\/events$」になることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 編集内容を保存し、保存成功後は未保存確認なしで元の画面へ戻れることを確認する。
    await page.goto('/admin/events/mock-past-1/finances')
    const sales = page.getByText('売上', { exact: true }).locator('..').getByRole('textbox')
    await expect(sales).toBeVisible({ timeout: 20000 })
    await sales.fill('12345')
    // この操作中に表示されたダイアログの件数。
    let dialogs = 0
    page.on('dialog', async (d) => { dialogs += 1; await d.dismiss() })
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page).toHaveURL(/\/admin\/events$/)
    expect(dialogs).toBe(0)
  })
})

test.describe('イベントページの編集（AdminEventSite）', () => {
  test('入力したあと移ろうとすると確認が出て、保存に成功したあとは確認なしで移れる', /**
     * 「/admin/events/mock-upcoming-1/site」を開く、入力欄へ値を入力する、「保存」をクリックする、「保存しました」が画面に表示されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. フォームへ値を入力して移動時の確認を確かめ、保存後は確認なしで移動できることを確認する。
    await page.goto('/admin/events/mock-upcoming-1/site')
    const tagline = page.getByLabel('キャッチコピー')
    await expect(tagline).toBeVisible()
    await tagline.fill('新しいキャッチコピー')
    await expectSidebarBlocked(page)
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page.getByRole('button', { name: '保存しました' })).toBeVisible()
    await expectSidebarFree(page)
  })

  test('ラインナップ画像をアップロードして保存すると、画像 URL が保存要求に含まれる', /**
     * 「/admin/events/mock-upcoming-1/site」を開き、ラインナップを追加する、画像をアップロードする、保存する。アップロードした画像 URL が保存要求に含まれ、サムネイル表示が保たれることを確かめる。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} 画像アップロード・保存要求と画面表示の確認が完了したときに解決する。
     */
    async ({ page }) => {
      // 1. イベントページ編集を開き、画像を設定するためのラインナップ欄を追加する。
      await page.goto('/admin/events/mock-upcoming-1/site')
      await expect(page.getByRole('button', { name: '+ ラインナップを追加' })).toBeVisible()
      await page.getByRole('button', { name: '+ ラインナップを追加' }).click()

      // 2. MSW が返すローカル画像URLを親フォームへ取り込み、サムネイルに表示する。
      const imageInput = page.locator('input[type="file"]').first()
      await imageInput.setInputFiles('public/img/habitatOides/habitat_oides_hero.jpg')
      const thumbnail = imageInput.locator('xpath=..').locator('img')
      await expect(thumbnail).toHaveAttribute('src', '/img/logo-habitatoides.png')
      await expect(imageInput).toHaveValue('')

      // 3. 保存要求を捕捉し、画像 URL が page_content の保存対象に含まれることを確かめる。
      const saveRequestPromise = page.waitForRequest((request) =>
        request.method() === 'PATCH' && request.url().includes('/api/events/mock-upcoming-1/page'),
      )
      await page.getByRole('button', { name: '保存', exact: true }).click()
      const saveRequest = await saveRequestPromise
      const requestBody = saveRequest.postDataJSON() as { page_content?: { lineup?: Array<{ image_url?: string }> } }
      expect(requestBody.page_content?.lineup?.[0]?.image_url).toBe('/img/logo-habitatoides.png')
      await expect(page.getByRole('button', { name: '保存しました' })).toBeVisible()
      await expect(thumbnail).toHaveAttribute('src', '/img/logo-habitatoides.png')
    }
  )

  test('ゲストを追加して入力すると未保存確認が有効になり、保存後は解除されて内容が送られる', /**
     * イベントページにゲストを追加してプロフィール項目を入力し、未保存確認と保存後の解除、PATCH の guests 内容を確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} 画面状態と保存要求の検証が完了したときに解決する。
     */
    async ({ page }) => {
      // 1. イベントページを開き、ゲストを追加してプロフィールの各欄が表示されることを確かめる。
      await page.goto('/admin/events/mock-upcoming-1/site')
      await expect(page.getByRole('button', { name: '+ ゲストを追加' })).toBeVisible()
      await page.getByRole('button', { name: '+ ゲストを追加' }).click()
      const guestCard = page.getByText('ゲスト 1').locator('..').locator('..')
      await expect(guestCard.getByLabel('名前')).toBeVisible()
      await expect(guestCard.getByLabel('役割・肩書き')).toBeVisible()
      await expect(guestCard.getByLabel('プロフィール')).toBeVisible()
      await expect(guestCard.getByText('プロフィール画像')).toBeVisible()
      await expect(guestCard.getByLabel('Instagram URL')).toBeVisible()
      await guestCard.getByLabel('名前').fill('森 花子')
      await guestCard.getByLabel('役割・肩書き').fill('植物家')
      await guestCard.getByLabel('プロフィール').fill('季節の植物を紹介します。')
      await guestCard.getByLabel('Instagram URL').fill('https://instagram.com/mori')

      // 2. 入力後は移動時の未保存確認が出て、キャンセル後も編集画面に留まることを確認する。
      await expectSidebarBlocked(page)

      // 3. 保存要求に page_content.guests が含まれ、保存後は未保存確認が解除されることを確かめる。
      const saveRequestPromise = page.waitForRequest((request) =>
        request.method() === 'PATCH' && request.url().includes('/api/events/mock-upcoming-1/page'),
      )
      await page.getByRole('button', { name: '保存', exact: true }).click()
      const saveRequest = await saveRequestPromise
      const requestBody = saveRequest.postDataJSON() as {
        page_content?: { guests?: Array<{ name?: string; role?: string; bio?: string; image_url?: string; instagram_url?: string }> }
      }
      expect(requestBody.page_content?.guests).toEqual([
        { name: '森 花子', role: '植物家', bio: '季節の植物を紹介します。', image_url: '', instagram_url: 'https://instagram.com/mori' },
      ])
      await expect(page.getByRole('button', { name: '保存しました' })).toBeVisible()
      await expectSidebarFree(page)
    }
  )
})

test.describe('コラボレーション・鉢作家・メディア出演の追加欄', () => {
  test('コラボレーション: タイトルを入れたら確認が出て、追加に成功したら確認なし', /**
     コラボレーション名を入力して移動時に未保存確認が出ること、登録後は入力欄が空になり確認なしで移動できることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. コラボレーション名を入力して移動確認を出し、追加後に入力欄が空になって確認なしで移れることを確認する。
    await page.goto('/admin/collaborations')
    await page.getByLabel('タイトル').fill('新しいコラボ')
    await expectSidebarBlocked(page)
    await page.getByRole('button', { name: '追加', exact: true }).click()
    await expect(page.getByLabel('タイトル')).toHaveValue('')
    await expectSidebarFree(page)
  })

  test('鉢作家: 名前を入れたら確認が出て、追加に成功したら確認なし', /**
     * 鉢作家名を入力して登録し、未保存確認が出た後に入力欄が空になり、登録名が一覧に表示されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 鉢作家名を入力して登録し、登録後は入力欄が空になり移動確認が出ないことを確認する。
    await page.goto('/admin/pot-artists')
    const input = page.getByPlaceholder('鉢作家名を入力')
    await input.fill('山田陶房')
    await expectSidebarBlocked(page)
    await page.locator('form button[type="submit"]').click()
    await expect(input).toHaveValue('')
    await expect(page.getByText('山田陶房')).toBeVisible()
    await expectSidebarFree(page)
  })

  test('メディア出演: タイトルを入れたら確認が出て、追加に成功したら確認なし', /**
     メディア出演のタイトルを入力して未保存確認を確認し、追加後に入力欄が空になって確認なしで移動できることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
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
  test('追加のフォームに入力すると移るときに確認が出て、フォームの「キャンセル」でも閉じる確認が出る', /**
     * 「/admin/chat-qa」を開く、「+ 追加」をクリックする、「質問」へ入力する、操作後に保存・更新結果が反映されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. Q&A の追加フォームを編集し、画面移動とフォーム取消の両方で未保存確認が出ることを確認する。
    await page.goto('/admin/chat-qa')
    await page.getByRole('button', { name: '+ 追加' }).click()
    await page.getByLabel('質問').fill('営業時間は？')
    await expectSidebarBlocked(page)
    // 次に表示される確認ダイアログを監視する Promise。
    const dialog = dismissNextDialog(page)
    await page.getByRole('button', { name: 'キャンセル' }).click()
    expect(await dialog).toBe(CLOSE_MESSAGE)
    // キャンセルしたのでフォームは開いたまま
    await expect(page.getByLabel('質問')).toHaveValue('営業時間は？')
  })

  test('開いただけのフォームは確認なしで移れ、保存に成功したあとも確認なし', /**
     * 「/admin/chat-qa」を開く、「+ 追加」をクリックする、「質問」へ入力する、「質問」が画面に表示されること、質問欄へ入力後に追加を実行し、質問が一覧に登録されて入力欄が初期化されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. フォームを開いただけの状態と保存完了後の両方で、画面移動時に確認が出ないことを確認する。
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
  test('追加欄に入力すると移るときに確認が出る', /**
     * 「/admin/stockists」を開く、「店舗名」へ入力する、操作後に保存・更新結果が反映されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 追加欄へ入力してサイドメニュー移動を試み、未保存確認が表示されることを確認する。
    await page.goto('/admin/stockists')
    await page.getByLabel('店舗名').first().fill('新しいお店')
    await expectSidebarBlocked(page)
  })

  test('編集のダイアログで変えて「キャンセル」すると閉じる確認が出て、キャンセルすれば開いたまま', /**
     取扱店の編集ダイアログでエリアを変更して閉じる操作を行い、確認をキャンセルするとダイアログが開いたままになることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 取扱店の編集ダイアログを変更して閉じ、確認をキャンセルするとダイアログが残ることを確認する。
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

  test('編集のダイアログを開いただけなら「キャンセル」で確認なしに閉じ、移るときも確認なし', /**
     * 取扱店編集ダイアログを開き、変更せずキャンセルした場合はダイアログが閉じ、その後の画面移動に未保存確認が出ないことを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 変更していない編集ダイアログをキャンセルで閉じ、その後の画面移動にも確認が出ないことを確認する。
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
  test('植物名を入れると移るときに確認が出て、ブランドのタブを切り替えるときも確認が出る（キャンセルで残る）', /**
     価格計算欄に植物名を入力し、画面移動とブランド切替の両方で未保存確認が出て、キャンセル後も入力値が残ることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 価格計算へ植物名を入力し、画面移動とブランド切替の確認をキャンセルして入力が保たれることを確認する。
    await page.goto('/admin/price-calc')
    const plant = page.getByPlaceholder('例: アガベ チタノタ')
    await plant.fill('アガベ')
    await expectSidebarBlocked(page)
    // 次に表示される確認ダイアログを監視する Promise。
    const dialog = dismissNextDialog(page)
    await brandTab(page, 'Habitat Oides').click()
    expect(await dialog).toBe(LEAVE_MESSAGE)
    // タブは切り替わらず、入力も残る
    await expect(plant).toHaveValue('アガベ')
  })

  test('何も入れていなければタブを確認なしで切り替えられる', /**
     * 価格計算画面で未入力のままブランドを切り替え、確認ダイアログを出さず切替先の入力欄を表示することを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 価格計算画面で未入力のままブランドタブを切り替え、確認ダイアログなしで切り替わることを確認する。
    await page.goto('/admin/price-calc')
    let dialogs = 0
    page.on('dialog', async (d) => { dialogs += 1; await d.dismiss() })
    await brandTab(page, 'Habitat Oides').click()
    await expect(page.getByPlaceholder('例: アガベ ポタトルム')).toBeVisible()
    expect(dialogs).toBe(0)
  })

  test('HUE のタブで植物仕入れ値を入れると、移るときもタブを切り替えるときも確認が出る（キャンセルで HUE のまま残る）', /**
     * HUEの仕入れフォームに植物仕入れ値を入力し、別ブランドへの切替を試みると確認が出て、キャンセル後も入力値とHUEのタブが維持されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
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

  test('HUE で登録すると登録リストに HUE の行が出て（植物名の下の 2 行目は無い）、そのあとは確認なしで移れる', /**
     * HUEの仕入れフォームに植物名・原価・鉢代を入力して登録し、推奨原価率と登録行を確認した後、確認なしで画面移動できることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
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
  test('目標原価率はブランドごとに保存され、初期値と再読み込み後の値を保つ', /**
     * 「/admin/price-calc」を開く、「仕入れ」をクリックする、入力欄へ値を入力する、「推奨販売価格（原価率 35% 以下）」が画面に表示されること、「例: ユーフォルビア オベサ」が画面に表示されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 価格計算画面で仕入れ時の原価率の初期値を確認し、変更を保存して再読み込み後も保持されることを確認する。
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

  test('生産（初期）で卸価格を入れて「仕入れ」を押すと確認が出て、キャンセルすると生産のまま入力が残る', /**
     * 生産フォームに卸価格を入力して販売価格が2倍になることを確かめる。仕入れへの切替をキャンセルした後、生産タブと入力値が保たれることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 生産フォームに卸価格を入力し、販売価格が2倍で表示されることを確認する
    await page.goto('/admin/price-calc')
    await expect(page.getByText('販売価格（卸価格の 2 倍）')).toBeVisible()
    await expect(page.getByRole('textbox', { name: '目標原価率（%）' })).toHaveCount(0)
    // 卸価格を入力する欄のロケーター。
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

  test('登録リストの絞り込みで HUE を選ぶと HUE の行だけになり、書きかけがあっても確認は出ない', /**
     * 「/admin/price-calc」を開く、「例: アガベ チタノタ」へ入力する、「例: 1500」へ入力する、「このブランドの登録はありません。」が画面に表示されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
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
    // 価格計算の登録リストを絞り込む操作グループのロケーター。
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

  test('HUE の生産で登録すると登録リストに卸価格と 2 倍の販売価格の行が出て、そのあとは確認なしで仕入れに切り替えられる', /**
     * HUEの生産フォームに植物名と卸価格を入力して登録し、登録行にHUE・生産・卸価格・販売価格が表示されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
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
    // この操作中に表示されたダイアログの件数。
    let dialogs = 0
    page.on('dialog', async (d) => { dialogs += 1; await d.dismiss() })
    // 3. 入力変更の確認なしで仕入れへ切り替えられることを確認する
    await page.getByRole('button', { name: '仕入れ' }).click()
    await expect(page.getByPlaceholder('例: 3000')).toBeVisible()
    expect(dialogs).toBe(0)
  })
})

/**
 * ブラウザの確認ダイアログに答える係を付ける。答え方（キャンセル・OK）はテストの途中で切り替えられる
 * @param page - 対象ページ
 * @returns messages（出た確認の文言の一覧）と answer（次から出る確認への答え方。'dismiss' ならキャンセル、'accept' なら OK）
 */
function answerDialogs(page: Page): { messages: string[]; answer: 'dismiss' | 'accept' } {
  // state: 出た文言と、今の答え方
  const state = { messages: [] as string[], answer: 'dismiss' as 'dismiss' | 'accept' }
  page.on('dialog', async (d) => {
    state.messages.push(d.message())
    if (state.answer === 'accept') await d.accept()
    else await d.dismiss()
  })
  return state
}

// ブラウザの「戻る」「進む」（popstate）でも、未保存の変更があれば確認を出す（historyGuard.ts）。
// 前の画面は page.goto ではなくアプリの中のリンク（サイドメニュー）で作る。page.goto で開いた別の文書の項目へ戻ると、
// popstate ではなく再読み込み扱い（beforeunload の確認）になり、ここで確かめたい仕組みを通らないため
test.describe('ブラウザの戻る・進む（historyGuard）', () => {
  test('鉢作家: サイドメニューで移って入力し「戻る」と確認が出て、キャンセルすると URL と入力が残り、OK で前の画面へ移る', /**
     * ダッシュボードからサイドメニューで鉢作家管理へ移り、名前を入れてブラウザの戻るを押す。
     * キャンセルでは URL と入力が残り、OK ではダッシュボードへ戻ることを確かめる。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. ダッシュボード → サイドメニューで鉢作家管理へ移り、名前を入れる
    const dialogs = answerDialogs(page)
    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible()
    await page.getByRole('complementary').getByRole('link', { name: '鉢作家管理' }).click()
    await expect(page).toHaveURL(/\/admin\/pot-artists$/)
    const input = page.getByPlaceholder('鉢作家名を入力')
    await input.fill('書きかけの作家')

    // 2. 戻る → 確認をキャンセルすると、鉢作家管理に残り、入力もそのまま
    await page.goBack({ waitUntil: 'commit' })
    await expect.poll(() => dialogs.messages).toEqual([LEAVE_MESSAGE])
    await expect(page).toHaveURL(/\/admin\/pot-artists$/)
    await expect(input).toHaveValue('書きかけの作家')
    // キャンセルで元へ戻したときの popstate では、確認がもう一度出ない
    expect(dialogs.messages).toHaveLength(1)

    // 3. もう一度戻る → 確認で OK を押すと、ダッシュボードへ移る
    dialogs.answer = 'accept'
    await page.goBack({ waitUntil: 'commit' })
    await expect(page).toHaveURL(/\/admin$/)
    await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible()
    expect(dialogs.messages).toEqual([LEAVE_MESSAGE, LEAVE_MESSAGE])
  })

  test('鉢作家: 入力してから「進む」でも確認が出て、キャンセルすると残り、OK で次の画面へ移る', /**
     * 鉢作家管理 → ダッシュボード と移ってから戻るで鉢作家管理へ戻り、名前を入れてブラウザの進むを押す。
     * キャンセルでは URL と入力が残り、OK ではダッシュボードへ進むことを確かめる。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. ダッシュボード → 鉢作家管理 → ダッシュボード と移り、戻るで鉢作家管理へ戻る（まだ入力していないので確認なし）
    const dialogs = answerDialogs(page)
    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible()
    const sidebar = page.getByRole('complementary')
    await sidebar.getByRole('link', { name: '鉢作家管理' }).click()
    await expect(page).toHaveURL(/\/admin\/pot-artists$/)
    await sidebar.getByRole('link', { name: 'ダッシュボード' }).click()
    await expect(page).toHaveURL(/\/admin$/)
    await page.goBack({ waitUntil: 'commit' })
    await expect(page).toHaveURL(/\/admin\/pot-artists$/)
    expect(dialogs.messages).toEqual([])

    // 2. 名前を入れて進む → キャンセルすると鉢作家管理に残り、入力もそのまま
    const input = page.getByPlaceholder('鉢作家名を入力')
    await input.fill('進む前の作家')
    await page.goForward({ waitUntil: 'commit' })
    await expect.poll(() => dialogs.messages).toEqual([LEAVE_MESSAGE])
    await expect(page).toHaveURL(/\/admin\/pot-artists$/)
    await expect(input).toHaveValue('進む前の作家')

    // 3. もう一度進む → OK でダッシュボードへ移る
    dialogs.answer = 'accept'
    await page.goForward({ waitUntil: 'commit' })
    await expect(page).toHaveURL(/\/admin$/)
    await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible()
    expect(dialogs.messages).toEqual([LEAVE_MESSAGE, LEAVE_MESSAGE])
  })

  test('鉢作家: 未保存の変更がなければ、戻る・進むで確認は出ない', /**
     * ダッシュボード → 鉢作家管理 と移り、何も入れずに戻る・進むを押して、確認が出ずに移れることを確かめる。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    const dialogs = answerDialogs(page)
    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible()
    await page.getByRole('complementary').getByRole('link', { name: '鉢作家管理' }).click()
    await expect(page.getByPlaceholder('鉢作家名を入力')).toBeVisible()
    // 1. 戻る → ダッシュボード
    await page.goBack({ waitUntil: 'commit' })
    await expect(page).toHaveURL(/\/admin$/)
    await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible()
    // 2. 進む → 鉢作家管理
    await page.goForward({ waitUntil: 'commit' })
    await expect(page).toHaveURL(/\/admin\/pot-artists$/)
    await expect(page.getByPlaceholder('鉢作家名を入力')).toBeVisible()
    expect(dialogs.messages).toEqual([])
  })

  test('鉢作家: 入力して追加に成功したあとは、戻るで確認は出ない', /**
     * サイドメニューで鉢作家管理へ移り、名前を入れて追加したあと、ブラウザの戻るで確認なしにダッシュボードへ戻れることを確かめる。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    const dialogs = answerDialogs(page)
    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible()
    await page.getByRole('complementary').getByRole('link', { name: '鉢作家管理' }).click()
    const input = page.getByPlaceholder('鉢作家名を入力')
    await input.fill('追加する作家')
    await page.locator('form button[type="submit"]').click()
    await expect(input).toHaveValue('')
    await page.goBack({ waitUntil: 'commit' })
    await expect(page).toHaveURL(/\/admin$/)
    expect(dialogs.messages).toEqual([])
  })

  test('鉢作家: 戻るの確認でキャンセルした直後（setTimeout(0)）に入力が変わって再描画されても、確認は1回だけで URL と画面は元のまま', /**
     * window.confirm を包み、キャンセルした直後の setTimeout(0) で鉢作家名の入力欄を書き換えて再描画を起こす。
     * そのあと元の項目へ戻したときの popstate で確認がもう一度出ないこと、URL・履歴の番号・画面・入力が元のままであることを確かめる。
     * （再描画で「移る前の場所」が戻る途中の項目に書き換わると、元へ戻したときに2回目の確認が出る不具合の確認）
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. キャンセルした直後に、React に伝わる形で入力欄を書き換える（再描画を起こす）仕掛けを入れる
    await page.addInitScript(() => {
      // originalConfirm: ブラウザ本来の確認ダイアログ
      const originalConfirm = window.confirm.bind(window)
      window.confirm = (message?: string) => {
        // answer: 確認への答え（Playwright がキャンセル・OK を返す）
        const answer = originalConfirm(message)
        if (!answer) {
          setTimeout(() => {
            // input: 鉢作家名の入力欄
            const input = document.querySelector('input[placeholder="鉢作家名を入力"]') as HTMLInputElement | null
            if (!input) return
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '再描画後の作家')
            input.dispatchEvent(new Event('input', { bubbles: true }))
          }, 0)
        }
        return answer
      }
    })
    const dialogs = answerDialogs(page)
    // 2. ダッシュボード → サイドメニューで鉢作家管理へ移り、名前を入れる
    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible()
    await page.getByRole('complementary').getByRole('link', { name: '鉢作家管理' }).click()
    await expect(page).toHaveURL(/\/admin\/pot-artists$/)
    const input = page.getByPlaceholder('鉢作家名を入力')
    await input.fill('書きかけの作家')
    // idxBefore: 鉢作家管理の履歴の項目の番号（React Router が history.state.idx に書いたもの）
    const idxBefore = await page.evaluate(() => (window.history.state as { idx?: number } | null)?.idx)

    // 3. 戻る → キャンセル。直後の再描画で入力が書き換わり、履歴は元の項目（同じ番号）へ戻る
    await page.goBack({ waitUntil: 'commit' })
    await expect(input).toHaveValue('再描画後の作家')
    await expect.poll(() => page.evaluate(() => (window.history.state as { idx?: number } | null)?.idx)).toBe(idxBefore)
    // 4. 確認は1回だけで、URL・画面も鉢作家管理のまま
    await expect(page).toHaveURL(/\/admin\/pot-artists$/)
    expect(dialogs.messages).toEqual([LEAVE_MESSAGE])
    await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toHaveCount(0)
  })

  test('イベントの新規作成: 番号の無い履歴の項目（location.hash で作ったもの）へ戻るときも確認が出て、キャンセルすると入力と URL が残る', /**
     * イベント一覧で location.hash = 'abc' として React Router の番号（idx）の無い履歴の項目を作り、画面の中のリンクで新規作成へ移って入力する。
     * ブラウザの戻るで確認が出ること、キャンセルすると新規作成の URL・入力がそのまま残ることを確かめる。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    const dialogs = answerDialogs(page)
    // 1. イベント一覧で、番号の無い履歴の項目（#abc）を作る
    await page.goto('/admin/events')
    await page.evaluate(() => { window.location.hash = 'abc' })
    await expect(page).toHaveURL(/\/admin\/events#abc$/)
    // 2. 画面の中のリンクで新規作成へ移り、イベント名を入れる
    await page.locator('a[href="/admin/events/new"]').first().click()
    await expect(page).toHaveURL(/\/admin\/events\/new$/)
    const name = page.locator('#event-name')
    await name.fill('書きかけのイベント')
    // 3. 戻る → 確認が出て、キャンセルすると新規作成に残り、入力もそのまま
    await page.goBack({ waitUntil: 'commit' })
    await expect.poll(() => dialogs.messages).toEqual([LEAVE_MESSAGE])
    await expect(page).toHaveURL(/\/admin\/events\/new$/)
    await expect(name).toHaveValue('書きかけのイベント')
    expect(dialogs.messages).toEqual([LEAVE_MESSAGE])
  })

  test('公開ページ: ヘッダーのリンクで移ってから戻る・進むを押しても確認は出ない', /**
     * 公式サイトのトップからヘッダーの Event へ移り、ブラウザの戻る・進むで確認が出ずに移れることを確かめる。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    const dialogs = answerDialogs(page)
    await page.goto('/official')
    await page.getByRole('navigation').first().getByRole('link', { name: 'Event', exact: true }).click()
    await expect(page).toHaveURL(/\/official\/events$/)
    // 1. 戻る → 公式トップ
    await page.goBack({ waitUntil: 'commit' })
    await expect(page).toHaveURL(/\/official$/)
    await expect(page).toHaveTitle('ei8ht plants')
    // 2. 進む → イベント一覧
    await page.goForward({ waitUntil: 'commit' })
    await expect(page).toHaveURL(/\/official\/events$/)
    await expect(page).toHaveTitle('Events | ei8ht plants')
    expect(dialogs.messages).toEqual([])
  })
})
