/**
 * adminInfoFormat（管理情報の確認画面で使う表示用の整形関数）のテスト
 *
 * 1. formatJaDate: 曜日つきの日本語表記・未入力と不正値は null
 * 2. formatJaDateTime: 「2026年10月24日（土） 09:00」形式・秒つきでも時分だけ・不正値は null
 * 3. formatYen: 3桁区切り＋「円」・0 も表示・null/NaN/Infinity は null
 * 4. isPastDue: 期限の当日は false・前日（期限を1日過ぎた）は true・未入力/不正は false
 * 5. localToday: 端末のローカル時刻で "YYYY-MM-DD" を返す
 * 6. 実行環境のタイムゾーンを変えても日付・曜日がずれない
 */
import { describe, it, expect, afterEach } from 'vitest'
import { formatJaDate, formatJaDateTime, formatYen, isPastDue, localToday } from '../adminInfoFormat'

/** テスト開始時のタイムゾーン設定。タイムゾーンを切り替えたテストの後に元へ戻す */
const ORIGINAL_TZ = process.env.TZ

afterEach(() => {
  // タイムゾーンを切り替えたテストの影響を残さない
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
})

describe('formatJaDate', () => {
  it('"2026-10-09" を渡すと「2026年10月9日（金）」になる（月日の先頭の0は付けない）', () => {
    expect(formatJaDate('2026-10-09')).toBe('2026年10月9日（金）')
  })

  it('曜日が日〜土で正しく付く（2026-10-18 は日曜・2026-10-24 は土曜）', () => {
    expect(formatJaDate('2026-10-18')).toBe('2026年10月18日（日）')
    expect(formatJaDate('2026-10-24')).toBe('2026年10月24日（土）')
  })

  it('うるう年の 2月29日は表示でき、うるう年でない年の 2月29日は null になる', () => {
    expect(formatJaDate('2028-02-29')).toBe('2028年2月29日（火）')
    expect(formatJaDate('2026-02-29')).toBeNull()
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['空文字', ''],
  ])('%s を渡すと null になる', (_label, value) => {
    expect(formatJaDate(value)).toBeNull()
  })

  it.each([
    ['存在しない日付（2月30日）', '2026-02-30'],
    ['13月', '2026-13-01'],
    ['0日', '2026-10-00'],
    ['区切りがスラッシュ', '2026/10/09'],
    ['月日が1桁', '2026-1-9'],
    ['日時つき', '2026-10-09T09:00'],
    ['文字列', 'abc'],
  ])('不正な値（%s）を渡すと null になる', (_label, value) => {
    expect(formatJaDate(value)).toBeNull()
  })
})

describe('formatJaDateTime', () => {
  it('"2026-10-24T09:00" を渡すと「2026年10月24日（土） 09:00」になる（時分の0埋めは保つ）', () => {
    expect(formatJaDateTime('2026-10-24T09:00')).toBe('2026年10月24日（土） 09:00')
  })

  it('秒がついていても時・分だけを表示する', () => {
    expect(formatJaDateTime('2026-10-24T18:30:45')).toBe('2026年10月24日（土） 18:30')
  })

  it('境界の 00:00 と 23:59 は表示できる', () => {
    expect(formatJaDateTime('2026-10-24T00:00')).toBe('2026年10月24日（土） 00:00')
    expect(formatJaDateTime('2026-10-24T23:59')).toBe('2026年10月24日（土） 23:59')
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['空文字', ''],
    ['24時', '2026-10-24T24:00'],
    ['60分', '2026-10-24T09:60'],
    ['日付だけ', '2026-10-24'],
    ['存在しない日付', '2026-02-30T09:00'],
    ['時刻が1桁', '2026-10-24T9:00'],
    ['文字列', 'not-a-date'],
  ])('%s を渡すと null になる', (_label, value) => {
    expect(formatJaDateTime(value)).toBeNull()
  })
})

describe('formatYen', () => {
  it('14000 を渡すと「14,000円」になる', () => {
    expect(formatYen(14000)).toBe('14,000円')
  })

  it('3桁以下は区切りなし、7桁は2か所で区切る', () => {
    expect(formatYen(500)).toBe('500円')
    expect(formatYen(1234567)).toBe('1,234,567円')
  })

  it('0 は未入力扱いにせず「0円」と表示する', () => {
    expect(formatYen(0)).toBe('0円')
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('%s を渡すと null になる', (_label, value) => {
    expect(formatYen(value)).toBeNull()
  })
})

describe('isPastDue', () => {
  it('期限が今日（当日）のときはまだ過ぎていないので false', () => {
    expect(isPastDue('2026-10-16', '2026-10-16')).toBe(false)
  })

  it('期限が昨日（今日が期限の翌日）のときは true', () => {
    expect(isPastDue('2026-10-15', '2026-10-16')).toBe(true)
  })

  it('期限が明日のときは false', () => {
    expect(isPastDue('2026-10-17', '2026-10-16')).toBe(false)
  })

  it('月・年をまたいでも前後を正しく比べる（12/31 期限で今日が 1/1 なら true）', () => {
    expect(isPastDue('2026-12-31', '2027-01-01')).toBe(true)
    expect(isPastDue('2027-01-01', '2026-12-31')).toBe(false)
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['空文字', ''],
    ['不正な日付', '2026-02-30'],
    ['形式違い', '2026/10/01'],
  ])('期限が %s のときは false', (_label, due) => {
    expect(isPastDue(due, '2026-10-16')).toBe(false)
  })

  it('今日の値が不正なときは false', () => {
    expect(isPastDue('2026-10-01', 'invalid')).toBe(false)
  })
})

describe('localToday', () => {
  it('ローカル時刻で作った日時から "YYYY-MM-DD"（月日は0埋め）を返す', () => {
    expect(localToday(new Date(2026, 0, 5, 12, 0))).toBe('2026-01-05')
  })

  it('ローカルの日付が変わった直後（00:30）と直前（23:59）でもその日の日付になる', () => {
    expect(localToday(new Date(2026, 9, 16, 0, 30))).toBe('2026-10-16')
    expect(localToday(new Date(2026, 9, 16, 23, 59))).toBe('2026-10-16')
  })

  it('日本時間で UTC の日付がまだ前日の時刻（JST 2026-10-16 08:00 = UTC 10-15 23:00）でも日本の日付を返す', () => {
    process.env.TZ = 'Asia/Tokyo'
    expect(localToday(new Date('2026-10-15T23:00:00Z'))).toBe('2026-10-16')
  })

  it('引数を省略すると今日の日付（"YYYY-MM-DD" 形式）を返す', () => {
    expect(localToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('タイムゾーンによるずれがない', () => {
  it.each(['Asia/Tokyo', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'UTC'])(
    'タイムゾーンが %s でも日付・曜日・日時の表示は変わらない',
    (tz) => {
      process.env.TZ = tz
      expect(formatJaDate('2026-10-09')).toBe('2026年10月9日（金）')
      expect(formatJaDate('2026-01-01')).toBe('2026年1月1日（木）')
      expect(formatJaDateTime('2026-10-24T00:00')).toBe('2026年10月24日（土） 00:00')
      expect(formatJaDateTime('2026-10-24T23:59')).toBe('2026年10月24日（土） 23:59')
    },
  )
})
