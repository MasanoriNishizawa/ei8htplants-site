import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { type EventFinances, api } from '../api'
import type { ChatSendMessage } from '../chatHistory'
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

describe('api.articles', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = makeMockFetch([])
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('FE-API-45: api.articles.list() が公開GET /api/articlesを呼び、記事一覧を返す', async () => {
    // 1. 公開一覧APIから返る記事を用意する。
    /** 公開記事一覧APIの応答 */
    const response = [{
      id: 'article-1',
      title: '植物と暮らす',
      content: null,
      image_urls: [],
      tags: ['植物'],
      product_ids: [],
      is_published: true,
      display_order: 1,
      published_at: '2026-10-30T00:00:00Z',
      created_at: '2026-10-29T00:00:00Z',
    }]
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    // 2. 既定値の公開記事一覧を取得する。
    const result = await api.articles.list()

    // 3. クエリなしの公開GETを使い、認証を付けず一覧応答を返すことを確かめる。
    expect(mockFetch.mock.calls[0][0]).toBe('/api/articles')
    expect(mockFetch.mock.calls[0][1]?.method ?? 'GET').toBe('GET')
    expect((mockFetch.mock.calls[0][1]?.headers as Record<string, string> | undefined)?.Authorization).toBeUndefined()
    expect(result).toEqual(response)
  })

  it('FE-API-46: api.articles.list(true) が認証付きGET /api/articles?all=trueを呼ぶ', async () => {
    // 1. 公開・非公開を含む記事一覧の応答を用意する。
    /** 管理用の全記事一覧APIの応答 */
    const response = [
      { id: 'article-1', title: '公開記事', is_published: true },
      { id: 'article-2', title: '下書き', is_published: false },
    ]
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    // 2. 管理画面用に非公開記事も含む一覧を取得する。
    const result = await api.articles.list(true)

    // 3. all=trueのGETに認証が付き、全記事の応答を返すことを確かめる。
    expect(mockFetch.mock.calls[0][0]).toBe('/api/articles?all=true')
    expect(mockFetch.mock.calls[0][1]?.method ?? 'GET').toBe('GET')
    expect((mockFetch.mock.calls[0][1]?.headers as Record<string, string> | undefined)?.Authorization).toBe('Bearer test-token')
    expect(result).toEqual(response)
  })

  it('FE-API-47: api.articles.get(id) が公開GET /api/articles/:idを呼ぶ', async () => {
    // 1. 詳細APIから返る記事を用意する。
    /** 記事詳細APIの応答 */
    const response = { id: 'article-1', title: '植物と暮らす', is_published: true }
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    // 2. 指定IDの記事詳細を取得する。
    const result = await api.articles.get('article-1')

    // 3. 既存どおりIDを未エンコードで含む公開GETを使い、認証なしで応答を返す。
    expect(mockFetch.mock.calls[0][0]).toBe('/api/articles/article-1')
    expect(mockFetch.mock.calls[0][1]?.method ?? 'GET').toBe('GET')
    expect((mockFetch.mock.calls[0][1]?.headers as Record<string, string> | undefined)?.Authorization).toBeUndefined()
    expect(result).toEqual(response)
  })

  it('FE-API-48: api.articles.create(body) が認証付きPOSTでJSON本文を送り作成結果を返す', async () => {
    // 1. 作成する記事本文と、作成後のAPI応答を用意する。
    /** 記事作成APIへ送る本文 */
    const body = {
      title: '新しい記事',
      content: '{"blocks":[]}',
      image_urls: ['https://example.com/article.jpg'],
      tags: ['植物', '暮らし'],
      product_ids: ['product-1'],
      is_published: false,
      display_order: 2,
    }
    /** APIが作成時に採番して返す記事 */
    const response = { id: 'article-new', ...body, published_at: null, created_at: '2026-10-30T00:00:00Z' }
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    // 2. 管理画面から記事を作成する。
    const result = await api.articles.create(body)

    // 3. 認証付きPOSTとJSON本文、作成結果が維持されることを確かめる。
    expect(mockFetch.mock.calls[0][0]).toBe('/api/articles')
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ method: 'POST', body: JSON.stringify(body) })
    expect((mockFetch.mock.calls[0][1]?.headers as Record<string, string> | undefined)?.Authorization).toBe('Bearer test-token')
    expect(result).toEqual(response)
  })

  it('FE-API-49: api.articles.update(id, body) が認証付きPUTでJSON本文を送り更新結果を返す', async () => {
    // 1. 更新対象ID、送信する記事本文、更新後の応答を用意する。
    /** 記事更新の対象ID */
    const id = 'article-1'
    /** 記事更新APIへ送る本文 */
    const body = {
      title: '更新した記事',
      content: null,
      image_urls: [],
      tags: ['更新'],
      product_ids: [],
      is_published: true,
      display_order: 3,
    }
    /** APIが更新後に返す記事 */
    const response = { id, ...body, published_at: '2026-10-30T00:00:00Z', created_at: '2026-10-29T00:00:00Z' }
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    // 2. 指定した記事を管理画面から更新する。
    const result = await api.articles.update(id, body)

    // 3. IDを未エンコードで含む認証付きPUTとJSON本文、更新結果を確かめる。
    expect(mockFetch.mock.calls[0][0]).toBe('/api/articles/article-1')
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ method: 'PUT', body: JSON.stringify(body) })
    expect((mockFetch.mock.calls[0][1]?.headers as Record<string, string> | undefined)?.Authorization).toBe('Bearer test-token')
    expect(result).toEqual(response)
  })

  it('FE-API-50: api.articles.delete(id) が認証付きDELETEを呼び削除結果を返す', async () => {
    // 1. 削除対象IDと成功応答を用意する。
    /** 記事削除の対象ID */
    const id = 'article-1'
    /** 削除APIの成功応答 */
    const response = { ok: true }
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    // 2. 指定した記事を管理画面から削除する。
    const result = await api.articles.delete(id)

    // 3. IDを未エンコードで含む認証付きDELETEと削除結果を確かめる。
    expect(mockFetch.mock.calls[0][0]).toBe('/api/articles/article-1')
    expect(mockFetch.mock.calls[0][1]?.method).toBe('DELETE')
    expect((mockFetch.mock.calls[0][1]?.headers as Record<string, string> | undefined)?.Authorization).toBe('Bearer test-token')
    expect(result).toEqual(response)
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

describe('api.docs', () => {
  /** 各テストで差し替える設計書APIのfetchモック */
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // 1. 既定では空のJSONを返すfetchモックに差し替える。
    mockFetch = makeMockFetch([])
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    // 2. fetchとモック履歴をテスト間で共有しないように戻す。
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('FE-API-33: api.docs.tree() がGETで設計書ツリーを取得して返す', async () => {
    // 1. 設計書ツリーAPIが返すJSON形式のフォルダー・ファイルデータを用意する。
    /** 設計書ツリーAPIから返るJSON */
    const response = [{
      type: 'dir',
      name: '02_DD',
      path: '02_DD',
      children: [{ type: 'file', name: '仕様.md', path: '02_DD/仕様.md' }],
    }]
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    // 2. 管理画面用の設計書ツリーを取得する。
    const result = await api.docs.tree()

    // 3. ツリーURLへGETし、JSONの内容がそのまま返ることを確かめる。
    expect(mockFetch.mock.calls[0][0]).toBe('/api/docs/tree')
    expect(mockFetch.mock.calls[0][1]?.method ?? 'GET').toBe('GET')
    expect(result).toEqual(response)
  })

  it('FE-API-34: api.docs.content(path) がエンコードしたパスで取得しMarkdownを生テキストで返す', async () => {
    // 1. 日本語・空白・スラッシュを含む相対パスと、JSONではないMarkdown本文を用意する。
    /** 設計書ルートからの相対パス */
    const path = '02_DD/設計 書/仕様.md'
    /** APIから受け取るMarkdown本文 */
    const markdown = '# API仕様\n\n日本語・空白・スラッシュを含む本文です。\n'
    /** JSONパーサーを持たず、text()だけを提供するHTTP成功応答 */
    const response = {
      ok: true,
      text: vi.fn().mockResolvedValue(markdown),
    }
    mockFetch = vi.fn().mockResolvedValue(response)
    vi.stubGlobal('fetch', mockFetch)

    // 2. 指定パスの設計書本文を取得する。
    const result = await api.docs.content(path)

    // 3. パス全体をencodeURIComponentでクエリ化し、JSON変換せず生テキストを返すことを確かめる。
    expect(mockFetch.mock.calls[0][0]).toBe(`/api/docs/content?path=${encodeURIComponent(path)}`)
    expect(mockFetch.mock.calls[0][1]?.method ?? 'GET').toBe('GET')
    expect(response).not.toHaveProperty('json')
    expect(response.text).toHaveBeenCalledTimes(1)
    expect(result).toBe(markdown)
  })
})

describe('api.potArtists', () => {
  /** 各テストで差し替える鉢作家APIのfetchモック */
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // 1. 既定応答を空のJSON配列にしてfetchを差し替える。
    mockFetch = makeMockFetch([])
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    // 2. fetchとモック履歴をテスト間で持ち越さない。
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('FE-API-35: api.potArtists.list() が公開GETで鉢作家一覧を返す', async () => {
    // 1. 公開一覧APIから返る鉢作家配列を用意する。
    /** 公開鉢作家一覧APIのJSON応答 */
    const response = [
      { id: 'artist-1', name: '山田陶房', created_at: '2026-10-01T00:00:00Z' },
      { id: 'artist-2', name: '佐藤窯', created_at: '2026-10-02T00:00:00Z' },
    ]
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    // 2. 公開鉢作家一覧を取得する。
    const result = await api.potArtists.list()

    // 3. 一覧URLをGETし、応答配列を返すことを確かめる。
    expect(mockFetch.mock.calls[0][0]).toBe('/api/pot-artists')
    expect(mockFetch.mock.calls[0][1]?.method ?? 'GET').toBe('GET')
    expect(result).toEqual(response)
  })

  it('FE-API-36: api.potArtists.add(name) が認証POSTで名前を送り追加結果を返す', async () => {
    // 1. 作家名と、登録後にサーバーから返る鉢作家データを用意する。
    /** 管理画面から登録する鉢作家名 */
    const name = '山田陶房'
    /** 登録時にサーバーが採番するIDと日時を含む応答 */
    const response = { id: 'artist-3', name, created_at: '2026-10-30T00:00:00Z' }
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    // 2. 指定した名前で認証付き追加APIを実行する。
    const result = await api.potArtists.add(name)

    // 3. 一覧URLへのPOST本文と追加されたデータが返ることを確かめる。
    expect(mockFetch.mock.calls[0][0]).toBe('/api/pot-artists')
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ method: 'POST', body: JSON.stringify({ name }) })
    expect(result).toEqual(response)
  })

  it('FE-API-37: api.potArtists.delete(id) が未エンコードIDのURLへDELETEして結果を返す', async () => {
    // 1. 削除成功の応答と、URLへの埋め込み方を確認するIDを用意する。
    /** 削除APIの成功応答 */
    const response = { ok: true }
    /** 既存API契約でそのままURLへ使う削除対象ID */
    const id = 'artist/a-1'
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    // 2. 指定した鉢作家を削除する。
    const result = await api.potArtists.delete(id)

    // 3. IDをencodeURIComponentで変換せずURLに埋め、DELETE結果を返すことを確かめる。
    expect(mockFetch.mock.calls[0][0]).toBe(`/api/pot-artists/${id}`)
    expect(mockFetch.mock.calls[0][1]?.method).toBe('DELETE')
    expect(result).toEqual(response)
  })
})

