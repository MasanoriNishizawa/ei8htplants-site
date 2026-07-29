import { supabase } from './supabase'

const BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const { headers: optHeaders, ...restOptions } = options ?? {}
  const res = await fetch(`${BASE}${path}`, {
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...optHeaders },
    ...restOptions,
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

async function authRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const { data } = await (supabase?.auth.getSession() ?? Promise.resolve({ data: { session: null } }))
  const token = data.session?.access_token
  if (!token) throw new Error('401 Unauthorized')
  return request<T>(path, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options?.headers },
  })
}

export const api = {
  stats: async (): Promise<{ unreadContacts: number; pendingReservations: number; activeEvents: number }> => {
    const [contacts, reservations, events] = await Promise.all([
      authRequest<ContactRecord[]>('/contacts'),
      authRequest<Reservation[]>('/reserves'),
      request<Event[]>('/events?past=false'),
    ])
    return {
      unreadContacts: contacts.filter((c) => !c.is_read).length,
      pendingReservations: reservations.filter((r) => r.status === 'pending').length,
      activeEvents: events.length,
    }
  },
  upload: async (file: File): Promise<string> => {
    const { data } = await (supabase?.auth.getSession() ?? Promise.resolve({ data: { session: null } }))
    const token = data.session?.access_token
    if (!token) throw new Error('401 Unauthorized')
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`${BASE}/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail ?? `${res.status} ${res.statusText}`)
    }
    const { url } = await res.json()
    return url
  },
  events: {
    list: (past = false) => request<Event[]>(`/events?past=${past}`),
    get: (id: string) => request<Event>(`/events/${id}`),
    create: (body: EventBody) =>
      authRequest<Event>('/events', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: EventBody) =>
      authRequest<Event>(`/events/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id: string) =>
      authRequest<{ ok: boolean }>(`/events/${id}`, { method: 'DELETE' }),
    getFinances: (id: string) =>
      authRequest<EventFinances>(`/events/${id}/finances`),
    saveFinances: (id: string, body: EventFinancesBody) =>
      authRequest<EventFinances>(`/events/${id}/finances`, { method: 'PUT', body: JSON.stringify(body) }),
    getAllFinances: () =>
      authRequest<EventFinances[]>('/events/finances'),
    getSessions: (id: string) =>
      request<WsSession[]>(`/events/${id}/sessions`),
    saveSessions: (id: string, sessions: { time_label: string; max_participants: number }[]) =>
      authRequest<WsSession[]>(`/events/${id}/sessions`, { method: 'PUT', body: JSON.stringify({ sessions }) }),
    savePageContent: (id: string, page_content: PageContent) =>
      authRequest<Event>(`/events/${id}/page`, { method: 'PATCH', body: JSON.stringify({ page_content }) }),
  },
  gallery: {
    list: (brand?: string) =>
      request<GalleryImage[]>(brand ? `/gallery?brand=${encodeURIComponent(brand)}` : '/gallery'),
    add: (body: GalleryBody) =>
      authRequest<GalleryImage>('/gallery', { method: 'POST', body: JSON.stringify(body) }),
    updateOrder: (id: string, display_order: number) =>
      authRequest<GalleryImage>(`/gallery/${id}`, { method: 'PATCH', body: JSON.stringify({ display_order }) }),
    delete: (id: string) =>
      authRequest<{ ok: boolean }>(`/gallery/${id}`, { method: 'DELETE' }),
  },
  stockists: {
    list: () => request<Stockist[]>('/stockists'),
    add: (body: StockistBody) =>
      authRequest<Stockist>('/stockists', { method: 'POST', body: JSON.stringify(body) }),
    patch: (id: string, body: StockistBody) =>
      authRequest<Stockist>(`/stockists/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: string) =>
      authRequest<{ ok: boolean }>(`/stockists/${id}`, { method: 'DELETE' }),
  },
  contact: {
    send: (body: ContactPayload) =>
      request('/contact', { method: 'POST', body: JSON.stringify(body) }),
    list: () => authRequest<ContactRecord[]>('/contacts'),
    markRead: (id: string, is_read: boolean) =>
      authRequest<ContactRecord>(`/contacts/${id}`, { method: 'PATCH', body: JSON.stringify({ is_read }) }),
    reply: (id: string, subject: string, body: string) =>
      authRequest<{ ok: boolean }>(`/contacts/${id}/reply`, { method: 'POST', body: JSON.stringify({ subject, body }) }),
  },
  reserve: {
    create: (body: ReservationPayload) =>
      request('/reserve', { method: 'POST', body: JSON.stringify(body) }),
    list: (eventId?: string) =>
      authRequest<Reservation[]>(eventId ? `/reserves?event_id=${eventId}` : '/reserves'),
    updateStatus: (id: string, status: string) =>
      authRequest<Reservation>(`/reserves/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    // 認証不要。ステータスコードで結果を判定するため Response をそのまま返す
    cancel: (token: string) =>
      fetch(`${BASE}/reserve/cancel`, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }),
  },
  products: {
    list: (all = false) => request<Product[]>(`/products${all ? '?all=true' : ''}`),
    get: (id: string) => request<Product>(`/products/${id}`),
    create: (body: ProductBody) =>
      authRequest<Product>('/products', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: ProductBody) =>
      authRequest<Product>(`/products/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id: string) =>
      authRequest<{ ok: boolean }>(`/products/${id}`, { method: 'DELETE' }),
    updateStock: (id: string, stock: number) =>
      authRequest<Product>(`/products/${id}/stock`, { method: 'PATCH', body: JSON.stringify({ stock }) }),
  },
  shipping: {
    getRate: (prefecture: string) =>
      request<{ fee: number }>(`/shipping/rate?prefecture=${encodeURIComponent(prefecture)}`),
    getPrefectures: () => request<string[]>('/shipping/prefectures'),
  },
  orders: {
    create: (body: OrderPayload) =>
      request<{ order_id: string }>('/orders', { method: 'POST', body: JSON.stringify(body) }),
    list: () => authRequest<Order[]>('/orders'),
    get: (id: string) => authRequest<OrderDetail>(`/orders/${id}`),
    updateStatus: (id: string, status: string) =>
      authRequest<Order>(`/orders/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  },
  collaborations: {
    list: () => request<Collaboration[]>('/collaborations'),
    add: (body: CollaborationPayload) =>
      authRequest<Collaboration>('/collaborations', { method: 'POST', body: JSON.stringify(body) }),
    delete: (id: string) =>
      authRequest<{ ok: boolean }>(`/collaborations/${id}`, { method: 'DELETE' }),
  },
}

