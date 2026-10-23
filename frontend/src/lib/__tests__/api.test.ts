import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { type EventFinances, api } from '../api'
// 収支の計算は lib/finance.ts に移ったので、移動先から直接読み込む
import { computeFinances, fiscalYear } from '../finance'

// supabase モジュールをモック（authRequest が JWT トークンを取得するために使用）
vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      }),
    },
  },
}))

const BASE: EventFinances = {
  event_id: 'test-id',
  sales: 0,
  booth_fee: 0,
  distance: 0,
  gas_price: 170,
  expressway_toll: 0,
  accommodation: 0,
  ws_participants: 0,
  payment_flag: false,
  ws_payment_done: false,
  other_expenses: 0,
  other_expenses_note: null,
  notes: null,
}

describe('fiscalYear', () => {
  it('4月以降は同年を返す', () => {
    expect(fiscalYear('2025-04-01')).toBe(2025)
    expect(fiscalYear('2025-09-15')).toBe(2025)
    expect(fiscalYear('2025-03-31')).toBe(2024)
  })

  it('3月以前は前年を返す', () => {
    expect(fiscalYear('2026-01-01')).toBe(2025)
    expect(fiscalYear('2026-03-31')).toBe(2025)
    expect(fiscalYear('2026-04-01')).toBe(2026)
  })

  it('境界値: 3月末と4月初', () => {
    expect(fiscalYear('2024-03-31')).toBe(2023)
    expect(fiscalYear('2024-04-01')).toBe(2024)
  })
})

describe('computeFinances - payment_flag なし', () => {
  it('全ゼロのとき全て0', () => {
    const result = computeFinances(BASE, false)
    expect(result.transport).toBe(0)
    expect(result.totalExpense).toBe(0)
    expect(result.net).toBe(0)
    expect(result.salesShare).toBe(0)
    expect(result.wsShare).toBe(0)
    expect(result.paymentAmount).toBe(0)
  })

  it('売上があっても payment_flag=false なら share はゼロ', () => {
    const fin = { ...BASE, sales: 100000, payment_flag: false }
    const result = computeFinances(fin, false)
    expect(result.net).toBe(100000)
    expect(result.salesShare).toBe(0)
    expect(result.paymentAmount).toBe(0)
  })

  it('輸送費計算: distance * 2 / 10 * gas_price', () => {
    const fin = { ...BASE, distance: 50, gas_price: 170 }
    const result = computeFinances(fin, false)
    // 50km * 2 / 10 * 170 = 1700
    expect(result.transport).toBe(1700)
  })
})

describe('computeFinances - payment_flag あり', () => {
  it('WS なし: (sales - totalExpense) * 0.2 が salesShare', () => {
    const fin = { ...BASE, sales: 100000, booth_fee: 20000, payment_flag: true }
    const result = computeFinances(fin, false)
    // totalExpense = 20000, net前 = 80000, salesShare = 80000 * 0.2 = 16000
    expect(result.salesShare).toBe(16000)
    expect(result.wsShare).toBe(0)
    expect(result.paymentAmount).toBe(16000)
    // net = sales - totalExpense - paymentAmount = 100000 - 20000 - 16000 = 64000
    expect(result.net).toBe(64000)
  })

  it('WS あり: wsShare = ws_participants * 1000 * 0.7', () => {
    const fin = { ...BASE, sales: 50000, ws_participants: 5, payment_flag: true }
    const result = computeFinances(fin, true)
    // wsSales = 5 * 1000 = 5000, wsShare = 5000 * 0.7 = 3500
    expect(result.wsSales).toBe(5000)
    expect(result.wsShare).toBe(3500)
    // salesShare = (50000 - 5000 - 0) * 0.2 = 9000
    expect(result.salesShare).toBe(9000)
    expect(result.paymentAmount).toBe(12500)
  })

  it('マイナス利益のとき salesShare もマイナス', () => {
    const fin = { ...BASE, sales: 5000, booth_fee: 20000, payment_flag: true }
    const result = computeFinances(fin, false)
    // (5000 - 20000) * 0.2 = -3000
    expect(result.salesShare).toBe(-3000)
    expect(result.paymentAmount).toBe(-3000)
  })

  it('WS なし: has_workshop=true でも ws_participants=0 なら wsShare=0', () => {
    const fin = { ...BASE, sales: 10000, ws_participants: 0, payment_flag: true }
    const result = computeFinances(fin, true)
    expect(result.wsSales).toBe(0)
    expect(result.wsShare).toBe(0)
  })

  it('輸送費が totalExpense に含まれる', () => {
    const fin = { ...BASE, sales: 50000, distance: 100, gas_price: 170, booth_fee: 10000, payment_flag: true }
    const result = computeFinances(fin, false)
    // transport = 100 * 2 / 10 * 170 = 3400
    expect(result.transport).toBe(3400)
    // totalExpense = 10000 + 3400 = 13400
    expect(result.totalExpense).toBe(13400)
    // salesShare = (50000 - 13400) * 0.2 = 7320
    expect(result.salesShare).toBe(7320)
  })
})

