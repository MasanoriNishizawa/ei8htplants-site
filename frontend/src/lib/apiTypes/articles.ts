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
