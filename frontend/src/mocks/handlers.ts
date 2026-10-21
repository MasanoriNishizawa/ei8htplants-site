import { http, HttpResponse } from 'msw'
import {
  MOCK_EVENTS,
  MOCK_PAST_EVENTS,
  MOCK_FINANCES,
  MOCK_ADMIN_INFO,
  MOCK_ADMIN_DASHBOARD,
  MOCK_GALLERY,
  MOCK_STOCKISTS,
  MOCK_PRODUCTS,
  MOCK_DOC_TREE,
  MOCK_DOC_CONTENTS,
} from './data'
import type { EventAdminInfo, EventFinances } from '../lib/api'

/**
 * 保存（PUT）された管理情報。イベントID → 管理情報
 * ブラウザのメモリ上だけに持つため、ページを再読み込みすると空に戻る（E2E の各テストに影響しない）
 */
const savedAdminInfo: Record<string, EventAdminInfo> = {}

/**
 * 保存（PUT）された収支。イベントID → 収支
 * 管理情報と同じく、ページを再読み込みすると空に戻る
 */
const savedFinances: Record<string, EventFinances> = {}

/**
 * 保存（PUT）でメモリに持った管理情報・収支を消して、モックデータの初期状態に戻す
 * Vitest ではモジュールがテストファイル単位で共有されるため、テストごとに呼んで影響を残さない
 * @returns なし
 */
export function resetSavedMockData(): void {
  // 1. 管理情報の保存値をすべて消す
  for (const key of Object.keys(savedAdminInfo)) delete savedAdminInfo[key]
  // 2. 収支の保存値をすべて消す
  for (const key of Object.keys(savedFinances)) delete savedFinances[key]
}

