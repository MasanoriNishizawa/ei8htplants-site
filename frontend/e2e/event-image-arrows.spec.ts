import { test, expect, type Page } from '@playwright/test'

// イベントの写真の左右矢印（前へ・次へ）が、写真の上下の真ん中に置かれていることを確かめる画面テスト
// VITE_MSW=true VITE_SKIP_ADMIN_AUTH=true（npm run mock:e2e）で実行する。本番には接続しない
// モックデータ: mock-upcoming-1（Green Market 2027）
//   - 写真 2 枚（public/img のローカル画像。src/mocks/data.ts の MOCK_EVENTS）
//   - 開始日がいちばん早いので、ホーム（/）の「Next Event」の大きいカードにも出る
// 対象の画面と部品:
//   - /events      … イベント一覧の通常のカード（EventPreview。写真は aspectRatio 3/4）
//   - /            … ホームの Next Event の大きいカード（EventPreview horizontal。PC では横並び）
//   - /events/:id  … 公開のイベントサイト（EventSite。写真は height: auto）
// ※ 以前の部品 EventCard.tsx は削除した（どの画面からも使われていなかった）ため対象外
// 前へ・次へのボタンは記号（❮ / ❯）ではなく読み上げ用の名前「前の写真」「次の写真」（aria-label）で探す

/** 対象イベントの ID */
const EVENT_ID = 'mock-upcoming-1'
/** 対象イベントの名前（写真の alt にも使われる） */
const EVENT_NAME = 'Green Market 2027'
/** 縦の中心のずれとして許す幅（px） */
const TOLERANCE = 2

/** 確かめる画面サイズ（スマホ・PC） */
const VIEWPORTS = [
  { label: 'sp', width: 375, height: 812 },
  { label: 'pc', width: 1280, height: 800 },
]

/** 確かめる画面（URL とスクリーンショットのファイル名に使う名前） */
const PAGES = [
  { label: 'events-list', path: '/events', desc: 'イベント一覧（/events）の通常のカード' },
  { label: 'home-next', path: '/', desc: 'ホーム（/）の Next Event の大きいカード' },
  { label: 'event-site', path: `/events/${EVENT_ID}`, desc: '公開のイベントサイト（/events/:id）' },
]

// すべてのテストで Supabase（認証・DB）への通信を遮断する
test.beforeEach(async ({ page }) => {
  await page.context().route(/supabase\.co/, (route) => route.abort())
})

/**
 * 写真が読み込まれ、高さを持つまで待ってから、写真とその入れ物（矢印が乗っている要素）を返す
 * @param page - 対象ページ
 * @returns 写真（img）と入れ物（img の親要素）のロケーター
 */
async function findPhoto(page: Page) {
  // 1. 対象イベントの写真（alt = イベント名）を探す
  const img = page.getByRole('img', { name: EVENT_NAME }).first()
  await img.scrollIntoViewIfNeeded()
  // 2. 画像の読み込みが終わる（naturalWidth > 0）まで待つ。EventSite は height: auto なので読み込み前は高さが 0 になる
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true)
  // 3. 入れ物 = 前へ・次へのボタンが position: absolute で乗っている要素。
  //    写真は拡大表示のボタン（button）で包まれているので、img の親ではなく
  //    「次の写真」ボタンを含むいちばん近い祖先の div を入れ物とする
  const container = img.locator('xpath=ancestor::div[.//button[@aria-label="次の写真"]][1]')
  return { img, container }
}

/**
 * ボタンの縦の中心が写真の縦の中心と ±TOLERANCE px 以内で一致することを確かめる
 * @param page - 対象ページ
 * @returns なし
 */
async function expectArrowsCentered(page: Page) {
  const { img, container } = await findPhoto(page)
  // 1. 写真の位置と大きさ
  const imgBox = await img.boundingBox()
  expect(imgBox, '写真が表示されていない').not.toBeNull()
  expect(imgBox!.height, '写真の高さが 0').toBeGreaterThan(0)
  const imgCenterY = imgBox!.y + imgBox!.height / 2

  // 2. 前へ・次へのボタン（名前「前の写真」「次の写真」）を入れ物の中から探し、それぞれの縦の中心を比べる
  for (const [name, label] of [['前の写真', '前へ'], ['次の写真', '次へ']] as const) {
    const btn = container.getByRole('button', { name, exact: true })
    await expect(btn, `${label}ボタンが表示されていない`).toBeVisible()
    const box = await btn.boundingBox()
    const btnCenterY = box!.y + box!.height / 2
    expect(
      Math.abs(btnCenterY - imgCenterY),
      `${label}ボタンの縦の中心 ${btnCenterY} / 写真の縦の中心 ${imgCenterY}（写真の高さ ${imgBox!.height}）`,
    ).toBeLessThanOrEqual(TOLERANCE)
  }
  return container
}

for (const vp of VIEWPORTS) {
  test.describe(`写真の左右矢印の位置（${vp.width}x${vp.height}）`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } })

    for (const p of PAGES) {
      test(`${p.desc}で、前へ・次へのボタンを写真の上下の真ん中に置くと、縦の中心が写真の中心と ±2px で一致する`, async ({ page }) => {
        // 1. 画面を開き、イベント名が出るまで待つ
        await page.goto(p.path)
        await expect(page.getByText(EVENT_NAME).first()).toBeVisible()
        // 2. 矢印の縦の位置を確かめる
        await expectArrowsCentered(page)
      })
    }

    test('イベントサイトで「次へ」を押して写真が切り替わっても、矢印は写真の上下の真ん中にある', async ({ page }) => {
      // 1. イベントサイトを開く（1枚目は横長 2560x1608、2枚目は 1567x1045 で縦横比が違う）
      await page.goto(`/events/${EVENT_ID}`)
      const { img, container } = await findPhoto(page)
      await expect(img).toHaveAttribute('src', /habitat_oides_hero/)
      // 2. 「次へ」を押すと 2 枚目に切り替わる
      await container.getByRole('button', { name: '次の写真', exact: true }).click()
      await expect(img).toHaveAttribute('src', /habitat_oides_workshop_main/)
      // 3. 2 枚目でも矢印が真ん中にある
      await expectArrowsCentered(page)
    })
  })
}
