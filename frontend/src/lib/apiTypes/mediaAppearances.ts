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