describe('api.priceCalcEntries', () => {
  /** 各テストで差し替える価格計算記録APIのfetchモック */
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // 1. 既定では空のJSON応答を返すfetchに差し替える。
    mockFetch = makeMockFetch([])
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    // 2. fetchとモック履歴を次のテストへ持ち越さない。
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('FE-API-38: api.priceCalcEntries.list() が認証GETで記録一覧を返す', async () => {
    // 1. 価格計算記録一覧APIが返すレコード配列を用意する。
    /** 管理画面へ返る価格計算記録の一覧 */
    const response = [{
      id: 'price-1',
      brand: 'habitat',
      plant_name: 'アガベ チタノタ',
      pot_artist_name: '山田陶房',
      cost: 1500,
      selling_price: 3800,
      mode: 'purchase',
      created_at: '2026-10-30T00:00:00Z',
    }]
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    // 2. 認証が必要な価格計算記録一覧を取得する。
    const result = await api.priceCalcEntries.list()

    // 3. 一覧URLへGETし、サーバーから返った配列をそのまま返すことを確かめる。
    expect(mockFetch.mock.calls[0][0]).toBe('/api/price-calc-entries')
    expect(mockFetch.mock.calls[0][1]?.method ?? 'GET').toBe('GET')
    expect(result).toEqual(response)
  })

  it('FE-API-39: api.priceCalcEntries.add(body) が認証POSTでJSON本文を送り記録を返す', async () => {
    // 1. 登録本文と、サーバーが識別子・登録日時を付けた追加結果を用意する。
    /** 管理画面から価格計算記録APIへ送る値 */
    const body = {
      brand: 'habitat',
      plant_name: 'アガベ チタノタ',
      pot_artist_name: '山田陶房',
      cost: 1500,
      selling_price: 3800,
      mode: 'purchase' as const,
    }
    /** 保存後にAPIから返る価格計算記録 */
    const response = { id: 'price-2', ...body, created_at: '2026-10-30T00:00:00Z' }
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    // 2. 登録本文で管理者向けの追加APIを呼び出す。
    const result = await api.priceCalcEntries.add(body)

    // 3. 一覧URLへのPOST・JSON本文と、登録結果が返ることを確かめる。
    expect(mockFetch.mock.calls[0][0]).toBe('/api/price-calc-entries')
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ method: 'POST', body: JSON.stringify(body) })
    expect(result).toEqual(response)
  })

  it('FE-API-40: api.priceCalcEntries.delete(id) が認証DELETEで対象記録を削除して結果を返す', async () => {
    // 1. 削除成功の応答と、削除対象となる記録IDを用意する。
    /** 削除APIの成功応答 */
    const response = { ok: true }
    /** 削除対象の価格計算記録ID */
    const id = 'price-3'
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    // 2. 指定した価格計算記録を削除する。
    const result = await api.priceCalcEntries.delete(id)

    // 3. IDを含むURLへDELETEし、成功結果を返すことを確かめる。
    expect(mockFetch.mock.calls[0][0]).toBe(`/api/price-calc-entries/${id}`)
    expect(mockFetch.mock.calls[0][1]?.method).toBe('DELETE')
    expect(result).toEqual(response)
  })
})

