import { test, expect, type Page, type Locator } from '@playwright/test'

// イベント画像DLページと、管理情報ページの「出店要項」セクションの画面テスト
// VITE_MSW=true VITE_SKIP_ADMIN_AUTH=true（npm run mock:e2e）で実行する。本番には接続しない
// モックデータ: mock-past-1（Habitat Exhibition 2026）
//   - イベント画像 1 枚（placehold.co）
//   - 管理情報の出店要項: 文章 + 画像 3 枚（public/img のローカル画像。src/mocks/data.ts の MOCK_ADMIN_INFO）

// 【認証まわりの前提】
// 管理情報（getAdminInfo / getFinances）や予約一覧（reserve.list）は authRequest を使い、Supabase のログインセッションが
// ないと fetch の前に「401 Unauthorized」を投げて MSW まで届かない。VITE_SKIP_ADMIN_AUTH はログイン画面を飛ばすだけで
// authRequest には効かないため、このテストでは localStorage の Supabase セッション（sb-*-auth-token）の読み出しを
// 差し替えて、有効期限の遠い偽セッションを返す。期限が遠いので supabase-js はトークン更新の通信をしない。
// 念のため *.supabase.co への通信はすべて遮断し、本番には一切接続しないようにする
// TODO: known issue — VITE_SKIP_ADMIN_AUTH=true でも authRequest が 401 になるため、既存 E2E（admin-pages / caret）の
//       管理画面は認証つき API が失敗した状態で表示されている（イベント一覧が「予定なし」になる等）

/**
 * 偽の管理者セッションを入れ、Supabase への通信を遮断する
 * @param page - 対象ページ（goto より前に呼ぶ）
 */
