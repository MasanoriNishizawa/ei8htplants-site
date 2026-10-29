import type { GalleryBody, GalleryImage } from '../apiTypes'

/** JSON API 呼び出しを受け取り、ギャラリー領域の API 操作を組み立てる型 */
type JsonRequest = <T>(path: string, options?: RequestInit) => Promise<T>

/**
 * ギャラリー領域の API 操作を作成する。共通窓口から JSON 通信関数を受け取る。
 * 1. 公開一覧には request を使い、管理操作には authRequest を使う
 * 2. 既存の URL・HTTP メソッド・本文形式・応答型を保った操作を返す
 * @param request - 認証不要の共通 JSON リクエスト
 * @param authRequest - 認証付きの共通 JSON リクエスト
 * @returns api.gallery として公開するギャラリー操作
 */
export function createGalleryApi(request: JsonRequest, authRequest: JsonRequest) {
  return {
    /** ギャラリーの画像を取る（brand を渡すと、その値と一致する画像だけ） */
    list: (brand?: string) =>
      request<GalleryImage[]>(brand ? `/gallery?brand=${encodeURIComponent(brand)}` : '/gallery'),
    /** 画像を追加する（管理者のみ） */
    add: (body: GalleryBody) =>
      authRequest<GalleryImage>('/gallery', { method: 'POST', body: JSON.stringify(body) }),
    /** 画像の並び順を変える（管理者のみ） */
    updateOrder: (id: string, display_order: number) =>
      authRequest<GalleryImage>(`/gallery/${id}`, { method: 'PATCH', body: JSON.stringify({ display_order }) }),
    /** 画像を削除する（管理者のみ） */
    delete: (id: string) =>
      authRequest<{ ok: boolean }>(`/gallery/${id}`, { method: 'DELETE' }),
  }
}
