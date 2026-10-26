// MSW のモックの API。/api/〜 への通信を受けて data.ts の固定データを返す（本物のバックエンドにはつながない）。
// ブラウザ用（browser.ts）と Vitest 用（node.ts）で同じハンドラを使う
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
import type {
  Article,
  ArticleBody,
  ChatLog,
  ChatQA,
  ChatQABody,
  Collaboration,
  CollaborationPayload,
  Event,
  EventAdminInfo,
  EventBody,
  EventFinances,
  GalleryBody,
  GalleryImage,
  MediaAppearance,
  MediaAppearanceBody,
  PageContent,
  PotArtist,
  PriceCalcEntry,
  PriceCalcEntryBody,
  Product,
  ProductBody,
  Reservation,
  Stockist,
  StockistBody,
  WsSession,
} from '../lib/api'

/**
 * 保存（PUT）された管理情報。イベントID → 管理情報
 * ブラウザのメモリ上だけに持つため、ページを再読み込みすると空に戻る（E2E の各テストに影響しない）
 */
const savedAdminInfo: Record<string, EventAdminInfo> = {}

/** サイト画像の管理用モック（Storage のアップロードと同様、ブラウザのメモリだけに保持） */
const hueColorStudyImages = Array(6).fill('') as string[]

/**
 * 保存（PUT）された収支。イベントID → 収支
 * 管理情報と同じく、ページを再読み込みすると空に戻る
 */
const savedFinances: Record<string, EventFinances> = {}

/**
 * 収支が未登録のイベントで返す既定値。本番（backend/app/routes/events.py の FinanceBody の既定値）と同じ。
 * ガソリン単価の既定値も本番の DEFAULT_GAS_PRICE（170 円/L）にそろえる
 */
