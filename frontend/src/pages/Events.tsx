import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import EventCard from '../components/EventCard'
import { api, type Event } from '../lib/api'

export default function Events() {
  const [params] = useSearchParams()
  const isPast = params.get('page') === 'past'
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.events.list(isPast).then(setEvents).finally(() => setLoading(false))
  }, [isPast])

  const sorted = [...events].sort(
    (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
  )
  const pinned = !isPast ? sorted[0] ?? null : null
  const rest = !isPast ? sorted.slice(1) : sorted

  return (
    <>
      <div style={{ textAlign: 'center', padding: '50px 20px', background: '#f7f3ec' }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 40, fontWeight: 300, letterSpacing: 6, textTransform: 'uppercase', margin: 0 }}>
          {isPast ? 'Past Events' : 'Events'}
        </h1>
      </div>

      <div style={{ maxWidth: 1280, margin: '40px auto', padding: '0 20px', width: '100%', boxSizing: 'border-box' }}>
        {loading && <p style={{ textAlign: 'center', padding: '100px 0', color: '#8a9a7e' }}>読み込み中...</p>}

        {!loading && events.length === 0 && (
          <p style={{ textAlign: 'center', padding: '100px 0', color: '#8a9a7e' }}>
            {isPast ? '過去のイベントはありません。' : '予定されているイベントはありません。'}
          </p>
        )}

        {!loading && !isPast && pinned && (
          <>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 300, fontStyle: 'italic', letterSpacing: 2, margin: '0 0 24px 0', borderBottom: '1px solid #ddd4c0', paddingBottom: 12 }}>
              Next Event
            </h2>
            <EventCard event={pinned} isNext />
          </>
        )}

        {!loading && rest.length > 0 && (
          <>
            {!isPast && (
              <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 300, fontStyle: 'italic', letterSpacing: 2, margin: '60px 0 24px 0', borderBottom: '1px solid #ddd4c0', paddingBottom: 12 }}>
                Events Schedule
              </h2>
            )}
            <div className="events-grid">
              {rest.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          </>
        )}

        <div style={{ textAlign: 'center', marginTop: 60 }}>
          <Link
            to={isPast ? '/events' : '/events?page=past'}
            style={{ display: 'inline-block', padding: '12px 30px', background: '#fffcf6', border: '1px solid #ddd4c0', color: '#8a9a7e', textDecoration: 'none', borderRadius: 14, fontSize: 16, letterSpacing: 2 }}
          >
            {isPast ? '現在のイベントを見る' : '過去のイベントを見る'}
          </Link>
        </div>
      </div>
    </>
  )
}
