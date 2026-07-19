const BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

export const api = {
  events: {
    list: (past = false) => request<Event[]>(`/events?past=${past}`),
    get: (id: string) => request<Event>(`/events/${id}`),
  },
  gallery: {
    list: () => request<GalleryImage[]>('/gallery'),
  },
  stockists: {
    list: () => request<Stockist[]>('/stockists'),
  },
  contact: {
    send: (body: ContactPayload) =>
      request('/contact', { method: 'POST', body: JSON.stringify(body) }),
  },
  reserve: {
    create: (body: ReservationPayload) =>
      request('/reserve', { method: 'POST', body: JSON.stringify(body) }),
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

export interface GalleryImage {
  id: string
  url: string
  alt: string | null
  display_order: number
}

export interface Stockist {
  id: string
  name: string
  area: string | null
  address: string | null
  url: string | null
}

export interface ContactPayload {
  name: string
  email: string
  message: string
}

export interface ReservationPayload {
  event_id: string
  name: string
  email: string
  phone?: string
  participants: number
  note?: string
}
