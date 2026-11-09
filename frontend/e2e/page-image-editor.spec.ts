import { test, expect } from './fixtures'

// 管理画面「ページ画像の編集」（/admin/page-editor/:brand/:page?）の流れを確かめる（4ブランド × ページ）。
// プレビューの枠をクリック → パネル → アップロード → プレビューに反映 → 保存 → 件数が 0。
// API は MSW のモック（アップロードは /img/logo-habitatoides.png を返す）で受ける。

/** アップロードに使う手元の画像 */
const UPLOAD_FILE = 'public/img/habitatOides/habitat_oides_hero.jpg'
/** モックのアップロードが返す URL */
const UPLOADED_URL = '/img/logo-habitatoides.png'

/**
 * 編集画面を開き、一覧の読み込みが終わる（「変更はありません」が出る）まで待つ。
 * 初回や負荷が高いときは開発サーバーが画面の部品を変換するので、長めに待つ。
 * @param page 操作する Playwright ページ
 * @param path 開くパス（例: '/admin/page-editor/hue/about'）
 * @returns {Promise<void>} 読み込みが終わったら解決する
 */
async function openEditor(page: import('@playwright/test').Page, path: string) {
  await page.goto(path)
  await expect(page.getByTestId('page-editor-changed-count')).toHaveText('変更はありません', { timeout: 30000 })
}

