/** ワークショップの予約フォームから送る内容 */
export interface ReservationPayload {
  /** 予約するイベントの ID */
  event_id: string
  /** お名前 */
  name: string
  /** 確認メールの送り先 */
  email: string
  /** 電話番号（任意） */
  phone?: string
  /** 参加人数 */
  participants: number
  /** 備考（任意） */
  note?: string
  /** 選んだ時間枠の ID */
  session_id?: string
  /** 植物を持ち込むか */
  bring_plant: boolean
  /** 鉢を持ち込むか */
  bring_pot: boolean
  /** 予約日（YYYY-MM-DD） */
  preferred_date?: string
  /** 希望の時間（時間枠を使わないときの文字） */
  preferred_time?: string
  /** 確認メールの言語（'ja' | 'en'） */
  lang?: string
}

/** 管理画面から当日参加の予約を登録するときに送る内容 */
export interface WalkinReservationPayload {
  /** 登録するイベントの ID */
  event_id: string
  /** 参加人数 */
  participants: number
  /** 時間枠の ID（任意） */
  session_id?: string
  /** 希望の時間（任意） */
  preferred_time?: string
  /** 予約日（YYYY-MM-DD、任意） */
  preferred_date?: string
}

/** ワークショップの予約 1 件（管理画面で見る形） */
export interface Reservation {
  /** 予約の ID */
  id: string
  /** イベントの ID */
  event_id: string
  /** お名前 */
  name: string
  /** メールアドレス */
  email: string
  /** 電話番号 */
  phone: string | null
  /** 参加人数 */
  participants: number
  /** 備考 */
  note: string | null
  /** 状態（pending: 受付済 / confirmed: 以前の「確定」/ cancelled: キャンセル。lib/reservationConstants.ts） */
  status: string
  /** 時間枠の ID */
  session_id: string | null
  /** 植物を持ち込むか */
  bring_plant: boolean
  /** 鉢を持ち込むか */
  bring_pot: boolean
  /** 予約日（YYYY-MM-DD） */
  preferred_date: string | null
  /** 希望の時間 */
  preferred_time: string | null
  /** 受け付けた日時（ISO 形式） */
  created_at: string
  /** 確認メールの送信に失敗したか（記録が無ければ null） */
  email_failed: boolean | null
}
