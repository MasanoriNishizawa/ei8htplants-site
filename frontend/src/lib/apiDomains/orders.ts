import type { Order, OrderDetail, OrderPayload } from '../apiTypes'

/** 認証不要の JSON API 呼び出しを受け取る型 */
type JsonRequest = <T>(path: string, options?: RequestInit) => Promise<T>

/** 認証付き JSON API 呼び出しを受け取る型 */
type AuthJsonRequest = <T>(path: string, options?: RequestInit) => Promise<T>

/**
 * 注文領域の API 操作を作成する。通信と認証は api.ts の共通関数へ委ねる。
 * 1. 注文確定は認証不要の request、それ以外の注文管理操作は authRequest を使う
 * 2. 既存の URL・HTTP メソッド・JSON 本文・応答型を保って操作を返す
 * @param request - 認証不要の共通 JSON リクエスト
 * @param authRequest - 認証付きの共通 JSON リクエスト
 * @returns api.orders として公開する注文操作
 */
export function createOrdersApi(request: JsonRequest, authRequest: AuthJsonRequest) {
  return {
    /**
     * 公開サイトから注文を確定する。
     * 1. 注文内容を既存どおり JSON 文字列にする
     * 2. 認証不要で POST /orders を呼び出し、注文 ID を返す
     * @param body - 決済トークンと配送先を含む注文内容
     * @returns 作成された注文の ID
     */
    create: (body: OrderPayload) =>
      request<{ order_id: string }>('/orders', { method: 'POST', body: JSON.stringify(body) }),
    /**
     * 管理画面から注文一覧を取得する。
     * 1. 認証付きで GET /orders を呼び出す
     * @returns 注文一覧
     */
    list: () => authRequest<Order[]>('/orders'),
    /**
     * 管理画面から注文を明細つきで取得する。
     * 1. 受け取った注文 ID を既存どおり URL に補間する
     * 2. 認証付きで注文詳細を取得する
     * @param id - 取得する注文の ID
     * @returns 注文と明細
     */
    get: (id: string) => authRequest<OrderDetail>(`/orders/${id}`),
    /**
     * 管理画面から注文の状態と配送情報を更新する。
     * 1. 受け取った注文 ID を既存どおり URL に補間する
     * 2. status・carrier・tracking_number を既存どおり JSON 化して認証付き PATCH を送る
     *    trackingNumber が undefined の場合は JSON.stringify により従来どおり本文から省かれる
     * @param id - 更新する注文の ID
     * @param status - 更新後の注文状態
     * @param carrier - 配送業者（省略可）
     * @param trackingNumber - 追跡番号（省略可）
     * @returns 更新された注文
     */
    updateStatus: (id: string, status: string, carrier?: string, trackingNumber?: string) =>
      authRequest<Order>(`/orders/${id}`, { method: 'PATCH', body: JSON.stringify({ status, carrier, tracking_number: trackingNumber }) }),
  }
}
