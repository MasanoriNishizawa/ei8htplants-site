import { SKIP_ADMIN_AUTH, DEV_SKIP_AUTH_TOKEN } from './devAuth'
import type { ChatSendMessage } from './chatHistory'

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

/** イベントの特設ページ（/events/:id）の中身。管理画面「サイト」で編集する */
export interface PageContent {
  /** ページ上部の見出しの部分 */
  hero?: {
    /** 大きな写真の URL（作成途中の blob: の URL は公開ページで数えない） */
    image_url?: string
    /** キャッチコピー */
    tagline?: string
    /** サブタイトル */
    subtitle?: string
  }
  /** 会場の情報 */
  venue?: {
    /** 会場の住所（イベントの address より優先してカードに出す） */
    address?: string
    /** 会場へのアクセスの説明 */
    access?: string
    /** 地図の URL（公開ページではいまは使っていない） */
    map_url?: string
  }
  /** コンセプトの文章（改行はそのまま表示する） */
  concept?: string
  /** ラインナップ（出品する作品・商品のカード） */
  lineup?: Array<{
    /** 名前 */
    title: string
    /** 説明 */
    description?: string
    /** 画像の URL */
    image_url?: string
  }>
  /** ワークショップの説明（公開ページではいまは使っていない） */
  workshop?: {
    /** 見出し */
    title?: string
    /** 説明 */
    description?: string
    /** 注意書き */
    note?: string
  } | null
  /** ゲスト・出展者 */
  guests?: Array<{
    /** 名前 */
    name: string
    /** 肩書き */
    role?: string
    /** 紹介文 */
    bio?: string
    /** 顔写真の URL（無ければ灰色の丸） */
    image_url?: string
    /** Instagram の URL */
    instagram_url?: string
  }>
  /** 終了後のアーカイブ表示 */
  archive?: {
    /** true ならアーカイブ表示にする */
    enabled: boolean
    /** お礼の見出し（無ければ「ご来場ありがとうございました」） */
    title?: string
    /** お礼の文 */
    message?: string
    /** 当日の写真の URL */
    gallery?: string[]
  }
}

/** イベント（API から受け取る形） */
export interface Event {
  /** イベントの ID（UUID） */
  id: string
  /** URL に使う短い名前（/events/:slug。無ければ id を使う） */
  slug: string | null
  /** イベント名 */
  name: string
  /** 開始日（YYYY-MM-DD） */
  start_date: string
  /** 終了日（YYYY-MM-DD。1 日だけなら null のこともある） */
  end_date: string | null
  /** 開催時間の文字（例: 10:00〜17:00。日ごとに違うときは daily_times） */
  time: string | null
  /** 会場名 */
  location: string
  /** ブース番号 */
  booth_number: string | null
  /** 会場の住所（地図のリンク・埋め込みに使う） */
  address: string | null
  /** 主催者の公式サイトの URL */
  official_url: string | null
  /** 出店するブランドの正式名（BRAND_NAMES の値） */
  brands: string[]
  /** ワークショップを開くか */
  has_workshop: boolean
  /** ワークショップが予約制か（true なら予約ページへのリンクを出す） */
  ws_requires_reservation: boolean
  /** 終了したイベントか（サーバーが終了日から決める） */
  is_past: boolean
  /** 並び順（小さい順） */
  display_order: number
  /** イベントの写真（id・URL・並び順） */
  images: { id: string; url: string; display_order: number }[]
  /** イベントページ（/events/:id）の中身（未作成なら null） */
  page_content: PageContent | null
  /** 日付（YYYY-MM-DD）ごとの開催時間（使わないときは null） */
  daily_times: Record<string, string> | null
}

/** イベントの作成・更新で送る内容 */
export interface EventBody {
  /** イベント名 */
  name: string
  /** URL に使う短い名前（空なら null） */
  slug?: string | null
  /** 開始日（YYYY-MM-DD） */
  start_date: string
  /** 終了日（YYYY-MM-DD） */
  end_date?: string
  /** 開催時間の文字 */
  time?: string
  /** 会場名 */
  location: string
  /** ブース番号 */
  booth_number?: string
  /** 会場の住所 */
  address?: string
  /** 主催者の公式サイトの URL */
  official_url?: string
  /** 出店するブランドの正式名 */
  brands: string[]
  /** ワークショップを開くか */
  has_workshop: boolean
  /** ワークショップが予約制か */
  ws_requires_reservation: boolean
  /** 日付ごとの開催時間 */
  daily_times?: Record<string, string> | null
  /** イベントの写真の URL（この順で並ぶ） */
  image_urls: string[]
}

