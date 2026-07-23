import { supabase } from './supabase'

const BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
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
    list: () => authRequest<Reservation[]>('/reserves'),
    updateStatus: (id: string, status: string) =>
      authRequest<Reservation>(`/reserves/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  },
  collaborations: {
    list: () => request<Collaboration[]>('/collaborations'),
    add: (body: CollaborationPayload) =>
      authRequest<Collaboration>('/collaborations', { method: 'POST', body: JSON.stringify(body) }),
    delete: (id: string) =>
      authRequest<{ ok: boolean }>(`/collaborations/${id}`, { method: 'DELETE' }),
  },
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
  is_past: boolean
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
  created_at: string
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
