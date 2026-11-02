/**
 * habitatMotionSlots（Habitat Oides トップページの動く画像の枠）のテスト
 *
 * 確かめること:
 * 1. 枠は12個（hero 5・sign 1・object 6）で、キーが重ならない
 * 2. habitatSlotsByGroup が種類ごとに定義順で返す
 * 3. findHabitatSlot がキーから枠を探し、ないキーは undefined
 * 4. resolveHabitatSlotSrc の優先順（保存した URL → localSrc → null）
 */
import { describe, it, expect } from 'vitest'
import {
  HABITAT_MOTION_GROUP_ORDER,
  HABITAT_MOTION_PREFIX,
  HABITAT_MOTION_SLOTS,
  findHabitatSlot,
  habitatSlotsByGroup,
  resolveHabitatSlotSrc,
  type HabitatMotionSlot,
} from '../habitatMotionSlots'

/** localSrc を持たない枠のテスト用定義 */
const NO_LOCAL: HabitatMotionSlot = { key: 'habitat-object-02', group: 'object', label: 'x', note: '', localSrc: null }
/** localSrc を持つ枠のテスト用定義 */
const WITH_LOCAL: HabitatMotionSlot = { key: 'habitat-hero-01', group: 'hero', label: 'x', note: '', localSrc: '/img/local.jpg' }

describe('HABITAT_MOTION_SLOTS', () => {
  it('枠の一覧は12個で、キーはすべて habitat- で始まり重ならない', () => {
    const keys = HABITAT_MOTION_SLOTS.map(({ key }) => key)
    expect(keys).toHaveLength(12)
    expect(new Set(keys).size).toBe(12)
    expect(keys.every((key) => key.startsWith(HABITAT_MOTION_PREFIX))).toBe(true)
  })

  it('種類の表示順は hero → sign → object になる', () => {
    expect(HABITAT_MOTION_GROUP_ORDER).toEqual(['hero', 'sign', 'object'])
  })
})

describe('habitatSlotsByGroup', () => {
  it('hero を指定すると habitat-hero-01〜05 が定義順で返る', () => {
    expect(habitatSlotsByGroup('hero').map(({ key }) => key)).toEqual([
      'habitat-hero-01', 'habitat-hero-02', 'habitat-hero-03', 'habitat-hero-04', 'habitat-hero-05',
    ])
  })

  it('sign を指定すると habitat-sign の1件だけが返る', () => {
    expect(habitatSlotsByGroup('sign').map(({ key }) => key)).toEqual(['habitat-sign'])
  })

  it('object を指定すると habitat-object-01〜06 が定義順で返る', () => {
    expect(habitatSlotsByGroup('object').map(({ key }) => key)).toEqual([
      'habitat-object-01', 'habitat-object-02', 'habitat-object-03', 'habitat-object-04', 'habitat-object-05', 'habitat-object-06',
    ])
  })
})

describe('findHabitatSlot', () => {
  it('定義にあるキーを渡すとその枠が返る', () => {
    expect(findHabitatSlot('habitat-sign')?.group).toBe('sign')
  })

  it('定義にないキーを渡すと undefined になる', () => {
    expect(findHabitatSlot('habitat-object-07')).toBeUndefined()
  })
})

describe('resolveHabitatSlotSrc', () => {
  it('保存した URL があると localSrc より優先して返る', () => {
    expect(resolveHabitatSlotSrc(WITH_LOCAL, { 'habitat-hero-01': '/remote.jpg' })).toBe('/remote.jpg')
  })

  it('保存した URL が空文字なら localSrc が返る', () => {
    expect(resolveHabitatSlotSrc(WITH_LOCAL, { 'habitat-hero-01': '' })).toBe('/img/local.jpg')
  })

  it('保存した URL がなく localSrc もない枠は null になる', () => {
    expect(resolveHabitatSlotSrc(NO_LOCAL, {})).toBeNull()
  })

  it('ほかのキーの URL は使わない（別の枠に保存した画像が混ざらない）', () => {
    expect(resolveHabitatSlotSrc(NO_LOCAL, { 'habitat-object-01': '/other.png' })).toBeNull()
  })
})
