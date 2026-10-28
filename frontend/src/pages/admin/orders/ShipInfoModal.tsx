import { CARRIERS, ORDER_ERROR_BOX_STYLE, ORDER_INPUT_STYLE } from './orderPresentation'

/** 発送情報モーダルへ親から渡す制御値と操作 */
interface ShipInfoModalProps {
  /** 現在選択している配送会社 */
  carrier: string
  /** 任意で入力するお問い合わせ番号 */
  trackingNumber: string
  /** 発送更新エラー。空文字なら表示しない */
  error: string
  /** 発送情報を保存中か */
  updating: boolean
  /** モーダルを閉じる操作 */
  onClose: () => void
  /** 配送会社の変更を親へ通知する */
  onCarrierChange: (carrier: string) => void
  /** お問い合わせ番号の変更を親へ通知する */
  onTrackingNumberChange: (trackingNumber: string) => void
  /** 発送確定処理を親へ依頼する */
  onConfirm: () => void
}

/** 発送情報入力モーダルを表示し、入力値と確定操作を親へ渡す。
 * @param props - 入力値、処理状態、親が所有する操作callback
 * @returns 発送情報入力モーダル
 */
export function ShipInfoModal({
  carrier, trackingNumber, error, updating, onClose, onCarrierChange,
  onTrackingNumberChange, onConfirm,
}: ShipInfoModalProps) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="ship-modal-title" style={{ background: '#fff', maxWidth: 420, width: '100%', padding: 32 }}>
        <h3 id="ship-modal-title" style={{ margin: '0 0 20px', fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontWeight: 300, fontSize: 20 }}>発送情報の入力</h3>
        <p style={{ fontFamily: "'Noto Sans JP', sans-serif", fontSize: 13, color: '#555', margin: '0 0 20px', lineHeight: 1.8 }}>
          発送済みに変更すると、お客様へ発送通知メールが送信されます。
        </p>

        <div style={{ marginBottom: 16 }}>
          <label htmlFor="ship-carrier" style={{ display: 'block', fontSize: 11, color: '#999', letterSpacing: 1, marginBottom: 6 }}>配送会社</label>
          <select
            id="ship-carrier"
            value={carrier}
            onChange={(event) => onCarrierChange(event.target.value)}
            style={{ ...ORDER_INPUT_STYLE, width: '100%', boxSizing: 'border-box' }}
          >
            {CARRIERS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 24 }}>
          <label htmlFor="ship-tracking" style={{ display: 'block', fontSize: 11, color: '#999', letterSpacing: 1, marginBottom: 6 }}>お問い合わせ番号（任意）</label>
          <input
            id="ship-tracking"
            type="text"
            value={trackingNumber}
            onChange={(event) => onTrackingNumberChange(event.target.value)}
            placeholder="例: 1234-5678-9012"
            style={{ ...ORDER_INPUT_STYLE, width: '100%', boxSizing: 'border-box' }}
          />
        </div>

        {error && <p role="alert" style={ORDER_ERROR_BOX_STYLE}>{error}</p>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={updating}
            style={{ padding: '10px 20px', border: '1px solid #dddde8', background: '#fff', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            キャンセル
          </button>
          <button
            onClick={onConfirm}
            disabled={updating}
            style={{ padding: '10px 24px', background: 'var(--c-ink)', color: '#fff', border: 'none', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {updating ? '処理中...' : '発送済みにする'}
          </button>
        </div>
      </div>
    </div>
  )
}
