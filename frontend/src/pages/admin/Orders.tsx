import { useEffect, useState } from 'react'
import { api, type Order, type OrderDetail } from '../../lib/api'
import { failMessage } from './errorMessage'
import { formatYen } from '../../lib/format'
import { formatJstDate } from '../../lib/localDate'


/** エラーの帯の見た目（一覧の上・詳細モーダル・発送モーダルで共通の赤い帯） */
const errorBoxStyle: React.CSSProperties = {
  color: '#c0392b', fontSize: 13, margin: '0 0 16px', padding: '8px 14px',
  background: '#fdf0ee', borderRadius: 4, border: '1px solid #f5c6c0',
}

/** 注文ステータスの値 → 表示名 */
const STATUS_LABELS: Record<string, string> = {
  paid: '支払済', shipped: '発送済', delivered: '配達完了', cancelled: 'キャンセル',
}
/** 注文ステータスの値 → バッジの背景色・文字色 */
const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  paid:      { bg: '#fff3cd', color: '#856404' },
  shipped:   { bg: '#cce5ff', color: '#004085' },
  delivered: { bg: '#d4edda', color: '#155724' },
  cancelled: { bg: '#f8d7da', color: '#721c24' },
}

/** 発送モーダルで選べる配送会社 */
const CARRIERS = ['ヤマト運輸', '佐川急便', '日本郵便（ゆうパック）', 'その他']

/**
 * 注文ステータスをバッジ形式で表示するコンポーネント
 * @param status - 表示するステータスキー
 * @returns 色つきのバッジ（知らないステータスは灰色で値をそのまま出す）
 */