test.describe('ページ画像の編集', () => {
  test('E2E-AF-01: ei8ht plants のメインの写真をプレビューから選んで差し替え、保存すると件数が 0 になる', /**
     * /admin/page-editor を開き（ei8htplants へ転送）、プレビューの枠をクリックしてパネルを出し、画像をアップロードして
     * プレビューに出ることと件数を確かめ、保存して件数が 0 に戻ることを確かめる。
     * @param page 操作・検証対象の Playwright ページ
     * @returns {Promise<void>} すべての確認が終わったら解決する
     */
    async ({ page }) => {
    // 1. ブランドを指定せずに開くと ei8htplants に転送される
    await page.goto('/admin/page-editor')
    await expect(page).toHaveURL(/\/admin\/page-editor\/ei8htplants$/)
    // 初回は開発サーバーが画面の部品を変換するので、長めに待つ
    await expect(page.getByTestId('page-editor-changed-count')).toHaveText('変更はありません', { timeout: 30000 })
    const preview = page.frameLocator('[data-testid="page-editor-frame"]')
    // プレビューの中ではメニューを出さない
    await expect(preview.getByRole('complementary')).toHaveCount(0)

    // 2. プレビューの中の枠をクリックするとパネルが出る
    await preview.getByRole('button', { name: 'メインの写真を変更' }).click()
    const panel = page.getByTestId('page-editor-panel')
    await expect(panel.getByRole('heading', { name: 'メインの写真' })).toBeVisible()

    // 3. 画像をアップロードすると、プレビューと件数に反映される（保存はまだ）
    await panel.getByLabel('画像を選ぶ').setInputFiles(UPLOAD_FILE)
    await expect(page.getByTestId('page-editor-changed-count')).toHaveText('変更 1 件（未保存）')
    await expect(page.getByTestId('page-editor-slot-ei8ht-hero')).toContainText('変更あり')
    await expect(preview.locator('.ep-home-visual img')).toHaveAttribute('src', UPLOADED_URL)

    // 4. 保存すると件数が 0 に戻る
    await page.getByTestId('page-editor-save').click()
    await expect(page.getByText('1 件を保存しました。公開ページに反映されます。')).toBeVisible()
    await expect(page.getByTestId('page-editor-changed-count')).toHaveText('変更はありません')
    await expect(page.getByTestId('page-editor-save')).toBeDisabled()
  })

  test('E2E-AF-02: Habitat Oides のタブで空の枠に画像を入れて保存し、プレビューのリンクを押しても移動しない', /**
     * Habitat Oides のタブに切り替え、枠の一覧が13枠でサインを含まないことを確かめてから、object-02 を選んで画像をアップロードし、プレビューの空の枠が画像に
     * 変わることと保存できることを確かめる。プレビューのリンクを押しても iframe の中の URL が変わらないことも確かめる。
     * @param page 操作・検証対象の Playwright ページ
     * @returns {Promise<void>} すべての確認が終わったら解決する
     */
    async ({ page }) => {
    await openEditor(page, '/admin/page-editor/ei8htplants')
    // 1. 未保存の変更がないので、確認なしでタブを切り替えられる
    await page.getByRole('tab', { name: 'Habitat Oides' }).click()
    await expect(page).toHaveURL(/\/admin\/page-editor\/habitat-oides$/)
    const preview = page.frameLocator('[data-testid="page-editor-frame"]')
    await expect(preview.getByTestId('habitat-placeholder-habitat-object-02')).toHaveCount(1)
    // 1-2. 枠の一覧は13枠（一番上の画像 5・動くオブジェクト 6・ページ写真 2）で、サインは差し替えの対象に入らない
    await expect(page.locator('[data-testid^="page-editor-slot-habitat-"]')).toHaveCount(13)
    await expect(page.getByTestId('page-editor-slot-habitat-sign')).toHaveCount(0)
    // プレビューのサインにも差し替えの枠（「〜を変更」のボタン）は付かない
    await expect(preview.getByTestId('editable-slot-habitat-sign')).toHaveCount(0)

    // 2. 枠の一覧から選び、画像をアップロードするとプレビューの空の枠が画像になる
    await page.getByTestId('page-editor-slot-habitat-object-02').click()
    await page.getByTestId('page-editor-panel').getByLabel('画像を選ぶ').setInputFiles(UPLOAD_FILE)
    await expect(page.getByTestId('page-editor-changed-count')).toHaveText('変更 1 件（未保存）')
    await expect(preview.getByTestId('habitat-floating-item-habitat-object-02').locator('img')).toHaveAttribute('src', UPLOADED_URL)
    await expect(preview.getByTestId('habitat-placeholder-habitat-object-02')).toHaveCount(0)

    // 3. プレビューの中のリンク（ワークショップ）を押しても移動しない
    const frameUrl = () => page.frames().find((f) => f.url().includes('/admin/page-preview/'))?.url()
    const before = frameUrl()
    await preview.locator('a[href="/workshop"]').first().dispatchEvent('click')
    // 移動していれば消えるはずのトップページの部品が残り、iframe の URL も変わらない
    await expect(preview.getByTestId('habitat-floating-objects')).toBeVisible()
    expect(frameUrl()).toBe(before)

    // 4. 保存すると件数が 0 になる
    await page.getByTestId('page-editor-save').click()
    await expect(page.getByTestId('page-editor-changed-count')).toHaveText('変更はありません')
  })

  test('E2E-AF-03: 未保存の変更があるときにタブを押すと確認が出て、キャンセルすると移動しない', /**
     * 枠の一覧から ei8ht-wordmark を選んで画像を入れ、HUE のタブを押したときに確認ダイアログが出て、
     * キャンセルすると URL と件数がそのままであることを確かめる。
     * @param page 操作・検証対象の Playwright ページ
     * @returns {Promise<void>} すべての確認が終わったら解決する
     */
    async ({ page }) => {
    await openEditor(page, '/admin/page-editor/ei8htplants')
    await page.getByTestId('page-editor-slot-ei8ht-wordmark').click()
    await page.getByTestId('page-editor-panel').getByLabel('画像を選ぶ').setInputFiles(UPLOAD_FILE)
    await expect(page.getByTestId('page-editor-changed-count')).toHaveText('変更 1 件（未保存）')
    // 確認ダイアログをキャンセルする
    let dialogShown = false
    page.once('dialog', (dialog) => { dialogShown = true; void dialog.dismiss() })
    await page.getByRole('tab', { name: 'HUE' }).click()
    expect(dialogShown).toBe(true)
    await expect(page).toHaveURL(/\/admin\/page-editor\/ei8htplants$/)
    await expect(page.getByTestId('page-editor-changed-count')).toHaveText('変更 1 件（未保存）')
  })

  test('E2E-AF-04: スマホのボタンでプレビューの幅が 390px になる', /**
     * スマホ（390px）のボタンを押して、iframe の幅が 390px になり、ボタンが押された状態になることを確かめる。
     * @param page 操作・検証対象の Playwright ページ
     * @returns {Promise<void>} すべての確認が終わったら解決する
     */
    async ({ page }) => {
    await openEditor(page, '/admin/page-editor/hue')
    await page.getByTestId('page-editor-viewport-sp').click()
    await expect(page.getByTestId('page-editor-viewport-sp')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('page-editor-frame')).toHaveCSS('width', '390px')
  })
})

