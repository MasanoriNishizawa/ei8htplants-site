/**
 * lib/brands.ts（3 ブランドの名前・Instagram・ロゴ）のテスト
 * DB に保存する値（イベントは正式名、取扱店・ギャラリーは短い表記「HUE」）と食い違わないことを確かめる
 */
import { describe, it, expect } from 'vitest'
import { BRAND, BRAND_INSTAGRAM, BRAND_NAMES, BRANDS, SHORT_BRAND_NAMES } from '../brands'

describe('brands', () => {
  it('ブランドはサイトの標準の並び順（ei8ht plants・Habitat Oides・HUE）で 3 つある', () => {
    expect(BRANDS.map((b) => b.name)).toEqual(['ei8ht plants', 'Habitat Oides', 'HUE by ei8ht plants'])
  })

  it('正式名の一覧はイベントのブランドの値と同じ（HUE は「HUE by ei8ht plants」）', () => {
    expect(BRAND_NAMES).toEqual(['ei8ht plants', 'Habitat Oides', 'HUE by ei8ht plants'])
  })

  it('短い表記の一覧は HUE だけ「HUE」になり、ほかは正式名と同じ', () => {
    expect(SHORT_BRAND_NAMES).toEqual(['ei8ht plants', 'Habitat Oides', 'HUE'])
    expect(BRAND.hue.shortName).toBe('HUE')
  })

  it('正式名から Instagram の URL を引ける', () => {
    expect(BRAND_INSTAGRAM['ei8ht plants']).toBe('https://www.instagram.com/ei8ht.plants/')
    expect(BRAND_INSTAGRAM['Habitat Oides']).toBe('https://www.instagram.com/habitatoides/')
    expect(BRAND_INSTAGRAM['HUE by ei8ht plants']).toBe('https://www.instagram.com/hue_by.ei8ht.plants/')
  })

  it('短い表記「HUE」では Instagram の URL は引けない（正式名で引く）', () => {
    expect(BRAND_INSTAGRAM['HUE']).toBeUndefined()
  })

  it('各ブランドのパス・アカウント名・ロゴが「/」「@」で始まる', () => {
    for (const b of BRANDS) {
      expect(b.path.startsWith('/')).toBe(true)
      expect(b.instagramHandle.startsWith('@')).toBe(true)
      expect(b.logo.startsWith('/img/')).toBe(true)
    }
  })
})
