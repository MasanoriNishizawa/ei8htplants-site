/*
 * WS 予約のステータスの表示ラベル・色・選択肢をまとめた定数
 * 管理画面の「WS予約」（Reservations.tsx）と「イベント別の予約」（EventReservations.tsx）で共通に使う
 *
 * DB の status の値は次の 3 つ
 * - pending: 受付済（予約フォームから入った直後の状態。いまはこれが「受付済」の本来の値）
 * - confirmed: 以前の運用で使っていた「確定」。いまは pending と同じ「受付済」として表示する（古いデータの互換用）
 * - cancelled: キャンセル（利用者がメールのリンクから取り消した、または管理者が変更した）
 */

/** ステータスの値 → 画面・印刷・CSV に出す日本語のラベル。ここに無い値は値そのものを表示する */
export const STATUS_LABELS: Record<string, string> = {
  pending: '受付済',
  confirmed: '受付済',
  cancelled: 'キャンセル',
}

/**
 * ステータスの値 → バッジの背景色（bg）と文字色（color）
 * 受付済は緑、キャンセルは赤。ここに無い値は呼び出し側で pending の色を使う
 */
export const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending: { bg: '#d4edda', color: '#155724' },
  confirmed: { bg: '#d4edda', color: '#155724' },
  cancelled: { bg: '#f8d7da', color: '#721c24' },
}

/**
 * ステータス変更のドロップダウンに出す選択肢（value: 保存する値、label: 表示名）
 * confirmed は古いデータの互換用なので選択肢には出さない（受付済は pending で保存する）
 */
export const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'pending', label: '受付済' },
  { value: 'cancelled', label: 'キャンセル' },
]