/** ページ切替時もブランド共通の草稿を保持し、まとめて保存できることを確かめる。 */
test('E2E-AF-05: Aboutへ切り替えても共有ロゴとトップ専用画像の草稿が残る', async ({ page }) => {
  await openEditor(page, '/admin/page-editor/ei8htplants')
  await page.getByTestId('page-editor-slot-ei8ht-wordmark').click()
  await page.getByLabel('画像を選ぶ').setInputFiles(UPLOAD_FILE)
  await expect(page.getByTestId('page-editor-panel-shared')).toContainText('About')
  await expect(page.getByTestId('page-editor-changed-count')).toHaveText('変更 1 件（未保存）')
  await page.getByTestId('page-editor-page-select').selectOption('about')
  await expect(page).toHaveURL(/\/ei8htplants\/about$/)
  await expect(page.getByTestId('page-editor-panel')).toBeVisible()
  const preview = page.frameLocator('[data-testid="page-editor-frame"]')
  await expect(preview.getByTestId('editable-slot-ei8ht-wordmark').locator('..').locator('img')).toHaveAttribute('src', UPLOADED_URL)
  await page.getByTestId('page-editor-slot-ei8ht-about-hero').click()
  await page.getByLabel('画像を選ぶ').setInputFiles(UPLOAD_FILE)
  await expect(page.getByTestId('page-editor-changed-count')).toHaveText('変更 2 件（未保存）')
  await page.getByTestId('page-editor-page-select').selectOption('home')
  await expect(page.getByTestId('page-editor-panel')).toHaveCount(0)
  await expect(page.getByTestId('page-editor-changed-count')).toHaveText('変更 2 件（未保存）')
  await page.getByTestId('page-editor-save').click()
  await expect(page.getByText('2 件を保存しました。公開ページに反映されます。')).toBeVisible()
})

/** 各ページの固定画像がプレビュー上でも編集対象になることを確かめる。 */
for (const [brand, pageId, key] of [
  ['habitat-oides', 'workshop', 'habitat-workshop-main'],
  ['hue', 'about', 'hue-color-01'],
  ['hue', 'choose', 'hue-color-03'],
  ['hue', 'living', 'hue-color-04'],
  ['official', 'home', 'official-hero'],
  ['official', 'brands', 'official-brand-ei8ht'],
]) {
  test(`E2E-AF-06: ${brand}/${pageId} の固定画像を選ぶとパネルが開く`, async ({ page }) => {
    await openEditor(page, `/admin/page-editor/${brand}/${pageId}`)
    await expect(page.getByTestId('page-editor-page-select')).toHaveValue(pageId)
    const preview = page.frameLocator('[data-testid="page-editor-frame"]')
    await expect(preview.getByTestId(`editable-slot-${key}`)).toHaveCount(1, { timeout: 30000 })
    await page.getByTestId(`page-editor-slot-${key}`).click()
    await expect(page.getByTestId('page-editor-panel')).toBeVisible()
  })
}

/** 過去のページから遅れて届いた選択メッセージを除外することを確かめる。 */
test('E2E-AF-07: 別ページの選択メッセージを受けても選択状態が変わらない', async ({ page }) => {
  await openEditor(page, '/admin/page-editor/hue/about')
  await page.getByTestId('page-editor-slot-hue-color-01').click()
  await expect(page.getByTestId('page-editor-panel')).toBeVisible()
  await page.evaluate(() => {
    const frame = document.querySelector<HTMLIFrameElement>('[data-testid="page-editor-frame"]')!
    // 正しい送信元の iframe でも、ページ識別子が違うメッセージは無視する。
    window.dispatchEvent(new MessageEvent('message', {
      origin: location.origin,
      source: frame.contentWindow,
      data: { type: 'page-editor:select', brand: 'hue', page: 'home', key: 'hue-color-03' },
    }))
  })
  await expect(page.getByTestId('page-editor-panel').getByRole('heading')).toHaveText('色の写真 01')
})

/** 旧URLと不正なページ指定のフォールバックを検証する。 */
test('E2E-AF-08: 旧Habitat画像URLと不正ページは対応ブランドのトップ編集へ転送される', async ({ page }) => {
  await page.goto('/admin/habitat-images')
  await expect(page).toHaveURL(/\/admin\/page-editor\/habitat-oides$/, { timeout: 30000 })
  await expect(page.getByTestId('page-editor-page-select')).toHaveValue('home', { timeout: 30000 })
  await page.goto('/admin/page-editor/official/unknown')
  await expect(page).toHaveURL(/\/admin\/page-editor\/official$/, { timeout: 30000 })
  await expect(page.getByTestId('page-editor-page-select')).toHaveValue('home', { timeout: 30000 })
})

