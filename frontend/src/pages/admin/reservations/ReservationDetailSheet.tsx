import { STATUS_OPTIONS } from '../../../lib/reservationConstants'
import { formatJstDate } from '../../../lib/localDate'
import type { ReservationWithTime } from '../reservationPrint'

/** 全イベント予約詳細の表示に必要なデータと、親画面へ返す操作 */
interface ReservationDetailSheetProps {
  /** 詳細表示対象の予約。更新後の値は親画面から渡される */
  reservation: ReservationWithTime
  /** 全イベント表示時だけ出すイベント名。イベント単独表示では省略する */
  eventName?: string
  /** この予約のステータス更新中なら true */
  updating: boolean
  /** 暗幕または閉じるボタンが押されたとき詳細を閉じる */
  onClose: () => void
  /** 選択されたステータスを親画面へ渡し、API 更新を依頼する */
  onStatusChange: (status: string) => void
}

/**
 * 全イベント予約一覧のスマートフォン用詳細 sheet を表示する。
 * 予約データの選択・ステータス API・更新中状態は親画面が管理し、この部品は表示と操作通知だけを担当する。
 * @param props 予約、任意のイベント名、更新状態、閉じる操作、ステータス変更操作
 * @returns 暗幕と予約詳細ダイアログ
 */
export default function ReservationDetailSheet({
  reservation,
  eventName,
  updating,
  onClose,
  onStatusChange,
}: ReservationDetailSheetProps) {
  /** 詳細行のラベルと表示値。任意項目は空の場合に行自体を作らない */
  const details = [
    ...(eventName !== undefined ? [{ label: 'イベント', value: eventName }] : []),
    { label: '受付日', value: formatJstDate(reservation.created_at) },
    { label: 'メール', value: reservation.email.endsWith('.invalid') ? '-' : <a href={`mailto:${reservation.email}`} style={{ color: '#4a6741' }}>{reservation.email}</a> },
    ...(reservation.phone ? [{ label: '電話', value: reservation.phone }] : []),
    ...(reservation.preferred_date ? [{ label: '希望日', value: reservation.preferred_date }] : []),
    ...((reservation.session_time ?? reservation.preferred_time) ? [{ label: '予約時間', value: reservation.session_time ?? reservation.preferred_time }] : []),
    { label: '人数', value: `${reservation.participants}名` },
    { label: '持込', value: [reservation.bring_plant && '植物', reservation.bring_pot && '鉢'].filter(Boolean).join('・') || 'なし' },
    ...(reservation.note ? [{ label: '備考', value: reservation.note }] : []),
  ]

  return (
    <>
      {/* スマートフォン詳細の背景領域。押すと親画面へ閉じる操作を通知する */}
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200 }}
        onClick={onClose}
      >
        {/* 詳細カード本体。内容をスクロール可能にし、背景クリックを伝播させない */}
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
          {details.map(({ label, value }) => (
            <div key={label} style={{ display: 'grid', gridTemplateColumns: '72px 1fr', gap: 8, padding: '8px 0', borderBottom: '1px solid #f0f0f5', fontSize: 14 }}>
              <span style={{ color: 'var(--c-muted)', fontSize: 12 }}>{label}</span>
              <span style={{ color: 'var(--c-ink)' }}>{value}</span>
            </div>
          ))}
          <div style={{ marginTop: 20 }}>
            <label htmlFor="reservation-detail-status" style={{ fontSize: 12, color: 'var(--c-muted)', display: 'block', marginBottom: 8 }}>ステータス</label>
            <select
              id="reservation-detail-status"
              value={reservation.status}
              disabled={updating}
              onChange={(event) => onStatusChange(event.target.value)}
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
