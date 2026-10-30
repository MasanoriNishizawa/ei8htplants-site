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

/** 収支計算テストで共通して使う、金額0を基準にしたイベント収支データ */
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

/**
 * 指定した JSON 応答を返す fetch モックを作る。
 * @param responseData - fetch の json() が返す値
 * @returns 成功応答を返す vi.fn モック
 */
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

  it('api.events.getFinances(id) が収支を GET して応答を返す', async () => {
    const response = { event_id: 'ev-1', sales: 12000 }
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    const result = await api.events.getFinances('ev-1')

    expect(mockFetch.mock.calls[0][0]).toBe('/api/events/ev-1/finances')
    expect(mockFetch.mock.calls[0][1]?.method ?? 'GET').toBe('GET')
    expect(mockFetch.mock.calls[0][1]?.body).toBeUndefined()
    expect(result).toEqual(response)
  })

  it('api.events.saveFinances(id, body) が PUT で収支を送り応答を返す', async () => {
    const body = {
      sales: 12000,
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
      notes: '当日売上',
    }
    const response = { event_id: 'ev-1', ...body }
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    const result = await api.events.saveFinances('ev-1', body)

    expect(mockFetch.mock.calls[0][0]).toBe('/api/events/ev-1/finances')
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ method: 'PUT', body: JSON.stringify(body) })
    expect(result).toEqual(response)
  })

  it('api.events.getAllFinances() が全収支を GET して配列を返す', async () => {
    const response = [{ event_id: 'ev-1', sales: 12000 }]
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    const result = await api.events.getAllFinances()

    expect(mockFetch.mock.calls[0][0]).toBe('/api/events/finances')
    expect(mockFetch.mock.calls[0][1]?.method ?? 'GET').toBe('GET')
    expect(mockFetch.mock.calls[0][1]?.body).toBeUndefined()
    expect(result).toEqual(response)
  })

  it('api.events.getSessions(id) が日付指定なしで GET して配列を返す', async () => {
    const response = [{ id: 'session-1', time_label: '10:00', max_participants: 8 }]
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    const result = await api.events.getSessions('ev-1')

    expect(mockFetch.mock.calls[0][0]).toBe('/api/events/ev-1/sessions')
    expect(mockFetch.mock.calls[0][1]?.method ?? 'GET').toBe('GET')
    expect(mockFetch.mock.calls[0][1]?.body).toBeUndefined()
    expect(result).toEqual(response)
  })

  it('api.events.getSessions(id, date) が日付をエンコードして GET する', async () => {
    const response = [{ id: 'session-1', date: '2026-11-01' }]
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    const result = await api.events.getSessions('ev-1', '2026-11-01')

    expect(mockFetch.mock.calls[0][0]).toBe('/api/events/ev-1/sessions?date=2026-11-01')
    expect(mockFetch.mock.calls[0][1]?.method ?? 'GET').toBe('GET')
    expect(mockFetch.mock.calls[0][1]?.body).toBeUndefined()
    expect(result).toEqual(response)
  })

  it('api.events.saveSessions(id, sessions) が PUT で時間枠一覧を送り応答を返す', async () => {
    const sessions = [{ id: 'session-1', time_label: '10:00', max_participants: 8 }]
    const response = [{ ...sessions[0], event_id: 'ev-1' }]
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    const result = await api.events.saveSessions('ev-1', sessions)

    expect(mockFetch.mock.calls[0][0]).toBe('/api/events/ev-1/sessions')
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ method: 'PUT', body: JSON.stringify({ sessions }) })
    expect(result).toEqual(response)
  })

  it('api.events.savePageContent(id, page_content) が PATCH で本文を送りイベントを返す', async () => {
    const page_content = { concept: 'イベント詳細' }
    const response = { id: 'ev-1', page_content }
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    const result = await api.events.savePageContent('ev-1', page_content)

    expect(mockFetch.mock.calls[0][0]).toBe('/api/events/ev-1/page')
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ method: 'PATCH', body: JSON.stringify({ page_content }) })
    expect(result).toEqual(response)
  })

  it('api.events.getAdminInfo(id) が管理情報を GET して応答を返す', async () => {
    const response = { event_id: 'ev-1', load_in_time: '09:00', booth_fee: 5000 }
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    const result = await api.events.getAdminInfo('ev-1')

    expect(mockFetch.mock.calls[0][0]).toBe('/api/events/ev-1/admin-info')
    expect(mockFetch.mock.calls[0][1]?.method ?? 'GET').toBe('GET')
    expect(mockFetch.mock.calls[0][1]?.body).toBeUndefined()
    expect(result).toEqual(response)
  })

  it('api.events.saveAdminInfo(id, body) が PUT で管理情報を送り結果を返す', async () => {
    const body = { event_id: 'ev-1', load_in_time: '09:00', booth_fee: 5000 }
    const response = { ok: true }
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    const result = await api.events.saveAdminInfo('ev-1', body)

    expect(mockFetch.mock.calls[0][0]).toBe('/api/events/ev-1/admin-info')
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ method: 'PUT', body: JSON.stringify(body) })
    expect(result).toEqual(response)
  })

  it('api.events.getAdminInfoDashboard() がitemsを取り出して配列を返す', async () => {
    const items = [{ event_id: 'ev-1', event_name: '植物市', booth_fee: 5000 }]
    mockFetch = makeMockFetch({ items })
    vi.stubGlobal('fetch', mockFetch)

    const result = await api.events.getAdminInfoDashboard()

    expect(mockFetch.mock.calls[0][0]).toBe('/api/events/admin-info/dashboard')
    expect(mockFetch.mock.calls[0][1]?.method ?? 'GET').toBe('GET')
    expect(mockFetch.mock.calls[0][1]?.body).toBeUndefined()
    expect(result).toEqual(items)
    expect(result).not.toHaveProperty('items')
  })
})

