import type { ChatSendMessage } from '../chatHistory'

/** 生の fetch を受け取り、公開チャット API の送信操作を組み立てる型 */
type RawFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

/**
 * 公開サイトの AI チャット API 操作を作成する。
 * 1. 認証や共通の HTTP エラー変換を行わない生の fetch を受け取る
 * 2. 422・429 などを画面が判定できるよう、HTTP エラーでも Response をそのまま返す
 * @param rawFetch - Response を加工せず返す fetch 関数
 * @returns api.chat として公開するチャット送信操作
 */
export function createChatApi(rawFetch: RawFetch) {
  // 公開サイトのチャット送信操作
  return {
    /**
     * 会話履歴を送って AI の返事を受け取る。
     * 1. POST /api/chat に no-store と JSON ヘッダーを付ける
     * 2. HTTP エラーを含め、fetch が返した Response をそのまま返す
     * @param messages - 送る会話履歴（最後は利用者の発言）
     * @returns サーバーの Response（成功時の本文は { reply: string }）
     */
    send: (messages: ChatSendMessage[]): Promise<Response> =>
      rawFetch('/api/chat', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
      }),
  }
}
