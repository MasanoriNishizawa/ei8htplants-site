import { Link } from 'react-router-dom'
import PageMeta from '../../components/PageMeta'
import { useT } from '../../lib/lang'
import { useSectionSpy } from '../../hooks/useSectionSpy'
import { BRAND, TEXT_LOGO } from '../../lib/brands'

/** サブナビに並べるセクションの id（ページ内の section の id と同じ） */
const SECTIONS = ['concept', 'store'] as const

/**
 * ei8ht plants ブランドページ。スクロール位置に合わせてサブナビの選択中を変える（useSectionSpy）
 * @returns ブランドページの画面
 */
export default function Ei8htPlants() {
  const t = useT()
  // サブナビで選択中のセクション・セクションに付ける ref・サブナビのスクロール処理（共通フック）
  const { active, sectionRef, scrollTo } = useSectionSpy(SECTIONS)


  return (
    <>
      <PageMeta description={t('アガベ・塊根植物・灌木などビザールプランツを専門に扱うラインです。', 'A line specializing in bizarre plants — agaves, caudiciform plants, shrubs and more.')} />
      {/* 見た目には出さない、読み上げ・検索エンジン向けのページの見出し */}
      <h1 className="sr-only">{t('ei8ht plants — ビザールプランツ専門ライン', 'ei8ht plants — Bizarre Plants Line')}</h1>

      {/* ファーストビュー。上にサブナビを重ねる */}
      <div className="hero-wrapper">
        {/* ページ内のセクションへ移動するサブナビ（表示中のセクションに印を付ける） */}
        <nav className="brand-subnav">
          <div className="brand-subnav-inner">
            {SECTIONS.map((id) => (
              <a key={id} href={`#${id}`} className={active === id ? 'subnav-active' : ''} onClick={scrollTo(id)}>
                {id === 'concept' ? 'Concept' : 'Store'}
              </a>
            ))}
          </div>
        </nav>

        {/* 背景写真の上に文字ロゴを重ねたヒーロー（写真は飾りなので読み上げない） */}
        <section className="ep-hero">
          <img className="ep-hero-bg-img" src="/img/ei8htPlants/ei8htplants_hero.jpg" alt="" aria-hidden />
          <div className="ep-hero-content">
            <p style={{ fontSize: 'var(--brand-type-body)', letterSpacing: '0.18em', textTransform: 'uppercase', color: '#666', marginBottom: 24, position: 'relative', zIndex: 2 }}>
              Bizarre Plants
            </p>
            <div style={{ maxWidth: 380, width: '65%', margin: '0 auto', position: 'relative', zIndex: 2 }}>
              <img src={TEXT_LOGO} alt={BRAND.ei8htPlants.name} style={{ width: '100%', height: 'auto', objectFit: 'contain', display: 'block', opacity: 0.9 }} />
            </div>
          </div>
          {/* 下へのスクロールを促す線と文字 */}
          <div className="ep-scroll-hint" style={{ position: 'absolute', bottom: 36, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, zIndex: 2 }}>
            <div className="scroll-hint-line" style={{ background: 'linear-gradient(to bottom, #999, transparent)' }} />
            <span style={{ fontSize: 'var(--brand-type-caption)', letterSpacing: 3, color: '#999', textTransform: 'uppercase' }}>Scroll</span>
          </div>
        </section>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid #dddde8', margin: 0 }} />

      {/* コンセプト: ロゴ・見出し・紹介文 */}
      <section id="concept" className="brand-section" ref={sectionRef('concept')}>
        <div style={{ padding: '72px 20px', maxWidth: 1280, margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontSize: 'var(--brand-type-label)', letterSpacing: 4, textTransform: 'uppercase', color: 'var(--c-muted)', fontWeight: 400, margin: '0 0 48px', paddingBottom: 16, borderBottom: '1px solid #dddde8' }}>Concept</h2>
          <div className="brand-concept-grid">
            <img src={BRAND.ei8htPlants.logo} alt={BRAND.ei8htPlants.name} style={{ width: '100%', maxWidth: 300, display: 'block', margin: '0 auto' }} />
            <div>
              <h2 style={{ fontSize: 'clamp(24px, 2.8vw, 30px)', fontWeight: 300, letterSpacing: '0.08em', color: 'var(--c-ink)', margin: '0 0 20px', lineHeight: 1.4 }}>
                Bizarre<br />Plants
              </h2>
              <p style={{ fontSize: 16, color: 'var(--c-body)', lineHeight: 2.1, letterSpacing: '0.03em', margin: 0 }}>
                {t(
                  <>アガベ、塊根植物、灌木——<br />個性的なフォルムと深みある色彩を持つ植物を、<br />自ら生産し、一株一株に向き合って届けています。<br /><br />株選びから育て方まで、<br />幅広くサポートします。</>,
                  <>Agaves, caudiciform plants, shrubs —<br />plants with bold forms and rich character,<br />grown by us and delivered with care.<br /><br />From choosing the right plant to ongoing care,<br />we're here to support you every step of the way.</>
                )}
              </p>
            </div>
          </div>
        </div>
      </section>

      <hr style={{ border: 'none', borderTop: '1px solid #dddde8', margin: 0 }} />

      {/* オンラインストアへの案内（黒い帯） */}
      <section id="store" className="brand-section" ref={sectionRef('store')}
        style={{ background: '#0e0e0e', color: '#fff', textAlign: 'center', padding: '88px 20px' }}>
        <h2 style={{ fontSize: 'clamp(28px, 5vw, 56px)', fontWeight: 200, letterSpacing: '0.15em', textTransform: 'uppercase', margin: '0 0 14px' }}>Online Store</h2>
        <p style={{ fontSize: 'var(--brand-type-caption)', letterSpacing: 2, color: '#666', textTransform: 'uppercase', margin: '0 0 40px' }}>Select Plants &amp; Items</p>
        <Link
          to="/official/shop"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 16, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#fff', textDecoration: 'none', border: '1px solid #444', padding: '16px 36px', borderRadius: 2, transition: 'background 0.2s' }}
        >
          Shop now →
        </Link>
      </section>
    </>
  )
}
