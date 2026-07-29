import { useEffect, useState } from 'react'
import { api, type Order, type OrderDetail } from '../../lib/api'

const fmt = (n: number) => `¥${n.toLocaleString('ja-JP')}`

const STATUS_LABELS: Record<string, string> = {
  paid: '支払済', shipped: '発送済', delivered: '配達完了', cancelled: 'キャンセル',
}
const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  paid:      { bg: '#fff3cd', color: '#856404' },
  shipped:   { bg: '#cce5ff', color: '#004085' },
  delivered: { bg: '#d4edda', color: '#155724' },
  cancelled: { bg: '#f8d7da', color: '#721c24' },
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_COLORS[status] ?? { bg: '#f0f0f5', color: '#666' }
  return (
    <span style={{ padding: '3px 10px', borderRadius: 4, fontSize: 12, background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

export default function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<OrderDetail | null>(null)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    api.orders.list().then(setOrders).finally(() => setLoading(false))
  }, [])

  const openDetail = async (id: string) => {
    const d = await api.orders.get(id)
    setDetail(d)
  }

  const handleStatusChange = async (id: string, status: string) => {
    setUpdating(true)
    try {
      const updated = await api.orders.updateStatus(id, status)
      setOrders((prev) => prev.map((o) => o.id === updated.id ? updated : o))
      if (detail?.id === id) setDetail((d) => d ? { ...d, status } : d)
    } catch { /* ignore */ }
    setUpdating(false)
  }

  const inputStyle: React.CSSProperties = {
    padding: '6px 10px', border: '1px solid #dddde8', fontSize: 13,
    fontFamily: 'inherit', color: '#1c2417', background: '#fff',
    cursor: 'pointer', outline: 'none',
  }

  return (
    <div>
      <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 300, margin: '0 0 24px' }}>注文管理</h2>

      {loading ? <p style={{ color: '#8a9a7e' }}>読み込み中...</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #dddde8', textAlign: 'left' }}>
                {['日時', 'お名前', '都道府県', '合計', '状態', '操作'].map((h) => (
                  <th key={h} style={{ padding: '10px 14px', fontWeight: 500, color: '#3a4535', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} style={{ borderBottom: '1px solid #f0f0f5' }}>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: '#8a9a7e' }}>
                    {new Date(o.created_at).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                  </td>
                  <td style={{ padding: '10px 14px' }}>{o.customer_name}</td>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{o.prefecture}</td>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{fmt(o.total)}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <select
                      value={o.status}
                      disabled={updating}
                      onChange={(e) => handleStatusChange(o.id, e.target.value)}
                      style={inputStyle}
                    >
                      {Object.entries(STATUS_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <button
                      onClick={() => openDetail(o.id)}
                      style={{ padding: '5px 14px', border: '1px solid #dddde8', background: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      詳細
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders.length === 0 && (
            <p style={{ textAlign: 'center', padding: '40px 0', color: '#8a9a7e' }}>注文がありません。</p>
          )}
        </div>
      )}

      {/* 詳細モーダル */}
      {detail && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => setDetail(null)}>
          <div style={{ background: '#fff', maxWidth: 560, width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 32 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <h3 style={{ margin: 0, fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 22 }}>注文詳細</h3>
              <StatusBadge status={detail.status} />
            </div>

            <section style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 11, letterSpacing: 1, color: '#999', margin: '0 0 10px' }}>お客様情報</p>
              <Row label="お名前" value={detail.customer_name} />
              <Row label="メールアドレス" value={detail.customer_email} />
              {detail.customer_phone && <Row label="電話番号" value={detail.customer_phone} />}
              <Row label="Square決済ID" value={detail.square_payment_id ?? '-'} mono />
            </section>

            <section style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 11, letterSpacing: 1, color: '#999', margin: '0 0 10px' }}>お届け先</p>
              <Row label="郵便番号" value={detail.postal_code} />
              <Row label="都道府県" value={detail.prefecture} />
              <Row label="市区町村" value={detail.city} />
              <Row label="番地・建物名" value={detail.address_line1} />
              {detail.address_line2 && <Row label="建物名・部屋" value={detail.address_line2} />}
              {detail.note && <Row label="備考" value={detail.note} />}
            </section>

            <section style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 11, letterSpacing: 1, color: '#999', margin: '0 0 10px' }}>注文内容</p>
              {detail.items.map((item) => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f5', fontSize: 13 }}>
                  <span style={{ color: '#3a4535' }}>{item.product_name} × {item.quantity}</span>
                  <span style={{ color: '#1c2417', whiteSpace: 'nowrap' }}>{fmt(item.price * item.quantity)}</span>
                </div>
              ))}
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                <span style={{ fontSize: 13, color: '#8a9a7e' }}>小計: {fmt(detail.subtotal)}</span>
                <span style={{ fontSize: 13, color: '#8a9a7e' }}>送料: {fmt(detail.shipping_fee)}</span>
                <span style={{ fontSize: 17, fontFamily: "'Cormorant Garamond', serif", color: '#1c2417' }}>合計: {fmt(detail.total)}</span>
              </div>
            </section>

            <section style={{ marginBottom: 24 }}>
              <p style={{ fontSize: 11, letterSpacing: 1, color: '#999', margin: '0 0 8px' }}>ステータス変更</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {Object.entries(STATUS_LABELS).map(([v, l]) => (
                  <button
                    key={v}
                    disabled={updating || detail.status === v}
                    onClick={() => handleStatusChange(detail.id, v)}
                    style={{
                      padding: '7px 16px', border: '1px solid #dddde8', fontSize: 12, cursor: detail.status === v ? 'default' : 'pointer',
                      fontFamily: 'inherit', background: detail.status === v ? '#1c2417' : '#fff',
                      color: detail.status === v ? '#fff' : '#3a4535',
                    }}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </section>

            <div style={{ textAlign: 'right' }}>
              <button onClick={() => setDetail(null)} style={{ padding: '10px 24px', border: '1px solid #dddde8', background: '#fff', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 16, padding: '5px 0', borderBottom: '1px solid #f0f0f5', fontSize: 13 }}>
      <span style={{ width: 120, flexShrink: 0, color: '#8a9a7e' }}>{label}</span>
      <span style={{ color: '#1c2417', wordBreak: 'break-all', fontFamily: mono ? 'monospace' : 'inherit' }}>{value}</span>
    </div>
  )
}
