import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

const SECTIONS = ['concept', 'workshop', 'collaboration'] as const

export default function HabitatOides() {
  const [active, setActive] = useState('')
  const [volume, setVolume] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)
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

  const handleVolume = (val: number) => {
    setVolume(val)
    if (videoRef.current) {
      videoRef.current.volume = val / 100
      videoRef.current.muted = val === 0
    }
  }

  return (
    <>
      <h1 className="sr-only">Habitat Oides — ハビタットスタイルライン</h1>

      <div className="hero-wrapper">
        <nav className="brand-subnav">
          <div className="brand-subnav-inner">
            {SECTIONS.map((id) => (
              <a key={id} href={`#${id}`} className={active === id ? 'subnav-active' : ''} onClick={scrollTo(id)}>
                {id === 'concept' ? 'Concept' : id === 'workshop' ? 'Workshop' : 'Collaboration'}
              </a>
            ))}
          </div>
        </nav>

        <section className="ho-hero">
          <div style={{ position: 'absolute', bottom: 36, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, zIndex: 2 }}>
            <div className="scroll-hint-line" style={{ background: 'linear-gradient(to bottom, rgba(220,200,175,0.5), transparent)' }} />
            <span style={{ fontSize: 11, letterSpacing: 3, color: 'rgba(200,168,210,0.65)', textTransform: 'uppercase' }}>Scroll</span>
          </div>
        </section>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid #ddd4c0', margin: 0 }} />

      <section id="concept" className="brand-section" ref={(el) => { sectionRefs.current.concept = el }}>
        <div style={{ padding: '72px 20px', maxWidth: 1280, margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 13, letterSpacing: 4, textTransform: 'uppercase', color: '#8a9a7e', fontWeight: 400, margin: '0 0 48px', paddingBottom: 16, borderBottom: '1px solid #ddd4c0' }}>Concept</h2>
          <div className="brand-concept-grid">
            <img src="/img/logo-habitatoides.png" alt="Habitat Oides" style={{ width: '100%', maxWidth: 300, display: 'block', margin: '0 auto', borderRadius: '20%' }} />
            <div>
              <h2 style={{ fontSize: 'clamp(20px, 2.8vw, 30px)', fontWeight: 300, letterSpacing: '0.08em', color: '#1c2417', margin: '0 0 20px', lineHeight: 1.4 }}>
                Habitat Style<br />Materials &amp; Plants
              </h2>
              <p style={{ fontSize: 16, color: '#3a4535', lineHeight: 2.1, letterSpacing: '0.03em', margin: 0 }}>
                植物の自生地に宿る景色の美しさを、鉢の中に再現する。<br /><br />
                石・砂・土と植物が織りなすハビタットスタイルの作品を制作・展示・販売。希少資材から陶芸作家の一点ものまで、その世界観を構築するすべてをご提案します。
              </p>
            </div>
          </div>
        </div>
      </section>

      <hr style={{ border: 'none', borderTop: '1px solid #ddd4c0', margin: 0 }} />

      <section id="workshop" className="brand-section" ref={(el) => { sectionRefs.current.workshop = el }}>
        <div style={{ padding: '72px 20px', maxWidth: 1280, margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 13, letterSpacing: 4, textTransform: 'uppercase', color: '#8a9a7e', fontWeight: 400, margin: '0 0 48px', paddingBottom: 16, borderBottom: '1px solid #ddd4c0' }}>Workshop</h2>
          <div className="ho-workshop-feature">
            <div style={{ background: '#2e4898', minHeight: 320, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 32px', gap: 24 }}>
              <div style={{ width: 80, height: 80, border: '1px solid #5572cc', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, color: '#d8b8ca' }}>✦</div>
              <div style={{ fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 200, letterSpacing: '0.12em', color: '#f0f2ff', textTransform: 'uppercase', lineHeight: 1.3, textAlign: 'center' }}>
                Learn &amp;<br />Create
              </div>
            </div>
            <div style={{ padding: '48px 40px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 20 }}>
              <h3 style={{ fontSize: 16, letterSpacing: 2, textTransform: 'uppercase', color: '#d8b8ca', margin: 0 }}>Workshop</h3>
              <p style={{ fontSize: 16, color: '#f0f2ff', lineHeight: 2, margin: 0, opacity: 0.75 }}>
                ハビタットスタイルに向いた植物・資材を使い、<br />
                実際に手を動かして学べるワークショップ。<br />
                初心者からマニアまで楽しめる内容です。
              </p>
              <Link
                to="/habitatoides/workshop"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 16, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#f0f2ff', textDecoration: 'none', border: '1px solid #5572cc', padding: '14px 24px', borderRadius: 2, width: 'fit-content' }}
              >
                Workshop について →
              </Link>
            </div>
          </div>
        </div>
      </section>

      <hr style={{ border: 'none', borderTop: '1px solid #ddd4c0', margin: 0 }} />

      <section id="collaboration" className="brand-section" ref={(el) => { sectionRefs.current.collaboration = el }}
        style={{ background: '#1e3272', padding: '72px 0', textAlign: 'center' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 20px' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 13, letterSpacing: 4, textTransform: 'uppercase', color: '#9aaedd', fontWeight: 400, margin: '0 0 48px', paddingBottom: 16, borderBottom: '1px solid #3a58b8' }}>Collaboration</h2>
          <div style={{ margin: '40px auto 0', width: 'min(420px, 100%)' }}>
            <div style={{ position: 'relative', width: '100%', aspectRatio: '9/16', maxHeight: '68vh', overflow: 'hidden', borderRadius: 8, background: '#000' }}>
              <video
                ref={videoRef}
                src="/collab.mp4"
                autoPlay
                loop
                muted
                playsInline
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
            <div style={{ textAlign: 'center', marginTop: 20, padding: 10 }}>
              <span style={{ display: 'block', fontSize: 11, color: '#9aaedd', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>
                Volume: {volume}%
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={volume}
                onChange={(e) => handleVolume(Number(e.target.value))}
                style={{ width: 180, height: 2, cursor: 'pointer', accentColor: '#d8b8ca' }}
              />
            </div>
          </div>
          <div style={{ marginTop: 48 }}>
            <Link
              to="/collaborations"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 14, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#9aaedd', textDecoration: 'none', borderBottom: '1px solid #3a58b8', paddingBottom: 4 }}
            >
              View all collaborations →
            </Link>
          </div>
        </div>
      </section>

      <section style={{ background: '#1e3272', color: '#f0f2ff', textAlign: 'center', padding: '88px 20px', borderTop: '1px solid #2e4898' }}>
        <h2 style={{ fontSize: 'clamp(24px, 4vw, 48px)', fontWeight: 200, letterSpacing: '0.15em', textTransform: 'uppercase', margin: '0 0 14px' }}>Follow Us</h2>
        <p style={{ fontSize: 13, letterSpacing: 2, color: '#9aaedd', textTransform: 'uppercase', margin: '0 0 40px' }}>Instagram</p>
        <a
          href="https://www.instagram.com/habitatoides/"
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 16, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#f0f2ff', textDecoration: 'none', border: '1px solid #5572cc', padding: '16px 36px', borderRadius: 2 }}
        >
          @habitatoides →
        </a>
      </section>
    </>
  )
}