describe('api.siteAssets', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = makeMockFetch([])
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('api.siteAssets.get(key) がキーをエンコードして GET し応答を返す', async () => {
    const key = 'hue/hero image'
    const response = { key, url: 'https://example.com/hero.jpg' }
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    const result = await api.siteAssets.get(key)

    expect(mockFetch.mock.calls[0][0]).toBe('/api/site-assets/hue%2Fhero%20image')
    expect(mockFetch.mock.calls[0][1]?.method ?? 'GET').toBe('GET')
    expect(mockFetch.mock.calls[0][1]?.body).toBeUndefined()
    expect(result).toEqual(response)
  })

  it('api.siteAssets.save(key, url) がキーをエンコードして PUT し応答を返す', async () => {
    const key = 'hue/hero image'
    const url = 'https://example.com/new-hero.jpg'
    const response = { key, url }
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    const result = await api.siteAssets.save(key, url)

    expect(mockFetch.mock.calls[0][0]).toBe('/api/site-assets/hue%2Fhero%20image')
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ method: 'PUT', body: JSON.stringify({ url }) })
    expect(result).toEqual(response)
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

  it('api.gallery.add(body) が POST で画像を送り応答を返す', async () => {
    const body = { url: 'https://example.com/gallery.jpg', alt: '植物の写真', brand: 'hue' }
    const response = { id: 'gallery-1', ...body, display_order: 3 }
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    const result = await api.gallery.add(body)

    expect(mockFetch.mock.calls[0][0]).toBe('/api/gallery')
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ method: 'POST', body: JSON.stringify(body) })
    expect(result).toEqual(response)
  })

  it('api.gallery.updateOrder(id, display_order) が PATCH で並び順を送り応答を返す', async () => {
    const response = { id: 'gallery-1', url: 'https://example.com/gallery.jpg', alt: null, brand: null, display_order: 7 }
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    const result = await api.gallery.updateOrder('gallery-1', 7)

    expect(mockFetch.mock.calls[0][0]).toBe('/api/gallery/gallery-1')
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ method: 'PATCH', body: JSON.stringify({ display_order: 7 }) })
    expect(result).toEqual(response)
  })

  it('api.gallery.delete(id) が DELETE で画像を削除し結果を返す', async () => {
    const response = { ok: true }
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    const result = await api.gallery.delete('gallery-1')

    expect(mockFetch.mock.calls[0][0]).toBe('/api/gallery/gallery-1')
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ method: 'DELETE' })
    expect(mockFetch.mock.calls[0][1]?.body).toBeUndefined()
    expect(result).toEqual(response)
  })
})

