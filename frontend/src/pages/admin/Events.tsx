import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api, type Event } from '../../lib/api'


function EventRow({ ev, reservationCountMap, del, duplicate }: {
  ev: Event
  reservationCountMap: Map<string, number>
  del: (id: string) => void
  duplicate: (ev: Event) => void
}) {
  const resCount = reservationCountMap.get(ev.id) ?? 0
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', padding: '16px 20px', background: '#ffffff', border: '1px solid #dddde8', borderRadius: 4, gap: 10 }}>
      <div style={{ flex: 1, minWidth: 160 }}>
        <div style={{ fontWeight: 500 }}>{ev.name}</div>
        <div style={{ fontSize: 13, color: 'var(--c-muted)', marginTop: 4 }}>
          {ev.start_date}{ev.end_date && ev.end_date !== ev.start_date ? ` 〜 ${ev.end_date}` : ''} / {ev.location}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Link to={`/admin/events/${ev.id}/edit`} style={{ padding: '8px 16px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 13, color: 'var(--c-body)', textDecoration: 'none' }}>編集</Link>
        <Link to={`/admin/events/${ev.id}/finances`} style={{ padding: '8px 16px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 13, color: '#4a6741', textDecoration: 'none' }}>収支</Link>
        <Link to={`/admin/events/${ev.id}/site`} style={{ padding: '8px 16px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 13, color: '#1e3272', textDecoration: 'none' }}>サイト</Link>
        {ev.has_workshop && (
          <Link to={`/admin/events/${ev.id}/reservations`} style={{ padding: '8px 16px', border: '1px solid #b8d0b2', borderRadius: 4, fontSize: 13, color: '#2d5a27', textDecoration: 'none', background: resCount > 0 ? '#f0f6ee' : 'none' }}>
            予約{resCount > 0 ? ` ${resCount}件` : ''}
          </Link>
        )}
        <button onClick={() => duplicate(ev)} style={{ padding: '8px 16px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 13, color: '#4a6741', background: 'none', cursor: 'pointer' }}>複製</button>
        <button onClick={() => del(ev.id)} style={{ padding: '8px 16px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 13, color: '#c0392b', background: 'none', cursor: 'pointer' }}>削除</button>
      </div>
    </div>
  )
}

export default function AdminEvents() {
  const [reservationCountMap, setReservationCountMap] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const location = useLocation()

  const [upcoming, setUpcoming] = useState<Event[]>([])
  const [past, setPast] = useState<Event[]>([])

  const load = () => {
    setLoading(true)
    Promise.all([
      api.events.list(false),
      api.events.list(true),
      api.reserve.list(),
    ]).then(([upcomingData, pastData, reservations]) => {
      setUpcoming([...upcomingData].sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()))
      setPast([...pastData].sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()))
      const countMap = new Map<string, number>()
      reservations.filter((r) => r.status !== 'cancelled').forEach((r) => {
        countMap.set(r.event_id, (countMap.get(r.event_id) ?? 0) + 1)
      })
      setReservationCountMap(countMap)
    }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [location.key])

  const del = async (id: string) => {
    if (!confirm('削除しますか？')) return
    await api.events.delete(id)
    setUpcoming((prev) => prev.filter((ev) => ev.id !== id))
    setPast((prev) => prev.filter((ev) => ev.id !== id))
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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 300, margin: 0 }}>イベント管理</h2>
        <Link to="/admin/events/new" style={{ padding: '10px 24px', background: 'var(--c-ink)', color: '#fff', textDecoration: 'none', borderRadius: 4, fontSize: 14 }}>
          + 新規追加
        </Link>
      </div>

      {loading ? <p style={{ color: 'var(--c-muted)' }}>読み込み中...</p> : (
        <>
          {/* 今後のイベント */}
          <p style={{ fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--c-muted)', margin: '0 0 12px' }}>今後のイベント</p>
          {upcoming.length === 0 ? (
            <p style={{ color: '#bbb', fontSize: 13, marginBottom: 32 }}>予定なし</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 36 }}>
              {upcoming.map((ev) => <EventRow key={ev.id} ev={ev} reservationCountMap={reservationCountMap} del={del} duplicate={duplicate} />)}
            </div>
          )}

          {/* 過去のイベント */}
          <p style={{ fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--c-muted)', margin: '0 0 12px' }}>過去のイベント</p>
          {past.length === 0 ? (
            <p style={{ color: '#bbb', fontSize: 13 }}>なし</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {past.map((ev) => <EventRow key={ev.id} ev={ev} reservationCountMap={reservationCountMap} del={del} duplicate={duplicate} />)}
            </div>
          )}
        </>
      )}
    </div>
  )
}