/** 選択一覧に出した枠が、プレビュー上にも過不足なくあることを確認する。 */
for (const pageId of ['home', 'about', 'choose', 'living']) {
  test(`E2E-AF-09: HUE ${pageId} の枠一覧がプレビューの編集枠と一致する`, async ({ page }) => {
    await openEditor(page, `/admin/page-editor/hue/${pageId}`)
    const preview = page.frameLocator('[data-testid="page-editor-frame"]')
    // 初回は開発サーバーが HUE のページの部品を変換するので、長めに待つ
    await expect(preview.locator('[data-testid^="editable-slot-"]').first()).toBeAttached({ timeout: 30000 })
    const listed = await page.locator('[data-testid^="page-editor-slot-"]').evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')!.replace('page-editor-slot-', '')).sort())
    await expect.poll(async () => preview.locator('[data-testid^="editable-slot-"]').evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')!.replace('editable-slot-', '')).sort())).toEqual(listed)
  })
}

/** 保存済みの HUE の写真（hue-color-01）として返す URL（外す公式の画像 UPLOADED_URL とは別の画像にして、どちらが出ているかを区別する） */
const HUE_PHOTO_URL = '/img/habitatOides/habitat_oides_workshop_main.jpg'

test('E2E-AF-10: 公式サイトの HUE の写真を外すと、トップは HUE のロゴ、Our Brands は保存済みの HUE の写真（hue-color-01）に戻る', /**
   * 編集画面と iframe のプレビューの両方で「hue-color-01 は保存済み（HUE_PHOTO_URL）」の状態にしてから、
   * 公式サイトの official-brand-hue に画像（UPLOADED_URL）を入れ、Our Brands のプレビューに出ることを確かめる。
   * そのあと画像を外し、Our Brands のプレビューに代わりの HUE の写真が出て、外した画像が出ないこと、
   * トップに戻るとパネルとプレビューが HUE のロゴになることを確かめる。
   * MSW のモックは document ごとに保存値を持ち、編集画面で保存した値は iframe（別の document）から見えないため、
   * hue-color-01 の取得だけはすべての frame で fetch を包んで同じ応答を返す（本物の API の DB の代わり）。
   * @param page 操作・検証対象の Playwright ページ
   * @returns {Promise<void>} すべての確認が終わったら解決する
   */
  async ({ page }) => {
  // 0. すべての frame（編集画面と iframe）で、hue-color-01 の取得に同じ保存済みの URL を返す
  await page.addInitScript((hueUrl) => {
    // 元の fetch（ほかの通信はそのまま MSW へ流す）
    const original = window.fetch.bind(window)
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      // 通信先の URL とメソッド
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.href)
      const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
      const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
      // 1件の取得（OurBrands・編集画面の Our Brands の代わりの写真）
      if (method === 'GET' && url.pathname === '/api/site-assets/hue-color-01') return json({ key: 'hue-color-01', url: hueUrl })
      // 一括取得（HUE の編集画面・公開ページ）。hue-color-01 だけ保存済みにする
      if (method === 'GET' && url.pathname === '/api/site-assets' && url.searchParams.get('prefix') === 'hue-color-') {
        const keys = [...Array.from({ length: 6 }, (_, index) => `hue-color-0${index + 1}`), 'hue-color-study']
        return json(keys.map((key) => ({ key, url: key === 'hue-color-01' ? hueUrl : '' })))
      }
      return original(input, init)
    }
  }, HUE_PHOTO_URL)

  // 1. 公式サイトのトップで HUE のカードの枠を選び、画像を入れる
  await openEditor(page, '/admin/page-editor/official')
  const preview = page.frameLocator('[data-testid="page-editor-frame"]')
  await page.getByTestId('page-editor-slot-official-brand-hue').click()
  const panel = page.getByTestId('page-editor-panel')
  await panel.getByLabel('画像を選ぶ').setInputFiles(UPLOAD_FILE)
  await expect(page.getByTestId('page-editor-changed-count')).toHaveText('変更 1 件（未保存）')

  // 2. Our Brands に移ると、プレビューの HUE のカードには入れた画像（草稿）が出る
  await page.getByTestId('page-editor-page-select').selectOption('brands')
  await expect(page).toHaveURL(/\/admin\/page-editor\/official\/brands$/)
  const hueCard = preview.locator('a.our-brand-card--3')
  await expect(hueCard.locator('img.our-brand-card-photo')).toHaveAttribute('src', UPLOADED_URL, { timeout: 30000 })

  // 3. 画像を外すと、パネルとプレビューは代わりの HUE の写真（hue-color-01）になり、外した画像は出ない
  await panel.getByRole('button', { name: '画像を外す' }).click()
  await expect(panel).toContainText('HUE の写真（hue-color-01）')
  await expect(panel.getByRole('img')).toHaveAttribute('src', HUE_PHOTO_URL)
  await expect(hueCard.locator('img.our-brand-card-photo')).toHaveAttribute('src', HUE_PHOTO_URL)
  await expect(hueCard.locator(`img[src="${UPLOADED_URL}"]`)).toHaveCount(0)
  await expect(hueCard.getByTestId('editable-slot-official-brand-hue')).toHaveCount(1)

  // 4. トップに戻ると、同じ枠はパネル・プレビューとも HUE のロゴになり、写真は出ない
  await page.getByTestId('page-editor-page-select').selectOption('home')
  await expect(panel).toContainText('HUE のロゴ')
  const logoSrc = await panel.getByRole('img').getAttribute('src')
  const stripCard = preview.getByTestId('editable-slot-official-brand-hue').locator('..')
  await expect(stripCard.locator('img').first()).toHaveAttribute('src', logoSrc!, { timeout: 30000 })
  await expect(stripCard.locator(`img[src="${UPLOADED_URL}"]`)).toHaveCount(0)
  await expect(stripCard.locator(`img[src="${HUE_PHOTO_URL}"]`)).toHaveCount(0)
  // 外したので、保存されている値（未設定）との違いはなく「変更はありません」
  await expect(page.getByTestId('page-editor-changed-count')).toHaveText('変更はありません')
})