/** ギャラリーの画像 1 枚 */
export interface GalleryImage {
  /** 画像の ID */
  id: string
  /** 画像の公開 URL */
  url: string
  /** 画像の説明（読み上げ用。無ければ null） */
  alt: string | null
  /** ブランドの短い表記（SHORT_BRAND_NAMES の値。無ければ null） */
  brand: string | null
  /** 並び順（小さい順） */
  display_order: number
}

/** ギャラリーの画像を追加するときに送る内容 */
export interface GalleryBody {
  /** 画像の公開 URL */
  url: string
  /** 画像の説明 */
  alt?: string | null
  /** ブランドの短い表記 */
  brand?: string | null
}

/** 取扱店 1 件 */
export interface Stockist {
  /** 取扱店の ID */
  id: string
  /** 店名 */
  name: string
  /** エリア（公開ページの見出し。無ければ「その他」にまとめる） */
  area: string | null
  /** 住所 */
  address: string | null
  /** お店のサイトの URL */
  url: string | null
  /** 扱っているブランドの短い表記 */
  brands: string[]
}

/** 取扱店の追加・更新で送る内容 */
export interface StockistBody {
  /** 店名 */
  name: string
  /** エリア */
  area?: string | null
  /** 住所 */
  address?: string | null
  /** お店のサイトの URL */
  url?: string | null
  /** 扱っているブランドの短い表記 */
  brands?: string[]
}

/** お問い合わせフォームから送る内容 */
export interface ContactPayload {
  /** お名前 */
  name: string
  /** 返信先のメールアドレス */
  email: string
  /** お問い合わせ内容 */
  message: string
}

/** 管理画面で見るお問い合わせ 1 件 */
export interface ContactRecord {
  /** お問い合わせの ID */
  id: string
  /** お名前 */
  name: string
  /** メールアドレス */
  email: string
  /** お問い合わせ内容 */
  message: string
  /** 既読にしたか */
  is_read: boolean
  /** 受け付けた日時（ISO 形式） */
  created_at: string
}

/** ワークショップの予約フォームから送る内容 */
export interface ReservationPayload {
  /** 予約するイベントの ID */
  event_id: string
  /** お名前 */
  name: string
  /** 確認メールの送り先 */
  email: string
  /** 電話番号（任意） */
  phone?: string
  /** 参加人数 */
  participants: number
  /** 備考（任意） */
  note?: string
  /** 選んだ時間枠の ID */
  session_id?: string
  /** 植物を持ち込むか */
  bring_plant: boolean
  /** 鉢を持ち込むか */
  bring_pot: boolean
  /** 予約日（YYYY-MM-DD） */
  preferred_date?: string
  /** 希望の時間（時間枠を使わないときの文字） */
  preferred_time?: string
  /** 確認メールの言語（'ja' | 'en'） */
  lang?: string
}

/** ワークショップの予約 1 件（管理画面で見る形） */
export interface Reservation {
  /** 予約の ID */
  id: string
  /** イベントの ID */
  event_id: string
  /** お名前 */
  name: string
  /** メールアドレス */
  email: string
  /** 電話番号 */
  phone: string | null
  /** 参加人数 */
  participants: number
  /** 備考 */
  note: string | null
  /** 状態（pending: 受付済 / confirmed: 以前の「確定」/ cancelled: キャンセル。lib/reservationConstants.ts） */
  status: string
  /** 時間枠の ID */
  session_id: string | null
  /** 植物を持ち込むか */
  bring_plant: boolean
  /** 鉢を持ち込むか */
  bring_pot: boolean
  /** 予約日（YYYY-MM-DD） */
  preferred_date: string | null
  /** 希望の時間 */
  preferred_time: string | null
  /** 受け付けた日時（ISO 形式） */
  created_at: string
  /** 確認メールの送信に失敗したか（記録が無ければ null） */
  email_failed: boolean | null
}

/** ワークショップの時間枠 1 つ（定員と予約済みの人数つき） */
export interface WsSession {
  /** 時間枠の ID */
  id: string
  /** イベントの ID */
  event_id: string
  /** 時間の表示（例: 11:00〜12:00） */
  time_label: string
  /** 定員（人） */
  max_participants: number
  /** 予約済みの人数（キャンセルを除く） */
  reserved_count: number
  /** 並び順（小さい順） */
  display_order: number
}

