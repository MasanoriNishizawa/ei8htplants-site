import type { SiteAsset } from '../apiTypes'

/** JSON API 呼び出しを受け取り、公開ページ用画像領域の操作を組み立てる型 */
type JsonRequest = <T>(path: string, options?: RequestInit) => Promise<T>

/**
 * 公開ページ用画像の API 操作を作成する。通信と認証は api.ts の共通関数へ委ねる。
 * 1. 画像 URL の取得には認証不要の request を使う
 * 2. 管理画面からの保存には authRequest を使い、既存の PUT と JSON 本文を保つ
 * @param request - 認証不要の共通 JSON リクエスト
 * @param authRequest - 認証付きの共通 JSON リクエスト
 * @returns api.siteAssets として公開する画像操作
 */
export function createSiteAssetsApi(request: JsonRequest, authRequest: JsonRequest) {
  return {
    /** 公開ページ用の画像 URL を取得する */
    get: (key: string) => request<SiteAsset>(`/site-assets/${encodeURIComponent(key)}`),
    /** 管理画面から画像 URL を保存する */
    save: (key: string, url: string) =>
      authRequest<SiteAsset>(`/site-assets/${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify({ url }) }),
  }
}
