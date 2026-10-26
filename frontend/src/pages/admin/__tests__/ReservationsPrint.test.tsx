/**
 * 予約一覧の印刷・件数・CSV・戻るリンク・リンクのコピーのテスト
 * - Reservations（全イベントの予約一覧）: 件数がキャンセルを除いた「全N件 / M名」、
 *   印刷の空き枠がキャンセルを数えない、名前に <script> を入れても印刷の HTML ではエスケープされて実行されない
 * - EventReservations（イベント別の予約画面）: 印刷の XSS・CSV の中身・戻り先（state.from）・クリップボードの失敗
 * 印刷は window.open をモックして、書き出された HTML の文字列を調べる。api はモックにして本番には接続しない
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { api, type Event, type Reservation, type WsSession } from '../../../lib/api'
import AdminReservations from '../Reservations'
import AdminEventReservations from '../EventReservations'
import { saveBlob } from '../saveBlob'

// 使う api の関数だけをモックする
vi.mock('../../../lib/api', async (importActual) => {
  const actual = await importActual<typeof import('../../../lib/api')>()
  return {
    ...actual,
    api: {
      events: { list: vi.fn(), get: vi.fn(), getSessions: vi.fn() },
      reserve: { list: vi.fn(), updateStatus: vi.fn(), addWalkin: vi.fn() },
    },
  }
})

// CSV の保存はファイルを作らず、渡された blob とファイル名を記録する
vi.mock('../saveBlob', () => ({ saveBlob: vi.fn(), REVOKE_DELAY_MS: 1000 }))

/** XSS を試す名前 */
const XSS_NAME = '<script>window.__printXss = 1</script><img src=x onerror="window.__printXss=2">'

/** WS ありの今後のイベント（1 日だけ） */
const EVENT = {
  id: 'ev-1', slug: 'ev-1', name: 'テスト<b>イベント</b>', start_date: '2099-06-01', end_date: null, time: '10:00〜17:00',
  location: '会場', booth_number: null, address: null, official_url: null, brands: [], has_workshop: true,
  ws_requires_reservation: true, is_past: false, display_order: 1, images: [], page_content: null, daily_times: null,
} as Event

/** 定員 5 名の時間枠 */
const SESSION: WsSession = { id: 's-1', event_id: 'ev-1', time_label: '11:00〜12:00', max_participants: 5, reserved_count: 2, display_order: 1 }

/**
 * 予約を 1 件作る
 * @param over - 上書きする項目
 * @returns 予約
 */
function makeReservation(over: Partial<Reservation>): Reservation {
  return {
    id: 'r', event_id: 'ev-1', name: '山田', email: 'a@example.com', phone: null, participants: 1, note: null,
    status: 'pending', session_id: 's-1', bring_plant: false, bring_pot: false, preferred_date: '2099-06-01',
    preferred_time: null, created_at: '2099-05-01T00:00:00Z', email_failed: null, ...over,
  } as Reservation
}

/** 受付済み 2 名（名前に XSS）とキャンセル 3 名の予約 */
const RESERVATIONS = [
  makeReservation({ id: 'r-1', name: XSS_NAME, participants: 2, note: '=HYPERLINK("x")' }),
  makeReservation({ id: 'r-2', name: 'キャンセルした人', participants: 3, status: 'cancelled' }),
]

/** window.open の代わりに返す印刷用のウィンドウ。書き出された HTML を記録する */
let written = ''
/** 印刷用のウィンドウのモック */
const fakeWin = { document: { write: (html: string) => { written += html }, close: vi.fn() } }