/**
 * 公式サイトとサブページの「プレビューの枠をクリック → パネル → アップロード → プレビューに反映 → 保存」の流れ。
 * [ID, ブランド, ページ, プレビューの枠の data-testid の key, パネルの見出し, プレビューで反映を確かめる img のセレクター]
 */
const SUBPAGE_FLOWS: ReadonlyArray<readonly [string, string, string, string, string, string]> = [
  ['E2E-AF-11', 'official', 'home', 'official-hero', '公式トップのメインの写真', 'img.home-hero-photo'],
  ['E2E-AF-12', 'official', 'brands', 'official-brand-habitat', 'ブランド紹介の写真（Habitat Oides）', '.our-brand-card--2 img.our-brand-card-photo'],
  ['E2E-AF-13', 'ei8htplants', 'about', 'ei8ht-about-hero', 'About のメインの写真', '.ep-about-image img'],
  ['E2E-AF-14', 'habitat-oides', 'workshop', 'habitat-workshop-main', 'Workshop のメインの写真', 'img[alt="ハビタットスタイルのワークショップ"]'],
  ['E2E-AF-15', 'hue', 'choose', 'hue-color-03', '色の写真 03', '.hue-subpage-hero-image img'],
]

for (const [id, brand, pageId, key, heading, imageSelector] of SUBPAGE_FLOWS) {
  test(`${id}: ${brand}/${pageId} の ${key} をプレビューから選んで差し替え、保存すると件数が 0 になる`, /**
     * /admin/page-editor/:brand/:page を開き、プレビューの中の枠をクリックしてパネルを出し、画像をアップロードして
     * プレビューの写真が変わることと件数を確かめ、保存して件数が 0 に戻ることを確かめる。
     * @param page 操作・検証対象の Playwright ページ
     * @returns {Promise<void>} すべての確認が終わったら解決する
     */
    async ({ page }) => {
    // 1. ページを指定して開く（初回は開発サーバーが部品を変換するので長めに待つ）
    await page.goto(`/admin/page-editor/${brand}/${pageId}`)
    await expect(page.getByTestId('page-editor-changed-count')).toHaveText('変更はありません', { timeout: 30000 })
    await expect(page.getByTestId('page-editor-page-select')).toHaveValue(pageId)
    const preview = page.frameLocator('[data-testid="page-editor-frame"]')

    // 2. プレビューの中の枠をクリックするとパネルが出る（リンクの中の枠は span なので data-testid で押す）
    await preview.getByTestId(`editable-slot-${key}`).click()
    const panel = page.getByTestId('page-editor-panel')
    await expect(panel.getByRole('heading', { name: heading })).toBeVisible()

    // 3. 画像をアップロードすると、プレビューと件数に反映される（保存はまだ）
    await panel.getByLabel('画像を選ぶ').setInputFiles(UPLOAD_FILE)
    await expect(page.getByTestId('page-editor-changed-count')).toHaveText('変更 1 件（未保存）')
    await expect(page.getByTestId(`page-editor-slot-${key}`)).toContainText('変更あり')
    await expect(preview.locator(imageSelector).first()).toHaveAttribute('src', UPLOADED_URL)

    // 4. 保存すると件数が 0 に戻り、保存ボタンは押せなくなる
    await page.getByTestId('page-editor-save').click()
    await expect(page.getByText('1 件を保存しました。公開ページに反映されます。')).toBeVisible()
    await expect(page.getByTestId('page-editor-changed-count')).toHaveText('変更はありません')
    await expect(page.getByTestId('page-editor-save')).toBeDisabled()
  })
}

