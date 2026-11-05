/**
 * 「ページ画像の編集」を全ページ対応にしたときに、新しく枠を付けた公開ページのテスト
 *
 * 対象のページと枠:
 * - ei8ht plants の About（Ei8htPlantsAbout.tsx）: ei8ht-about-hero・ei8ht-wordmark
 * - Habitat Oides の Workshop（HabitatOidesWorkshop.tsx）: habitat-workshop-main
 * - HUE の読みもの（HueEditorialPage.tsx）: about / choose / living の見出しの写真と記事の写真
 * - 公式サイトのトップ（Home.tsx）: official-hero
 * - 公式サイトのブランドの帯（HomeBrandShowcase.tsx）・Our Brands（OurBrands.tsx）: official-brand-*
 *
 * 確かめること:
 * 1. 画像は「保存した URL → localSrc」の順で出す（OurBrands の HUE は、未保存なら今までどおり hue-color-01）
 * 2. ブランドごとの prefix で一括取得する
 * 3. ふつうの公開ページでは編集の枠（editable-slot-*）を出さない
 * 4. 編集モード（PageImageEditContext の中）では枠を重ね、草稿の URL を出し、クリックで枠を選べる。動き（フェードイン・スクロールの演出・カードの開閉）を止める
 *
 * api はモックにして本番には接続しない。React Router と useT はモックしない。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactElement } from 'react'
import { api } from '../../lib/api'
import { TEXT_LOGO } from '../../lib/brands'
import { BRAND_SHOWCASES } from '../../lib/brandShowcase'
import { PageImageEditContext, type PageImageEditValue } from '../../lib/pageImageEdit'
import Ei8htPlantsAbout from '../brands/Ei8htPlantsAbout'
import HabitatOidesWorkshop from '../brands/HabitatOidesWorkshop'
import HueEditorialPage from '../brands/HueEditorialPage'
import Home from '../Home'
import HomeBrandShowcase from '../HomeBrandShowcase'
import OurBrands from '../OurBrands'

// 公開ページが使う api の関数だけをモックする（中身は beforeEach で決める）
vi.mock('../../lib/api', async (importActual) => {
  const actual = await importActual<typeof import('../../lib/api')>()
  return {
    ...actual,
    api: {
      siteAssets: { list: vi.fn(), get: vi.fn(), save: vi.fn() },
      events: { list: vi.fn() },
      gallery: { list: vi.fn() },
      products: { list: vi.fn() },
      articles: { list: vi.fn() },
    },
  }
})

/** 一括取得（GET /api/site-assets?prefix=...）のモック */
const listMock = () => vi.mocked(api.siteAssets.list)
/** 1件の取得（GET /api/site-assets/{key}）のモック */
const getMock = () => vi.mocked(api.siteAssets.get)

/**
 * 1件の取得のモックの応答を、キー → URL の辞書から決める（辞書にないキーは空の URL）。
 * @param urls - キー → URL
 * @returns なし
 */
function stubGet(urls: Record<string, string>) {
  getMock().mockImplementation(async (key: string) => ({ key, url: urls[key] ?? '' }))
}

/**
 * 一括取得のモックの応答を、キー → URL の辞書から決める（prefix に当てはまるキーだけを返す）。
 * @param urls - キー → URL
 * @returns なし
 */
function stubList(urls: Record<string, string>) {
  listMock().mockImplementation(async (prefix: string) => Object.entries(urls)
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, url]) => ({ key, url })))
}

/**
 * 編集モードの値を作る。
 * @param patch - 上書きする値
 * @returns 編集モードの値
 */
const editValue = (patch: Partial<PageImageEditValue> = {}): PageImageEditValue => ({
  editMode: true, draftUrls: {}, selectedKey: null, onSelectSlot: vi.fn(), ...patch,
})

/**
 * ページを描画し、取得の応答を反映させる。
 * @param element - 描画するページ
 * @param edit - 編集モードの値（省略するとふつうの公開ページ）
 * @returns 描画結果
 */
async function renderPage(element: ReactElement, edit?: PageImageEditValue) {
  // 1. Router の中に入れ、2. 編集モードなら PageImageEditContext で包む
  const page = <MemoryRouter>{element}</MemoryRouter>
  const result = render(edit ? <PageImageEditContext.Provider value={edit}>{page}</PageImageEditContext.Provider> : page)
  // 3. 取得の Promise を解決させる
  await act(async () => { await Promise.resolve() })
  await act(async () => { await Promise.resolve() })
  await act(async () => { await Promise.resolve() })
  return result
}

