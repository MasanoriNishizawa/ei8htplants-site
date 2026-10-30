/** JSON API 呼び出しを受け取り、送料領域の API 操作を組み立てる型 */
type JsonRequest = <T>(path: string, options?: RequestInit) => Promise<T>

/**
 * 送料領域の API 操作を作成する。通信は api.ts の共通関数へ委ねる。
 * 1. 送料取得と都道府県一覧のどちらも認証不要の request を使う
 * 2. 既存の URL・GET メソッド・応答型を保って操作を返す
 * @param request - 認証不要の共通 JSON リクエスト
 * @returns api.shipping として公開する送料操作
 */
export function createShippingApi(request: JsonRequest) {
  return {
    /**
     * 指定した都道府県の送料を取得する。
     * @param prefecture - 送料を調べる都道府県名
     * @returns 送料の金額
     */
    getRate: (prefecture: string) =>
      request<{ fee: number }>(`/shipping/rate?prefecture=${encodeURIComponent(prefecture)}`),
    /**
     * 送料設定がある都道府県の一覧を取得する。
     * @returns 都道府県名の一覧
     */
    getPrefectures: () => request<string[]>('/shipping/prefectures'),
  }
}
