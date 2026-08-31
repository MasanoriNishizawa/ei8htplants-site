import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, computeFinances, type Event, type EventFinances } from '../../lib/api'

function fmt(n: number) {
  return n.toLocaleString('ja-JP')
}

export default function AdminFinances() {
  const [events, setEvents] = useState<Event[]>([])
  const [financeMap, setFinanceMap] = useState<Map<string, EventFinances>>(new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.events.list(false),
      api.events.list(true),
      api.events.getAllFinances(),
    ]).then(([upcoming, past, finances]) => {
      const all = [...past, ...upcoming].sort(
        (a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
      )
      setEvents(all)
      setFinanceMap(new Map(finances.map((f) => [f.event_id, f])))
    }).finally(() => setLoading(false))
  }, [])

  const rows = events.map((ev) => {
    const fin = financeMap.get(ev.id)
    const computed = fin ? computeFinances(fin, ev.has_workshop) : null
    return { ev, fin: fin ?? null, computed }
  })

  const registered = rows.filter((r) => r.computed !== null)
  const totalSales = registered.reduce((s, r) => s + (r.fin?.sales ?? 0), 0)
  const totalExpense = registered.reduce((s, r) => s + (r.computed?.totalExpense ?? 0), 0)
  const totalNet = registered.reduce((s, r) => s + (r.computed?.net ?? 0), 0)

  const cellStyle: React.CSSProperties = {
    padding: '12px 14px',
    fontSize: 14,
    borderBottom: '1px solid #f0f0f5',
    verticalAlign: 'middle',
  }
  const numCell: React.CSSProperties = {
    ...cellStyle,
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
  }

  return (
    <div>
      <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 300, marginBottom: 24 }}>
        収支一覧
      </h2>

      {registered.length > 0 && (
        <div style={{
          display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 28,
          padding: '16px 20px',
          background: totalNet >= 0 ? '#f0f5ee' : '#fdf0ee',
          border: `1px solid ${totalNet >= 0 ? '#b8d4ae' : '#f0b8ae'}`,
          borderRadius: 4,
        }}>
          <div style={{ flex: 1, minWidth: 120 }}>
            <div style={{ fontSize: 11, letterSpacing: 1, color: 'var(--c-muted)', textTransform: 'uppercase', marginBottom: 4 }}>売上合計</div>
            <div style={{ fontSize: 18, fontWeight: 500, fontFamily: "'Cormorant Garamond', serif" }}>{fmt(totalSales)} 円</div>
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <div style={{ fontSize: 11, letterSpacing: 1, color: 'var(--c-muted)', textTransform: 'uppercase', marginBottom: 4 }}>支出合計</div>
            <div style={{ fontSize: 18, fontWeight: 500, fontFamily: "'Cormorant Garamond', serif" }}>{fmt(totalExpense)} 円</div>
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <div style={{ fontSize: 11, letterSpacing: 1, color: 'var(--c-muted)', textTransform: 'uppercase', marginBottom: 4 }}>収支合計</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: totalNet >= 0 ? '#2d5a27' : '#c0392b', fontFamily: "'Cormorant Garamond', serif" }}>
              {totalNet >= 0 ? '+' : ''}{fmt(totalNet)} 円
            </div>
          </div>
          <div style={{ alignSelf: 'flex-end', fontSize: 11, color: 'var(--c-muted)' }}>
            {registered.length} イベント登録済み
          </div>
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--c-muted)' }}>読み込み中...</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: '#ffffff', border: '1px solid #dddde8', borderRadius: 4 }}>
            <thead>
              <tr style={{ background: '#f8f8fa' }}>
                <th style={{ ...cellStyle, fontWeight: 500, textAlign: 'left', fontSize: 12, letterSpacing: 1, color: 'var(--c-muted)', textTransform: 'uppercase' }}>イベント</th>
                <th style={{ ...cellStyle, fontWeight: 500, textAlign: 'left', fontSize: 12, letterSpacing: 1, color: 'var(--c-muted)', textTransform: 'uppercase' }}>日付</th>
                <th style={{ ...numCell, fontWeight: 500, fontSize: 12, letterSpacing: 1, color: 'var(--c-muted)', textTransform: 'uppercase' }}>売上</th>
                <th style={{ ...numCell, fontWeight: 500, fontSize: 12, letterSpacing: 1, color: 'var(--c-muted)', textTransform: 'uppercase' }}>支出</th>
                <th style={{ ...numCell, fontWeight: 500, fontSize: 12, letterSpacing: 1, color: 'var(--c-muted)', textTransform: 'uppercase' }}>収支</th>
                <th style={{ ...cellStyle, width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ ev, fin, computed }) => (
                <tr key={ev.id} style={{ borderBottom: '1px solid #f0f0f5' }}>
                  <td style={{ ...cellStyle, fontWeight: 500 }}>{ev.name}</td>
                  <td style={{ ...cellStyle, color: 'var(--c-muted)', whiteSpace: 'nowrap' }}>
                    {ev.start_date}{ev.end_date && ev.end_date !== ev.start_date ? ` 〜 ${ev.end_date}` : ''}
                  </td>
                  <td style={{ ...numCell, color: fin ? 'inherit' : 'var(--c-muted)' }}>
                    {fin ? `${fmt(fin.sales)} 円` : '—'}
                  </td>
                  <td style={{ ...numCell, color: computed ? '#c0392b' : 'var(--c-muted)' }}>
                    {computed ? `${fmt(computed.totalExpense)} 円` : '—'}
                  </td>
                  <td style={{ ...numCell, fontWeight: computed ? 600 : 400, color: computed ? (computed.net >= 0 ? '#2d5a27' : '#c0392b') : 'var(--c-muted)', fontFamily: computed ? "'Cormorant Garamond', serif" : 'inherit', fontSize: computed ? 16 : 14 }}>
                    {computed ? `${computed.net >= 0 ? '+' : ''}${fmt(computed.net)} 円` : '—'}
                  </td>
                  <td style={cellStyle}>
                    <Link to={`/admin/events/${ev.id}/finances`} style={{ padding: '6px 12px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 12, color: '#4a6741', textDecoration: 'none' }}>
                      編集
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
