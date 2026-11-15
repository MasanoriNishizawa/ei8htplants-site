import { describe, expect, it } from 'vitest'
import type { Event, Reservation, WsSession } from '../../../lib/api'
import { buildReservationPrintHtml, type ReservationWithTime } from '../reservationPrint'

/** 印刷HTMLにイベント名・日程を出すためのテスト用イベント */
const EVENT: Event = {
  id: 'event-1', slug: 'event-1', name: 'イベント', start_date: '2099-06-01', end_date: '2099-06-02',
  time: null, location: '会場', booth_number: null, address: null, official_url: null, brands: [],
  has_workshop: true, ws_requires_reservation: true, is_past: false, display_order: 1, images: [],
  page_content: null, daily_times: null,
}

/** 予約日程の振り分け確認に使う、イベントの1枠目 */
const SESSION_1: WsSession = {
  id: 'session-1', event_id: 'event-1', time_label: '10:00〜11:00', max_participants: 5, reserved_count: 0, display_order: 1,
}
/** 予約日程の順序確認に使う、イベントの2枠目 */
const SESSION_2: WsSession = {
  id: 'session-2', event_id: 'event-1', time_label: '11:00〜12:00', max_participants: 5, reserved_count: 0, display_order: 2,
}

/**
 * 印刷HTMLの振り分けに使う最小予約データを作る。
 * @param overrides - 上書きする予約項目
 * @returns 予約データ
 */
function reservation(overrides: Partial<ReservationWithTime>): ReservationWithTime {
  const base: Reservation = {
    id: 'reservation-1', event_id: 'event-1', name: '予約者', email: 'person@example.com', phone: null,
    participants: 1, note: null, status: 'confirmed', session_id: null, bring_plant: false, bring_pot: false,
    preferred_date: '2099-06-01', preferred_time: null, created_at: '2099-05-01T00:00:00Z', email_failed: null,
  }
  return { ...base, ...overrides }
}

describe('buildReservationPrintHtml', () => {
  it('複数日の見出しを出し、2日目以降に改ページ指定を付ける', () => {
    const html = buildReservationPrintHtml([], '複数日イベント', new Map([[SESSION_1.id, SESSION_1]]), EVENT, new Date('2099-05-01T00:00:00Z'))

    expect(html).toContain('class="date-header"')
    expect(html).toContain('class="date-header date-break"')
    expect(html).toContain('break-before: page')
  })

  it('現行IDと時間fallbackで予約を一度ずつ割り当て、未割当を最後にまとめる', () => {
    const rows = [
      reservation({ id: 'direct', name: 'direct', session_id: SESSION_1.id }),
      reservation({ id: 'old-id', name: 'old-id', session_id: 'deleted-session', preferred_time: SESSION_2.time_label }),
      reservation({ id: 'no-match', name: 'no-match', session_id: null, preferred_time: '13:00〜14:00' }),
    ]
    const sessions = new Map([[SESSION_1.id, SESSION_1], [SESSION_2.id, SESSION_2]])
    const html = buildReservationPrintHtml(rows, 'イベント', sessions, EVENT, new Date('2099-05-01T00:00:00Z'))

    expect(html.match(/<td>direct<\/td>/g)).toHaveLength(1)
    expect(html.match(/<td>old-id<\/td>/g)).toHaveLength(1)
    expect(html).toContain('<td colspan="9">セッション未指定</td>')
    expect(html.indexOf('<td>no-match</td>')).toBeGreaterThan(html.indexOf('セッション未指定'))
    expect(html.indexOf('<td>direct</td>')).toBeGreaterThan(html.indexOf('10:00〜11:00'))
    expect(html.indexOf('<td>direct</td>')).toBeLessThan(html.indexOf('11:00〜12:00'))
    expect(html.indexOf('<td>old-id</td>')).toBeGreaterThan(html.indexOf('11:00〜12:00'))
  })

  it('全イベント表示などeventがnullなら予約をフラットに並べる', () => {
    const rows = [reservation({ id: 'first', name: 'first' }), reservation({ id: 'second', name: 'second' })]
    const html = buildReservationPrintHtml(rows, '全イベント', new Map([[SESSION_1.id, SESSION_1]]), null, new Date('2099-05-01T00:00:00Z'))
    const tableBody = html.split('<tbody>')[1].split('</tbody>')[0]

    expect(html).toContain('<title>全イベント — WS予約一覧</title>')
    expect(tableBody).toContain('<td>first</td>')
    expect(tableBody).toContain('<td>second</td>')
    expect(tableBody).not.toContain('date-header')
    expect(tableBody).not.toContain('session-header')
  })

  it('イベント名と予約者が入力した文字をHTMLエスケープする', () => {
    const html = buildReservationPrintHtml(
      [reservation({ name: '<script>alert(1)</script>', note: '<img src=x>' })],
      '<b>イベント</b>', new Map(), null, new Date('2099-05-01T00:00:00Z'),
    )

    expect(html).toContain('&lt;b&gt;イベント&lt;/b&gt;')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('&lt;img src=x&gt;')
    expect(html).not.toContain('<b>イベント</b>')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).not.toContain('<img src=x>')
  })
})

