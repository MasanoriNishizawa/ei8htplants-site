import type { MediaAppearance, MediaAppearanceBody } from '../apiTypes'

/** JSON API 呼び出しを受け取り、メディア掲載領域の API 操作を組み立てる型 */
type JsonRequest = <T>(path: string, options?: RequestInit) => Promise<T>

/**
 * メディア掲載の API 操作を作成する。通信と認証は api.ts の共通関数へ委ねる。
 * 1. 公開一覧の取得には認証不要の request を使う
 * 2. 管理画面からの追加・削除には認証付きの authRequest を使う
 * 3. 既存の URL・HTTP メソッド・JSON 本文・応答型・ID の URL 補間を保って操作を返す
 * @param request - 認証不要の共通 JSON リクエスト
 * @param authRequest - 認証付きの共通 JSON リクエスト
 * @returns api.mediaAppearances として公開するメディア掲載操作
 */
export function createMediaAppearancesApi(request: JsonRequest, authRequest: JsonRequest) {
  return {
    /**
     * 公開サイトで表示するメディア掲載一覧を取得する。
     * 1. 認証情報を付けない共通 request で既存の一覧 URL を呼び出す
     * 2. API 応答をメディア掲載の配列として返す
     * @returns メディア掲載の一覧
     */
    list: () => request<MediaAppearance[]>('/media-appearances'),
    /**
     * 管理画面からメディア掲載を追加する。
     * 1. 受け取った登録内容を既存どおり JSON 文字列にする
     * 2. 認証付きで既存 URL に POST し、作成された掲載情報を返す
     * @param body - 登録するメディア掲載の内容
     * @returns 登録されたメディア掲載
     */
    add: (body: MediaAppearanceBody) =>
      authRequest<MediaAppearance>('/media-appearances', { method: 'POST', body: JSON.stringify(body) }),
    /**
     * 管理画面から指定したメディア掲載を削除する。
     * 1. 受け取った ID を既存どおり URL に補間する
     * 2. 認証付きで DELETE し、API の削除結果を返す
     * @param id - 削除するメディア掲載の ID
     * @returns 削除結果
     */
    delete: (id: string) =>
      authRequest<{ ok: boolean }>(`/media-appearances/${id}`, { method: 'DELETE' }),
  }
}
