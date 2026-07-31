import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import EventPreview from '../components/EventPreview'
import { api, type Event, type GalleryImage, type Product, type Article } from '../lib/api'
import { parseBlocks } from '../components/BlockEditor'
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

const fmt = (n: number) => `¥${n.toLocaleString('ja-JP')}`
const SERIF = "'Cormorant Garamond', serif"
const SANS = "'Noto Sans JP', sans-serif"

function firstText(description: string | null): string {
  if (!description) return ''
  const blocks = parseBlocks(description)
  const b = blocks.find((b) => b.type === 'text')
  const text = b ? (b as any).value as string : ''
  return text.length > 80 ? text.slice(0, 80) + '…' : text
}

function articleExcerpt(content: string | null): string {
  if (!content) return ''
  const blocks = parseBlocks(content)
  const text = blocks.filter((b) => b.type === 'text').map((b) => (b as any).value as string).join(' ')
  const src = text || content.replace(/^## .+$/gm, '').replace(/\n+/g, ' ').trim()
  return src.length > 80 ? src.slice(0, 80) + '…' : src
}

const sectionHeadStyle: React.CSSProperties = {
  fontFamily: SERIF, fontSize: 26, fontWeight: 300, fontStyle: 'italic',
  letterSpacing: 2, margin: '60px 0 24px 0', borderBottom: '1px solid #dddde8', paddingBottom: 12,
}

const viewAllStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 18, background: '#ffffff', border: '1px solid #ddd',
  borderRadius: 4, color: '#1c2417', textDecoration: 'none',
  fontSize: 16, letterSpacing: 2, fontWeight: 'bold',
}