export const handlers = [
  // Events
  http.get('/api/events', ({ request }) => {
    const url = new URL(request.url)
    const past = url.searchParams.get('past') === 'true'
    return HttpResponse.json(past ? MOCK_PAST_EVENTS : MOCK_EVENTS)
  }),

  http.get('/api/events/finances', () => {
    return HttpResponse.json(MOCK_FINANCES)
  }),

  // 管理画面ダッシュボード用の管理情報の一覧（出店料の支払い・今後の搬入予定）。
  // /api/events/:id より前に置き、パスの取り違えが起きないようにする
  http.get('/api/events/admin-info/dashboard', () => {
    return HttpResponse.json({ items: MOCK_ADMIN_DASHBOARD })
  }),

  http.get('/api/events/:id', ({ params }) => {
    const all = [...MOCK_EVENTS, ...MOCK_PAST_EVENTS]
    const event = all.find(e => e.id === params.id || e.slug === params.id)
    if (!event) return new HttpResponse(null, { status: 404 })
    return HttpResponse.json(event)
  }),

  // 収支の取得。このページ読み込み中に保存（PUT）した値があればそれを返す
  http.get('/api/events/:id/finances', ({ params }) => {
    const saved = savedFinances[params.id as string]
    if (saved) return HttpResponse.json(saved)
    const fin = MOCK_FINANCES.find(f => f.event_id === params.id)
    if (!fin) return new HttpResponse(null, { status: 404 })
    return HttpResponse.json(fin)
  }),

  // 収支の保存。送られた本文に id・event_id を付けて、メモリ上に保持して返す
  // （管理情報ページの保存時に出店料・宿泊費を同期するため呼ばれる）
  http.put('/api/events/:id/finances', async ({ params, request }) => {
    const id = params.id as string
    // 1. 送られた収支の入力項目を受け取る
    const body = (await request.json()) as Record<string, unknown>
    // 2. 既存の id があれば引き継ぎ、無ければモック用の id を付ける
    const existing = savedFinances[id] ?? MOCK_FINANCES.find(f => f.event_id === id)
    const saved = { ...body, id: existing?.id ?? `fin-${id}`, event_id: id } as unknown as EventFinances
    // 3. メモリに保持し、保存後の内容を返す
    savedFinances[id] = saved
    return HttpResponse.json(saved)
  }),

  http.get('/api/events/:id/sessions', () => {
    return HttpResponse.json([])
  }),

  // 管理情報（搬入時間・ホテル・ブース費用等）の取得・保存
  // mock-past-1 だけ出店要項（文章・画像3枚）を持つ管理情報を返し、ほかのイベントは未入力（{}）を返す
  // このページ読み込み中に保存（PUT）した値があればそれを優先して返す
  http.get('/api/events/:id/admin-info', ({ params }) => {
    const id = params.id as string
    const info = savedAdminInfo[id] ?? MOCK_ADMIN_INFO[id]
    return HttpResponse.json(info ?? {})
  }),

  // 管理情報の保存。送られた本文をメモリ上に保持する（ページを再読み込みすると元に戻る）
  http.put('/api/events/:id/admin-info', async ({ params, request }) => {
    savedAdminInfo[params.id as string] = (await request.json()) as EventAdminInfo
    return HttpResponse.json({ ok: true })
  }),

  // Gallery
  http.get('/api/gallery', ({ request }) => {
    const url = new URL(request.url)
    const brand = url.searchParams.get('brand')
    const data = brand
      ? MOCK_GALLERY.filter(g => g.brand === brand)
      : MOCK_GALLERY
    return HttpResponse.json(data)
  }),

  // Stockists
  http.get('/api/stockists', () => {
    return HttpResponse.json(MOCK_STOCKISTS)
  }),

  // Products
  http.get('/api/products', () => {
    return HttpResponse.json(MOCK_PRODUCTS)
  }),

  http.get('/api/products/:id', ({ params }) => {
    const product = MOCK_PRODUCTS.find(p => p.id === params.id)
    if (!product) return new HttpResponse(null, { status: 404 })
    return HttpResponse.json(product)
  }),

  // Shipping
  http.get('/api/shipping/prefectures', () => {
    return HttpResponse.json(['東京都', '大阪府', '愛知県', '神奈川県', '埼玉県'])
  }),

  http.get('/api/shipping/rate', () => {
    return HttpResponse.json({ fee: 800 })
  }),

  // Contact (no-op)
  http.post('/api/contact', () => {
    return HttpResponse.json({ ok: true })
  }),

  // Reserve (no-op)
  http.post('/api/reserve', () => {
    return HttpResponse.json({ ok: true })
  }),

  // Articles
  http.get('/api/articles', () => {
    return HttpResponse.json([])
  }),

  // Collaborations
  http.get('/api/collaborations', () => {
    return HttpResponse.json([])
  }),

  // Media appearances
  http.get('/api/media-appearances', () => {
    return HttpResponse.json([])
  }),

  // Contacts（管理画面・stats 統計用）
  http.get('/api/contacts', () => {
    return HttpResponse.json([])
  }),

  // Orders（管理画面・stats 統計用）
  http.get('/api/orders', () => {
    return HttpResponse.json([])
  }),

  // Reserves（ワークショップ予約一覧。管理画面 /admin/reservations 用）
  http.get('/api/reserves', () => {
    return HttpResponse.json([])
  }),

  // PriceCalcEntries（価格計算エントリ一覧。/admin/price-calc 用）
  http.get('/api/price-calc-entries', () => {
    return HttpResponse.json([])
  }),

  // PotArtists（鉢アーティスト一覧。/admin/price-calc 用）
  http.get('/api/pot-artists', () => {
    return HttpResponse.json([])
  }),

  // Docs (admin design docs viewer)
  http.get('/api/docs/tree', () => {
    return HttpResponse.json(MOCK_DOC_TREE)
  }),

  http.get('/api/docs/content', ({ request }) => {
    const url = new URL(request.url)
    const path = url.searchParams.get('path') ?? ''
    const content = MOCK_DOC_CONTENTS[path]
    if (!content) return new HttpResponse(null, { status: 404 })
    return new HttpResponse(content, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }),
]
