import { useEffect, useState } from 'react'
import { api, type Reservation, type Event } from '../../lib/api'
import { STATUS_LABELS, STATUS_COLORS } from '../../lib/reservationConstants'

type ReservationWithTime = Reservation & { session_time?: string }

function printReservations(rows: ReservationWithTime[], eventName: string) {
  const win = window.open('', '_blank')
  if (!win) return

  const totalParticipants = rows.reduce((s, r) => s + r.participants, 0)

  const tableRows = rows.map((r) => {
    const bringFlags = [r.bring_plant && '植物', r.bring_pot && '鉢'].filter(Boolean).join('・')
    return `
      <tr>
        <td>${new Date(r.created_at).toLocaleDateString('ja-JP')}</td>
        <td>${r.name}</td>
        <td>${r.email}</td>
        <td>${r.phone ?? '-'}</td>
        <td>${r.preferred_date ?? '-'}</td>
        <td>${r.preferred_time ?? '-'}</td>
        <td>${r.session_time ?? '-'}</td>
        <td style="text-align:center">${r.participants}</td>
        <td>${bringFlags || '-'}</td>
        <td>${r.note ?? '-'}</td>
        <td>${STATUS_LABELS[r.status] ?? r.status}</td>
      </tr>`
  }).join('')

  win.document.write(`<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>${eventName} — WS予約一覧</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Noto Sans JP', 'Hiragino Kaku Gothic ProN', sans-serif; font-size: 11px; color: #1a1a1a; padding: 16px 20px; }
    h1 { font-size: 16px; font-weight: 600; margin-bottom: 4px; }
    .meta { font-size: 10px; color: #666; margin-bottom: 14px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f0f0f4; font-weight: 600; font-size: 10px; letter-spacing: 0.5px; border: 1px solid #ccc; padding: 5px 8px; text-align: left; white-space: nowrap; }
    td { border: 1px solid #ddd; padding: 5px 8px; vertical-align: top; }
    tr:nth-child(even) td { background: #fafafa; }
    .summary { margin-top: 12px; font-size: 11px; color: #444; }
    @media print { @page { size: A4 landscape; margin: 10mm; } }
  </style>
</head>
<body>
  <h1>${eventName} — WS予約一覧</h1>
  <div class="meta">出力日: ${new Date().toLocaleDateString('ja-JP')} / 予約件数: ${rows.length} 件 / 合計人数: ${totalParticipants} 名</div>
  <table>
    <thead>
      <tr>
        <th>受付日</th><th>お名前</th><th>メール</th><th>電話</th>
        <th>希望日</th><th>希望時間</th><th>WSセッション</th><th>人数</th>
        <th>持込</th><th>備考</th><th>ステータス</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
  <div class="summary">合計参加人数: ${totalParticipants} 名</div>
  <script>window.onload = () => { window.print() }<\/script>
</body>
</html>`)
  win.document.close()
}

