import type { Product, ProductBody } from '../apiTypes'

/** 認証不要の JSON API 呼び出しを受け取る型 */
type JsonRequest = <T>(path: string, options?: RequestInit) => Promise<T>

/** 認証付き JSON API 呼び出しを受け取る型 */
type AuthJsonRequest = <T>(path: string, options?: RequestInit) => Promise<T>

/**
 * ショップの商品領域の API 操作を作成する。通信と認証は api.ts の共通関数へ委ねる。
 * 1. 公開一覧と商品詳細は認証不要の request を使う
 * 2. 管理一覧と作成・更新・削除・在庫変更は認証付き authRequest を使う
 * 3. 既存の URL・HTTP メソッド・JSON 本文・応答型を保って操作を返す
 * @param request - 認証不要の共通 JSON リクエスト
 * @param authRequest - 認証付きの共通 JSON リクエスト
 * @returns api.products として公開する商品操作
 */
export function createProductsApi(request: JsonRequest, authRequest: AuthJsonRequest) {
  return {
    /**
     * 商品一覧を取得する。
     * 1. all が true なら認証付きで ?all=true を付けた一覧 URL を呼び出す
     * 2. それ以外は認証不要で公開商品一覧の URL を呼び出す
     * @param all - true なら非公開商品も含む全件を取得する
     * @returns 商品一覧
     */
    list: (all = false) =>
      all ? authRequest<Product[]>('/products?all=true') : request<Product[]>('/products'),
    /**
     * 商品を 1 件取得する。
     * 1. 受け取った ID を既存どおり URL に補間する
     * 2. 認証不要の共通リクエストで商品詳細を取得する
     * @param id - 取得する商品の ID
     * @returns 商品
     */
    get: (id: string) => request<Product>(`/products/${id}`),
    /**
     * 管理画面から商品を作成する。
     * 1. 商品本文を既存どおり JSON 文字列にする
     * 2. 認証付きで POST し、作成結果を返す
     * @param body - 作成する商品の内容
     * @returns 作成された商品
     */
    create: (body: ProductBody) =>
      authRequest<Product>('/products', { method: 'POST', body: JSON.stringify(body) }),
    /**
     * 管理画面から商品を更新する。
     * 1. 受け取った ID を既存どおり URL に補間する
     * 2. 商品本文を JSON 文字列にし、認証付きで PUT する
     * @param id - 更新する商品の ID
     * @param body - 更新する商品の内容
     * @returns 更新された商品
     */
    update: (id: string, body: ProductBody) =>
      authRequest<Product>(`/products/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    /**
     * 管理画面から商品を削除する。
     * 1. 受け取った ID を既存どおり URL に補間する
     * 2. 認証付きで DELETE し、削除結果を返す
     * @param id - 削除する商品の ID
     * @returns 削除結果
     */
    delete: (id: string) =>
      authRequest<{ ok: boolean }>(`/products/${id}`, { method: 'DELETE' }),
    /**
     * 管理画面から商品の在庫数を変更する。
     * 1. 在庫数を既存どおり { stock } の JSON 本文にする
     * 2. 商品 ID の在庫 URL へ認証付き PATCH を送り、更新後の商品を返す
     * @param id - 在庫数を変更する商品の ID
     * @param stock - 変更後の在庫数
     * @returns 在庫数を更新した商品
     */
    updateStock: (id: string, stock: number) =>
      authRequest<Product>(`/products/${id}/stock`, { method: 'PATCH', body: JSON.stringify({ stock }) }),
  }
}
