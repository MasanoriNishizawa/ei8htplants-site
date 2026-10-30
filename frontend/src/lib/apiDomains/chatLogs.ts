import type { ChatLog } from '../apiTypes'

/** JSON API 呼び出しを受け取り、会話ログ領域の操作を組み立てる型 */
type JsonRequest = <T>(path: string, options?: RequestInit) => Promise<T>

/**
 * 会話ログ領域の API 操作を作成する。通信と認証は api.ts の共通関数へ委ねる。
 * 1. 管理画面の一覧取得に認証付きリクエストを使う
 * 2. 既存の URL・GET メソッド・応答型を保って操作を返す
 * @param authRequest - 認証付きの共通 JSON リクエスト
 * @returns api.chatLogs として公開する会話ログ操作
 */
export function createChatLogsApi(authRequest: JsonRequest) {
  // 管理画面に公開する会話ログの取得操作
  return {
    /**
     * 管理画面で新しい順に最大 200 件の会話ログを取得する。
     * @returns 会話ログの一覧
     */
    list: () => authRequest<ChatLog[]>('/chat-logs'),
  }
}