// ---------------------------------------------------------------
// fetch API テスト: 各 api.* 関数が正しいエンドポイントを呼ぶか検証
// ---------------------------------------------------------------

/** テスト用の fetch モックを作成するヘルパー */
function makeMockFetch(responseData: unknown = []) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => responseData,
  })
}

describe('api.events', () => {
  // 各テストの前に fetch モックを設定し、後にグローバルを元に戻す
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = makeMockFetch([])
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('api.events.list() が GET /api/events?past=false を呼ぶ', async () => {
    await api.events.list()
    // デフォルト past=false なので ?past=false が付く
    expect(mockFetch.mock.calls[0][0]).toBe('/api/events?past=false')
  })

  it('api.events.list(true) が ?past=true を付けて呼ぶ', async () => {
    await api.events.list(true)
    expect(mockFetch.mock.calls[0][0]).toBe('/api/events?past=true')
  })

  it('api.events.get(id) が GET /api/events/:id を呼ぶ', async () => {
    mockFetch = makeMockFetch({ id: 'ev-1' })
    vi.stubGlobal('fetch', mockFetch)
    await api.events.get('ev-1')
    expect(mockFetch.mock.calls[0][0]).toBe('/api/events/ev-1')
  })

  it('api.events.create(body) が POST /api/events を呼ぶ', async () => {
    // authRequest を使うので supabase セッションが必要（モック済み）
    mockFetch = makeMockFetch({ id: 'new-ev' })
    vi.stubGlobal('fetch', mockFetch)
    const body = {
      name: 'テストイベント',
      start_date: '2099-01-01',
      location: '東京',
      brands: [],
      has_workshop: false,
      ws_requires_reservation: false,
      image_urls: [],
    }
    await api.events.create(body)
    // 認証ヘッダー付きで POST が呼ばれること
    expect(mockFetch.mock.calls[0][0]).toBe('/api/events')
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ method: 'POST' })
  })

  it('api.events.update(id, body) が PUT /api/events/:id を呼ぶ', async () => {
    mockFetch = makeMockFetch({ id: 'ev-1' })
    vi.stubGlobal('fetch', mockFetch)
    const body = {
      name: '更新イベント',
      start_date: '2099-02-01',
      location: '大阪',
      brands: [],
      has_workshop: false,
      ws_requires_reservation: false,
      image_urls: [],
    }
    await api.events.update('ev-1', body)
    expect(mockFetch.mock.calls[0][0]).toBe('/api/events/ev-1')
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ method: 'PUT' })
  })

  it('api.events.delete(id) が DELETE /api/events/:id を呼ぶ', async () => {
    mockFetch = makeMockFetch({ ok: true })
    vi.stubGlobal('fetch', mockFetch)
    await api.events.delete('ev-1')
    expect(mockFetch.mock.calls[0][0]).toBe('/api/events/ev-1')
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ method: 'DELETE' })
  })
})

describe('api.gallery', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = makeMockFetch([])
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('api.gallery.list() が GET /api/gallery を呼ぶ', async () => {
    await api.gallery.list()
    expect(mockFetch.mock.calls[0][0]).toBe('/api/gallery')
  })

  it('api.gallery.list("ei8ht plants") がブランドフィルター付きで呼ぶ', async () => {
    await api.gallery.list('ei8ht plants')
    // brand パラメータが URL エンコードされて渡されること
    const url: string = mockFetch.mock.calls[0][0]
    expect(url).toContain('/api/gallery')
    expect(url).toContain('brand=')
    expect(url).toContain(encodeURIComponent('ei8ht plants'))
  })
})

describe('api.products', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = makeMockFetch([])
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('api.products.list() が GET /api/products を呼ぶ', async () => {
    await api.products.list()
    // all=false の場合はクエリなし
    expect(mockFetch.mock.calls[0][0]).toBe('/api/products')
  })

  it('api.products.get(id) が GET /api/products/:id を呼ぶ', async () => {
    mockFetch = makeMockFetch({ id: 'prod-1' })
    vi.stubGlobal('fetch', mockFetch)
    await api.products.get('prod-1')
    expect(mockFetch.mock.calls[0][0]).toBe('/api/products/prod-1')
  })
})

describe('api.contact', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = makeMockFetch({ ok: true })
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('api.contact.send(body) が POST /api/contact を呼ぶ', async () => {
    const body = { name: '田中', email: 'tanaka@example.com', message: 'お問い合わせ' }
    await api.contact.send(body)
    expect(mockFetch.mock.calls[0][0]).toBe('/api/contact')
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ method: 'POST' })
  })
})

describe('api.reserve', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = makeMockFetch({ id: 'res-1' })
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('api.reserve.create(body) が POST /api/reserve を呼ぶ', async () => {
    const body = {
      event_id: 'ev-1',
      name: '山田',
      email: 'yamada@example.com',
      participants: 2,
      bring_plant: false,
      bring_pot: false,
    }
    await api.reserve.create(body)
    expect(mockFetch.mock.calls[0][0]).toBe('/api/reserve')
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ method: 'POST' })
  })
})