describe('api.chatQa', () => {
  /** 各テストで差し替えるチャットQ&A APIのfetchモック */
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // 1. 既定応答が空のJSON配列になるようにfetchを差し替える。
    mockFetch = makeMockFetch([])
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    // 2. fetchの差し替えと呼び出し履歴をテストごとに初期化する。
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('FE-API-41: api.chatQa.list() が全件取得用GETでQ&A一覧を返す', async () => {
    // 1. 有効・無効を含む管理画面向けQ&A一覧を用意する。
    /** 全件取得APIから返るQ&Aレコード一覧 */
    const response = [
      { id: 'qa-1', question: '水やりの頻度は？', answer: '土が乾いてから与えます。', sort_order: 1, enabled: true },
      { id: 'qa-2', question: '冬の管理方法は？', answer: '水やりを控えます。', sort_order: 2, enabled: false },
    ]
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    // 2. 管理画面向けの全Q&A一覧を取得する。
    const result = await api.chatQa.list()

    // 3. ?all=true付きのURLへGETし、一覧応答を返すことを確かめる。
    expect(mockFetch.mock.calls[0][0]).toBe('/api/chat-qa?all=true')
    expect(mockFetch.mock.calls[0][1]?.method ?? 'GET').toBe('GET')
    expect(result).toEqual(response)
  })

  it('FE-API-42: api.chatQa.add(body) がPOSTでJSON本文を送りQ&Aを返す', async () => {
    // 1. 管理画面から送るQ&A本文と、サーバーがIDを付けた追加結果を用意する。
    /** 登録するQ&Aの内容 */
    const body = { question: '水やりの頻度は？', answer: '土が乾いてから与えます。', sort_order: 3, enabled: true }
    /** 登録時にAPIが生成する識別子を含む応答 */
    const response = { id: 'qa-3', ...body }
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    // 2. 用意した本文で管理者向けの追加APIを呼び出す。
    const result = await api.chatQa.add(body)

    // 3. Q&A URLへのPOSTとJSON本文、追加結果が返ることを確かめる。
    expect(mockFetch.mock.calls[0][0]).toBe('/api/chat-qa')
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ method: 'POST', body: JSON.stringify(body) })
    expect(result).toEqual(response)
  })

  it('FE-API-43: api.chatQa.update(id, body) がエンコード済みURLへPATCHして更新結果を返す', async () => {
    // 1. URLエンコードが必要なQ&A IDと、更新本文・更新後の応答を用意する。
    /** 日本語・スラッシュ・空白を含む更新対象ID */
    const id = 'Q&A/植物 質問'
    /** 管理画面から送信するQ&A更新内容 */
    const body = { question: '冬の水やりは？', answer: '控えめにします。', sort_order: 4, enabled: false }
    /** 更新後にサーバーから返るQ&Aレコード */
    const response = { id, ...body }
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    // 2. 指定IDのQ&Aを用意した本文で更新する。
    const result = await api.chatQa.update(id, body)

    // 3. IDをencodeURIComponentで符号化したURLへPATCHし、JSON本文と更新結果を確かめる。
    expect(mockFetch.mock.calls[0][0]).toBe(`/api/chat-qa/${encodeURIComponent(id)}`)
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ method: 'PATCH', body: JSON.stringify(body) })
    expect(result).toEqual(response)
  })

  it('FE-API-44: api.chatQa.delete(id) がエンコード済みURLへDELETEして結果を返す', async () => {
    // 1. URLエンコードが必要な削除対象IDと、削除成功の応答を用意する。
    /** 日本語・スラッシュ・空白を含む削除対象ID */
    const id = 'Q&A/植物 質問'
    /** 削除APIが返す成功結果 */
    const response = { ok: true }
    mockFetch = makeMockFetch(response)
    vi.stubGlobal('fetch', mockFetch)

    // 2. 指定IDのQ&Aを削除する。
    const result = await api.chatQa.delete(id)

    // 3. IDをencodeURIComponentで符号化したURLへDELETEし、成功結果を返すことを確かめる。
    expect(mockFetch.mock.calls[0][0]).toBe(`/api/chat-qa/${encodeURIComponent(id)}`)
    expect(mockFetch.mock.calls[0][1]?.method).toBe('DELETE')
    expect(result).toEqual(response)
  })
})

