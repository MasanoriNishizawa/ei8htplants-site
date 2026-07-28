import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import PageMeta from '../../components/PageMeta'

const SECTIONS = ['about', 'contents', 'flow'] as const

const FEATURES = [
  { bg: '#3a58b8', title: '植物の選び方', text: 'ハビタットスタイルに向いた植物の種類や特性、組み合わせ方について解説します。' },
  { bg: '#9a6888', title: 'レイアウトの技術', text: '岩・流木などの資材を使ったハビタットスタイルのレイアウトを実際に体験します。' },
  { bg: '#4a72b8', title: '管理・メンテナンス', text: '制作後の水やり・換気・光管理など、長く楽しむためのポイントを伝授します。' },
]

const FLOW = [
  { num: '01', title: '植物・素材の説明', text: '使用する植物や素材について、生態・特性・取り扱い方を丁寧に解説します。' },
  { num: '02', title: '制作タイム', text: '一人ひとりオリジナルのレイアウトを制作します。スタッフがサポートします。' },
  { num: '03', title: '管理方法のレクチャー & お持ち帰り', text: '完成後、アフターケアについてご説明します。制作物はそのままお持ち帰りいただけます。' },
]

export default function HabitatOidesWorkshop() {
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
      <PageMeta title="Habitat Style Workshop" description="ハビタットスタイルのワークショップ。植物の生息環境を意識したレイアウトを自分の手で制作できます。" ogImage="https://ei8htplants.com/img/habitatOides/habitat_oides_workshop_main.jpg" />
      <nav className="brand-subnav" style={{ top: 60 }}>
        <div className="brand-subnav-inner">
          <Link to="/habitatoides" style={{ borderRight: '1px solid #dddde8', fontSize: 16, letterSpacing: 1, textTransform: 'uppercase', color: '#8a9a7e', textDecoration: 'none', padding: '15px 24px 15px 18px', display: 'block', whiteSpace: 'nowrap' }}>
            ← Habitat Oides
          </Link>
          {SECTIONS.map((id) => (
            <a key={id} href={`#${id}`} className={active === id ? 'subnav-active' : ''} onClick={scrollTo(id)}>
              {id === 'about' ? 'About' : id === 'contents' ? 'Contents' : 'Flow'}
            </a>
          ))}
        </div>
      </nav>

      <section className="wspage-hero">
        <Link to="/habitatoides" style={{ position: 'absolute', top: 28, left: 28, fontSize: 16, letterSpacing: 1, textTransform: 'uppercase', color: '#9aaedd', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8, zIndex: 1 }}>
          ← Habitat Oides
        </Link>
        <p style={{ fontSize: 13, letterSpacing: 4, textTransform: 'uppercase', color: '#d8b8ca', marginBottom: 24, position: 'relative' }}>Habitat Oides</p>
        <h1 style={{ fontSize: 'clamp(40px, 8vw, 96px)', fontWeight: 200, letterSpacing: '0.15em', color: '#f0f2ff', lineHeight: 1, textTransform: 'uppercase', margin: 0, position: 'relative' }}>
          WORKSHOP
        </h1>
        <p style={{ fontSize: 'clamp(12px, 2vw, 16px)', fontWeight: 300, letterSpacing: '0.4em', color: '#9aaedd', marginTop: 14, textTransform: 'uppercase', position: 'relative' }}>
          Habitat Style
        </p>
      </section>

      <hr style={{ border: 'none', borderTop: '1px solid #dddde8', margin: 0 }} />

      <section id="about" className="brand-section" ref={(el) => { sectionRefs.current.about = el }}>
        <div style={{ padding: '72px 20px', maxWidth: 1280, margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 13, letterSpacing: 4, textTransform: 'uppercase', color: '#8a9a7e', fontWeight: 400, margin: '0 0 48px', paddingBottom: 16, borderBottom: '1px solid #dddde8' }}>About Workshop</h2>
          <div className="wspage-about-grid">
            <div style={{ aspectRatio: '1/1', borderRadius: 4, overflow: 'hidden', background: '#e8e0d4' }}>
              <img
                src="/img/habitatOides/habitat_oides_workshop_main.jpg"
                alt="Habitat Style Workshop"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            </div>
            <div>
              <h2 style={{ fontSize: 'clamp(20px, 2.8vw, 30px)', fontWeight: 300, letterSpacing: '0.08em', color: '#1c2417', margin: '0 0 20px', lineHeight: 1.4 }}>
                ハビタットスタイルを<br />自分の手で作る
              </h2>
              <p style={{ fontSize: 16, color: '#3a4535', lineHeight: 2.0, margin: '0 0 16px' }}>
                ハビタットスタイルに向いた植物と資材を使い、植物の生息環境を意識したレイアウトを実際に制作するワークショップです。
              </p>
              <p style={{ fontSize: 16, color: '#3a4535', lineHeight: 2.0, margin: '0 0 16px' }}>
                Habitat Oides が扱う植物・資材・用土を実際に使いながら、自分だけのスタイルを形にできます。
              </p>
              <p style={{ fontSize: 16, color: '#3a4535', lineHeight: 2.0, margin: 0 }}>
                完成品をお持ち帰りいただけるので、初めての方もお気軽にご参加ください。
              </p>
            </div>
          </div>
        </div>
      </section>

      <hr style={{ border: 'none', borderTop: '1px solid #dddde8', margin: 0 }} />

      <section id="contents" className="brand-section" ref={(el) => { sectionRefs.current.contents = el }}>
        <div style={{ padding: '72px 20px', maxWidth: 1280, margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 13, letterSpacing: 4, textTransform: 'uppercase', color: '#8a9a7e', fontWeight: 400, margin: '0 0 48px', paddingBottom: 16, borderBottom: '1px solid #dddde8' }}>Contents</h2>
          <div className="wspage-features">
            {FEATURES.map(({ bg, title, text }) => (
              <div key={title} style={{ background: bg, borderRadius: 4, padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                <h3 style={{ fontSize: 16, fontWeight: 500, letterSpacing: '0.05em', color: '#fff', margin: 0 }}>{title}</h3>
                <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.85)', lineHeight: 1.9, margin: 0 }}>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <hr style={{ border: 'none', borderTop: '1px solid #dddde8', margin: 0 }} />

      <section id="flow" className="brand-section" ref={(el) => { sectionRefs.current.flow = el }}>
        <div style={{ padding: '72px 20px', maxWidth: 1280, margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 13, letterSpacing: 4, textTransform: 'uppercase', color: '#8a9a7e', fontWeight: 400, margin: '0 0 48px', paddingBottom: 16, borderBottom: '1px solid #dddde8' }}>Flow</h2>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {FLOW.map(({ num, title, text }) => (
              <div key={num} style={{ display: 'grid', gridTemplateColumns: '60px 1fr', gap: 24, padding: '28px 0', borderBottom: '1px solid #dddde8', alignItems: 'start' }}>
                <div style={{ fontSize: 32, fontWeight: 200, color: '#ddd', lineHeight: 1, letterSpacing: '-0.02em', paddingTop: 2 }}>{num}</div>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 500, letterSpacing: '0.04em', color: '#1c2417', margin: '0 0 8px' }}>{title}</h3>
                  <p style={{ fontSize: 16, color: '#3a4535', lineHeight: 1.9, margin: 0 }}>{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ background: '#1e3272', color: '#f0f2ff', textAlign: 'center', padding: '88px 20px' }}>
        <h2 style={{ fontSize: 'clamp(22px, 4vw, 44px)', fontWeight: 200, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 14px' }}>Reservation</h2>
        <p style={{ fontSize: 13, letterSpacing: 2, color: '#9aaedd', textTransform: 'uppercase', margin: '0 0 40px', lineHeight: 1.8 }}>
          ワークショップへのご参加は<br />各イベントページよりお申し込みいただけます。
        </p>
        <Link
          to="/events"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 16, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#f0f2ff', textDecoration: 'none', border: '1px solid #5572cc', padding: '16px 36px', borderRadius: 2 }}
        >
          View all events →
        </Link>
      </section>
    </>
  )
}
