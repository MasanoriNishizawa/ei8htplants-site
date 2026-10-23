/**
 * pages/admin/eventTime.ts（開催時間の文字列の扱い）のテスト
 * - buildAutoSessions: 開始・終了の 1 時間ずつを空けて 1 時間の WS 枠（定員 4 人）を作る
 * - hasTimeRange: 「開始〜終了」が含まれているか
 * - parseTimeRange・時刻の選択肢
 */
import { describe, it, expect } from 'vitest'
import { buildAutoSessions, hasTimeRange, parseTimeRange, TIME_END_OPTIONS, TIME_START_OPTIONS } from '../eventTime'

describe('buildAutoSessions', () => {
  it('10:00〜17:00 なら 11:00〜16:00 のあいだに 1 時間の枠が 5 つ・定員 4 人でできる', () => {
    expect(buildAutoSessions('10:00〜17:00')).toEqual([
      { time_label: '11:00〜12:00', max_participants: 4 },
      { time_label: '12:00〜13:00', max_participants: 4 },
      { time_label: '13:00〜14:00', max_participants: 4 },
      { time_label: '14:00〜15:00', max_participants: 4 },
      { time_label: '15:00〜16:00', max_participants: 4 },
    ])
  })

  it('区切りが ~ や - でも、時が 1 桁でも読み取れる（時は 2 桁にそろう）', () => {
    expect(buildAutoSessions('9:00 - 12:00').map((s) => s.time_label)).toEqual(['10:00〜11:00'])
    expect(buildAutoSessions('9:30~12:30').map((s) => s.time_label)).toEqual(['10:30〜11:30'])
  })

  it('前後に文字があっても時間帯の部分を読み取る', () => {
    expect(buildAutoSessions('両日 10:00〜13:00（予定）').map((s) => s.time_label)).toEqual(['11:00〜12:00'])
  })

  it('開催が 3 時間ちょうどなら枠は 1 つ、3 時間未満なら空になる（境界）', () => {
    expect(buildAutoSessions('10:00〜13:00')).toHaveLength(1)
    expect(buildAutoSessions('10:00〜12:59')).toEqual([])
  })

  it('時間帯が読み取れない文字列・空文字なら空の配列になる', () => {
    expect(buildAutoSessions('終日')).toEqual([])
    expect(buildAutoSessions('')).toEqual([])
  })
})

describe('hasTimeRange', () => {
  it('「開始〜終了」が含まれていれば true', () => {
    expect(hasTimeRange('10:00〜17:00')).toBe(true)
    expect(hasTimeRange('土曜 10:00-17:00')).toBe(true)
  })

  it('時刻が 1 つだけ・時間帯の無い文字列・空文字は false', () => {
    expect(hasTimeRange('10:00')).toBe(false)
    expect(hasTimeRange('終日')).toBe(false)
    expect(hasTimeRange('')).toBe(false)
  })
})

describe('parseTimeRange', () => {
  it('全体が「開始〜終了」だけなら [開始, 終了] に分ける', () => {
    expect(parseTimeRange('10:00〜17:00')).toEqual(['10:00', '17:00'])
  })

  it('前後に文字があると形が合わず [\'\', \'\'] になる', () => {
    expect(parseTimeRange('両日 10:00〜17:00')).toEqual(['', ''])
  })
})

describe('時刻の選択肢', () => {
  it('開始は 8:00〜14:00、終了は 12:00〜22:00 の 30 分刻み', () => {
    expect(TIME_START_OPTIONS[0]).toBe('8:00')
    expect(TIME_START_OPTIONS[TIME_START_OPTIONS.length - 1]).toBe('14:00')
    expect(TIME_START_OPTIONS).toHaveLength(13)
    expect(TIME_END_OPTIONS[0]).toBe('12:00')
    expect(TIME_END_OPTIONS[TIME_END_OPTIONS.length - 1]).toBe('22:00')
    expect(TIME_END_OPTIONS).toContain('12:30')
  })
})
