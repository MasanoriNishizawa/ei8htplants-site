/**
 * EventFinance ページのテスト
 *
 * 1. `computeFinances` 関数の計算ロジックを直接テストする
 *    - 輸送費・WS売上・WS資材費・収支・支払い金額の計算を確認する
 * 2. EventFinance ページのレンダリングテスト
 *    - API モックを使って収支情報が画面に表示されることを確認する
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import EventFinance from '../EventFinance'
import { api, computeFinances } from '../../../lib/api'
import type { Event, EventFinances } from '../../../lib/api'

// api モジュールの関数をモックしつつ、computeFinances などの実装は保持する
vi.mock('../../../lib/api', async (importActual) => {
  const actual = await importActual<typeof import('../../../lib/api')>()
  return {
    ...actual, // computeFinances・fiscalYear などの実装を保持する
    api: {
      events: {
        get: vi.fn(),
        getFinances: vi.fn(),
        getAdminInfo: vi.fn(),
        saveAdminInfo: vi.fn(),
      },
      reserve: {
        list: vi.fn(),
      },
    },
  }
})

// ---- computeFinances 計算ロジックのテスト ----

/**
 * テスト用のデフォルト EventFinances データ
 * すべてゼロ・未設定の状態
 */
const BASE_FINANCES: EventFinances = {
  event_id: 'ev-test',
  sales: 0,
  booth_fee: 0,
  distance: 0,
  gas_price: 160,
  expressway_toll: 0,
  accommodation: 0,
  ws_participants: 0,
  payment_flag: false,
  ws_payment_done: false,
  other_expenses: 0,
  other_expenses_note: null,
  notes: null,
}

describe('computeFinances 収支計算', () => {
  it('全ゼロのとき全て 0 になる', () => {
    // 入力がすべてゼロのとき全フィールドが 0 になることを確認する
    const result = computeFinances(BASE_FINANCES, false)
    expect(result.transport).toBe(0)
    expect(result.totalExpense).toBe(0)
    expect(result.wsSales).toBe(0)
    expect(result.wsCost).toBe(0)
    expect(result.net).toBe(0)
    expect(result.paymentAmount).toBe(0)
  })

  it('輸送費: 距離 × 2 ÷ 10 × ガス代で計算される', () => {
    // 距離 50km、ガス代 160円/L → transport = 50×2÷10×160 = 1600 円
    const result = computeFinances(
      { ...BASE_FINANCES, distance: 50, gas_price: 160 },
      false
    )
    expect(result.transport).toBe(1600)
  })

  it('支出合計: booth_fee + transport + expressway_toll + accommodation + other_expenses', () => {
    // 各支出フィールドが totalExpense に加算されることを確認する
    const result = computeFinances(
      {
        ...BASE_FINANCES,
        booth_fee: 10000,
        distance: 50,   // transport = 1600
        gas_price: 160,
        expressway_toll: 3000,
        accommodation: 5000,
        other_expenses: 2000,
      },
      false
    )
    // totalExpense = 10000 + 1600 + 3000 + 5000 + 2000 = 21600
    expect(result.transport).toBe(1600)
    expect(result.totalExpense).toBe(21600)
  })

  it('ワークショップなしのとき wsSales と wsCost は 0', () => {
    // hasWorkshop=false のとき WS 関連は計算されない
    const result = computeFinances(
      { ...BASE_FINANCES, ws_participants: 10 },
      false  // hasWorkshop = false
    )
    expect(result.wsSales).toBe(0)
    expect(result.wsCost).toBe(0)
  })

  it('ワークショップあり: ws_participants × 1000 が wsSales になる', () => {
    // 5人参加 → wsSales = 5000 円
    const result = computeFinances(
      { ...BASE_FINANCES, ws_participants: 5 },
      true  // hasWorkshop = true
    )
    expect(result.wsSales).toBe(5000)
  })

  it('ワークショップあり: ws_participants × 700 が wsCost（資材費）になる', () => {
    // 5人参加 → wsCost = 3500 円
    const result = computeFinances(
      { ...BASE_FINANCES, ws_participants: 5 },
      true
    )
    expect(result.wsCost).toBe(3500)
  })

  it('収支（net）= 売上 - 支出合計 - WS資材費', () => {
    // 売上 100000, 出店料 10000, WS5人(資材費3500) → net = 100000 - 10000 - 3500 = 86500
    const result = computeFinances(
      {
        ...BASE_FINANCES,
        sales: 100000,
        booth_fee: 10000,
        ws_participants: 5,
      },
      true
    )
    expect(result.net).toBe(86500)
  })

  it('赤字の場合は net がマイナスになる', () => {
    // 売上 5000 円、出店料 20000 円 → net = -15000
    const result = computeFinances(
      { ...BASE_FINANCES, sales: 5000, booth_fee: 20000 },
      false
    )
    expect(result.net).toBe(-15000)
  })

  it('payment_flag=false のとき paymentAmount・salesShare・wsShare はすべて 0', () => {
    // 支払フラグ OFF では手伝い支払い金額は計算されない
    const result = computeFinances(
      { ...BASE_FINANCES, sales: 100000, booth_fee: 10000, payment_flag: false },
      false
    )
    expect(result.paymentAmount).toBe(0)
    expect(result.salesShare).toBe(0)
    expect(result.wsShare).toBe(0)
  })

  it('payment_flag=true: salesShare = (売上 - WS売上 - 支出) × 20%', () => {
    // 売上100000, WS売上5000(5人), 出店料10000
    // salesShare = (100000 - 5000 - 10000) × 0.2 = 17000
    const result = computeFinances(
      {
        ...BASE_FINANCES,
        sales: 100000,
        booth_fee: 10000,
        ws_participants: 5,
        payment_flag: true,
      },
      true
    )
    expect(result.salesShare).toBe(17000)
  })

  it('payment_flag=true: wsShare = WS売上 × 70%', () => {
    // WS売上 5000 → wsShare = 3500
    const result = computeFinances(
      { ...BASE_FINANCES, ws_participants: 5, payment_flag: true },
      true
    )
    expect(result.wsShare).toBe(3500)
  })

  it('payment_flag=true: 赤字のとき salesShare がマイナスになる', () => {
    // 売上 10000, 支出 20000 → (10000 - 20000) × 0.2 = -2000
    const result = computeFinances(
      { ...BASE_FINANCES, sales: 10000, booth_fee: 20000, payment_flag: true },
      false
    )
    expect(result.salesShare).toBe(-2000)
  })
})