function StatusBadge({ status }: { status: string }) {
  /** このステータスの背景色・文字色 */
  const s = STATUS_COLORS[status] ?? { bg: '#f0f0f5', color: '#666' }
  return (
    <span style={{ padding: '3px 10px', borderRadius: 4, fontSize: 12, background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

/**
 * 注文管理。一覧・ステータス変更・発送情報入力・詳細確認を行うページ
 * @returns 注文の表と、発送情報・詳細のモーダル
 */
export default function AdminOrders() {
  /** 注文の一覧 */
  const [orders, setOrders] = useState<Order[]>([])
  /** 一覧を読み込み中か */
  const [loading, setLoading] = useState(true)
  /** 詳細モーダルに出している注文（null なら閉じている） */
  const [detail, setDetail] = useState<OrderDetail | null>(null)
  /** ステータスの変更を送信中か（ボタン・select を無効にする） */
  const [updating, setUpdating] = useState(false)
  /** 一覧の読み込み・ステータス変更・詳細の取得の失敗の文言（一覧の上か詳細モーダルの中に出す） */
  const [pageError, setPageError] = useState('')

  /** 発送情報の入力モーダルの対象（null なら閉じている） */
  const [shipModal, setShipModal] = useState<{ orderId: string } | null>(null)
  /** 発送モーダルで選んだ配送会社 */
  const [carrier, setCarrier] = useState(CARRIERS[0])
  /** 発送モーダルのお問い合わせ番号（任意） */
  const [trackingNumber, setTrackingNumber] = useState('')
  /** 発送確定の失敗の文言（発送モーダルの中に出す） */
  const [shipError, setShipError] = useState('')

  // 画面を開いたときに注文の一覧を読み込む
  useEffect(() => {
    api.orders.list()
      .then(setOrders)
      .catch((e: unknown) => setPageError(failMessage('注文の読み込みに失敗しました', e)))
      .finally(() => setLoading(false))
  }, [])

  /**
   * 発送情報の入力モーダルを開く（入力は初期値に戻す）
   * @param orderId - 発送済みにする注文の id
   */
  const openShipModal = (orderId: string) => {
    setCarrier(CARRIERS[0])
    setTrackingNumber('')
    setShipError('')
    setShipModal({ orderId })
  }

  /**
   * 発送を確定する（お客様に発送通知メールが送られる）
   * 1. 送信中にする
   * 2. 成功したら一覧と詳細モーダルの両方に status・carrier・tracking_number を反映し、モーダルを閉じる
   * 3. 失敗したらモーダルを開いたまま（入力は残る）エラーを出す。もう一度押して再送できる
   */
  const confirmShip = async () => {
    if (!shipModal) return
    // 1. 送信中
    setUpdating(true)
    setShipError('')
    try {
      // 2. 成功
      /** 更新後の注文 */
      const updated = await api.orders.updateStatus(shipModal.orderId, 'shipped', carrier, trackingNumber || undefined)
      setOrders((prev) => prev.map((o) => o.id === updated.id ? updated : o))
      if (detail?.id === shipModal.orderId) setDetail((d) => d ? { ...d, status: 'shipped', carrier: updated.carrier, tracking_number: updated.tracking_number } : d)
      setShipModal(null)
    } catch (e) {
      // 3. 失敗
      setShipError(failMessage('発送済みへの変更に失敗しました', e))
    } finally {
      setUpdating(false)
    }
  }

  /**
   * ステータスを変更する。「発送済」は発送情報の入力が要るのでモーダルを開く
   * 失敗したら表示は元のまま（select も元の値に戻る）にしてエラーを出す
   * @param id - 注文の id
   * @param status - 新しいステータス
   */
  const handleStatusChange = async (id: string, status: string) => {
    if (status === 'shipped') { openShipModal(id); return }
    setUpdating(true)
    setPageError('')
    try {
      /** 更新後の注文 */
      const updated = await api.orders.updateStatus(id, status)
      setOrders((prev) => prev.map((o) => o.id === updated.id ? updated : o))
      if (detail?.id === id) setDetail((d) => d ? { ...d, status } : d)
    } catch (e) {
      setPageError(failMessage('ステータスの変更に失敗しました。元の状態のままです', e))
    } finally {
      setUpdating(false)
    }
  }

  /**
   * 注文の詳細（明細つき）を取得してモーダルを開く。失敗したら一覧の上にエラーを出す
   * @param id - 注文の id
   */
  const openDetail = async (id: string) => {
    setPageError('')
    try {
      setDetail(await api.orders.get(id))
    } catch (e) {
      setPageError(failMessage('注文の詳細の取得に失敗しました', e))
    }
  }

  /** ステータスの select・発送モーダルの配送会社とお問い合わせ番号の入力欄の共通の見た目 */
  const inputStyle: React.CSSProperties = {
    padding: '6px 10px', border: '1px solid #dddde8', fontSize: 13,
    fontFamily: 'inherit', color: 'var(--c-ink)', background: '#fff',
    cursor: 'pointer', outline: 'none',
  }

  return (
    <div>
      <h2 style={{ fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontSize: 28, fontWeight: 300, margin: '0 0 24px' }}>注文管理</h2>

      {/* 詳細モーダルを開いているときは、エラーはモーダルの中に出す */}
      {pageError && !detail && <p role="alert" style={errorBoxStyle}>{pageError}</p>}

      {/* 注文の表（狭い幅では横にスクロール） */}
      {loading ? <p style={{ color: 'var(--c-muted)' }}>読み込み中...</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #dddde8', textAlign: 'left' }}>
                {['日時', 'お名前', '都道府県', '合計', '状態', '操作'].map((h) => (
                  <th key={h} style={{ padding: '10px 14px', fontWeight: 500, color: 'var(--c-body)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} style={{ borderBottom: '1px solid #f0f0f5' }}>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: 'var(--c-muted)' }}>
                    {formatJstDate(o.created_at, true)}
                  </td>
                  <td style={{ padding: '10px 14px' }}>{o.customer_name}</td>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{o.prefecture}</td>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{formatYen(o.total)}</td>
                  {/* ステータスの変更（「発送済」を選ぶと発送情報のモーダルを開く） */}
                  <td style={{ padding: '10px 14px' }}>
                    <select
                      aria-label={`${o.customer_name} 様の注文のステータス`}
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
            <p style={{ textAlign: 'center', padding: '40px 0', color: 'var(--c-muted)' }}>注文がありません。</p>
          )}
        </div>
      )}

      {/* 発送情報入力モーダル（詳細モーダルより手前に出す） */}
      {shipModal && (
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
                onChange={(e) => setCarrier(e.target.value)}
                style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
              >
                {CARRIERS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label htmlFor="ship-tracking" style={{ display: 'block', fontSize: 11, color: '#999', letterSpacing: 1, marginBottom: 6 }}>お問い合わせ番号（任意）</label>
              <input
                id="ship-tracking"
                type="text"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="例: 1234-5678-9012"
                style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
              />
            </div>

            {shipError && <p role="alert" style={errorBoxStyle}>{shipError}</p>}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShipModal(null)}
                disabled={updating}
                style={{ padding: '10px 20px', border: '1px solid #dddde8', background: '#fff', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                キャンセル
              </button>
              <button
                onClick={confirmShip}
                disabled={updating}
                style={{ padding: '10px 24px', background: 'var(--c-ink)', color: '#fff', border: 'none', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {updating ? '処理中...' : '発送済みにする'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 詳細モーダル（暗い背景を押すと閉じる） */}
      {detail && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => setDetail(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="order-detail-title" style={{ background: '#fff', maxWidth: 560, width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 32 }} onClick={(e) => e.stopPropagation()}>
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

            {/* お届け先（項目名は購入画面 Checkout.tsx の入力欄の見出しにそろえる） */}
            <section style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 11, letterSpacing: 1, color: '#999', margin: '0 0 10px' }}>お届け先</p>
              <Row label="郵便番号" value={detail.postal_code} />
              <Row label="都道府県" value={detail.prefecture} />
              <Row label="市区町村" value={detail.city} />
              <Row label="番地・建物名" value={detail.address_line1} />
              {detail.address_line2 && <Row label="建物名・部屋番号" value={detail.address_line2} />}
              {detail.note && <Row label="備考" value={detail.note} />}
            </section>

            {/* 注文内容（明細・小計・送料・合計） */}
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

            {/* 配送情報（発送済みにしたときに入れた値があるときだけ） */}
            {(detail.carrier || detail.tracking_number) && (
              <section style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 11, letterSpacing: 1, color: '#999', margin: '0 0 10px' }}>配送情報</p>
                {detail.carrier && <Row label="配送会社" value={detail.carrier} />}
                {detail.tracking_number && <Row label="追跡番号" value={detail.tracking_number} mono />}
              </section>
            )}

            {/* ステータス変更（今のステータスのボタンは押せない） */}
            <section style={{ marginBottom: 24 }}>
              <p style={{ fontSize: 11, letterSpacing: 1, color: '#999', margin: '0 0 8px' }}>ステータス変更</p>
              {pageError && <p role="alert" style={errorBoxStyle}>{pageError}</p>}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {Object.entries(STATUS_LABELS).map(([v, l]) => (
                  <button
                    key={v}
                    disabled={updating || detail.status === v}
                    onClick={() => handleStatusChange(detail.id, v)}
                    style={{
                      padding: '7px 16px', border: '1px solid #dddde8', fontSize: 12,
                      cursor: detail.status === v ? 'default' : 'pointer',
                      fontFamily: 'inherit',
                      background: detail.status === v ? '#1c2417' : '#fff',
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

/**
 * 注文詳細モーダル内のラベルと値を横並びで表示する行コンポーネント
 * @param label - 左側のラベルテキスト
 * @param value - 右側に表示する値
 * @param mono - true の場合は等幅フォントで表示する（追跡番号など）
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