const FINANCE_DEFAULTS: Omit<EventFinances, 'id' | 'event_id' | 'updated_at'> = {
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

/**
 * 管理画面の書き込み（追加・更新・削除）を受けてメモリに持つデータ。
 * ブラウザでは再読み込みで、Vitest では resetSavedMockData で初期状態（data.ts の固定データ）に戻る
 */
const store = {
  /** 管理画面で作成したイベント（固定データの後ろに足して返す） */
  createdEvents: [] as Event[],
  /** 固定データのイベントを更新した内容。イベントID → 更新後のイベント */
  updatedEvents: {} as Record<string, Event>,
  /** 削除したイベントの ID */
  deletedEventIds: [] as string[],
  /** 保存した WS の時間枠。イベントID → 時間枠（未保存のイベントは空） */
  sessions: {} as Record<string, WsSession[]>,
  /** 当日参加などで追加した予約 */
  reservations: [] as Reservation[],
  /** 商品（固定データの写し） */
  products: [...MOCK_PRODUCTS] as Product[],
  /** 取扱店（固定データの写し） */
  stockists: [...MOCK_STOCKISTS] as Stockist[],
  /** ギャラリー（固定データの写し） */
  gallery: [...MOCK_GALLERY] as GalleryImage[],
  /** ジャーナルの記事 */
  articles: [] as Article[],
  /** コラボレーション */
  collaborations: [] as Collaboration[],
  /** メディア出演 */
  media: [] as MediaAppearance[],
  /** 鉢の作家 */
  potArtists: [] as PotArtist[],
  /** 価格計算の記録 */
  priceCalc: [] as PriceCalcEntry[],
  /** AI チャットの Q&A */
  chatQa: [] as ChatQA[],
}

/** モックで作る ID の通し番号（同じ ID が重ならないようにする） */
let mockSeq = 0

/**
 * モックの ID を作る
 * @param prefix - 種類を見分ける頭の文字（例: 'article'）
 * @returns 「頭の文字-通し番号」の ID
 */
function newMockId(prefix: string): string {
  mockSeq += 1
  return `mock-${prefix}-${mockSeq}`
}

/** 今の日時（ISO 形式。created_at などに入れる） */
const nowIso = () => new Date().toISOString()

/** 本番の 404 と同じ形（FastAPI の { detail }）の応答 */
const notFound = () => HttpResponse.json({ detail: 'Not Found' }, { status: 404 })

/**
 * 固定データ・作成・更新・削除を合わせた、今のイベントの一覧
 * @returns 開催前と終了済みを合わせたイベント
 */
function allEvents(): Event[] {
  return [...MOCK_EVENTS, ...MOCK_PAST_EVENTS, ...store.createdEvents]
    .filter((e) => !store.deletedEventIds.includes(e.id))
    .map((e) => store.updatedEvents[e.id] ?? e)
}

/**
 * 送られたイベントの入力から、API が返すイベントの形を作る（本番の get_event の応答に合わせる）
 * @param id - イベントの ID
 * @param body - 送られた入力
 * @param base - 更新のときは元のイベント（ページの中身・表示順などを引き継ぐ）
 * @returns イベント
 */
function toMockEvent(id: string, body: EventBody, base?: Event): Event {
  return {
    id,
    slug: body.slug ?? null,
    name: body.name,
    start_date: body.start_date,
    end_date: body.end_date || null,
    time: body.time || null,
    location: body.location,
    booth_number: body.booth_number || null,
    address: body.address || null,
    official_url: body.official_url || null,
    brands: body.brands,
    has_workshop: body.has_workshop,
    ws_requires_reservation: body.ws_requires_reservation,
    is_past: base?.is_past ?? false,
    display_order: base?.display_order ?? 0,
    images: body.image_urls.map((url, i) => ({ id: `${id}-img-${i}`, url, display_order: i })),
    page_content: base?.page_content ?? null,
    daily_times: body.daily_times ?? null,
  }
}

/**
 * イベントを更新した内容を保存する（固定データのイベントは updatedEvents、作成したイベントは createdEvents を書き換える）
 * @param ev - 更新後のイベント
 */
function saveMockEvent(ev: Event): void {
  const idx = store.createdEvents.findIndex((e) => e.id === ev.id)
  if (idx >= 0) store.createdEvents[idx] = ev
  else store.updatedEvents[ev.id] = ev
}

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
  // 3. 管理画面の書き込みで持ったデータを、固定データの初期状態に戻す
  store.createdEvents = []
  store.updatedEvents = {}
  store.deletedEventIds = []
  store.sessions = {}
  store.reservations = []
  store.products = [...MOCK_PRODUCTS]
  store.stockists = [...MOCK_STOCKISTS]
  store.gallery = [...MOCK_GALLERY]
  store.articles = []
  store.collaborations = []
  store.media = []
  store.potArtists = []
  store.priceCalc = []
  store.chatQa = []
}

