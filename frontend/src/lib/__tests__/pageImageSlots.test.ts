/**
 * pageImageSlots（3ブランドと公式サイトのページの差し替えられる画像の枠）と
 * pageImageEdit の isPageEditorMessage（編集画面とプレビューの間のメッセージの確認）のテスト
 *
 * 確かめること:
 * 1. ブランドごとの prefix・枠の数（ei8ht 3・Habitat 14・HUE 6・公式 4）
 * 2. isPageImageBrand が4サイトだけを受け付ける
 * 3. findPageImageSlot が4ブランド（公式サイトを含む）から探す
 * 4. resolvePageImageSrc の優先順（保存した URL → localSrc → null）
 * 5. isPageEditorMessage が形の違うメッセージを受け付けない（3種類とも page が必要）
 * 6. ブランド → ページ → 枠の定義（ページの一覧・共通の枠・pagesUsingSlot・findPageImagePage）
 * 7. 公式サイトの枠（official-hero・ブランド紹介の3枚）と、新しいページの枠の localSrc
 */
import { describe, it, expect } from 'vitest'
import {
  EI8HT_PAGE_SLOTS,
  EI8HT_ABOUT_HERO_SLOT,
  HABITAT_HOME_PHOTO_SLOTS,
  HABITAT_WORKSHOP_MAIN_SLOT,
  HUE_PAGE_SLOTS,
  OFFICIAL_BRAND_SLOTS,
  OFFICIAL_BRAND_SLOT_KEYS,
  OFFICIAL_HERO_SLOT,
  PAGE_IMAGE_HOME_PAGE,
  PAGE_IMAGE_BRANDS,
  PAGE_IMAGE_BRAND_ORDER,
  findPageImageSlot,
  findPageImagePage,
  pagesUsingSlot,
  isPageImageBrand,
  resolvePageImageSrc,
} from '../pageImageSlots'
import { TEXT_LOGO } from '../brands'
import { BRAND_SHOWCASES } from '../brandShowcase'
import { isPageEditorMessage } from '../pageImageEdit'

describe('PAGE_IMAGE_BRANDS', () => {
  it('タブの並びは ei8htplants → habitat-oides → hue → official になる', () => {
    expect(PAGE_IMAGE_BRAND_ORDER).toEqual(['ei8htplants', 'habitat-oides', 'hue', 'official'])
  })

  it('ブランドごとの prefix と枠の数が ei8ht- 3件・habitat- 14件・hue-color- 6件・official- 4件になる', () => {
    expect(PAGE_IMAGE_BRANDS.official.prefix).toBe('official-')
    expect(PAGE_IMAGE_BRANDS.official.slots).toHaveLength(4)
    expect(PAGE_IMAGE_BRANDS.ei8htplants.prefix).toBe('ei8ht-')
    expect(PAGE_IMAGE_BRANDS.ei8htplants.slots).toHaveLength(3)
    expect(PAGE_IMAGE_BRANDS['habitat-oides'].prefix).toBe('habitat-')
    expect(PAGE_IMAGE_BRANDS['habitat-oides'].slots).toHaveLength(14)
    expect(PAGE_IMAGE_BRANDS.hue.prefix).toBe('hue-color-')
    expect(PAGE_IMAGE_BRANDS.hue.slots.map(({ key }) => key)).toEqual([
      'hue-color-01', 'hue-color-02', 'hue-color-03', 'hue-color-04', 'hue-color-05', 'hue-color-06',
    ])
  })

  it('ei8ht の枠の localSrc は今までのメインの写真と文字ロゴになる', () => {
    expect(EI8HT_PAGE_SLOTS.map(({ key, localSrc }) => [key, localSrc])).toEqual([
      ['ei8ht-hero', '/img/ei8htPlants/ei8htplants_hero.jpg'],
      ['ei8ht-wordmark', TEXT_LOGO],
    ])
  })

  it('HUE の枠は localSrc を持たない（未設定なら画像なし）', () => {
    expect(HUE_PAGE_SLOTS.every(({ localSrc }) => localSrc === null)).toBe(true)
  })
})