describe('api.stockists', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = makeMockFetch([])
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('api.stockists.list() が GET /api/stockists を呼び応答を返す', async () => {
    const response = [{ id: 'stockist-1', name: '植物店', area: '東京', address: '東京都', url: null, brands: ['hue'] }]
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    const result = await api.stockists.list()

    expect(mockFetch.mock.calls[0][0]).toBe('/api/stockists')
    expect(mockFetch.mock.calls[0][1]?.method ?? 'GET').toBe('GET')
    expect(mockFetch.mock.calls[0][1]?.body).toBeUndefined()
    expect(result).toEqual(response)
  })

  it('api.stockists.add(body) が POST で取扱店を送り応答を返す', async () => {
    const body = { name: '植物店', area: '東京', address: '東京都', url: 'https://example.com', brands: ['hue'] }
    const response = { id: 'stockist-1', ...body }
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    const result = await api.stockists.add(body)

    expect(mockFetch.mock.calls[0][0]).toBe('/api/stockists')
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ method: 'POST', body: JSON.stringify(body) })
    expect(result).toEqual(response)
  })

  it('api.stockists.patch(id, body) が PATCH で取扱店を送り応答を返す', async () => {
    const body = { name: '植物店・更新', area: '大阪', brands: ['hue'] }
    const response = { id: 'stockist-1', name: body.name, area: body.area, address: null, url: null, brands: body.brands }
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    const result = await api.stockists.patch('stockist-1', body)

    expect(mockFetch.mock.calls[0][0]).toBe('/api/stockists/stockist-1')
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ method: 'PATCH', body: JSON.stringify(body) })
    expect(result).toEqual(response)
  })

  it('api.stockists.delete(id) が DELETE で取扱店を削除し結果を返す', async () => {
    const response = { ok: true }
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    const result = await api.stockists.delete('stockist-1')

    expect(mockFetch.mock.calls[0][0]).toBe('/api/stockists/stockist-1')
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ method: 'DELETE' })
    expect(mockFetch.mock.calls[0][1]?.body).toBeUndefined()
    expect(result).toEqual(response)
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

  it('FE-API-20: api.contact.send(body) が公開 POST で送信し応答を返す', async () => {
    const body = { name: '田中', email: 'tanaka@example.com', message: 'お問い合わせ' }
    const response = { ok: true }
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    const result = await api.contact.send(body)

    expect(mockFetch.mock.calls[0][0]).toBe('/api/contact')
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ method: 'POST', body: JSON.stringify(body) })
    expect((mockFetch.mock.calls[0][1]?.headers as Record<string, string> | undefined)?.Authorization).toBeUndefined()
    expect(result).toEqual(response)
  })

  it('FE-API-21: api.contact.list() が管理用 GET で問い合わせ配列を返す', async () => {
    const response = [{ id: 'contact-1', name: '田中', email: 'tanaka@example.com', message: 'お問い合わせ', is_read: false }]
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    const result = await api.contact.list()

    expect(mockFetch.mock.calls[0][0]).toBe('/api/contacts')
    expect(mockFetch.mock.calls[0][1]?.method ?? 'GET').toBe('GET')
    expect(mockFetch.mock.calls[0][1]?.body).toBeUndefined()
    expect((mockFetch.mock.calls[0][1]?.headers as Record<string, string> | undefined)?.Authorization).toBe('Bearer test-token')
    expect(result).toEqual(response)
  })

  it('FE-API-22: api.contact.markRead(id, is_read) が PATCH で状態を送り問い合わせを返す', async () => {
    const body = { is_read: true }
    const response = { id: 'contact-1', name: '田中', email: 'tanaka@example.com', message: 'お問い合わせ', is_read: true }
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    const result = await api.contact.markRead('contact-1', body.is_read)

    expect(mockFetch.mock.calls[0][0]).toBe('/api/contacts/contact-1')
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ method: 'PATCH', body: JSON.stringify(body) })
    expect((mockFetch.mock.calls[0][1]?.headers as Record<string, string> | undefined)?.Authorization).toBe('Bearer test-token')
    expect(result).toEqual(response)
  })

  it('FE-API-23: api.contact.reply(id, subject, body) が管理用 POST で返信結果を返す', async () => {
    const body = { subject: 'お問い合わせへの返信', body: 'ご連絡ありがとうございます。' }
    const response = { ok: true }
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    const result = await api.contact.reply('contact-1', body.subject, body.body)

    expect(mockFetch.mock.calls[0][0]).toBe('/api/contacts/contact-1/reply')
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ method: 'POST', body: JSON.stringify(body) })
    expect((mockFetch.mock.calls[0][1]?.headers as Record<string, string> | undefined)?.Authorization).toBe('Bearer test-token')
    expect(result).toEqual(response)
  })
})