/**
 * matchMedia をモックする（ブランドの帯の PC / スマホの判定と、動きを減らす設定の判定に使う）。
 * @param mobile - true ならスマホ幅（max-width）に当てはまる
 * @returns なし
 */
function stubMatchMedia(mobile = false) {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: mobile && query.includes('max-width'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })))
}

beforeEach(() => {
  // 1. 言語を日本語に戻す
  localStorage.clear()
  // 2. api のモックを初期化する（保存した画像は何もない状態）
  vi.mocked(api.siteAssets.list).mockReset()
  vi.mocked(api.siteAssets.get).mockReset()
  stubList({})
  stubGet({})
  vi.mocked(api.events.list).mockResolvedValue([])
  vi.mocked(api.gallery.list).mockResolvedValue([])
  vi.mocked(api.products.list).mockResolvedValue([])
  vi.mocked(api.articles.list).mockResolvedValue([])
  stubMatchMedia(false)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/* ---- ei8ht plants の About ---- */

describe('Ei8htPlantsAbout（ei8ht plants の About）の画像', () => {
  /** メインの写真の代替テキスト */
  const HERO_ALT = '手の形をしたオブジェに載る植物'
  /** メインの写真の localSrc */
  const HERO_LOCAL = '/img/ei8htPlants/ei8htplants_hero.jpg'

  it('ei8ht- の prefix で一括取得し、未保存ならメインの写真と文字ロゴは localSrc を出す', async () => {
    await renderPage(<Ei8htPlantsAbout />)
    expect(listMock()).toHaveBeenCalledWith('ei8ht-')
    expect(screen.getByRole('img', { name: HERO_ALT })).toHaveAttribute('src', HERO_LOCAL)
    expect(document.querySelector(`img[src="${TEXT_LOGO}"]`)).not.toBeNull()
  })

  it('保存した URL があれば、メインの写真（ei8ht-about-hero）と文字ロゴ（ei8ht-wordmark）はそちらを優先する', async () => {
    stubList({ 'ei8ht-about-hero': '/saved-about.jpg', 'ei8ht-wordmark': '/saved-logo.png', 'ei8ht-hero': '/saved-top.jpg' })
    await renderPage(<Ei8htPlantsAbout />)
    // トップページのメインの写真（ei8ht-hero）は About には使わない
    expect(screen.getByRole('img', { name: HERO_ALT })).toHaveAttribute('src', '/saved-about.jpg')
    expect(document.querySelector('img[src="/saved-logo.png"]')).not.toBeNull()
    expect(document.querySelector(`img[src="${TEXT_LOGO}"]`)).toBeNull()
  })

  it('一括取得に失敗しても、localSrc で表示を続ける', async () => {
    listMock().mockRejectedValue(new Error('network'))
    await renderPage(<Ei8htPlantsAbout />)
    expect(screen.getByRole('img', { name: HERO_ALT })).toHaveAttribute('src', HERO_LOCAL)
  })

  it('ふつうの公開ページでは編集の枠を出さない', async () => {
    await renderPage(<Ei8htPlantsAbout />)
    expect(document.querySelector('[data-page-edit-target]')).toBeNull()
  })

  it('編集モードでは2つの枠が出て、草稿の URL を出し、クリックで枠を選べる', async () => {
    const onSelectSlot = vi.fn()
    stubList({ 'ei8ht-about-hero': '/saved-about.jpg' })
    await renderPage(<Ei8htPlantsAbout />, editValue({ onSelectSlot, draftUrls: { 'ei8ht-about-hero': '/draft-about.jpg', 'ei8ht-wordmark': '/draft-logo.png' } }))
    // 1. 草稿が保存した URL より優先される
    expect(screen.getByRole('img', { name: HERO_ALT })).toHaveAttribute('src', '/draft-about.jpg')
    expect(document.querySelector('img[src="/draft-logo.png"]')).not.toBeNull()
    // 2. 枠のボタンが2つ出る
    expect(screen.getByRole('button', { name: 'About のメインの写真を変更' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ロゴ（文字）を変更' })).toBeInTheDocument()
    // 3. クリックすると onSelectSlot にキーが渡る
    fireEvent.click(screen.getByTestId('editable-slot-ei8ht-wordmark'))
    expect(onSelectSlot).toHaveBeenCalledWith('ei8ht-wordmark')
  })

  it('編集モードで草稿を空文字にすると、localSrc に戻る', async () => {
    stubList({ 'ei8ht-about-hero': '/saved-about.jpg' })
    await renderPage(<Ei8htPlantsAbout />, editValue({ draftUrls: { 'ei8ht-about-hero': '' } }))
    expect(screen.getByRole('img', { name: HERO_ALT })).toHaveAttribute('src', HERO_LOCAL)
  })
})

/* ---- Habitat Oides の Workshop ---- */

describe('HabitatOidesWorkshop（Habitat Oides の Workshop）の画像', () => {
  /** メインの写真の代替テキスト */
  const MAIN_ALT = 'ハビタットスタイルのワークショップ'
  /** メインの写真の localSrc */
  const MAIN_LOCAL = '/img/habitatOides/habitat_oides_workshop_main.jpg'

  it('habitat- の prefix で一括取得し、未保存ならメインの写真は localSrc を出す', async () => {
    await renderPage(<HabitatOidesWorkshop />)
    expect(listMock()).toHaveBeenCalledWith('habitat-')
    expect(screen.getByRole('img', { name: MAIN_ALT })).toHaveAttribute('src', MAIN_LOCAL)
  })

  it('保存した URL（habitat-workshop-main）があればそちらを優先し、トップページの写真の枠の URL は使わない', async () => {
    stubList({ 'habitat-workshop-main': '/saved-main.jpg', 'habitat-workshop-photo': '/saved-top-photo.jpg' })
    await renderPage(<HabitatOidesWorkshop />)
    expect(screen.getByRole('img', { name: MAIN_ALT })).toHaveAttribute('src', '/saved-main.jpg')
  })

  it('ふつうの公開ページでは編集の枠を出さない', async () => {
    await renderPage(<HabitatOidesWorkshop />)
    expect(screen.queryByTestId('editable-slot-habitat-workshop-main')).not.toBeInTheDocument()
  })

  it('編集モードでは枠が出て、草稿の URL を出し、クリックで枠を選べる', async () => {
    const onSelectSlot = vi.fn()
    await renderPage(<HabitatOidesWorkshop />, editValue({ onSelectSlot, draftUrls: { 'habitat-workshop-main': '/draft-main.jpg' } }))
    expect(screen.getByRole('img', { name: MAIN_ALT })).toHaveAttribute('src', '/draft-main.jpg')
    fireEvent.click(screen.getByRole('button', { name: 'Workshop のメインの写真を変更' }))
    expect(onSelectSlot).toHaveBeenCalledWith('habitat-workshop-main')
  })
})

/* ---- HUE の読みもの ---- */

describe('HueEditorialPage（HUE の About・Choose・Living）の画像', () => {
  /** 見出しの写真の代替テキスト */
  const HERO_ALT = 'HUE by ei8ht plants の植物'
  /** 6枠すべてに保存した URL がある状態 */
  const SAVED = Object.fromEntries(Array.from({ length: 6 }, (_, index) => {
    const number = String(index + 1).padStart(2, '0')
    return [`hue-color-${number}`, `/saved-${number}.jpg`]
  }))

  it.each([
    ['about', '/saved-02.jpg'],
    ['choose', '/saved-03.jpg'],
    ['living', '/saved-04.jpg'],
  ] as const)('%s の見出しの写真は保存した URL（%s）を出す', async (page, src) => {
    stubGet(SAVED)
    await renderPage(<HueEditorialPage page={page} />)
    expect(screen.getByRole('img', { name: HERO_ALT })).toHaveAttribute('src', src)
  })

  it('未保存（localSrc もない）なら見出しの写真は出さない', async () => {
    await renderPage(<HueEditorialPage page="about" />)
    expect(screen.queryByRole('img', { name: HERO_ALT })).not.toBeInTheDocument()
  })

  it('ふつうの公開ページでは編集の枠を出さず、スクロールで現れる演出の準備（hue-motion-ready）をする', async () => {
    stubGet(SAVED)
    const { container } = await renderPage(<HueEditorialPage page="choose" />)
    expect(document.querySelector('[data-page-edit-target]')).toBeNull()
    expect(container.querySelector('.hue-editorial-page')).toHaveClass('hue-motion-ready')
  })

  it('編集モードでは演出を止め、見出しの写真に枠のボタンが出て、草稿の URL を出す', async () => {
    stubGet(SAVED)
    const { container } = await renderPage(<HueEditorialPage page="living" />, editValue({ draftUrls: { 'hue-color-04': '/draft-04.jpg' } }))
    // 1. 演出の準備のクラスを付けない（最初から表示した状態）
    expect(container.querySelector('.hue-editorial-page')).not.toHaveClass('hue-motion-ready')
    // 2. 見出しの写真は草稿の URL
    expect(screen.getByRole('img', { name: HERO_ALT })).toHaveAttribute('src', '/draft-04.jpg')
    // 3. 見出しの写真の枠はボタン（Living は 04）
    expect(screen.getByRole('button', { name: '色の写真 04を変更' })).toBeInTheDocument()
  })

  it.each([
    ['about', ['hue-color-01', 'hue-color-02', 'hue-color-03', 'hue-color-05']],
    ['choose', ['hue-color-01', 'hue-color-03', 'hue-color-05']],
    ['living', ['hue-color-02', 'hue-color-04', 'hue-color-06']],
  ] as const)('編集モードの %s では、そのページで使う写真の枠（%s）だけが出る', async (page, keys) => {
    await renderPage(<HueEditorialPage page={page} />, editValue())
    // 枠のキー（重なりを除く）
    const shown = [...new Set([...document.querySelectorAll('[data-page-edit-target]')].map((el) => el.getAttribute('data-slot-key')))]
    expect(shown.sort()).toEqual([...keys])
  })

  it('編集モードの Choose では、見出しと同じ写真 03 の記事側の枠は2つ目の枠（span）になり、ボタンは1つだけ', async () => {
    const onSelectSlot = vi.fn()
    await renderPage(<HueEditorialPage page="choose" />, editValue({ onSelectSlot }))
    // 1. 写真 03 の枠は2つあり、ボタンは1つだけ
    const targets = [...document.querySelectorAll('[data-slot-key="hue-color-03"]')]
    expect(targets).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: '色の写真 03を変更' })).toHaveLength(1)
    // 2. 記事側の枠（span）を押しても同じ枠を選ぶ
    const secondary = targets.find((el) => el.tagName === 'SPAN')
    expect(secondary).toBeDefined()
    expect(secondary?.closest('.hue-subpage-entry-image')).not.toBeNull()
    fireEvent.click(secondary!)
    expect(onSelectSlot).toHaveBeenCalledWith('hue-color-03')
  })

  it('編集モードで選んだ枠は aria-pressed="true" になる', async () => {
    await renderPage(<HueEditorialPage page="about" />, editValue({ selectedKey: 'hue-color-02' }))
    expect(screen.getByRole('button', { name: '色の写真 02を変更' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '色の写真 01を変更' })).toHaveAttribute('aria-pressed', 'false')
  })
})

/* ---- 公式サイトのトップ ---- */

describe('Home（公式サイトのトップ）のメインの写真', () => {
  /** メインの写真の代替テキスト */
  const HERO_ALT = '手のひらに載った小さな植物'
  /** メインの写真の localSrc */
  const HERO_LOCAL = '/img/ei8htPlants/ei8htplants_hero.jpg'
  /** ヒーローの section */
  const heroSection = () => screen.getByRole('img', { name: HERO_ALT }).closest('section')

  it('official- の prefix で一括取得し、未保存ならメインの写真は localSrc を出す', async () => {
    await renderPage(<Home />)
    expect(listMock()).toHaveBeenCalledWith('official-')
    expect(screen.getByRole('img', { name: HERO_ALT })).toHaveAttribute('src', HERO_LOCAL)
  })

  it('保存した URL（official-hero）があればそちらを優先する', async () => {
    stubList({ 'official-hero': '/saved-official-hero.jpg' })
    await renderPage(<Home />)
    expect(screen.getByRole('img', { name: HERO_ALT })).toHaveAttribute('src', '/saved-official-hero.jpg')
  })

  it('ふつうの公開ページでは枠を出さず、フェードインは少し遅れて始まる（最初は is-loaded なし）', async () => {
    vi.useFakeTimers()
    render(<MemoryRouter><Home /></MemoryRouter>)
    expect(document.querySelector('[data-page-edit-target]')).toBeNull()
    expect(heroSection()).not.toHaveClass('is-loaded')
    await act(async () => { vi.advanceTimersByTime(100) })
    expect(heroSection()).toHaveClass('is-loaded')
  })

  it('編集モードではフェードインを待たずに最初から is-loaded になり、メインの写真の枠のボタンが出て、草稿の URL を出す', async () => {
    const onSelectSlot = vi.fn()
    await renderPage(<Home />, editValue({ onSelectSlot, draftUrls: { 'official-hero': '/draft-hero.jpg' } }))
    expect(heroSection()).toHaveClass('is-loaded')
    expect(screen.getByRole('img', { name: HERO_ALT })).toHaveAttribute('src', '/draft-hero.jpg')
    fireEvent.click(screen.getByRole('button', { name: '公式トップのメインの写真を変更' }))
    expect(onSelectSlot).toHaveBeenCalledWith('official-hero')
  })

  it('編集モードで草稿を空文字にすると、localSrc に戻る', async () => {
    stubList({ 'official-hero': '/saved-official-hero.jpg' })
    await renderPage(<Home />, editValue({ draftUrls: { 'official-hero': '' } }))
    expect(screen.getByRole('img', { name: HERO_ALT })).toHaveAttribute('src', HERO_LOCAL)
  })
})

/* ---- 公式サイトのブランドの帯（トップページ） ---- */

describe('HomeBrandShowcase（公式トップのブランドの帯）の写真', () => {
  /** ブランドの帯のリンク（カード）の一覧 */
  const cards = () => [...document.querySelectorAll<HTMLAnchorElement>('a.brand-strip-item')]
  /** カードの背景写真（alt=""）の src。なければ null */
  const photoSrc = (card: HTMLElement) => card.querySelector('img[alt=""]')?.getAttribute('src') ?? null
  /** 写真がないカードの中央に大きく出すロゴ（幅 100% で contain の img。文字の横の小さなロゴとは別） */
  const centerLogo = (card: HTMLElement) => [...card.querySelectorAll<HTMLImageElement>(`img[alt="${BRAND_SHOWCASES[2].shortName}"]`)]
    .find((img) => img.style.width === '100%') ?? null
  /** カードが広がっているか（jsdom は '1 1 0' を読み戻せないので、広げたときの値かどうかだけで判断する） */
  const isExpanded = (card: HTMLElement) => card.style.flex === '0 0 55%'

  it('未保存なら ei8ht plants・Habitat Oides は localSrc の写真、HUE は写真なしでロゴを出す', async () => {
    await renderPage(<HomeBrandShowcase />)
    const [ei8ht, habitat, hue] = cards()
    expect(photoSrc(ei8ht)).toBe(BRAND_SHOWCASES[0].img)
    expect(photoSrc(habitat)).toBe(BRAND_SHOWCASES[1].img)
    expect(photoSrc(hue)).toBeNull()
    expect(centerLogo(hue)).not.toBeNull()
  })

  it('保存した URL（official-brand-*）があれば3枚ともそちらを優先する（HUE もロゴから写真になる）', async () => {
    stubList({ 'official-brand-ei8ht': '/b1.jpg', 'official-brand-habitat': '/b2.jpg', 'official-brand-hue': '/b3.jpg' })
    await renderPage(<HomeBrandShowcase />)
    expect(cards().map(photoSrc)).toEqual(['/b1.jpg', '/b2.jpg', '/b3.jpg'])
    expect(centerLogo(cards()[2])).toBeNull()
  })

  it('ふつうの公開ページでは枠を出さず、マウスを乗せたカードが広がる', async () => {
    await renderPage(<HomeBrandShowcase />)
    expect(document.querySelector('[data-page-edit-target]')).toBeNull()
    expect(cards().map(isExpanded)).toEqual([true, false, false])
    fireEvent.mouseEnter(cards()[2])
    // jsdom は縮めたときの値（'1 1 0'）を書き戻せず前の値が残るので、広がったカードだけを確かめる
    expect(isExpanded(cards()[2])).toBe(true)
  })

  it('編集モードではリンクの中に span の枠が出て、クリックするとリンクへ移らずに枠を選ぶ', async () => {
    const onSelectSlot = vi.fn()
    await renderPage(<HomeBrandShowcase />, editValue({ onSelectSlot }))
    // 1. 3枚のカードに枠が1つずつ出る（リンクの中なのでボタンではなく span）
    for (const [index, key] of ['official-brand-ei8ht', 'official-brand-habitat', 'official-brand-hue'].entries()) {
      const target = screen.getByTestId(`editable-slot-${key}`)
      expect(target.tagName).toBe('SPAN')
      expect(target.closest('a')).toBe(cards()[index])
    }
    expect(document.querySelector('a.brand-strip-item button')).toBeNull()
    // 2. クリックするとリンクの既定の動き（移動）を止めて、枠を選ぶ
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    screen.getByTestId('editable-slot-official-brand-hue').dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(onSelectSlot).toHaveBeenCalledWith('official-brand-hue')
  })

  it('編集モードではマウスで開閉せず、選んだ枠のカードを広げる（選んでいないときは先頭）', async () => {
    // 1. 何も選んでいないときは先頭が広がり、マウスを乗せても変わらない
    const { unmount } = await renderPage(<HomeBrandShowcase />, editValue())
    expect(cards().map(isExpanded)).toEqual([true, false, false])
    fireEvent.mouseEnter(cards()[2])
    expect(cards().map(isExpanded)).toEqual([true, false, false])
    unmount()
    // 2. Habitat Oides の枠を選ぶと、そのカードが広がる
    await renderPage(<HomeBrandShowcase />, editValue({ selectedKey: 'official-brand-habitat' }))
    expect(cards().map(isExpanded)).toEqual([false, true, false])
  })

  it('編集モードでは草稿の URL を出し、草稿を空文字にすると localSrc（HUE はロゴ）に戻る', async () => {
    stubList({ 'official-brand-ei8ht': '/b1.jpg', 'official-brand-hue': '/b3.jpg' })
    await renderPage(<HomeBrandShowcase />, editValue({ draftUrls: { 'official-brand-ei8ht': '', 'official-brand-habitat': '/draft-b2.jpg', 'official-brand-hue': '' } }))
    expect(cards().map(photoSrc)).toEqual([BRAND_SHOWCASES[0].img, '/draft-b2.jpg', null])
  })
})

/* ---- 公式サイトの Our Brands ---- */

describe('OurBrands（公式サイトの Our Brands）のカードの写真', () => {
  /** ブランドのカードの一覧 */
  const cards = () => [...document.querySelectorAll<HTMLAnchorElement>('a.our-brand-card')]
  /** カードの写真の src。なければ null */
  const photoSrc = (card: HTMLElement) => card.querySelector('img.our-brand-card-photo')?.getAttribute('src') ?? null

  it('official- の prefix で一括取得し、未保存なら ei8ht plants・Habitat Oides は localSrc、HUE は今までどおり hue-color-01 の写真を出す', async () => {
    stubGet({ 'hue-color-01': '/hue-01.jpg' })
    await renderPage(<OurBrands />)
    expect(listMock()).toHaveBeenCalledWith('official-')
    expect(getMock()).toHaveBeenCalledWith('hue-color-01')
    expect(cards().map(photoSrc)).toEqual([BRAND_SHOWCASES[0].img, BRAND_SHOWCASES[1].img, '/hue-01.jpg'])
  })

  it('official-brand-hue も hue-color-01 も未保存なら、HUE のカードは写真を出さない', async () => {
    await renderPage(<OurBrands />)
    expect(photoSrc(cards()[2])).toBeNull()
    expect(cards()[2].querySelector('.our-brand-card-orbit')).not.toBeNull()
  })

  it('保存した URL（official-brand-*）があれば3枚ともそちらを優先し、HUE は hue-color-01 より official-brand-hue を出す', async () => {
    stubList({ 'official-brand-ei8ht': '/b1.jpg', 'official-brand-habitat': '/b2.jpg', 'official-brand-hue': '/b3.jpg' })
    stubGet({ 'hue-color-01': '/hue-01.jpg' })
    await renderPage(<OurBrands />)
    expect(cards().map(photoSrc)).toEqual(['/b1.jpg', '/b2.jpg', '/b3.jpg'])
  })

  it('ふつうの公開ページでは編集の枠を出さない', async () => {
    await renderPage(<OurBrands />)
    expect(document.querySelector('[data-page-edit-target]')).toBeNull()
  })

  it('編集モードではカード（リンク）の中に span の枠が出て、クリックするとリンクへ移らずに枠を選び、草稿の URL を出す', async () => {
    const onSelectSlot = vi.fn()
    stubGet({ 'hue-color-01': '/hue-01.jpg' })
    await renderPage(<OurBrands />, editValue({ onSelectSlot, draftUrls: { 'official-brand-habitat': '/draft-b2.jpg' } }))
    // 1. 草稿の URL が出る
    expect(cards().map(photoSrc)).toEqual([BRAND_SHOWCASES[0].img, '/draft-b2.jpg', '/hue-01.jpg'])
    // 2. 枠はリンクの中の span
    const target = screen.getByTestId('editable-slot-official-brand-ei8ht')
    expect(target.tagName).toBe('SPAN')
    expect(target.closest('a')).toBe(cards()[0])
    // 3. クリックすると既定の動き（移動）を止めて枠を選ぶ
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    target.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(onSelectSlot).toHaveBeenCalledWith('official-brand-ei8ht')
  })
})
