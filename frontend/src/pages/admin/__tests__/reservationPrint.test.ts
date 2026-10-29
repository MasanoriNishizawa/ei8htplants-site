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
