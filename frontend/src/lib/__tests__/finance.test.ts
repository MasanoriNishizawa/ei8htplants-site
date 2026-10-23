/**
 * lib/finance.ts（イベントの収支の計算）のテスト
 * 計算の細かい確認は api.test.ts（移動前からある）で行っているため、ここでは
 * - lib/api.ts からの再 export が同じ関数であること（移動しても既存の import が壊れない）
 * - WS ありのイベントの計算・会計年度の境界
 * を確かめる
 */
import { describe, it, expect } from 'vitest'
import { computeFinances, fiscalYear } from '../finance'
import * as apiModule from '../api'
import type { EventFinances } from '../api'

/** すべて 0 の収支（各テストで必要な項目だけ上書きする） */
const BASE: EventFinances = {
  event_id: 'ev',
  sales: 0,
  booth_fee: 0,
  distance: 0,
  gas_price: 170,
  expressway_toll: 0,
  accommodation: 0,
  ws_participants: 0,
  payment_flag: false,
  ws_payment_done: false,
  other_expenses: 0,
  other_expenses_note: null,
  notes: null,
}

describe('lib/finance の移動', () => {
  it('lib/api から import しても lib/finance と同じ関数が使われる', () => {
    expect(apiModule.computeFinances).toBe(computeFinances)
    expect(apiModule.fiscalYear).toBe(fiscalYear)
  })
})

describe('fiscalYear（4 月始まり）', () => {
  it('3 月 31 日は前の年度、4 月 1 日はその年の年度になる', () => {
    expect(fiscalYear('2026-03-31')).toBe(2025)
    expect(fiscalYear('2026-04-01')).toBe(2026)
  })

  it('12 月 31 日と 1 月 1 日は同じ年度になる', () => {
    expect(fiscalYear('2025-12-31')).toBe(2025)
    expect(fiscalYear('2026-01-01')).toBe(2025)
  })
})

describe('computeFinances', () => {
  it('WS ありのイベントで参加 5 人なら WS 売上 5,000 円・資材費 3,500 円になり純利益から資材費が引かれる', () => {
    const r = computeFinances({ ...BASE, sales: 30000, ws_participants: 5 }, true)
    expect(r.wsSales).toBe(5000)
    expect(r.wsCost).toBe(3500)
    expect(r.net).toBe(30000 - 3500)
  })

  it('WS なしのイベントでは参加人数が入っていても WS 売上・資材費は 0 になる', () => {
    const r = computeFinances({ ...BASE, sales: 30000, ws_participants: 5 }, false)
    expect(r.wsSales).toBe(0)
    expect(r.wsCost).toBe(0)
    expect(r.net).toBe(30000)
  })

  it('片道 100km・ガソリン 170 円なら交通費は 往復 200km ÷ 10km/L × 170 円 = 3,400 円になる', () => {
    const r = computeFinances({ ...BASE, distance: 100 }, false)
    expect(r.transport).toBe(3400)
    expect(r.totalExpense).toBe(3400)
  })

  it('支払いフラグありで WS ありなら（売上 − WS 売上 − 支出）× 20% と WS 売上 × 70% を支払い、純利益から引く', () => {
    const r = computeFinances({ ...BASE, sales: 50000, booth_fee: 10000, ws_participants: 10, payment_flag: true }, true)
    // WS 売上 10,000 円・資材費 7,000 円
    expect(r.salesShare).toBe(Math.round((50000 - 10000 - 10000) * 0.2))
    expect(r.wsShare).toBe(7000)
    expect(r.paymentAmount).toBe(6000 + 7000)
    expect(r.net).toBe(50000 - 10000 - 7000 - 13000)
  })
})
