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
