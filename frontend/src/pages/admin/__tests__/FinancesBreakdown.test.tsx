/**
 * 管理画面「収支一覧」（pages/admin/Finances.tsx）の収支合計の内訳の文のテスト
 * 内訳は computeFinances の式どおり「売上 − 支出 − WS 資材費 − 手伝いへの支払い」。
 * - 0 円の項目（WS 資材費・手伝いへの支払い）は省く
 * - 手伝いへの支払いがマイナス（赤字の分担）のときは「＋ 手伝いの赤字の分担」で足す形にする
 * api はモックにして本番には接続しない
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AdminFinances from '../Finances'
import { api, type Event, type EventFinances } from '../../../lib/api'

// 使う api の関数だけをモックする（computeFinances などの実装はそのまま）
vi.mock('../../../lib/api', async (importActual) => {
  const actual = await importActual<typeof import('../../../lib/api')>()
  return { ...actual, api: { events: { list: vi.fn(), getAllFinances: vi.fn() } } }
})

/**
 * テスト用のイベントを作る
 * @param id - イベントの id
 * @param hasWorkshop - WS を開くか
 * @returns イベント
 */
function makeEvent(id: string, hasWorkshop: boolean): Event {
  return { id, slug: id, name: `イベント ${id}`, start_date: '2026-05-01', end_date: null, has_workshop: hasWorkshop, is_past: true } as unknown as Event
}

/**
 * テスト用の収支を作る（交通費は 0 になるよう距離 0）
 * @param eventId - イベントの id
 * @param over - 上書きする項目
 * @returns 収支
 */
function makeFin(eventId: string, over: Partial<EventFinances>): EventFinances {
  return {
    event_id: eventId, sales: 0, booth_fee: 0, distance: 0, gas_price: 170, expressway_toll: 0, accommodation: 0,
    ws_participants: 0, payment_flag: false, ws_payment_done: false, other_expenses: 0, other_expenses_note: null, notes: null,
    ...over,
  }
}

/**
 * 収支一覧を開く
 * @param events - 終了したイベント
 * @param fins - 収支
 * @returns 戻り値なし。
 */
function renderWith(events: Event[], fins: EventFinances[]) {
  vi.mocked(api.events.list).mockImplementation((past = false) => Promise.resolve(past ? events : []))
  vi.mocked(api.events.getAllFinances).mockResolvedValue(fins)
  render(<MemoryRouter><AdminFinances /></MemoryRouter>)
}

/**
 * 「収支合計 = …」の段落から内訳の文だけを取り出す（段落の後半の説明は除く）
 * @returns 内訳の文
 */
async function breakdown(): Promise<string> {
  const p = await screen.findByText((_, el) => el?.tagName === 'P' && (el.textContent ?? '').startsWith('収支合計 = '))
  return (p.textContent ?? '').replace('収支合計 = ', '').split('WS 売上は')[0].trim()
}

beforeEach(() => {
  vi.mocked(api.events.list).mockReset()
  vi.mocked(api.events.getAllFinances).mockReset()
})

describe('収支合計の内訳', () => {
  it('WS 資材費も手伝いへの支払いも 0 円なら「売上 − 支出」だけになる', async () => {
    renderWith([makeEvent('e1', false)], [makeFin('e1', { sales: 50000, booth_fee: 10000 })])
    expect(await breakdown()).toBe('売上 50,000 円 − 支出 10,000 円')
  })

  it('WS があれば「− WS 資材費」が入る（5 人 × 700 円 = 3,500 円）', async () => {
    renderWith([makeEvent('e1', true)], [makeFin('e1', { sales: 50000, booth_fee: 10000, ws_participants: 5 })])
    expect(await breakdown()).toBe('売上 50,000 円 − 支出 10,000 円 − WS 資材費 3,500 円')
  })

  it('手伝いへの支払いがプラスなら「− 手伝いへの支払い」が入る（(50,000 − 10,000) × 20% = 8,000 円）', async () => {
    renderWith([makeEvent('e1', false)], [makeFin('e1', { sales: 50000, booth_fee: 10000, payment_flag: true })])
    expect(await breakdown()).toBe('売上 50,000 円 − 支出 10,000 円 − 手伝いへの支払い 8,000 円')
  })

  it('手伝いへの支払いがマイナス（赤字）なら「＋ 手伝いの赤字の分担」で足す形になる', async () => {
    // (5,000 − 10,000) × 20% = −1,000 円
    renderWith([makeEvent('e1', false)], [makeFin('e1', { sales: 5000, booth_fee: 10000, payment_flag: true })])
    expect(await breakdown()).toBe('売上 5,000 円 − 支出 10,000 円 ＋ 手伝いの赤字の分担 1,000 円')
  })

  it('複数のイベントの合計で、支払いのプラスとマイナスが打ち消して 0 円なら手伝いの項目は省く', async () => {
    // e1: (50,000 − 45,000) × 20% = 1,000 円、e2: (5,000 − 10,000) × 20% = −1,000 円 → 合計 0 円
    renderWith(
      [makeEvent('e1', false), makeEvent('e2', false)],
      [makeFin('e1', { sales: 50000, booth_fee: 45000, payment_flag: true }), makeFin('e2', { sales: 5000, booth_fee: 10000, payment_flag: true })],
    )
    expect(await breakdown()).toBe('売上 55,000 円 − 支出 55,000 円')
  })

  it('収支を登録したイベントが無ければ合計と内訳は出ない', async () => {
    renderWith([makeEvent('e1', false)], [])
    expect(await screen.findByText('イベント e1')).toBeInTheDocument()
    expect(screen.queryByText((_, el) => el?.tagName === 'P' && (el.textContent ?? '').startsWith('収支合計 = '))).toBeNull()
  })
})
