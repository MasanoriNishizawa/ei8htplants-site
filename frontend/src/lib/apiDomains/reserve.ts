import type { Reservation, ReservationPayload, WalkinReservationPayload } from '../apiTypes'

/** 認証不要の JSON API 呼び出しを受け取る型 */
type JsonRequest = <T>(path: string, options?: RequestInit) => Promise<T>

/** 認証付き JSON API 呼び出しを受け取る型 */
type AuthJsonRequest = <T>(path: string, options?: RequestInit) => Promise<T>

/** 共通処理を介さずキャンセル API を呼ぶ fetch 関数の型 */
type RawFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

/**
 * 予約領域の API 操作を作成する。通常の通信は共通 request に委ね、キャンセルだけ指定された fetch を直接使う。
 * 1. 公開フォームと管理画面の操作を従来どおりの認証境界で組み立てる
 * 2. キャンセルは共通の認証・エラー処理を通さず、Response をそのまま返す
 * @param request - 認証不要の共通 JSON リクエスト
 * @param authRequest - 認証付きの共通 JSON リクエスト
 * @param rawFetch - キャンセルで直接呼び出す fetch 関数
 * @param basePath - API の URL の先頭（通常は '/api'）
 * @returns api.reserve として公開する予約操作
 */
export function createReserveApi(
  request: JsonRequest,
  authRequest: AuthJsonRequest,
  rawFetch: RawFetch,
  basePath: string,
) {
  return {
    /**
     * 公開フォームからワークショップの予約を送る。
     * 1. 予約内容を従来どおり JSON 文字列にする
     * 2. 認証不要で POST /reserve を呼び出す
     * @param body - 予約フォームから送る内容
     * @returns 作成された予約
     */
    create: (body: ReservationPayload) =>
      request('/reserve', { method: 'POST', body: JSON.stringify(body) }),
    /**
     * 管理画面で予約一覧を取得する。
     * 1. eventId がある場合は URL エンコードしてクエリに付ける
     * 2. 認証付きで GET /reserves を呼び出す
     * @param eventId - 絞り込むイベントの ID（省略可）
     * @returns 予約一覧
     */
    list: (eventId?: string) =>
      authRequest<Reservation[]>(eventId ? `/reserves?event_id=${encodeURIComponent(eventId)}` : '/reserves'),
    /**
     * 管理画面で予約の状態を更新する。
     * 1. 予約 ID を URL に補間する
     * 2. 状態を JSON 化して認証付き PATCH を送る
     * @param id - 更新する予約の ID
     * @param status - 更新後の状態
     * @returns 更新された予約
     */
    updateStatus: (id: string, status: string) =>
      authRequest<Reservation>(`/reserves/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    /**
     * メールに含まれるキャンセル ID で予約をキャンセルする。
     * 1. 共通 request や認証処理を介さず、従来と同じ fetch オプションで送信する
     * 2. ステータス判定に使う Response をそのまま返す
     * @param token - メールに含まれるキャンセル ID
     * @returns キャンセル API の Response
     */
    cancel: (token: string) =>
      rawFetch(`${basePath}/reserve/cancel`, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }),
    /**
     * 管理画面で当日参加の予約を登録する。
     * 1. 当日参加の内容を JSON 化する
     * 2. 認証付きで POST /reserve/walkin を呼び出す
     * @param body - イベント・参加人数・任意の時間情報
     * @returns 登録された予約
     */
    addWalkin: (body: WalkinReservationPayload) =>
      authRequest<Reservation>('/reserve/walkin', { method: 'POST', body: JSON.stringify(body) }),
  }
}
