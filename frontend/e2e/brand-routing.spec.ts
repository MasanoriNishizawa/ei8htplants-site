import { test, expect } from '@playwright/test'
import { MOCK_GALLERY, MOCK_PRODUCTS } from '../src/mocks/data'

// ei8ht plants のブランドサイトと公式サイトを別 URL・別ヘッダーで公開する導線を確認する

test.describe('ブランドサイトと公式サイトのルーティング', () => {
  test('トップ URL は ei8ht plants ブランドホームを表示する', /**
     ルートURLを開き、ei8ht plantsのブランドホームとブランド用ナビゲーションを表示し、公式サイトのトップヒーローを表示しないことを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. ルートを開き、ブランドホームとブランドナビを表示し、公式用ヒーローが出ないことを確認する。
    await page.goto('/')

    await expect(page.locator('.ep-home-page')).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'ei8ht plants' }).getByRole('link', { name: 'Our Story' })).toHaveAttribute('href', '/about')
    await expect(page.getByRole('navigation', { name: 'ei8ht plants' }).getByRole('link', { name: 'Official Site' })).toHaveAttribute('href', '/official')
    await expect(page.locator('.home-hero')).toHaveCount(0)
  })

  test('公式 URL は公式ホームを表示し、ブランドホームと異なるヘッダーを使う', /**
     * /officialを開き、公式ホームのヒーローとBrandsリンクを表示し、ei8ht plants用ナビが存在しないことを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. /officialを開き、公式ヒーローとBrandsリンクがあり、ブランド用ナビが表示されないことを確認する。
    await page.goto('/official')

    await expect(page.locator('.home-hero')).toBeVisible()
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Brands', exact: true })).toHaveAttribute('href', '/official/brands')
    await expect(page.getByRole('navigation', { name: 'ei8ht plants' })).toHaveCount(0)
    // OUR APPROACH の表示・親から渡した紹介リンクも公式ホーム上で確認する。
    const approach = page.locator('.home-action')
    await expect(approach.getByRole('heading', { name: /植物を育て|Grow plants/ })).toBeVisible()
    await expect(approach.getByText(/ひとつの植物から|From one remarkable plant/)).toBeVisible()
    await expect(approach.getByRole('link', { name: /私たちについて|OUR POINT OF VIEW/ })).toHaveAttribute('href', '/official/concept')
    // Galleryの見出し・全件ページへのリンクと、3枚の写真が切れ目なく2周する状態を確認する。
    const galleryHeading = page.getByRole('heading', { name: 'Gallery' })
    const gallerySection = page.locator('section').filter({ has: galleryHeading })
    await expect(galleryHeading).toBeVisible()
    await expect(gallerySection.getByRole('link', { name: 'View All →' })).toHaveAttribute('href', '/official/gallery')
    const galleryImages = gallerySection.locator('img')
    await expect(galleryImages).toHaveCount(MOCK_GALLERY.length * 2)
    for (let index = 0; index < MOCK_GALLERY.length; index += 1) {
      await expect(galleryImages.nth(index)).toHaveAttribute('src', MOCK_GALLERY[index].url)
      await expect(galleryImages.nth(index + MOCK_GALLERY.length)).toHaveAttribute('src', MOCK_GALLERY[index].url)
    }
  })

  test('公式ホームのブランド紹介はPCでhover展開し、スマホで全カードの展開情報を表示する', /**
     * /official上のブランドカード3枚とOUR BRANDSリンクを確認し、PCのhover幅切替と390px時の展開情報・縦並びを確かめる。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. PC幅で公式HOMEを開き、ブランド見出し・一覧リンク・3枚のカード順を確認する。
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/official')
    const heading = page.getByRole('heading', { name: '私たちのブランド' })
    const section = page.locator('section').filter({ has: heading })
    const cards = section.locator('.brand-strip-item')
    await expect(heading).toBeVisible()
    await expect(section.getByRole('link', { name: /すべてのブランド/ })).toHaveAttribute('href', '/official/brands')
    await expect(cards).toHaveCount(3)
    await expect(cards.nth(0)).toHaveAttribute('href', /ei8htplants\.com/)
    await expect(cards.nth(1)).toHaveAttribute('href', /habitatoides\.com/)
    await expect(cards.nth(2)).toHaveAttribute('href', /huebyei8htplants\.com/)

    // 2. 2枚目へhoverすると幅が先頭カードより広がることを確認する。
    await cards.nth(1).hover()
    await expect.poll(async () => cards.nth(1).evaluate((card) => card.getBoundingClientRect().width)).toBeGreaterThan(
      await cards.nth(0).evaluate((card) => card.getBoundingClientRect().width),
    )

    // 3. 390pxへ変更し、全カードのロゴと遷移表示が見え、説明文が非表示で縦に並ぶことを確認する。
    await page.setViewportSize({ width: 390, height: 844 })
    await page.reload()
    for (const [index, description] of [
      'アガベや塊根植物など、個性的なフォルムを持つビザールプランツ。',
      '植物と石、砂、鉢を重ねて、自生地の景色を仕立てる。',
      '葉の色とフォルムを楽しみ、植物を暮らしの景色に迎える。',
    ].entries()) {
      await expect(cards.nth(index).getByText('View Brand')).toBeVisible()
      await expect(cards.nth(index).locator('img').last()).toBeVisible()
      await expect(cards.nth(index).getByText(description, { exact: true })).toHaveCount(0)
      expect(await cards.nth(index).evaluate((card) => card.style.flex)).toBe('')
    }
    const cardBounds = await Promise.all((await cards.all()).map((card) => card.boundingBox()))
    expect(cardBounds.every((bounds) => bounds !== null)).toBe(true)
    expect(cardBounds[0]!.y).toBeLessThan(cardBounds[1]!.y)
    expect(cardBounds[1]!.y).toBeLessThan(cardBounds[2]!.y)
    expect(cardBounds.every((bounds) => Math.abs(bounds!.width - 390) < 1)).toBe(true)
  })

  test('公式ホームのInstagramリンク順とX・Threads共有先を表示する', /**
     * /officialのInstagramリンク3件の順序・URL・安全属性と、X・Threadsの共有リンクに含まれるURL・本文を確認する。
     * @param page 操作・検証対象のPlaywrightページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 公式HOMEを開き、Instagram見出しを含む領域を特定する。
    await page.goto('/official')
    const instagramHeading = page.getByText('Instagram', { exact: true })
    const socialSection = page.locator('section').filter({ has: instagramHeading })
    await expect(instagramHeading).toBeVisible()

    // 2. ロゴ画像を含むリンクを取得し、3ブランドの指定順・href・安全な別タブ属性を確かめる。
    const instagramLinks = socialSection.locator('a').filter({ has: page.locator('img') })
    const expectedInstagramUrls = [
      'https://www.instagram.com/habitatoides/',
      'https://www.instagram.com/ei8ht.plants/',
      'https://www.instagram.com/hue_by.ei8ht.plants/',
    ]
    await expect(instagramLinks).toHaveCount(expectedInstagramUrls.length)
    for (const [index, href] of expectedInstagramUrls.entries()) {
      await expect(instagramLinks.nth(index)).toHaveAttribute('href', href)
      await expect(instagramLinks.nth(index)).toHaveAttribute('target', '_blank')
      await expect(instagramLinks.nth(index)).toHaveAttribute('rel', 'noopener noreferrer')
    }

    // 3. XとThreadsの共有リンクに公式HOMEのURLと固定の共有文が含まれることを確認する。
    const expectedUrl = `${new URL(page.url()).origin}/official`
    const expectedText = 'ei8ht plants — Collect the strange.'
    const xShareUrl = new URL(await socialSection.getByRole('link', { name: 'Post on X' }).getAttribute('href') ?? '')
    expect(xShareUrl.origin + xShareUrl.pathname).toBe('https://x.com/intent/tweet')
    expect(xShareUrl.searchParams.get('url')).toBe(expectedUrl)
    expect(xShareUrl.searchParams.get('text')).toBe(expectedText)

    const threadsShareUrl = new URL(await socialSection.getByRole('link', { name: 'Share on Threads' }).getAttribute('href') ?? '')
    expect(threadsShareUrl.origin + threadsShareUrl.pathname).toBe('https://www.threads.net/intent/post')
    expect(threadsShareUrl.searchParams.get('text')).toBe(`${expectedText}\n${expectedUrl}`)
  })

  test('公式サイトの Brands メニューを押すと OUR BRANDS ページへ遷移する', /**
     * 「/official」を開く、「Brands」をクリックする、URLが「\/official\/brands$」になること、「Our Brands\.」が画面に表示されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 公式サイトの HOME を開き、Brands メニューを選ぶ
    await page.goto('/official')
    await page.getByRole('link', { name: 'Brands', exact: true }).click()
    // 2. OUR BRANDS の URL とページ見出しに遷移することを確認する
    await expect(page).toHaveURL(/\/official\/brands$/)
    await expect(page.getByRole('heading', { name: /Our Brands\./ })).toBeVisible()
  })

  test('旧 /ei8htplants URL からブランドホームへ移動する', /**
     * 「/ei8htplants」を開く、URLが「\/$」になることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 旧ブランドURLを開くとルートへ転送され、ブランドホームが表示されることを確認する。
    await page.goto('/ei8htplants')

    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator('.ep-home-page')).toBeVisible()
  })

  test('旧 /brands URL から公式 OUR BRANDS へ移動する', /**
     * 「/brands」を開く、URLが「\/official\/brands$」になること、「Our Brands\.」が画面に表示されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 旧Brands URLを開くと/official/brandsへ転送され、OUR BRANDSの見出しが表示されることを確認する。
    await page.goto('/brands')

    await expect(page).toHaveURL(/\/official\/brands$/)
    await expect(page.getByRole('heading', { name: /Our Brands\./ })).toBeVisible()
  })

  test('公式ホームのShopに商品3件と詳細リンク、View All、売切れを表示する', /**
     * /official上でMOCK_PRODUCTSの商品順・詳細URL・Shop一覧URLと、stock=0の売切れ表示を確かめる。
     * @param page 操作・検証対象のPlaywrightページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. /officialを開き、Shop見出しと商品fixtureと同じ3カードを確認する。
    await page.goto('/official')
    const heading = page.getByRole('heading', { name: 'Shop' })
    const section = page.locator('section').filter({ has: heading })
    const cards = section.locator('.home-shop-card')
    await expect(heading).toBeVisible()
    await expect(cards).toHaveCount(MOCK_PRODUCTS.length)

    // 2. カード順、詳細URL、価格、一覧リンクが商品データと一致することを確認する。
    for (const [index, product] of MOCK_PRODUCTS.entries()) {
      await expect(cards.nth(index)).toHaveAttribute('href', `/official/shop/${product.id}`)
      await expect(cards.nth(index)).toContainText(product.name)
      await expect(cards.nth(index)).toContainText(`¥${product.price.toLocaleString('ja-JP')}`)
    }
    await expect(section.getByRole('link', { name: 'View All →' })).toHaveAttribute('href', '/official/shop')

    // 3. fixture内の在庫切れ商品にはSOLD OUTを表示し、在庫あり商品には表示しない。
    await expect(cards.nth(2).getByText('SOLD OUT', { exact: true })).toBeVisible()
    await expect(cards.nth(0).getByText('SOLD OUT', { exact: true })).toHaveCount(0)
  })
})
