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