export default function Home() {
  const [nextEvent, setNextEvent] = useState<Event | null>(null)
  const [gallery, setGallery] = useState<GalleryImage[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [articles, setArticles] = useState<Article[]>([])
  const [slideIdx, setSlideIdx] = useState(0)

  useEffect(() => {
    api.events.list(false).then((events) => {
      const sorted = [...events].sort(
        (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
      )
      setNextEvent(sorted[0] ?? null)
    }).catch(() => {})
    api.gallery.list().then(setGallery).catch(() => {})
    api.products.list().then((p) => setProducts(p.slice(0, 3))).catch(() => {})
    api.articles.list().then((a) => setArticles(a.slice(0, 2))).catch(() => {})
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
      <div style={{ textAlign: 'center', padding: '60px 20px', background: '#ffffff', borderBottom: '1px solid #dddde8', marginBottom: 40 }}>
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
                borderRadius: 4, pointerEvents: 'none',
              }}
            />
          ))}
        </div>
        <div style={{ fontSize: 12, color: '#8a9a7e', letterSpacing: 3, textTransform: 'uppercase' }}>
          Agave &nbsp;/&nbsp; Habitat Style &nbsp;/&nbsp; Color Plants
        </div>
      </div>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 20px' }}>

        {/* NEXT EVENT */}
        {nextEvent && (
          <>
            <h2 style={sectionHeadStyle}>NEXT EVENT</h2>
            <EventPreview event={nextEvent} horizontal />
            <div style={{ margin: '24px 0 40px' }}>
              <Link to="/events" style={viewAllStyle}>VIEW ALL EVENTS</Link>
            </div>
          </>
        )}

        {/* SHOP */}
        {products.length > 0 && (
          <>
            <h2 style={sectionHeadStyle}>SHOP</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginBottom: 24 }}>
              {products.map((p) => (
                <Link key={p.id} to={`/shop/${p.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                  <div style={{ position: 'relative', aspectRatio: '1/1', background: '#f0ede8', overflow: 'hidden', marginBottom: 10 }}>
                    {p.image_urls[0] ? (
                      <img
                        src={p.image_urls[0]}
                        alt={p.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.5s ease' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLImageElement).style.transform = 'scale(1.04)' }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLImageElement).style.transform = 'scale(1)' }}
                      />
                    ) : (
                      <div style={{ width: '100%', height: '100%', background: '#e8e3da' }} />
                    )}
                    {p.stock === 0 && (
                      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontFamily: SANS, fontSize: 11, letterSpacing: '3px', color: '#fff', border: '1px solid rgba(255,255,255,0.7)', padding: '6px 16px' }}>SOLD OUT</span>
                      </div>
                    )}
                  </div>
                  <p style={{ fontFamily: SANS, fontSize: 13, color: '#1c1c1c', margin: '0 0 4px', lineHeight: 1.5 }}>{p.name}</p>
                  {firstText(p.description) && (
                    <p style={{ fontFamily: SANS, fontSize: 12, color: '#aaa', margin: '0 0 4px', lineHeight: 1.6 }}>{firstText(p.description)}</p>
                  )}
                  <p style={{ fontFamily: SANS, fontSize: 13, color: '#3a3a3a', margin: 0 }}>{fmt(p.price)}</p>
                </Link>
              ))}
            </div>
            <div style={{ marginBottom: 40 }}>
              <Link to="/shop" style={viewAllStyle}>VIEW ALL SHOP</Link>
            </div>
          </>
        )}

        {/* JOURNAL */}
        {articles.length > 0 && (
          <>
            <h2 style={sectionHeadStyle}>JOURNAL</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginBottom: 24 }}>
              {articles.map((a) => (
                <Link key={a.id} to={`/journal/${a.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'grid', gridTemplateColumns: '120px 1fr', gap: 20, alignItems: 'center' }}>
                  <div style={{ aspectRatio: '1/1', background: '#f0ede8', overflow: 'hidden' }}>
                    {a.image_urls[0] ? (
                      <img src={a.image_urls[0]} alt={a.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', background: '#e8e3da' }} />
                    )}
                  </div>
                  <div>
                    <p style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 16, fontWeight: 400, color: '#1c1c1c', margin: '0 0 6px', lineHeight: 1.6 }}>{a.title}</p>
                    {articleExcerpt(a.content) && (
                      <p style={{ fontFamily: SANS, fontSize: 13, color: '#8a9a7e', margin: '0 0 6px', lineHeight: 1.7 }}>{articleExcerpt(a.content)}</p>
                    )}
                    {a.published_at && (
                      <p style={{ fontFamily: SANS, fontSize: 12, color: '#bbb', margin: 0 }}>
                        {new Date(a.published_at).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
            <div style={{ marginBottom: 40 }}>
              <Link to="/journal" style={viewAllStyle}>VIEW ALL JOURNAL</Link>
            </div>
          </>
        )}
      </div>

      {/* Gallery marquee */}
      {gallery.length > 0 && (
        <>
          <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 20px' }}>
            <h2 style={sectionHeadStyle}>GALLERY</h2>
          </div>
          <div style={{ width: '100%', overflow: 'hidden', marginBottom: 60, padding: '20px 0', WebkitMaskImage: 'linear-gradient(to right, transparent, black 15%, black 85%, transparent)', maskImage: 'linear-gradient(to right, transparent, black 15%, black 85%, transparent)' }}>
            <div style={{ display: 'flex', width: 'fit-content', animation: 'marquee 80s linear infinite' }}>
              {marqueeImages.map((img, i) => (
                <div key={i} style={{ width: 250, height: 250, marginRight: 15, borderRadius: 4, overflow: 'hidden', flexShrink: 0 }}>
                  <img src={img.url} alt={img.alt ?? ''} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </div>
              ))}
            </div>
          </div>
          <style>{`@keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(calc(-50% - 7.5px)); } }`}</style>
          <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 20px', marginBottom: 40 }}>
            <div style={{ maxWidth: 400, margin: '-20px auto 0' }}>
              <Link to="/gallery" style={viewAllStyle}>VIEW ALL GALLERY</Link>
            </div>
          </div>
        </>
      )}

      {/* Instagram */}
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 20px' }}>
        <div style={{ textAlign: 'center', marginTop: 60, paddingTop: 60, borderTop: '1px solid #dddde8' }}>
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
