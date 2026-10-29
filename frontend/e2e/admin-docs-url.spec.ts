import { test, expect } from '@playwright/test'

// 管理画面「設計書」の URL（?path=）と、スマホ幅の目次の開閉の画面テスト（MSW の設計書のモックを使う。本番には接続しない）
// モック（src/mocks/data.ts の MOCK_DOC_TREE）: 03_PM/05_エージェント設計書.md、04_TEST/01_マスターテスト計画書.md、04_TEST/07_テストケース一覧.md
// 確かめること:
//   - 設計書を選ぶと URL に ?path= が入り、ブラウザの戻る・進むで前・次の設計書になる
//   - ?path= の URL を直接開くとその設計書が開く
//   - スマホ幅（375px）では目次の開閉ボタンがあり、設計書を選ぶと目次が閉じて本文が見える

/** 1 つ目の設計書（テスト計画） */
const DOC_A = '04_TEST/01_マスターテスト計画書.md'
/** 2 つ目の設計書（エージェント設計書） */
const DOC_B = '03_PM/05_エージェント設計書.md'

test.beforeEach(async ({ page }) => {
  // Supabase への通信を遮断する
  await page.context().route(/supabase\.co/, (route) => route.abort())
})

test.describe('設計書の ?path=', () => {
  test('選ぶと ?path= が入り、ブラウザの戻る・進むで前・次の設計書に切り替わる', /**
     * 「/admin/docs」を開く、「04_TEST」をクリックする、「01_マスターテスト計画書」をクリックする、「マスターテスト計画書」が画面に表示されること、「エージェント設計書」が画面に表示されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    await page.goto('/admin/docs')
    // 1. 1 つ目を選ぶ
    await page.getByText('04_TEST').click()
    await page.getByText('01_マスターテスト計画書').click()
    await expect(page.getByRole('heading', { level: 1, name: /マスターテスト計画書/ })).toBeVisible()
    expect(decodeURIComponent(new URL(page.url()).search)).toBe(`?path=${DOC_A}`)
    // 2. 2 つ目を選ぶ
    await page.getByText('03_PM').click()
    await page.getByText('05_エージェント設計書').click()
    await expect(page.getByRole('heading', { level: 1, name: /エージェント設計書/ })).toBeVisible()
    expect(decodeURIComponent(new URL(page.url()).search)).toBe(`?path=${DOC_B}`)
    // 3. 戻る → 1 つ目、進む → 2 つ目
    await page.goBack()
    await expect(page.getByRole('heading', { level: 1, name: /マスターテスト計画書/ })).toBeVisible()
    await page.goForward()
    await expect(page.getByRole('heading', { level: 1, name: /エージェント設計書/ })).toBeVisible()
  })

  test('?path= の URL を直接開くとその設計書が開く', /**
     * 「/admin/docs?path=…」を開く、「エージェント設計書」が画面に表示されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 文書パス付きURLを直接開き、指定した設計書の本文が表示されることを確認する。
    await page.goto(`/admin/docs?path=${encodeURIComponent(DOC_B)}`)
    await expect(page.getByRole('heading', { level: 1, name: /エージェント設計書/ })).toBeVisible()
  })

  test('モックに無いパス（doc/ の外など）を直接開くと本文を出さずにエラーを出す', /**
     存在しない文書パスをURLで開き、エラーを表示して本文領域を描画しないことを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 許可されていない文書パスを開き、エラーを表示してMarkdown本文を描画しないことを確認する。
    await page.goto(`/admin/docs?path=${encodeURIComponent('../backend/.env')}`)
    await expect(page.getByRole('main').getByRole('alert')).toBeVisible()
    await expect(page.locator('.docs-markdown')).toHaveCount(0)
  })
})

test.describe('スマホ幅（375px）の目次', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('最初は目次が開いていて、設計書を選ぶと目次が閉じ、開閉ボタンでまた開ける', /**
     * 「/admin/docs」を開く、「04_TEST」をクリックする、「01_マスターテスト計画書」をクリックする、「マスターテスト計画書」が画面に表示されること、「03_PM」が画面に表示されないことを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    await page.goto('/admin/docs')
    const toggle = page.getByRole('button', { name: '目次を閉じる' })
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    // 1. 設計書を選ぶと目次が閉じる
    await page.getByText('04_TEST').click()
    await page.getByText('01_マスターテスト計画書').click()
    await expect(page.getByRole('heading', { level: 1, name: /マスターテスト計画書/ })).toBeVisible()
    // スマートフォン幅の目次を開くボタンのロケーター。
    const openBtn = page.getByRole('button', { name: '目次を開く' })
    await expect(openBtn).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByText('03_PM')).toBeHidden()
    // 2. 開閉ボタンで目次をまた開ける
    await openBtn.click()
    await expect(page.getByText('03_PM')).toBeVisible()
    await expect(page.getByRole('button', { name: '目次を閉じる' })).toHaveAttribute('aria-expanded', 'true')
  })

  test('?path= を直接開いたときは目次を閉じた状態で本文を出す', /**
     * 「/admin/docs?path=…」を開く、「マスターテスト計画書」が画面に表示されること、「目次を開く」が画面に表示されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 文書パス付きURLを直接開き、目次は閉じた状態で対象文書の見出しと本文を表示することを確認する。
    await page.goto(`/admin/docs?path=${encodeURIComponent(DOC_A)}`)
    await expect(page.getByRole('heading', { level: 1, name: /マスターテスト計画書/ })).toBeVisible()
    await expect(page.getByRole('button', { name: '目次を開く' })).toBeVisible()
  })
})
