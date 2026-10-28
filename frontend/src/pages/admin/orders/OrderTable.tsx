import { formatYen } from '../../../lib/format'
import { formatJstDate } from '../../../lib/localDate'
import type { Order } from '../../../lib/api'
import { ORDER_INPUT_STYLE, STATUS_LABELS } from './orderPresentation'

/** 注文一覧を表示するために親から受け取る値と操作 */
interface OrderTableProps {
  /** 一覧に表示する注文 */
  orders: Order[]
  /** 一覧データを読み込み中か */
  loading: boolean
  /** ステータス更新中か */
  updating: boolean
  /** 注文のステータス変更を親へ依頼する */
  onStatusChange: (id: string, status: string) => void
  /** 注文詳細の取得を親へ依頼する */
  onOpenDetail: (id: string) => void
}

/** 注文一覧テーブルと読み込み中・空状態を表示する。
 * @param props - 一覧データ、状態、ユーザー操作のcallback
 * @returns 注文一覧の表示
 */
export function OrderTable({ orders, loading, updating, onStatusChange, onOpenDetail }: OrderTableProps) {
  return loading ? <p style={{ color: 'var(--c-muted)' }}>読み込み中...</p> : (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #dddde8', textAlign: 'left' }}>
            {['日時', 'お名前', '都道府県', '合計', '状態', '操作'].map((heading) => (
              <th key={heading} style={{ padding: '10px 14px', fontWeight: 500, color: 'var(--c-body)', whiteSpace: 'nowrap' }}>{heading}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} style={{ borderBottom: '1px solid #f0f0f5' }}>
              <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: 'var(--c-muted)' }}>
                {formatJstDate(order.created_at, true)}
              </td>
              <td style={{ padding: '10px 14px' }}>{order.customer_name}</td>
              <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{order.prefecture}</td>
              <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{formatYen(order.total)}</td>
              {/* 発送済みを選択した場合の入力モーダル制御は親へ委ねる */}
              <td style={{ padding: '10px 14px' }}>
                <select
                  aria-label={`${order.customer_name} 様の注文のステータス`}
                  value={order.status}
                  disabled={updating}
                  onChange={(event) => onStatusChange(order.id, event.target.value)}
                  style={ORDER_INPUT_STYLE}
                >
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </td>
              <td style={{ padding: '10px 14px' }}>
                <button
                  onClick={() => onOpenDetail(order.id)}
                  style={{ padding: '5px 14px', border: '1px solid #dddde8', background: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  詳細
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* ロード失敗時も現在の親状態に従い空状態を表示する */}
      {orders.length === 0 && (
        <p style={{ textAlign: 'center', padding: '40px 0', color: 'var(--c-muted)' }}>注文がありません。</p>
      )}
    </div>
  )
}
