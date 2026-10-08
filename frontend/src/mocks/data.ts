import type { Event, EventFinances, GalleryImage, Stockist, Product } from '../lib/api'

export const MOCK_EVENTS: Event[] = [
  {
    id: 'mock-upcoming-1',
    slug: 'green-market-2027',
    name: 'Green Market 2027',
    start_date: '2027-04-05',
    end_date: '2027-04-06',
    time: '10:00〜17:00',
    location: '代々木公園 イベント広場',
    booth_number: 'A-12',
    address: '東京都渋谷区代々木神園町2-1',
    official_url: 'https://example.com/green-market',
    brands: ['ei8ht plants', 'Habitat Oides'],
    has_workshop: true,
    ws_requires_reservation: true,
    is_past: false,
    display_order: 1,
    images: [
      { id: 'img-1', url: 'https://placehold.co/600x800/a8c5a0/ffffff?text=Green+Market', display_order: 1 },
    ],
    page_content: {
      hero: { tagline: '緑とともに過ごす週末', subtitle: '全国から集まるプランツショップ' },
      concept: '植物と暮らしをテーマにした野外マーケット。',
    },
    daily_times: null,
  },
  {
    id: 'mock-upcoming-2',
    slug: null,
    name: 'HUE POP-UP at Spiral',
    start_date: '2027-05-15',
    end_date: '2027-05-18',
    time: '11:00〜20:00',
    location: 'スパイラルガーデン',
    booth_number: null,
    address: '東京都港区南青山5-6-23',
    official_url: null,
    brands: ['HUE by ei8ht plants'],
    has_workshop: false,
    ws_requires_reservation: false,
    is_past: false,
    display_order: 2,
    images: [],
    page_content: null,
    daily_times: null,
  },
]

export const MOCK_PAST_EVENTS: Event[] = [
  {
    id: 'mock-past-1',
    slug: 'habitat-2026',
    name: 'Habitat Exhibition 2026',
    start_date: '2026-09-20',
    end_date: '2026-09-22',
    time: '10:00〜18:00',
    location: '渋谷ヒカリエ 8F',
    booth_number: null,
    address: '東京都渋谷区渋谷2-21-1',
    official_url: null,
    brands: ['Habitat Oides'],
    has_workshop: true,
    ws_requires_reservation: true,
    is_past: true,
    display_order: 0,
    images: [
      { id: 'img-past-1', url: 'https://placehold.co/600x800/8fb8c4/ffffff?text=Habitat+2026', display_order: 1 },
    ],
    page_content: {
      archive: { enabled: true, title: 'アーカイブ', message: 'ご来場ありがとうございました。' },
    },
    daily_times: null,
  },
]

export const MOCK_FINANCES: EventFinances[] = [
  {
    id: 'fin-1',
    event_id: 'mock-past-1',
    sales: 320000,
    booth_fee: 50000,
    distance: 20,
    gas_price: 170,
    expressway_toll: 3000,
    accommodation: 0,
    ws_participants: 8,
    payment_flag: true,
    ws_payment_done: false,
    other_expenses: 5000,
    other_expenses_note: '消耗品',
    notes: null,
    updated_at: '2026-09-25T10:00:00Z',
  },
]

export const MOCK_GALLERY: GalleryImage[] = [
  { id: 'g-1', url: 'https://placehold.co/400x500/c8d8c4/ffffff?text=Gallery+1', alt: '植物 1', brand: 'ei8ht plants', display_order: 1 },
  { id: 'g-2', url: 'https://placehold.co/400x500/d4c8b8/ffffff?text=Gallery+2', alt: '植物 2', brand: 'Habitat Oides', display_order: 2 },
  { id: 'g-3', url: 'https://placehold.co/400x500/b8ccd4/ffffff?text=Gallery+3', alt: '植物 3', brand: 'HUE by ei8ht plants', display_order: 3 },
]

export const MOCK_STOCKISTS: Stockist[] = [
  { id: 's-1', name: 'Botany Tokyo', area: '東京', address: '東京都目黒区中目黒1-2-3', url: 'https://example.com', brands: ['ei8ht plants'] },
  { id: 's-2', name: 'Green Shop Osaka', area: '大阪', address: '大阪府大阪市中央区1-1-1', url: null, brands: ['Habitat Oides', 'ei8ht plants'] },
]

export const MOCK_PRODUCTS: Product[] = [
  {
    id: 'p-1',
    name: 'Habitat Style Pot S',
    description: 'ハビタットスタイルのミニポット',
    price: 3800,
    stock: 5,
    image_urls: ['https://placehold.co/400x400/d8cfc4/ffffff?text=Pot+S'],
    tags: [],
    is_published: true,
    display_order: 1,
    category: null,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'p-2',
    name: 'Habitat Style Pot M',
    description: 'ハビタットスタイルのミディアムポット',
    price: 6800,
    stock: 3,
    image_urls: ['https://placehold.co/400x400/c4cfd8/ffffff?text=Pot+M'],
    tags: [],
    is_published: true,
    display_order: 2,
    category: null,
    created_at: '2026-01-01T00:00:00Z',
  },
]
