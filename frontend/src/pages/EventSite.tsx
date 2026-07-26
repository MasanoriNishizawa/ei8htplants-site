import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api, type Event, type PageContent } from '../lib/api'
import PageMeta from '../components/PageMeta'

function fmtDate(start: string, end?: string | null) {
  const s = new Date(start)
  const base = `${s.getFullYear()}年${s.getMonth() + 1}月${s.getDate()}日`
  if (!end || end === start) return base
  const e = new Date(end)
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) {
    return `${base}〜${e.getDate()}日`
  }
  return `${base}〜${e.getFullYear()}年${e.getMonth() + 1}月${e.getDate()}日`
}

const headStyle: React.CSSProperties = {
  fontFamily: "'Cormorant Garamond', serif",
  fontSize: 13,
  letterSpacing: 4,
  textTransform: 'uppercase',
  color: '#8a9a7e',
  fontWeight: 400,
  margin: '0 0 40px',
  paddingBottom: 16,
  borderBottom: '1px solid #ddd4c0',
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt style={{ fontSize: 12, letterSpacing: 2, color: '#8a9a7e', textTransform: 'uppercase', whiteSpace: 'nowrap', paddingTop: 2 }}>{label}</dt>
      <dd style={{ margin: 0, fontSize: 15, color: '#1c2417', lineHeight: 1.8 }}>{value}</dd>
    </>
  )
}

