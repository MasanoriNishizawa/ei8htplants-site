import { test, expect, type Page } from '@playwright/test'

// 画面の幅・高さに収まるかの画面テスト（MSW のモックで実行。本番には接続しない）
// 1. PC の管理画面で、高さ 700px でもサイドメニューの一番下の「ログアウト」までスクロールして届く
// 2. スマホ幅（375px）の /legal（特定商取引法の表記）で横スクロールが出ない
// 3. スマホ幅の管理画面の商品一覧・収支一覧で、「編集」「削除」のボタンが画面の右にはみ出さない
// 4. ショップのヘッダー（StoreHeader）: スマホ幅でカートがあってもロゴが縮まず、横スクロールが出ない（スクリーンショットを添付する）

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
 * 文書全体に横スクロールが出ていないかを確かめる
 * @param page - 対象ページ
 */
async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
}

/**
 * ボタン・リンクが画面の左右に収まっているかを確かめる（横にスクロールしなくても押せる）
 * @param page - 対象ページ
 * @param name - ボタン・リンクの名前
 */
async function expectAllInsideWidth(page: Page, name: string) {
  const width = page.viewportSize()!.width
  const targets = page.getByRole('main').getByRole('button', { name, exact: true })
    .or(page.getByRole('main').getByRole('link', { name, exact: true }))
  const count = await targets.count()
  expect(count, `「${name}」が見つからない`).toBeGreaterThan(0)
  for (let i = 0; i < count; i++) {
    const box = await targets.nth(i).boundingBox()
    expect(box, `「${name}」が表示されていない`).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(width + 0.5)
  }
}

test.describe('PC の管理画面のサイドメニュー（1280x700）', () => {
  test.use({ viewport: { width: 1280, height: 700 } })

  test('高さ 700px でもサイドメニューをスクロールして一番下の「ログアウト」に届き、押せる位置に来る', async ({ page }) => {
    await useFakeAdminSession(page)
    await page.goto('/admin')
    const aside = page.getByRole('complementary')
    const logout = aside.getByRole('button', { name: 'ログアウト' })
    await expect(logout).toBeAttached()
    // 1. サイドメニュー自体がスクロールできる（中身が高さより長い）
    const { scrollHeight, clientHeight } = await aside.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }))
    expect(clientHeight).toBeLessThanOrEqual(700)
    expect(scrollHeight).toBeGreaterThanOrEqual(clientHeight)
    // 2. スクロールすると画面内に入り、押せる
    await logout.scrollIntoViewIfNeeded()
    await expect(logout).toBeInViewport()
    await expect(logout).toBeEnabled()
  })
})

test.describe('スマホ幅（375px）', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('/legal で横スクロールが出ない', async ({ page }) => {
    await page.context().route(/supabase\.co/, (route) => route.abort())
    await page.goto('/official/legal')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expectNoHorizontalScroll(page)
  })

  test('管理画面の商品一覧で、各行の「編集」「削除」が画面の右にはみ出さない', async ({ page }) => {
    await useFakeAdminSession(page)
    await page.goto('/admin/products')
    await expect(page.getByRole('main').getByRole('button', { name: '編集', exact: true }).first()).toBeVisible()
    await expectAllInsideWidth(page, '編集')
    await expectAllInsideWidth(page, '削除')
  })

  test('管理画面の収支一覧で、各行の「編集」が画面の右にはみ出さない', async ({ page }) => {
    await useFakeAdminSession(page)
    await page.goto('/admin/finances')
    await expect(page.getByRole('main').getByRole('link', { name: '編集', exact: true }).first()).toBeVisible()
    await expectAllInsideWidth(page, '編集')
  })
})

test.describe('ショップのヘッダー（StoreHeader）', () => {
  /**
   * ショップのヘッダーのロゴの幅を返す
   * @param page - 対象ページ
   * @returns ロゴの幅（px）
   */
  async function logoWidth(page: Page): Promise<number> {
    const logo = page.getByRole('banner').getByRole('img', { name: 'ei8ht plants' })
    await expect.poll(() => logo.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true)
    return (await logo.boundingBox())!.width
  }

  test('320px・375px でカートに商品があってもロゴは PC と同じ幅のままで、カートと言語ボタンが画面内に収まる', async ({ page }, testInfo) => {
    await page.context().route(/supabase\.co/, (route) => route.abort())
    // 1. PC の幅でのロゴの幅を測る
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/official/shop/p-1')
    await page.getByRole('button', { name: /カートに入れる/ }).click()
    const pcWidth = await logoWidth(page)
    // 2. スマホの幅でも同じ幅（縮まない）
    for (const width of [375, 320]) {
      await page.setViewportSize({ width, height: 812 })
      await page.goto('/official/shop')
      const cart = page.getByRole('banner').getByRole('link', { name: /Cart/ })
      await expect(cart).toBeVisible()
      expect(Math.abs((await logoWidth(page)) - pcWidth)).toBeLessThanOrEqual(1)
      // カート・言語ボタンが画面の右端に収まる
      for (const el of [cart, page.getByRole('banner').getByRole('button', { name: 'Switch to English' })]) {
        const box = (await el.boundingBox())!
        expect(box.x + box.width).toBeLessThanOrEqual(width + 0.5)
      }
      await expectNoHorizontalScroll(page)
      await testInfo.attach(`store-header-${width}.png`, { body: await page.getByRole('banner').screenshot(), contentType: 'image/png' })
    }
  })

  test('言語切り替えボタンで EN と JA が切り替わる', async ({ page }) => {
    await page.context().route(/supabase\.co/, (route) => route.abort())
    await page.goto('/official/shop')
    const banner = page.getByRole('banner')
    await banner.getByRole('button', { name: 'Switch to English' }).click()
    await expect(banner.getByRole('button', { name: '日本語に切り替える' })).toHaveText('JA')
    await banner.getByRole('button', { name: '日本語に切り替える' }).click()
    await expect(banner.getByRole('button', { name: 'Switch to English' })).toHaveText('EN')
  })
})
