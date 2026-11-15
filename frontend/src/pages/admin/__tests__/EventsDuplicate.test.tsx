/**
 * イベント一覧（pages/admin/Events.tsx）の「複製」のテスト（2026-11-13 追加）
 * - ワークショップの実施日（ws_dates）・日ごとの開催時間（daily_times）・時間枠（id を外し、session_date つき・表示順）を、
 *   1 回の create（本文の sessions）で写す
 * - WS なしのイベントは枠を読まず、sessions は空
 * - 複製元の枠を読めなければ、枠の無い複製を作らないよう中止してエラーを出す
 * - 作成に失敗したら「複製に失敗しました」
 * api はモックにして本番には接続しない
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import AdminEvents from '../Events'
import { api } from '../../../lib/api'
import type { Event, WsSession } from '../../../lib/api'

// 使う api の関数だけをモックする
vi.mock('../../../lib/api', async (importActual) => {
  const actual = await importActual<typeof import('../../../lib/api')>()
  return {
    ...actual,
    api: {
      events: { list: vi.fn(), create: vi.fn(), delete: vi.fn(), getSessions: vi.fn() },
      reserve: { list: vi.fn() },
    },
  }
})

/** 7/1〜7/4 の 4 日間・7/2 と 7/4 だけ実施・日ごとの開催時間ありのイベント */
const WS_EVENT: Event = {
  id: 'ws-ev', slug: 'ws-ev', name: 'Plants Weekend', start_date: '2099-07-01', end_date: '2099-07-04', time: '10:00〜17:00',
  location: '会場', booth_number: 'B-3', address: null, official_url: null, brands: ['Habitat Oides'], has_workshop: true,
  ws_requires_reservation: true, is_past: false, display_order: 1,
  images: [{ id: 'img', url: 'https://example.com/a.jpg', display_order: 0 }],
  page_content: null, daily_times: { '2099-07-01': '10:00〜16:00' }, ws_dates: ['2099-07-02', '2099-07-04'],
}

/** WS なしのイベント */
const PLAIN_EVENT: Event = { ...WS_EVENT, id: 'plain', name: 'WSなし', has_workshop: false, ws_dates: null, daily_times: null }

/** 複製元の枠（表示順が逆に返る） */
const SESSIONS: WsSession[] = [
  { id: 's-b', event_id: 'ws-ev', time_label: '13:00〜14:00', max_participants: 4, reserved_count: 3, display_order: 1, session_date: '2099-07-02' },
  { id: 's-a', event_id: 'ws-ev', time_label: '11:00〜12:00', max_participants: 6, reserved_count: 2, display_order: 0, session_date: '2099-07-02' },
]

beforeEach(() => {
  vi.mocked(api.events.list).mockReset().mockImplementation((past = false) => Promise.resolve(past ? [] : [WS_EVENT, PLAIN_EVENT]))
  vi.mocked(api.reserve.list).mockReset().mockResolvedValue([])
  vi.mocked(api.events.getSessions).mockReset().mockResolvedValue(SESSIONS)
  vi.mocked(api.events.create).mockReset().mockResolvedValue({ ...WS_EVENT, id: 'copy' })
})

/**
 * イベント一覧を開き、指定したイベントの行の「複製」を押す
 * @param name - イベント名
 * @returns なし
 */
async function duplicate(name: string) {
  render(
    <MemoryRouter initialEntries={['/admin/events']}>
      <Routes>
        <Route path="/admin/events" element={<AdminEvents />} />
      </Routes>
    </MemoryRouter>,
  )
  /** その行（イベント名の 2 つ上の要素） */
  const row = (await screen.findByText(name, { exact: true })).parentElement!.parentElement!
  fireEvent.click(Array.from(row.querySelectorAll('button')).find((b) => b.textContent === '複製')!)
}

describe('Events の複製', () => {
  it('FE-EV-01 実施日・日ごとの開催時間・時間枠（id なし・session_date つき・表示順）を 1 回の create で写す', async () => {
    await duplicate('Plants Weekend')
    await waitFor(() => expect(api.events.create).toHaveBeenCalledTimes(1))
    expect(api.events.getSessions).toHaveBeenCalledWith('ws-ev')
    expect(vi.mocked(api.events.create).mock.calls[0][0]).toMatchObject({
      name: 'Plants Weekend (コピー)',
      start_date: '2099-07-01',
      end_date: '2099-07-04',
      has_workshop: true,
      ws_requires_reservation: true,
      daily_times: { '2099-07-01': '10:00〜16:00' },
      ws_dates: ['2099-07-02', '2099-07-04'],
      image_urls: ['https://example.com/a.jpg'],
      sessions: [
        { time_label: '11:00〜12:00', max_participants: 6, session_date: '2099-07-02' },
        { time_label: '13:00〜14:00', max_participants: 4, session_date: '2099-07-02' },
      ],
    })
    // 予約済みの人数・id は写さない
    vi.mocked(api.events.create).mock.calls[0][0].sessions?.forEach((s) => {
      expect(s).not.toHaveProperty('id')
      expect(s).not.toHaveProperty('reserved_count')
    })
  })

  it('FE-EV-02 WS なしのイベントは枠を読まず、sessions は空・ws_dates は null', async () => {
    await duplicate('WSなし')
    await waitFor(() => expect(api.events.create).toHaveBeenCalledTimes(1))
    expect(api.events.getSessions).not.toHaveBeenCalled()
    expect(vi.mocked(api.events.create).mock.calls[0][0]).toMatchObject({ name: 'WSなし (コピー)', sessions: [], ws_dates: null })
  })

  it('FE-EV-03 複製元の枠を読めなければ、中止して（create を呼ばず）エラーを出す', async () => {
    vi.mocked(api.events.getSessions).mockRejectedValue(new Error('通信エラー'))
    await duplicate('Plants Weekend')
    expect(await screen.findByText(/複製元の時間枠を読み込めなかったため、複製を中止しました/)).toBeInTheDocument()
    expect(api.events.create).not.toHaveBeenCalled()
    // 中止のあとはまた押せる
    await waitFor(() => expect(screen.getAllByRole('button', { name: '複製' })[0]).toBeEnabled())
  })

  it('FE-EV-04 作成に失敗したら「複製に失敗しました」', async () => {
    vi.mocked(api.events.create).mockRejectedValue(new Error('作成エラー'))
    await duplicate('Plants Weekend')
    expect(await screen.findByText(/複製に失敗しました/)).toBeInTheDocument()
  })
})
