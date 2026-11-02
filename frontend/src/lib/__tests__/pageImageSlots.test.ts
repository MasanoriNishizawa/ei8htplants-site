/**
 * pageImageSlots（3ブランドのトップページの差し替えられる画像の枠）と
 * pageImageEdit の isPageEditorMessage（編集画面とプレビューの間のメッセージの確認）のテスト
 *
 * 確かめること:
 * 1. ブランドごとの prefix・枠の数（ei8ht 2・Habitat 12・HUE 6）
 * 2. isPageImageBrand が3ブランドだけを受け付ける
 * 3. findPageImageSlot が3ブランドから探す
 * 4. resolvePageImageSrc の優先順（保存した URL → localSrc → null）
 * 5. isPageEditorMessage が形の違うメッセージを受け付けない
 */
import { describe, it, expect } from 'vitest'
import {
  EI8HT_PAGE_SLOTS,
  HUE_PAGE_SLOTS,
  PAGE_IMAGE_BRANDS,
  PAGE_IMAGE_BRAND_ORDER,
  findPageImageSlot,
  isPageImageBrand,
  resolvePageImageSrc,
} from '../pageImageSlots'
import { TEXT_LOGO } from '../brands'
import { isPageEditorMessage } from '../pageImageEdit'

describe('PAGE_IMAGE_BRANDS', () => {
  it('タブの並びは ei8htplants → habitat-oides → hue になる', () => {
    expect(PAGE_IMAGE_BRAND_ORDER).toEqual(['ei8htplants', 'habitat-oides', 'hue'])
  })

  it('ブランドごとの prefix と枠の数が ei8ht- 2件・habitat- 12件・hue-color- 6件になる', () => {
    expect(PAGE_IMAGE_BRANDS.ei8htplants.prefix).toBe('ei8ht-')
    expect(PAGE_IMAGE_BRANDS.ei8htplants.slots).toHaveLength(2)
    expect(PAGE_IMAGE_BRANDS['habitat-oides'].prefix).toBe('habitat-')
    expect(PAGE_IMAGE_BRANDS['habitat-oides'].slots).toHaveLength(12)
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
  it.each(['ei8htplants', 'habitat-oides', 'hue'])('%s はブランドとして受け付ける', (value) => {
    expect(isPageImageBrand(value)).toBe(true)
  })

  it.each([undefined, '', 'habitatoides', 'HUE', 'official'])('%s はブランドとして受け付けない', (value) => {
    expect(isPageImageBrand(value)).toBe(false)
  })
})

describe('findPageImageSlot', () => {
  it('3ブランドのどの枠のキーからでも枠が見つかる', () => {
    expect(findPageImageSlot('ei8ht-wordmark')?.label).toBe('ロゴ（文字）')
    expect(findPageImageSlot('habitat-sign')?.label).toBe('ブランドのサイン')
    expect(findPageImageSlot('hue-color-03')?.label).toBe('色の写真 03')
  })

  it('一覧にないキー（hue-color-study など）は undefined になる', () => {
    expect(findPageImageSlot('hue-color-study')).toBeUndefined()
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
    expect(isPageEditorMessage({ type: 'page-editor:ready', brand: 'hue' })).toBe(true)
    expect(isPageEditorMessage({ type: 'page-editor:select', brand: 'hue', key: 'hue-color-01' })).toBe(true)
    expect(isPageEditorMessage({ type: 'page-editor:state', brand: 'hue', draftUrls: {}, selectedKey: null, reveal: false })).toBe(true)
    expect(isPageEditorMessage({ type: 'page-editor:state', brand: 'hue', draftUrls: { a: 'b' }, selectedKey: 'a', reveal: true })).toBe(true)
  })

  it.each([
    ['null', null],
    ['文字列', 'page-editor:ready'],
    ['brand がない', { type: 'page-editor:ready' }],
    ['知らない type', { type: 'other', brand: 'hue' }],
    ['select で key が数値', { type: 'page-editor:select', brand: 'hue', key: 1 }],
    ['state で draftUrls が null', { type: 'page-editor:state', brand: 'hue', draftUrls: null, selectedKey: null, reveal: false }],
    ['state で selectedKey が数値', { type: 'page-editor:state', brand: 'hue', draftUrls: {}, selectedKey: 1, reveal: false }],
    ['state で reveal がない', { type: 'page-editor:state', brand: 'hue', draftUrls: {}, selectedKey: null }],
  ])('%s のデータは受け付けない', (_label, data) => {
    expect(isPageEditorMessage(data)).toBe(false)
  })
})
