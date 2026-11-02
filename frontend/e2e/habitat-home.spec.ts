import { test, expect, type Page } from '@playwright/test'

// Habitat Oides のトップページ（/habitatoides）の動きの演出と、スマホ幅の横スクロールを確かめる。
// API は MSW のモック（habitat-hero-01 と habitat-object-01 だけ URL あり）で受ける。

/** スプラッシュを出したことを記録する sessionStorage のキー */
const SPLASH_KEY = 'habitat-oides-splash-shown'

/**
 * ページを開く前に sessionStorage に記録を入れ、スプラッシュを出さないようにする。
 * @param page 操作対象の Playwright ページ
 * @returns {Promise<void>} 設定が終わったら解決する
 */
async function skipSplash(page: Page) {
  await page.addInitScript((key) => { window.sessionStorage.setItem(key, '1') }, SPLASH_KEY)
}

test.describe('Habitat Oides のトップページの動き', () => {
  test('E2E-AE-01: 一番上の画像・空の枠・サインなし・縦書き見出しが出る（MSW の初期値）', /**
     * スプラッシュを止めて /habitatoides を開き、保存した hero-01 が1枚だけ出て番号がないこと、
     * 画像のないオブジェクトに空の枠、画像のある object-01 に画像が出て、サインは出ないことを確かめる。
     * @param page 操作・検証対象の Playwright ページ
     * @returns {Promise<void>} すべての確認が終わったら解決する
     */
    async ({ page }) => {
    await skipSplash(page)
    await page.goto('/habitatoides')
    await expect(page.locator('.habitat-hero h1')).toBeVisible()
    // 1. 一番上の画像は MSW で保存した URL（localSrc より優先）。1枚なので番号と前後のボタンは出ない
    await expect(page.getByTestId('habitat-hero-slide-habitat-hero-01')).toHaveAttribute('src', '/img/habitatOides/habitat_oides_workshop_main.jpg')
    await expect(page.getByTestId('habitat-hero-slides')).toHaveAttribute('data-autoplay', 'false')
    await expect(page.getByTestId('habitat-hero-controls')).toHaveCount(0)
    // 2. サインは画像がないので出さない
    await expect(page.getByTestId('habitat-brand-sign')).toHaveCount(0)
    // 3. object-01 は画像、02〜05 は空の枠（06 はスマホ幅だけなので数えない）
    await expect(page.getByTestId('habitat-floating-item-habitat-object-01').locator('img')).toHaveAttribute('src', '/img/logo-habitatoides.png')
    for (const n of ['02', '03', '04', '05']) {
      await expect(page.getByTestId(`habitat-placeholder-habitat-object-${n}`)).toHaveCount(1)
    }
    // 4. 縦書き見出しが出る
    await expect(page.getByTestId('habitat-vertical-title')).toBeVisible()
    await expect(page.getByTestId('habitat-splash')).toHaveCount(0)
  })

  test('E2E-AE-02: スプラッシュはタブで1回だけ出て、消えたあとに再読み込みしても出ない', /**
     * sessionStorage を空にして開き、スプラッシュが出て消えること、記録が残ること、再読み込みで出ないことを確かめる。
     * @param page 操作・検証対象の Playwright ページ
     * @returns {Promise<void>} すべての確認が終わったら解決する
     */
    async ({ page }) => {
    await page.goto('/habitatoides')
    await expect(page.getByTestId('habitat-splash')).toHaveCount(1)
    // 1. 演出が終わると消える（読み込みの完了 + 1.8 秒。最長の待ちを含めて余裕を持たせる）
    await expect(page.getByTestId('habitat-splash')).toHaveCount(0, { timeout: 15000 })
    expect(await page.evaluate((key) => window.sessionStorage.getItem(key), SPLASH_KEY)).toBe('1')
    // 2. 同じタブで再読み込みしても出ない
    await page.reload()
    await expect(page.locator('.habitat-hero h1')).toBeVisible()
    await expect(page.getByTestId('habitat-splash')).toHaveCount(0)
  })

  test('E2E-AE-03: 動きを減らす設定ではスプラッシュを出さず、画像は最初から表示済みになる', /**
     * reducedMotion: reduce で開き、スプラッシュがなく、自動切り替えが止まり、画像の出方の演出が最初から終わっていることを確かめる。
     * @param page 操作・検証対象の Playwright ページ
     * @returns {Promise<void>} すべての確認が終わったら解決する
     */
    async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/habitatoides')
    await expect(page.locator('.habitat-hero h1')).toBeVisible()
    await expect(page.getByTestId('habitat-splash')).toHaveCount(0)
    await expect(page.getByTestId('habitat-hero-slides')).toHaveClass(/habitat-hero-slides--static/)
    // 画面の外の画像も、最初から表示済み
    const reveals = page.getByTestId('habitat-reveal')
    const count = await reveals.count()
    expect(count).toBeGreaterThan(0)
    for (let i = 0; i < count; i += 1) {
      await expect(reveals.nth(i)).toHaveAttribute('data-revealed', 'true')
    }
    // パララックスのずれはかからない
    await expect(page.getByTestId('habitat-floating-item-habitat-object-01')).toHaveAttribute('style', /^(?!.*translate3d)/)
  })

  test('E2E-AE-04: 375px 幅でページの最後までスクロールしても横スクロールが出ない', /**
     * 375×812 で開き、上から下までスクロールしながら、ページの幅が画面の幅を超えないことを確かめる。
     * @param page 操作・検証対象の Playwright ページ
     * @returns {Promise<void>} すべての確認が終わったら解決する
     */
    async ({ page }) => {
    await skipSplash(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/habitatoides')
    await expect(page.locator('.habitat-hero h1')).toBeVisible()
    // 1. スマホ幅だけの object-06 が出る
    await expect(page.getByTestId('habitat-floating-item-habitat-object-06')).toBeVisible()
    // 2. 何か所かにスクロールし、それぞれで横にはみ出していないことを確かめる
    const height = await page.evaluate(() => document.documentElement.scrollHeight)
    for (const ratio of [0, 0.25, 0.5, 0.75, 1]) {
      await page.evaluate((y) => window.scrollTo(0, y), Math.round(height * ratio))
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow).toBeLessThanOrEqual(0)
    }
  })
  test('E2E-AE-05: 公式ドメインの /habitatoides では、スライダーの操作とサインがチャットボタンより上にあり重ならない', /**
     * MSW に hero-02 とサインを保存してから画面の中で開き直し、PC 幅とスマホ幅で、操作部分とサインの下端が
     * チャットボタン（.chat-fab）の上端より上にあることと、3秒で自動で切り替わることを確かめる。
     * @param page 操作・検証対象の Playwright ページ
     * @returns {Promise<void>} すべての確認が終わったら解決する
     */
    async ({ page }) => {
    await skipSplash(page)
    await page.goto('/habitatoides')
    await expect(page.locator('.habitat-hero h1')).toBeVisible()
    // 1. MSW（ブラウザのメモリ）に 2 枚目の画像とサインを保存し、画面の中の移動で開き直して取り直させる
    await page.evaluate(async () => {
      for (const [key, url] of [['habitat-hero-02', '/img/habitatOides/habitat_oides_hero.jpg'], ['habitat-sign', '/img/logo-habitatoides.png']]) {
        await fetch(`/api/site-assets/${key}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) })
      }
      window.history.pushState({}, '', '/official')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    await expect(page.locator('.home-hero')).toBeVisible()
    await page.evaluate(() => {
      window.history.pushState({}, '', '/habitatoides')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    const controls = page.getByTestId('habitat-hero-controls')
    await expect(controls).toBeVisible()
    await expect(page.getByTestId('habitat-hero-counter')).toHaveText(/01\s*\/\s*02/)
    // 2. マウスがヒーローにかからない位置で、3秒たつと 02 に進む
    await page.mouse.move(0, 0)
    await expect(page.getByTestId('habitat-hero-counter')).toHaveText(/02\s*\/\s*02/, { timeout: 6000 })
    // 3. PC 幅とスマホ幅で、操作部分とサインがチャットボタンより上にある
    for (const size of [{ width: 1280, height: 800 }, { width: 375, height: 812 }]) {
      await page.setViewportSize(size)
      await page.evaluate(() => window.scrollTo(0, 0))
      const fab = await page.locator('.chat-fab').boundingBox()
      const sign = await page.getByTestId('habitat-brand-sign').boundingBox()
      const box = await controls.boundingBox()
      expect(fab).not.toBeNull()
      expect(sign).not.toBeNull()
      expect(box).not.toBeNull()
      expect(sign!.y + sign!.height).toBeLessThanOrEqual(fab!.y)
      // 操作部分はヒーローの中（画面の高さいっぱい）なので、一番上までスクロールした状態で比べる
      expect(box!.y + box!.height).toBeLessThanOrEqual(fab!.y)
    }
  })
})
