import { useEffect, useState } from 'react'

interface Reservation {
  id: string; event_id: string; name: string; email: string
  phone: string | null; participants: number; note: string | null; created_at: string
}

export default function AdminReservations() {
  const [rows, setRows] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/reservations').then((r) => r.json()).then(setRows).finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 300, marginBottom: 24 }}>WS予約一覧</h2>
      {loading ? <p style={{ color: '#8a9a7e' }}>読み込み中...</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #ddd4c0', textAlign: 'left' }}>
                {['受付日', 'お名前', 'メール', '電話', '人数', '備考'].map((h) => (
                  <th key={h} style={{ padding: '10px 14px', fontWeight: 500, color: '#3a4535' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid #f0ebe0' }}>
                  <td style={{ padding: '12px 14px', color: '#8a9a7e' }}>{new Date(r.created_at).toLocaleDateString('ja-JP')}</td>
                  <td style={{ padding: '12px 14px' }}>{r.name}</td>
                  <td style={{ padding: '12px 14px' }}><a href={`mailto:${r.email}`} style={{ color: '#4a6741' }}>{r.email}</a></td>
                  <td style={{ padding: '12px 14px' }}>{r.phone ?? '-'}</td>
                  <td style={{ padding: '12px 14px' }}>{r.participants}</td>
                  <td style={{ padding: '12px 14px', color: '#8a9a7e' }}>{r.note ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p style={{ textAlign: 'center', padding: '40px 0', color: '#8a9a7e' }}>予約はありません。</p>}
        </div>
      )}
    </div>
  )
}
