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
  const [workshopFilter, setWorkshopFilter] = useState<boolean | null>(null)

  useEffect(() => {
    setLoading(true)
    setBrandFilter(null)
    setMonthFilter(null)
    setWorkshopFilter(null)
    api.events.list(isPast).then(setEvents).finally(() => setLoading(false))
  }, [isPast])

  const sorted = useMemo(
    () => [...events].sort((a, b) =>
      isPast
        ? new Date(b.start_date).getTime() - new Date(a.start_date).getTime()  // 過去: 当日に近い順
        : new Date(a.start_date).getTime() - new Date(b.start_date).getTime()  // 今後: 今日に近い順
    ),
    [events, isPast]
  )

  const months = useMemo(
    () => [...new Set(sorted.map((e) => getMonthLabel(e.start_date)))],
    [sorted]
  )

  const filtered = useMemo(() => {
    return sorted.filter((e) => {
      if (brandFilter && !e.brands.includes(brandFilter)) return false
      if (monthFilter && getMonthLabel(e.start_date) !== monthFilter) return false
      if (workshopFilter !== null && e.has_workshop !== workshopFilter) return false
      return true
    })
  }, [sorted, brandFilter, monthFilter, workshopFilter])

  const filterBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '7px 16px', border: '1px solid #dddde8', borderRadius: 20, fontSize: 12,
    letterSpacing: 1, cursor: 'pointer', fontFamily: 'inherit',
    background: active ? '#1c2417' : '#ffffff',
    color: active ? '#fff' : '#8a9a7e',
    transition: 'all 0.15s',
  })

  const selectStyle: React.CSSProperties = {
    flex: 1, padding: '8px 10px', border: '1px solid #dddde8', borderRadius: 4,
    fontSize: 13, fontFamily: 'inherit', background: '#ffffff', color: 'var(--c-body)', cursor: 'pointer',
  }

  const resetBtn: React.CSSProperties = {
    padding: '5px 12px', border: 'none', background: 'none', fontSize: 12,
    color: '#c0392b', cursor: 'pointer', fontFamily: 'inherit',
  }

  const hasFilter = brandFilter !== null || monthFilter !== null || workshopFilter !== null

  return (
    <>
      <PageMeta title={isPast ? 'Past Events' : 'Events'} description="ei8ht plants のイベント・出展情報。ワークショップ予約も受け付けています。" />
      <div style={{ textAlign: 'center', padding: '50px 20px', background: '#f5f5f7' }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 40, fontWeight: 300, letterSpacing: 6, textTransform: 'uppercase', margin: 0 }}>
          {isPast ? 'Past Events' : 'Events'}
        </h1>
      </div>

      {!loading && events.length > 0 && (
        <div style={{ background: '#f5f5f7', borderBottom: '1px solid #dddde8', padding: '14px 20px' }}>
          <div style={{ maxWidth: 1280, margin: '0 auto' }}>

            {/* PC フィルター: ボタン行 */}
            <div className="filter-pc">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 10, letterSpacing: 2, color: '#aaa', textTransform: 'uppercase', width: 48, flexShrink: 0 }}>Brand</span>
                {BRANDS.map((b) => (
                  <button key={b} style={filterBtnStyle(brandFilter === b)} onClick={() => setBrandFilter(brandFilter === b ? null : b)}>{b}</button>
                ))}
              </div>
              {months.length > 1 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', paddingTop: 8, borderTop: '1px solid #e0e0ea' }}>
                  <span style={{ fontSize: 10, letterSpacing: 2, color: '#aaa', textTransform: 'uppercase', width: 48, flexShrink: 0 }}>Month</span>
                  {months.map((m) => (
                    <button key={m} style={filterBtnStyle(monthFilter === m)} onClick={() => setMonthFilter(monthFilter === m ? null : m)}>{m}</button>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', paddingTop: 8, borderTop: '1px solid #e0e0ea' }}>
                <span style={{ fontSize: 10, letterSpacing: 2, color: '#aaa', textTransform: 'uppercase', width: 48, flexShrink: 0 }}>WS</span>
                <button style={filterBtnStyle(workshopFilter === true)} onClick={() => setWorkshopFilter(workshopFilter === true ? null : true)}>Workshop 開催</button>
              </div>
              {hasFilter && (
                <div style={{ paddingTop: 4 }}>
                  <button onClick={() => { setBrandFilter(null); setMonthFilter(null); setWorkshopFilter(null) }} style={resetBtn}>
                    フィルターをリセット ×
                  </button>
                </div>
              )}
            </div>

            {/* モバイルフィルター: プルダウン + チェックボックス */}
            <div className="filter-mobile">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 10, letterSpacing: 2, color: '#aaa', textTransform: 'uppercase', width: 48, flexShrink: 0 }}>Brand</span>
                <select value={brandFilter ?? ''} onChange={(e) => setBrandFilter(e.target.value || null)} style={selectStyle}>
                  <option value="">すべてのブランド</option>
                  {BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              {months.length > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 10, letterSpacing: 2, color: '#aaa', textTransform: 'uppercase', width: 48, flexShrink: 0 }}>Month</span>
                  <select value={monthFilter ?? ''} onChange={(e) => setMonthFilter(e.target.value || null)} style={selectStyle}>
                    <option value="">すべての月</option>
                    {months.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', paddingTop: 2 }}>
                <span style={{ fontSize: 10, letterSpacing: 2, color: '#aaa', textTransform: 'uppercase', width: 48, flexShrink: 0 }}>WS</span>
                <input
                  type="checkbox"
                  checked={workshopFilter === true}
                  onChange={(e) => setWorkshopFilter(e.target.checked ? true : null)}
                  style={{ width: 16, height: 16, accentColor: '#1c2417', flexShrink: 0 }}
                />
                <span style={{ fontSize: 13, color: 'var(--c-body)' }}>Workshop 開催のみ</span>
              </label>
              {hasFilter && (
                <button onClick={() => { setBrandFilter(null); setMonthFilter(null); setWorkshopFilter(null) }} style={resetBtn}>
                  フィルターをリセット ×
                </button>
              )}
            </div>

          </div>
        </div>
      )}

      <div style={{ maxWidth: 1200, margin: '40px auto', padding: '0 20px', width: '100%', boxSizing: 'border-box' }}>
        {loading && <p style={{ textAlign: 'center', padding: '100px 0', color: 'var(--c-muted)' }}>読み込み中...</p>}

        {!loading && filtered.length === 0 && (
          <p style={{ textAlign: 'center', padding: '100px 0', color: 'var(--c-muted)' }}>
            {hasFilter ? '条件に一致するイベントはありません。' : isPast ? '過去のイベントはありません。' : '予定されているイベントはありません。'}
          </p>
        )}

        {!loading && filtered.length > 0 && (
          <div className="events-grid">
            {filtered.map((event) => (
              <EventPreview key={event.id} event={event} />
            ))}
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: 60 }}>
          <Link
            to={isPast ? '/events' : '/events?page=past'}
            style={{ display: 'inline-block', padding: '12px 30px', background: '#ffffff', border: '1px solid #dddde8', color: 'var(--c-muted)', textDecoration: 'none', borderRadius: 4, fontSize: 16, letterSpacing: 2 }}
          >
            {isPast ? '現在のイベントを見る' : '過去のイベントを見る'}
          </Link>
        </div>
      </div>
    </>
  )
}
