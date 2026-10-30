export type {
  PageContent,
  Event,
  EventBody,
  WsSession,
  EventFinances,
  EventFinancesBody,
  EventAdminInfo,
  AdminInfoDashboardItem,
} from './apiTypes/events'

export { PRODUCT_CATEGORIES } from './apiTypes/commerce'
export type {
  ProductCategory,
  Product,
  ProductBody,
  OrderPayload,
  Order,
  OrderItem,
  OrderDetail,
} from './apiTypes/commerce'

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

/** 管理画面から当日参加の予約を登録するときに送る内容 */
export interface WalkinReservationPayload {
  /** 登録するイベントの ID */
  event_id: string
  /** 参加人数 */
  participants: number
  /** 時間枠の ID（任意） */
  session_id?: string
  /** 希望の時間（任意） */
  preferred_time?: string
  /** 予約日（YYYY-MM-DD、任意） */
  preferred_date?: string
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
