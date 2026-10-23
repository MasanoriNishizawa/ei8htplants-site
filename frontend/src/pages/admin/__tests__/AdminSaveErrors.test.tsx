/**
 * 管理画面の読み込み・保存の失敗の表示のテスト
 * 失敗したときに文言（role="alert"）が出て、ボタン・チェックが操作できない状態のまま固まらないことを確かめる
 * - AdminWsSummary: 支払い済みのチェックの保存失敗・読み込み失敗
 * - AdminHelperPayment・Finances: 読み込み失敗（「データがありません」と誤表示しない）
 * - Collaborations: 追加の失敗
 * - PriceCalc: 登録の失敗・見出し「販売価格計算」
 * api はモックにして本番には接続しない
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { api, ApiError, type Event, type EventFinances } from '../../../lib/api'
import AdminWsSummary from '../AdminWsSummary'
import AdminHelperPayment from '../AdminHelperPayment'
import AdminFinances from '../Finances'
import AdminCollaborations from '../Collaborations'
import PriceCalc from '../PriceCalc'

// 使う api の関数だけをモックする（ApiError・計算の関数などの実装はそのまま）
vi.mock('../../../lib/api', async (importActual) => {
  const actual = await importActual<typeof import('../../../lib/api')>()
  return {
    ...actual,
    api: {
      events: { list: vi.fn(), getAllFinances: vi.fn(), saveFinances: vi.fn() },
      collaborations: { list: vi.fn(), add: vi.fn(), delete: vi.fn() },
      potArtists: { list: vi.fn() },
      priceCalcEntries: { list: vi.fn(), add: vi.fn(), delete: vi.fn() },
      upload: { image: vi.fn(), video: vi.fn() },
    },
  }
})

/** WS ありの終了済みイベント */
const WS_EVENT = { id: 'e-ws', name: 'WSイベント', start_date: '2025-06-01', has_workshop: true, is_past: true } as unknown as Event
/** そのイベントの収支（参加 3 人・支払いはまだ） */
const WS_FIN = {
  id: 'f-ws', event_id: 'e-ws', sales: 0, booth_fee: 0, distance: 0, gas_price: 170, expressway_toll: 0,
  accommodation: 0, ws_participants: 3, payment_flag: false, ws_payment_done: false, other_expenses: 0,
  other_expenses_note: null, notes: null,
} as EventFinances

/** 500 のエラー */
const SERVER_ERROR = new ApiError(500, '500 Internal Server Error', null)