export interface PageContent {
  hero?: {
    image_url?: string
    tagline?: string
    subtitle?: string
  }
  venue?: {
    address?: string
    access?: string
    map_url?: string
  }
  concept?: string
  lineup?: Array<{
    title: string
    description?: string
    image_url?: string
  }>
  workshop?: {
    title?: string
    description?: string
    note?: string
  } | null
  guests?: Array<{
    name: string
    role?: string
    bio?: string
    image_url?: string
    instagram_url?: string
  }>
  archive?: {
    enabled: boolean
    title?: string
    message?: string
    gallery?: string[]
  }
}

export interface Event {
  id: string
  name: string
  start_date: string
  end_date: string | null
  time: string | null
  location: string
  booth_number: string | null
  address: string | null
  official_url: string | null
  brands: string[]
  has_workshop: boolean
  ws_requires_reservation: boolean
  is_past: boolean
  display_order: number
  images: { id: string; url: string; display_order: number }[]
  page_content: PageContent | null
  daily_times: Record<string, string> | null
}

export interface EventBody {
  name: string
  start_date: string
  end_date?: string
  time?: string
  location: string
  booth_number?: string
  address?: string
  official_url?: string
  brands: string[]
  has_workshop: boolean
  ws_requires_reservation: boolean
  daily_times?: Record<string, string> | null
  image_urls: string[]
}

export interface GalleryImage {
  id: string
  url: string
  alt: string | null
  brand: string | null
  display_order: number
}

export interface GalleryBody {
  url: string
  alt?: string | null
  brand?: string | null
}

