import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api, type Event, type PageContent } from '../lib/api'
import PageMeta from '../components/PageMeta'

const BRAND_IG: Record<string, string> = {
  'ei8ht plants': 'https://www.instagram.com/ei8ht.plants/',
  'Habitat Oides': 'https://www.instagram.com/habitatoides/',
  'HUE by ei8ht plants': 'https://www.instagram.com/hue_by.ei8ht.plants/',
}

function formatDate(start: string, end: string | null): string {
  const s = new Date(start)
  const fmt = (d: Date) => `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
  if (!end || end === start) return fmt(s)
  const e = new Date(end)
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) {
    return `${fmt(s)}〜${e.getDate()}日`
  }
  return `${fmt(s)}〜${fmt(e)}`
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
  const dateLabel = formatDate(event.start_date, event.end_date)
  const validImages = event.images.filter((i) => i.url && !i.url.startsWith('blob:'))
  const ogImage = validImages[0]?.url

  return (
    <>
      <PageMeta title={event.name} description={`${dateLabel} / ${event.location}`} ogImage={ogImage} />

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 20px 80px', boxSizing: 'border-box' }}>
        <div className={validImages.length > 0 ? 'event-site-layout' : ''}>

          {/* Left: images */}
          {validImages.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {validImages.map((img, i) => (
                <img
                  key={i}
                  src={img.url}
                  alt={event.name}
                  style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 10, border: '1px solid #e8e8f0' }}
                />
              ))}
            </div>
          )}

          {/* Right: info */}
          <div>
            {/* ブランドバッジ */}
            {event.brands.length > 0 && (
              <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {event.brands.map((brand) => (
                  <a key={brand} href={BRAND_IG[brand] ?? '#'} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 12, background: '#1c2417', color: '#fff', padding: '6px 12px', borderRadius: 20, letterSpacing: 1, textDecoration: 'none', fontWeight: 500 }}>
                    {brand}
                  </a>
                ))}
              </div>
            )}

            {/* イベント名 */}
            {isArchived && (
              <div style={{ fontSize: 12, color: '#8a9a7e', letterSpacing: 2, marginBottom: 8 }}>Archived</div>
            )}
            <h1 style={{ fontSize: 26, margin: '0 0 20px', fontWeight: 500, lineHeight: 1.4, color: '#1c2417' }}>
              {event.name}
            </h1>

            {/* コンセプト */}
            {pc.concept && (
              <div style={{ marginBottom: 24, padding: '24px 20px', background: '#ffffff', borderRadius: 10, border: '1px solid #dddde8' }}>
                <div style={{ fontSize: 11, letterSpacing: 3, color: '#8a9a7e', textTransform: 'uppercase', marginBottom: 14 }}>Concept</div>
                <p style={{ fontSize: 15, lineHeight: 2.2, color: '#3a4535', margin: 0, whiteSpace: 'pre-line' }}>{pc.concept}</p>
              </div>
            )}

            {/* ワークショップ */}
            {event.has_workshop && (
              <div style={{ background: '#f2f2f7', border: '1px solid #c0c0d2', padding: '16px 20px', marginBottom: 24, borderRadius: 14 }}>
                <div style={{ fontSize: 11, letterSpacing: 3, color: '#8a9a7e', textTransform: 'uppercase', marginBottom: 10 }}>Workshop</div>
                {!isArchived && event.ws_requires_reservation && (
                  <a href={`/reserve?event_id=${event.id}`}
                    style={{ display: 'inline-block', background: '#2c3a4a', color: '#fff', textDecoration: 'none', padding: '9px 20px', borderRadius: 20, fontSize: 13, fontWeight: 500, letterSpacing: 1 }}>
                    ワークショップを予約する
                  </a>
                )}
              </div>
            )}

            {/* ラインナップ */}
            {pc.lineup && pc.lineup.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, letterSpacing: 3, color: '#8a9a7e', textTransform: 'uppercase', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid #dddde8' }}>Lineup</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                  {pc.lineup.map((item, i) => (
                    <div key={i} style={{ background: '#f5f5f8', borderRadius: 10, overflow: 'hidden', border: '1px solid #dddde8' }}>
                      {item.image_url && (
                        <img src={item.image_url} alt={item.title} style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }} />
                      )}
                      <div style={{ padding: '12px 14px' }}>
                        <div style={{ fontSize: 14, fontWeight: 500, color: '#1c2417', marginBottom: 4 }}>{item.title}</div>
                        {item.description && <div style={{ fontSize: 12, color: '#3a4535', lineHeight: 1.7 }}>{item.description}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ゲスト・出展者 */}
            {pc.guests && pc.guests.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, letterSpacing: 3, color: '#8a9a7e', textTransform: 'uppercase', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid #dddde8' }}>Guests</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 }}>
                  {pc.guests.map((guest, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', background: '#f5f5f8', borderRadius: 10, padding: '16px 12px', border: '1px solid #dddde8' }}>
                      {guest.image_url ? (
                        <img src={guest.image_url} alt={guest.name} style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', marginBottom: 10, border: '1px solid #dddde8' }} />
                      ) : (
                        <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#e4e4ee', marginBottom: 10, border: '1px solid #dddde8' }} />
                      )}
                      <div style={{ fontSize: 15, fontWeight: 500, color: '#1c2417', marginBottom: 2 }}>{guest.name}</div>
                      {guest.role && <div style={{ fontSize: 11, letterSpacing: 1, color: '#8a9a7e', marginBottom: 6 }}>{guest.role}</div>}
                      {guest.bio && <p style={{ fontSize: 12, color: '#3a4535', lineHeight: 1.8, margin: '0 0 8px' }}>{guest.bio}</p>}
                      {guest.instagram_url && (
                        <a href={guest.instagram_url} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 12, color: '#4a6741', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                          Instagram
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* アーカイブ */}
            {isArchived && (
              <div style={{ textAlign: 'center', background: '#f5f5f8', borderRadius: 10, padding: '40px 24px', border: '1px solid #dddde8' }}>
                <h2 style={{ fontSize: 22, fontWeight: 400, color: '#1c2417', margin: '0 0 16px' }}>
                  {pc.archive?.title ?? 'ご来場ありがとうございました'}
                </h2>
                {pc.archive?.message && (
                  <p style={{ fontSize: 15, color: '#3a4535', lineHeight: 2.1, whiteSpace: 'pre-line', margin: '0 0 24px' }}>{pc.archive.message}</p>
                )}
                {pc.archive?.gallery && pc.archive.gallery.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, textAlign: 'left' }}>
                    {pc.archive.gallery.map((url, i) => (
                      <div key={i} style={{ aspectRatio: '1/1', overflow: 'hidden', borderRadius: 8 }}>
                        <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    </>
  )
}
