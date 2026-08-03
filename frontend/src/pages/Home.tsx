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
const SERIF = "'Cormorant Garamond', 'Noto Serif JP', serif"
const SANS = "'Noto Sans JP', sans-serif"

function articleExcerpt(content: string | null, max = 90): string {
  if (!content) return ''
  const blocks = parseBlocks(content)
  const text = blocks.filter((b) => b.type === 'text').map((b) => (b as any).value as string).join(' ')
  const src = text || content.replace(/^## .+$/gm, '').replace(/\n+/g, ' ').trim()
  return src.length > max ? src.slice(0, max) + '…' : src
}

function fmtDate(s: string | null): string {
  if (!s) return ''
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const divider: React.CSSProperties = {
  border: 'none', borderTop: '1px solid var(--c-border)', margin: 0,
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
    api.products.list().then((p) => setProducts(p.slice(0, 4))).catch(() => {})
    api.articles.list().then((a) => setArticles(a.slice(0, 3))).catch(() => {})
  }, [])

  useEffect(() => {
    const id = setInterval(() => setSlideIdx((i) => (i + 1) % SLIDES.length), 4000)
    return () => clearInterval(id)
  }, [])

  const marqueeImages = [...gallery, ...gallery]

  return (
    <>
      <PageMeta />

      {/* ─── HERO ─── */}
      <section style={{ background: 'var(--c-surface)', borderBottom: '1px solid var(--c-border)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: 'clamp(48px, 8vw, 96px) clamp(20px, 4vw, 48px)', display: 'grid', alignItems: 'center', gap: 'clamp(32px, 5vw, 80px)' }} className="home-hero-grid">
          {/* ロゴスライドショー */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ position: 'relative', width: 'clamp(180px, 30vw, 320px)', aspectRatio: '1/1' }}>
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
                    transition: 'opacity 1.2s ease',
                    pointerEvents: 'none',
                  }}
                />
              ))}
            </div>
          </div>

          {/* テキスト */}
          <div>
            <p style={{ fontFamily: SANS, fontSize: 10, letterSpacing: '4px', color: 'var(--c-faint)', margin: '0 0 clamp(12px, 2vw, 20px)', textTransform: 'uppercase' }}>
              Bizarre Plants &nbsp;·&nbsp; Habitat Style &nbsp;·&nbsp; Color Plants
            </p>
            <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(32px, 5.5vw, 64px)', fontWeight: 300, color: 'var(--c-ink)', margin: '0 0 clamp(16px, 2.5vw, 28px)', lineHeight: 1.2, letterSpacing: '0.04em', fontStyle: 'italic' }}>
              Plants that make<br />you look twice.
            </h2>
            <p style={{ fontFamily: SANS, fontSize: 'clamp(13px, 1.4vw, 15px)', color: 'var(--c-muted)', lineHeight: 2.2, margin: '0 0 clamp(24px, 3vw, 40px)', maxWidth: 420 }}>
              アガベ・塊根植物・灌木などビザールプランツと、ハビタットスタイルの資材。植物との暮らしを、もっと深く。
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Link to="/shop" style={{ display: 'inline-block', padding: 'clamp(11px, 1.5vw, 14px) clamp(24px, 3vw, 36px)', background: 'var(--c-ink)', color: '#fffdf9', textDecoration: 'none', fontFamily: SANS, fontSize: 12, letterSpacing: '2px', textTransform: 'uppercase' }}>
                Shop
              </Link>
              <Link to="/concept" style={{ display: 'inline-block', padding: 'clamp(11px, 1.5vw, 14px) clamp(24px, 3vw, 36px)', border: '1px solid var(--c-border)', color: 'var(--c-body)', textDecoration: 'none', fontFamily: SANS, fontSize: 12, letterSpacing: '2px', textTransform: 'uppercase' }}>
                About
              </Link>
            </div>
          </div>
        </div>
      </section>

      <hr style={divider} />

      {/* ─── NEXT EVENT ─── */}
      {nextEvent && (
        <>
          <section style={{ maxWidth: 1200, margin: '0 auto', padding: 'clamp(40px, 6vw, 72px) clamp(20px, 4vw, 48px)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 28, gap: 16 }}>
              <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: 300, fontStyle: 'italic', letterSpacing: '0.06em', margin: 0, color: 'var(--c-ink)' }}>
                Next Event
              </h2>
              <Link to="/events" style={{ fontFamily: SANS, fontSize: 11, color: 'var(--c-muted)', textDecoration: 'none', letterSpacing: '2px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                All Events →
              </Link>
            </div>
            <EventPreview event={nextEvent} horizontal />
          </section>
          <hr style={divider} />
        </>
      )}

      {/* ─── SHOP ─── */}
      {products.length > 0 && (
        <>
          <section style={{ maxWidth: 1200, margin: '0 auto', padding: 'clamp(40px, 6vw, 72px) clamp(20px, 4vw, 48px)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 28, gap: 16 }}>
              <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: 300, fontStyle: 'italic', letterSpacing: '0.06em', margin: 0, color: 'var(--c-ink)' }}>
                Shop
              </h2>
              <Link to="/shop" style={{ fontFamily: SANS, fontSize: 11, color: 'var(--c-muted)', textDecoration: 'none', letterSpacing: '2px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                View All →
              </Link>
            </div>
            <div className="home-shop-grid">
              {products.map((p) => (
                <Link key={p.id} to={`/shop/${p.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                  <div
                    onMouseEnter={(e) => { const img = e.currentTarget.querySelector('img') as HTMLImageElement | null; if (img) img.style.transform = 'scale(1.05)' }}
                    onMouseLeave={(e) => { const img = e.currentTarget.querySelector('img') as HTMLImageElement | null; if (img) img.style.transform = 'scale(1)' }}
                  >
                    <div style={{ position: 'relative', aspectRatio: '1/1', background: '#e8e3da', overflow: 'hidden', marginBottom: 12 }}>
                      {p.image_urls[0] ? (
                        <img src={p.image_urls[0]} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.6s ease' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', background: '#e0dbd2' }} />
                      )}
                      {p.stock === 0 && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,26,24,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontFamily: SANS, fontSize: 10, letterSpacing: '4px', color: '#fffdf9', border: '1px solid rgba(255,253,249,0.65)', padding: '6px 16px' }}>SOLD OUT</span>
                        </div>
                      )}
                    </div>
                    <p style={{ fontFamily: SERIF, fontSize: 'clamp(14px, 1.4vw, 16px)', color: 'var(--c-ink)', margin: '0 0 5px', lineHeight: 1.4 }}>{p.name}</p>
                    <p style={{ fontFamily: SANS, fontSize: 13, color: 'var(--c-muted)', margin: 0 }}>{fmt(p.price)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
          <hr style={divider} />
        </>
      )}

      {/* ─── JOURNAL ─── */}
      {articles.length > 0 && (
        <>
          <section style={{ maxWidth: 1200, margin: '0 auto', padding: 'clamp(40px, 6vw, 72px) clamp(20px, 4vw, 48px)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 28, gap: 16 }}>
              <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: 300, fontStyle: 'italic', letterSpacing: '0.06em', margin: 0, color: 'var(--c-ink)' }}>
                Journal
              </h2>
              <Link to="/journal" style={{ fontFamily: SANS, fontSize: 11, color: 'var(--c-muted)', textDecoration: 'none', letterSpacing: '2px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                All Articles →
              </Link>
            </div>
            <div className="home-journal-grid">
              {articles.map((a, idx) => (
                <Link key={a.id} to={`/journal/${a.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block', gridColumn: idx === 0 ? 'span 2' : undefined }} className={idx === 0 ? 'home-journal-featured' : ''}>
                  <div style={{ display: idx === 0 ? undefined : 'flex', flexDirection: idx === 0 ? undefined : 'column', height: '100%' }}>
                    <div style={{ overflow: 'hidden', background: '#e8e3da', aspectRatio: idx === 0 ? '16/7' : '4/3', marginBottom: 16, position: 'relative' }}>
                      {a.image_urls[0] ? (
                        <img src={a.image_urls[0]} alt={a.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.6s ease' }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLImageElement).style.transform = 'scale(1.03)' }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLImageElement).style.transform = 'scale(1)' }}
                        />
                      ) : (
                        <div style={{ width: '100%', height: '100%', background: '#e0dbd2' }} />
                      )}
                    </div>
                    {a.published_at && (
                      <p style={{ fontFamily: SANS, fontSize: 10, color: 'var(--c-faint)', margin: '0 0 8px', letterSpacing: '1.5px' }}>{fmtDate(a.published_at)}</p>
                    )}
                    <p style={{ fontFamily: SERIF, fontSize: idx === 0 ? 'clamp(18px, 2vw, 24px)' : 'clamp(15px, 1.5vw, 18px)', color: 'var(--c-ink)', margin: '0 0 10px', lineHeight: 1.5, letterSpacing: '0.02em' }}>
                      {a.title}
                    </p>
                    {idx === 0 && articleExcerpt(a.content) && (
                      <p style={{ fontFamily: SANS, fontSize: 13, color: 'var(--c-muted)', margin: '0 0 14px', lineHeight: 2 }}>
                        {articleExcerpt(a.content)}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
          <hr style={divider} />
        </>
      )}

      {/* ─── GALLERY マーキー ─── */}
      {gallery.length > 0 && (
        <>
          <section style={{ padding: 'clamp(32px, 5vw, 56px) 0' }}>
            <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 clamp(20px, 4vw, 48px)', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 24 }}>
              <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: 300, fontStyle: 'italic', letterSpacing: '0.06em', margin: 0, color: 'var(--c-ink)' }}>
                Gallery
              </h2>
              <Link to="/gallery" style={{ fontFamily: SANS, fontSize: 11, color: 'var(--c-muted)', textDecoration: 'none', letterSpacing: '2px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                View All →
              </Link>
            </div>
            <div style={{ overflow: 'hidden', WebkitMaskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)', maskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)' }}>
              <div style={{ display: 'flex', width: 'fit-content', animation: 'marquee 80s linear infinite', gap: 12 }}>
                {marqueeImages.map((img, i) => (
                  <div key={i} style={{ width: 'clamp(160px, 18vw, 260px)', aspectRatio: '1/1', overflow: 'hidden', flexShrink: 0 }}>
                    <img src={img.url} alt={img.alt ?? ''} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </div>
                ))}
              </div>
            </div>
          </section>
          <hr style={divider} />
          <style>{`@keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(calc(-50% - 6px)); } }`}</style>
        </>
      )}

      {/* ─── INSTAGRAM ─── */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: 'clamp(48px, 7vw, 80px) clamp(20px, 4vw, 48px)', textAlign: 'center' }}>
        <p style={{ fontFamily: SANS, fontSize: 10, letterSpacing: '4px', color: 'var(--c-faint)', margin: '0 0 8px', textTransform: 'uppercase' }}>Follow us</p>
        <p style={{ fontFamily: SERIF, fontSize: 'clamp(20px, 2.5vw, 28px)', fontWeight: 300, fontStyle: 'italic', color: 'var(--c-ink)', margin: '0 0 clamp(28px, 4vw, 44px)', letterSpacing: '0.06em' }}>Instagram</p>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 'clamp(24px, 5vw, 60px)', flexWrap: 'wrap' }}>
          {IG_LINKS.map(({ href, src, cls }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: 'clamp(90px, 12vw, 140px)', height: 'clamp(90px, 12vw, 140px)', overflow: 'hidden' }}
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
      </section>
    </>
  )
}
