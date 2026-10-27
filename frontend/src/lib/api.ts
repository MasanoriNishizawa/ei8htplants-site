import { SKIP_ADMIN_AUTH, DEV_SKIP_AUTH_TOKEN } from './devAuth'
import type { ChatSendMessage } from './chatHistory'
import type {
  PageContent,
  Event,
  EventBody,
  GalleryImage,
  SiteAsset,
  GalleryBody,
  Stockist,
  StockistBody,
  ContactPayload,
  ContactRecord,
  ReservationPayload,
  Reservation,
  WsSession,
  Collaboration,
  CollaborationPayload,
  EventFinances,
  EventFinancesBody,
  EventAdminInfo,
  AdminInfoDashboardItem,
  Article,
  ArticleBody,
  MediaAppearance,
  MediaAppearanceBody,
  ChatQA,
  ChatQABody,
  ChatLog,
  DocTreeNode,
  PotArtist,
  PriceCalcEntry,
  PriceCalcEntryBody,
  Product,
  ProductBody,
  OrderPayload,
  Order,
  OrderDetail,
} from './apiTypes'

/** API の URL の頭（同じオリジンの /api。開発中は Vite のプロキシでバックエンドへ送る） */
const BASE = '/api'

/**
 * 現在のパスが管理画面かどうかを判定する（管理画面ではキャッシュを無効化するために使用）
 * @returns 管理画面なら true
 */
function isAdminPage() {
  return typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')
}

/**
 * API が失敗（2xx 以外）を返したときに投げるエラー
 * message はこれまでどおり「404 file not found」の形（ステータス + 詳細）。
 * 画面ではステータスで文言を出し分けられるよう、status と detail（FastAPI の detail をそのまま）も持つ
 */
export class ApiError extends Error {
  /** HTTP のステータスコード */
  status: number
  /** 応答の detail（文字列、または 422 の入力チェックでは項目ごとのエラーの配列。無ければ null） */
  detail: unknown

  /**
   * @param status - HTTP のステータスコード
   * @param message - 表示用の文言（「ステータス 詳細」の形）
   * @param detail - 応答の detail
   */
  constructor(status: number, message: string, detail: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

/**
 * 共通の fetch。成功（2xx）の Response をそのまま返し、失敗時は「ステータス 詳細」の形の ApiError を投げる
 * 1. 管理画面では no-store を付け、ブラウザのキャッシュで古い内容を見せないようにする
 * 2. JSON を送るときだけ Content-Type: application/json を付ける。
 *    FormData（ファイルのアップロード）はブラウザが境界文字列つきの Content-Type を付けるので付けない
 * 3. 失敗したら、本文の detail（FastAPI のエラー）があれば「404 detail」、無ければ「404 Not Found」の形で投げる
 * @param path - API パス（例: '/events'）
 * @param options - fetch のオプション
 * @returns 成功した Response
 */
async function fetchOk(path: string, options?: RequestInit): Promise<Response> {
  const { headers: optHeaders, ...restOptions } = options ?? {}
  // 2. FormData を送るかどうか
  const isFormData = typeof FormData !== 'undefined' && restOptions.body instanceof FormData
  // 1. 2. キャッシュの指定とヘッダーを付けて送る
  const res = await fetch(`${BASE}${path}`, {
    ...(isAdminPage() ? { cache: 'no-store' } : {}),
    headers: { ...(isFormData ? {} : { 'Content-Type': 'application/json' }), ...optHeaders },
    ...restOptions,
  })
  // 3. 失敗の整形
  if (!res.ok) {
    // 例外の文（初めはステータスと既定の説明）
    let msg = `${res.status} ${res.statusText}`
    // サーバーが返した detail（無ければ null）
    let detail: unknown = null
    try {
      const body: { detail?: unknown } = await res.json()
      if (body.detail) {
        detail = body.detail
        msg = `${res.status} ${typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)}`
      }
    } catch { /* 本文が JSON でなければステータスだけを使う */ }
    throw new ApiError(res.status, msg, detail)
  }
  return res
}

/**
 * 認証不要の JSON リクエスト
 * @param path - API パス（例: '/events'）
 * @param options - fetch のオプション
 * @returns 応答の JSON
 */
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetchOk(path, options)
  return res.json()
}

/**
 * Authorization ヘッダーに付けるアクセストークンを取得する
 * 1. Supabase のログインセッションがあれば、その JWT を返す
 * 2. セッションが無く、開発用のログイン省略モード（SKIP_ADMIN_AUTH）なら、ダミーのトークンを返す
 *    （E2E では MSW がリクエストを受けるので、ここで 401 を投げると MSW まで届かないため）。
 *    SKIP_ADMIN_AUTH は本番ビルドでは常に false なので、本番でこの分岐に入ることはない
 * 3. どちらでもなければ「401 Unauthorized」を投げる（fetch はしない）
 * @returns アクセストークン
 */
async function getAccessToken(): Promise<string> {
  // Supabase のクライアント（約 200KB）はログインが必要な呼び出しでだけ使うので、ここで初めて読み込む。
  // 先頭で import すると、公開サイトだけを見る人も最初に読み込むことになり表示が遅くなるため
  const { supabase } = await import('./supabase')
  const { data } = await (supabase?.auth.getSession() ?? Promise.resolve({ data: { session: null } }))
  // 1. ログイン中ならそのトークン
  const token = data.session?.access_token
  if (token) return token
  // 2. 開発用のログイン省略モード
  if (SKIP_ADMIN_AUTH) return DEV_SKIP_AUTH_TOKEN
  // 3. どちらでもない
  throw new Error('401 Unauthorized')
}

/**
 * ログインのトークンを Authorization ヘッダーに付けて送る（成功の Response を返す）
 * @param path - API パス
 * @param options - fetch のオプション
 * @returns 成功した Response
 */
async function authFetchOk(path: string, options?: RequestInit): Promise<Response> {
  const token = await getAccessToken()
  return fetchOk(path, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options?.headers },
  })
}

