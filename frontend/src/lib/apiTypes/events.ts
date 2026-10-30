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

