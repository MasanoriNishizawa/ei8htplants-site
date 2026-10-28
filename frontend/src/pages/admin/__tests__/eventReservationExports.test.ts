/**
 * 予約一覧の印刷 HTML・CSV 生成関数の境界テスト。
 * 画面操作は既存の ReservationsPrint.test.tsx が扱うため、ここでは純関数の出力文字列を直接確認する。
 */
import { describe, expect, it } from 'vitest'
import type { Event, Reservation } from '../../../lib/api'
import { buildReservationPrintHtml, buildReservationsCsv, type ReservationWithTime } from '../eventReservationExports'

/** 印刷・CSV で共通して使うイベント情報 */
const EVENT: Event = {
  id: 'event-1', slug: 'spring-market', name: '春のイベント', start_date: '2099-04-10', end_date: '2099-04-11',
  time: '10:00〜17:00', location: '植物園', booth_number: null, address: null, official_url: null, brands: [],
  has_workshop: true, ws_requires_reservation: true, is_past: false, display_order: 1, images: [], page_content: null,
  daily_times: null,
}

/**
 * テスト用の予約データを既定値から作る。
 * 1. 必須の予約項目を正常値で初期化する。
 * 2. 呼び出し側から渡された値で上書きし、境界値を指定できるようにする。
 * @param overrides - 個別テストで上書きする予約項目
 * @returns 予約の基本項目と任意の session_time を含むデータ
 */
function makeReservation(overrides: Partial<ReservationWithTime> = {}): ReservationWithTime {
  /** 予約 API の必須フィールドを満たす基本データ */
  const base: Reservation = {
    id: 'reservation-1', event_id: EVENT.id, name: '山田花子', email: 'hanako@example.com', phone: '090-1234-5678',
    participants: 2, note: '備考なし', status: 'pending', session_id: 'session-1', bring_plant: true, bring_pot: false,
    preferred_date: '2099-04-10', preferred_time: '13:00〜14:00', created_at: '2099-04-01T00:00:00Z', email_failed: null,
  }
  // 1. 基本データに指定値を重ねてテスト対象の予約を作る。
  return { ...base, ...overrides }
}

describe('予約エクスポートの純関数', () => {
  it('FE-CQ-01 印刷 HTML に日付範囲・イベント名・列順・予約件数が出力される', () => {
    /** 出力件数と合計人数を分けて確認するための2件の予約 */
    const rows = [makeReservation({ id: 'r-1', participants: 2 }), makeReservation({ id: 'r-2', participants: 3 })]

    /** 予約印刷用 HTML */
    const html = buildReservationPrintHtml(EVENT, rows)
    /** 表の見出しの並びを確認するために HTML から th の文字列を取り出す */
    const headers = [...html.matchAll(/<th>(.*?)<\/th>/g)].map((match) => match[1])
    /** 予約行数を確認するための tbody 部分 */
    const body = html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? ''

    // 1. イベント情報、日付範囲、件数と人数が出力されることを確認する。
    expect(html).toContain('春のイベント ワークショップ予約一覧')
    expect(html).toContain('2099-04-10 〜 2099-04-11 10:00〜17:00 / 植物園')
    expect(html).toContain('合計 2 件 / 5 名')
    // 2. 印刷表の列順が既存仕様どおりであることを確認する。
    expect(headers).toEqual(['受付日', 'お名前', '予約日', '予約時間', '人数', '持込', '備考', 'ステータス'])
    expect((body.match(/<tr>/g) ?? [])).toHaveLength(2)
  })

  it('FE-CQ-02 予約者名・備考・イベント名の script 文字列を HTML として解釈されない形にする', () => {
    /** HTML として実行されてはいけない入力を含む予約 */
    const row = makeReservation({ name: '<script>name()</script>', note: '<img src=x onerror="note()">' })
    /** 悪意ある文字列を含むイベント名 */
    const event = { ...EVENT, name: '<script>event()</script>' }

    /** 無害化後の印刷 HTML */
    const html = buildReservationPrintHtml(event, [row])

    // 1. HTML エスケープされた文字列は残り、実行可能な入力タグは出力されないことを確認する。
    expect(html).toContain('&lt;script&gt;name()&lt;/script&gt;')
    expect(html).toContain('&lt;img src=x onerror=&quot;note()&quot;&gt;')
    expect(html).toContain('&lt;script&gt;event()&lt;/script&gt;')
    expect(html).not.toContain('<script>name()')
    expect(html).not.toContain('<script>event()')
    expect(html).not.toContain('<img src=x')
  })

  it('FE-CQ-03 不明な status は値を表示し、session_time が preferred_time より優先される', () => {
    /** status のフォールバックと時間ラベルの優先順位を同時に確認する予約 */
    const row = makeReservation({ status: 'awaiting_review', preferred_time: '13:00〜14:00', session_time: '15:00〜16:00' })

    /** 予約1件を含む印刷 HTML */
    const html = buildReservationPrintHtml(EVENT, [row])

    // 1. 未定義のステータス文字列は値そのものを出力する。
    expect(html).toContain('<td>awaiting_review</td>')
    // 2. セッションから解決した時間を優先し、希望時間は出力しない。
    expect(html).toContain('<td>15:00〜16:00</td>')
    expect(html).not.toContain('<td>13:00〜14:00</td>')
  })

  it('FE-CQ-04 CSV は BOM・CRLF・所定のヘッダーと入力順を維持する', () => {
    /** 希望日の順序を逆にし、入力された配列順が保持されることを確認する予約 */
    const rows = [
      makeReservation({ id: 'r-later', name: '後の予約', preferred_date: '2099-04-11' }),
      makeReservation({ id: 'r-earlier', name: '先の予約', preferred_date: '2099-04-10' }),
    ]

    /** BOM と各レコードを含む CSV */
    const csv = buildReservationsCsv(rows)
    /** CRLF で分けた CSV の各行 */
    const lines = csv.split('\r\n')

    // 1. BOM・CRLF とヘッダーの列順を確認する。
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv).toContain('\r\n')
    expect(lines[0].slice(1)).toBe('受付日,お名前,メール,電話,予約日,予約時間,人数,植物持込,鉢持込,備考,ステータス')
    // 2. 空行を挟まず、入力順のまま予約2件が出力されることを確認する。
    expect(lines).toHaveLength(3)
    expect(lines[1]).toContain('後の予約')
    expect(lines[2]).toContain('先の予約')
  })

  it('FE-CQ-05 CSV の式注入を防ぎ、引用符を二重化し、null を空セルにする', () => {
    /** 先頭文字ごとの式注入・引用符・null の扱いを検証する予約 */
    const row = makeReservation({
      name: '=1+1', email: '+SUM(A1:A2)', phone: null, preferred_date: '@command', preferred_time: null,
      session_time: undefined, note: 'メモ,"引用"', status: '-待機',
    })

    /** ヘッダーと予約行からなる CSV */
    const csv = buildReservationsCsv([row])
    /** ヘッダーを除いた予約データ行 */
    const dataLine = csv.split('\r\n')[1]

    // 1. 「=」「+」「@」「-」から始まる値は、先頭にアポストロフィが加わることを確認する。
    expect(dataLine).toContain("\"'=1+1\"")
    expect(dataLine).toContain("\"'+SUM(A1:A2)\"")
    expect(dataLine).toContain("\"'@command\"")
    expect(dataLine).toContain("\"'-待機\"")
    // 2. null は空の引用セル、内包する引用符は二重化されることを確認する。
    expect(dataLine).toContain('\"\",\"\'@command\",\"\"')
    expect(dataLine).toContain('"メモ,""引用"""')
  })
})
