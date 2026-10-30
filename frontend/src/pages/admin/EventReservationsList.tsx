import { STATUS_LABELS, STATUS_COLORS, STATUS_OPTIONS } from '../../lib/reservationConstants'
import { formatJstDate } from '../../lib/localDate'
import { clickableProps } from './a11y'
import type { ReservationWithTime } from './eventReservationExports'

/** PC テーブルに表示する項目名。順序は既存の一覧表示に合わせる */
const HEADERS = ['受付日', 'お名前', 'メール', '電話', '予約日', '予約時間', '人数', '持込', '備考', 'ステータス']

/** 予約一覧の表示に必要なデータと、親画面へ通知する操作 */
interface EventReservationsListProps {
  /** セッション等で絞り込んだ表示対象の予約 */
  reservations: ReservationWithTime[]
  /** 現在ステータスを更新している予約の ID。更新中でなければ null */
  updatingId: string | null
  /** 予約カードを選び、親画面で詳細モーダルを開く */
  onSelectReservation: (reservation: ReservationWithTime) => void
  /** ステータス変更を親画面へ依頼する */
  onStatusUpdate: (reservationId: string, status: string) => void
}

/** 絞り込み済みの予約をモバイルカードと PC テーブルで表示する controlled component。
 * データ取得や状態管理は行わず、選択とステータス変更を親画面へ通知する。
 * @param props 予約一覧、更新中 ID、予約選択とステータス更新の callback
 * @returns レスポンシブな予約一覧表示
 */