export interface Stockist {
  id: string
  name: string
  area: string | null
  address: string | null
  url: string | null
  brands: string[]
}

export interface StockistBody {
  name: string
  area?: string | null
  address?: string | null
  url?: string | null
  brands?: string[]
}

export interface ContactPayload {
  name: string
  email: string
  message: string
}

export interface ContactRecord {
  id: string
  name: string
  email: string
  message: string
  is_read: boolean
  created_at: string
}

export interface ReservationPayload {
  event_id: string
  name: string
  email: string
  phone?: string
  participants: number
  note?: string
  session_id?: string
  bring_plant: boolean
  bring_pot: boolean
  preferred_date?: string
  preferred_time?: string
}

export interface Reservation {
  id: string
  event_id: string
  name: string
  email: string
  phone: string | null
  participants: number
  note: string | null
  status: string
  session_id: string | null
  bring_plant: boolean
  bring_pot: boolean
  preferred_date: string | null
  preferred_time: string | null
  created_at: string
}

export interface WsSession {
  id: string
  event_id: string
  time_label: string
  max_participants: number
  reserved_count: number
  display_order: number
}

export interface Collaboration {
  id: string
  title: string
  partner_name: string | null
  description: string | null
  video_url: string | null
  image_url: string | null
  event_date: string | null
  display_order: number
  created_at: string
}

export interface CollaborationPayload {
  title: string
  partner_name?: string
  description?: string
  video_url?: string
  image_url?: string
  event_date?: string
}

export interface EventFinances {
  id?: string
  event_id: string
  sales: number
  booth_fee: number
  distance: number
  gas_price: number
  expressway_toll: number
  accommodation: number
  ws_participants: number
  payment_flag: boolean
  other_expenses: number
  other_expenses_note: string | null
  notes: string | null
  updated_at?: string
}

export type EventFinancesBody = Omit<EventFinances, 'id' | 'event_id' | 'updated_at'>

export interface Product {
  id: string
  name: string
  description: string | null
  price: number
  stock: number
  image_urls: string[]
  is_published: boolean
  display_order: number
  created_at: string
}

export interface ProductBody {
  name: string
  description?: string | null
  price: number
  stock: number
  image_urls: string[]
  is_published: boolean
  display_order: number
}

export interface OrderPayload {
  customer_name: string
  customer_email: string
  customer_phone?: string
  postal_code: string
  prefecture: string
  city: string
  address_line1: string
  address_line2?: string
  note?: string
  items: { product_id: string; quantity: number }[]
  source_id: string
}

export interface Order {
  id: string
  customer_name: string
  customer_email: string
  customer_phone: string | null
  postal_code: string
  prefecture: string
  city: string
  address_line1: string
  address_line2: string | null
  note: string | null
  subtotal: number
  shipping_fee: number
  total: number
  status: string
  square_payment_id: string | null
  created_at: string
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string | null
  product_name: string
  price: number
  quantity: number
}

export type OrderDetail = Order & { items: OrderItem[] }

export function computeFinances(fin: EventFinances, hasWorkshop: boolean): {
  transport: number
  wsSales: number
  totalExpense: number
  net: number
  salesShare: number
  wsShare: number
} {
  const transport = Math.round((fin.distance * 2 / 10) * fin.gas_price)
  const totalExpense = fin.booth_fee + transport + fin.expressway_toll + fin.accommodation + fin.other_expenses

  if (hasWorkshop && fin.payment_flag) {
    // WS開催 + 手伝いあり: max(0, 売上 - 各支出) × 20% + WS売上 × 70%
    const wsSales = fin.ws_participants * 1000
    const salesShare = Math.round(Math.max(0, fin.sales - totalExpense) * 0.2)
    const wsShare = Math.round(wsSales * 0.7)
    return { transport, wsSales, totalExpense, net: salesShare + wsShare, salesShare, wsShare }
  }

  // WS非開催、またはWS開催でも手伝いなし: 売上 - 各支出
  const wsSales = hasWorkshop ? fin.ws_participants * 1000 : 0
  return { transport, wsSales, totalExpense, net: fin.sales - totalExpense, salesShare: 0, wsShare: 0 }
}
