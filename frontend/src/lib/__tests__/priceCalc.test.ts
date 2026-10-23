/**
 * lib/priceCalc.ts（管理画面「販売価格計算」の計算）のテスト
 * - PRICE_UNIT: 切り上げの単位（金額の大きさに関係なく 100 円）
 * - recommendPrice: 原価 ÷ 0.4 を 100 円単位で切り上げる（仕様の例・100 円の境目・浮動小数の誤差・最低 100 円）
 * - recommendPrice の結果の原価率が必ず 40% 以下で、1 単位下げると 40% を超える（必要以上に高くしない）
 * - costRate・formatCostRate・exceedsMaxCostRate（ちょうど 40% は超えていない扱い）
 * - 目標原価率を変えたとき（maxRate 引数）の recommendPrice・formatCostRate・exceedsMaxCostRate
 * - formatRateLabel・parseCostRateInput・loadCostRateInput・saveCostRateInput（localStorage の読み書き）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  MAX_COST_RATE, PRICE_UNIT, recommendPrice, costRate, formatCostRate, exceedsMaxCostRate,
  COST_RATE_STORAGE_KEY, formatRateLabel, parseCostRateInput, loadCostRateInput, saveCostRateInput,
} from '../priceCalc'

describe('MAX_COST_RATE（原価率の上限）', () => {
  it('上限は 0.4（40%）になっている', () => {
    expect(MAX_COST_RATE).toBe(0.4)
  })
})

describe('PRICE_UNIT（切り上げの単位）', () => {
  it('切り上げの単位は金額の大きさに関係なく 100 円', () => {
    expect(PRICE_UNIT).toBe(100)
  })
})

describe('recommendPrice（推奨販売価格）', () => {
  it.each([
    // [原価, 推奨価格]（依頼の仕様の例）
    [1500, 3800],
    [300, 800],
    [5000, 12500],
    [30, 100],
    [400, 1000],
  ])('原価 %d 円なら推奨価格は %d 円になる（仕様の例）', (cost, price) => {
    expect(recommendPrice(cost)).toBe(price)
  })

  it.each([
    // [原価, 推奨価格, 説明]
    [399.6, 1000, '目安 999 円は 100 円単位で 1,000 円に切り上がる'],
    [399.99, 1000, '目安 999.975 円も 1,000 円'],
    [400, 1000, '目安ちょうど 1,000 円はそのまま 1,000 円'],
    [400.01, 1100, '目安 1,000.025 円は 1,100 円に切り上がる（500 円単位の 1,500 円にはならない）'],
    [3999.6, 10000, '目安 9,999 円は 10,000 円'],
    [4000, 10000, '目安ちょうど 10,000 円はそのまま 10,000 円'],
    [4000.4, 10100, '目安 10,001 円は 10,100 円に切り上がる（1,000 円単位の 11,000 円にはならない）'],
    [40.04, 200, '目安 100.1 円は 200 円に切り上がる'],
  ])('100 円の境目: 原価 %d 円なら %d 円になる（%s）', (cost, price) => {
    expect(recommendPrice(cost)).toBe(price)
  })

  it('割り切れる原価（120・1200・3000・4800）は上に跳ねない', () => {
    // 120 ÷ 0.4 = 300、1200 ÷ 0.4 = 3000、3000 ÷ 0.4 = 7500、4800 ÷ 0.4 = 12000
    expect(recommendPrice(120)).toBe(300)
    expect(recommendPrice(1200)).toBe(3000)
    expect(recommendPrice(3000)).toBe(7500)
    expect(recommendPrice(4800)).toBe(12000)
  })

  it('浮動小数の誤差でわずかに大きい原価（400.00000000000006）でも 1,100 円に跳ねず 1,000 円になる', () => {
    // 400 × 0.4 / 11 × 11 のような計算で 400.00000000000006 になり、÷ 0.4 は 1000.0000000000001 になる
    const cost = (1000 * 0.4) / 11 * 11
    expect(cost).not.toBe(400)
    expect(cost / 0.4).toBeGreaterThan(1000)
    expect(recommendPrice(cost)).toBe(1000)
  })

  it('浮動小数の誤差でわずかに大きい原価（200.00000000000003）でも 600 円に跳ねず 500 円になる', () => {
    const cost = (500 * 0.4) / 11 * 11
    expect(cost).not.toBe(200)
    expect(recommendPrice(cost)).toBe(500)
  })

  it('浮動小数の誤差でわずかに小さい原価（119.99999999999999）でも 300 円になる', () => {
    const cost = (300 * 0.4) / 11 * 11
    expect(cost).toBeLessThan(120)
    expect(recommendPrice(cost)).toBe(300)
  })

  it('小数の原価（1.2・0.1 + 0.2）でも最小の 100 円になる', () => {
    expect(recommendPrice(1.2)).toBe(100)
    expect(recommendPrice(0.1 + 0.2)).toBe(100)
  })

  it('いろいろな原価で、推奨価格の原価率は 40% 以下・100 円の倍数・100 円下げると 40% を超える', () => {
    // 1. 1 円〜20,000 円の整数と、小数の原価を試す
    const costs: number[] = []
    for (let c = 1; c <= 20000; c += 7) costs.push(c)
    costs.push(0.5, 12.34, 399.99, 400.01, 1234.56, 3999.99, 4000.01, 99999)
    for (const cost of costs) {
      const price = recommendPrice(cost)
      // 2. 原価率は上限以下（超えていない）
      expect(exceedsMaxCostRate(cost, price)).toBe(false)
      expect(cost / price).toBeLessThanOrEqual(MAX_COST_RATE + 1e-12)
      // 3. 100 円の倍数になっている
      expect(price % PRICE_UNIT).toBe(0)
      // 4. 100 円下げた価格では原価率が上限を超える（必要以上に高くしていない）
      expect(cost / (price - PRICE_UNIT)).toBeGreaterThan(MAX_COST_RATE - 1e-12)
    }
  })
})

describe('costRate（原価率）', () => {
  it('原価 1,500 円・販売価格 4,000 円なら 0.375 になる', () => {
    expect(costRate(1500, 4000)).toBe(0.375)
  })

  it('原価 400 円・販売価格 1,000 円ならちょうど 0.4 になる', () => {
    expect(costRate(400, 1000)).toBe(0.4)
  })

  it('割り切れない値（1 ÷ 3）は小数第 6 位で丸めた値になる', () => {
    expect(costRate(1, 3)).toBe(0.333333)
  })

  it('浮動小数の誤差（0.1 + 0.2 を 1 で割る）は消えて 0.3 になる', () => {
    expect(costRate(0.1 + 0.2, 1)).toBe(0.3)
  })
})

describe('formatCostRate（原価率の表示）', () => {
  it.each([
    [0.375, '37.5%'],
    [0.4, '40.0%'],
    [0.5, '50.0%'],
    [0, '0.0%'],
    [1 / 3, '33.3%'],
    [0.30769, '30.8%'],
  ])('%d は「%s」になる（小数第 1 位まで）', (rate, label) => {
    expect(formatCostRate(rate)).toBe(label)
  })

  it('40% を少しだけ超える原価率（0.4004 = 1,001 円・2,500 円）は「40.0%」ではなく「40.1%」と出す（超過の注意と食い違わない）', () => {
    expect(formatCostRate(costRate(1001, 2500))).toBe('40.1%')
    expect(formatCostRate(costRate(401, 1002))).toBe('40.1%')
  })
})

describe('recommendPrice の最低額', () => {
  it('原価がごく小さい（実生で種子 0.0001 円 ÷ 20 粒）ときも 0 円にならず 100 円になる', () => {
    expect(recommendPrice(0.0001 / 20)).toBe(100)
  })
})

describe('exceedsMaxCostRate（原価率が 40% を超えるか）', () => {
  it('ちょうど 40%（原価 400 円・1,000 円）は超えていない（false）', () => {
    expect(exceedsMaxCostRate(400, 1000)).toBe(false)
  })

  it('浮動小数の誤差でわずかに 40% を上回る（400.00000000000006 円・1,000 円）ときも超えていない扱い（false）', () => {
    const cost = (1000 * 0.4) / 11 * 11
    expect(cost / 1000).toBeGreaterThan(0.4)
    expect(exceedsMaxCostRate(cost, 1000)).toBe(false)
  })

  it('40% を少しでも超える（原価 401 円・1,000 円 = 40.1%）なら true', () => {
    expect(exceedsMaxCostRate(401, 1000)).toBe(true)
  })

  it('50%（原価 1,500 円・3,000 円）なら true', () => {
    expect(exceedsMaxCostRate(1500, 3000)).toBe(true)
  })

  it('40% 未満（原価 1,500 円・4,000 円 = 37.5%）なら false', () => {
    expect(exceedsMaxCostRate(1500, 4000)).toBe(false)
  })
})

describe('目標原価率を変えたとき（maxRate 引数）', () => {
  it.each([
    // [原価, 目標原価率, 推奨価格]
    [1500, 0.35, 4300],
    [1001, 0.35, 2900],
    [350, 0.35, 1000],
    [1000, 0.25, 4000],
    [1500, 0.5, 3000],
    [100, 1, 100],
    [1200, 0.3, 4000],
    [1, 0.001, 1000],
  ])('原価 %d 円・目標 %d なら推奨価格は %d 円になる', (cost, rate, price) => {
    expect(recommendPrice(cost, rate)).toBe(price)
  })

  it('maxRate を省略すると 40% として計算する（recommendPrice(1500) と recommendPrice(1500, 0.4) は同じ）', () => {
    expect(recommendPrice(1500)).toBe(recommendPrice(1500, 0.4))
  })

  it('いろいろな原価と目標原価率で、推奨価格の原価率は目標以下・100 円の倍数・100 円下げると目標を超える', () => {
    for (const rate of [0.1, 0.25, 0.3, 0.33, 0.35, 0.375, 0.45, 0.5, 0.8, 1]) {
      for (let cost = 1; cost <= 15000; cost += 37) {
        const price = recommendPrice(cost, rate)
        expect(exceedsMaxCostRate(cost, price, rate)).toBe(false)
        expect(price % PRICE_UNIT).toBe(0)
        expect(cost / (price - PRICE_UNIT)).toBeGreaterThan(rate - 1e-12)
      }
    }
  })

  it('exceedsMaxCostRate: 目標 35% で原価 350 円・1,000 円（ちょうど 35%）は false、351 円なら true', () => {
    expect(exceedsMaxCostRate(350, 1000, 0.35)).toBe(false)
    expect(exceedsMaxCostRate(351, 1000, 0.35)).toBe(true)
  })

  it('exceedsMaxCostRate: 37.5%（原価 1,500 円・4,000 円）は目標 40% なら false、目標 35% なら true', () => {
    expect(exceedsMaxCostRate(1500, 4000)).toBe(false)
    expect(exceedsMaxCostRate(1500, 4000, 0.35)).toBe(true)
  })

  it('formatCostRate: 目標 35% を少しだけ超える 0.3504 は「35.1%」、目標 40% のときは四捨五入のまま「35.0%」', () => {
    expect(formatCostRate(0.3504, 0.35)).toBe('35.1%')
    expect(formatCostRate(0.3504)).toBe('35.0%')
  })

  it('formatCostRate: 目標ちょうど（0.35・目標 35%）は切り上げず「35.0%」', () => {
    expect(formatCostRate(0.35, 0.35)).toBe('35.0%')
  })
})

describe('formatRateLabel（目標原価率の見出し用の表示）', () => {
  it.each([
    [0.4, '40%'],
    [0.375, '37.5%'],
    [0.35, '35%'],
    [0.07, '7%'],
    [1, '100%'],
    [0.001, '0.1%'],
  ])('%d は「%s」になる（余計な 0 や誤差は付かない）', (rate, label) => {
    expect(formatRateLabel(rate)).toBe(label)
  })
})

describe('parseCostRateInput（目標原価率の入力の読み取り）', () => {
  it.each([
    ['40', 0.4],
    ['37.5', 0.375],
    [' 35 ', 0.35],
    ['100', 1],
    ['0.1', 0.001],
    ['40.', 0.4],
    ['.5', 0.005],
    ['４０', 0.4],
    ['３７．５', 0.375],
    ['３７。５', 0.375],
    ['　３５　', 0.35],
  ])('「%s」は %d になる（0 より大きく 100 以下。全角の数字・「．」は半角にして読む）', (input, rate) => {
    expect(parseCostRateInput(input)).toBe(rate)
  })

  it.each([
    [''],
    ['   '],
    ['0'],
    ['-5'],
    ['100.1'],
    ['101'],
    ['abc'],
    ['40abc'],
    ['Infinity'],
    ['1e2'],
    ['1e1'],
    ['0x28'],
    ['-0'],
    ['.'],
    ['40..5'],
    ['４０ａ'],
    ['0.00004'],
  ])('「%s」は受け付けず null になる（10 進数の形でない・範囲外・丸めると 0 になる小さな率）', (input) => {
    expect(parseCostRateInput(input)).toBeNull()
  })
})

describe('loadCostRateInput・saveCostRateInput（目標原価率の保存と復元）', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('保存のキーは「price-calc-cost-rate」', () => {
    expect(COST_RATE_STORAGE_KEY).toBe('price-calc-cost-rate')
  })

  it('何も保存していなければ既定の「40」を返す', () => {
    expect(loadCostRateInput()).toBe('40')
  })

  it('保存した「35」はそのまま「35」で復元される', () => {
    saveCostRateInput('35')
    expect(localStorage.getItem(COST_RATE_STORAGE_KEY)).toBe('35')
    expect(loadCostRateInput()).toBe('35')
  })

  it('前後の空白は除いて保存する', () => {
    saveCostRateInput(' 37.5 ')
    expect(localStorage.getItem(COST_RATE_STORAGE_KEY)).toBe('37.5')
  })

  it.each([['0'], ['150'], ['abc'], ['']])('localStorage に受け付けない値「%s」が入っていれば「40」を返す', (saved) => {
    localStorage.setItem(COST_RATE_STORAGE_KEY, saved)
    expect(loadCostRateInput()).toBe('40')
  })

  it.each([[''], ['0'], ['150'], ['abc']])('受け付けない値「%s」は保存せず、前に保存した値が残る', (input) => {
    saveCostRateInput('35')
    saveCostRateInput(input)
    expect(localStorage.getItem(COST_RATE_STORAGE_KEY)).toBe('35')
  })

  it('localStorage が読めない（getItem が例外）ときも例外を出さず「40」を返す', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    expect(loadCostRateInput()).toBe('40')
  })

  it('localStorage に書けない（setItem が例外）ときも例外を出さない', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    expect(() => saveCostRateInput('35')).not.toThrow()
  })
})
