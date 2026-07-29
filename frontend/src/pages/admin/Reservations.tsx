import { useEffect, useState } from 'react'
import { api, type Reservation } from '../../lib/api'

const STATUS_LABELS: Record<string, string> = {
  pending: '未確認',
  confirmed: '確定',
  cancelled: 'キャンセル',
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending: { bg: '#fff3cd', color: '#856404' },
  confirmed: { bg: '#d4edda', color: '#155724' },
  cancelled: { bg: '#f8d7da', color: '#721c24' },
}

type ReservationWithTime = Reservation & { session_time?: string }

function exportCsv(rows: ReservationWithTime[]) {
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
  a.download = `reservations_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function AdminReservations() {
  const [rows, setRows] = useState<ReservationWithTime[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)

  useEffect(() => {
    api.reserve.list().then(async (reservations) => {
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

  const headers = ['受付日', 'お名前', 'メール', '電話', '予約日', '予約時間', 'WSセッション', '人数', '持込', '備考', 'ステータス']

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 300, margin: 0 }}>WS予約一覧</h2>
        {rows.length > 0 && (
          <button onClick={() => exportCsv(rows)} style={{ padding: '8px 20px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 13, background: '#ffffff', cursor: 'pointer', fontFamily: 'inherit', color: '#3a4535' }}>
            CSV エクスポート
          </button>
        )}
      </div>
      {loading ? <p style={{ color: '#8a9a7e' }}>読み込み中...</p> : (
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
              {rows.map((r) => {
                const sc = STATUS_COLORS[r.status] ?? STATUS_COLORS.pending
                const bringFlags = [r.bring_plant && '植物', r.bring_pot && '鉢'].filter(Boolean).join('・')
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f0f0f5' }}>
                    <td style={{ padding: '12px 14px', color: '#8a9a7e', whiteSpace: 'nowrap' }}>{new Date(r.created_at).toLocaleDateString('ja-JP')}</td>
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
          {rows.length === 0 && <p style={{ textAlign: 'center', padding: '40px 0', color: '#8a9a7e' }}>予約はありません。</p>}
        </div>
      )}
    </div>
  )
}
