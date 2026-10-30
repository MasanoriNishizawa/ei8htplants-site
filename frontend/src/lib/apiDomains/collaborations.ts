import type { Collaboration, CollaborationPayload } from '../apiTypes'

/** JSON API 呼び出しを受け取り、コラボレーション事例の操作を組み立てる型 */
type JsonRequest = <T>(path: string, options?: RequestInit) => Promise<T>

/**
 * コラボレーション事例の API 操作を作成する。通信と認証は api.ts の共通関数へ委ねる。
 * 1. 公開一覧の取得には認証不要の request を使う
 * 2. 管理者による追加・削除には authRequest を使う
 * 3. 既存の URL・HTTP メソッド・JSON 本文・応答型を保って操作を返す
 * @param request - 認証不要の共通 JSON リクエスト
 * @param authRequest - 認証付きの共通 JSON リクエスト
 * @returns api.collaborations として公開するコラボレーション操作
 */
export function createCollaborationsApi(request: JsonRequest, authRequest: JsonRequest) {
  return {
    /**
     * 公開サイトのコラボレーション事例一覧を取得する。
     * @returns コラボレーション事例の一覧
     */
    list: () => request<Collaboration[]>('/collaborations'),
    /**
     * 管理画面からコラボレーション事例を追加する。
     * @param body - 登録するコラボレーション事例の内容
     * @returns 登録されたコラボレーション事例
     */
    add: (body: CollaborationPayload) =>
      authRequest<Collaboration>('/collaborations', { method: 'POST', body: JSON.stringify(body) }),
    /**
     * 管理画面から指定したコラボレーション事例を削除する。
     * @param id - 削除するコラボレーション事例の ID
     * @returns 削除結果
     */
    delete: (id: string) =>
      authRequest<{ ok: boolean }>(`/collaborations/${id}`, { method: 'DELETE' }),
  }
}
