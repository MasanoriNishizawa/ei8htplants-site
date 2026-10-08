import { describe, it, expect } from 'vitest'
import { computeFinances, fiscalYear, type EventFinances } from '../api'

const BASE: EventFinances = {
  event_id: 'test-id',
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

describe('fiscalYear', () => {
  it('4月以降は同年を返す', () => {
    expect(fiscalYear('2025-04-01')).toBe(2025)
    expect(fiscalYear('2025-09-15')).toBe(2025)
    expect(fiscalYear('2025-03-31')).toBe(2024)
  })

  it('3月以前は前年を返す', () => {
    expect(fiscalYear('2026-01-01')).toBe(2025)
    expect(fiscalYear('2026-03-31')).toBe(2025)
    expect(fiscalYear('2026-04-01')).toBe(2026)
  })

  it('境界値: 3月末と4月初', () => {
    expect(fiscalYear('2024-03-31')).toBe(2023)
    expect(fiscalYear('2024-04-01')).toBe(2024)
  })
})

describe('computeFinances - payment_flag なし', () => {
  it('全ゼロのとき全て0', () => {
    const result = computeFinances(BASE, false)
    expect(result.transport).toBe(0)
    expect(result.totalExpense).toBe(0)
    expect(result.net).toBe(0)
    expect(result.salesShare).toBe(0)
    expect(result.wsShare).toBe(0)
    expect(result.paymentAmount).toBe(0)
  })

  it('売上があっても payment_flag=false なら share はゼロ', () => {
    const fin = { ...BASE, sales: 100000, payment_flag: false }
    const result = computeFinances(fin, false)
    expect(result.net).toBe(100000)
    expect(result.salesShare).toBe(0)
    expect(result.paymentAmount).toBe(0)
  })

  it('輸送費計算: distance * 2 / 10 * gas_price', () => {
    const fin = { ...BASE, distance: 50, gas_price: 170 }
    const result = computeFinances(fin, false)
    // 50km * 2 / 10 * 170 = 1700
    expect(result.transport).toBe(1700)
  })
})

describe('computeFinances - payment_flag あり', () => {
  it('WS なし: (sales - totalExpense) * 0.2 が salesShare', () => {
    const fin = { ...BASE, sales: 100000, booth_fee: 20000, payment_flag: true }
    const result = computeFinances(fin, false)
    // totalExpense = 20000, net前 = 80000, salesShare = 80000 * 0.2 = 16000
    expect(result.salesShare).toBe(16000)
    expect(result.wsShare).toBe(0)
    expect(result.paymentAmount).toBe(16000)
    // net = sales - totalExpense - paymentAmount = 100000 - 20000 - 16000 = 64000
    expect(result.net).toBe(64000)
  })

  it('WS あり: wsShare = ws_participants * 1000 * 0.7', () => {
    const fin = { ...BASE, sales: 50000, ws_participants: 5, payment_flag: true }
    const result = computeFinances(fin, true)
    // wsSales = 5 * 1000 = 5000, wsShare = 5000 * 0.7 = 3500
    expect(result.wsSales).toBe(5000)
    expect(result.wsShare).toBe(3500)
    // salesShare = (50000 - 5000 - 0) * 0.2 = 9000
    expect(result.salesShare).toBe(9000)
    expect(result.paymentAmount).toBe(12500)
  })

  it('マイナス利益のとき salesShare もマイナス', () => {
    const fin = { ...BASE, sales: 5000, booth_fee: 20000, payment_flag: true }
    const result = computeFinances(fin, false)
    // (5000 - 20000) * 0.2 = -3000
    expect(result.salesShare).toBe(-3000)
    expect(result.paymentAmount).toBe(-3000)
  })

  it('WS なし: has_workshop=true でも ws_participants=0 なら wsShare=0', () => {
    const fin = { ...BASE, sales: 10000, ws_participants: 0, payment_flag: true }
    const result = computeFinances(fin, true)
    expect(result.wsSales).toBe(0)
    expect(result.wsShare).toBe(0)
  })

  it('輸送費が totalExpense に含まれる', () => {
    const fin = { ...BASE, sales: 50000, distance: 100, gas_price: 170, booth_fee: 10000, payment_flag: true }
    const result = computeFinances(fin, false)
    // transport = 100 * 2 / 10 * 170 = 3400
    expect(result.transport).toBe(3400)
    // totalExpense = 10000 + 3400 = 13400
    expect(result.totalExpense).toBe(13400)
    // salesShare = (50000 - 13400) * 0.2 = 7320
    expect(result.salesShare).toBe(7320)
  })
})
