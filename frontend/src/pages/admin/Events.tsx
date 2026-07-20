import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Event } from '../../lib/api'

export default function AdminEvents() {
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    Promise.all([api.events.list(false), api.events.list(true)])
      .then(([upcoming, past]) => setEvents([...upcoming, ...past]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const del = async (id: string) => {
    if (!confirm('削除しますか？')) return
    await api.events.delete(id)
    load()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 300, margin: 0 }}>イベント管理</h2>
        <Link to="/admin/events/new" style={{ padding: '10px 24px', background: '#1c2417', color: '#fff', textDecoration: 'none', borderRadius: 8, fontSize: 14 }}>
          + 新規追加
        </Link>
      </div>
      {loading ? <p style={{ color: '#8a9a7e' }}>読み込み中...</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {events.sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()).map((ev) => (
            <div key={ev.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', background: '#fffcf6', border: '1px solid #ddd4c0', borderRadius: 10 }}>
              <div>
                <div style={{ fontWeight: 500 }}>{ev.name}</div>
                <div style={{ fontSize: 13, color: '#8a9a7e', marginTop: 4 }}>{ev.start_date} / {ev.location}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Link to={`/admin/events/${ev.id}/edit`} style={{ padding: '8px 16px', border: '1px solid #ddd4c0', borderRadius: 8, fontSize: 13, color: '#3a4535', textDecoration: 'none' }}>編集</Link>
                <button onClick={() => del(ev.id)} style={{ padding: '8px 16px', border: '1px solid #ddd4c0', borderRadius: 8, fontSize: 13, color: '#c0392b', background: 'none', cursor: 'pointer' }}>削除</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
