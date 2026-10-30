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