/**
 * Supabase セッションから JWT を取得して Authorization ヘッダーに付与する認証済みリクエスト
 * @param path - API パス
 * @param options - fetch のオプション
 * @returns 応答の JSON
 */
async function authRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await authFetchOk(path, options)
  return res.json()
}

/**
 * 認証済みで、応答をテキストのまま受け取るリクエスト（設計書の Markdown 本文など）
 * @param path - API パス
 * @returns 応答の本文（テキスト）
 */
async function authRequestText(path: string): Promise<string> {
  const res = await authFetchOk(path)
  return res.text()
}

/**
 * ファイルを1つ multipart/form-data で送り、保存先の公開 URL を受け取る（画像・動画のアップロードの共通部分）
 * @param path - アップロード先の API パス（'/upload' または '/upload/video'）
 * @param file - 送るファイル
 * @returns 保存したファイルの公開 URL
 */
async function uploadFile(path: string, file: File): Promise<string> {
  // 送るファイルを file という名前で入れる（サーバーの受け取り名と同じ）
  const form = new FormData()
  form.append('file', file)
  const res = await authFetchOk(path, { method: 'POST', body: form })
  const { url } = await res.json()
  return url
}

/** バックエンドへの API 呼び出しをまとめたオブジェクト */
export const api = {
  /**
   * ダッシュボード用の統計情報（未読問い合わせ・開催中イベント・未処理注文数）を一括取得（管理者のみ）
   * @returns unreadContacts: 未読の問い合わせ数、activeEvents: 開催前・開催中のイベント数、pendingOrders: 支払い済み・未発送の注文数
   */
  stats: async (): Promise<{ unreadContacts: number; activeEvents: number; pendingOrders: number }> => {
    const [contacts, events, orders] = await Promise.all([
      authRequest<ContactRecord[]>('/contacts'),
      request<Event[]>('/events?past=false'),
      authRequest<Order[]>('/orders'),
    ])
    return {
      unreadContacts: contacts.filter((c) => !c.is_read).length,
      activeEvents: events.length,
      pendingOrders: orders.filter((o) => o.status === 'paid').length,
    }
  },
  /** 画像を Storage にアップロードし、公開 URL を返す（管理者のみ） */
  upload: (file: File): Promise<string> => uploadFile('/upload', file),
  /** 動画を Storage にアップロードし、公開 URL を返す（管理者のみ） */
  uploadVideo: (file: File): Promise<string> => uploadFile('/upload/video', file),
  /** 公開サイトの管理画像 */
  siteAssets: {
    /** 公開ページ用の画像 URL を取得する */
    get: (key: string) => request<SiteAsset>(`/site-assets/${encodeURIComponent(key)}`),
    /** 管理画面から画像 URL を保存する */
    save: (key: string, url: string) =>
      authRequest<SiteAsset>(`/site-assets/${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify({ url }) }),
  },
  /** イベント（公開の一覧・1 件と、管理画面の作成・更新・削除・収支・時間枠・イベントページ・管理情報） */
  events: {
    /** イベントの一覧を取る（past が true なら終了したイベント） */
    list: (past = false) => request<Event[]>(`/events?past=${past}`),
    /** イベントを 1 件取る（id かスラッグ。opts で cache などを足せる） */
    get: (id: string, opts?: RequestInit) => request<Event>(`/events/${id}`, opts),
    /** イベントを作る（管理者のみ） */
    create: (body: EventBody) =>
      authRequest<Event>('/events', { method: 'POST', body: JSON.stringify(body) }),
    /** イベントを更新する（管理者のみ） */
    update: (id: string, body: EventBody) =>
      authRequest<Event>(`/events/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    /** イベントを削除する（管理者のみ） */
    delete: (id: string) =>
      authRequest<{ ok: boolean }>(`/events/${id}`, { method: 'DELETE' }),
    /** イベントの収支を取る（管理者のみ。未保存なら 404） */
    getFinances: (id: string) =>
      authRequest<EventFinances>(`/events/${id}/finances`),
    /** イベントの収支を保存する（管理者のみ） */
    saveFinances: (id: string, body: EventFinancesBody) =>
      authRequest<EventFinances>(`/events/${id}/finances`, { method: 'PUT', body: JSON.stringify(body) }),
    /** 全イベントの収支をまとめて取る（管理者のみ） */
    getAllFinances: () =>
      authRequest<EventFinances[]>('/events/finances'),
    /** ワークショップの時間枠を取る（date を渡すとその日の枠だけ） */
    getSessions: (id: string, date?: string) =>
      request<WsSession[]>(`/events/${id}/sessions${date ? `?date=${encodeURIComponent(date)}` : ''}`),
    /** ワークショップの時間枠をまとめて保存する（管理者のみ。id の無い行は新しく作る） */
    saveSessions: (id: string, sessions: { id?: string; time_label: string; max_participants: number }[]) =>
      authRequest<WsSession[]>(`/events/${id}/sessions`, { method: 'PUT', body: JSON.stringify({ sessions }) }),
    /** イベントページの中身を保存する（管理者のみ） */
    savePageContent: (id: string, page_content: PageContent) =>
      authRequest<Event>(`/events/${id}/page`, { method: 'PATCH', body: JSON.stringify({ page_content }) }),
    /** イベントの管理情報（搬入・搬出時間・宿泊・出店料など）を取得する */
    getAdminInfo: (id: string) =>
      authRequest<EventAdminInfo>(`/events/${id}/admin-info`),
    /** イベントの管理情報を保存する */
    saveAdminInfo: (id: string, body: EventAdminInfo) =>
      authRequest<{ ok: boolean }>(`/events/${id}/admin-info`, { method: 'PUT', body: JSON.stringify(body) }),
    /**
     * 管理画面ダッシュボード用に、イベントごとの管理情報（搬入・ホテル・出店料）をまとめて取得する
     * 対象は終了日が今日以降のイベントと、終了済みでも出店料が未払いのイベント（並びは開始日の昇順。絞り込みはバックエンド）
     * @returns イベントごとの管理情報の一覧
     */
    getAdminInfoDashboard: async (): Promise<AdminInfoDashboardItem[]> => {
      const res = await authRequest<{ items: AdminInfoDashboardItem[] }>('/events/admin-info/dashboard')
      return res.items
    },
  },
  /** ギャラリーの画像 */
  gallery: {
    /** ギャラリーの画像を取る（brand を渡すと、その値と一致する画像だけ） */
    list: (brand?: string) =>
      request<GalleryImage[]>(brand ? `/gallery?brand=${encodeURIComponent(brand)}` : '/gallery'),
    /** 画像を追加する（管理者のみ） */
    add: (body: GalleryBody) =>
      authRequest<GalleryImage>('/gallery', { method: 'POST', body: JSON.stringify(body) }),
    /** 画像の並び順を変える（管理者のみ） */
    updateOrder: (id: string, display_order: number) =>
      authRequest<GalleryImage>(`/gallery/${id}`, { method: 'PATCH', body: JSON.stringify({ display_order }) }),
    /** 画像を削除する（管理者のみ） */
    delete: (id: string) =>
      authRequest<{ ok: boolean }>(`/gallery/${id}`, { method: 'DELETE' }),
  },
  /** 取扱店 */
  stockists: {
    /** 取扱店の一覧を取る */
    list: () => request<Stockist[]>('/stockists'),
    /** 取扱店を追加する（管理者のみ） */
    add: (body: StockistBody) =>
      authRequest<Stockist>('/stockists', { method: 'POST', body: JSON.stringify(body) }),
    /** 取扱店を更新する（管理者のみ） */
    patch: (id: string, body: StockistBody) =>
      authRequest<Stockist>(`/stockists/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    /** 取扱店を削除する（管理者のみ） */
    delete: (id: string) =>
      authRequest<{ ok: boolean }>(`/stockists/${id}`, { method: 'DELETE' }),
  },
  /** お問い合わせ（公開フォームの送信と、管理画面の一覧・既読・返信） */
  contact: {
    /** お問い合わせを送る（429 は送信回数の上限） */
    send: (body: ContactPayload) =>
      request('/contact', { method: 'POST', body: JSON.stringify(body) }),
    /** お問い合わせの一覧を取る（管理者のみ） */
    list: () => authRequest<ContactRecord[]>('/contacts'),
    /** 既読・未読を切り替える（管理者のみ） */
    markRead: (id: string, is_read: boolean) =>
      authRequest<ContactRecord>(`/contacts/${id}`, { method: 'PATCH', body: JSON.stringify({ is_read }) }),
    /** お問い合わせにメールで返信する（管理者のみ） */
    reply: (id: string, subject: string, body: string) =>
      authRequest<{ ok: boolean }>(`/contacts/${id}/reply`, { method: 'POST', body: JSON.stringify({ subject, body }) }),
  },
  /** ワークショップの予約（公開フォームの送信・キャンセルと、管理画面の一覧・状態の変更・当日参加の登録） */
  reserve: {
    /** 予約を送る（409 は満席、429 は送信回数の上限） */
    create: (body: ReservationPayload) =>
      request('/reserve', { method: 'POST', body: JSON.stringify(body) }),
    /** 予約の一覧を取る（管理者のみ。eventId を渡すとそのイベントの予約だけ） */
    list: (eventId?: string) =>
      authRequest<Reservation[]>(eventId ? `/reserves?event_id=${encodeURIComponent(eventId)}` : '/reserves'),
    /** 予約の状態を変える（管理者のみ） */
    updateStatus: (id: string, status: string) =>
      authRequest<Reservation>(`/reserves/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    /** 予約をキャンセルする（メールのキャンセル ID）。認証不要。ステータスコードで結果を判定するため Response をそのまま返す */
    cancel: (token: string) =>
      fetch(`${BASE}/reserve/cancel`, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }),
    /** 当日参加の予約を登録する（管理者のみ） */
    addWalkin: (body: { event_id: string; participants: number; session_id?: string; preferred_time?: string; preferred_date?: string }) =>
      authRequest<Reservation>('/reserve/walkin', { method: 'POST', body: JSON.stringify(body) }),
  },
  /** ショップの商品 */
  products: {
    /**
     * 商品一覧を取得する
     * @param all - true なら非公開も含む全件（管理画面用。サーバーが認証を求めるのでログインのトークンを付ける）
     */
    list: (all = false) =>
      all ? authRequest<Product[]>('/products?all=true') : request<Product[]>('/products'),
    /** 商品を 1 件取る（無ければ 404） */
    get: (id: string) => request<Product>(`/products/${id}`),
    /** 商品を作る（管理者のみ） */
    create: (body: ProductBody) =>
      authRequest<Product>('/products', { method: 'POST', body: JSON.stringify(body) }),
    /** 商品を更新する（管理者のみ） */
    update: (id: string, body: ProductBody) =>
      authRequest<Product>(`/products/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    /** 商品を削除する（管理者のみ） */
    delete: (id: string) =>
      authRequest<{ ok: boolean }>(`/products/${id}`, { method: 'DELETE' }),
    /** 在庫数だけを変える（管理者のみ） */
    updateStock: (id: string, stock: number) =>
      authRequest<Product>(`/products/${id}/stock`, { method: 'PATCH', body: JSON.stringify({ stock }) }),
  },
  /** 送料 */
  shipping: {
    /** 都道府県の送料を取る */
    getRate: (prefecture: string) =>
      request<{ fee: number }>(`/shipping/rate?prefecture=${encodeURIComponent(prefecture)}`),
    /** 送料の設定がある都道府県の一覧を取る */
    getPrefectures: () => request<string[]>('/shipping/prefectures'),
  },
  /** 注文（公開の注文の確定と、管理画面の一覧・詳細・状態の変更） */
  orders: {
    /** 注文を確定する（Square で決済する。429 は送信回数の上限） */
    create: (body: OrderPayload) =>
      request<{ order_id: string }>('/orders', { method: 'POST', body: JSON.stringify(body) }),
    /** 注文の一覧を取る（管理者のみ） */
    list: () => authRequest<Order[]>('/orders'),
    /** 注文を明細つきで 1 件取る（管理者のみ） */
    get: (id: string) => authRequest<OrderDetail>(`/orders/${id}`),
    /** 注文の状態（と配送業者・追跡番号）を変える（管理者のみ） */
    updateStatus: (id: string, status: string, carrier?: string, trackingNumber?: string) =>
      authRequest<Order>(`/orders/${id}`, { method: 'PATCH', body: JSON.stringify({ status, carrier, tracking_number: trackingNumber }) }),
  },
  /** Journal の記事 */
  articles: {
    /**
     * 記事一覧を取得する
     * @param all - true なら非公開も含む全件（管理画面用。サーバーが認証を求めるのでログインのトークンを付ける）
     */
    list: (all = false) =>
      all ? authRequest<Article[]>('/articles?all=true') : request<Article[]>('/articles'),
    /** 記事を 1 件取る（無ければ 404） */
    get: (id: string) => request<Article>(`/articles/${id}`),
    /** 記事を作る（管理者のみ） */
    create: (body: ArticleBody) =>
      authRequest<Article>('/articles', { method: 'POST', body: JSON.stringify(body) }),
    /** 記事を更新する（管理者のみ） */
    update: (id: string, body: ArticleBody) =>
      authRequest<Article>(`/articles/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    /** 記事を削除する（管理者のみ） */
    delete: (id: string) =>
      authRequest<{ ok: boolean }>(`/articles/${id}`, { method: 'DELETE' }),
  },
  /** コラボレーション事例 */
  collaborations: {
    /** コラボレーションの一覧を取る */
    list: () => request<Collaboration[]>('/collaborations'),
    /** コラボレーションを追加する（管理者のみ） */
    add: (body: CollaborationPayload) =>
      authRequest<Collaboration>('/collaborations', { method: 'POST', body: JSON.stringify(body) }),
    /** コラボレーションを削除する（管理者のみ） */
    delete: (id: string) =>
      authRequest<{ ok: boolean }>(`/collaborations/${id}`, { method: 'DELETE' }),
  },
  /** 鉢の作家（管理画面の価格計算） */
  potArtists: {
    /** 作家の一覧を取る */
    list: () => request<PotArtist[]>('/pot-artists'),
    /** 作家を追加する（管理者のみ） */
    add: (name: string) =>
      authRequest<PotArtist>('/pot-artists', { method: 'POST', body: JSON.stringify({ name }) }),
    /** 作家を削除する（管理者のみ） */
    delete: (id: string) =>
      authRequest<{ ok: boolean }>(`/pot-artists/${id}`, { method: 'DELETE' }),
  },
  /** 価格計算の記録（管理者のみ） */
  priceCalcEntries: {
    /** 記録の一覧を取る */
    list: () => authRequest<PriceCalcEntry[]>('/price-calc-entries'),
    /** 記録を追加する */
    add: (body: PriceCalcEntryBody) =>
      authRequest<PriceCalcEntry>('/price-calc-entries', { method: 'POST', body: JSON.stringify(body) }),
    /** 記録を削除する */
    delete: (id: string) =>
      authRequest<{ ok: boolean }>(`/price-calc-entries/${id}`, { method: 'DELETE' }),
  },
  /** メディア掲載 */
  mediaAppearances: {
    /** メディア掲載の一覧を取る */
    list: () => request<MediaAppearance[]>('/media-appearances'),
    /** メディア掲載を追加する（管理者のみ） */
    add: (body: MediaAppearanceBody) =>
      authRequest<MediaAppearance>('/media-appearances', { method: 'POST', body: JSON.stringify(body) }),
    /** メディア掲載を削除する（管理者のみ） */
    delete: (id: string) =>
      authRequest<{ ok: boolean }>(`/media-appearances/${id}`, { method: 'DELETE' }),
  },
  /** AI チャット用の Q&A（管理画面の「チャットQ&A」） */
  chatQa: {
    /**
     * 無効のものも含む全件を取得する（管理画面の一覧用）。
     * 公開の GET /chat-qa は有効なものだけを返すので、?all=true を付けて認証付きで取る
     */
    list: () => authRequest<ChatQA[]>('/chat-qa?all=true'),
    /** Q&A を追加する（管理者のみ） */
    add: (body: ChatQABody) =>
      authRequest<ChatQA>('/chat-qa', { method: 'POST', body: JSON.stringify(body) }),
    /** Q&A を更新する（管理者のみ） */
    update: (id: string, body: ChatQABody) =>
      authRequest<ChatQA>(`/chat-qa/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
    /** Q&A を削除する（管理者のみ） */
    delete: (id: string) =>
      authRequest<{ ok: boolean }>(`/chat-qa/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  },
  /** AI チャットの会話ログ（管理者のみ。新しい順で最大 200 件） */
  chatLogs: {
    /** 会話ログを取る（新しい順で最大 200 件） */
    list: () => authRequest<ChatLog[]>('/chat-logs'),
  },
  /** 設計書（doc/ の Markdown）の閲覧（管理者のみ） */
  docs: {
    /** doc/ のファイルツリーを取得する */
    tree: () => authRequest<DocTreeNode[]>('/docs/tree'),
    /**
     * Markdown ファイルの本文をテキストのまま取得する
     * @param path - doc/ からの相対パス
     */
    content: (path: string) => authRequestText(`/docs/content?path=${encodeURIComponent(path)}`),
  },
  /** 公開サイトの AI チャット（認証不要） */
  chat: {
    /**
     * 会話履歴を送って AI の返事を受け取る。
     * 回数制限（429）・入力チェック（422）を画面側で見分けて案内を出すため、Response をそのまま返す（cancel と同じ形）
     * @param messages - 送る会話履歴（最後は利用者の発言）
     * @returns サーバーの Response（成功時の本文は { reply: string }）
     */
    send: (messages: ChatSendMessage[]) =>
      fetch(`${BASE}/chat`, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
      }),
  },
}

export type * from './apiTypes'
export { PRODUCT_CATEGORIES } from './apiTypes'

// 収支の計算（fiscalYear・computeFinances）は lib/finance.ts に移した。
// 以前からの import（テストなど）を壊さないよう、ここからも書き出す
export { fiscalYear, computeFinances, type ComputedFinances } from './finance'
