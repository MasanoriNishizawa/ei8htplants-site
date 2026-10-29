import type {
  AdminInfoDashboardItem,
  Event,
  EventAdminInfo,
  EventBody,
  EventFinances,
  EventFinancesBody,
  PageContent,
  WsSession,
} from '../apiTypes'

/** JSON API 呼び出しを受け取り、イベント領域の API 操作を組み立てる型 */
type JsonRequest = <T>(path: string, options?: RequestInit) => Promise<T>

/**
 * イベント領域の API 操作を作成する。通信・認証処理は共通窓口から受け取って再利用する。
 * 1. 公開 API は request、管理 API は authRequest を使い分ける
 * 2. 既存の URL・HTTP メソッド・本文形式・応答変換を維持して操作を返す
 * @param request - 認証不要の共通 JSON リクエスト
 * @param authRequest - 認証付きの共通 JSON リクエスト
 * @returns api.events として公開するイベント操作
 */
export function createEventsApi(request: JsonRequest, authRequest: JsonRequest) {
  return {
    /** イベントの一覧を取る（past が true なら終了したイベント） */
    list: (past = false) => request<Event[]>(`/events?past=${past}`),
    /** イベントを 1 件取る（id かスラッグ。opts で cache などを足せる） */
    get: (id: string, opts?: RequestInit) => request<Event>(`/events/${id}`, opts),
    /** イベントを作る（管理者のみ） */
    create: (body: EventBody) =>
      authRequest<Event>('/events', { method: 'POST', body: JSON.stringify(body) }),
    /** イベントを更新する（管理者のみ） */
    update: (id: string, body: EventBody) =>
      authRequest<Event>(`/events/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    /** イベントを削除する（管理者のみ） */
    delete: (id: string) =>
      authRequest<{ ok: boolean }>(`/events/${id}`, { method: 'DELETE' }),
    /** イベントの収支を取る（管理者のみ。未保存なら 404） */
    getFinances: (id: string) =>
      authRequest<EventFinances>(`/events/${id}/finances`),
    /** イベントの収支を保存する（管理者のみ） */
    saveFinances: (id: string, body: EventFinancesBody) =>
      authRequest<EventFinances>(`/events/${id}/finances`, { method: 'PUT', body: JSON.stringify(body) }),
    /** 全イベントの収支をまとめて取る（管理者のみ） */
    getAllFinances: () =>
      authRequest<EventFinances[]>('/events/finances'),
    /** ワークショップの時間枠を取る（date を渡すとその日の枠だけ） */
    getSessions: (id: string, date?: string) =>
      request<WsSession[]>(`/events/${id}/sessions${date ? `?date=${encodeURIComponent(date)}` : ''}`),
    /** ワークショップの時間枠をまとめて保存する（管理者のみ。id の無い行は新しく作る） */
    saveSessions: (id: string, sessions: { id?: string; time_label: string; max_participants: number }[]) =>
      authRequest<WsSession[]>(`/events/${id}/sessions`, { method: 'PUT', body: JSON.stringify({ sessions }) }),
    /** イベントページの中身を保存する（管理者のみ） */
    savePageContent: (id: string, page_content: PageContent) =>
      authRequest<Event>(`/events/${id}/page`, { method: 'PATCH', body: JSON.stringify({ page_content }) }),
    /** イベントの管理情報（搬入・搬出時間・宿泊・出店料など）を取得する */
    getAdminInfo: (id: string) =>
      authRequest<EventAdminInfo>(`/events/${id}/admin-info`),
    /** イベントの管理情報を保存する */
    saveAdminInfo: (id: string, body: EventAdminInfo) =>
      authRequest<{ ok: boolean }>(`/events/${id}/admin-info`, { method: 'PUT', body: JSON.stringify(body) }),
    /**
     * 管理画面ダッシュボード用に、イベントごとの管理情報（搬入・ホテル・出店料）をまとめて取得する
     * 対象は終了日が今日以降のイベントと、終了済みでも出店料が未払いのイベント（並びは開始日の昇順。絞り込みはバックエンド）
     * @returns イベントごとの管理情報の一覧
     */
    getAdminInfoDashboard: async (): Promise<AdminInfoDashboardItem[]> => {
      // 1. ダッシュボードに表示する管理情報の一覧を取得する
      const res = await authRequest<{ items: AdminInfoDashboardItem[] }>('/events/admin-info/dashboard')
      // 2. 既存契約に合わせ、応答ラッパーではなく items だけを返す
      return res.items
    },
  }
}
