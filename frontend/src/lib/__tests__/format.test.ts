/**
 * lib/format.ts（金額・数値の表示用の整形）のテスト
 * - formatYen の 3 つの表記（symbol・suffix・suffixSpaced）
 * - formatNumber の 3 桁区切り・負の数・0・小数の扱い
 */
import { describe, it, expect } from 'vitest'
import { formatNumber, formatYen } from '../format'

describe('formatNumber', () => {
  it('4 桁以上の数を渡すと 3 桁ごとにカンマで区切られる', () => {
    expect(formatNumber(14000)).toBe('14,000')
    expect(formatNumber(1234567)).toBe('1,234,567')
  })

  it('3 桁以下の数を渡すとカンマが付かない', () => {
    expect(formatNumber(999)).toBe('999')
  })

  it('0 を渡すと「0」になる', () => {
    expect(formatNumber(0)).toBe('0')
  })

  it('負の数を渡すと先頭にマイナスが付いて 3 桁区切りになる', () => {
    expect(formatNumber(-1234)).toBe('-1,234')
  })

  it('小数を渡すと小数点以下 3 桁までに丸めて表示される（ja-JP の既定）', () => {
    expect(formatNumber(1234.5)).toBe('1,234.5')
    expect(formatNumber(0.12345)).toBe('0.123')
  })
})

describe('formatYen', () => {
  it('表記を省略すると「¥1,234」（symbol）になる', () => {
    expect(formatYen(1234)).toBe('¥1,234')
  })

  it('symbol を指定すると「¥1,234」になる', () => {
    expect(formatYen(1234, 'symbol')).toBe('¥1,234')
  })

  it('suffix を指定すると「1,234円」になる', () => {
    expect(formatYen(1234, 'suffix')).toBe('1,234円')
  })

  it('suffixSpaced を指定すると「1,234 円」になる', () => {
    expect(formatYen(1234, 'suffixSpaced')).toBe('1,234 円')
  })

  it('0 円は 3 つの表記それぞれ「¥0」「0円」「0 円」になる', () => {
    expect(formatYen(0)).toBe('¥0')
    expect(formatYen(0, 'suffix')).toBe('0円')
    expect(formatYen(0, 'suffixSpaced')).toBe('0 円')
  })

  it('負の金額は数値の前にマイナスが付く（symbol は「¥-1,234」）', () => {
    expect(formatYen(-1234)).toBe('¥-1,234')
    expect(formatYen(-1234, 'suffix')).toBe('-1,234円')
    expect(formatYen(-1234, 'suffixSpaced')).toBe('-1,234 円')
  })
})