describe('api.chat', () => {
  /** 公開チャットAPIへ送る会話履歴 */
  const messages: ChatSendMessage[] = [
    { role: 'model', content: 'こんにちは。' },
    { role: 'user', content: '植物の育て方を教えてください。' },
  ]

  afterEach(() => {
    // 1. fetch差し替えとモック履歴を次のテストへ持ち越さない。
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('FE-API-51: api.chat.send(messages) が認証なしでno-storeのJSON POSTを行いResponseを返す', async () => {
    // 1. 成功時のResponseを用意し、fetchが同じオブジェクトを返すようにする。
    const response = new Response(JSON.stringify({ reply: '植物は明るい場所を好みます。' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
    const mockFetch = vi.fn().mockResolvedValue(response)
    vi.stubGlobal('fetch', mockFetch)

    // 2. 公開チャットAPIへ会話履歴を送る。
    const result = await api.chat.send(messages)

    // 3. URL・通信設定・本文に認証を付けず、Response自体をそのまま返すことを確かめる。
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch.mock.calls[0][0]).toBe('/api/chat')
    expect(mockFetch.mock.calls[0][1]).toEqual({
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    })
    expect(mockFetch.mock.calls[0][1].headers).not.toHaveProperty('Authorization')
    expect(result).toBe(response)
    expect(result.status).toBe(200)
  })

  it.each([422, 429])('FE-API-52: api.chat.send(messages) はHTTP %iのResponseとstatusを呼出し側へ保つ', async (status) => {
    // 1. 入力チェック・回数制限のHTTP応答を用意する。
    const response = new Response(JSON.stringify({ detail: status === 422 ? [] : 'rate limit' }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
    const mockFetch = vi.fn().mockResolvedValue(response)
    vi.stubGlobal('fetch', mockFetch)

    // 2. エラーstatusの応答でも例外化せずAPI関数を呼び出す。
    const result = await api.chat.send(messages)

    // 3. 呼出し側が status と本文を判別できる同一Responseが返ることを確かめる。
    expect(result).toBe(response)
    expect(result.status).toBe(status)
    expect(await result.json()).toEqual({ detail: status === 422 ? [] : 'rate limit' })
  })
})
