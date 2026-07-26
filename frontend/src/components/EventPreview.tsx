import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Event, PageContent } from '../lib/api'

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

function ImageCarousel({ images }: { images: { url: string }[] }) {
  const [idx, setIdx] = useState(0)
  if (images.length === 0) return null
  return (
    <div style={{ position: 'relative', background: '#ede7dc' }}>
      <img
        src={images[idx].url}
        alt=""
        style={{ width: '100%', maxHeight: 520, objectFit: 'cover', display: 'block' }}
      />
      {images.length > 1 && (
        <>
          <button
            onClick={() => setIdx((i) => (i - 1 + images.length) % images.length)}
            style={{ position: 'absolute', top: '50%', left: 10, transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.5)', color: '#fff', width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}
          >&#10094;</button>
          <button
            onClick={() => setIdx((i) => (i + 1) % images.length)}
            style={{ position: 'absolute', top: '50%', right: 10, transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.5)', color: '#fff', width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}
          >&#10095;</button>
        </>
      )}
    </div>
  )
}

function hasPageContent(pc: PageContent | null): boolean {
  if (!pc) return false
  return !!(
    (pc.hero?.image_url && pc.hero.image_url.length > 0 && !pc.hero.image_url.startsWith('blob:')) ||
    (pc.hero?.tagline && pc.hero.tagline.length > 0) ||
    (pc.hero?.subtitle && pc.hero.subtitle.length > 0) ||
    (pc.venue?.address && pc.venue.address.length > 0) ||
    (pc.venue?.access && pc.venue.access.length > 0) ||
    (pc.concept && pc.concept.length > 0) ||
    (pc.lineup && pc.lineup.length > 0) ||
    (pc.guests && pc.guests.length > 0) ||
    (pc.archive?.enabled === true)
  )
}

interface Props {
  event: Event
}

export default function EventPreview({ event }: Props) {
  const pc: PageContent = event.page_content ?? {}
  const hasSite = hasPageContent(event.page_content)
  const images = event.images.filter((i) => i.url && !i.url.startsWith('blob:'))
  const dateLabel = formatDate(event.start_date, event.end_date)
  const address = pc.venue?.address ?? event.address
  const mapsUrl = address
    ? `https://www.google.com/maps/search/${encodeURIComponent(address)}`
    : null

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', paddingBottom: 60 }}>
      <div style={{ borderRadius: 14, overflow: 'hidden', marginBottom: 28, boxShadow: '0 2px 24px rgba(40,35,20,0.08)' }}>
        <ImageCarousel images={images} />
      </div>

      {event.brands.length > 0 && (
        <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {event.brands.map((brand) => (
            <a
              key={brand}
              href={BRAND_IG[brand] ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 12, background: '#1c2417', color: '#fff', padding: '6px 12px', borderRadius: 20, letterSpacing: 1, textDecoration: 'none', fontWeight: 500 }}
            >
              {brand}
            </a>
          ))}
        </div>
      )}

      <h2 style={{ fontSize: 26, margin: '0 0 20px', fontWeight: 500, lineHeight: 1.4, color: '#1c2417' }}>
        {event.name}
      </h2>

      <div style={{ fontSize: 15, color: '#3a4535', background: '#f2ede4', padding: '18px 20px', borderRadius: 10, border: '1px solid #ddd4c0', marginBottom: 20, lineHeight: 1.9 }}>
        <div>{dateLabel}</div>
        {event.daily_times && Object.keys(event.daily_times).length > 0 ? (
          <div>
            {Object.entries(event.daily_times)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([date, time]) => {
                const d = new Date(date + 'T00:00:00')
                const dow = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()]
                return (
                  <div key={date}>
                    {d.getMonth() + 1}月{d.getDate()}日（{dow}）　{time}
                  </div>
                )
              })}
          </div>
        ) : (
          event.time && <div>{event.time}</div>
        )}
        <div style={{ fontWeight: 'bold' }}>{event.location}</div>
        {event.booth_number && (
          <div style={{ fontWeight: 'bold' }}>ブース: {event.booth_number}</div>
        )}
        {address && (
          <div>
            {mapsUrl ? (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#4a6741', textDecoration: 'underline', textUnderlineOffset: 3 }}
              >
                {address}
              </a>
            ) : (
              address
            )}
          </div>
        )}
        {event.official_url ? (
          <div style={{ marginTop: 4 }}>
            <a
              href={event.official_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#4a6741', textDecoration: 'underline', textUnderlineOffset: 3 }}
            >
              公式サイト
            </a>
          </div>
        ) : hasSite ? (
          <div style={{ marginTop: 4 }}>
            <Link
              to={`/events/${event.id}`}
              style={{ color: '#4a6741', textDecoration: 'underline', textUnderlineOffset: 3 }}
            >
              公式サイト
            </Link>
          </div>
        ) : null}
      </div>

      {event.has_workshop && (
        <div style={{ background: '#f2ede2', border: '1px solid #c8b49a', padding: 20, marginTop: 20, borderRadius: 14 }}>
          <span style={{ display: 'block', fontWeight: 500, color: '#5c3d22', fontSize: 16, marginBottom: 5 }}>
            {(pc.workshop?.title) ?? 'Habitat Style Workshop'}
          </span>
          <span style={{ fontSize: 15, color: '#7a5a3a', lineHeight: 1.6, display: 'block' }}>
            {(pc.workshop?.description) ?? '現地の風景を切り取ったような一鉢を作る、ハビタットスタイルのワークショップを開催します。'}
          </span>
          {pc.workshop?.note && (
            <span style={{ fontSize: 13, color: '#9a7a5a', display: 'block', marginTop: 8 }}>{pc.workshop.note}</span>
          )}
          {!event.is_past && event.ws_requires_reservation && (
            <a
              href={`/reserve?event_id=${event.id}`}
              style={{ display: 'inline-block', marginTop: 12, background: '#5c3d22', color: '#fff', textDecoration: 'none', padding: '9px 20px', borderRadius: 20, fontSize: 13, fontWeight: 500, letterSpacing: 1 }}
            >
              ワークショップを予約する
            </a>
          )}
        </div>
      )}
    </div>
  )
}