/**
 * ワークショップを一部の日だけ実施するイベントの印刷（2026-11-13 追加）
 * - 実施日（ws_dates）だけの見出しを出し、実施しない日は出さない
 * - 日ごとの枠（session_date あり）はその日だけ、共通の枠（session_date なし）はすべての実施日に出す
 * - その日に使える枠が 0 件の日は「時間指定なし」の見出しで、その日の予約をまとめる
 */
describe('buildReservationPrintHtml（実施日と日ごとの枠）', () => {
  /** 7/1〜7/4 の 4 日間で、7/2 と 7/4 だけ実施するイベント */
  const WS_EVENT: Event = { ...EVENT, id: 'ws-ev', start_date: '2027-07-01', end_date: '2027-07-04', ws_dates: ['2027-07-02', '2027-07-04'] }
  /** 7/2 だけの枠 */
  const DAY2: WsSession = { id: 'd2', event_id: 'ws-ev', time_label: '11:00〜12:00', max_participants: 2, reserved_count: 0, display_order: 0, session_date: '2027-07-02' }
  /** 印刷の日時 */
  const NOW = new Date('2027-06-01T00:00:00Z')

  /**
   * 表の本体（tbody の中）だけを取り出す
   * @param html - 印刷の HTML
   * @returns tbody の中の文字列
   */
  const bodyOf = (html: string) => html.split('<tbody>')[1].split('</tbody>')[0]

  it('FE-ET-01 実施日（7/2・7/4）だけの見出しを出し、実施しない日（7/1・7/3）は出さない', () => {
    const html = bodyOf(buildReservationPrintHtml([], 'WS', new Map([[DAY2.id, DAY2]]), WS_EVENT, NOW))
    expect(html).toContain('2027年7月2日')
    expect(html).toContain('2027年7月4日')
    expect(html).not.toContain('2027年7月1日')
    expect(html).not.toContain('2027年7月3日')
    // 2 日目（7/4）の見出しに改ページが付く
    expect(html.match(/date-header date-break/g)).toHaveLength(1)
  })

  it('FE-ET-02 日ごとの枠はその日だけに出し、枠の無い 7/4 は「時間指定なし」の見出しでその日の予約をまとめる', () => {
    const rows = [
      reservation({ id: 'r2', name: '二日の人', event_id: 'ws-ev', session_id: 'd2', preferred_date: '2027-07-02' }),
      reservation({ id: 'r4', name: '四日の人', event_id: 'ws-ev', session_id: null, preferred_date: '2027-07-04' }),
    ]
    const html = bodyOf(buildReservationPrintHtml(rows, 'WS', new Map([[DAY2.id, DAY2]]), WS_EVENT, NOW))
    // 11:00〜12:00 の枠は 7/2 の 1 回だけ（7/4 には出ない）
    expect(html.match(/11:00〜12:00/g)).toHaveLength(1)
    expect(html).toContain('11:00〜12:00　1 / 2 名')
    // 7/4 は「時間指定なし」の下に 7/4 の予約
    /** 7/4 の見出しの位置 */
    const day4 = html.indexOf('2027年7月4日')
    expect(html.indexOf('時間指定なし')).toBeGreaterThan(day4)
    expect(html.indexOf('<td>四日の人</td>')).toBeGreaterThan(html.indexOf('時間指定なし'))
    // 7/2 の予約は 7/2 の枠の下（7/4 の見出しより前）
    expect(html.indexOf('<td>二日の人</td>')).toBeLessThan(day4)
    // 全部割り当てられたので「セッション未指定」は出ない
    expect(html).not.toContain('セッション未指定')
  })

  it('FE-ET-03 共通の枠（session_date なし）は、すべての実施日に出る', () => {
    /** 共通の枠 */
    const COMMON: WsSession = { ...DAY2, id: 'c', time_label: '15:00〜16:00', session_date: null }
    const html = bodyOf(buildReservationPrintHtml([], 'WS', new Map([[DAY2.id, DAY2], [COMMON.id, COMMON]]), WS_EVENT, NOW))
    expect(html.match(/15:00〜16:00/g)).toHaveLength(2)
    expect(html.match(/11:00〜12:00/g)).toHaveLength(1)
    // 共通の枠があるので 7/4 も「時間指定なし」にはならない
    expect(html).not.toContain('時間指定なし')
  })

  it('FE-ET-04 実施しない日（7/3）の予約は、どの日にも入らず「セッション未指定」にまとめる', () => {
    const rows = [reservation({ id: 'r3', name: '三日の人', event_id: 'ws-ev', preferred_date: '2027-07-03' })]
    const html = bodyOf(buildReservationPrintHtml(rows, 'WS', new Map([[DAY2.id, DAY2]]), WS_EVENT, NOW))
    expect(html.match(/<td>三日の人<\/td>/g)).toHaveLength(1)
    expect(html.indexOf('<td>三日の人</td>')).toBeGreaterThan(html.indexOf('セッション未指定'))
  })
})
