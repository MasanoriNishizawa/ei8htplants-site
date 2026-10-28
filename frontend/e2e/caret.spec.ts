import { test, expect, type Locator } from '@playwright/test'

// 入力カーソル（| の点滅）の表示制御のテスト
// index.css で body に caret-color: transparent、input / textarea / contenteditable に caret-color: auto を指定している。
// - フォーム以外の要素をクリックしてもカーソルが見えないこと（caret-color が透明）
// - 入力欄ではカーソルが見えること（caret-color が透明でない）＝デグレ確認
// - 文字の選択・コピーは残っていること（user-select が none でない）
// VITE_MSW=true VITE_SKIP_ADMIN_AUTH=true（npm run mock:e2e）で実行し、本番には接続しない

/** 透明を表す computed の caret-color の値 */
const TRANSPARENT = 'rgba(0, 0, 0, 0)'

/**
 * 要素の computed style の値を 1 つ取り出す
 * @param locator 対象の要素
 * @param prop CSS プロパティ名（例: 'caret-color'）
 * @returns getComputedStyle で得た値
 */
async function computed(locator: Locator, prop: string): Promise<string> {
  return locator.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop)
}

test.describe('入力カーソルの表示制御（caret-color）', () => {
  test('公開トップページの body・見出し・段落は caret-color が透明になる', async ({ page }) => {
    // 1. トップページを開く
    await page.goto('/')
    // 2. body は透明
    expect(await computed(page.locator('body'), 'caret-color')).toBe(TRANSPARENT)
    // 3. 見出しと段落（継承で透明になる）
    const heading = page.locator('h1, h2, h3').first()
    await expect(heading).toBeAttached()
    expect(await computed(heading, 'caret-color')).toBe(TRANSPARENT)
    const para = page.locator('p').first()
    await expect(para).toBeAttached()
    expect(await computed(para, 'caret-color')).toBe(TRANSPARENT)
  })

  test('公開トップページの見出し・段落は user-select が none ではなく文字を選択できる', async ({ page }) => {
    // 1. 「公開トップページの見出し・段落は user-select が none ではなく文字を選択できる」の期待状態が画面に表示されることを確認する。
    await page.goto('/')
    const heading = page.locator('h1, h2, h3').first()
    await expect(heading).toBeAttached()
    expect(await computed(heading, 'user-select')).not.toBe('none')
    const para = page.locator('p').first()
    expect(await computed(para, 'user-select')).not.toBe('none')
  })

  test('管理画面イベント一覧の body・見出しは caret-color が透明になり、文字は選択できる', async ({ page }) => {
    // 1. 管理画面のイベント一覧を開く（認証はスキップ済み）
    await page.goto('/admin/events')
    const heading = page.getByRole('heading').first()
    await expect(heading).toBeVisible()
    // 2. body・見出しの caret-color が透明
    expect(await computed(page.locator('body'), 'caret-color')).toBe(TRANSPARENT)
    expect(await computed(heading, 'caret-color')).toBe(TRANSPARENT)
    // 3. 見出しの文字は選択可能
    expect(await computed(heading, 'user-select')).not.toBe('none')
  })

  test('イベント編集画面のテキスト入力欄は caret-color が透明ではない（入力カーソルが見える）', async ({ page }) => {
    // 1. 既存イベントの編集画面を開く
    await page.goto('/admin/events/mock-upcoming-1/edit')
    const input = page.getByRole('textbox').first()
    await expect(input).toBeVisible()
    // 2. 入力欄の caret-color が透明でない
    const caret = await computed(input, 'caret-color')
    expect(caret).not.toBe(TRANSPARENT)
    expect(caret).not.toBe('transparent')
  })

  test('イベント新規作成画面の入力欄をクリックするとフォーカスされ文字を入力できる', async ({ page }) => {
    await page.goto('/admin/events/new')
    const input = page.locator('input[type="text"], input:not([type])').first()
    await expect(input).toBeVisible()
    // 1. クリックしてフォーカス → 2. 入力 → 3. 値が反映される
    await input.click()
    await expect(input).toBeFocused()
    await input.fill('カーソル確認')
    await expect(input).toHaveValue('カーソル確認')
  })

  test('管理情報ページの textarea は caret-color が透明ではない（入力カーソルが見える）', async ({ page }) => {
    // 1. イベント管理情報の編集画面を開く（MSW の収支モックがある mock-past-1 を使う。確認画面には入力欄が無いため /edit）
    await page.goto('/admin/events/mock-past-1/admin-info/edit')
    const textarea = page.locator('textarea').first()
    await expect(textarea).toBeVisible()
    // 2. textarea の caret-color が透明でない
    const caret = await computed(textarea, 'caret-color')
    expect(caret).not.toBe(TRANSPARENT)
    expect(caret).not.toBe('transparent')
  })
})
