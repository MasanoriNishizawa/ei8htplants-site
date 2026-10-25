import PageMeta from '../../components/PageMeta'
import { useT } from '../../lib/lang'
import { BRAND } from '../../lib/brands'

const PALETTE = [
  { color: '#d9a76f', name: 'AMBER' },
  { color: '#9eae8c', name: 'MOSS' },
  { color: '#d6a5a5', name: 'ROSE' },
  { color: '#91b6ad', name: 'MIST' },
  { color: '#e4ca7d', name: 'CITRUS' },
  { color: '#a69bc4', name: 'IRIS' },
]

/** HUE 専用サイト。色とフォルムから植物を楽しむ、編集的なブランド体験をつくる。 */
export default function Hue() {
  const t = useT()

  return (
    <div className="hue-home">
      <PageMeta
        title="HUE by ei8ht plants"
        description={t('葉の色彩とフォルムを楽しむ、インテリアのためのオーナメントプランツ。', 'An ornamental plant line celebrating foliage color and sculptural form.')}
        ogImage="/img/logo-hue.png"
      />

      <section className="hue-editorial-hero" aria-labelledby="hue-title">
        <div className="hue-hero-copy">
          <p className="hue-overline">A BOTANICAL COLOR STUDY <span>NO. 01</span></p>
          <h1 id="hue-title">A living<br /><em>hue.</em></h1>
          <p className="hue-hero-jp">色と形で、植物を飾る。</p>
          <p className="hue-hero-description">{t(
            '葉の色彩とフォルムを楽しむ、オーナメントプランツのセレクション。空間に似合う一鉢との出会いをお届けします。',
            'An ornamental plant selection for those drawn to the color and form of foliage. Find a living accent that feels at home in your space.',
          )}</p>
          <a className="hue-discover-link" href="#point-of-view">Discover HUE <span>↓</span></a>
        </div>
        <div className="hue-hero-art" aria-hidden="true">
          <div className="hue-art-orbit hue-art-orbit--one" />
          <div className="hue-art-orbit hue-art-orbit--two" />
          <div className="hue-art-disc hue-art-disc--amber" />
          <div className="hue-art-disc hue-art-disc--green" />
          <div className="hue-art-disc hue-art-disc--rose" />
          <div className="hue-art-leaf hue-art-leaf--one" />
          <div className="hue-art-leaf hue-art-leaf--two" />
          <div className="hue-art-mark">HUE</div>
          <span className="hue-art-caption">COLOR / FORM / LIFE</span>
        </div>
        <span className="hue-hero-side-note">ORNAMENTAL PLANTS — EI8HT PLANTS</span>
      </section>

      <section id="point-of-view" className="hue-point-of-view">
        <div className="hue-section-label"><span>01</span><span>OUR POINT OF VIEW</span></div>
        <div className="hue-point-grid">
          <h2>Not just a plant.<br /><em>A point of color.</em></h2>
          <div>
            <p>{t(
              '植物は、葉の一枚や枝の曲線だけで、部屋の印象を変えることがあります。HUE は色彩と造形に目を向け、暮らしの中で楽しめる植物をご紹介します。',
              'A single leaf or the curve of a branch can change how a room feels. HUE looks closely at color and shape, bringing plants into the way we live.',
            )}</p>
            <p>{t(
              '育てる楽しさと、飾る楽しさ。その両方を、自分らしい一鉢から。',
              'The joy of growing, and the joy of living with a plant. Begin with a piece that feels like you.',
            )}</p>
          </div>
        </div>
      </section>

      <section className="hue-color-study" aria-labelledby="hue-color-title">
        <div className="hue-section-label"><span>02</span><span>COLOR / FORM / SPACE</span></div>
        <h2 id="hue-color-title">Choose by feeling.</h2>
        <p className="hue-color-intro">{t('色を選ぶ。フォルムを楽しむ。暮らしの空間に、植物のある景色を。', 'Choose a color. Follow a form. Make room for a living detail.')}</p>
        <div className="hue-palette" aria-label="HUE color palette">
          {PALETTE.map(({ color, name }, index) => (
            <div className="hue-palette-item" key={name}>
              <span className="hue-palette-swatch" style={{ '--swatch-color': color, '--swatch-index': index } as React.CSSProperties} />
              <span>{name}</span>
            </div>
          ))}
        </div>
        <div className="hue-color-notes">
          <article><span>01 / COLOR</span><h3>Notice the tone.</h3><p>{t('新芽の明るさや葉色の深み。小さな色の違いを楽しむ。', 'From fresh new growth to deep foliage tones, notice the subtle shifts in color.')}</p></article>
          <article><span>02 / FORM</span><h3>Follow the shape.</h3><p>{t('葉の重なりや枝の線。植物が描くかたちに目を向ける。', 'Look closely at a plant’s lines, leaves, and the shapes they create.')}</p></article>
          <article><span>03 / SPACE</span><h3>Make it your own.</h3><p>{t('お気に入りの鉢や家具と合わせて、自分らしい場所に飾る。', 'Pair a plant with your favorite pot and give it a place of its own.')}</p></article>
        </div>
      </section>

      <section className="hue-follow">
        <img src={BRAND.hue.logo} alt="HUE by ei8ht plants" />
        <p className="hue-overline">A LITTLE MORE COLOR</p>
        <h2>Bring your space to life.</h2>
        <p>{t('HUE の植物や日々の風景は Instagram でご覧いただけます。', 'Find HUE plants and everyday scenes on Instagram.')}</p>
        <a href={BRAND.hue.instagramUrl} target="_blank" rel="noreferrer">{BRAND.hue.instagramHandle} <span>↗</span></a>
      </section>
    </div>
  )
}
