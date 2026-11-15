/**
 * ワークショップの実施日の関数（lib/wsDates.ts）のテスト
 * - hasWsDateSelection: 「実施する日を選ぶ」が効くのは WS あり・複数日・ws_dates が 1 日以上のときだけ
 * - workshopDates: ws_dates が有効ならその日（期間外は捨て、開催期間の順）、無ければ開催期間の全日程
 * - isWorkshopDay: WS なし・期間外・ws_dates に無い日は false
 * - isPartialWorkshopSchedule: 一部の日だけ実施するときだけ true（全日を選んでいるときは false）
 * - formatShortDateDow / formatWorkshopDates: 日本語「7/2（金）・7/4（日）」、英語「7/2 (Fri), 7/4 (Sun)」
 * - defaultWalkinDate: 今日が実施日なら今日 / 今日より前で一番近い実施日 / 最初の実施日（無ければ空）
 * 純粋な関数だけなので、API・画面は使わない
 */
import { describe, it, expect } from 'vitest'
import {
  defaultWalkinDate,
  formatShortDateDow,
  formatWorkshopDates,
  hasWsDateSelection,
  isPartialWorkshopSchedule,
  isWorkshopDay,
  workshopDates,
} from '../wsDates'

/** 7/1（木）〜7/4（日）の 4 日間・WS あり・7/2 と 7/4 だけ実施（モックの mock-ws-dates と同じ形） */
const PARTIAL = { start_date: '2027-07-01', end_date: '2027-07-04', has_workshop: true, ws_dates: ['2027-07-02', '2027-07-04'] }
/** 同じ 4 日間で、ws_dates なし（全日程で実施） */
const ALL_DAYS = { ...PARTIAL, ws_dates: null }

describe('hasWsDateSelection（実施する日を選んでいるか）', () => {
  it('FE-EO-01 WS あり・複数日・ws_dates が 1 日以上なら true になる', () => {
    expect(hasWsDateSelection(PARTIAL)).toBe(true)
  })

  it.each([
    ['ws_dates が null', { ...PARTIAL, ws_dates: null }],
    ['ws_dates が未設定', { start_date: '2027-07-01', end_date: '2027-07-04', has_workshop: true }],
    ['ws_dates が空の配列', { ...PARTIAL, ws_dates: [] }],
    ['WS なし', { ...PARTIAL, has_workshop: false }],
    ['1 日のイベント（end_date が開始日と同じ）', { ...PARTIAL, end_date: '2027-07-01', ws_dates: ['2027-07-01'] }],
    ['1 日のイベント（end_date が null）', { ...PARTIAL, end_date: null, ws_dates: ['2027-07-01'] }],
  ])('FE-EO-02 %s なら false になる（全日程の扱い）', (_label, ev) => {
    expect(hasWsDateSelection(ev)).toBe(false)
  })
})

describe('workshopDates（実施日の一覧）', () => {
  it('FE-EO-03 ws_dates が有効ならその日だけを返す', () => {
    expect(workshopDates(PARTIAL)).toEqual(['2027-07-02', '2027-07-04'])
  })

  it('FE-EO-04 ws_dates が無ければ開催期間の全日程を返す', () => {
    expect(workshopDates(ALL_DAYS)).toEqual(['2027-07-01', '2027-07-02', '2027-07-03', '2027-07-04'])
  })

  it('FE-EO-05 ws_dates の順番が逆・重複・期間外の日を含んでも、開催期間の中の日だけを昇順で 1 回ずつ返す', () => {
    const ev = { ...PARTIAL, ws_dates: ['2027-07-04', '2027-06-30', '2027-07-02', '2027-07-04', '2027-07-05'] }
    expect(workshopDates(ev)).toEqual(['2027-07-02', '2027-07-04'])
  })

  it('FE-EO-06 ws_dates が全部期間外なら空になる（全日程には戻らない）', () => {
    expect(workshopDates({ ...PARTIAL, ws_dates: ['2027-08-01'] })).toEqual([])
  })
})

