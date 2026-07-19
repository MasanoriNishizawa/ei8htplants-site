import { useEffect, useRef, useState } from 'react'

const SWATCHES = ['#d4a878','#a8c4a0','#e8b4b0','#c4d4c8','#e0c890','#b8a8d4','#f0d4b8']
const SECTIONS = ['concept'] as const

export default function Hue() {
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
      <h1 className="sr-only">HUE by ei8ht plants — オーナメントプランツライン</h1>

      <div className="hero-wrapper">
        <nav className="brand-subnav">
          <div className="brand-subnav-inner">
            <a href="#concept" className={active === 'concept' ? 'subnav-active' : ''} onClick={scrollTo('concept')}>Concept</a>
          </div>
        </nav>

        <section className="hue-hero">
          <div className="hue-blob hue-blob-1" />
          <div className="hue-blob hue-blob-2" />
          <div className="hue-blob hue-blob-3" />
          <div className="hue-blob hue-blob-4" />
          <div className="hue-blob hue-blob-5" />
          <p style={{ fontSize: 14, letterSpacing: 4, textTransform: 'uppercase', color: '#a07840', marginBottom: 32, position: 'relative', zIndex: 2 }}>
            Color Plants Selection
          </p>
          <div style={{ position: 'relative', maxWidth: 400, width: '85%', aspectRatio: '1/1', margin: '0 auto 20px', zIndex: 2 }}>
            <img
              src="/img/logo-hue.png"
              alt="HUE by ei8ht plants"
              style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%) scale(1.15)', width: '100%', height: '100%', objectFit: 'contain', opacity: 0.9 }}
            />
          </div>
          <div style={{ position: 'absolute', bottom: 36, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, zIndex: 2 }}>
            <div className="scroll-hint-line" style={{ background: 'linear-gradient(to bottom, #c4a882, transparent)' }} />
            <span style={{ fontSize: 11, letterSpacing: 3, color: '#c4a882', textTransform: 'uppercase' }}>Scroll</span>
          </div>
        </section>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid #ddd4c0', margin: 0 }} />

      <section id="concept" className="brand-section" ref={(el) => { sectionRefs.current.concept = el }}>
        <div style={{ padding: '72px 20px', maxWidth: 1280, margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 13, letterSpacing: 4, textTransform: 'uppercase', color: '#8a9a7e', fontWeight: 400, margin: '0 0 48px', paddingBottom: 16, borderBottom: '1px solid #ddd4c0' }}>Concept</h2>
          <div className="brand-concept-grid">
            <img src="/img/logo-hue.png" alt="HUE by ei8ht plants" style={{ width: '100%', maxWidth: 300, display: 'block', margin: '0 auto' }} />
            <div>
              <h2 style={{ fontSize: 'clamp(20px, 2.8vw, 30px)', fontWeight: 300, letterSpacing: '0.08em', color: '#1c2417', margin: '0 0 20px', lineHeight: 1.4 }}>
                Color &amp; Form<br />as Living Art
              </h2>
              <p style={{ fontSize: 16, color: '#3a4535', lineHeight: 2.1, letterSpacing: '0.03em', margin: 0 }}>
                色と形が語る、植物の美学。<br />
                鮮やかな色彩と独特のフォルムを持つ観葉植物から、インテリアに溶け込む一鉢を厳選してご提案します。<br /><br />
                植物を「育てる」だけでなく、「飾る」という視点で—空間に彩りと生命感を。
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', padding: '40px 0' }}>
            {SWATCHES.map((color) => (
              <div key={color} style={{ width: 60, height: 60, borderRadius: '50%', background: color, border: '1px solid rgba(0,0,0,0.08)', flexShrink: 0 }} />
            ))}
          </div>
        </div>
      </section>

      <section style={{ background: '#2a1a08', color: '#f8f4ee', textAlign: 'center', padding: '88px 20px' }}>
        <h2 style={{ fontSize: 'clamp(24px, 4vw, 48px)', fontWeight: 200, letterSpacing: '0.15em', textTransform: 'uppercase', margin: '0 0 14px' }}>Follow Us</h2>
        <p style={{ fontSize: 13, letterSpacing: 2, color: '#9a7a5a', textTransform: 'uppercase', margin: '0 0 40px' }}>Instagram</p>
        <a
          href="https://www.instagram.com/hue_by.ei8ht.plants/"
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 16, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#f8f4ee', textDecoration: 'none', border: '1px solid #5a3a18', padding: '16px 36px', borderRadius: 2 }}
        >
          @hue_by.ei8ht.plants →
        </a>
      </section>
    </>
  )
}