test('E2E-AF-16: 公式トップでブランド紹介の写真を差し替えると、Our Brands に移っても草稿が残り共通の案内が出て、まとめて保存できる', /**
   * 公式サイトのトップで official-brand-hue に画像を入れ、Our Brands に切り替えてもプレビューに草稿が出ること、
   * パネルに共通の案内が出ること、保存で1件になることを確かめる。
   * @param page 操作・検証対象の Playwright ページ
   * @returns {Promise<void>} すべての確認が終わったら解決する
   */
  async ({ page }) => {
  await page.goto('/admin/page-editor/official')
  await expect(page.getByTestId('page-editor-changed-count')).toHaveText('変更はありません', { timeout: 30000 })
  const preview = page.frameLocator('[data-testid="page-editor-frame"]')
  // 1. トップのブランドの帯の HUE のカードの枠を選び、画像を入れる
  await preview.getByTestId('editable-slot-official-brand-hue').click()
  const panel = page.getByTestId('page-editor-panel')
  await expect(page.getByTestId('page-editor-panel-shared')).toHaveText('この写真は 公式サイト の他のページでも使われます（トップページ・Our Brands）。')
  await panel.getByLabel('画像を選ぶ').setInputFiles(UPLOAD_FILE)
  await expect(preview.getByTestId('editable-slot-official-brand-hue').locator('..').locator('img').first()).toHaveAttribute('src', UPLOADED_URL)
  // 2. Our Brands に移っても、同じ枠の草稿がプレビューに出て、パネルも開いたまま
  await page.getByTestId('page-editor-page-select').selectOption('brands')
  await expect(page).toHaveURL(/\/admin\/page-editor\/official\/brands$/)
  await expect(preview.locator('.our-brand-card--3 img.our-brand-card-photo')).toHaveAttribute('src', UPLOADED_URL)
  await expect(panel.getByRole('heading', { name: 'ブランド紹介の写真（HUE）' })).toBeVisible()
  await expect(page.getByTestId('page-editor-changed-count')).toHaveText('変更 1 件（未保存）')
  // 3. 保存すると1件を保存する
  await page.getByTestId('page-editor-save').click()
  await expect(page.getByText('1 件を保存しました。公開ページに反映されます。')).toBeVisible()
  await expect(page.getByTestId('page-editor-changed-count')).toHaveText('変更はありません')
})

/**
 * HUE のサブページの記事側の写真（.hue-subpage-entry-image）の中に span で出す2つ目の枠が、写真全体を覆うこと。
 * 写真番号用の指定（.hue-subpage-entry-image > span の top・left）が枠に当たってずれないことを確かめる（Choose の 03・Living の 04）。
 */
for (const [id, pageId, key] of [
  ['E2E-AF-17', 'choose', 'hue-color-03'],
  ['E2E-AF-18', 'living', 'hue-color-04'],
] as const) {
  test(`${id}: HUE ${pageId} の記事側の ${key} の枠は写真全体に重なる`, /**
     * プレビューの中で、記事側の写真の figure と、その中の枠（span）の位置・大きさが一致することを確かめる。
     * @param page 操作・検証対象の Playwright ページ
     * @returns {Promise<void>} すべての確認が終わったら解決する
     */
    async ({ page }) => {
    await page.goto(`/admin/page-editor/hue/${pageId}`)
    await expect(page.getByTestId('page-editor-changed-count')).toHaveText('変更はありません', { timeout: 30000 })
    const preview = page.frameLocator('[data-testid="page-editor-frame"]')
    // 記事側の写真の中の枠（見出しの写真と同じなので2つ目の枠 = span）
    const target = preview.locator(`.hue-subpage-entry-image > .page-edit-target[data-slot-key="${key}"]`)
    // 親の一覧より iframe の遅延読み込みが遅れるため、対象枠の描画完了を待つ。
    await expect(target).toHaveCount(1, { timeout: 30000 })
    expect(await target.evaluate((el) => el.tagName)).toBe('SPAN')
    // 1. 枠と写真（親の figure）の位置・大きさを、プレビューの中の座標で測る
    const boxes = await target.evaluate((el) => {
      const own = el.getBoundingClientRect()
      const figure = (el.parentElement as HTMLElement).getBoundingClientRect()
      return { own: [own.left, own.top, own.width, own.height], figure: [figure.left, figure.top, figure.width, figure.height] }
    })
    // 2. 写真に大きさがあり、枠が写真とずれずに重なる（1px までの誤差は許す）
    expect(boxes.figure[2]).toBeGreaterThan(50)
    expect(boxes.figure[3]).toBeGreaterThan(50)
    boxes.own.forEach((value, index) => expect(Math.abs(value - boxes.figure[index])).toBeLessThanOrEqual(1))
  })
}