describe('isPageImageBrand', () => {
  it.each(['ei8htplants', 'habitat-oides', 'hue', 'official'])('%s はブランドとして受け付ける', (value) => {
    expect(isPageImageBrand(value)).toBe(true)
  })

  it.each([undefined, '', 'habitatoides', 'HUE'])('%s はブランドとして受け付けない', (value) => {
    expect(isPageImageBrand(value)).toBe(false)
  })
})

describe('findPageImageSlot', () => {
  it('4ブランド（公式サイトを含む）のどの枠のキーからでも枠が見つかる', () => {
    expect(findPageImageSlot('ei8ht-wordmark')?.label).toBe('ロゴ（文字）')
    expect(findPageImageSlot('habitat-object-01')?.label).toBe('オブジェクト 01（左上）')
    expect(findPageImageSlot('hue-color-03')?.label).toBe('色の写真 03')
    expect(findPageImageSlot('official-hero')?.label).toBe('公式トップのメインの写真')
    expect(findPageImageSlot('habitat-workshop-main')?.label).toBe('Workshop のメインの写真')
  })

  it('一覧にないキー（hue-color-study・枠から外したサインの habitat-sign）は undefined になる', () => {
    expect(findPageImageSlot('hue-color-study')).toBeUndefined()
    expect(findPageImageSlot('habitat-sign')).toBeUndefined()
  })
})

describe('resolvePageImageSrc', () => {
  // localSrc を持つ枠（ei8ht-hero）
  const hero = EI8HT_PAGE_SLOTS[0]
  // localSrc を持たない枠（hue-color-01）
  const hue = HUE_PAGE_SLOTS[0]

  it('保存した URL があると localSrc より優先される', () => {
    expect(resolvePageImageSrc(hero, { 'ei8ht-hero': '/saved.jpg' })).toBe('/saved.jpg')
  })

  it('保存した URL が空文字だと localSrc に戻る', () => {
    expect(resolvePageImageSrc(hero, { 'ei8ht-hero': '' })).toBe('/img/ei8htPlants/ei8htplants_hero.jpg')
  })

  it('保存した URL も localSrc もない枠は null になる', () => {
    expect(resolvePageImageSrc(hue, {})).toBeNull()
  })
})

describe('isPageEditorMessage', () => {
  it('ready・select・state の正しい形のメッセージは受け付ける', () => {
    expect(isPageEditorMessage({ type: 'page-editor:ready', brand: 'hue', page: 'home' })).toBe(true)
    expect(isPageEditorMessage({ type: 'page-editor:select', brand: 'hue', page: 'home', key: 'hue-color-01' })).toBe(true)
    expect(isPageEditorMessage({ type: 'page-editor:state', brand: 'hue', page: 'home', draftUrls: {}, selectedKey: null, reveal: false })).toBe(true)
    expect(isPageEditorMessage({ type: 'page-editor:state', brand: 'hue', page: 'home', draftUrls: { a: 'b' }, selectedKey: 'a', reveal: true })).toBe(true)
  })

  it.each([
    ['null', null],
    ['文字列', 'page-editor:ready'],
    ['brand がない', { type: 'page-editor:ready', page: 'home' }],
    ['page がない', { type: 'page-editor:ready', brand: 'hue' }],
    ['page が数値', { type: 'page-editor:ready', brand: 'hue', page: 1 }],
    ['知らない type', { type: 'other', brand: 'hue', page: 'home' }],
    ['select で key が数値', { type: 'page-editor:select', brand: 'hue', page: 'home', key: 1 }],
    ['state で draftUrls が null', { type: 'page-editor:state', brand: 'hue', page: 'home', draftUrls: null, selectedKey: null, reveal: false }],
    ['state で selectedKey が数値', { type: 'page-editor:state', brand: 'hue', page: 'home', draftUrls: {}, selectedKey: 1, reveal: false }],
    ['state で reveal がない', { type: 'page-editor:state', brand: 'hue', page: 'home', draftUrls: {}, selectedKey: null }],
  ])('%s のデータは受け付けない', (_label, data) => {
    expect(isPageEditorMessage(data)).toBe(false)
  })
})