beforeEach(() => {
  written = ''
  vi.spyOn(window, 'open').mockReturnValue(fakeWin as unknown as Window)
  vi.mocked(api.events.list).mockReset().mockImplementation((past = false) => Promise.resolve(past ? [] : [EVENT]))
  vi.mocked(api.events.get).mockReset().mockResolvedValue(EVENT)
  vi.mocked(api.events.getSessions).mockReset().mockResolvedValue([SESSION])
  vi.mocked(api.reserve.list).mockReset().mockResolvedValue(RESERVATIONS)
  vi.mocked(saveBlob).mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

/**
 * 印刷の HTML に、予約者の入力から作られた要素（script・img）が入っていないことを確かめる
 * 1. 文字列としては &lt;script&gt; の形でエスケープされている
 * 2. HTML として読んでも、script は印刷を始める 1 つだけ（予約者の入力の script は無い）で、img も無い
 */
function expectEscaped() {
  // 1. エスケープされた形
  expect(written).toContain('&lt;script&gt;window.__printXss = 1&lt;/script&gt;')
  expect(written).not.toContain('<script>window.__printXss')
  expect(written).not.toContain('<img')
  // 2. HTML として読む（DOMParser はスクリプトを実行しない）
  const doc = new DOMParser().parseFromString(written, 'text/html')
  const scripts = Array.from(doc.querySelectorAll('script')).map((s) => s.textContent ?? '')
  expect(scripts.every((s) => !s.includes('__printXss'))).toBe(true)
  expect(doc.querySelector('img')).toBeNull()
  // 名前は文字として表に出ている
  expect(doc.body.textContent).toContain('<script>window.__printXss = 1</script>')
}

describe('Reservations（全イベントの予約一覧）', () => {
  /**
   * イベントで絞り込んだ予約一覧を開く
   * @returns render の結果
   */
  const renderPage = () =>
    render(
      <MemoryRouter initialEntries={['/admin/reservations?event_id=ev-1']}>
        <Routes>
          <Route path="/admin/reservations" element={<AdminReservations />} />
        </Routes>
      </MemoryRouter>,
    )

  it('件数と人数はキャンセルを除いて「全1件 / 2名」になる', async () => {
    renderPage()
    expect(await screen.findByText('全1件 / 2名')).toBeInTheDocument()
  })

  it('名前に <script> を入れた予約を印刷しても、HTML ではエスケープされて実行されない', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'PDF で印刷' }))
    expect(window.open).toHaveBeenCalledWith('', '_blank')
    expectEscaped()
    // イベント名のタグもエスケープされる
    expect(written).toContain('テスト&lt;b&gt;イベント&lt;/b&gt;')
  })

  it('印刷の時間枠の見出しはキャンセルを数えず「2 / 5 名」になり、空き枠は 3 行出る', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'PDF で印刷' }))
    await waitFor(() => expect(written).not.toBe(''))
    expect(written).toContain('11:00〜12:00　2 / 5 名')
    expect(written.match(/空枠 \d+/g)).toEqual(['空枠 1', '空枠 2', '空枠 3'])
  })

  it('ポップアップが止められた（window.open が null）ときは何も書き出さず、画面も落ちない', async () => {
    vi.mocked(window.open).mockReturnValue(null)
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'PDF で印刷' }))
    expect(written).toBe('')
    expect(screen.getByText('全1件 / 2名')).toBeInTheDocument()
  })
})