/** 移るときの確認の文言（UnsavedChanges.ts の UNSAVED_LEAVE_MESSAGE） */
const LEAVE_MESSAGE = '保存していない変更があります。破棄して移動しますか？'

/**
 * ブラウザの確認ダイアログに答える係を付ける。答え方（キャンセル・OK）はテストの途中で切り替えられる
 * @param page 対象ページ
 * @returns messages（出た確認の文言の一覧）と answer（次から出る確認への答え方。'dismiss' ならキャンセル、'accept' なら OK）
 */
function answerDialogs(page: import('@playwright/test').Page): { messages: string[]; answer: 'dismiss' | 'accept' } {
  // state: 出た文言と、今の答え方
  const state = { messages: [] as string[], answer: 'dismiss' as 'dismiss' | 'accept' }
  page.on('dialog', async (d) => {
    state.messages.push(d.message())
    if (state.answer === 'accept') await d.accept()
    else await d.dismiss()
  })
  return state
}

// ブラウザの「戻る」「進む」（historyGuard.ts）。同じブランドの中のページの移動は確認を出さず、草稿も残す。
// ブランドをまたぐ移動は、未保存の変更があれば確認を出す。前の画面は page.goto ではなく画面の中の操作で作る
test('E2E-AF-19: 同じブランドの中のページを戻る・進むで移ると、確認が出ず、草稿の件数が残り、プレビューもそのページを出す', /**
   * ei8ht plants のトップで共有ロゴに画像を入れて About へ移り、ブラウザの戻る・進むで行き来する。
   * 確認が出ないこと、件数が「変更 1 件（未保存）」のままであること、ページの選択とプレビュー（iframe の src と中身）がそのページになることを確かめる。
   * @param page 操作・検証対象の Playwright ページ
   * @returns {Promise<void>} すべての確認が終わったら解決する
   */
  async ({ page }) => {
  const dialogs = answerDialogs(page)
  const frame = page.getByTestId('page-editor-frame')
  const preview = page.frameLocator('[data-testid="page-editor-frame"]')
  // 1. トップで共有ロゴ（トップと About で使う）に画像を入れ、ページの選択で About へ移る
  await openEditor(page, '/admin/page-editor/ei8htplants')
  await page.getByTestId('page-editor-slot-ei8ht-wordmark').click()
  await page.getByTestId('page-editor-panel').getByLabel('画像を選ぶ').setInputFiles(UPLOAD_FILE)
  await expect(page.getByTestId('page-editor-changed-count')).toHaveText('変更 1 件（未保存）')
  await page.getByTestId('page-editor-page-select').selectOption('about')
  await expect(page).toHaveURL(/\/admin\/page-editor\/ei8htplants\/about$/)

  // 2. 戻る → トップ。確認は出ず、件数が残り、プレビューもトップになる
  await page.goBack({ waitUntil: 'commit' })
  await expect(page).toHaveURL(/\/admin\/page-editor\/ei8htplants$/)
  await expect(page.getByTestId('page-editor-page-select')).toHaveValue('home')
  await expect(page.getByTestId('page-editor-changed-count')).toHaveText('変更 1 件（未保存）')
  await expect(frame).toHaveAttribute('src', '/admin/page-preview/ei8htplants/home')
  // トップだけにあるメインの写真の枠が出て、草稿のロゴもプレビューに出ている
  await expect(preview.getByTestId('editable-slot-ei8ht-hero')).toHaveCount(1, { timeout: 30000 })
  await expect(preview.getByTestId('editable-slot-ei8ht-wordmark').locator('..').locator('img')).toHaveAttribute('src', UPLOADED_URL)

  // 3. 進む → About。確認は出ず、件数が残り、プレビューも About になる
  await page.goForward({ waitUntil: 'commit' })
  await expect(page).toHaveURL(/\/admin\/page-editor\/ei8htplants\/about$/)
  await expect(page.getByTestId('page-editor-page-select')).toHaveValue('about')
  await expect(page.getByTestId('page-editor-changed-count')).toHaveText('変更 1 件（未保存）')
  await expect(frame).toHaveAttribute('src', '/admin/page-preview/ei8htplants/about')
  await expect(preview.getByTestId('editable-slot-ei8ht-about-hero')).toHaveCount(1, { timeout: 30000 })
  expect(dialogs.messages).toEqual([])
})