export default function EventSite() {
  const { id } = useParams<{ id: string }>()
  const [event, setEvent] = useState<Event | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    api.events.get(id).then(setEvent).catch(() => setEvent(null)).finally(() => setLoading(false))
  }, [id])

  if (loading) return <div style={{ padding: '120px 20px', textAlign: 'center', color: '#8a9a7e' }}>読み込み中...</div>
  if (!event) return <div style={{ padding: '120px 20px', textAlign: 'center', color: '#8a9a7e' }}>イベントが見つかりませんでした。</div>

  const pc: PageContent = event.page_content ?? {}
  const isArchived = pc.archive?.enabled ?? false
  const dateLabel = fmtDate(event.start_date, event.end_date)
  const validUrl = (u?: string | null) => (u && !u.startsWith('blob:') ? u : '')
  const heroImage = validUrl(pc.hero?.image_url) || validUrl(event.images[0]?.url)

  return (
    <>
      <PageMeta
        title={event.name}
        description={pc.concept ?? `${dateLabel} / ${event.location}`}
        ogImage={heroImage || undefined}
      />

      {/* Hero */}
      <section style={{
        minHeight: '80vh',
        background: heroImage
          ? `#1c2417 url(${heroImage}) center/cover no-repeat`
          : 'linear-gradient(135deg, #1c2417 0%, #3a4535 100%)',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '80px 20px 60px',
        overflow: 'hidden',
      }}>
        {heroImage && <div style={{ position: 'absolute', inset: 0, background: 'rgba(28,36,23,0.52)', zIndex: 1 }} />}
        <div style={{ position: 'relative', zIndex: 2, maxWidth: 800 }}>
          {isArchived && (
            <div style={{ fontSize: 11, letterSpacing: 3, color: 'rgba(200,185,155,0.65)', textTransform: 'uppercase', marginBottom: 20 }}>Archived</div>
          )}
          <h1 style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 'clamp(32px, 7vw, 76px)',
            fontWeight: 300,
            letterSpacing: '0.06em',
            color: '#f7f3ec',
            margin: '0 0 20px',
            lineHeight: 1.15,
          }}>
            {event.name}
          </h1>
          {pc.hero?.tagline && (
            <p style={{ fontSize: 'clamp(14px, 1.8vw, 18px)', color: 'rgba(247,243,236,0.72)', letterSpacing: '0.05em', margin: '0 0 32px', fontWeight: 300 }}>
              {pc.hero.tagline}
            </p>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 28px', justifyContent: 'center', color: 'rgba(200,185,155,0.85)', fontSize: 14, letterSpacing: 2 }}>
            <span>{dateLabel}</span>
            {event.time && <span>{event.time}</span>}
            <span>{event.location}</span>
          </div>
          {!isArchived && event.has_workshop && event.ws_requires_reservation && (
            <Link
              to={`/reserve?event_id=${event.id}`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 10, marginTop: 44,
                padding: '14px 36px', border: '1px solid rgba(200,185,155,0.5)',
                color: '#f7f3ec', textDecoration: 'none', fontSize: 13, letterSpacing: '2px',
                textTransform: 'uppercase', borderRadius: 2, transition: 'all 0.2s',
              }}
            >
              ワークショップ予約 →
            </Link>
          )}
        </div>
      </section>

      {/* 開催情報 */}
      {(pc.venue || event.address || event.time || event.daily_times) && (
        <section style={{ background: '#fffcf6', borderBottom: '1px solid #ddd4c0' }}>
          <div style={{ maxWidth: 900, margin: '0 auto', padding: '64px 20px' }}>
            <h2 style={headStyle}>開催情報</h2>
            <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '18px 40px', margin: 0 }}>
              <InfoRow label="日程" value={dateLabel} />
              {event.daily_times && Object.keys(event.daily_times).length > 0 ? (
                <>
                  <dt style={{ fontSize: 12, letterSpacing: 2, color: '#8a9a7e', textTransform: 'uppercase', whiteSpace: 'nowrap', paddingTop: 2 }}>時間</dt>
                  <dd style={{ margin: 0 }}>
                    {Object.entries(event.daily_times).sort(([a], [b]) => a.localeCompare(b)).map(([date, time]) => {
                      const d = new Date(date + 'T00:00:00')
                      const dow = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()]
                      return (
                        <div key={date} style={{ display: 'flex', gap: 16, fontSize: 15, color: '#1c2417', lineHeight: 2 }}>
                          <span style={{ minWidth: 110 }}>{d.getMonth() + 1}月{d.getDate()}日（{dow}）</span>
                          <span>{time}</span>
                        </div>
                      )
                    })}
                  </dd>
                </>
              ) : (
                event.time && <InfoRow label="時間" value={event.time} />
              )}
              <InfoRow label="会場" value={event.location} />
              {(pc.venue?.address ?? event.address) && (
                <InfoRow label="住所" value={pc.venue?.address ?? event.address ?? ''} />
              )}
              {pc.venue?.access && <InfoRow label="アクセス" value={pc.venue.access} />}
            </dl>
            {pc.venue?.map_url && (
              <a
                href={pc.venue.map_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 28, fontSize: 13, color: '#8a9a7e', letterSpacing: 1, textDecoration: 'none', borderBottom: '1px solid #ddd4c0', paddingBottom: 2 }}
              >
                Google Maps で見る →
              </a>
            )}
          </div>
        </section>
      )}

      {/* コンセプト */}
      {pc.concept && (
        <section style={{ background: '#f7f3ec', borderBottom: '1px solid #ddd4c0' }}>
          <div style={{ maxWidth: 760, margin: '0 auto', padding: '72px 20px', textAlign: 'center' }}>
            <h2 style={headStyle}>Concept</h2>
            <p style={{ fontSize: 16, lineHeight: 2.3, color: '#3a4535', letterSpacing: '0.04em', whiteSpace: 'pre-line', margin: 0 }}>
              {pc.concept}
            </p>
          </div>
        </section>
      )}

      {/* ラインナップ */}
      {pc.lineup && pc.lineup.length > 0 && (
        <section style={{ background: '#fffcf6', borderBottom: '1px solid #ddd4c0' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', padding: '72px 20px' }}>
            <h2 style={headStyle}>Lineup</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 24 }}>
              {pc.lineup.map((item, i) => (
                <div key={i} style={{ background: '#f7f3ec', borderRadius: 10, overflow: 'hidden', border: '1px solid #ddd4c0' }}>
                  {item.image_url && (
                    <div style={{ aspectRatio: '4/3', overflow: 'hidden' }}>
                      <img src={item.image_url} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  )}
                  <div style={{ padding: '20px 20px 24px' }}>
                    <h3 style={{ fontSize: 16, fontWeight: 500, letterSpacing: 1, margin: '0 0 8px', color: '#1c2417' }}>{item.title}</h3>
                    {item.description && <p style={{ fontSize: 14, color: '#3a4535', lineHeight: 1.8, margin: 0 }}>{item.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ワークショップ */}
      {pc.workshop && (
        <section style={{ background: '#1e3272', borderTop: '1px solid #2e4898', borderBottom: '1px solid #2e4898' }}>
          <div style={{ maxWidth: 900, margin: '0 auto', padding: '72px 20px', textAlign: 'center' }}>
            <h2 style={{ ...headStyle, color: '#9aaedd', borderBottomColor: '#3a58b8' }}>Workshop</h2>
            {pc.workshop.title && (
              <h3 style={{ fontSize: 'clamp(22px, 3.5vw, 36px)', fontWeight: 200, color: '#f0f2ff', letterSpacing: '0.08em', margin: '0 0 24px' }}>
                {pc.workshop.title}
              </h3>
            )}
            {pc.workshop.description && (
              <p style={{ fontSize: 16, color: 'rgba(240,242,255,0.72)', lineHeight: 2.3, margin: '0 0 24px', whiteSpace: 'pre-line' }}>
                {pc.workshop.description}
              </p>
            )}
            {pc.workshop.note && (
              <p style={{ fontSize: 13, color: '#9aaedd', letterSpacing: 1, margin: '0 0 36px' }}>{pc.workshop.note}</p>
            )}
            {!isArchived && event.ws_requires_reservation && (
              <Link
                to={`/reserve?event_id=${event.id}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '14px 36px', border: '1px solid #5572cc', color: '#f0f2ff', textDecoration: 'none', fontSize: 13, letterSpacing: '2px', textTransform: 'uppercase', borderRadius: 2 }}
              >
                ワークショップに申し込む →
              </Link>
            )}
          </div>
        </section>
      )}

      {/* ゲスト・出展者 */}
      {pc.guests && pc.guests.length > 0 && (
        <section style={{ background: '#f7f3ec', borderBottom: '1px solid #ddd4c0' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', padding: '72px 20px' }}>
            <h2 style={headStyle}>Guests</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 40 }}>
              {pc.guests.map((guest, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                  {guest.image_url ? (
                    <img src={guest.image_url} alt={guest.name} style={{ width: 100, height: 100, borderRadius: '50%', objectFit: 'cover', marginBottom: 16, border: '1px solid #ddd4c0' }} />
                  ) : (
                    <div style={{ width: 100, height: 100, borderRadius: '50%', background: '#e8e2d8', marginBottom: 16, border: '1px solid #ddd4c0' }} />
                  )}
                  <div style={{ fontSize: 17, fontWeight: 500, color: '#1c2417', marginBottom: 4 }}>{guest.name}</div>
                  {guest.role && <div style={{ fontSize: 11, letterSpacing: 2, color: '#8a9a7e', textTransform: 'uppercase', marginBottom: 10 }}>{guest.role}</div>}
                  {guest.bio && <p style={{ fontSize: 14, color: '#3a4535', lineHeight: 1.9, margin: '0 0 10px' }}>{guest.bio}</p>}
                  {guest.instagram_url && (
                    <a href={guest.instagram_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#8a9a7e', textDecoration: 'none', borderBottom: '1px solid #ddd4c0', paddingBottom: 1 }}>
                      Instagram →
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* アーカイブ感謝セクション */}
      {isArchived ? (
        <section style={{ background: '#f7f3ec', textAlign: 'center' }}>
          <div style={{ maxWidth: 760, margin: '0 auto', padding: '88px 20px' }}>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(26px, 4vw, 44px)', fontWeight: 300, letterSpacing: '0.08em', color: '#1c2417', margin: '0 0 24px' }}>
              {pc.archive?.title ?? 'ご来場ありがとうございました'}
            </h2>
            {pc.archive?.message && (
              <p style={{ fontSize: 15, color: '#3a4535', lineHeight: 2.2, whiteSpace: 'pre-line', margin: '0 0 48px' }}>{pc.archive.message}</p>
            )}
            {pc.archive?.gallery && pc.archive.gallery.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, textAlign: 'left' }}>
                {pc.archive.gallery.map((url, i) => (
                  <div key={i} style={{ aspectRatio: '1/1', overflow: 'hidden', borderRadius: 8 }}>
                    <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      ) : (
        /* 非アーカイブ：フッターバナー */
        <section style={{ background: '#1c2417', textAlign: 'center', padding: '80px 20px' }}>
          <div style={{ maxWidth: 600, margin: '0 auto' }}>
            <p style={{ fontSize: 11, letterSpacing: 4, color: 'rgba(200,185,155,0.5)', textTransform: 'uppercase', margin: '0 0 16px' }}>Visit Us</p>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(22px, 4vw, 40px)', fontWeight: 200, color: '#f7f3ec', letterSpacing: '0.08em', margin: '0 0 12px' }}>
              {event.name}
            </h2>
            <p style={{ fontSize: 14, color: 'rgba(200,185,155,0.65)', letterSpacing: 2, margin: '0 0 32px' }}>
              {dateLabel} / {event.location}
            </p>
            {event.has_workshop && event.ws_requires_reservation && (
              <Link
                to={`/reserve?event_id=${event.id}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '14px 36px', border: '1px solid rgba(200,185,155,0.35)', color: '#f7f3ec', textDecoration: 'none', fontSize: 13, letterSpacing: '2px', textTransform: 'uppercase', borderRadius: 2 }}
              >
                ワークショップ予約 →
              </Link>
            )}
          </div>
        </section>
      )}
    </>
  )
}
