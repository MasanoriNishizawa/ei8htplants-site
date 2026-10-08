import { http, HttpResponse } from 'msw'
import {
  MOCK_EVENTS,
  MOCK_PAST_EVENTS,
  MOCK_FINANCES,
  MOCK_GALLERY,
  MOCK_STOCKISTS,
  MOCK_PRODUCTS,
} from './data'

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

  http.get('/api/events/:id', ({ params }) => {
    const all = [...MOCK_EVENTS, ...MOCK_PAST_EVENTS]
    const event = all.find(e => e.id === params.id || e.slug === params.id)
    if (!event) return new HttpResponse(null, { status: 404 })
    return HttpResponse.json(event)
  }),

  http.get('/api/events/:id/finances', ({ params }) => {
    const fin = MOCK_FINANCES.find(f => f.event_id === params.id)
    if (!fin) return new HttpResponse(null, { status: 404 })
    return HttpResponse.json(fin)
  }),

  http.get('/api/events/:id/sessions', () => {
    return HttpResponse.json([])
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
]