/** コラボレーション事例 1 件 */
export interface Collaboration {
  /** コラボレーションの ID */
  id: string
  /** タイトル */
  title: string
  /** 相手先の名前 */
  partner_name: string | null
  /** 説明 */
  description: string | null
  /** 動画の URL（画像が無いときに出す） */
  video_url: string | null
  /** 画像の URL */
  image_url: string | null
  /** 日付（YYYY-MM-DD） */
  event_date: string | null
  /** 並び順（小さい順） */
  display_order: number
  /** 登録した日時（ISO 形式） */
  created_at: string
}

/** コラボレーション事例の追加で送る内容 */
export interface CollaborationPayload {
  /** タイトル */
  title: string
  /** 相手先の名前 */
  partner_name?: string
  /** 説明 */
  description?: string
  /** 動画の URL */
  video_url?: string
  /** 画像の URL */
  image_url?: string
  /** 日付（YYYY-MM-DD） */
  event_date?: string
}

/** イベントの収支データ（計算は lib/finance.ts の computeFinances） */
export interface EventFinances {
  /** 収支の ID（まだ保存していなければ無い） */
  id?: string
  /** イベントの ID */
  event_id: string
  /** 売上（円） */
  sales: number
  /** 出店料（円） */
  booth_fee: number
  /** 片道の距離（km） */
  distance: number
  /** ガソリン単価（円 / L） */
  gas_price: number
  /** 高速代（円） */
  expressway_toll: number
  /** 宿泊費（円） */
  accommodation: number
  /** ワークショップの参加人数 */
  ws_participants: number
  /** 手伝いへの支払いがあるか */
  payment_flag: boolean
  /** 手伝いへの WS 分の支払いが済んだか */
  ws_payment_done: boolean
  /** その他の支出（円） */
  other_expenses: number
  /** その他の支出の内訳 */
  other_expenses_note: string | null
  /** メモ */
  notes: string | null
  /** 最後に保存した日時（ISO 形式） */
  updated_at?: string
}

/** イベントの収支の保存で送る内容（id・event_id・updated_at はサーバーが決める） */
export type EventFinancesBody = Omit<EventFinances, 'id' | 'event_id' | 'updated_at'>

/** イベントの運営管理情報。搬入・搬出・宿泊・出店料の詳細を保持する */
export interface EventAdminInfo {
  /** 搬入日時（datetime-local 形式 例: "2026-10-24T09:00"） */
  carry_in_time?: string | null
  /** 搬出日時（datetime-local 形式） */
  carry_out_time?: string | null
  /** 宿泊ホテル名 */
  hotel_name?: string | null
  /** 宿泊料金（円） */
  hotel_fee?: number | null
  /** 出店料（円） */
  booth_fee?: number | null
  /** 出店料の支払い方法: "当日現金" | "事前振込" | "その他" */
  booth_fee_pay_method?: string | null
  /** 出店料の支払い期限（date 形式 例: "2026-10-01"） */
  booth_fee_due?: string | null
  /** 出店料の支払い済みフラグ */
  booth_fee_paid?: boolean
  /** 備考・注意事項 */
  notes?: string | null
  /** 出店要項の本文（主催者から届いた要項の文章） */
  guidelines_text?: string | null
  /** 出店要項の画像 URL 一覧（アップロード順・複数枚） */
  guidelines_image_urls?: string[]
}

/** 管理画面ダッシュボードの「出店料の支払い」「今後の搬入予定」に使う、イベント1件分の管理情報 */
export interface AdminInfoDashboardItem {
  /** イベント ID（管理情報の確認画面 /admin/events/:id/admin-info へのリンクに使う） */
  event_id: string
  /** イベント名 */
  name: string
  /** 開始日 "YYYY-MM-DD" */
  start_date: string
  /** 終了日 "YYYY-MM-DD"（1日だけのイベントでは null のこともある） */
  end_date: string | null
  /** 会場 */
  location: string | null
  /** 搬入日時 "YYYY-MM-DDTHH:MM" */
  carry_in_time: string | null
  /** 搬出日時 "YYYY-MM-DDTHH:MM" */
  carry_out_time: string | null
  /** 宿泊ホテル名 */
  hotel_name: string | null
  /** 出店料（円） */
  booth_fee: number | null
  /** 出店料の支払い方法（"当日現金" | "事前振込" | "その他"） */
  booth_fee_pay_method: string | null
  /** 出店料の支払い期限 "YYYY-MM-DD" */
  booth_fee_due: string | null
  /** 出店料の支払い済みフラグ */
  booth_fee_paid: boolean
}