describe('AdminWsSummary の失敗の表示', () => {
  beforeEach(() => {
    vi.mocked(api.events.list).mockReset().mockResolvedValue([WS_EVENT])
    vi.mocked(api.events.getAllFinances).mockReset().mockResolvedValue([WS_FIN])
    vi.mocked(api.events.saveFinances).mockReset()
  })

  it('支払い済みのチェックの保存に失敗すると文言が出て、チェックは元のまま、また押せる', async () => {
    vi.mocked(api.events.saveFinances).mockRejectedValue(SERVER_ERROR)
    render(<AdminWsSummary />)
    const checkbox = await screen.findByRole('checkbox')
    fireEvent.click(checkbox)
    expect(await screen.findByRole('alert')).toHaveTextContent('支払い状況の保存に失敗しました（500 Internal Server Error）')
    expect(checkbox).not.toBeChecked()
    expect(checkbox).toBeEnabled()
  })

  it('保存に成功するとチェックが付き、送った収支は ws_payment_done だけが true になる', async () => {
    vi.mocked(api.events.saveFinances).mockResolvedValue(WS_FIN)
    render(<AdminWsSummary />)
    const checkbox = await screen.findByRole('checkbox')
    fireEvent.click(checkbox)
    await waitFor(() => expect(checkbox).toBeChecked())
    expect(api.events.saveFinances).toHaveBeenCalledWith('e-ws', { ...WS_FIN, ws_payment_done: true })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('読み込みに失敗すると「データの読み込みに失敗しました」が出て、「データがありません」は出ない', async () => {
    vi.mocked(api.events.getAllFinances).mockRejectedValue(SERVER_ERROR)
    render(<AdminWsSummary />)
    expect(await screen.findByRole('alert')).toHaveTextContent('データの読み込みに失敗しました')
    expect(screen.queryByText('ワークショップのデータがありません。')).toBeNull()
  })
})

describe('AdminHelperPayment・Finances の読み込み失敗', () => {
  beforeEach(() => {
    vi.mocked(api.events.list).mockReset().mockResolvedValue([])
    vi.mocked(api.events.getAllFinances).mockReset().mockRejectedValue(SERVER_ERROR)
  })

  it('手伝い支払い: 読み込みに失敗すると「データの読み込みに失敗しました」が出て、「手伝いありのイベントがありません」は出ない', async () => {
    render(<AdminHelperPayment />)
    expect(await screen.findByRole('alert')).toHaveTextContent('データの読み込みに失敗しました（500 Internal Server Error）')
    expect(screen.queryByText(/手伝いありのイベントがありません/)).toBeNull()
  })

  it('収支: 読み込みに失敗すると「収支の読み込みに失敗しました」が出る', async () => {
    render(<MemoryRouter><AdminFinances /></MemoryRouter>)
    expect(await screen.findByRole('alert')).toHaveTextContent('収支の読み込みに失敗しました（500 Internal Server Error）')
  })
})

describe('Collaborations の追加の失敗', () => {
  beforeEach(() => {
    vi.mocked(api.collaborations.list).mockReset().mockResolvedValue([])
    vi.mocked(api.collaborations.add).mockReset()
  })

  it('追加に失敗すると文言が出て、入力は残り、「追加」ボタンに戻ってまた押せる', async () => {
    vi.mocked(api.collaborations.add).mockRejectedValue(SERVER_ERROR)
    render(<AdminCollaborations />)
    const title = await screen.findByLabelText('タイトル')
    fireEvent.change(title, { target: { value: '失敗するコラボ' } })
    fireEvent.submit(title.closest('form')!)
    expect(await screen.findByRole('alert')).toHaveTextContent('追加に失敗しました（500 Internal Server Error）')
    expect(title).toHaveValue('失敗するコラボ')
    const button = screen.getByRole('button', { name: '追加' })
    expect(button).toBeEnabled()
  })

  it('タイトルだけで追加すると、空の項目は送らない（タイトルだけの内容になる）', async () => {
    vi.mocked(api.collaborations.add).mockResolvedValue({} as never)
    render(<AdminCollaborations />)
    const title = await screen.findByLabelText('タイトル')
    fireEvent.change(title, { target: { value: 'コラボA' } })
    fireEvent.submit(title.closest('form')!)
    await waitFor(() => expect(api.collaborations.add).toHaveBeenCalledWith({ title: 'コラボA' }))
  })

  it('一覧の読み込みに失敗すると「コラボレーションの読み込みに失敗しました」が出る', async () => {
    vi.mocked(api.collaborations.list).mockRejectedValue(SERVER_ERROR)
    render(<AdminCollaborations />)
    expect(await screen.findByRole('alert')).toHaveTextContent('コラボレーションの読み込みに失敗しました')
  })
})

describe('PriceCalc の登録の失敗', () => {
  beforeEach(() => {
    vi.mocked(api.potArtists.list).mockReset().mockResolvedValue([])
    vi.mocked(api.priceCalcEntries.list).mockReset().mockResolvedValue([])
    vi.mocked(api.priceCalcEntries.add).mockReset()
  })

  it('見出しは「販売価格計算」', async () => {
    render(<PriceCalc />)
    expect(screen.getByRole('heading', { level: 1, name: '販売価格計算' })).toBeInTheDocument()
  })

  it('登録に失敗すると文言が出て、入力は残り、「登録中...」から戻って登録ボタンがまた押せる', async () => {
    vi.mocked(api.priceCalcEntries.add).mockRejectedValue(SERVER_ERROR)
    render(<PriceCalc />)
    // 1. 植物名と仕入れ値を入れる
    fireEvent.change(screen.getByPlaceholderText('例: アガベ チタノタ'), { target: { value: 'アガベ' } })
    fireEvent.change(screen.getByPlaceholderText('例: 1500'), { target: { value: '1000' } })
    // 2. 登録する
    fireEvent.click(screen.getByRole('button', { name: /^登録/ }))
    // 3. 文言が出て、入力は残り、ボタンは押せる状態に戻る
    expect(await screen.findByRole('alert')).toHaveTextContent('登録に失敗しました（500 Internal Server Error）')
    expect(screen.getByPlaceholderText('例: アガベ チタノタ')).toHaveValue('アガベ')
    await waitFor(() => expect(screen.getByRole('button', { name: /^登録/ })).toBeEnabled())
    expect(screen.queryByText('登録中...')).toBeNull()
  })

  it('登録リストの読み込みに失敗すると「登録リストの読み込みに失敗しました」が出る', async () => {
    vi.mocked(api.priceCalcEntries.list).mockRejectedValue(SERVER_ERROR)
    render(<PriceCalc />)
    expect(await screen.findByRole('alert')).toHaveTextContent('登録リストの読み込みに失敗しました')
  })
})