export default function AdminReservations() {
  const [rows, setRows] = useState<ReservationWithTime[]>([])
  const [eventsMap, setEventsMap] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [eventFilter, setEventFilter] = useState<string>('all')

  useEffect(() => {
    Promise.all([
      api.reserve.list(),
      api.events.list(false),
      api.events.list(true),
    ]).then(async ([reservations, upcoming, past]) => {
      const allEvents: Event[] = [...upcoming, ...past]
      const eMap = new Map<string, string>(allEvents.map((e) => [e.id, e.name]))
      setEventsMap(eMap)

      const eventIds = [...new Set(reservations.filter((r) => r.session_id).map((r) => r.event_id))]
      const sessionMap = new Map<string, string>()
      await Promise.all(eventIds.map(async (eid) => {
        const sessions = await api.events.getSessions(eid)
        sessions.forEach((s) => sessionMap.set(s.id, s.time_label))
      }))
      setRows(reservations.map((r) => ({ ...r, session_time: r.session_id ? sessionMap.get(r.session_id) : undefined })))
    }).finally(() => setLoading(false))
  }, [])

  const updateStatus = async (id: string, status: string) => {
    setUpdating(id)
    try {
      const updated = await api.reserve.updateStatus(id, status)
      setRows((prev) => prev.map((r) => r.id === id ? { ...r, ...updated } : r))
    } catch {
      setRows((prev) => prev.map((r) => r.id === id ? { ...r, status } : r))
    }
    setUpdating(null)
  }

  const eventIds = [...new Set(rows.map((r) => r.event_id))]
  const filtered = (eventFilter === 'all' ? rows : rows.filter((r) => r.event_id === eventFilter))
    .slice()
    .sort((a, b) => {
      const dateA = a.preferred_date ?? ''
      const dateB = b.preferred_date ?? ''
      if (dateA !== dateB) return dateA < dateB ? -1 : 1
      const timeA = a.preferred_time ?? ''
      const timeB = b.preferred_time ?? ''
      return timeA < timeB ? -1 : timeA > timeB ? 1 : 0
    })
  const selectedEventName = eventFilter === 'all' ? 'WS予約一覧' : (eventsMap.get(eventFilter) ?? 'イベント')

  const headers = ['受付日', 'お名前', 'メール', '電話', '希望日', '希望時間', 'WSセッション', '人数', '持込', '備考', 'ステータス']

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 300, margin: 0 }}>WS予約一覧</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {eventIds.length > 1 && (
            <select
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 13, background: '#ffffff', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--c-body)' }}
            >
              <option value="all">すべてのイベント</option>
              {eventIds.map((id) => (
                <option key={id} value={id}>{eventsMap.get(id) ?? id}</option>
              ))}
            </select>
          )}
          {filtered.length > 0 && (
            <button
              onClick={() => printReservations(filtered, selectedEventName)}
              style={{ padding: '8px 20px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 13, background: '#ffffff', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--c-body)' }}
            >
              PDF で印刷
            </button>
          )}
        </div>
      </div>

      {filtered.length > 0 && (
        <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--c-muted)' }}>
          {filtered.length} 件 / 合計 {filtered.reduce((s, r) => s + r.participants, 0)} 名
        </div>
      )}

      {loading ? <p style={{ color: 'var(--c-muted)' }}>読み込み中...</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #dddde8', textAlign: 'left' }}>
                {eventFilter === 'all' && (
                  <th style={{ padding: '10px 14px', fontWeight: 500, color: 'var(--c-body)', whiteSpace: 'nowrap' }}>イベント</th>
                )}
                {headers.map((h) => (
                  <th key={h} style={{ padding: '10px 14px', fontWeight: 500, color: 'var(--c-body)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const sc = STATUS_COLORS[r.status] ?? STATUS_COLORS.pending
                const bringFlags = [r.bring_plant && '植物', r.bring_pot && '鉢'].filter(Boolean).join('・')
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f0f0f5' }}>
                    {eventFilter === 'all' && (
                      <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--c-muted)', maxWidth: 160, wordBreak: 'break-all' }}>
                        {eventsMap.get(r.event_id) ?? '-'}
                      </td>
                    )}
                    <td style={{ padding: '12px 14px', color: 'var(--c-muted)', whiteSpace: 'nowrap' }}>{new Date(r.created_at).toLocaleDateString('ja-JP')}</td>
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>{r.name}</td>
                    <td style={{ padding: '12px 14px' }}><a href={`mailto:${r.email}`} style={{ color: '#4a6741' }}>{r.email}</a></td>
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>{r.phone ?? '-'}</td>
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', color: r.preferred_date ? '#1c2417' : '#ccc' }}>{r.preferred_date ?? '-'}</td>
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', color: r.preferred_time ? '#1c2417' : '#ccc' }}>{r.preferred_time ?? '-'}</td>
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', color: r.session_time ? '#1c2417' : '#ccc' }}>{r.session_time ?? '-'}</td>
                    <td style={{ padding: '12px 14px' }}>{r.participants}</td>
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', fontSize: 12 }}>
                      {bringFlags || <span style={{ color: '#ccc' }}>-</span>}
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--c-muted)', maxWidth: 160 }}>{r.note ?? '-'}</td>
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 4, fontSize: 12, fontWeight: 500, background: sc.bg, color: sc.color }}>
                          {STATUS_LABELS[r.status] ?? r.status}
                        </span>
                        <select
                          value={r.status}
                          disabled={updating === r.id}
                          onChange={(e) => updateStatus(r.id, e.target.value)}
                          style={{ fontSize: 12, padding: '4px 8px', border: '1px solid #dddde8', borderRadius: 2, background: '#ffffff', cursor: 'pointer', fontFamily: 'inherit' }}
                        >
                          {Object.entries(STATUS_LABELS).map(([val, label]) => (
                            <option key={val} value={val}>{label}</option>
                          ))}
                        </select>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <p style={{ textAlign: 'center', padding: '40px 0', color: 'var(--c-muted)' }}>予約はありません。</p>}
        </div>
      )}
    </div>
  )
}