describe('api.shipping', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = makeMockFetch([])
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('FE-API-24: api.shipping.getRate(prefecture) がエンコード済みクエリでGETし送料を返す', async () => {
    const response = { fee: 850 }
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    const result = await api.shipping.getRate('東京/神奈川')

    expect(mockFetch.mock.calls[0][0]).toBe('/api/shipping/rate?prefecture=%E6%9D%B1%E4%BA%AC%2F%E7%A5%9E%E5%A5%88%E5%B7%9D')
    expect(mockFetch.mock.calls[0][1]?.method ?? 'GET').toBe('GET')
    expect((mockFetch.mock.calls[0][1]?.headers as Record<string, string> | undefined)?.Authorization).toBeUndefined()
    expect(result).toEqual(response)
  })

  it('FE-API-25: api.shipping.getPrefectures() が公開GETで都道府県配列を返す', async () => {
    const response = ['東京都', '大阪府', '北海道']
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    const result = await api.shipping.getPrefectures()

    expect(mockFetch.mock.calls[0][0]).toBe('/api/shipping/prefectures')
    expect(mockFetch.mock.calls[0][1]?.method ?? 'GET').toBe('GET')
    expect((mockFetch.mock.calls[0][1]?.headers as Record<string, string> | undefined)?.Authorization).toBeUndefined()
    expect(result).toEqual(response)
  })
})

describe('api.chatLogs', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = makeMockFetch([])
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('FE-API-26: api.chatLogs.list() が管理用 GET で会話ログ配列を返す', async () => {
    const response = [{
      id: 'log-1',
      user_message: '次のイベントはいつですか？',
      ai_reply: 'イベント一覧をご覧ください。',
      ip_hash: null,
      created_at: '2026-10-01T10:00:00Z',
    }]
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    const result = await api.chatLogs.list()

    expect(mockFetch.mock.calls[0][0]).toBe('/api/chat-logs')
    expect(mockFetch.mock.calls[0][1]?.method ?? 'GET').toBe('GET')
    expect((mockFetch.mock.calls[0][1]?.headers as Record<string, string> | undefined)?.Authorization).toBe('Bearer test-token')
    expect(result).toEqual(response)
  })
})

