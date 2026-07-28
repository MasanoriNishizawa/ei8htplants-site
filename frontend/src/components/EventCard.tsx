import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Event } from '../lib/api'

const BRAND_IG: Record<string, string> = {
  'ei8ht plants': 'https://www.instagram.com/ei8ht.plants/',
  'Habitat Oides': 'https://www.instagram.com/habitatoides/',
  'HUE by ei8ht plants': 'https://www.instagram.com/hue_by.ei8ht.plants/',
}

function daysUntil(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}

function formatDate(start: string, end: string | null): string {
  const s = new Date(start)
  const fmt = (d: Date) =>
    `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
  if (!end || end === start) return fmt(s)
  const e = new Date(end)
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) {
    return `${fmt(s)}〜${e.getDate()}日`
  }
  return `${fmt(s)}〜${fmt(e)}`
}

interface Props {
  event: Event
  isNext?: boolean
  isHome?: boolean
}

export default function EventCard({ event, isNext = false, isHome = false }: Props) {
  const [imgIdx, setImgIdx] = useState(0)
  const images = (event.images ?? []).filter((i) => i.url && !i.url.startsWith('blob:'))
  const days = !event.is_past ? daysUntil(event.start_date) : null
  const urgentBadge = days !== null && days >= 0 && days <= 7

  const cardStyle: React.CSSProperties = {
    background: '#ffffff',
    marginBottom: isNext ? 0 : 60,
    overflow: 'hidden',
    boxShadow: '0 2px 24px rgba(40,35,20,0.08), 0 1px 4px rgba(40,35,20,0.04)',
    display: 'flex',
    flexDirection: isNext ? undefined : 'column',
    borderRadius: 4,
  }

  const imageSection = images.length > 0 && (
    <div className={isNext ? 'next-image-wrap' : ''} style={{ position: 'relative', width: '100%', background: '#e8e8f0' }}>
      {urgentBadge && (
        <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 10, background: days === 0 ? '#c0392b' : '#e67e22', color: '#fff', fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20, letterSpacing: 0.5 }}>
          {days === 0 ? '本日開催' : `あと${days}日`}
        </div>
      )}
      <img
        src={images[imgIdx].url}
        alt={event.name}
        style={{ width: '100%', height: isNext ? '100%' : 280, objectFit: 'cover', display: 'block' }}
      />
      {images.length > 1 && (
        <>
          <button
            onClick={(e) => { e.preventDefault(); setImgIdx((i) => (i - 1 + images.length) % images.length) }}
            style={{ position: 'absolute', top: '50%', left: 10, transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.5)', color: '#fff', width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 'bold', zIndex: 10 }}
          >&#10094;</button>
          <button
            onClick={(e) => { e.preventDefault(); setImgIdx((i) => (i + 1) % images.length) }}
            style={{ position: 'absolute', top: '50%', right: 10, transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.5)', color: '#fff', width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 'bold', zIndex: 10 }}
          >&#10095;</button>
        </>
      )}
    </div>
  )

  const infoSection = (
    <div className={isNext ? 'next-content' : ''} style={{ padding: isNext ? 40 : 25 }}>
      {event.brands.length > 0 && (
        <div style={{ marginBottom: 20, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {event.brands.map((brand) => (
            <a
              key={brand}
              href={BRAND_IG[brand] ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ fontSize: 12, background: '#1c2417', color: '#fff', padding: '6px 12px', borderRadius: 20, letterSpacing: 1, textDecoration: 'none', fontWeight: 500 }}
            >
              {brand}
            </a>
          ))}
        </div>
      )}

      <h2 style={{ fontSize: 24, margin: '0 0 20px 0', fontWeight: 500, lineHeight: 1.4 }}>
        {event.name}
      </h2>

      <div style={{ fontSize: 16, color: '#3a4535', background: '#f5f5f8', padding: '15px 18px', borderRadius: 4, border: '1px solid #dddde8' }}>
        <div style={{ marginBottom: 8 }}>{formatDate(event.start_date, event.end_date)}</div>
        {event.time && <div style={{ marginBottom: 8 }}>{event.time}</div>}
        <div style={{ fontWeight: 'bold', marginBottom: event.booth_number || event.address ? 8 : 0 }}>{event.location}</div>
        {event.booth_number && <div style={{ fontWeight: 'bold', marginBottom: 8 }}>ブース: {event.booth_number}</div>}
        {event.address && (
          <div>
            <a
              href={`https://www.google.com/maps/search/${encodeURIComponent(event.address)}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ color: '#4a6741', textDecoration: 'underline', textUnderlineOffset: 3 }}
            >
              {event.address}
            </a>
          </div>
        )}
        {event.official_url && (
          <div style={{ marginTop: 8 }}>
            <a
              href={event.official_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ color: '#4a6741', textDecoration: 'underline', textUnderlineOffset: 3 }}
            >
              公式サイト
            </a>
          </div>
        )}
      </div>

      {event.has_workshop && (
        <div style={{ background: '#f2f2f7', border: '1px solid #c0c0d2', padding: 20, marginTop: 20, borderRadius: 4 }}>
          <span style={{ display: 'block', fontWeight: 500, color: '#2c3a4a', fontSize: 16, marginBottom: 5 }}>
            Habitat Style Workshop
          </span>
          <span style={{ fontSize: 15, color: '#4a5568', lineHeight: 1.6, display: 'block' }}>
            現地の風景を切り取ったような一鉢を作る、ハビタットスタイルのワークショップを開催します。
          </span>
          {!event.is_past && event.ws_requires_reservation && (
            <a
              href={`/reserve?event_id=${event.id}`}
              onClick={(e) => e.stopPropagation()}
              style={{ display: 'inline-block', marginTop: 12, background: '#2c3a4a', color: '#fff', textDecoration: 'none', padding: '9px 20px', borderRadius: 20, fontSize: 13, fontWeight: 500, letterSpacing: 1 }}
            >
              ワークショップを予約する
            </a>
          )}
        </div>
      )}
    </div>
  )

  const hasSite = event.page_content !== null
  const cardLink = hasSite
    ? { internal: `/events/${event.id}` }
    : event.official_url
    ? { external: event.official_url }
    : null

  if (isHome) {
    return (
      <div className="event-card" style={cardStyle}>
        <a href="/events" style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
          {imageSection}
        </a>
        {infoSection}
      </div>
    )
  }

  const card = (
    <div className={`event-card${isNext ? ' next-card' : ''}`} style={{ ...cardStyle, cursor: cardLink ? 'pointer' : 'default' }}>
      {imageSection}
      {infoSection}
    </div>
  )

  if (cardLink && 'internal' in cardLink && cardLink.internal) {
    return (
      <Link to={cardLink.internal} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
        {card}
      </Link>
    )
  }
  if (cardLink && 'external' in cardLink) {
    return (
      <a href={cardLink.external} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
        {card}
      </a>
    )
  }
  return card
}
