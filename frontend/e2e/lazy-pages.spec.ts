import { test, expect, type Page } from '@playwright/test'

// 公開ページを画面ごとに分けて読み込む（React.lazy）ようにしたあとも、
// ヘッダーのリンクで順にページを移ったときに各ページがきちんと表示されることを確かめる画面テスト。
// VITE_MSW=true VITE_SKIP_ADMIN_AUTH=true（npm run mock:e2e）で実行する。本番には接続しない

/**
 * ページで起きた JavaScript のエラーを集める
 * @param page - 対象ページ
 * @returns エラーの文を入れていく配列
 */
function collectPageErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  return errors
}

/**
 * ページの読み込み中の表示（PageLoading）が残っていないことを確かめる
 * @param page - 対象ページ
 */
async function expectLoaded(page: Page) {
  await expect(page.getByRole('status').filter({ hasText: /読み込み中\.\.\.|Loading\.\.\./ })).toHaveCount(0)
}

/**
 * 横スクロールが出ていないかを確かめる
 * @param page - 対象ページ
 */
async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
}

/** ヘッダーのリンク名・移った先のパス・ページのタイトル（PageMeta） */
const HEADER_STEPS: { link: string; path: RegExp; title: string }[] = [
  { link: 'Event', path: /\/events$/, title: 'Events | ei8ht plants' },
  { link: 'Gallery', path: /\/gallery$/, title: 'Gallery | ei8ht plants' },
  { link: 'Concept', path: /\/concept$/, title: 'Concept | ei8ht plants' },
  { link: 'Stockists', path: /\/stockists$/, title: 'Stockists | ei8ht plants' },
  { link: 'Collabs', path: /\/collaborations$/, title: 'Collaborations | ei8ht plants' },
  { link: 'Media', path: /\/media$/, title: 'Media | ei8ht plants' },
  { link: 'Contact', path: /\/contact$/, title: 'Contact | ei8ht plants' },
  { link: 'Home', path: /\/$/, title: 'ei8ht plants' },
]

test.describe('画面ごとの読み込みにしたあとの公開ページの移動', () => {
  test('トップからヘッダーのリンクで主要ページを順に開くと、それぞれのページが表示される', async ({ page }) => {
    const errors = collectPageErrors(page)
    await page.goto('/')
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 20000 })
    for (const step of HEADER_STEPS) {
      await page.getByRole('navigation').first().getByRole('link', { name: step.link, exact: true }).click()
      await expect(page).toHaveURL(step.path)
      await expect(page).toHaveTitle(step.title, { timeout: 15000 })
      await expectLoaded(page)
      // ヘッダー・フッターは表示されたまま
      await expect(page.getByRole('navigation').first()).toBeVisible()
    }
    expect(errors).toEqual([])
  })

  test('ヘッダーの Shop から Journal・Shop へ移っても表示される（StoreLayout）', async ({ page }) => {
    const errors = collectPageErrors(page)
    await page.goto('/')
    await page.getByRole('link', { name: 'Shop', exact: true }).first().click()
    await expect(page).toHaveURL(/\/shop$/)
    await expect(page).toHaveTitle('Shop | ei8ht plants', { timeout: 15000 })
    await page.getByRole('link', { name: 'Journal', exact: true }).first().click()
    await expect(page).toHaveURL(/\/journal$/)
    await expect(page).toHaveTitle('Journal | ei8ht plants', { timeout: 15000 })
    await expectLoaded(page)
    expect(errors).toEqual([])
  })

  test('右下のチャットボタンから AI コンシェルジュを開くとタイトルが二重にならない', async ({ page }) => {
    await page.goto('/')
    await page.locator('a.chat-fab').click()
    await expect(page).toHaveURL(/\/chat$/)
    await expect(page).toHaveTitle('AI コンシェルジュ | ei8ht plants', { timeout: 15000 })
  })

  test('ブラウザの戻る・進むでも前のページが表示される', async ({ page }) => {
    await page.goto('/gallery')
    await expect(page).toHaveTitle('Gallery | ei8ht plants', { timeout: 20000 })
    await page.getByRole('navigation').first().getByRole('link', { name: 'Concept', exact: true }).click()
    await expect(page).toHaveTitle('Concept | ei8ht plants', { timeout: 15000 })
    await page.goBack()
    await expect(page).toHaveURL(/\/gallery$/)
    await expect(page).toHaveTitle('Gallery | ei8ht plants')
    await page.goForward()
    await expect(page).toHaveURL(/\/concept$/)
    await expect(page).toHaveTitle('Concept | ei8ht plants')
  })

  test('トップを開いただけでは管理画面と Supabase のプログラムを読み込まない', async ({ page }) => {
    const requested: string[] = []
    page.on('request', (req) => requested.push(new URL(req.url()).pathname))
    await page.goto('/')
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 20000 })
    await page.waitForLoadState('networkidle')
    // 開発サーバーではファイルごとに読み込まれるので、パスで確かめる
    // adminPages.ts はページを読み込む関数の一覧だけ（App.tsx が直接読む）なので除く
    expect(requested.filter((p) => p.startsWith('/src/pages/admin/') && p !== '/src/pages/admin/adminPages.ts')).toEqual([])
    expect(requested.filter((p) => p === '/src/lib/supabase.ts')).toEqual([])
  })

  test('URL を直接開いても管理画面のページが表示される', async ({ page }) => {
    await page.goto('/admin/events')
    await expect(page.getByRole('complementary').getByRole('link', { name: 'イベント' })).toBeVisible({ timeout: 20000 })
    await expectLoaded(page)
  })

  for (const path of ['/', '/events', '/gallery', '/shop', '/journal', '/chat']) {
    test(`375px 幅で ${path} を開いても横スクロールが出ない`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 })
      await page.goto(path)
      await expect(page.getByRole('navigation').first()).toBeAttached({ timeout: 20000 })
      await expectLoaded(page)
      await expectNoHorizontalScroll(page)
    })
  }
})