export default function EventReservationsList({
  reservations,
  updatingId,
  onSelectReservation,
  onStatusUpdate,
}: EventReservationsListProps) {
  return (
    <>
      {/* reservation-cards は CSS の画面幅ルールに従い、モバイル時にカード一覧を表示する */}
      <div className="reservation-cards">
        {reservations.map((reservation) => {
          /** ステータスのバッジの色（未知のステータスは「受付済」の色） */
          const statusColor = STATUS_COLORS[reservation.status] ?? STATUS_COLORS.pending
          return (
            <div
              key={reservation.id}
              {...clickableProps(() => onSelectReservation(reservation))}
              aria-label={`${reservation.name} さんの予約の詳細を開く`}
              style={{ background: '#fff', border: '1px solid #e8e8f0', borderRadius: 6, padding: '14px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}
            >
              {/* 白い枠と余白でカードを区切り、氏名・要約とステータスを両端に配置する */}
              <div style={{ minWidth: 0 }}>
                {/* 長い氏名は一行に収め、カード幅を超えた分を省略記号で示す */}
                <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{reservation.name}</div>
                {/* 予約日時と人数を控えめな文字色・サイズで氏名の下にまとめる */}
                <div style={{ fontSize: 12, color: 'var(--c-muted)' }}>
                  {[reservation.session_time ?? reservation.preferred_time, reservation.preferred_date].filter(Boolean).join(' / ') || '時間未定'}
                  {' · '}{reservation.participants}名
                </div>
              </div>
              {/* 状態ごとの色を使ったバッジを固定幅で保ち、氏名領域に押し縮められないようにする */}
              <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 4, fontSize: 12, fontWeight: 500, background: statusColor.bg, color: statusColor.color, flexShrink: 0 }}>
                {STATUS_LABELS[reservation.status] ?? reservation.status}
              </span>
            </div>
          )
        })}
        {/* 一覧が空のとき、中央寄せと上下余白で案内を分かりやすく表示する */}
        {reservations.length === 0 && (
          <p style={{ textAlign: 'center', padding: '40px 0', color: 'var(--c-muted)' }}>予約はありません。</p>
        )}
      </div>

      {/* reservation-table は CSS の画面幅ルールに従い、PC 時に全項目のテーブルを表示する */}
      {/* 横幅が狭い場合は表だけを横スクロールにして、各列の内容を保つ */}
      <div className="reservation-table" style={{ overflowX: 'auto' }}>
        {/* テーブルを親幅に合わせ、隣り合うセルの罫線を重ねて一続きに見せる */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            {/* 見出し行を本文と区切り、列名を左揃えで表示する */}
            <tr style={{ borderBottom: '2px solid #dddde8', textAlign: 'left' }}>
              {/* 見出しセルに余白を付け、列名の折り返しを防ぐ */}
              {HEADERS.map((header) => (
                <th key={header} style={{ padding: '10px 14px', fontWeight: 500, color: 'var(--c-body)', whiteSpace: 'nowrap' }}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reservations.map((reservation) => {
              /** ステータスのバッジの色（未知のステータスは「受付済」の色） */
              const statusColor = STATUS_COLORS[reservation.status] ?? STATUS_COLORS.pending
              /** 持ち込みの表示（植物・鉢） */
              const bringFlags = [reservation.bring_plant && '植物', reservation.bring_pot && '鉢'].filter(Boolean).join('・')
              return (
                <tr key={reservation.id} style={{ borderBottom: '1px solid #f0f0f5' }}>
                  {/* 予約ごとに薄い区切り線を付け、行を見分けやすくする */}
                  {/* 受付時刻は控えめな色にし、他の列と同じく一行で保つ */}
                  <td style={{ padding: '12px 14px', color: 'var(--c-muted)', whiteSpace: 'nowrap' }}>
                    {formatJstDate(reservation.created_at)}
                  </td>
                  {/* 氏名・電話番号を一行で表示し、列幅の揺れを抑える */}
                  <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>{reservation.name}</td>
                  {/* 当日参加で使うダミーの .invalid アドレスは表示しない */}
                  {/* 各セルに共通の余白を設け、メールリンクを緑色で区別する */}
                  <td style={{ padding: '12px 14px' }}>
                    {reservation.email.endsWith('.invalid') ? '-' : <a href={`mailto:${reservation.email}`} style={{ color: '#4a6741' }}>{reservation.email}</a>}
                  </td>
                  {/* 電話番号は一行に保ち、未登録はハイフンで示す */}
                  <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>{reservation.phone ?? '-'}</td>
                  {/* 希望日・時間は未入力時に薄い色で表示して、未指定を区別する */}
                  <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', color: reservation.preferred_date ? '#1c2417' : '#ccc' }}>
                    {reservation.preferred_date ?? '-'}
                  </td>
                  <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', color: (reservation.session_time ?? reservation.preferred_time) ? '#1c2417' : '#ccc' }}>
                    {reservation.session_time ?? reservation.preferred_time ?? '-'}
                  </td>
                  {/* 人数は共通のセル余白を付けて数値を表示する */}
                  <td style={{ padding: '12px 14px' }}>{reservation.participants}</td>
                  {/* 持ち込み情報は小さめにまとめ、未指定は薄いハイフンで示す */}
                  <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', fontSize: 12 }}>
                    {bringFlags || <span style={{ color: '#ccc' }}>-</span>}
                  </td>
                  {/* 備考は控えめな色で表示し、横幅を最大 160px に抑える */}
                  <td style={{ padding: '12px 14px', color: 'var(--c-muted)', maxWidth: 160 }}>{reservation.note ?? '-'}</td>
                  {/* 状態バッジと変更欄を横並びにし、間を 8px 空ける */}
                  <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {/* ステータスに対応する色で現在の状態を示す */}
                      <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 4, fontSize: 12, fontWeight: 500, background: statusColor.bg, color: statusColor.color }}>
                        {STATUS_LABELS[reservation.status] ?? reservation.status}
                      </span>
                      {/* 小さな選択欄に枠と余白を付け、親フォントに合わせる。更新中は操作を無効にする */}
                      <select
                        aria-label={`${reservation.name} さんの予約のステータス`}
                        value={reservation.status}
                        disabled={updatingId === reservation.id}
                        onChange={(event) => onStatusUpdate(reservation.id, event.target.value)}
                        style={{ fontSize: 12, padding: '4px 8px', border: '1px solid #dddde8', borderRadius: 2, background: '#ffffff', cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        {STATUS_OPTIONS.map(({ value, label }) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {/* PC 表でも空状態を中央寄せにし、上下余白で表示する */}
        {reservations.length === 0 && (
          <p style={{ textAlign: 'center', padding: '40px 0', color: 'var(--c-muted)' }}>予約はありません。</p>
        )}
      </div>
    </>
  )
}
