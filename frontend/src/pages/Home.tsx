import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import EventCard from '../components/EventCard'
import { api, type Event, type GalleryImage } from '../lib/api'
import PageMeta from '../components/PageMeta'

const SLIDES = [
  { src: '/img/logo-ei8htplants.png', alt: 'ei8ht plants', scale: 1.4 },
  { src: '/img/logo-habitatoides.png', alt: 'Habitat Oides', scale: 1.0 },
  { src: '/img/logo-hue.png', alt: 'HUE by ei8ht plants', scale: 1.15 },
]

const IG_LINKS = [
  { href: 'https://www.instagram.com/habitatoides/', src: '/img/logo-habitatoides.png', cls: 'habitat' },
  { href: 'https://www.instagram.com/ei8ht.plants/', src: '/img/logo-ei8htplants.png', cls: 'ei8ht' },
  { href: 'https://www.instagram.com/hue_by.ei8ht.plants/', src: '/img/logo-hue.png', cls: 'hue' },
]

export default function Home() {
  const [nextEvent, setNextEvent] = useState<Event | null>(null)
  const [gallery, setGallery] = useState<GalleryImage[]>([])
  const [slideIdx, setSlideIdx] = useState(0)

  useEffect(() => {
    api.events.list(false).then((events) => {
      const sorted = [...events].sort(
        (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
      )
      setNextEvent(sorted[0] ?? null)
    }).catch(() => {})
    api.gallery.list().then(setGallery).catch(() => {})
  }, [])

  useEffect(() => {
    const id = setInterval(() => setSlideIdx((i) => (i + 1) % SLIDES.length), 4000)
    return () => clearInterval(id)
  }, [])

  const marqueeImages = [...gallery, ...gallery]

  return (
    <>
      <PageMeta />
      {/* Hero */}
      <div style={{ textAlign: 'center', padding: '60px 20px', background: '#fffcf6', borderBottom: '1px solid #ddd4c0', marginBottom: 40 }}>
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', maxWidth: 400, width: '85%', margin: '0 auto 20px auto', aspectRatio: '1/1' }}>
          {SLIDES.map(({ src, alt, scale }, i) => (
            <img
              key={src}
              src={src}
              alt={alt}
              style={{
                position: 'absolute', top: '50%', left: '50%',
                transform: `translate(-50%, -50%) scale(${scale})`,
                width: '100%', height: '100%', objectFit: 'contain',
                opacity: slideIdx === i ? 1 : 0,
                transition: 'opacity 1s ease',
                filter: 'drop-shadow(0 0 15px #fff) drop-shadow(0 0 10px #fff)',
                borderRadius: 12, pointerEvents: 'none',
              }}
            />
          ))}
        </div>
        <div style={{ fontSize: 12, color: '#8a9a7e', letterSpacing: 3, textTransform: 'uppercase' }}>
          Agave &nbsp;/&nbsp; Habitat Style &nbsp;/&nbsp; Color Plants
        </div>
      </div>

      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 20px' }}>
        {nextEvent && (
          <>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 300, fontStyle: 'italic', letterSpacing: 2, margin: '60px 0 24px 0', borderBottom: '1px solid #ddd4c0', paddingBottom: 12 }}>
              NEXT EVENT
            </h2>
            <EventCard event={nextEvent} isNext isHome />
            <div style={{ maxWidth: 400, margin: '0 auto 40px auto' }}>
              <Link
                to="/events"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18, background: '#fffcf6', border: '1px solid #ddd', borderRadius: 14, color: '#1c2417', textDecoration: 'none', fontSize: 16, letterSpacing: 2, fontWeight: 'bold' }}
              >
                VIEW ALL EVENTS
              </Link>
            </div>
          </>
        )}
      </div>

      {/* Gallery marquee */}
      {gallery.length > 0 && (
        <>
          <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 20px' }}>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 300, fontStyle: 'italic', letterSpacing: 2, margin: '60px 0 24px 0', borderBottom: '1px solid #ddd4c0', paddingBottom: 12 }}>
              GALLERY
            </h2>
          </div>
          <div style={{ width: '100%', overflow: 'hidden', marginBottom: 60, padding: '20px 0', WebkitMaskImage: 'linear-gradient(to right, transparent, black 15%, black 85%, transparent)', maskImage: 'linear-gradient(to right, transparent, black 15%, black 85%, transparent)' }}>
            <div style={{ display: 'flex', width: 'fit-content', animation: 'marquee 80s linear infinite' }}>
              {marqueeImages.map((img, i) => (
                <div key={i} style={{ width: 250, height: 250, marginRight: 15, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
                  <img src={img.url} alt={img.alt ?? ''} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </div>
              ))}
            </div>
          </div>
          <style>{`@keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(calc(-50% - 7.5px)); } }`}</style>
          <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 20px', marginBottom: 40 }}>
            <div style={{ maxWidth: 400, margin: '-20px auto 0' }}>
              <Link
                to="/gallery"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18, background: '#fffcf6', border: '1px solid #ddd', borderRadius: 14, color: '#1c2417', textDecoration: 'none', fontSize: 16, letterSpacing: 2, fontWeight: 'bold' }}
              >
                VIEW ALL GALLERY
              </Link>
            </div>
          </div>
        </>
      )}

      {/* Instagram */}
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 20px' }}>
        <div style={{ textAlign: 'center', marginTop: 60, paddingTop: 60, borderTop: '1px solid #ddd4c0' }}>
          <div style={{ fontSize: 20, color: '#8a9a7e', letterSpacing: 4, marginBottom: 30, textTransform: 'uppercase' }}>Instagram</div>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 40, maxWidth: 600, margin: '0 auto' }}>
            {IG_LINKS.map(({ href, src, cls }) => (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: 150, height: 150, background: 'transparent', overflow: 'hidden' }}
              >
                <img
                  src={src}
                  alt={cls}
                  style={{
                    width: cls === 'ei8ht' ? '140%' : cls === 'hue' ? '115%' : '100%',
                    height: cls === 'habitat' ? '100%' : 'auto',
                    objectFit: cls === 'habitat' ? 'cover' : undefined,
                    borderRadius: cls === 'habitat' ? '20%' : undefined,
                  }}
                />
              </a>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