/** モックの API の一覧。上から順に URL を照らし合わせるので、具体的なパスを :id より前に置く */
export const handlers = [
  // イベントの一覧。?past=true なら終了したイベントを返す
  http.get('/api/events', ({ request }) => {
    const url = new URL(request.url)
    // 終了したイベントを求められているか
    const past = url.searchParams.get('past') === 'true'
    // 固定データ（作成・更新・削除を反映）を、終了済みかどうかで分ける
    return HttpResponse.json(allEvents().filter((e) => e.is_past === past))
  }),

  // 全イベントの収支の一覧（管理画面の「収支」用）
  http.get('/api/events/finances', () => {
    return HttpResponse.json(MOCK_FINANCES)
  }),

  // 管理画面ダッシュボード用の管理情報の一覧（出店料の支払い・今後の搬入予定）。
  // /api/events/:id より前に置き、パスの取り違えが起きないようにする
  http.get('/api/events/admin-info/dashboard', () => {
    return HttpResponse.json({ items: MOCK_ADMIN_DASHBOARD })
  }),

  // イベント 1 件。id でも slug でも引ける（イベントページの URL は slug のことがある）。無ければ 404
  http.get('/api/events/:id', ({ params }) => {
    // 開催前と終了済みのイベント（作成・更新・削除を反映）をまとめて探す
    const event = allEvents().find(e => e.id === params.id || e.slug === params.id)
    if (!event) return new HttpResponse(null, { status: 404 })
    return HttpResponse.json(event)
  }),

  // イベントの作成（本番と同じく、作成したイベントを返す）
  http.post('/api/events', async ({ request }) => {
    const body = (await request.json()) as EventBody
    /** 作成したイベント（表示順は末尾） */
    const created = { ...toMockEvent(newMockId('event'), body), display_order: allEvents().length }
    store.createdEvents.push(created)
    return HttpResponse.json(created)
  }),

  // イベントの更新（無ければ 404。更新後のイベントを返す）
  http.put('/api/events/:id', async ({ params, request }) => {
    const base = allEvents().find((e) => e.id === params.id)
    if (!base) return notFound()
    const updated = toMockEvent(base.id, (await request.json()) as EventBody, base)
    saveMockEvent(updated)
    return HttpResponse.json(updated)
  }),

  // イベントの削除（無ければ 404）
  http.delete('/api/events/:id', ({ params }) => {
    const id = params.id as string
    if (!allEvents().some((e) => e.id === id)) return notFound()
    store.deletedEventIds.push(id)
    return HttpResponse.json({ ok: true })
  }),

  // イベントページの中身の保存（PATCH /page。本番と同じく保存後のイベントを返す）
  http.patch('/api/events/:id/page', async ({ params, request }) => {
    const base = allEvents().find((e) => e.id === params.id)
    if (!base) return notFound()
    const { page_content } = (await request.json()) as { page_content: PageContent }
    const updated: Event = { ...base, page_content }
    saveMockEvent(updated)
    return HttpResponse.json(updated)
  }),

  // 収支の取得。このページ読み込み中に保存（PUT）した値があればそれを返す
  http.get('/api/events/:id/finances', ({ params }) => {
    const saved = savedFinances[params.id as string]
    if (saved) return HttpResponse.json(saved)
    const fin = MOCK_FINANCES.find(f => f.event_id === params.id)
    // 未登録なら本番（events.py の get_finances）と同じく、既定値に event_id を付けて返す
    if (!fin) return HttpResponse.json({ event_id: params.id as string, ...FINANCE_DEFAULTS })
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

  // WS の時間枠（保存した枠があれば返す。無ければ空）
  http.get('/api/events/:id/sessions', ({ params }) => {
    return HttpResponse.json(store.sessions[params.id as string] ?? [])
  }),

  // WS の時間枠の保存（本番と同じく、保存後の枠の一覧を返す。id の無い行には新しい id を付ける）
  http.put('/api/events/:id/sessions', async ({ params, request }) => {
    const id = params.id as string
    if (!allEvents().some((e) => e.id === id)) return notFound()
    const { sessions } = (await request.json()) as { sessions: { id?: string; time_label: string; max_participants: number }[] }
    /** 保存後の時間枠（予約済みの人数は 0 から） */
    const saved: WsSession[] = sessions.map((s, i) => ({
      id: s.id ?? newMockId('session'),
      event_id: id,
      time_label: s.time_label,
      max_participants: s.max_participants,
      reserved_count: 0,
      display_order: i,
    }))
    store.sessions[id] = saved
    return HttpResponse.json(saved)
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

  // 公開ギャラリー。?brand= があれば、そのブランドの値と完全に一致する写真だけを返す
  http.get('/api/gallery', ({ request }) => {
    const url = new URL(request.url)
    // 絞り込むブランドの値（無ければ全部）
    const brand = url.searchParams.get('brand')
    const data = brand
      ? store.gallery.filter(g => g.brand === brand)
      : store.gallery
    return HttpResponse.json(data)
  }),

  // ギャラリーの写真の追加（本番と同じく、追加した行を返す。表示順は末尾）
  http.post('/api/gallery', async ({ request }) => {
    const body = (await request.json()) as GalleryBody
    const created: GalleryImage = { id: newMockId('gallery'), url: body.url, alt: body.alt ?? null, brand: body.brand ?? null, display_order: store.gallery.length + 1 }
    store.gallery.push(created)
    return HttpResponse.json(created)
  }),

  // ギャラリーの表示順の変更（無ければ 404）
  http.patch('/api/gallery/:id', async ({ params, request }) => {
    const idx = store.gallery.findIndex((g) => g.id === params.id)
    if (idx < 0) return notFound()
    const { display_order } = (await request.json()) as { display_order: number }
    store.gallery[idx] = { ...store.gallery[idx], display_order }
    return HttpResponse.json(store.gallery[idx])
  }),

  // ギャラリーの写真の削除
  http.delete('/api/gallery/:id', ({ params }) => {
    store.gallery = store.gallery.filter((g) => g.id !== params.id)
    return HttpResponse.json({ ok: true })
  }),

  // 取扱店の一覧
  http.get('/api/stockists', () => {
    return HttpResponse.json(store.stockists)
  }),

  // 取扱店の追加（追加した行を返す）
  http.post('/api/stockists', async ({ request }) => {
    const body = (await request.json()) as StockistBody
    const created: Stockist = { id: newMockId('stockist'), name: body.name, area: body.area ?? null, address: body.address ?? null, url: body.url ?? null, brands: body.brands ?? [] }
    store.stockists.push(created)
    return HttpResponse.json(created)
  }),

  // 取扱店の更新（無ければ 404。更新後の行を返す）
  http.patch('/api/stockists/:id', async ({ params, request }) => {
    const idx = store.stockists.findIndex((x) => x.id === params.id)
    if (idx < 0) return notFound()
    const body = (await request.json()) as StockistBody
    store.stockists[idx] = { ...store.stockists[idx], ...body, brands: body.brands ?? store.stockists[idx].brands }
    return HttpResponse.json(store.stockists[idx])
  }),

  // 取扱店の削除
  http.delete('/api/stockists/:id', ({ params }) => {
    store.stockists = store.stockists.filter((x) => x.id !== params.id)
    return HttpResponse.json({ ok: true })
  }),

  // 商品の一覧（モックでは ?all=true の有無にかかわらず全件）
  http.get('/api/products', () => {
    return HttpResponse.json(store.products)
  }),

  // 商品 1 件（無ければ 404）
  http.get('/api/products/:id', ({ params }) => {
    const product = store.products.find(p => p.id === params.id)
    if (!product) return new HttpResponse(null, { status: 404 })
    return HttpResponse.json(product)
  }),

  // 商品の作成（作成した行を返す）
  http.post('/api/products', async ({ request }) => {
    const body = (await request.json()) as ProductBody
    const created: Product = { ...body, id: newMockId('product'), description: body.description ?? null, created_at: nowIso() }
    store.products.push(created)
    return HttpResponse.json(created)
  }),

  // 商品の更新（無ければ 404。更新後の行を返す）
  http.put('/api/products/:id', async ({ params, request }) => {
    const idx = store.products.findIndex((p) => p.id === params.id)
    if (idx < 0) return notFound()
    const body = (await request.json()) as ProductBody
    store.products[idx] = { ...store.products[idx], ...body, description: body.description ?? null }
    return HttpResponse.json(store.products[idx])
  }),

  // 商品の削除
  http.delete('/api/products/:id', ({ params }) => {
    store.products = store.products.filter((p) => p.id !== params.id)
    return HttpResponse.json({ ok: true })
  }),

  // 商品の在庫の変更（無ければ 404。更新後の行を返す）
  http.patch('/api/products/:id/stock', async ({ params, request }) => {
    const idx = store.products.findIndex((p) => p.id === params.id)
    if (idx < 0) return notFound()
    const { stock } = (await request.json()) as { stock: number }
    store.products[idx] = { ...store.products[idx], stock }
    return HttpResponse.json(store.products[idx])
  }),

  // 送料: 選べる都道府県の一覧
  http.get('/api/shipping/prefectures', () => {
    return HttpResponse.json(['東京都', '大阪府', '愛知県', '神奈川県', '埼玉県'])
  }),

  // 送料: 都道府県ごとの送料（モックではどこでも 800 円）
  http.get('/api/shipping/rate', () => {
    return HttpResponse.json({ fee: 800 })
  }),

  // お問い合わせの送信（何もせず成功を返す）
  http.post('/api/contact', () => {
    return HttpResponse.json({ ok: true })
  }),

  // WS 予約の送信（何もせず成功を返す）
  http.post('/api/reserve', () => {
    return HttpResponse.json({ ok: true })
  }),

  // 予約のキャンセル（メールのキャンセル ID。モックではいつも成功）
  http.post('/api/reserve/cancel', () => {
    return HttpResponse.json({ ok: true })
  }),

  // 当日参加の予約の登録（管理画面。本番と同じく、作成した予約の行を返す）
  http.post('/api/reserve/walkin', async ({ request }) => {
    const body = (await request.json()) as { event_id: string; participants: number; session_id?: string; preferred_time?: string; preferred_date?: string }
    const created: Reservation = {
      id: newMockId('reservation'),
      event_id: body.event_id,
      name: '当日参加',
      email: '',
      phone: null,
      participants: body.participants,
      note: null,
      status: 'confirmed',
      session_id: body.session_id ?? null,
      bring_plant: false,
      bring_pot: false,
      preferred_date: body.preferred_date ?? null,
      preferred_time: body.preferred_time ?? null,
      created_at: nowIso(),
      email_failed: null,
    }
    store.reservations.push(created)
    return HttpResponse.json(created)
  }),

  // ジャーナルの記事の一覧（?all=true なら非公開も含む全件、無ければ公開中だけ）
  http.get('/api/articles', ({ request }) => {
    const all = new URL(request.url).searchParams.get('all') === 'true'
    return HttpResponse.json(all ? store.articles : store.articles.filter((a) => a.is_published))
  }),

  // 記事 1 件（無ければ 404）
  http.get('/api/articles/:id', ({ params }) => {
    const article = store.articles.find((a) => a.id === params.id)
    if (!article) return notFound()
    return HttpResponse.json(article)
  }),

  // 記事の作成（作成した行を返す。公開にしたら公開日時を入れる）
  http.post('/api/articles', async ({ request }) => {
    const body = (await request.json()) as ArticleBody
    const created: Article = { ...body, id: newMockId('article'), content: body.content ?? null, published_at: body.is_published ? nowIso() : null, created_at: nowIso() }
    store.articles.push(created)
    return HttpResponse.json(created)
  }),

  // 記事の更新（無ければ 404。更新後の行を返す）
  http.put('/api/articles/:id', async ({ params, request }) => {
    const idx = store.articles.findIndex((a) => a.id === params.id)
    if (idx < 0) return notFound()
    const body = (await request.json()) as ArticleBody
    const prev = store.articles[idx]
    store.articles[idx] = { ...prev, ...body, content: body.content ?? null, published_at: body.is_published ? (prev.published_at ?? nowIso()) : prev.published_at }
    return HttpResponse.json(store.articles[idx])
  }),

  // 記事の削除
  http.delete('/api/articles/:id', ({ params }) => {
    store.articles = store.articles.filter((a) => a.id !== params.id)
    return HttpResponse.json({ ok: true })
  }),

  // コラボレーションの一覧
  http.get('/api/collaborations', () => {
    return HttpResponse.json(store.collaborations)
  }),

  // コラボレーションの追加（追加した行を返す）
  http.post('/api/collaborations', async ({ request }) => {
    const body = (await request.json()) as CollaborationPayload
    const created: Collaboration = {
      id: newMockId('collab'),
      title: body.title,
      partner_name: body.partner_name ?? null,
      description: body.description ?? null,
      video_url: body.video_url ?? null,
      image_url: body.image_url ?? null,
      event_date: body.event_date ?? null,
      display_order: store.collaborations.length,
      created_at: nowIso(),
    }
    store.collaborations.push(created)
    return HttpResponse.json(created)
  }),

  // コラボレーションの削除
  http.delete('/api/collaborations/:id', ({ params }) => {
    store.collaborations = store.collaborations.filter((c) => c.id !== params.id)
    return HttpResponse.json({ ok: true })
  }),

  // メディア出演の一覧
  http.get('/api/media-appearances', () => {
    return HttpResponse.json(store.media)
  }),

  // メディア出演の追加（追加した行を返す）
  http.post('/api/media-appearances', async ({ request }) => {
    const body = (await request.json()) as MediaAppearanceBody
    const created: MediaAppearance = {
      id: newMockId('media'),
      title: body.title,
      youtube_url: body.youtube_url,
      description: body.description ?? null,
      published_at: body.published_at ?? null,
      display_order: body.display_order ?? 0,
      created_at: nowIso(),
    }
    store.media.unshift(created)
    return HttpResponse.json(created)
  }),

  // メディア出演の削除
  http.delete('/api/media-appearances/:id', ({ params }) => {
    store.media = store.media.filter((m) => m.id !== params.id)
    return HttpResponse.json({ ok: true })
  }),

  // お問い合わせの一覧（管理画面。空）
  http.get('/api/contacts', () => {
    return HttpResponse.json([])
  }),

  // お問い合わせの既読の切り替え（モックにはお問い合わせが無いので 404）
  http.patch('/api/contacts/:id', () => notFound()),

  // お問い合わせへの返信（何もせず成功を返す。メールは送らない）
  http.post('/api/contacts/:id/reply', () => {
    return HttpResponse.json({ ok: true })
  }),

  // 注文の送信（Square には接続せず、注文番号だけ返す）
  http.post('/api/orders', () => {
    return HttpResponse.json({ order_id: newMockId('order') })
  }),

  // 注文の一覧（管理画面。空）
  http.get('/api/orders', () => {
    return HttpResponse.json([])
  }),

  // 注文 1 件・注文の状態の変更（モックには注文が無いので 404）
  http.get('/api/orders/:id', () => notFound()),
  http.patch('/api/orders/:id', () => notFound()),

  // WS 予約の一覧（管理画面。当日参加で追加した予約があれば返す。?event_id= があればそのイベントの分だけ）
  http.get('/api/reserves', ({ request }) => {
    const eventId = new URL(request.url).searchParams.get('event_id')
    return HttpResponse.json(eventId ? store.reservations.filter((r) => r.event_id === eventId) : store.reservations)
  }),

  // 予約の状態の変更（無ければ 404。更新後の行を返す）
  http.patch('/api/reserves/:id', async ({ params, request }) => {
    const idx = store.reservations.findIndex((r) => r.id === params.id)
    if (idx < 0) return notFound()
    const { status } = (await request.json()) as { status: string }
    store.reservations[idx] = { ...store.reservations[idx], status }
    return HttpResponse.json(store.reservations[idx])
  }),

  // 価格計算の記録の一覧（/admin/price-calc 用。新しい順）
  http.get('/api/price-calc-entries', () => {
    return HttpResponse.json(store.priceCalc)
  }),

  // 価格計算の記録の追加（追加した行を返す）
  http.post('/api/price-calc-entries', async ({ request }) => {
    const body = (await request.json()) as PriceCalcEntryBody
    // mode は省略できる（本番の API と同じく、省略時は null で保存する）
    const created: PriceCalcEntry = { ...body, mode: body.mode ?? null, id: newMockId('price'), created_at: nowIso() }
    store.priceCalc.unshift(created)
    return HttpResponse.json(created)
  }),

  // 価格計算の記録の削除
  http.delete('/api/price-calc-entries/:id', ({ params }) => {
    store.priceCalc = store.priceCalc.filter((e) => e.id !== params.id)
    return HttpResponse.json({ ok: true })
  }),

  // 鉢の作家の一覧（/admin/price-calc 用）
  http.get('/api/pot-artists', () => {
    return HttpResponse.json(store.potArtists)
  }),

  // 鉢の作家の追加（追加した行を返す）
  http.post('/api/pot-artists', async ({ request }) => {
    const { name } = (await request.json()) as { name: string }
    const created: PotArtist = { id: newMockId('artist'), name, created_at: nowIso() }
    store.potArtists.push(created)
    return HttpResponse.json(created)
  }),

  // 鉢の作家の削除
  http.delete('/api/pot-artists/:id', ({ params }) => {
    store.potArtists = store.potArtists.filter((a) => a.id !== params.id)
    return HttpResponse.json({ ok: true })
  }),

  // AI チャットの Q&A の一覧（?all=true なら無効も含む全件、無ければ有効なものだけ。表示順）
  http.get('/api/chat-qa', ({ request }) => {
    const all = new URL(request.url).searchParams.get('all') === 'true'
    /** 表示順に並べた Q&A */
    const sorted = [...store.chatQa].sort((a, b) => a.sort_order - b.sort_order)
    return HttpResponse.json(all ? sorted : sorted.filter((q) => q.enabled))
  }),

  // Q&A の追加（追加した行を返す）
  http.post('/api/chat-qa', async ({ request }) => {
    const body = (await request.json()) as ChatQABody
    const created: ChatQA = { ...body, id: newMockId('qa') }
    store.chatQa.push(created)
    return HttpResponse.json(created)
  }),

  // Q&A の更新（無ければ 404。更新後の行を返す）
  http.patch('/api/chat-qa/:id', async ({ params, request }) => {
    const idx = store.chatQa.findIndex((q) => q.id === params.id)
    if (idx < 0) return notFound()
    store.chatQa[idx] = { ...((await request.json()) as ChatQABody), id: store.chatQa[idx].id }
    return HttpResponse.json(store.chatQa[idx])
  }),

  // Q&A の削除
  http.delete('/api/chat-qa/:id', ({ params }) => {
    store.chatQa = store.chatQa.filter((q) => q.id !== params.id)
    return HttpResponse.json({ ok: true })
  }),

  // AI チャットの履歴（管理画面。新しい順。モックの 1 件だけ）
  http.get('/api/chat-logs', () => {
    /** モックの履歴 */
    const logs: ChatLog[] = [
      { id: 'mock-log-1', user_message: '次のイベントはいつですか？', ai_reply: 'イベント一覧ページをご覧ください。（モックの返事）', ip_hash: null, created_at: '2026-10-01T10:00:00Z' },
    ]
    return HttpResponse.json(logs)
  }),

  // 公開の AI チャット（AI には接続せず、決まった返事を返す）
  http.post('/api/chat', () => {
    return HttpResponse.json({ reply: 'これはモックの返事です。（開発用のモックでは AI に接続しません）' })
  }),

  // 画像・動画のアップロード（Storage には保存せず、public/img のローカル画像の URL を返す）
  http.post('/api/upload', () => {
    return HttpResponse.json({ url: '/img/logo-habitatoides.png' })
  }),
  http.post('/api/upload/video', () => {
    return HttpResponse.json({ url: '/img/mock-video.mp4' })
  }),

  // HUE by ei8ht plants の6枚の写真（管理画面から URL を設定）
  http.get('/api/site-assets/:key', ({ params }) => {
    const index = /^hue-color-0([1-6])$/.exec(String(params.key))?.[1]
    if (!index) return HttpResponse.json({ detail: 'Site asset not found' }, { status: 404 })
    return HttpResponse.json({ key: params.key, url: hueColorStudyImages[Number(index) - 1] })
  }),
  http.put('/api/site-assets/:key', async ({ params, request }) => {
    const index = /^hue-color-0([1-6])$/.exec(String(params.key))?.[1]
    if (!index) return HttpResponse.json({ detail: 'Site asset not found' }, { status: 404 })
    const body = await request.json() as { url: string }
    hueColorStudyImages[Number(index) - 1] = body.url
    return HttpResponse.json({ key: params.key, url: hueColorStudyImages[Number(index) - 1] })
  }),

  // 設計書の目次（管理画面「設計書」用）
  http.get('/api/docs/tree', () => {
    return HttpResponse.json(MOCK_DOC_TREE)
  }),

  // 設計書の本文。?path= のファイルを Markdown の文字列で返す（無ければ 404）
  http.get('/api/docs/content', ({ request }) => {
    const url = new URL(request.url)
    // doc/ からのパス
    const path = url.searchParams.get('path') ?? ''
    const content = MOCK_DOC_CONTENTS[path]
    if (!content) return new HttpResponse(null, { status: 404 })
    return new HttpResponse(content, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }),

  // 上のどれにも当たらない /api/ の通信。開発用のモック（npm run mock）で本物のバックエンド（vite の中継先 8000）へ
  // 流れないよう、ここで止めて 501 を返す（モックに足りない API があれば、上にハンドラを足す）
  http.all('/api/*', ({ request }) => {
    return HttpResponse.json({ detail: `MSW のモックに無い API です: ${request.method} ${new URL(request.url).pathname}` }, { status: 501 })
  }),
]