// ---- EventFinance ページのレンダリングテスト ----

/**
 * テスト用のイベントデータ
 */
const MOCK_EVENT: Event = {
  id: 'ev-finance-1',
  slug: 'finance-event',
  name: '収支テストイベント',
  start_date: '2099-11-01',
  end_date: null,
  time: '10:00〜17:00',
  location: 'テスト会場',
  booth_number: null,
  address: null,
  official_url: null,
  brands: [],
  has_workshop: false,
  ws_requires_reservation: false,
  is_past: false,
  display_order: 1,
  images: [],
  page_content: null,
  daily_times: null,
}

/**
 * テスト用の EventFinances データ
 */
const MOCK_FINANCES: EventFinances = {
  id: 'fin-1',
  event_id: 'ev-finance-1',
  sales: 50000,
  booth_fee: 10000,
  distance: 100,
  gas_price: 160,
  expressway_toll: 2000,
  accommodation: 0,
  ws_participants: 0,
  payment_flag: false,
  ws_payment_done: false,
  other_expenses: 0,
  other_expenses_note: null,
  notes: null,
}

/**
 * EventFinance ページを Routes/MemoryRouter でラップしてレンダリングするヘルパー
 * @param eventId - URL パラメータとして渡すイベントID
 */
function renderFinancePage(eventId: string = 'ev-finance-1') {
  return render(
    <MemoryRouter initialEntries={[`/admin/events/${eventId}/finance`]}>
      <Routes>
        <Route path="/admin/events/:id/finance" element={<EventFinance />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('EventFinance ページ', () => {
  beforeEach(() => {
    // 各テスト前にモックをリセットしてデフォルトの解決値を設定する
    vi.mocked(api.events.get).mockReset()
    vi.mocked(api.events.getFinances).mockReset()
    vi.mocked(api.reserve.list).mockReset()
    vi.mocked(api.events.getAdminInfo).mockReset()
    vi.mocked(api.events.saveAdminInfo).mockReset()

    vi.mocked(api.events.get).mockResolvedValue(MOCK_EVENT)
    vi.mocked(api.events.getFinances).mockResolvedValue(MOCK_FINANCES)
    vi.mocked(api.reserve.list).mockResolvedValue([])
    // 管理情報は未入力の空オブジェクトを返す
    vi.mocked(api.events.getAdminInfo).mockResolvedValue({} as any)
    vi.mocked(api.events.saveAdminInfo).mockResolvedValue({ ok: true })
  })

  it('データ読み込み後に「収支管理」見出しが表示される', async () => {
    // ローディング完了後に "収支管理" が表示されることを確認する
    renderFinancePage()
    await waitFor(() => {
      expect(screen.getByText('収支管理')).toBeDefined()
    })
  })

  it('イベント名と開催日が表示される', async () => {
    // イベントのメタ情報（名前・日付）が表示されることを確認する
    renderFinancePage()
    await waitFor(() => {
      expect(screen.getByText(/収支テストイベント/)).toBeDefined()
    })
  })

  it('収入セクションが表示される（「収入」ラベル）', async () => {
    // 収入セクションのラベルが表示されることを確認する
    renderFinancePage()
    await waitFor(() => {
      expect(screen.getByText('収入')).toBeDefined()
    })
  })

  it('支出セクションが表示される（「支出」ラベル）', async () => {
    // 支出セクションのラベルが表示されることを確認する
    renderFinancePage()
    await waitFor(() => {
      expect(screen.getByText('支出')).toBeDefined()
    })
  })

  it('保存ボタンが表示される', async () => {
    // 収支データを保存するボタンが表示されることを確認する
    renderFinancePage()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '保存' })).toBeDefined()
    })
  })

  it('ローディング中は「読み込み中...」が表示される', () => {
    // データ取得が完了する前はローディングメッセージが表示される
    vi.mocked(api.events.get).mockReturnValue(new Promise(() => {})) // 永遠に保留
    renderFinancePage()
    expect(screen.getByText('読み込み中...')).toBeDefined()
  })
})
