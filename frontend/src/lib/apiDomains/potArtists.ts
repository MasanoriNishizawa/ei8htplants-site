import type { PotArtist } from '../apiTypes'

/** JSON API 呼び出しを受け取り、鉢作家領域の操作を組み立てる型 */
type JsonRequest = <T>(path: string, options?: RequestInit) => Promise<T>

/**
 * 鉢作家の API 操作を作成する。通信と認証は api.ts の共通関数へ委ねる。
 * 1. 公開一覧の取得には認証不要の request を使う
 * 2. 作家の追加・削除には認証付きの authRequest を使う
 * 3. 既存の URL・HTTP メソッド・JSON 本文・応答型・ID の URL 補間を保って操作を返す
 * @param request - 認証不要の共通 JSON リクエスト
 * @param authRequest - 認証付きの共通 JSON リクエスト
 * @returns api.potArtists として公開する鉢作家の操作
 */
export function createPotArtistsApi(request: JsonRequest, authRequest: JsonRequest) {
  return {
    /**
     * 価格計算で選択する鉢作家の一覧を取得する。
     * 1. 認証情報を付けない共通 request で既存の一覧 URL を呼び出す
     * 2. API 応答を鉢作家の配列として返す
     * @returns 鉢作家の一覧
     */
    list: () => request<PotArtist[]>('/pot-artists'),
    /**
     * 管理画面から鉢作家を追加する。
     * 1. 作家名を既存どおり name プロパティを持つ JSON 文字列にする
     * 2. 認証付きで既存 URL に POST し、作成された鉢作家を返す
     * @param name - 追加する作家名
     * @returns 登録された鉢作家
     */
    add: (name: string) =>
      authRequest<PotArtist>('/pot-artists', { method: 'POST', body: JSON.stringify({ name }) }),
    /**
     * 管理画面から指定した鉢作家を削除する。
     * 1. 受け取った ID を既存どおり URL に補間する
     * 2. 認証付きで DELETE し、API の削除結果を返す
     * @param id - 削除する鉢作家の ID
     * @returns 削除結果
     */
    delete: (id: string) =>
      authRequest<{ ok: boolean }>(`/pot-artists/${id}`, { method: 'DELETE' }),
  }
}
