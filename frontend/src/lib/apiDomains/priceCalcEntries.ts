import type { PriceCalcEntry, PriceCalcEntryBody } from '../apiTypes'

/** 認証付き JSON API 呼び出しを受け取り、価格計算記録の操作を組み立てる型 */
type JsonRequest = <T>(path: string, options?: RequestInit) => Promise<T>

/**
 * 価格計算記録の API 操作を作成する。通信と認証は api.ts の共通関数へ委ねる。
 * 1. 一覧・追加・削除のすべてに認証付き authRequest を使う
 * 2. 既存の URL・HTTP メソッド・JSON 本文・応答型を保って操作を返す
 * @param authRequest - 認証付きの共通 JSON リクエスト
 * @returns api.priceCalcEntries として公開する価格計算記録の操作
 */
export function createPriceCalcEntriesApi(authRequest: JsonRequest) {
  return {
    /**
     * 管理画面で表示する価格計算記録の一覧を取得する。
     * 1. 認証付きの共通リクエストで既存の一覧 URL を呼び出す
     * 2. API 応答を価格計算記録の配列として返す
     * @returns 価格計算記録の一覧
     */
    list: () => authRequest<PriceCalcEntry[]>('/price-calc-entries'),
    /**
     * 管理画面から価格計算記録を追加する。
     * 1. 登録内容を既存どおり JSON 文字列にする
     * 2. 認証付きで既存 URL に POST し、作成された記録を返す
     * @param body - 登録する価格計算記録の内容
     * @returns 登録された価格計算記録
     */
    add: (body: PriceCalcEntryBody) =>
      authRequest<PriceCalcEntry>('/price-calc-entries', { method: 'POST', body: JSON.stringify(body) }),
    /**
     * 管理画面から指定した価格計算記録を削除する。
     * 1. 受け取った ID を既存どおりエンコードせず URL に補間する
     * 2. 認証付きで DELETE し、API の削除結果を返す
     * @param id - 削除する価格計算記録の ID
     * @returns 削除結果
     */
    delete: (id: string) =>
      authRequest<{ ok: boolean }>(`/price-calc-entries/${id}`, { method: 'DELETE' }),
  }
}
