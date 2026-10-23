/**
 * lib/localDate.ts に追加した関数のテスト
 * - toYmd・listDates（現地の日付で 1 日ずつ並べる）
 * - todayJst（端末の地域に関係なく日本時間の日付。UTC 15:00 が日本の翌日 0:00 になる境界）
 * - formatJaYmd・formatJaMonthDayDow・formatJstDate（表示用の文字）
 */
import { describe, it, expect } from 'vitest'
import {
  formatJaMonthDayDow,
  formatJaYmd,
  formatJstDate,
  listDates,
  toYmd,
  todayJst,
  WEEKDAYS_JA,
} from '../localDate'

describe('toYmd', () => {
  it('現地の日付を「YYYY-MM-DD」にし、月・日を 2 桁にそろえる', () => {
    expect(toYmd(new Date(2026, 4, 1))).toBe('2026-05-01')
    expect(toYmd(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31')
  })
})

describe('listDates', () => {
  it('開始日から終了日までを両端を含めて 1 日ずつ並べる', () => {
    expect(listDates('2026-05-01', '2026-05-03')).toEqual(['2026-05-01', '2026-05-02', '2026-05-03'])
  })

  it('月・年をまたいでも日付が続く', () => {
    expect(listDates('2026-12-30', '2027-01-02')).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'])
  })

  it('うるう年の 2 月は 29 日まで並ぶ', () => {
    expect(listDates('2028-02-28', '2028-03-01')).toEqual(['2028-02-28', '2028-02-29', '2028-03-01'])
  })

  it('終了日が null・undefined・空文字なら開始日だけになる', () => {
    expect(listDates('2026-05-01', null)).toEqual(['2026-05-01'])
    expect(listDates('2026-05-01')).toEqual(['2026-05-01'])
    expect(listDates('2026-05-01', '')).toEqual(['2026-05-01'])
  })

  it('終了日が開始日より前なら空の配列になる', () => {
    expect(listDates('2026-05-03', '2026-05-01')).toEqual([])
  })
})

describe('todayJst', () => {
  it('UTC 14:59 は日本時間で同じ日の 23:59 なので、その日の日付になる', () => {
    expect(todayJst(new Date('2026-05-01T14:59:59Z'))).toBe('2026-05-01')
  })

  it('UTC 15:00 は日本時間で翌日の 0:00 なので、翌日の日付になる', () => {
    expect(todayJst(new Date('2026-05-01T15:00:00Z'))).toBe('2026-05-02')
  })

  it('大みそかの UTC 15:00 は日本時間で元日になる', () => {
    expect(todayJst(new Date('2026-12-31T15:00:00Z'))).toBe('2027-01-01')
  })

  it('引数を省略すると今の日時で計算し「YYYY-MM-DD」の形を返す', () => {
    expect(todayJst()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('formatJaYmd', () => {
  it('「2026年5月1日」の形にし、月・日の先頭の 0 は付けない', () => {
    expect(formatJaYmd('2026-05-01')).toBe('2026年5月1日')
    expect(formatJaYmd('2026-12-31')).toBe('2026年12月31日')
  })
})

describe('formatJaMonthDayDow', () => {
  it('「5月1日（金）」の形にする（2026-05-01 は金曜）', () => {
    expect(formatJaMonthDayDow('2026-05-01')).toBe('5月1日（金）')
  })

  it('日曜は「日」になる（2026-05-03 は日曜）', () => {
    expect(formatJaMonthDayDow('2026-05-03')).toBe('5月3日（日）')
  })

  it('曜日の表記は日曜から始まる 7 つ', () => {
    expect(WEEKDAYS_JA).toEqual(['日', '月', '火', '水', '木', '金', '土'])
  })
})

describe('formatJstDate', () => {
  it('UTC 15:00 以降の日時は日本時間の翌日の日付になる', () => {
    expect(formatJstDate('2026-04-30T15:00:00Z')).toBe('2026/5/1')
  })

  it('UTC 14:59 の日時は日本時間の同じ日の日付になる', () => {
    expect(formatJstDate('2026-04-30T14:59:00Z')).toBe('2026/4/30')
  })

  it('padded を true にすると月・日が 2 桁になる', () => {
    expect(formatJstDate('2026-04-30T15:00:00Z', true)).toBe('2026/05/01')
  })
})
