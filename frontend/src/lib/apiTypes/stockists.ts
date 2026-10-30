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
