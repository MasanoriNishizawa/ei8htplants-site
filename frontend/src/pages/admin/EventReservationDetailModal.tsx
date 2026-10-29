import { STATUS_OPTIONS } from '../../lib/reservationConstants'
import { formatJstDate } from '../../lib/localDate'
import type { ReservationWithTime } from './eventReservationExports'

/** 予約詳細モーダルに必要な表示情報と、親画面が管理する操作の型 */
interface EventReservationDetailModalProps {
  /** 詳細を表示する予約 */
  reservation: ReservationWithTime
  /** この予約のステータスを更新中か */
  updating: boolean
  /** 詳細モーダルを閉じる処理 */
  onClose: () => void
  /** ステータス変更を親画面へ依頼する処理 */
  onStatusChange: (reservationId: string, status: string) => void
}

/**
 * 選択済み予約の詳細とステータス選択を表示する controlled modal。
 * 1. 親から受け取った予約情報を詳細項目として表示する。
 * 2. 背景または閉じるボタンの操作を親へ通知する。
 * 3. ステータス変更を親へ通知し、更新状態と保存結果は親の値で表示する。
 * @param reservation - 詳細を表示する予約
 * @param updating - この予約のステータスを更新中か
 * @param onClose - 詳細モーダルを閉じる処理
 * @param onStatusChange - ステータス変更を親画面へ依頼する処理
 * @returns 予約詳細モーダル。
 */
export default function EventReservationDetailModal({
  reservation,
  updating,
  onClose,
  onStatusChange,
}: EventReservationDetailModalProps) {
  /** モーダル内に表示する予約情報のラベルと値 */
  const detailItems = [
    { label: '受付日', value: formatJstDate(reservation.created_at) },
    { label: 'メール', value: reservation.email.endsWith('.invalid') ? '-' : <a href={`mailto:${reservation.email}`} style={{ color: '#4a6741' }}>{reservation.email}</a> },
    ...(reservation.phone ? [{ label: '電話', value: reservation.phone }] : []),
    ...(reservation.preferred_date ? [{ label: '予約日', value: reservation.preferred_date }] : []),
    ...((reservation.session_time ?? reservation.preferred_time) ? [{ label: '予約時間', value: reservation.session_time ?? reservation.preferred_time }] : []),
    { label: '人数', value: `${reservation.participants}名` },
    ...(reservation.bring_plant || reservation.bring_pot ? [{ label: '持込', value: [reservation.bring_plant && '植物', reservation.bring_pot && '鉢'].filter(Boolean).join('・') }] : []),
    ...(reservation.bring_plant || reservation.bring_pot ? [] : [{ label: '持込', value: 'なし' }]),
    ...(reservation.note ? [{ label: '備考', value: reservation.note }] : []),
  ]

  return (
    <>
    {/* 背景領域は閉じる操作を受け付ける */}
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200 }}
      onClick={onClose}
    >
      {/* 詳細枠は背景クリックが閉じる操作へ伝播しないようにする */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${reservation.name} さんの予約の詳細`}
        style={{ background: '#fff', width: '100%', maxWidth: 560, borderRadius: '12px 12px 0 0', padding: '24px 20px 40px', maxHeight: '85dvh', overflowY: 'auto' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontWeight: 500, fontSize: 16 }}>{reservation.name}</span>
          <button onClick={onClose} aria-label="閉じる" style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--c-muted)', lineHeight: 1, padding: '4px 8px' }}>×</button>
        </div>
        {/* 予約の基本情報を項目ごとに表示する */}
        {detailItems.map(({ label, value }) => (
          <div key={label} style={{ display: 'grid', gridTemplateColumns: '72px 1fr', gap: 8, padding: '8px 0', borderBottom: '1px solid #f0f0f5', fontSize: 14 }}>
            <span style={{ color: 'var(--c-muted)', fontSize: 12 }}>{label}</span>
            <span style={{ color: 'var(--c-ink)' }}>{value}</span>
          </div>
        ))}
        {/* ステータス選択は変更内容を親へ通知する */}
        <div style={{ marginTop: 20 }}>
          <label htmlFor="event-reservation-detail-status" style={{ fontSize: 12, color: 'var(--c-muted)', display: 'block', marginBottom: 8 }}>ステータス</label>
          <select
            id="event-reservation-detail-status"
            value={reservation.status}
            disabled={updating}
            onChange={(event) => onStatusChange(reservation.id, event.target.value)}
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 14, fontFamily: 'inherit', background: '#fff', cursor: 'pointer' }}
          >
            {STATUS_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
    </>
  )
}
