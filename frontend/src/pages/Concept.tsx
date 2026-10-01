import { Link } from 'react-router-dom'
import PageMeta from '../components/PageMeta'
import { useT } from '../lib/lang'

const LINES = [
  {
    name: 'ei8ht plants',
    subtitle: 'Bizarre Plants',
    teaser: {
      ja: 'アガベ・塊根植物・灌木など、個性的な姿を持つビザールプランツを専門に扱います。初めての一株からコレクター向けまで、育てる楽しさをともに見つけていきます。',
      en: 'We specialize in bizarre plants — agaves, caudiciform succulents, and more. From your very first plant to collector specimens, we help you discover the joy of growing.',
    },
    to: '/ei8htplants',
  },
  {
    name: 'Habitat Oides',
    subtitle: 'Habitat Style Materials & Plants',
    teaser: {
      ja: '自生地の風景を、一つの鉢の中に。石・砂と植物が織りなすハビタットスタイルの世界観と、ワークショップをご提案します。',
      en: 'Bringing wild landscapes into a single pot. We offer habitat-style compositions with stone, sand, and plants — and workshops to create your own.',
    },
    to: '/habitatoides',
  },
  {
    name: 'HUE by ei8ht plants',
    subtitle: 'Color Plants Selection',
    teaser: {
      ja: '葉の色彩と造形美に着目したオーナメントプランツライン。暮らしの空間に彩りと生命感を添える一鉢をお届けします。',
      en: 'An ornamental plant line focused on foliage color and sculptural form. Each piece brings color and life to your living space.',
    },
    to: '/hue',
  },
]

export default function Concept() {
  const t = useT()

  return (
    <>
      <PageMeta title="Concept" description="ei8ht plants のブランドコンセプト。ビザールプランツ・ハビタットスタイル・オーナメントプランツの3ラインをご紹介します。" />
      <div style={{ textAlign: 'center', padding: '80px 20px', background: '#f5f5f7', borderBottom: '1px solid #dddde8' }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontSize: 'clamp(26px, 5vw, 40px)', fontWeight: 300, letterSpacing: 6, textTransform: 'uppercase', margin: 0 }}>Concept</h1>
      </div>

      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 20px' }}>
        <div style={{ marginTop: 80 }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontSize: 13, letterSpacing: 4, textTransform: 'uppercase', color: 'var(--c-muted)', fontWeight: 400, margin: '0 0 40px', paddingBottom: 16, borderBottom: '1px solid #dddde8' }}>Philosophy</h2>
          <div style={{ maxWidth: 750, margin: '0 auto', lineHeight: 2.2, fontSize: 16, color: 'var(--c-body)', textAlign: 'justify' }}>
            {t(
              <>
                色と形に惹かれた一株を、毎日手入れして育てるのもいい。<br />
                石や砂と組み合わせて、自分だけの景色に仕立てるのもいい。<br />
                部屋のどこかに置いて、ただ眺めながら暮らすのもいい。<br /><br />
                植物との付き合い方に、正解はありません。<br />
                どんなスタイルでも、一緒に考えながらご提案します。
              </>,
              <>
                Nurture it day by day. Style it with stone and sand.<br />
                Set it somewhere and simply live with it.<br /><br />
                There's no right way to be with plants.<br />
                Whatever your style, we'll figure it out together.
              </>
            )}
          </div>
        </div>

        <div style={{ marginTop: 80, marginBottom: 100 }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontSize: 13, letterSpacing: 4, textTransform: 'uppercase', color: 'var(--c-muted)', fontWeight: 400, margin: '0 0 0', paddingBottom: 16, borderBottom: '1px solid #dddde8' }}>Specialized Lines</h2>
          <div className="brand-line-grid">
            {LINES.map(({ name, subtitle, teaser, to }) => (
              <Link
                key={name}
                to={to}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div
                  style={{ padding: 40, background: '#ffffff', border: '1px solid #dddde8', borderRadius: 4, transition: 'transform 0.3s ease', height: '100%', boxSizing: 'border-box' }}
                  onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-5px)')}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
                >
                  <span style={{ display: 'block', fontSize: 16, fontWeight: 500, letterSpacing: 2, marginBottom: 6, borderBottom: '1px solid #dddde8', paddingBottom: 10 }}>{name}</span>
                  <span style={{ display: 'block', fontSize: 12, letterSpacing: 2, color: 'var(--c-muted)', textTransform: 'uppercase', marginBottom: 16 }}>{subtitle}</span>
                  <p style={{ fontSize: 16, lineHeight: 1.9, color: 'var(--c-body)', margin: '0 0 20px' }}>{t(teaser.ja, teaser.en)}</p>
                  <span style={{ fontSize: 13, letterSpacing: 1.5, color: 'var(--c-muted)', textTransform: 'uppercase' }}>{t('詳しく見る →', 'Learn more →')}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