/** Journal の記事 1 件 */
export interface Article {
  /** 記事の ID */
  id: string
  /** タイトル */
  title: string
  /** 本文（ブロックの JSON 文字列。古い記事は「## 見出し」形式のテキスト） */
  content: string | null
  /** 画像の URL（1 枚目を一覧のサムネイルに使う） */
  image_urls: string[]
  /** タグ */
  tags: string[]
  /** 記事で紹介する商品の ID */
  product_ids: string[]
  /** 公開しているか */
  is_published: boolean
  /** 並び順（小さい順） */
  display_order: number
  /** 公開日 */
  published_at: string | null
  /** 作成した日時（ISO 形式） */
  created_at: string
}

/** Journal の記事の作成・更新で送る内容 */
export interface ArticleBody {
  /** タイトル */
  title: string
  /** 本文（ブロックの JSON 文字列） */
  content?: string | null
  /** 画像の URL */
  image_urls: string[]
  /** タグ */
  tags: string[]
  /** 記事で紹介する商品の ID */
  product_ids: string[]
  /** 公開するか */
  is_published: boolean
  /** 並び順 */
  display_order: number
}

/** メディア掲載 1 件 */
export interface MediaAppearance {
  /** 掲載の ID */
  id: string
  /** タイトル */
  title: string
  /** YouTube の URL */
  youtube_url: string
  /** 説明 */
  description: string | null
  /** 公開日 */
  published_at: string | null
  /** 並び順（小さい順） */
  display_order: number
  /** 登録した日時（ISO 形式） */
  created_at: string
}

/** メディア掲載の追加・更新で送る内容 */
export interface MediaAppearanceBody {
  /** タイトル */
  title: string
  /** YouTube の URL */
  youtube_url: string
  /** 説明 */
  description?: string | null
  /** 公開日 */
  published_at?: string | null
  /** 並び順 */
  display_order?: number
}

/** AI チャット用の Q&A 1件 */
export interface ChatQA {
  /** Q&A の ID */
  id: string
  /** 利用者が尋ねる想定の質問 */
  question: string
  /** あらかじめ用意した回答 */
  answer: string
  /** 表示順（小さい順） */
  sort_order: number
  /** false ならチャットのシステムプロンプトに入れない */
  enabled: boolean
}

/** Q&A の追加・更新で送る内容 */
export type ChatQABody = Omit<ChatQA, 'id'>

/** AI チャットの会話ログ 1件 */
export interface ChatLog {
  /** ログの ID */
  id: string
  /** 利用者の発言 */
  user_message: string
  /** AI の返事 */
  ai_reply: string
  /** 送信元 IP のハッシュ（個人を特定しないための短い値。無いこともある） */
  ip_hash: string | null
  /** やりとりした日時（ISO 形式） */
  created_at: string
}

/** 設計書のファイルツリーの1項目（フォルダならその中身を children に持つ） */
export interface DocTreeNode {
  /** ファイル（file）かフォルダ（dir）か */
  type: 'file' | 'dir'
  /** ファイル名・フォルダ名 */
  name: string
  /** doc/ からの相対パス */
  path: string
  /** フォルダの中身（ファイルなら無い） */
  children?: DocTreeNode[]
}

/** 鉢の作家（価格計算で鉢代の内訳に使う） */
export interface PotArtist {
  /** 作家の ID */
  id: string
  /** 作家名 */
  name: string
  /** 登録した日時（ISO 形式） */
  created_at: string
}

/** 価格計算で登録した記録 1 件 */
export interface PriceCalcEntry {
  /** 記録の ID */
  id: string
  /** ブランド */
  brand: string
  /** 植物名 */
  plant_name: string
  /** 鉢の作家名（鉢なしは null） */
  pot_artist_name: string | null
  /** 原価（円） */
  cost: number
  /** 販売価格（円） */
  selling_price: number
  /** 登録した日時（ISO 形式） */
  created_at: string
}

/** 価格計算の記録を登録するときに送る内容 */
export interface PriceCalcEntryBody {
  /** ブランド */
  brand: string
  /** 植物名 */
  plant_name: string
  /** 鉢の作家名（鉢なしは null） */
  pot_artist_name: string | null
  /** 原価（円） */
  cost: number
  /** 販売価格（円） */
  selling_price: number
}

