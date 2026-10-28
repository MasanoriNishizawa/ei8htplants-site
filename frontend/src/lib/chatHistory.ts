// 公開 AI チャット（pages/Chat.tsx）の会話履歴を、API（POST /api/chat）に送る形に整える処理。
// サーバー（backend/app/routes/chat.py）の入力チェックに合わない履歴を送ると 422 になるため、
// 送る前にここで件数・文字数・並び順を整える。テストしやすいよう画面から分けている

/** 画面に表示するチャットメッセージ */
export interface ChatMessage {
  /** 送り手（'user' = 利用者、'model' = AI） */
  role: 'user' | 'model'
  /** 本文 */
  content: string
  /**
   * true のとき画面に表示するだけで、API に送る会話履歴には入れない。
   * エラーや回数超過などの案内は AI の返答ではないため、履歴に入れると AI に誤った文脈を渡し、
   * 件数の上限（MAX_SEND_MESSAGES）にも早く届いてしまう
   */
  localOnly?: boolean
}

/** API に送る 1 件分のメッセージ（表示用の印を除いたもの） */
export interface ChatSendMessage {
  /** 送り手 */
  role: ChatMessage['role']
  /** 本文（MAX_MESSAGE_CHARS 文字まで） */
  content: string
}

/** API に送る会話履歴の最大件数。サーバー（backend/app/routes/chat.py）の MAX_MESSAGES = 40 と合わせる */
export const MAX_SEND_MESSAGES = 40

/**
 * API に送る 1 件の本文の最大文字数。サーバーの MAX_MESSAGE_CHARS = 2000 と合わせる。
 * 入力欄の maxLength にも同じ値を使う
 */
export const MAX_MESSAGE_CHARS = 2000

/**
 * 本文を MAX_MESSAGE_CHARS 文字までに切り詰める。
 * サーバー（Python）は文字をコードポイント単位で数えるので、Array.from で同じ単位に分けて切る
 * （絵文字などのサロゲートペアを途中で切って壊れた文字を送らないため）
 * @param content - 本文
 * @returns 最大 MAX_MESSAGE_CHARS 文字の本文
 */
export function clampContent(content: string): string {
  if (content.length <= MAX_MESSAGE_CHARS) return content
  return Array.from(content).slice(0, MAX_MESSAGE_CHARS).join('')
}

/**
 * 画面の会話履歴から、API に送る履歴を作る（サーバーの入力チェックで 422 にならない形にする）
 * 1. 表示専用の案内（localOnly）と、本文が空白だけのものを除く
 * 2. 返事（model）が付かなかった過去の利用者のメッセージを除く。
 *    エラーや回数超過で返事が無かった質問を残すと user が続けて並ぶため、
 *    「直後が model のもの」と「最後の 1 件（今回の質問）」だけを残す。
 *    これで送る履歴は user と model が交互になる（先頭の挨拶 model はそのまま残る）
 * 3. 直近 MAX_SEND_MESSAGES 件だけにする（最後は今回の質問のまま）
 * 4. 各本文を MAX_MESSAGE_CHARS 文字までに切る（AI の長い返答が履歴に残っていても送れるように）
 * @param history - 画面に表示している会話履歴（最後が今回の利用者のメッセージであること）
 * @returns API に送る { role, content } の配列
 */
export function toSendHistory(history: ChatMessage[]): ChatSendMessage[] {
  // 1. 送ってよいメッセージだけにする（sendable に入れる）（本文が文字列でないものも念のため除き、送信処理を壊さない）
  const sendable = history.filter(
    (m) => !m.localOnly && typeof m.content === 'string' && m.content.trim() !== '',
  )
  // 2. 返事の付かなかった過去の質問を除く（user と model が交互に並ぶ履歴）
  const paired = sendable.filter((m, i) => {
    if (m.role !== 'user') return true
    // 末尾の user 発話は今回の質問なので、応答が無くても履歴に含める
    const isLast = i === sendable.length - 1
    return isLast || sendable[i + 1].role === 'model'
  })
  // 3. 直近の件数に絞り、4. 本文を切り詰める
  return paired
    .slice(-MAX_SEND_MESSAGES)
    .map((m) => ({ role: m.role, content: clampContent(m.content) }))
}
