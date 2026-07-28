import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, computeFinances, type Event, type EventFinances } from '../../lib/api'

function fmt(n: number) {
  return n.toLocaleString('ja-JP')
}

export default function AdminEvents() {
  const [events, setEvents] = useState<Event[]>([])
  const [financeMap, setFinanceMap] = useState<Map<string, EventFinances>>(new Map())
  const [reservationCountMap, setReservationCountMap] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    Promise.all([
      api.events.list(false),
      api.events.list(true),
      api.events.getAllFinances(),
      api.reserve.list(),
    ]).then(([upcoming, past, finances, reservations]) => {
      setEvents([...upcoming, ...past])
      setFinanceMap(new Map(finances.map((f) => [f.event_id, f])))
      const countMap = new Map<string, number>()
      reservations.filter((r) => r.status !== 'cancelled').forEach((r) => {
        countMap.set(r.event_id, (countMap.get(r.event_id) ?? 0) + 1)
      })
      setReservationCountMap(countMap)
    }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const del = async (id: string) => {
    if (!confirm('削除しますか？')) return
    await api.events.delete(id)
    load()
  }

  const duplicate = async (ev: Event) => {
    await api.events.create({
      name: `${ev.name} (コピー)`,
      start_date: ev.start_date,
      end_date: ev.end_date ?? undefined,
      time: ev.time ?? undefined,
      location: ev.location,
      booth_number: ev.booth_number ?? undefined,
      address: ev.address ?? undefined,
      official_url: ev.official_url ?? undefined,
      brands: ev.brands,
      has_workshop: ev.has_workshop,
      ws_requires_reservation: ev.ws_requires_reservation,
      image_urls: ev.images.map((i) => i.url),
    })
    load()
  }

  const sorted = [...events].sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())

  // aggregate only events that have finance data saved
  const netsWithData = sorted
    .filter((ev) => financeMap.has(ev.id))
    .map((ev) => computeFinances(financeMap.get(ev.id)!, ev.has_workshop).net)

  const totalNet = netsWithData.reduce((s, n) => s + n, 0)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 300, margin: 0 }}>イベント管理</h2>
        <Link to="/admin/events/new" style={{ padding: '10px 24px', background: '#1c2417', color: '#fff', textDecoration: 'none', borderRadius: 8, fontSize: 14 }}>
          + 新規追加
        </Link>
      </div>

      {/* 収支合計サマリー */}
      {netsWithData.length > 0 && (
        <div style={{
          display: 'flex',
          gap: 16,
          marginBottom: 28,
          padding: '16px 20px',
          background: totalNet >= 0 ? '#f0f5ee' : '#fdf0ee',
          border: `1px solid ${totalNet >= 0 ? '#b8d4ae' : '#f0b8ae'}`,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: 1, color: '#8a9a7e', textTransform: 'uppercase' }}>収支合計</div>
            <div style={{ fontSize: 11, color: '#8a9a7e', marginTop: 2 }}>{netsWithData.length} イベント（収支登録済み）</div>
          </div>
          <div style={{ fontSize: 24, fontWeight: 600, color: totalNet >= 0 ? '#2d5a27' : '#c0392b', fontFamily: "'Cormorant Garamond', serif" }}>
            {totalNet >= 0 ? '+' : ''}{fmt(totalNet)} 円
          </div>
        </div>
      )}

      {loading ? <p style={{ color: '#8a9a7e' }}>読み込み中...</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sorted.map((ev) => {
            const fin = financeMap.get(ev.id)
            const net = fin ? computeFinances(fin, ev.has_workshop).net : null
            const resCount = reservationCountMap.get(ev.id) ?? 0
            return (
              <div key={ev.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', background: '#ffffff', border: '1px solid #dddde8', borderRadius: 10, gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>{ev.name}</div>
                  <div style={{ fontSize: 13, color: '#8a9a7e', marginTop: 4 }}>{ev.start_date} / {ev.location}</div>
                </div>
                {net !== null && (
                  <div style={{
                    fontWeight: 600,
                    color: net >= 0 ? '#2d5a27' : '#c0392b',
                    minWidth: 90,
                    textAlign: 'right',
                    fontFamily: "'Cormorant Garamond', serif",
                    fontSize: 16,
                  } as React.CSSProperties}>
                    {net >= 0 ? '+' : ''}{fmt(net)} 円
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Link to={`/admin/events/${ev.id}/edit`} style={{ padding: '8px 16px', border: '1px solid #dddde8', borderRadius: 8, fontSize: 13, color: '#3a4535', textDecoration: 'none' }}>編集</Link>
                  <Link to={`/admin/events/${ev.id}/finances`} style={{ padding: '8px 16px', border: '1px solid #dddde8', borderRadius: 8, fontSize: 13, color: '#4a6741', textDecoration: 'none' }}>収支</Link>
                  <Link to={`/admin/events/${ev.id}/site`} style={{ padding: '8px 16px', border: '1px solid #dddde8', borderRadius: 8, fontSize: 13, color: '#1e3272', textDecoration: 'none' }}>サイト</Link>
                  {ev.has_workshop && (
                    <Link to={`/admin/events/${ev.id}/reservations`} style={{ padding: '8px 16px', border: '1px solid #b8d0b2', borderRadius: 8, fontSize: 13, color: '#2d5a27', textDecoration: 'none', background: resCount > 0 ? '#f0f6ee' : 'none' }}>
                      予約{resCount > 0 ? ` ${resCount}件` : ''}
                    </Link>
                  )}
                  <button onClick={() => duplicate(ev)} style={{ padding: '8px 16px', border: '1px solid #dddde8', borderRadius: 8, fontSize: 13, color: '#4a6741', background: 'none', cursor: 'pointer' }}>複製</button>
                  <button onClick={() => del(ev.id)} style={{ padding: '8px 16px', border: '1px solid #dddde8', borderRadius: 8, fontSize: 13, color: '#c0392b', background: 'none', cursor: 'pointer' }}>削除</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