/** ページ定義と共有画像の範囲を検証する。 */
describe('ページごとの画像の定義', () => {
  it('固定画像のあるページだけが選択できる', () => {
    expect(PAGE_IMAGE_BRANDS.ei8htplants.pages.map(({ id }) => id)).toEqual(['home', 'about'])
    expect(PAGE_IMAGE_BRANDS['habitat-oides'].pages.map(({ id }) => id)).toEqual(['home', 'workshop'])
    expect(PAGE_IMAGE_BRANDS.hue.pages.map(({ id }) => id)).toEqual(['home', 'about', 'choose', 'living'])
    expect(PAGE_IMAGE_BRANDS.official.pages.map(({ path }) => path)).toEqual(['/official', '/official/brands'])
    expect(findPageImagePage('hue', 'unknown')).toBeUndefined()
    expect(findPageImagePage('hue', undefined)).toBeUndefined()
  })

  it('共有キーは全ページ一覧では重複せず、使用するページを列挙できる', () => {
    expect(pagesUsingSlot('ei8htplants', 'ei8ht-wordmark').map(({ id }) => id)).toEqual(['home', 'about'])
    expect(pagesUsingSlot('hue', 'hue-color-01').map(({ id }) => id)).toEqual(['home', 'about', 'choose'])
    expect(pagesUsingSlot('official', 'official-brand-hue').map(({ id }) => id)).toEqual(['home', 'brands'])
    expect(pagesUsingSlot('official', 'official-hero').map(({ id }) => id)).toEqual(['home'])
    for (const brand of Object.values(PAGE_IMAGE_BRANDS)) {
      expect(new Set(brand.slots.map(({ key }) => key)).size).toBe(brand.slots.length)
    }
  })
})

/** HUEの読みものページには、実際に使っている写真だけを登録する。 */
describe('HUEのページ別画像', () => {
  it.each([
    ['home', ['01', '02', '03', '04', '05', '06']],
    ['about', ['01', '02', '03', '05']],
    ['choose', ['01', '03', '05']],
    ['living', ['02', '04', '06']],
  ])('%s の画像一覧は公開ページで使う写真と一致する', (pageId, numbers) => {
    expect(findPageImagePage('hue', pageId)?.slots.map(({ key }) => key).sort()).toEqual(numbers.map((number) => `hue-color-${number}`))
  })
})

