import type { ContactPayload, ContactRecord } from '../apiTypes'

/** JSON API 呼び出しを受け取り、お問い合わせ領域の操作を組み立てる型 */
type JsonRequest = <T>(path: string, options?: RequestInit) => Promise<T>

/**
 * お問い合わせ領域の API 操作を作成する。通信と認証は api.ts の共通関数へ委ねる。
 * 1. 公開フォームの送信には認証不要の request を使う
 * 2. 管理画面の一覧・既読変更・返信には authRequest を使う
 * 3. 既存の URL・HTTP メソッド・JSON 本文・応答型を保って操作を返す
 * @param request - 認証不要の共通 JSON リクエスト
 * @param authRequest - 認証付きの共通 JSON リクエスト
 * @returns api.contact として公開するお問い合わせ操作
 */
export function createContactApi(request: JsonRequest, authRequest: JsonRequest) {
  return {
    /**
     * 公開フォームのお問い合わせを送信する。
     * @param body - 送信者名・メールアドレス・本文
     * @returns 送信結果
     */
    send: (body: ContactPayload) =>
      request<{ ok: boolean }>('/contact', { method: 'POST', body: JSON.stringify(body) }),
    /**
     * 管理画面のお問い合わせ一覧を取得する。
     * @returns お問い合わせの一覧
     */
    list: () => authRequest<ContactRecord[]>('/contacts'),
    /**
     * 管理画面でお問い合わせの既読状態を変更する。
     * @param id - お問い合わせ ID
     * @param is_read - 変更後の既読状態
     * @returns 更新後のお問い合わせ
     */
    markRead: (id: string, is_read: boolean) =>
      authRequest<ContactRecord>(`/contacts/${id}`, { method: 'PATCH', body: JSON.stringify({ is_read }) }),
    /**
     * 管理画面からお問い合わせにメールで返信する。
     * @param id - お問い合わせ ID
     * @param subject - 返信メールの件名
     * @param body - 返信メールの本文
     * @returns 返信処理の結果
     */
    reply: (id: string, subject: string, body: string) =>
      authRequest<{ ok: boolean }>(`/contacts/${id}/reply`, { method: 'POST', body: JSON.stringify({ subject, body }) }),
  }
}
