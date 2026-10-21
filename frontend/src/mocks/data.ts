import type { Event, EventFinances, EventAdminInfo, AdminInfoDashboardItem, GalleryImage, Stockist, Product } from '../lib/api'

type DocTreeNode = { type: 'file' | 'dir'; name: string; path: string; children?: DocTreeNode[] }

export const MOCK_DOC_TREE: DocTreeNode[] = [
  {
    type: 'dir', name: '03_PM', path: '03_PM',
    children: [
      { type: 'file', name: '05_エージェント設計書.md', path: '03_PM/05_エージェント設計書.md' },
    ],
  },
  {
    type: 'dir', name: '04_TEST', path: '04_TEST',
    children: [
      { type: 'file', name: '01_マスターテスト計画書.md', path: '04_TEST/01_マスターテスト計画書.md' },
      { type: 'file', name: '07_テストケース一覧.md', path: '04_TEST/07_テストケース一覧.md' },
    ],
  },
]

export const MOCK_DOC_CONTENTS: Record<string, string> = {
  '03_PM/05_エージェント設計書.md': `# PM-05 — エージェント設計書 (Agent Architecture)

## エージェント一覧

| エージェント | 役割 | ツール |
|---|---|---|
| pm | オーケストレーター | Bash, Read, Write, Edit, TodoWrite, Agent |
| qa | テスト実行・コードレビュー | Bash, Read, Write, Edit, TodoWrite |
| deploy | ビルド・コミット・プッシュ | Bash, Read, TodoWrite |

## qa チェックリスト

\`\`\`bash
cd frontend && npx tsc --noEmit
cd frontend && npx vitest run
cd backend && python -m pytest
cd frontend && npx playwright test
\`\`\`
`,
  '04_TEST/01_マスターテスト計画書.md': `# TEST-01 — マスターテスト計画書

## テストレベル

| テストレベル | ツール | 実行コマンド |
|---|---|---|
| UT / IT | Vitest / pytest | \`npm test\` / \`python -m pytest\` |
| ST | Playwright | \`npm run test:e2e\` |

## 合否基準

1. \`npx tsc --noEmit\` がエラーなし
2. Vitest 全ケース PASS
3. pytest 全ケース PASS
4. Playwright 全ケース PASS
`,
  '04_TEST/07_テストケース一覧.md': `# TEST-07 — テストケース一覧

## フロントエンド テストケース

| テスト ID | ケース | 状態 |
|---|---|---|
| FE-A-01 | fiscalYear: 4月は同年 | PASS |
| FE-D-01 | EventCard: 初期表示 | PASS |

## バックエンド テストケース

| テスト ID | ケース | 状態 |
|---|---|---|
| BE-A-01 | _calc_is_past: 過去の開始日 | PASS |
`,
}

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
    // 写真の左右矢印（前へ・次へ）の位置を画面テストで確かめるため、写真を2枚持たせる
    // 外部に接続しないよう public/img のローカル画像を使う（EventSite は height: auto のため、読み込めないと写真の高さが 0 になる）
    images: [
      { id: 'img-1', url: '/img/habitatOides/habitat_oides_hero.jpg', display_order: 1 },
      { id: 'img-2', url: '/img/habitatOides/habitat_oides_workshop_main.jpg', display_order: 2 },
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
  {
    id: 'mock-no-time',
    slug: null,
    name: 'time 未設定のイベント',
    start_date: '2027-06-01',
    end_date: '2027-06-01',
    time: null,
    location: 'テスト会場',
    booth_number: null,
    address: null,
    official_url: null,
    brands: [],
    has_workshop: false,
    ws_requires_reservation: false,
    is_past: false,
    display_order: 3,
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

/**
 * イベントID → 管理情報のモック。ここにないイベントは未入力（{}）として返す
 * mock-past-1 は出店要項（文章と画像3枚）を持つ。画像は外部に接続しないよう public/img のローカル画像を使う
 */
export const MOCK_ADMIN_INFO: Record<string, EventAdminInfo> = {
  'mock-past-1': {
    guidelines_text: '出店要項モック本文\n搬入は9時までに完了してください。',
    guidelines_image_urls: [
      '/img/logo-ei8htplants.png',
      '/img/logo-habitatoides.png',
      '/img/logo-hue.png',
    ],
  },
}

/**
 * 管理画面ダッシュボード（GET /api/events/admin-info/dashboard）のモック。MOCK_EVENTS・MOCK_PAST_EVENTS のイベントに合わせている
 * - mock-past-1: 終了済みだが出店料が未払いで期限切れ（「出店料の支払い」の先頭に赤で出る）
 * - mock-upcoming-1: 搬入・搬出・ホテル・出店料・期限がすべて入っている
 * - mock-upcoming-2: 出店料だけ入っていて期限が未設定・搬入などは未入力
 * - mock-no-time: 出店料は支払い済み（「出店料の支払い」には出ない）
 * 日付は固定なので、「期限まで何日」「今日から60日以内」の表示を画面テストで確かめるときはブラウザの時計を固定する
 */
export const MOCK_ADMIN_DASHBOARD: AdminInfoDashboardItem[] = [
  {
    event_id: 'mock-past-1',
    name: 'Habitat Exhibition 2026',
    start_date: '2026-09-20',
    end_date: '2026-09-22',
    location: '渋谷ヒカリエ 8F',
    carry_in_time: '2026-09-19T15:00',
    carry_out_time: '2026-09-22T19:00',
    hotel_name: null,
    booth_fee: 50000,
    booth_fee_pay_method: '事前振込',
    booth_fee_due: '2026-09-10',
    booth_fee_paid: false,
  },
  {
    event_id: 'mock-upcoming-1',
    name: 'Green Market 2027',
    start_date: '2027-04-05',
    end_date: '2027-04-06',
    location: '代々木公園 イベント広場',
    carry_in_time: '2027-04-05T08:00',
    carry_out_time: '2027-04-06T18:00',
    hotel_name: 'ホテル代々木',
    booth_fee: 14000,
    booth_fee_pay_method: '事前振込',
    booth_fee_due: '2027-03-20',
    booth_fee_paid: false,
  },
  {
    event_id: 'mock-upcoming-2',
    name: 'HUE POP-UP at Spiral',
    start_date: '2027-05-15',
    end_date: '2027-05-18',
    location: 'スパイラルガーデン',
    carry_in_time: null,
    carry_out_time: null,
    hotel_name: null,
    booth_fee: 30000,
    booth_fee_pay_method: '当日現金',
    booth_fee_due: null,
    booth_fee_paid: false,
  },
  {
    event_id: 'mock-no-time',
    name: 'time 未設定のイベント',
    start_date: '2027-06-01',
    end_date: '2027-06-01',
    location: 'テスト会場',
    carry_in_time: null,
    carry_out_time: null,
    hotel_name: null,
    booth_fee: 10000,
    booth_fee_pay_method: '当日現金',
    booth_fee_due: null,
    booth_fee_paid: true,
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
  // 品切れ商品（stock=0）。shop.spec.ts の在庫切れ表示テスト用
  {
    id: 'p-sold-out',
    name: 'Habitat Style Pot L (Sold Out)',
    description: '品切れテスト用のラージポット',
    price: 9800,
    stock: 0,
    image_urls: ['https://placehold.co/400x400/d0c0b0/ffffff?text=Pot+L'],
    tags: [],
    is_published: true,
    display_order: 3,
    category: null,
    created_at: '2026-01-01T00:00:00Z',
  },
]
