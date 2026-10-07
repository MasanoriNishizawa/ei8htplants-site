import { useEffect, useState } from 'react'
import { api, type Event, type EventFinances } from '../../lib/api'

const SERIF = "'Cormorant Garamond', 'Noto Serif JP', serif"

// WS手伝い単価（WS参加費1000円の70%）
const WS_UNIT_PRICE = 700

function fmt(n: number) {
  return n.toLocaleString('ja-JP')
}

/** 日付文字列から年度（4月始まり）を返す。例: 2026-02-01 → 2025 */
function fiscalYear(dateStr: string): number {
  const d = new Date(dateStr)
  const month = d.getMonth() + 1
  return month >= 4 ? d.getFullYear() : d.getFullYear() - 1
}

interface WsRow {
  eventId: string
  name: string
  date: string
  participants: number
  amount: number        // WS_UNIT_PRICE × participants
  paymentDone: boolean
  fin: EventFinances    // 支払い済み更新時にそのまま PUT するための元データ
}

/** ワークショップ収支集計ページ。イベント別件数・金額・支払い済みを管理する */
export default function AdminWsSummary() {
  const [events, setEvents] = useState<Event[]>([])
  const [finances, setFinances] = useState<EventFinances[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)  // 保存中のeventId

  // 過去イベントを含む全データを並列取得
  useEffect(() => {
    Promise.all([
      api.events.list(true),
      api.events.getAllFinances(),
    ]).then(([evs, fins]) => {
      setEvents(evs)
      setFinances(fins)
    }).finally(() => setLoading(false))
  }, [])

  /** 支払い済みチェックボックスを切り替えてDBを更新する */
  const togglePayment = async (row: WsRow) => {
    setSaving(row.eventId)
    const updated = { ...row.fin, ws_payment_done: !row.paymentDone }
    await api.events.saveFinances(row.eventId, updated)
    // ローカルstateも更新
    setFinances(prev => prev.map(f => f.event_id === row.eventId ? { ...f, ws_payment_done: !row.paymentDone } : f))
    setSaving(null)
  }

  if (loading) return <p style={{ color: 'var(--c-muted)' }}>読み込み中...</p>

  const eventMap = new Map(events.map(e => [e.id, e]))

  // WS参加者ありのイベントを年度別に集計
  const rowsByYear = new Map<number, WsRow[]>()

  finances.forEach(fin => {
    const event = eventMap.get(fin.event_id)
    if (!event?.start_date || !event.has_workshop || fin.ws_participants <= 0) return

    const fy = fiscalYear(event.start_date)
    if (!rowsByYear.has(fy)) rowsByYear.set(fy, [])
    rowsByYear.get(fy)!.push({
      eventId: event.id,
      name: event.name,
      date: event.start_date,
      participants: fin.ws_participants,
      amount: fin.ws_participants * WS_UNIT_PRICE,
      paymentDone: fin.ws_payment_done ?? false,
      fin,
    })
  })

  const years = [...rowsByYear.keys()].sort((a, b) => b - a)

  const thStyle: React.CSSProperties = {
    padding: '10px 14px', fontSize: 12, fontWeight: 500,
    color: 'var(--c-muted)', textAlign: 'left', borderBottom: '1px solid #dddde8',
    whiteSpace: 'nowrap',
  }
  const tdStyle: React.CSSProperties = {
    padding: '10px 14px', fontSize: 14, borderBottom: '1px solid #f0f0f5',
  }

  return (
    <div style={{ maxWidth: 800 }}>
      <h1 style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 300, marginBottom: 8 }}>
        ワークショップ集計
      </h1>
      <p style={{ fontSize: 13, color: 'var(--c-muted)', marginBottom: 32, lineHeight: 1.8 }}>
        WSありのイベントの参加件数・手伝い金額（700円×件数）と支払い状況を管理します。
      </p>

      {years.length === 0 ? (
        <p style={{ color: '#aaa', fontSize: 14 }}>ワークショップのデータがありません。</p>
      ) : years.map(fy => {
        const rows = [...rowsByYear.get(fy)!].sort((a, b) => a.date.localeCompare(b.date))
        const totalParticipants = rows.reduce((s, r) => s + r.participants, 0)
        const totalAmount = rows.reduce((s, r) => s + r.amount, 0)
        const paidAmount = rows.filter(r => r.paymentDone).reduce((s, r) => s + r.amount, 0)

        return (
          <div key={fy} style={{ marginBottom: 40 }}>
            <h2 style={{ fontFamily: SERIF, fontWeight: 300, fontSize: 20, margin: '0 0 12px', color: 'var(--c-ink)' }}>
              {fy}年度（{fy}/4〜{fy + 1}/3）
            </h2>

            {/* テーブル */}
            <div style={{ border: '1px solid #dddde8', borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: '#f9f9fb' }}>
                  <tr>
                    <th style={thStyle}>イベント名</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>件数</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>金額</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>支払い済み</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.eventId} style={{ background: row.paymentDone ? '#f6faf5' : '#fff' }}>
                      <td style={tdStyle}>
                        {row.name}
                        <span style={{ fontSize: 12, color: 'var(--c-muted)', marginLeft: 8 }}>{row.date}</span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--c-muted)' }}>
                        {row.participants} 人
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 500, color: '#7a5a30' }}>
                        {fmt(row.amount)} 円
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={row.paymentDone}
                          disabled={saving === row.eventId}
                          onChange={() => togglePayment(row)}
                          style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#4a6741' }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* 合計行 */}
                <tfoot>
                  <tr style={{ background: '#f9f9fb', borderTop: '1px solid #dddde8' }}>
                    <td style={{ ...tdStyle, fontWeight: 500, borderBottom: 'none' }}>合計</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 500, borderBottom: 'none' }}>{totalParticipants} 人</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: '#7a5a30', borderBottom: 'none' }}>{fmt(totalAmount)} 円</td>
                    <td style={{ ...tdStyle, textAlign: 'center', fontSize: 12, color: 'var(--c-muted)', borderBottom: 'none' }}>
                      支払済 {fmt(paidAmount)} 円
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}