describe('isWorkshopDay（その日が実施日か）', () => {
  it('FE-EO-07 ws_dates にある日は true、無い日は false になる', () => {
    expect(isWorkshopDay(PARTIAL, '2027-07-02')).toBe(true)
    expect(isWorkshopDay(PARTIAL, '2027-07-04')).toBe(true)
    expect(isWorkshopDay(PARTIAL, '2027-07-01')).toBe(false)
    expect(isWorkshopDay(PARTIAL, '2027-07-03')).toBe(false)
  })

  it('FE-EO-08 開催期間の外の日（前日・翌日）は false になる', () => {
    expect(isWorkshopDay(ALL_DAYS, '2027-06-30')).toBe(false)
    expect(isWorkshopDay(ALL_DAYS, '2027-07-05')).toBe(false)
    expect(isWorkshopDay(ALL_DAYS, '2027-07-03')).toBe(true)
  })

  it('FE-EO-09 WS なしのイベントは開催期間の中の日でも false になる', () => {
    expect(isWorkshopDay({ ...ALL_DAYS, has_workshop: false }, '2027-07-02')).toBe(false)
  })
})

describe('isPartialWorkshopSchedule（一部の日だけ実施か）', () => {
  it('FE-EO-10 一部の日だけ実施なら true になる', () => {
    expect(isPartialWorkshopSchedule(PARTIAL)).toBe(true)
  })

  it('FE-EO-11 開催期間の全部の日を ws_dates に入れているときは false になる', () => {
    const ev = { ...PARTIAL, ws_dates: ['2027-07-01', '2027-07-02', '2027-07-03', '2027-07-04'] }
    expect(isPartialWorkshopSchedule(ev)).toBe(false)
  })

  it('FE-EO-12 ws_dates なし・WS なし・期間外の日だけのときは false になる', () => {
    expect(isPartialWorkshopSchedule(ALL_DAYS)).toBe(false)
    expect(isPartialWorkshopSchedule({ ...PARTIAL, has_workshop: false })).toBe(false)
    expect(isPartialWorkshopSchedule({ ...PARTIAL, ws_dates: ['2027-08-01'] })).toBe(false)
  })
})

describe('formatShortDateDow・formatWorkshopDates（実施日の表示）', () => {
  it('FE-EO-13 日本語は「7/2（金）」、英語は「7/2 (Fri)」になる', () => {
    expect(formatShortDateDow('2027-07-02', 'ja')).toBe('7/2（金）')
    expect(formatShortDateDow('2027-07-02', 'en')).toBe('7/2 (Fri)')
  })

  it('FE-EO-14 月・日の頭の 0 は付けない（11/3 は「11/3（水）」）', () => {
    expect(formatShortDateDow('2027-11-03', 'ja')).toBe('11/3（水）')
  })

  it('FE-EO-15 複数日は日本語では「・」、英語では「, 」でつなぐ', () => {
    expect(formatWorkshopDates(['2027-07-02', '2027-07-04'], 'ja')).toBe('7/2（金）・7/4（日）')
    expect(formatWorkshopDates(['2027-07-02', '2027-07-04'], 'en')).toBe('7/2 (Fri), 7/4 (Sun)')
  })

  it('FE-EO-16 空の配列なら空文字になる', () => {
    expect(formatWorkshopDates([], 'ja')).toBe('')
  })
})

describe('defaultWalkinDate（当日参加の参加日の初めの値）', () => {
  it('FE-EO-17 今日が実施日なら今日になる', () => {
    expect(defaultWalkinDate(PARTIAL, '2027-07-04')).toBe('2027-07-04')
  })

  it('FE-EO-18 今日が実施日でなければ、今日より前で一番近い実施日になる', () => {
    // 7/3 は実施しない日。前の実施日は 7/2
    expect(defaultWalkinDate(PARTIAL, '2027-07-03')).toBe('2027-07-02')
    // 開催の終わったあと（7/10）は最後の実施日
    expect(defaultWalkinDate(PARTIAL, '2027-07-10')).toBe('2027-07-04')
  })

  it('FE-EO-19 今日より前に実施日が無ければ、最初の実施日になる', () => {
    // 開催前（6/1）と、開催初日で実施しない日（7/1）
    expect(defaultWalkinDate(PARTIAL, '2027-06-01')).toBe('2027-07-02')
    expect(defaultWalkinDate(PARTIAL, '2027-07-01')).toBe('2027-07-02')
  })

  it('FE-EO-20 全日程で実施するイベントは、開催中なら今日になる', () => {
    expect(defaultWalkinDate(ALL_DAYS, '2027-07-03')).toBe('2027-07-03')
  })

  it('FE-EO-21 実施日が無い（WS なし・ws_dates が全部期間外）ときは空文字になる', () => {
    expect(defaultWalkinDate({ ...ALL_DAYS, has_workshop: false }, '2027-07-02')).toBe('')
    expect(defaultWalkinDate({ ...PARTIAL, ws_dates: ['2027-08-01'] }, '2027-07-02')).toBe('')
  })
})
