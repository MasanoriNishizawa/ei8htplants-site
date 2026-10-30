import type { ChatQA, ChatQABody } from '../apiTypes'

/** 認証付き JSON API 呼び出しを受け取る型 */
type AuthJsonRequest = <T>(path: string, options?: RequestInit) => Promise<T>

/**
 * AI チャット用 Q&A の API 操作を作成する。通信と認証は api.ts の共通関数へ委ねる。
 * 1. 一覧・追加・更新・削除の全操作に認証付きリクエストを使う
 * 2. 既存の URL、HTTP メソッド、JSON 本文、応答型を保った操作を返す
 * @param authRequest - 認証付きの共通 JSON リクエスト
 * @returns api.chatQa として公開する Q&A 操作
 */
export function createChatQaApi(authRequest: AuthJsonRequest) {
  return {
    /**
     * 無効のものも含む Q&A 全件を管理画面用に取得する。
     * 1. 認証付きで既存の ?all=true 付き一覧 URL を呼び出す
     * 2. 応答を ChatQA の配列として返す
     * @returns 有効・無効を含む Q&A 一覧
     */
    list: () => authRequest<ChatQA[]>('/chat-qa?all=true'),
    /**
     * 管理画面から Q&A を追加する。
     * 1. 受け取った Q&A 本文を既存どおり JSON 文字列にする
     * 2. 認証付きで既存 URL に POST し、作成結果を返す
     * @param body - 追加する質問・回答・表示設定
     * @returns 登録された Q&A
     */
    add: (body: ChatQABody) =>
      authRequest<ChatQA>('/chat-qa', { method: 'POST', body: JSON.stringify(body) }),
    /**
     * 管理画面から指定した Q&A を更新する。
     * 1. ID を encodeURIComponent で URL エンコードする
     * 2. 認証付きで既存 URL に PATCH し、更新結果を返す
     * @param id - 更新する Q&A の ID
     * @param body - 更新後の質問・回答・表示設定
     * @returns 更新された Q&A
     */
    update: (id: string, body: ChatQABody) =>
      authRequest<ChatQA>(`/chat-qa/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
    /**
     * 管理画面から指定した Q&A を削除する。
     * 1. ID を encodeURIComponent で URL エンコードする
     * 2. 認証付きで既存 URL に DELETE し、削除結果を返す
     * @param id - 削除する Q&A の ID
     * @returns 削除結果
     */
    delete: (id: string) =>
      authRequest<{ ok: boolean }>(`/chat-qa/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  }
}