/** 公式サイトの枠と、新しく足したページの枠の定義を検証する。 */
describe('公式サイトと新しいページの枠', () => {
  it('公式サイトのキーは official-hero とブランド紹介の3枚（ei8ht・habitat・hue の順）で、すべて official- で始まる', () => {
    expect(PAGE_IMAGE_BRANDS.official.slots.map(({ key }) => key)).toEqual([
      'official-hero', 'official-brand-ei8ht', 'official-brand-habitat', 'official-brand-hue',
    ])
    expect(OFFICIAL_BRAND_SLOT_KEYS).toEqual(['official-brand-ei8ht', 'official-brand-habitat', 'official-brand-hue'])
    expect(PAGE_IMAGE_BRANDS.official.slots.every(({ key }) => key.startsWith('official-'))).toBe(true)
  })

  it('公式トップのメインの写真の localSrc は今までのヒーロー画像になる', () => {
    expect(OFFICIAL_HERO_SLOT.localSrc).toBe('/img/ei8htPlants/ei8htplants_hero.jpg')
  })

  it('ブランド紹介の写真の localSrc はブランド紹介（BRAND_SHOWCASES）の img と同じで、HUE は null になる', () => {
    expect(OFFICIAL_BRAND_SLOTS.map(({ localSrc }) => localSrc)).toEqual(BRAND_SHOWCASES.map(({ img }) => img ?? null))
    expect(OFFICIAL_BRAND_SLOTS[2].localSrc).toBeNull()
  })

  it('公式サイトのトップはメインの写真＋ブランド紹介の3枚、Our Brands はブランド紹介の3枚だけを使う', () => {
    expect(findPageImagePage('official', 'home')?.slots.map(({ key }) => key)).toEqual([
      'official-hero', 'official-brand-ei8ht', 'official-brand-habitat', 'official-brand-hue',
    ])
    expect(findPageImagePage('official', 'brands')?.slots.map(({ key }) => key)).toEqual([...OFFICIAL_BRAND_SLOT_KEYS])
  })

  it('ei8ht plants の About はメインの写真（ei8ht-about-hero）とトップと共通の文字ロゴを使う', () => {
    expect(findPageImagePage('ei8htplants', 'about')?.slots.map(({ key }) => key)).toEqual(['ei8ht-about-hero', 'ei8ht-wordmark'])
    expect(EI8HT_ABOUT_HERO_SLOT.localSrc).toBe('/img/ei8htPlants/ei8htplants_hero.jpg')
  })

  it('Habitat Oides のトップは動く画像11枠＋ページ写真2枠、Workshop はメインの写真1枠で、3枠の localSrc はワークショップの写真', () => {
    expect(findPageImagePage('habitat-oides', 'home')?.slots).toHaveLength(13)
    expect(findPageImagePage('habitat-oides', 'home')?.slots.slice(-2).map(({ key }) => key)).toEqual(['habitat-world', 'habitat-workshop-photo'])
    expect(findPageImagePage('habitat-oides', 'workshop')?.slots.map(({ key }) => key)).toEqual(['habitat-workshop-main'])
    for (const slot of [...HABITAT_HOME_PHOTO_SLOTS, HABITAT_WORKSHOP_MAIN_SLOT]) {
      expect(slot.localSrc).toBe('/img/habitatOides/habitat_oides_workshop_main.jpg')
    }
  })

  it('ページと枠の数は ei8htplants（home 2・about 2）・habitat-oides（home 13・workshop 1）・hue（6・4・3・3）・official（home 4・brands 3）になる', () => {
    const counts = Object.fromEntries(Object.values(PAGE_IMAGE_BRANDS).map((brand) => [
      brand.brand, brand.pages.map(({ id, slots }) => `${id}:${slots.length}`),
    ]))
    expect(counts).toEqual({
      ei8htplants: ['home:2', 'about:2'],
      'habitat-oides': ['home:13', 'workshop:1'],
      hue: ['home:6', 'about:4', 'choose:3', 'living:3'],
      official: ['home:4', 'brands:3'],
    })
  })

  it('どのブランドも最初のページは home（PAGE_IMAGE_HOME_PAGE）になる', () => {
    expect(PAGE_IMAGE_HOME_PAGE).toBe('home')
    for (const brand of Object.values(PAGE_IMAGE_BRANDS)) expect(brand.pages[0].id).toBe('home')
  })

  it('複数のページで使う枠は、HUE の写真6枚・ei8ht-wordmark・公式サイトのブランド紹介の3枚だけ', () => {
    // ブランドの中で2ページ以上から使われている枠のキー
    const shared = Object.values(PAGE_IMAGE_BRANDS).flatMap((brand) => brand.slots
      .filter(({ key }) => pagesUsingSlot(brand.brand, key).length > 1)
      .map(({ key }) => key))
    expect(shared.sort()).toEqual([
      'ei8ht-wordmark',
      'hue-color-01', 'hue-color-02', 'hue-color-03', 'hue-color-04', 'hue-color-05', 'hue-color-06',
      'official-brand-ei8ht', 'official-brand-habitat', 'official-brand-hue',
    ].sort())
  })
})
