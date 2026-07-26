import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import EventPreview from '../components/EventPreview'
import { api, type Event } from '../lib/api'
import PageMeta from '../components/PageMeta'

const BRANDS = ['ei8ht plants', 'Habitat Oides', 'HUE by ei8ht plants']

function getMonthLabel(dateStr: string) {
  const d = new Date(dateStr)
  return `${d.getFullYear()}年${d.getMonth() + 1}月`
}

export default function Events() {
  const [params] = useSearchParams()
  const isPast = params.get('page') === 'past'
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [brandFilter, setBrandFilter] = useState<string | null>(null)
  const [monthFilter, setMonthFilter] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setBrandFilter(null)
    setMonthFilter(null)
    api.events.list(isPast).then(setEvents).finally(() => setLoading(false))
  }, [isPast])

  const sorted = useMemo(
    () => [...events].sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()),
    [events]
  )

  const months = useMemo(
    () => [...new Set(sorted.map((e) => getMonthLabel(e.start_date)))],
    [sorted]
  )

  const filtered = useMemo(() => {
    return sorted.filter((e) => {
      if (brandFilter && !e.brands.includes(brandFilter)) return false
      if (monthFilter && getMonthLabel(e.start_date) !== monthFilter) return false
      return true
    })
  }, [sorted, brandFilter, monthFilter])

  const pinned = !isPast ? filtered[0] ?? null : null
  const rest = !isPast ? filtered.slice(1) : filtered

  const filterBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '7px 16px', border: '1px solid #ddd4c0', borderRadius: 20, fontSize: 12,
    letterSpacing: 1, cursor: 'pointer', fontFamily: 'inherit',
    background: active ? '#1c2417' : '#fffcf6',
    color: active ? '#fff' : '#8a9a7e',
    transition: 'all 0.15s',
  })

  const hasFilter = brandFilter !== null || monthFilter !== null

  return (
    <>
      <PageMeta title={isPast ? 'Past Events' : 'Events'} description="ei8ht plants のイベント・出展情報。ワークショップ予約も受け付けています。" />
      <div style={{ textAlign: 'center', padding: '50px 20px', background: '#f7f3ec' }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 40, fontWeight: 300, letterSpacing: 6, textTransform: 'uppercase', margin: 0 }}>
          {isPast ? 'Past Events' : 'Events'}
        </h1>
      </div>

      {!loading && events.length > 0 && (
        <div style={{ background: '#f7f3ec', borderBottom: '1px solid #ddd4c0', padding: '12px 20px' }}>
          <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, letterSpacing: 2, color: '#8a9a7e', textTransform: 'uppercase', marginRight: 4 }}>Brand</span>
            {BRANDS.map((b) => (
              <button key={b} style={filterBtnStyle(brandFilter === b)} onClick={() => setBrandFilter(brandFilter === b ? null : b)}>{b}</button>
            ))}
            {months.length > 1 && (
              <>
                <span style={{ fontSize: 11, letterSpacing: 2, color: '#8a9a7e', textTransform: 'uppercase', marginLeft: 8, marginRight: 4 }}>Month</span>
                {months.map((m) => (
                  <button key={m} style={filterBtnStyle(monthFilter === m)} onClick={() => setMonthFilter(monthFilter === m ? null : m)}>{m}</button>
                ))}
              </>
            )}
            {hasFilter && (
              <button onClick={() => { setBrandFilter(null); setMonthFilter(null) }}
                style={{ padding: '7px 14px', border: 'none', background: 'none', fontSize: 12, color: '#c0392b', cursor: 'pointer', fontFamily: 'inherit' }}>
                リセット ×
              </button>
            )}
          </div>
        </div>
      )}

      <div style={{ maxWidth: 920, margin: '40px auto', padding: '0 20px', width: '100%', boxSizing: 'border-box' }}>
        {loading && <p style={{ textAlign: 'center', padding: '100px 0', color: '#8a9a7e' }}>読み込み中...</p>}

        {!loading && filtered.length === 0 && (
          <p style={{ textAlign: 'center', padding: '100px 0', color: '#8a9a7e' }}>
            {hasFilter ? '条件に一致するイベントはありません。' : isPast ? '過去のイベントはありません。' : '予定されているイベントはありません。'}
          </p>
        )}

        {!loading && !isPast && pinned && (
          <>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 300, fontStyle: 'italic', letterSpacing: 2, margin: '0 0 40px 0', borderBottom: '1px solid #ddd4c0', paddingBottom: 12 }}>
              Next Event
            </h2>
            <EventPreview event={pinned} />
          </>
        )}

        {!loading && rest.length > 0 && (
          <>
            {!isPast && (
              <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 300, fontStyle: 'italic', letterSpacing: 2, margin: '0 0 40px 0', borderBottom: '1px solid #ddd4c0', paddingBottom: 12 }}>
                Events Schedule
              </h2>
            )}
            <div>
              {rest.map((event, i) => (
                <div key={event.id} style={{ borderBottom: i < rest.length - 1 ? '1px solid #ddd4c0' : 'none' }}>
                  <EventPreview event={event} />
                </div>
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