describe('EventReservations（イベント別の予約画面）', () => {
  /**
   * イベント別の予約画面を開く
   * @param state - 移動するときの location.state（戻り先）
   * @returns render の結果
   */
  const renderPage = (state?: unknown) =>
    render(
      <MemoryRouter initialEntries={[{ pathname: '/admin/events/ev-1/reservations', state }]}>
        <Routes>
          <Route path="/admin/events/:id/reservations" element={<AdminEventReservations />} />
        </Routes>
      </MemoryRouter>,
    )

  it('件数と人数はキャンセルを除いて「全1件 / 2名」になる', async () => {
    renderPage()
    expect(await screen.findByText('全1件 / 2名')).toBeInTheDocument()
  })

  it('名前に <script> を入れた予約を印刷しても、HTML ではエスケープされて実行されない', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: '印刷' }))
    expectEscaped()
    expect(written).toContain('テスト&lt;b&gt;イベント&lt;/b&gt; ワークショップ予約一覧')
  })

  it('CSV は BOM 付き・CRLF 区切りで、見出しと予約の行が入り、= で始まる備考には「\'」が付く', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'CSV' }))
    expect(saveBlob).toHaveBeenCalledTimes(1)
    const [blob, fileName] = vi.mocked(saveBlob).mock.calls[0]
    // ファイル名は reservations_イベント名_日付.csv
    expect(fileName).toMatch(/^reservations_テスト<b>イベント<\/b>_\d{4}-\d{2}-\d{2}\.csv$/)
    expect(blob.type).toBe('text/csv;charset=utf-8;')
    // Blob.text() は先頭の BOM を取り除いてしまうので、バイト列で先頭が EF BB BF（BOM）かを確かめる
    const bytes = new Uint8Array(await blob.arrayBuffer())
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf])
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes)
    const lines = text.split('\r\n')
    expect(lines[0].startsWith('﻿受付日,お名前,メール')).toBe(true)
    expect(lines).toHaveLength(3)
    expect(lines[1]).toContain(`"'=HYPERLINK(""x"")"`)
    expect(lines[1]).toContain('"11:00〜12:00"')
  })

  it('state.from が無いときは戻るリンクが「イベント管理」で /admin/events を指す', async () => {
    renderPage()
    const link = await screen.findByRole('link', { name: /イベント管理/ })
    expect(link).toHaveAttribute('href', '/admin/events')
  })

  it('state.from があるときは戻るリンクが「戻る」でその場所を指す', async () => {
    renderPage({ from: '/admin/reservations?event_id=ev-1' })
    const link = await screen.findByRole('link', { name: /戻る/ })
    expect(link).toHaveAttribute('href', '/admin/reservations?event_id=ev-1')
  })

  it('予約ページのリンクのコピーに成功すると「コピーしました」になる', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: '予約ページリンクをコピー' }))
    expect(await screen.findByRole('button', { name: 'コピーしました' })).toBeInTheDocument()
    expect(writeText).toHaveBeenCalledWith('https://ei8htplants.com/official/reserve?event_id=ev-1')
  })

  it('コピーに失敗すると、手でコピーしてもらう URL の案内が出る', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }, configurable: true })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: '予約ページリンクをコピー' }))
    expect(await screen.findByText(/リンクをコピーできませんでした/)).toBeInTheDocument()
    expect(screen.getByText('https://ei8htplants.com/official/reserve?event_id=ev-1')).toBeInTheDocument()
  })

  it('navigator.clipboard が無い環境でも、URL の案内が出て画面は落ちない', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: '予約ページリンクをコピー' }))
    expect(await screen.findByText(/リンクをコピーできませんでした/)).toBeInTheDocument()
  })
})

describe('EventReservations の CSV のファイル名の日付（日本時間）', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  /**
   * 時刻を固定してイベント別の予約画面を開き、CSV を出力してファイル名を返す
   * @param iso - 固定する時刻（UTC）
   * @returns 保存したファイル名
   */
  async function csvNameAt(iso: string): Promise<string> {
    // Date だけを差し替える（setTimeout などは本物のまま。画面の読み込みを待てるようにする）
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(iso))
    render(
      <MemoryRouter initialEntries={['/admin/events/ev-1/reservations']}>
        <Routes>
          <Route path="/admin/events/:id/reservations" element={<AdminEventReservations />} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'CSV' }))
    return vi.mocked(saveBlob).mock.calls[0][1]
  }

  it('UTC 14:59（日本時間 23:59）なら、その日の日付になる', async () => {
    expect(await csvNameAt('2026-05-01T14:59:00Z')).toBe('reservations_テスト<b>イベント</b>_2026-05-01.csv')
  })

  it('UTC 15:00（日本時間の翌日 0:00）なら、翌日の日付になる', async () => {
    expect(await csvNameAt('2026-05-01T15:00:00Z')).toBe('reservations_テスト<b>イベント</b>_2026-05-02.csv')
  })
})
