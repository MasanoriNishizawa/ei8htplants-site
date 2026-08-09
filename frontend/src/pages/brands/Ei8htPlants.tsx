import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import PageMeta from '../../components/PageMeta'

const SECTIONS = ['concept', 'store'] as const

export default function Ei8htPlants() {
  const [active, setActive] = useState('')
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => { if (e.isIntersecting) setActive(e.target.id) })
      },
      { rootMargin: '-55% 0px -45% 0px' }
    )
    SECTIONS.forEach((id) => {
      const el = sectionRefs.current[id]
      if (el) obs.observe(el)
    })
    return () => obs.disconnect()
  }, [])

  const scrollTo = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <>
      <PageMeta title="ei8ht plants" description="アガベ・塊根植物・灌木などビザールプランツを専門に扱うラインです。" />
      <h1 className="sr-only">ei8ht plants — ビザールプランツ専門ライン</h1>

      <div className="hero-wrapper">
        <nav className="brand-subnav">
          <div className="brand-subnav-inner">
            {SECTIONS.map((id) => (
              <a key={id} href={`#${id}`} className={active === id ? 'subnav-active' : ''} onClick={scrollTo(id)}>
                {id === 'concept' ? 'Concept' : 'Store'}
              </a>
            ))}
          </div>
        </nav>

        <section className="ep-hero">
          <p style={{ fontSize: 14, letterSpacing: 4, textTransform: 'uppercase', color: '#666', marginBottom: 24, position: 'relative', zIndex: 2 }}>
            Bizarre Plants
          </p>
          <div style={{ maxWidth: 380, width: '65%', margin: '0 auto', position: 'relative', zIndex: 2 }}>
            <img src="/img/text-logo-ei8htplants.png" alt="ei8ht plants" style={{ width: '100%', height: 'auto', objectFit: 'contain', display: 'block', opacity: 0.9 }} />
          </div>
          <div style={{ position: 'absolute', bottom: 36, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, zIndex: 2 }}>
            <div className="scroll-hint-line" style={{ background: 'linear-gradient(to bottom, #999, transparent)' }} />
            <span style={{ fontSize: 11, letterSpacing: 3, color: '#999', textTransform: 'uppercase' }}>Scroll</span>
          </div>
        </section>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid #dddde8', margin: 0 }} />

      <section id="concept" className="brand-section" ref={(el) => { sectionRefs.current.concept = el }}>
        <div style={{ padding: '72px 20px', maxWidth: 1280, margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 13, letterSpacing: 4, textTransform: 'uppercase', color: 'var(--c-muted)', fontWeight: 400, margin: '0 0 48px', paddingBottom: 16, borderBottom: '1px solid #dddde8' }}>Concept</h2>
          <div className="brand-concept-grid">
            <img src="/img/logo-ei8htplants.png" alt="ei8ht plants" style={{ width: '100%', maxWidth: 300, display: 'block', margin: '0 auto' }} />
            <div>
              <h2 style={{ fontSize: 'clamp(20px, 2.8vw, 30px)', fontWeight: 300, letterSpacing: '0.08em', color: 'var(--c-ink)', margin: '0 0 20px', lineHeight: 1.4 }}>
                Bizarre<br />Plants
              </h2>
              <p style={{ fontSize: 16, color: 'var(--c-body)', lineHeight: 2.1, letterSpacing: '0.03em', margin: 0 }}>
                アガベ・塊根植物・灌木など、個性的なフォルムと深みある色彩を持つビザールプランツを専門に扱います。その一株一株の表情に向き合いながら、初めての方からコレクターの方まで、育てる楽しさをともに見つけていきます。<br /><br />
                育て方の相談から株選びまで、気軽に声をかけてください。
              </p>
            </div>
          </div>
        </div>
      </section>

      <hr style={{ border: 'none', borderTop: '1px solid #dddde8', margin: 0 }} />

      <section id="store" className="brand-section" ref={(el) => { sectionRefs.current.store = el }}
        style={{ background: '#0e0e0e', color: '#fff', textAlign: 'center', padding: '88px 20px' }}>
        <h2 style={{ fontSize: 'clamp(28px, 5vw, 56px)', fontWeight: 200, letterSpacing: '0.15em', textTransform: 'uppercase', margin: '0 0 14px' }}>Online Store</h2>
        <p style={{ fontSize: 13, letterSpacing: 2, color: '#666', textTransform: 'uppercase', margin: '0 0 40px' }}>Select Plants &amp; Items</p>
        <Link
          to="/shop"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 16, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#fff', textDecoration: 'none', border: '1px solid #444', padding: '16px 36px', borderRadius: 2, transition: 'background 0.2s' }}
        >
          Shop now →
        </Link>
      </section>
    </>
  )
}