test('E2E-AF-20: ブランドをまたいで戻る（history.go(-2) も）と確認が出て、キャンセルすると留まって草稿が残り、OK で移る', /**
   * ei8ht plants → HUE（タブ）→ HUE の About（ページの選択）と移り、About で画像を入れる。
   * history.go(-2)（ei8ht plants へ一気に戻る）でキャンセルすると About に留まり草稿が残ること、
   * 1つ戻る（HUE のトップ。同じブランド）は確認なしで移ること、そこからさらに戻る（ei8ht plants）はキャンセルで留まり、OK で移ることを確かめる。
   * @param page 操作・検証対象の Playwright ページ
   * @returns {Promise<void>} すべての確認が終わったら解決する
   */
  async ({ page }) => {
  const dialogs = answerDialogs(page)
  const count = page.getByTestId('page-editor-changed-count')
  // 1. ei8ht plants → HUE → HUE の About と画面の中の操作で移る（未保存の変更が無いので確認なし）
  await openEditor(page, '/admin/page-editor/ei8htplants')
  await page.getByRole('tab', { name: 'HUE' }).click()
  await expect(page).toHaveURL(/\/admin\/page-editor\/hue$/)
  await expect(count).toHaveText('変更はありません', { timeout: 30000 })
  await page.getByTestId('page-editor-page-select').selectOption('about')
  await expect(page).toHaveURL(/\/admin\/page-editor\/hue\/about$/)
  expect(dialogs.messages).toEqual([])

  // 2. About で画像を入れる
  await page.getByTestId('page-editor-slot-hue-color-01').click()
  await page.getByTestId('page-editor-panel').getByLabel('画像を選ぶ').setInputFiles(UPLOAD_FILE)
  await expect(count).toHaveText('変更 1 件（未保存）')

  // 3. history.go(-2) で ei8ht plants へ一気に戻る → 確認をキャンセルすると About に留まり、草稿が残る
  await page.evaluate(() => window.history.go(-2))
  await expect.poll(() => dialogs.messages).toEqual([LEAVE_MESSAGE])
  await expect(page).toHaveURL(/\/admin\/page-editor\/hue\/about$/)
  await expect(page.getByTestId('page-editor-page-select')).toHaveValue('about')
  await expect(count).toHaveText('変更 1 件（未保存）')

  // 4. 1つ戻る（HUE のトップ。同じブランド）は確認なしで移り、草稿も残る
  await page.goBack({ waitUntil: 'commit' })
  await expect(page).toHaveURL(/\/admin\/page-editor\/hue$/)
  await expect(page.getByTestId('page-editor-page-select')).toHaveValue('home')
  await expect(count).toHaveText('変更 1 件（未保存）')
  expect(dialogs.messages).toEqual([LEAVE_MESSAGE])

  // 5. さらに戻る（ei8ht plants）→ キャンセルすると HUE のトップに留まり、草稿が残る
  await page.goBack({ waitUntil: 'commit' })
  await expect.poll(() => dialogs.messages).toEqual([LEAVE_MESSAGE, LEAVE_MESSAGE])
  await expect(page).toHaveURL(/\/admin\/page-editor\/hue$/)
  await expect(page.getByRole('tab', { name: 'HUE' })).toHaveAttribute('aria-selected', 'true')
  await expect(count).toHaveText('変更 1 件（未保存）')

  // 6. もう一度戻る → OK で ei8ht plants へ移り、HUE の草稿は破棄される
  dialogs.answer = 'accept'
  await page.goBack({ waitUntil: 'commit' })
  await expect(page).toHaveURL(/\/admin\/page-editor\/ei8htplants$/)
  await expect(page.getByRole('tab', { name: 'ei8ht plants' })).toHaveAttribute('aria-selected', 'true')
  await expect(count).toHaveText('変更はありません', { timeout: 30000 })
  expect(dialogs.messages).toEqual([LEAVE_MESSAGE, LEAVE_MESSAGE, LEAVE_MESSAGE])
})