/** 商品のカテゴリー（ショップの絞り込みと商品登録の選択肢） */
export const PRODUCT_CATEGORIES = [
  'アガベ', '塊根植物', '灌木', 'サボテン',
  '観葉植物', 'ハビタットスタイル', 'ハビタットスタイル資材', '園芸資材', '鉢',
] as const

/** 商品のカテゴリーの値 */
export type ProductCategory = typeof PRODUCT_CATEGORIES[number]

/** ショップの商品 1 件 */
export interface Product {
  /** 商品の ID */
  id: string
  /** 商品名 */
  name: string
  /** 商品説明（ブロックの JSON 文字列。古い商品はテキスト） */
  description: string | null
  /** 価格（税込・円） */
  price: number
  /** 在庫数（0 で売り切れ） */
  stock: number
  /** 画像の URL（1 枚目を一覧のサムネイルに使う） */
  image_urls: string[]
  /** タグ */
  tags: string[]
  /** 公開しているか */
  is_published: boolean
  /** 並び順（小さい順） */
  display_order: number
  /** カテゴリー（未設定は null） */
  category: ProductCategory | null
  /** 登録した日時（ISO 形式） */
  created_at: string
}

/** 商品の作成・更新で送る内容 */
export interface ProductBody {
  /** 商品名 */
  name: string
  /** 商品説明（ブロックの JSON 文字列） */
  description?: string | null
  /** 価格（税込・円） */
  price: number
  /** 在庫数 */
  stock: number
  /** 画像の URL */
  image_urls: string[]
  /** タグ */
  tags: string[]
  /** 公開するか */
  is_published: boolean
  /** 並び順 */
  display_order: number
  /** カテゴリー */
  category: ProductCategory | null
}

/** 注文の確定で送る内容（Square のカードのトークンと配送先） */
export interface OrderPayload {
  /** お名前 */
  customer_name: string
  /** 確認メールの送り先 */
  customer_email: string
  /** 電話番号（任意） */
  customer_phone?: string
  /** 郵便番号 */
  postal_code: string
  /** 都道府県（送料の計算に使う） */
  prefecture: string
  /** 市区町村 */
  city: string
  /** 番地・建物名 */
  address_line1: string
  /** 建物名・部屋番号（任意） */
  address_line2?: string
  /** 備考（任意） */
  note?: string
  /** 注文する商品の ID と数量（金額はサーバーが最新の価格で計算する） */
  items: { product_id: string; quantity: number }[]
  /** Square のカード情報のトークン */
  source_id: string
}

/** 注文 1 件（管理画面の一覧で見る形） */
export interface Order {
  /** 注文の ID（UUID。画面の注文番号は先頭の区切りを大文字にしたもの） */
  id: string
  /** お名前 */
  customer_name: string
  /** メールアドレス */
  customer_email: string
  /** 電話番号 */
  customer_phone: string | null
  /** 郵便番号 */
  postal_code: string
  /** 都道府県 */
  prefecture: string
  /** 市区町村 */
  city: string
  /** 番地・建物名 */
  address_line1: string
  /** 建物名・部屋番号 */
  address_line2: string | null
  /** 備考 */
  note: string | null
  /** 商品の小計（円） */
  subtotal: number
  /** 送料（円） */
  shipping_fee: number
  /** 合計（円） */
  total: number
  /** 状態（paid: 支払い済み・未発送 など） */
  status: string
  /** Square の決済 ID */
  square_payment_id: string | null
  /** 配送業者 */
  carrier: string | null
  /** 追跡番号 */
  tracking_number: string | null
  /** 注文した日時（ISO 形式） */
  created_at: string
}

/** 注文の明細 1 行 */
export interface OrderItem {
  /** 明細の ID */
  id: string
  /** 注文の ID */
  order_id: string
  /** 商品の ID（商品を消したあとは null） */
  product_id: string | null
  /** 注文したときの商品名 */
  product_name: string
  /** 注文したときの単価（円） */
  price: number
  /** 数量 */
  quantity: number
}

/** 注文と明細（管理画面の注文の詳細） */
export type OrderDetail = Order & { items: OrderItem[] }

// 収支の計算（fiscalYear・computeFinances）は lib/finance.ts に移した。
// 以前からの import（テストなど）を壊さないよう、ここからも書き出す
export { fiscalYear, computeFinances, type ComputedFinances } from './finance'
