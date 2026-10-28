import { formatYen } from '../../../lib/format'
import type { OrderDetail } from '../../../lib/api'
import { ORDER_ERROR_BOX_STYLE, STATUS_LABELS, StatusBadge } from './orderPresentation'

/** 注文詳細モーダルへ親から渡す表示値と操作 */
interface OrderDetailModalProps {
  /** 表示する注文詳細 */
  detail: OrderDetail
  /** ステータス更新中か */
  updating: boolean
  /** 一覧ロード・詳細取得・状態変更で発生したエラー */
  error: string
  /** モーダルを閉じる操作 */
  onClose: () => void
  /** 注文のステータス変更を親へ依頼する */
  onStatusChange: (id: string, status: string) => void
}

/** 注文詳細情報とステータス変更操作を表示するモーダル。
 * @param props - 注文詳細、処理状態、親が所有する操作callback
 * @returns 注文詳細モーダル
 */
export function OrderDetailModal({ detail, updating, error, onClose, onStatusChange }: OrderDetailModalProps) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="order-detail-title" style={{ background: '#fff', maxWidth: 560, width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 32 }} onClick={(event) => event.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <h3 id="order-detail-title" style={{ margin: 0, fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontWeight: 300, fontSize: 22 }}>注文詳細</h3>
          <StatusBadge status={detail.status} />
        </div>

        {/* お客様情報 */}
        <section style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, letterSpacing: 1, color: '#999', margin: '0 0 10px' }}>お客様情報</p>
          <Row label="お名前" value={detail.customer_name} />
          <Row label="メールアドレス" value={detail.customer_email} />
          {detail.customer_phone && <Row label="電話番号" value={detail.customer_phone} />}
          <Row label="Square決済ID" value={detail.square_payment_id ?? '-'} mono />
        </section>

        {/* お届け先。項目名は購入画面 Checkout.tsx の入力欄の見出しに合わせる */}
        <section style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, letterSpacing: 1, color: '#999', margin: '0 0 10px' }}>お届け先</p>
          <Row label="郵便番号" value={detail.postal_code} />
          <Row label="都道府県" value={detail.prefecture} />
          <Row label="市区町村" value={detail.city} />
          <Row label="番地・建物名" value={detail.address_line1} />
          {detail.address_line2 && <Row label="建物名・部屋番号" value={detail.address_line2} />}
          {detail.note && <Row label="備考" value={detail.note} />}
        </section>

        {/* 注文明細、小計、送料、合計 */}
        <section style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, letterSpacing: 1, color: '#999', margin: '0 0 10px' }}>注文内容</p>
          {detail.items.map((item) => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f5', fontSize: 13 }}>
              <span style={{ color: 'var(--c-body)' }}>{item.product_name} × {item.quantity}</span>
              <span style={{ color: 'var(--c-ink)', whiteSpace: 'nowrap' }}>{formatYen(item.price * item.quantity)}</span>
            </div>
          ))}
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
            <span style={{ fontSize: 13, color: 'var(--c-muted)' }}>小計: {formatYen(detail.subtotal)}</span>
            <span style={{ fontSize: 13, color: 'var(--c-muted)' }}>送料: {formatYen(detail.shipping_fee)}</span>
            <span style={{ fontSize: 17, fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", color: 'var(--c-ink)' }}>合計: {formatYen(detail.total)}</span>
          </div>
        </section>

        {/* 発送済み時に登録した配送情報 */}
        {(detail.carrier || detail.tracking_number) && (
          <section style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 11, letterSpacing: 1, color: '#999', margin: '0 0 10px' }}>配送情報</p>
            {detail.carrier && <Row label="配送会社" value={detail.carrier} />}
            {detail.tracking_number && <Row label="追跡番号" value={detail.tracking_number} mono />}
          </section>
        )}

        {/* 現在のステータスは選択不可。更新処理は親へ依頼する */}
        <section style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 11, letterSpacing: 1, color: '#999', margin: '0 0 8px' }}>ステータス変更</p>
          {error && <p role="alert" style={ORDER_ERROR_BOX_STYLE}>{error}</p>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <button
                key={value}
                disabled={updating || detail.status === value}
                onClick={() => onStatusChange(detail.id, value)}
                style={{
                  padding: '7px 16px', border: '1px solid #dddde8', fontSize: 12,
                  cursor: detail.status === value ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                  background: detail.status === value ? '#1c2417' : '#fff',
                  color: detail.status === value ? '#fff' : '#3a4535',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        <div style={{ textAlign: 'right' }}>
          <button onClick={onClose} style={{ padding: '10px 24px', border: '1px solid #dddde8', background: '#fff', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  )
}

/** 注文詳細内のラベルと値を横並びで表示する行。
 * @param props - ラベル、表示値、等幅フォントを使うかどうか
 * @returns 項目名と値の1行
 */
function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 16, padding: '5px 0', borderBottom: '1px solid #f0f0f5', fontSize: 13 }}>
      <span style={{ width: 120, flexShrink: 0, color: 'var(--c-muted)' }}>{label}</span>
      <span style={{ color: 'var(--c-ink)', wordBreak: 'break-all', fontFamily: mono ? 'monospace' : 'inherit' }}>{value}</span>
    </div>
  )
}
