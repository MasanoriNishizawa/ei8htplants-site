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
