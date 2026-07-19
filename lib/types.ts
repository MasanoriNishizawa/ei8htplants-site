export type Brand = 'ei8ht plants' | 'Habitat Oides' | 'HUE by ei8ht plants'

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
  brands: Brand[]
  has_workshop: boolean
  ws_requires_reservation: boolean
  is_past: boolean
  display_order: number
  created_at: string
  updated_at: string
  event_images?: EventImage[]
}

export interface EventImage {
  id: string
  event_id: string
  url: string
  display_order: number
}

export interface WorkshopReservation {
  id: string
  event_id: string
  name: string
  email: string
  phone: string | null
  participants: number
  note: string | null
  created_at: string
}

export interface GalleryImage {
  id: string
  url: string
  alt: string | null
  display_order: number
  created_at: string
}

export interface Stockist {
  id: string
  name: string
  area: string | null
  address: string | null
  url: string | null
  display_order: number
}
