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

/** サイトページに表示する管理画像 */
export interface SiteAsset {
  /** 固定の画像設定キー */
  key: string
  /** Storage の公開 URL。空文字なら未設定 */
  url: string
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

/**
 * 価格計算の種類
 * - production: 生産。販売価格 = 卸価格の 2 倍
 * - purchase: 仕入れ。目標原価率から推奨価格を計算
 * - seedling: 実生（ei8ht plants・Habitat Oides だけ）。上代 = 種子 20 粒の値段（Habitat Oides は + 鉢）
 */
export type PriceCalcMode = 'production' | 'purchase' | 'seedling'

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
  /** 計算の種類（生産・仕入れ）。種類を保存する前（021 マイグレーションより前）の記録は null */
  mode: PriceCalcMode | null
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
  /** 計算の種類（生産・仕入れ）。省略すると null で保存される */
  mode?: PriceCalcMode | null
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