async function useFakeAdminSession(page: Page) {
  // 1. Supabase（認証・DB）への通信をすべて遮断する
  await page.context().route(/supabase\.co/, (route) => route.abort())
  // 2. ページの読み込み前に localStorage.getItem を差し替え、Supabase のセッションキーだけ偽セッションを返す
  await page.addInitScript(() => {
    const fakeSession = {
      access_token: 'e2e-fake-access-token',
      token_type: 'bearer',
      expires_in: 3600,
      // 2100 年まで有効（期限切れ扱いにしてトークン更新の通信をさせない）
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

// すべてのテストで偽セッションを使う
test.beforeEach(async ({ page }) => {
  await useFakeAdminSession(page)
})

/** 対象イベントの ID */
const EVENT_ID = 'mock-past-1'
/** 対象イベントの名前 */
const EVENT_NAME = 'Habitat Exhibition 2026'

/**
 * 横スクロールが出ていないことを確かめる
 * ページ全体（documentElement）と、管理画面のスクロール領域（main 要素。overflowY: auto のため横にもはみ出しうる）の両方を見る
 * @param page - 対象ページ
 */
async function expectNoHorizontalScroll(page: Page) {
  const sizes = await page.evaluate(() => {
    const main = document.querySelector('main')
    return {
      docScroll: document.documentElement.scrollWidth,
      bodyScroll: document.body.scrollWidth,
      inner: window.innerWidth,
      mainScroll: main?.scrollWidth ?? 0,
      mainClient: main?.clientWidth ?? 0,
    }
  })
  expect(sizes.docScroll, `document の scrollWidth=${sizes.docScroll} / innerWidth=${sizes.inner}`).toBeLessThanOrEqual(sizes.inner)
  expect(sizes.bodyScroll, `body の scrollWidth=${sizes.bodyScroll} / innerWidth=${sizes.inner}`).toBeLessThanOrEqual(sizes.inner)
  expect(sizes.mainScroll, `main の scrollWidth=${sizes.mainScroll} / clientWidth=${sizes.mainClient}`).toBeLessThanOrEqual(sizes.mainClient)
}

/**
 * 要素が画面の横幅の内側に収まっていることを確かめる
 * @param page - 対象ページ
 * @param locator - 対象の要素
 * @param label - 失敗時のメッセージに出す要素名
 */
async function expectWithinViewportX(page: Page, locator: Locator, label: string) {
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  const width = page.viewportSize()!.width
  expect(box, `${label} が表示されていない`).not.toBeNull()
  expect(box!.x, `${label} の左端 x=${box!.x}`).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width, `${label} の右端 ${box!.x + box!.width} / 画面幅 ${width}`).toBeLessThanOrEqual(width)
}

test.describe('イベント画像DLページ', () => {
  test('イベント一覧の「画像DL」から画像一覧ページが開き、出どころ別に画像が並ぶ', async ({ page }) => {
    // 1. イベント一覧で対象イベントの行の「画像DL」を押す（行 = イベント名の2つ上の要素）
    await page.goto('/admin/events')
    const row = page.getByText(EVENT_NAME, { exact: true }).locator('../..')
    await row.getByRole('link', { name: '画像DL' }).click()

    // 2. 画像DLページに移動し、見出しとイベント名が出る
    await expect(page).toHaveURL(new RegExp(`/admin/events/${EVENT_ID}/images$`))
    await expect(page.getByRole('heading', { name: '画像ダウンロード' })).toBeVisible()
    await expect(page.getByText(new RegExp(EVENT_NAME))).toBeVisible()

    // 3. イベント画像 1 枚 + 出店要項 3 枚 = 全 4 枚、グループ見出しに枚数が出る
    await expect(page.getByText('全 4 枚')).toBeVisible()
    await expect(page.getByRole('heading', { name: /イベント画像\s*1 枚/ })).toBeVisible()
    await expect(page.getByRole('heading', { name: /管理情報：出店要項\s*3 枚/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'ダウンロード' })).toHaveCount(4)

    // 4. 戻るリンクでイベント一覧に戻れる
    await page.getByRole('link', { name: /戻る/ }).click()
    await expect(page).toHaveURL(/\/admin\/events$/)
  })

  test('画像が登録されていないイベントでは「このイベントには画像が登録されていません」が出る', async ({ page }) => {
    // mock-upcoming-2 は images: [] / page_content: null / 管理情報 {}
    await page.goto('/admin/events/mock-upcoming-2/images')
    await expect(page.getByText('このイベントには画像が登録されていません')).toBeVisible()
    await expect(page.getByRole('button', { name: 'ダウンロード' })).toHaveCount(0)
  })

  test('出店要項の画像の「ダウンロード」を押すと「イベント名_番号.拡張子」の名前で保存される', async ({ page }) => {
    // 1. ページを開き、出店要項の1枚目（全体の通し番号 02、/img/logo-ei8htplants.png）のボタンを押す
    await page.goto(`/admin/events/${EVENT_ID}/images`)
    const buttons = page.getByRole('button', { name: 'ダウンロード' })
    await expect(buttons).toHaveCount(4)
    const downloadPromise = page.waitForEvent('download')
    await buttons.nth(1).click()

    // 2. 保存されるファイル名を確認する
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe(`${EVENT_NAME}_02.png`)
    await expect(page.getByText(/ダウンロードに失敗しました/)).toHaveCount(0)
  })
})

test.describe('管理情報ページ — 出店要項', () => {
  test('出店要項セクションに文章と画像サムネイルが表示される', async ({ page }) => {
    await page.goto(`/admin/events/${EVENT_ID}/admin-info`)
    // 1. セクション見出しと文章
    await expect(page.getByText('出店要項', { exact: true })).toBeVisible()
    await expect(page.getByLabel('要項の文章')).toHaveValue('出店要項モック本文\n搬入は9時までに完了してください。')
    // 2. 画像 3 枚のサムネイルと枚数表記
    await expect(page.getByText('要項の画像（3 枚）')).toBeVisible()
    await expect(page.getByRole('button', { name: /出店要項の画像 \d+ を拡大表示/ })).toHaveCount(3)
    await expect(page.getByRole('button', { name: '画像を追加' })).toBeVisible()
  })

  test('サムネイルを押すと拡大表示が開き、前へ・次へで切り替わり、Esc と閉じるボタンで閉じる', async ({ page }) => {
    await page.goto(`/admin/events/${EVENT_ID}/admin-info`)

    // 1. 1枚目のサムネイルで拡大表示を開く
    await page.getByRole('button', { name: '出店要項の画像 1 を拡大表示' }).click()
    const dialog = page.getByRole('dialog', { name: '出店要項の画像の拡大表示' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('1 / 3')).toBeVisible()
    await expect(dialog.getByRole('img')).toHaveAttribute('src', '/img/logo-ei8htplants.png')

    // 2. 次へ・前へで切り替わる
    await dialog.getByRole('button', { name: /次へ/ }).click()
    await expect(dialog.getByText('2 / 3')).toBeVisible()
    await expect(dialog.getByRole('img')).toHaveAttribute('src', '/img/logo-habitatoides.png')
    await dialog.getByRole('button', { name: /前へ/ }).click()
    await expect(dialog.getByText('1 / 3')).toBeVisible()

    // 3. 先頭では前へが aria-disabled になり、押しても閉じず表示も変わらない
    //    （Playwright は aria-disabled のボタンを「押せない」とみなして待ち続けるため force で押す）
    const prev = dialog.getByRole('button', { name: /前へ/ })
    await expect(prev).toHaveAttribute('aria-disabled', 'true')
    await prev.click({ force: true })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('1 / 3')).toBeVisible()

    // 4. Esc で閉じる
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()

    // 5. 3枚目から開き直して閉じるボタンで閉じる
    await page.getByRole('button', { name: '出店要項の画像 3 を拡大表示' }).click()
    await expect(dialog.getByText('3 / 3')).toBeVisible()
    await dialog.getByRole('button', { name: '閉じる' }).click()
    await expect(dialog).toBeHidden()
  })
})

test.describe('スマホ幅（375x812）の表示崩れ確認', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('管理情報ページで横スクロールが出ず、主要ボタンが画面内に収まる', async ({ page }) => {
    await page.goto(`/admin/events/${EVENT_ID}/admin-info`)
    await expect(page.getByText('要項の画像（3 枚）')).toBeVisible()

    // 1. 横スクロールが出ていない
    await expectNoHorizontalScroll(page)

    // 2. 主要ボタンが画面の横幅に収まる
    await expectWithinViewportX(page, page.getByRole('button', { name: '画像を追加' }), '画像を追加ボタン')
    await expectWithinViewportX(page, page.getByRole('button', { name: '保存する' }), '保存するボタン')
    const removeButtons = page.getByRole('button', { name: '削除' })
    await expect(removeButtons).toHaveCount(3)
    for (let i = 0; i < 3; i++) {
      await expectWithinViewportX(page, removeButtons.nth(i), `削除ボタン ${i + 1}`)
      await expectWithinViewportX(page, page.getByRole('button', { name: `出店要項の画像 ${i + 1} を拡大表示` }), `サムネイル ${i + 1}`)
    }
    await expectWithinViewportX(page, page.getByLabel('要項の文章'), '要項の文章欄')
  })

  test('管理情報ページの拡大表示がスマホ幅でも画面内に収まり、閉じられる', async ({ page }) => {
    await page.goto(`/admin/events/${EVENT_ID}/admin-info`)
    await page.getByRole('button', { name: '出店要項の画像 2 を拡大表示' }).click()
    const dialog = page.getByRole('dialog', { name: '出店要項の画像の拡大表示' })
    await expect(dialog).toBeVisible()

    // 1. 閉じる・前へ・次へ・画像が画面の横幅に収まる
    await expectWithinViewportX(page, dialog.getByRole('button', { name: '閉じる' }), '閉じるボタン')
    await expectWithinViewportX(page, dialog.getByRole('button', { name: /前へ/ }), '前へボタン')
    await expectWithinViewportX(page, dialog.getByRole('button', { name: /次へ/ }), '次へボタン')
    await expectWithinViewportX(page, dialog.getByRole('img'), '拡大画像')
    await expectNoHorizontalScroll(page)

    // 2. 閉じるで閉じる
    await dialog.getByRole('button', { name: '閉じる' }).click()
    await expect(dialog).toBeHidden()
  })

  test('画像DLページで横スクロールが出ず、ダウンロードボタンが画面内に収まる', async ({ page }) => {
    await page.goto(`/admin/events/${EVENT_ID}/images`)
    const buttons = page.getByRole('button', { name: 'ダウンロード' })
    await expect(buttons).toHaveCount(4)

    // 1. 横スクロールが出ていない
    await expectNoHorizontalScroll(page)

    // 2. 全カードのダウンロードボタンが画面の横幅に収まる
    for (let i = 0; i < 4; i++) {
      await expectWithinViewportX(page, buttons.nth(i), `ダウンロードボタン ${i + 1}`)
    }
    await expectWithinViewportX(page, page.getByRole('link', { name: /戻る/ }), '戻るリンク')
  })

  test('イベント一覧で「画像DL」リンクが画面内に収まり、横スクロールが出ない', async ({ page }) => {
    await page.goto('/admin/events')
    const row = page.getByText(EVENT_NAME, { exact: true }).locator('../..')
    await expectWithinViewportX(page, row.getByRole('link', { name: '画像DL' }), '画像DLリンク')
    await expectNoHorizontalScroll(page)
  })
})

/**
 * 管理情報ページの入力欄（checkbox・radio・range・file 以外の input、textarea、select）の computed font-size を集める
 * @param page - 対象ページ
 * @returns 要素の説明と font-size の一覧
 */
async function collectFieldFontSizes(page: Page) {
  return page.evaluate(() => {
    const fields = Array.from(document.querySelectorAll('main input, main textarea, main select')) as HTMLElement[]
    return fields
      .filter((el) => !(el instanceof HTMLInputElement && ['checkbox', 'radio', 'range', 'file'].includes(el.type)))
      .map((el) => ({
        field: `${el.tagName.toLowerCase()}${el instanceof HTMLInputElement ? `[type=${el.type}]` : ''}${el.id ? `#${el.id}` : ''}`,
        fontSize: getComputedStyle(el).fontSize,
      }))
  })
}

test.describe('入力欄の文字サイズ（iOS の自動拡大対策）', () => {
  test.describe('スマホ幅（375x812）', () => {
    test.use({ viewport: { width: 375, height: 812 } })

    test('管理情報ページの input・textarea・select がすべて 16px になる', async ({ page }) => {
      await page.goto(`/admin/events/${EVENT_ID}/admin-info`)
      await expect(page.getByLabel('要項の文章')).toBeVisible()

      // 1. 入力欄が一通りそろっている（日付 3・数値 2・テキスト 1・select 5・textarea 2）
      const sizes = await collectFieldFontSizes(page)
      expect(sizes.filter((s) => s.field.startsWith('select')).length).toBeGreaterThanOrEqual(5)
      expect(sizes.filter((s) => s.field.startsWith('textarea')).length).toBe(2)
      expect(sizes.filter((s) => s.field.startsWith('input')).length).toBeGreaterThanOrEqual(6)

      // 2. すべて 16px（インラインの 14px・15px が上書きされている）
      for (const s of sizes) {
        expect(s.fontSize, `${s.field} の font-size`).toBe('16px')
      }
    })

    test('チェックボックスとファイル選択欄は 16px の対象外', async ({ page }) => {
      await page.goto(`/admin/events/${EVENT_ID}/admin-info`)
      await expect(page.getByLabel('要項の文章')).toBeVisible()
      // ルールの :not() 指定どおり、checkbox と file はスマホ幅のルールの影響を受けない
      // （checkbox・file はもともと別の全体指定で 16px のため、値そのものではなくデスクトップ幅と同じ値であることを確かめる）
      const checkbox = page.locator('main input[type="checkbox"]')
      const file = page.locator('main input[type="file"]')
      await expect(checkbox).toHaveCount(1)
      await expect(file).toHaveCount(1)
      const fontSize = (loc: Locator) => loc.evaluate((el) => getComputedStyle(el).fontSize)
      const mobile = { checkbox: await fontSize(checkbox), file: await fontSize(file) }
      // デスクトップ幅に広げても値が変わらない＝スマホ用ルールが当たっていない
      await page.setViewportSize({ width: 1280, height: 800 })
      await expect.poll(() => fontSize(page.getByLabel('要項の文章'))).toBe('14px')
      expect(await fontSize(checkbox)).toBe(mobile.checkbox)
      expect(await fontSize(file)).toBe(mobile.file)
    })
  })

  test.describe('デスクトップ幅（1280x800）', () => {
    test.use({ viewport: { width: 1280, height: 800 } })

    test('管理情報ページの入力欄は各画面の指定どおり（16px に上書きされない）', async ({ page }) => {
      await page.goto(`/admin/events/${EVENT_ID}/admin-info`)
      await expect(page.getByLabel('要項の文章')).toBeVisible()

      // 1. 画面のインライン指定の値のまま（要項の文章 14px・日付 15px・時の select 15px）
      const fontSize = (loc: Locator) => loc.evaluate((el) => getComputedStyle(el).fontSize)
      expect(await fontSize(page.getByLabel('要項の文章'))).toBe('14px')
      expect(await fontSize(page.locator('main input[type="date"]').first())).toBe('15px')
      expect(await fontSize(page.locator('main select').first())).toBe('15px')

      // 2. 全部が 16px になっているわけではない（スマホ用のルールが効いていない）
      const sizes = await collectFieldFontSizes(page)
      expect(sizes.some((s) => s.fontSize !== '16px')).toBe(true)
    })
  })

  test.describe('境界の幅', () => {
    test('767px では 16px、768px では元の値になる', async ({ page }) => {
      // 1. 767px（スマホ用ルールの上限）
      await page.setViewportSize({ width: 767, height: 900 })
      await page.goto(`/admin/events/${EVENT_ID}/admin-info`)
      const textarea = page.getByLabel('要項の文章')
      await expect(textarea).toBeVisible()
      expect(await textarea.evaluate((el) => getComputedStyle(el).fontSize)).toBe('16px')

      // 2. 768px にすると元の 14px に戻る
      await page.setViewportSize({ width: 768, height: 900 })
      await expect.poll(() => textarea.evaluate((el) => getComputedStyle(el).fontSize)).toBe('14px')
    })
  })
})
