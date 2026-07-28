import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, type Event, type Reservation, type WsSession } from '../../lib/api'

const STATUS_LABELS: Record<string, string> = {
  pending: '未確認',
  confirmed: '確認済み',
  cancelled: 'キャンセル',
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending: { bg: '#fff3cd', color: '#856404' },
  confirmed: { bg: '#d4edda', color: '#155724' },
  cancelled: { bg: '#f8d7da', color: '#721c24' },
}

type ReservationWithTime = Reservation & { session_time?: string }

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function buildPrintHtml(event: Event, rows: ReservationWithTime[]): string {
  const dateRange = event.end_date && event.end_date !== event.start_date
    ? `${event.start_date} 〜 ${event.end_date}`
    : event.start_date
  const trs = rows.map((r) => {
    const bring = [r.bring_plant && '植物', r.bring_pot && '鉢'].filter(Boolean).join('・')
    return `<tr>
      <td>${new Date(r.created_at).toLocaleDateString('ja-JP')}</td>
      <td>${esc(r.name)}</td>
      <td>${esc(r.preferred_date ?? '-')}</td>
      <td>${esc(r.preferred_time ?? '-')}</td>
      <td>${esc(r.session_time ?? '-')}</td>
      <td>${r.participants}</td>
      <td>${esc(bring || '-')}</td>
      <td>${esc(r.note ?? '-')}</td>
      <td>${STATUS_LABELS[r.status] ?? r.status}</td>
    </tr>`
  }).join('')
  const totalPeople = rows.reduce((s, r) => s + r.participants, 0)
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">
<title>${esc(event.name)} 予約一覧</title>
<style>
body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;padding:16px 20px;color:#1c2417;}
h1{font-size:15px;font-weight:normal;margin:0 0 3px;}
p.meta{font-size:10px;color:#666;margin:0 0 14px;}
table{width:100%;border-collapse:collapse;}
th{background:#3a4535;color:#fff;padding:6px 8px;text-align:left;font-weight:normal;font-size:10px;letter-spacing:.5px;}
td{padding:5px 8px;border-bottom:1px solid #e8e8e8;vertical-align:top;}
tr:nth-child(even) td{background:#f7f7f7;}
p.total{margin:8px 0 0;font-size:10px;color:#666;}
</style></head><body>
<h1>${esc(event.name)} ワークショップ予約一覧</h1>
<p class="meta">${esc(dateRange)}${event.time ? ' ' + esc(event.time) : ''} / ${esc(event.location)}</p>
<table><thead><tr>
  <th>受付日</th><th>お名前</th><th>予約日</th><th>予約時間</th><th>WSセッション</th><th>人数</th><th>持込</th><th>備考</th><th>ステータス</th>
</tr></thead>
<tbody>${trs}</tbody></table>
<p class="total">合計 ${rows.length} 件 / ${totalPeople} 名</p>
<script>window.onload=()=>window.print();</script>
</body></html>`
}

function exportCsv(event: Event, rows: ReservationWithTime[]) {
  const header = ['受付日', 'お名前', 'メール', '電話', '予約日', '予約時間', 'WSセッション', '人数', '植物持込', '鉢持込', '備考', 'ステータス']
  const lines = rows.map((r) => [
    new Date(r.created_at).toLocaleDateString('ja-JP'),
    r.name, r.email, r.phone ?? '',
    r.preferred_date ?? '',
    r.preferred_time ?? '',
    r.session_time ?? '',
    String(r.participants),
    r.bring_plant ? 'あり' : 'なし',
    r.bring_pot ? 'あり' : 'なし',
    r.note ?? '', STATUS_LABELS[r.status] ?? r.status,
  ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
  const bom = '﻿'
  const csv = bom + [header.join(','), ...lines].join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `reservations_${event.name}_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function AdminEventReservations() {
  const { id } = useParams<{ id: string }>()
  const [event, setEvent] = useState<Event | null>(null)
  const [sessions, setSessions] = useState<WsSession[]>([])
  const [rows, setRows] = useState<ReservationWithTime[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSession, setActiveSession] = useState<string>('all')
  const [updating, setUpdating] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    Promise.all([
      api.events.get(id),
      api.events.getSessions(id),
      api.reserve.list(id),
    ]).then(([ev, sess, reservations]) => {
      setEvent(ev)
      setSessions(sess)
      const sessionMap = new Map(sess.map((s) => [s.id, s.time_label]))
      setRows(reservations.map((r) => ({
        ...r,
        session_time: r.session_id ? sessionMap.get(r.session_id) : undefined,
      })))
    }).finally(() => setLoading(false))
  }, [id])

  const updateStatus = async (reservationId: string, status: string) => {
    setUpdating(reservationId)
    const updated = await api.reserve.updateStatus(reservationId, status)
    setRows((prev) => prev.map((r) => r.id === reservationId ? { ...r, ...updated } : r))
    setUpdating(null)
  }

  const filtered = activeSession === 'all'
    ? rows
    : rows.filter((r) => r.session_id === activeSession)

  const handlePrint = () => {
    if (!event) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(buildPrintHtml(event, filtered))
    win.document.close()
  }

  const nonCancelled = rows.filter((r) => r.status !== 'cancelled')
  const totalPeople = nonCancelled.reduce((s, r) => s + r.participants, 0)

  const btnStyle: React.CSSProperties = {
    padding: '8px 18px', border: '1px solid #dddde8', borderRadius: 4,
    fontSize: 13, background: '#ffffff', cursor: 'pointer', fontFamily: 'inherit', color: '#3a4535',
  }

  const headers = ['受付日', 'お名前', 'メール', '電話', '予約日', '予約時間', 'WSセッション', '人数', '持込', '備考', 'ステータス']

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Link to="/admin/events" style={{ fontSize: 13, color: '#8a9a7e', textDecoration: 'none' }}>
          &larr; イベント管理
        </Link>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 300, margin: '0 0 6px' }}>
            {event ? event.name : '読み込み中...'}
          </h2>
          {event && (
            <p style={{ margin: 0, fontSize: 13, color: '#8a9a7e' }}>
              {event.start_date}{event.end_date && event.end_date !== event.start_date ? ` 〜 ${event.end_date}` : ''}
              {event.time ? ` ${event.time}` : ''} / {event.location}
            </p>
          )}
        </div>
        {rows.length > 0 && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handlePrint} style={btnStyle}>印刷</button>
            <button onClick={() => event && exportCsv(event, filtered)} style={btnStyle}>CSV</button>
          </div>
        )}
      </div>

      {!loading && rows.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#8a9a7e', marginRight: 4 }}>
            全{nonCancelled.length}件 / {totalPeople}名
          </span>
          {sessions.length > 0 && (
            <>
              <button
                onClick={() => setActiveSession('all')}
                style={{ ...btnStyle, background: activeSession === 'all' ? '#1c2417' : '#ffffff', color: activeSession === 'all' ? '#fff' : '#3a4535', border: `1px solid ${activeSession === 'all' ? '#1c2417' : '#dddde8'}` }}
              >
                全て
              </button>
              {sessions.map((s) => {
                const count = rows.filter((r) => r.session_id === s.id && r.status !== 'cancelled').length
                return (
                  <button
                    key={s.id}
                    onClick={() => setActiveSession(s.id)}
                    style={{ ...btnStyle, background: activeSession === s.id ? '#1c2417' : '#ffffff', color: activeSession === s.id ? '#fff' : '#3a4535', border: `1px solid ${activeSession === s.id ? '#1c2417' : '#dddde8'}` }}
                  >
                    {s.time_label}{count > 0 ? ` (${count})` : ''}
                  </button>
                )
              })}
            </>
          )}
        </div>
      )}

      {loading ? (
        <p style={{ color: '#8a9a7e' }}>読み込み中...</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #dddde8', textAlign: 'left' }}>
                {headers.map((h) => (
                  <th key={h} style={{ padding: '10px 14px', fontWeight: 500, color: '#3a4535', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const sc = STATUS_COLORS[r.status] ?? STATUS_COLORS.pending
                const bringFlags = [r.bring_plant && '植物', r.bring_pot && '鉢'].filter(Boolean).join('・')
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f0f0f5' }}>
                    <td style={{ padding: '12px 14px', color: '#8a9a7e', whiteSpace: 'nowrap' }}>
                      {new Date(r.created_at).toLocaleDateString('ja-JP')}
                    </td>
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>{r.name}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <a href={`mailto:${r.email}`} style={{ color: '#4a6741' }}>{r.email}</a>
                    </td>
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>{r.phone ?? '-'}</td>
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', color: r.preferred_date ? '#1c2417' : '#ccc' }}>
                      {r.preferred_date ?? '-'}
                    </td>
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', color: r.preferred_time ? '#1c2417' : '#ccc' }}>
                      {r.preferred_time ?? '-'}
                    </td>
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', color: r.session_time ? '#1c2417' : '#ccc' }}>
                      {r.session_time ?? '-'}
                    </td>
                    <td style={{ padding: '12px 14px' }}>{r.participants}</td>
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', fontSize: 12 }}>
                      {bringFlags || <span style={{ color: '#ccc' }}>-</span>}
                    </td>
                    <td style={{ padding: '12px 14px', color: '#8a9a7e', maxWidth: 160 }}>{r.note ?? '-'}</td>
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
          {filtered.length === 0 && (
            <p style={{ textAlign: 'center', padding: '40px 0', color: '#8a9a7e' }}>予約はありません。</p>
          )}
        </div>
      )}
    </div>
  )
}
