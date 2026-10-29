import type { Stockist, StockistBody } from '../apiTypes'

/** JSON API 呼び出しを受け取り、取扱店領域の API 操作を組み立てる型 */
type JsonRequest = <T>(path: string, options?: RequestInit) => Promise<T>

/**
 * 取扱店領域の API 操作を作成する。通信と認証は api.ts の共通関数へ委ねる。
 * 1. 公開一覧には request を使う
 * 2. 管理者向けの追加・更新・削除には authRequest を使う
 * @param request - 認証不要の共通 JSON リクエスト
 * @param authRequest - 認証付きの共通 JSON リクエスト
 * @returns api.stockists として公開する取扱店操作
 */
export function createStockistsApi(request: JsonRequest, authRequest: JsonRequest) {
  return {
    /** 取扱店の一覧を取る */
    list: () => request<Stockist[]>('/stockists'),
    /** 取扱店を追加する（管理者のみ） */
    add: (body: StockistBody) =>
      authRequest<Stockist>('/stockists', { method: 'POST', body: JSON.stringify(body) }),
    /** 取扱店を更新する（管理者のみ） */
    patch: (id: string, body: StockistBody) =>
      authRequest<Stockist>(`/stockists/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    /** 取扱店を削除する（管理者のみ） */
    delete: (id: string) =>
      authRequest<{ ok: boolean }>(`/stockists/${id}`, { method: 'DELETE' }),
  }
}