describe('api.collaborations', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = makeMockFetch([])
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('FE-API-27: api.collaborations.list() が公開 GET でコラボレーション一覧を返す', async () => {
    // 1. GET の応答として返すコラボレーション一覧を用意する。
    /** 一覧取得APIから返るモックデータ */
    const response = [{ id: 'collab-1', title: '植物と器の展示', partner_name: '山田陶房' }]
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    // 2. 公開一覧APIを呼び出す。
    const result = await api.collaborations.list()

    // 3. GET先とメソッド、一覧データがそのまま返ることを確かめる。
    expect(mockFetch.mock.calls[0][0]).toBe('/api/collaborations')
    expect(mockFetch.mock.calls[0][1]?.method ?? 'GET').toBe('GET')
    expect(result).toEqual(response)
  })

  it('FE-API-28: api.collaborations.add(body) が POST で本文を送り追加結果を返す', async () => {
    // 1. 管理画面から送る入力本文と、サーバーが返す追加レコードを用意する。
    /** コラボレーション追加APIへ送信する内容 */
    const body = { title: '植物と器の展示', partner_name: '山田陶房', description: '共同展示を開催します。' }
    /** 登録時にサーバーが生成する属性を含む応答 */
    const response = { id: 'collab-2', ...body, video_url: null, image_url: null, event_date: null, display_order: 0, created_at: '2026-10-30T00:00:00Z' }
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    // 2. 用意した本文で管理者向け追加APIを呼び出す。
    const result = await api.collaborations.add(body)

    // 3. POST先・本文と、追加されたレコードが返ることを確かめる。
    expect(mockFetch.mock.calls[0][0]).toBe('/api/collaborations')
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ method: 'POST', body: JSON.stringify(body) })
    expect(result).toEqual(response)
  })

  it('FE-API-29: api.collaborations.delete(id) が対象 URL に DELETE して結果を返す', async () => {
    // 1. 成功時に返る削除結果と、対象のコラボレーションIDを用意する。
    /** 削除APIが返す成功結果 */
    const response = { ok: true }
    /** 削除対象の識別子 */
    const id = 'collab-3'
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    // 2. 指定したIDのコラボレーションを削除する。
    const result = await api.collaborations.delete(id)

    // 3. 対象IDのURLへDELETEし、成功結果が返ることを確かめる。
    expect(mockFetch.mock.calls[0][0]).toBe(`/api/collaborations/${id}`)
    expect(mockFetch.mock.calls[0][1]?.method).toBe('DELETE')
    expect(result).toEqual(response)
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

describe('api.mediaAppearances', () => {
  /** 各テストで差し替えるメディア掲載 API の fetch モック */
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // 1. 既定では空の成功応答を返す fetch に差し替える。
    mockFetch = makeMockFetch([])
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    // 2. テスト間にグローバル fetch とモック履歴を持ち越さない。
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('FE-API-30: api.mediaAppearances.list() が公開 GET で一覧と応答を返す', async () => {
    // 1. 公開一覧APIから返るメディア掲載データを用意する。
    /** 公開一覧APIの応答データ */
    const response = [{
      id: 'media-1',
      title: '植物のある暮らし',
      youtube_url: 'https://www.youtube.com/watch?v=abcdefghijk',
      description: '番組で紹介されました。',
      published_at: '2026-10-01',
      display_order: 2,
      created_at: '2026-10-01T00:00:00Z',
    }]
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    // 2. 公開一覧APIを呼び出し、取得結果を受け取る。
    const result = await api.mediaAppearances.list()

    // 3. 一覧URLをGETし、サーバーの一覧応答をそのまま返すことを確かめる。
    expect(mockFetch.mock.calls[0][0]).toBe('/api/media-appearances')
    expect(mockFetch.mock.calls[0][1]?.method ?? 'GET').toBe('GET')
    expect(result).toEqual(response)
  })

  it('FE-API-31: api.mediaAppearances.add(body) が POST 本文を送り追加結果を返す', async () => {
    // 1. 追加時に送る本文と、登録後にサーバーから返るレコードを用意する。
    /** 管理画面から追加APIへ送信する内容 */
    const body = {
      title: '植物のある暮らし',
      youtube_url: 'https://www.youtube.com/watch?v=abcdefghijk',
      description: '番組で紹介されました。',
      published_at: '2026-10-01',
      display_order: 2,
    }
    /** 登録時にサーバーが生成する識別子・日時を含む応答 */
    const response = { id: 'media-2', ...body, created_at: '2026-10-30T00:00:00Z' }
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    // 2. 用意した本文で認証付きの追加APIを呼び出す。
    const result = await api.mediaAppearances.add(body)

    // 3. 一覧URLへのPOST・JSON本文と、追加されたレコードが返ることを確かめる。
    expect(mockFetch.mock.calls[0][0]).toBe('/api/media-appearances')
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ method: 'POST', body: JSON.stringify(body) })
    expect(result).toEqual(response)
  })

  it('FE-API-32: api.mediaAppearances.delete(id) が対象 URL に DELETE して結果を返す', async () => {
    // 1. 削除APIの成功応答と、削除対象の識別子を用意する。
    /** 削除APIが返す成功結果 */
    const response = { ok: true }
    /** 削除対象のメディア掲載ID */
    const id = 'media-3'
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    // 2. 指定したメディア掲載を削除する。
    const result = await api.mediaAppearances.delete(id)

    // 3. 対象IDのURLへDELETEし、成功応答が返ることを確かめる。
    expect(mockFetch.mock.calls[0][0]).toBe(`/api/media-appearances/${id}`)
    expect(mockFetch.mock.calls[0][1]?.method).toBe('DELETE')
    expect(result).toEqual(response)
  })
})
