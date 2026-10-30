import type { ContactRecord, Event, Order } from '../apiTypes'

/** 認証不要の JSON API 呼び出しを受け取る型 */
type JsonRequest = <T>(path: string, options?: RequestInit) => Promise<T>

/** 認証付き JSON API 呼び出しを受け取る型 */
type AuthJsonRequest = <T>(path: string, options?: RequestInit) => Promise<T>

/** ダッシュボードの統計カードへ渡す件数 */
export interface DashboardStats {
  /** 未読のお問い合わせ件数 */
  unreadContacts: number
  /** 開催前・開催中のイベント件数 */
  activeEvents: number
  /** 支払い済みで未発送の注文件数 */
  pendingOrders: number
}

/**
 * ダッシュボード用統計の取得処理を作成する。通信と認証は api.ts の共通関数へ委ねる。
 * 1. お問い合わせと注文は認証付き、公開イベント一覧は認証なしで並列取得する
 * 2. 取得結果から未読お問い合わせ・イベント・支払い済み注文の件数を集計する
 * @param request - 認証不要の共通 JSON リクエスト
 * @param authRequest - 認証付きの共通 JSON リクエスト
 * @returns api.stats として公開する統計取得処理
 */
export function createDashboardStatsApi(request: JsonRequest, authRequest: AuthJsonRequest) {
  return {
    /**
     * ダッシュボード用の統計情報を一括取得する。
     * 1. 3種類の一覧を Promise.all で並列取得する
     * 2. 未読お問い合わせ・公開イベント・支払い済み注文の件数を数える
     * @returns 未読お問い合わせ・イベント・支払い済み注文の件数
     */
    stats: async (): Promise<DashboardStats> => {
      // 並列で取得した、お問い合わせ・公開イベント・注文の一覧
      const [contacts, events, orders] = await Promise.all([
        authRequest<ContactRecord[]>('/contacts'),
        request<Event[]>('/events?past=false'),
        authRequest<Order[]>('/orders'),
      ])
      // 取得した各一覧から統計カードに表示する件数をまとめる
      return {
        unreadContacts: contacts.filter((contact) => !contact.is_read).length,
        activeEvents: events.length,
        pendingOrders: orders.filter((order) => order.status === 'paid').length,
      }
    },
  }
}
