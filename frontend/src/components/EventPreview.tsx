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
  horizontal?: boolean
}

export default function EventPreview({ event, horizontal = false }: Props) {
  const [imgIdx, setImgIdx] = useState(0)
  const pc: PageContent = event.page_content ?? {}
  const hasSite = hasPageContent(event.page_content)
  const images = event.images.filter((i) => i.url && !i.url.startsWith('blob:'))
  const dateLabel = formatDate(event.start_date, event.end_date)
  const address = pc.venue?.address || event.address
  const mapsUrl = address
    ? `https://www.google.com/maps/search/${encodeURIComponent(address)}`
    : null

  return (
    <div className={horizontal ? 'ep-horizontal' : ''} style={{
      background: '#ffffff',
      borderRadius: 4,
      overflow: 'hidden',
      boxShadow: '0 2px 16px rgba(40,35,20,0.08)',
      border: '1px solid #e8e8f0',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* 画像 */}
      {images.length > 0 && (
        <div style={{ position: 'relative', background: '#e8e8f0' }}>
          <img
            src={images[imgIdx].url}
            alt={event.name}
            style={{ width: '100%', height: 'auto', display: 'block' }}
          />
          {images.length > 1 && (
            <>
              <button
                onClick={() => setImgIdx((i) => (i - 1 + images.length) % images.length)}
                style={{ position: 'absolute', top: '50%', left: 6, transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.45)', color: '#fff', width: 26, height: 26, borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}
              >&#10094;</button>
              <button
                onClick={() => setImgIdx((i) => (i + 1) % images.length)}
                style={{ position: 'absolute', top: '50%', right: 6, transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.45)', color: '#fff', width: 26, height: 26, borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}
              >&#10095;</button>
              <div style={{ position: 'absolute', bottom: 6, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 4 }}>
                {images.map((_, i) => (
                  <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: i === imgIdx ? '#fff' : 'rgba(255,255,255,0.5)' }} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* 情報 */}
      <div style={{ padding: '16px 18px 20px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        {event.brands.length > 0 && (
          <div style={{ marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {event.brands.map((brand) => (
              <a
                key={brand}
                href={BRAND_IG[brand] ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 10, background: 'var(--c-ink)', color: '#fff', padding: '4px 10px', borderRadius: 20, letterSpacing: 0.8, textDecoration: 'none', fontWeight: 500 }}
              >
                {brand}
              </a>
            ))}
          </div>
        )}

        <h3 style={{ fontSize: 15, margin: '0 0 12px', fontWeight: 500, lineHeight: 1.4, color: 'var(--c-ink)' }}>
          {event.name}
        </h3>

        <div style={{ fontSize: 13, color: 'var(--c-body)', background: '#f5f5f8', padding: '12px 14px', borderRadius: 4, border: '1px solid #dddde8', lineHeight: 1.8 }}>
          <div>{dateLabel}</div>
          {event.time && <div>{event.time}</div>}
          <div style={{ fontWeight: 600 }}>{event.location}</div>
          {event.booth_number && (
            <div style={{ fontWeight: 600 }}>ブース: {event.booth_number}</div>
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
              ) : address}
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
          <div style={{ marginTop: 14 }}>
            {event.is_past ? (
              <p style={{ fontSize: 12, color: 'var(--c-muted)', margin: 0, lineHeight: 1.7 }}>
                ワークショップを開催しました。ご参加いただいた皆様ありがとうございました。
              </p>
            ) : event.ws_requires_reservation ? (
              <Link
                to={`/reserve?event_id=${event.id}`}
                style={{ display: 'inline-block', fontSize: 12, color: '#1e3272', textDecoration: 'none', padding: '7px 16px', borderRadius: 20, border: '1px solid #1e3272', letterSpacing: 0.5, fontWeight: 500 }}
              >
                Habitat Style Workshop を予約する
              </Link>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
