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
