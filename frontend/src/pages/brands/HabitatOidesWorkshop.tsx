import { Link } from 'react-router-dom'
import PageMeta from '../../components/PageMeta'
import { useT } from '../../lib/lang'
import { useSectionSpy } from '../../hooks/useSectionSpy'
import { formatYen } from '../../lib/format'
import { WS_FEE_YEN } from '../../lib/constants'
import { siteForHost } from '../../lib/siteHost'

/** サブナビに並べるセクションの id（ページ内の section の id と同じ） */
const SECTIONS = ['about', 'contents', 'flow', 'fee'] as const

/**
 * Habitat Style Workshop 詳細ページ。内容・フロー・参加費のセクション別サブナビを提供する
 * @returns ワークショップ詳細の画面
 */
export default function HabitatOidesWorkshop() {
  const t = useT()
  // サブナビで選択中のセクション・セクションに付ける ref・サブナビのスクロール処理（共通フック）
  const { active, sectionRef, scrollTo } = useSectionSpy(SECTIONS)

  // 「Contents」に並べる 3 枚のカード（bg: カードの背景色、title: 見出し、text: 説明。言語で切り替わるので中で作る）
  const FEATURES = [
    { bg: '#3a58b8', title: t('植物の選び方', 'Choosing Plants'), text: t('ハビタットスタイルに向いた植物の種類や特性、組み合わせ方について解説します。', 'Learn about the types, characteristics, and combinations of plants suited for the habitat style.') },
    { bg: '#9a6888', title: t('レイアウトの技術', 'Layout Techniques'), text: t('岩・流木などの資材を使ったハビタットスタイルのレイアウトを実際に体験します。', 'Experience creating habitat-style layouts using materials like rocks and driftwood.') },
    { bg: '#4a72b8', title: t('管理・メンテナンス', 'Care & Maintenance'), text: t('制作後の水やり・換気・光管理など、長く楽しむためのポイントを伝授します。', 'Learn the key points for long-term enjoyment: watering, ventilation, and light management after creation.') },
  ]

  // 「Flow」に並べる当日の流れ（num: 番号、title: 見出し、text: 説明）
  const FLOW = [
    { num: '01', title: t('植物・素材の説明', 'Plants & Materials Overview'), text: t('使用する植物や素材について、生態・特性・取り扱い方を丁寧に解説します。', 'We carefully explain the ecology, characteristics, and handling of the plants and materials used.') },
    { num: '02', title: t('制作タイム', 'Creation Time'), text: t('一人ひとりオリジナルのレイアウトを制作します。スタッフがサポートします。', 'Each participant creates their own original layout, with staff support throughout.') },
    { num: '03', title: t('管理方法のレクチャー & お持ち帰り', 'Care Lecture & Take-Home'), text: t('完成後、アフターケアについてご説明します。制作物はそのままお持ち帰りいただけます。', 'After completion, we explain aftercare. You take your creation home with you.') },
  ]


  return (
    <>
      <PageMeta title={t('ワークショップ', 'Habitat Style Workshop')} description={t('植物と石や砂を組み合わせ、自生地の景色を自分の手で仕立てるワークショップです。', 'A hands-on workshop to compose a habitat-inspired landscape with plants, stone, and sand.')} ogImage="/img/habitatOides/habitat_oides_workshop_main.jpg" />
      {/* ページ内のセクションへ移動するサブナビ。左端は Habitat Oides のページへ戻るリンク */}
      <nav className="brand-subnav">
        <div className="brand-subnav-inner">
          <Link to={siteForHost(window.location.hostname).key === 'habitat-oides' ? '/' : '/habitatoides'} style={{ borderRight: '1px solid #dddde8', fontSize: 'var(--brand-type-body)', letterSpacing: 1, textTransform: 'uppercase', color: 'var(--c-muted)', textDecoration: 'none', padding: '15px 24px 15px 18px', display: 'block', whiteSpace: 'nowrap' }}>
            ← Habitat Oides
          </Link>
          {SECTIONS.map((id) => (
            <a key={id} href={`#${id}`} className={active === id ? 'subnav-active' : ''} onClick={scrollTo(id)}>
              {id === 'about' ? t('概要', 'About') : id === 'contents' ? t('内容', 'Contents') : id === 'flow' ? t('当日の流れ', 'Flow') : t('参加費', 'Fee')}
            </a>
          ))}
        </div>
      </nav>

      {/* ファーストビュー（左上に Habitat Oides へ戻るリンク） */}
      <section className="wspage-hero">
        <Link to={siteForHost(window.location.hostname).key === 'habitat-oides' ? '/' : '/habitatoides'} style={{ position: 'absolute', top: 28, left: 28, fontSize: 'var(--brand-type-body)', letterSpacing: 1, textTransform: 'uppercase', color: '#9aaedd', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8, zIndex: 1 }}>
          ← Habitat Oides
        </Link>
        <p style={{ fontSize: 'var(--brand-type-label)', letterSpacing: 4, textTransform: 'uppercase', color: '#d8b8ca', marginBottom: 24, position: 'relative' }}>Habitat Oides</p>
        <h1 style={{ fontSize: 'var(--brand-type-display)', fontWeight: 200, letterSpacing: '0.15em', color: '#f0f2ff', lineHeight: 1, textTransform: 'uppercase', margin: 0, position: 'relative' }}>
          {t('ワークショップ', 'WORKSHOP')}
        </h1>
        <p style={{ fontSize: 'var(--brand-type-body-small)', fontWeight: 300, letterSpacing: '0.4em', color: '#9aaedd', marginTop: 14, textTransform: 'uppercase', position: 'relative' }}>
          {t('植物の景色を仕立てる', 'Habitat Style')}
        </p>
      </section>

      <hr style={{ border: 'none', borderTop: '1px solid #dddde8', margin: 0 }} />

      {/* About: 写真とワークショップの紹介 */}
      <section id="about" className="brand-section" ref={sectionRef('about')}>
        <div style={{ padding: '72px 20px', maxWidth: 1280, margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontSize: 'var(--brand-type-label)', letterSpacing: 4, textTransform: 'uppercase', color: 'var(--c-muted)', fontWeight: 400, margin: '0 0 48px', paddingBottom: 16, borderBottom: '1px solid #dddde8' }}>{t('ワークショップについて', 'About Workshop')}</h2>
          <div className="wspage-about-grid">
            <div style={{ aspectRatio: '1/1', borderRadius: 4, overflow: 'hidden', background: '#e8e0d4' }}>
              <img
                src="/img/habitatOides/habitat_oides_workshop_main.jpg"
                alt={t('ハビタットスタイルのワークショップ', 'Habitat Style Workshop')}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            </div>
            <div>
              <h2 style={{ fontSize: 'var(--brand-type-subheading)', fontWeight: 300, letterSpacing: '0.08em', color: 'var(--c-ink)', margin: '0 0 20px', lineHeight: 1.4 }}>
                {t(<>ハビタットスタイルを<br />自分の手で作る</>, <>Create Your Own<br />Habitat Style</>)}
              </h2>
              <p style={{ fontSize: 'var(--brand-type-body)', color: 'var(--c-body)', lineHeight: 2.0, margin: '0 0 16px' }}>
                {t('ハビタットスタイルに向いた植物と資材を使い、植物の生息環境を意識したレイアウトを実際に制作するワークショップです。', 'A hands-on workshop where you create a layout inspired by the natural habitat of plants, using plants and materials suited for the habitat style.')}
              </p>
              <p style={{ fontSize: 'var(--brand-type-body)', color: 'var(--c-body)', lineHeight: 2.0, margin: '0 0 16px' }}>
                {t('Habitat Oides が扱う植物・資材・用土を実際に使いながら、自分だけのスタイルを形にできます。', 'Using the actual plants, materials, and soil handled by Habitat Oides, you can give shape to your own unique style.')}
              </p>
              <p style={{ fontSize: 'var(--brand-type-body)', color: 'var(--c-body)', lineHeight: 2.0, margin: 0 }}>
                {t('完成品をお持ち帰りいただけるので、初めての方もお気軽にご参加ください。', 'You take your finished piece home, so first-timers are very welcome to join.')}
              </p>
            </div>
          </div>
        </div>
      </section>

      <hr style={{ border: 'none', borderTop: '1px solid #dddde8', margin: 0 }} />

      {/* Contents: 学べる内容のカード */}
      <section id="contents" className="brand-section" ref={sectionRef('contents')}>
        <div style={{ padding: '72px 20px', maxWidth: 1280, margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontSize: 'var(--brand-type-label)', letterSpacing: 4, textTransform: 'uppercase', color: 'var(--c-muted)', fontWeight: 400, margin: '0 0 48px', paddingBottom: 16, borderBottom: '1px solid #dddde8' }}>{t('体験できること', 'Contents')}</h2>
          <div className="wspage-features">
            {FEATURES.map(({ bg, title, text }) => (
              <div key={title} style={{ background: bg, borderRadius: 4, padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                <h3 style={{ fontSize: 'var(--brand-type-body)', fontWeight: 500, letterSpacing: '0.05em', color: '#fff', margin: 0 }}>{title}</h3>
                <p style={{ fontSize: 'var(--brand-type-body)', color: 'rgba(255,255,255,0.85)', lineHeight: 1.9, margin: 0 }}>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <hr style={{ border: 'none', borderTop: '1px solid #dddde8', margin: 0 }} />

      {/* Flow: 当日の流れ */}
      <section id="flow" className="brand-section" ref={sectionRef('flow')}>
        <div style={{ padding: '72px 20px', maxWidth: 1280, margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontSize: 'var(--brand-type-label)', letterSpacing: 4, textTransform: 'uppercase', color: 'var(--c-muted)', fontWeight: 400, margin: '0 0 48px', paddingBottom: 16, borderBottom: '1px solid #dddde8' }}>{t('当日の流れ', 'Flow')}</h2>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {FLOW.map(({ num, title, text }) => (
              <div key={num} style={{ display: 'grid', gridTemplateColumns: '60px 1fr', gap: 24, padding: '28px 0', borderBottom: '1px solid #dddde8', alignItems: 'start' }}>
                <div style={{ fontSize: 'var(--brand-type-heading)', fontWeight: 200, color: '#ddd', lineHeight: 1, letterSpacing: '-0.02em', paddingTop: 2 }}>{num}</div>
                <div>
                  <h3 style={{ fontSize: 'var(--brand-type-body)', fontWeight: 500, letterSpacing: '0.04em', color: 'var(--c-ink)', margin: '0 0 8px' }}>{title}</h3>
                  <p style={{ fontSize: 'var(--brand-type-body)', color: 'var(--c-body)', lineHeight: 1.9, margin: 0 }}>{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <hr style={{ border: 'none', borderTop: '1px solid #dddde8', margin: 0 }} />

      {/* Fee & Info: 参加費・持ち込み・お子様連れの案内 */}
      <section id="fee" className="brand-section" ref={sectionRef('fee')}>
        <div style={{ padding: '72px 20px', maxWidth: 1280, margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontSize: 'var(--brand-type-label)', letterSpacing: 4, textTransform: 'uppercase', color: 'var(--c-muted)', fontWeight: 400, margin: '0 0 48px', paddingBottom: 16, borderBottom: '1px solid #dddde8' }}>{t('参加費とご案内', 'Fee & Info')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24 }}>
            <div style={{ padding: '28px 24px', border: '1px solid #dddde8', borderRadius: 4 }}>
              <p style={{ fontSize: 'var(--brand-type-label)', letterSpacing: 2, textTransform: 'uppercase', color: 'var(--c-muted)', margin: '0 0 12px' }}>{t('参加費', 'Fee')}</p>
              <p style={{ fontSize: 'var(--brand-type-subheading)', fontWeight: 300, color: 'var(--c-ink)', margin: '0 0 6px', letterSpacing: '0.04em' }}>{t(formatYen(WS_FEE_YEN, 'suffix'), formatYen(WS_FEE_YEN))}</p>
              <p style={{ fontSize: 'var(--brand-type-label)', color: 'var(--c-muted)', margin: 0, lineHeight: 1.7 }}>{t(<>鉢・資材含む<br />植物は別途</>, <>Pot & materials included<br />Plants priced separately</>)}</p>
            </div>
            <div style={{ padding: '28px 24px', border: '1px solid #dddde8', borderRadius: 4 }}>
              <p style={{ fontSize: 'var(--brand-type-label)', letterSpacing: 2, textTransform: 'uppercase', color: 'var(--c-muted)', margin: '0 0 12px' }}>{t('持ち込み', 'Bring Your Own')}</p>
              <p style={{ fontSize: 'var(--brand-type-body)', fontWeight: 400, color: 'var(--c-ink)', margin: '0 0 6px' }}>{t('植物・鉢とも持込可', 'Plants & pots welcome')}</p>
              <p style={{ fontSize: 'var(--brand-type-label)', color: 'var(--c-muted)', margin: 0, lineHeight: 1.7 }}>{t('当店以外でご購入の植物・お手持ちの鉢でもご参加いただけます。', 'You are welcome to bring plants purchased elsewhere or pots you already own.')}</p>
            </div>
            <div style={{ padding: '28px 24px', border: '1px solid #dddde8', borderRadius: 4 }}>
              <p style={{ fontSize: 'var(--brand-type-label)', letterSpacing: 2, textTransform: 'uppercase', color: 'var(--c-muted)', margin: '0 0 12px' }}>{t('お子様連れ', 'With Children')}</p>
              <p style={{ fontSize: 'var(--brand-type-body)', fontWeight: 400, color: 'var(--c-ink)', margin: '0 0 6px' }}>{t('お子様も大歓迎', 'Children are very welcome')}</p>
              <p style={{ fontSize: 'var(--brand-type-label)', color: 'var(--c-muted)', margin: 0, lineHeight: 1.7 }}>{t('親子でお楽しみいただけます。植物や資材の扱いが初めての方でも、スタッフがしっかりサポートします。', 'Families with children are welcome. Staff will fully support anyone new to plants or materials.')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* 予約の案内とイベント一覧へのリンク（紺色の帯） */}
      <section style={{ background: '#1e3272', color: '#f0f2ff', textAlign: 'center', padding: '88px 20px' }}>
        <h2 style={{ fontSize: 'var(--brand-type-title)', fontWeight: 200, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 14px' }}>{t('お申し込み', 'Reservation')}</h2>
        <p style={{ fontSize: 'var(--brand-type-label)', letterSpacing: 2, color: '#9aaedd', textTransform: 'uppercase', margin: '0 0 40px', lineHeight: 1.8 }}>
          {t(<>ワークショップへのご参加は<br />各イベントページよりお申し込みいただけます。</>, <>To join a workshop,<br />please sign up on the individual event page.</>)}
        </p>
        <Link
          to={siteForHost(window.location.hostname).key === 'habitat-oides' ? 'https://ei8htplants.com/official/events' : '/official/events'}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 'var(--brand-type-body)', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#f0f2ff', textDecoration: 'none', border: '1px solid #5572cc', padding: '16px 36px', borderRadius: 2 }}
        >
          {t('開催イベントを見る', 'View all events')} →
        </Link>
      </section>
    </>
  )
}
