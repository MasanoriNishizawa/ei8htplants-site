import { useEffect, useState } from 'react'
import PageMeta from '../../components/PageMeta'
import { useT } from '../../lib/lang'
import { BRAND } from '../../lib/brands'
import { api } from '../../lib/api'

/** HUE 専用サイト。色とフォルムから植物を楽しむ、編集的なブランド体験をつくる。 */
export default function Hue() {
  const t = useT()
  const [paletteImages, setPaletteImages] = useState<string[]>(Array(6).fill(''))

  useEffect(() => {
    Promise.all(Array.from({ length: 6 }, (_, index) =>
      api.siteAssets.get(`hue-color-${String(index + 1).padStart(2, '0')}`)
        .then(({ url }) => url)
        .catch(() => ''),
    )).then(setPaletteImages)
  }, [])

  return (
    <div className="hue-home">
      <PageMeta
        title="HUE by ei8ht plants"
        description={t('葉の色彩とフォルムを楽しむ、インテリアのためのオーナメントプランツ。', 'An ornamental plant line celebrating foliage color and sculptural form.')}
        ogImage="/img/logo-hue.png"
      />

      <section className="hue-editorial-hero" aria-labelledby="hue-title">
        <div className="hue-hero-copy">
          <p className="hue-overline">{t('植物と暮らす、HUEのある暮らし', 'A BOTANICAL COLOR STUDY')} <span>NO. 01</span></p>
          <h1 id="hue-title">{t(<>植物と、<br /><em>暮らす。</em></>, <>Live with<br /><em>plants.</em></>)}</h1>
          <p className="hue-hero-jp">{t('好きな一鉢と、日々を重ねる。', 'Make room for a plant in everyday life.')}</p>
          <p className="hue-hero-description">{t(
            '葉の色やかたちを楽しみながら、植物と暮らす。部屋になじみ、日々の景色になる一鉢をご紹介します。',
            'Live with plants chosen for the color and shape of their leaves. Find a plant that settles naturally into your everyday space.',
          )}</p>
          <a className="hue-discover-link" href="#point-of-view">{t('HUEの考え方', 'Discover HUE')} <span>↓</span></a>
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
          <span className="hue-art-caption">{t('色 / かたち / 暮らし', 'COLOR / FORM / LIFE')}</span>
        </div>
        <span className="hue-hero-side-note">{t('植物と暮らす — ei8ht plants', 'ORNAMENTAL PLANTS — EI8HT PLANTS')}</span>
      </section>

      <section id="point-of-view" className="hue-point-of-view">
        <div className="hue-section-label"><span>01</span><span>{t('植物と暮らす', 'OUR POINT OF VIEW')}</span></div>
        <div className="hue-point-grid">
          <h2>{t(<>一鉢の植物が、<br /><em>暮らしの景色になる。</em></>, <>Not just a plant.<br /><em>A point of color.</em></>)}</h2>
          <div>
            <p>{t(
              '窓辺に置いた一鉢を眺める。新しい葉に気づく。植物があると、いつもの部屋や時間が少し違って見えてきます。HUEは、色と形を楽しみながら暮らしに迎えられる植物を紹介します。',
              'A single leaf or the curve of a branch can change how a room feels. HUE looks closely at color and shape, bringing plants into the way we live.',
            )}</p>
            <p>{t(
              '飾って終わりではなく、育てながら一緒に過ごす。自分らしい一鉢から、植物との日々が始まります。',
              'More than decoration, a plant becomes part of the days you share. Begin with one that feels like you.',
            )}</p>
          </div>
        </div>
      </section>

      <section className="hue-color-study" aria-labelledby="hue-color-title">
        <div className="hue-section-label"><span>02</span><span>{t('植物のある暮らし', 'COLOR / FORM / SPACE')}</span></div>
        <h2 id="hue-color-title">{t('一鉢から、暮らしを選ぶ。', 'Choose by feeling.')}</h2>
        <p className="hue-color-intro">{t('朝の光に葉の色を見つける。部屋に似合う形を選ぶ。植物と過ごす日々を、自分らしく。', 'Notice the leaves in morning light. Find a shape that feels at home. Live with plants in your own way.')}</p>
        <div className="hue-photo-grid" aria-label={t('HUE by ei8ht plants の植物写真', 'Plant photos from HUE by ei8ht plants')}>
          {paletteImages.map((url, index) => (
            <div className="hue-photo-shape" key={index} style={{ '--photo-index': index } as React.CSSProperties}>
              {url && <img src={url} alt={t(`HUE by ei8ht plants の植物 ${index + 1}`, `HUE by ei8ht plants plant ${index + 1}`)} loading="lazy" />}
            </div>
          ))}
        </div>
        <div className="hue-color-notes">
          <article><span>01 / {t('色', 'COLOR')}</span><h3>{t('葉の色を楽しむ。', 'Notice the tone.')}</h3><p>{t('新芽の明るさや葉色の深み。小さな色の違いを楽しむ。', 'From fresh new growth to deep foliage tones, notice the subtle shifts in color.')}</p></article>
          <article><span>02 / {t('かたち', 'FORM')}</span><h3>{t('かたちと過ごす。', 'Follow the shape.')}</h3><p>{t('葉の重なりや枝の線。植物が描くかたちに目を向ける。', 'Look closely at a plant’s lines, leaves, and the shapes they create.')}</p></article>
          <article><span>03 / {t('居場所', 'SPACE')}</span><h3>{t('いつもの場所に迎える。', 'Make it your own.')}</h3><p>{t('お気に入りの鉢や家具と合わせて、自分らしい場所に飾る。', 'Pair a plant with your favorite pot and give it a place of its own.')}</p></article>
        </div>
      </section>

      <section className="hue-follow">
        <img src={BRAND.hue.logo} alt="HUE by ei8ht plants" />
        <p className="hue-overline">{t('暮らしに、もうひとつの彩りを', 'A LITTLE MORE COLOR')}</p>
        <h2>{t('植物と暮らす日々を。', 'Bring your space to life.')}</h2>
        <p>{t('HUE の植物や日々の風景は Instagram でご覧いただけます。', 'Find HUE plants and everyday scenes on Instagram.')}</p>
        <a href={BRAND.hue.instagramUrl} target="_blank" rel="noreferrer">{BRAND.hue.instagramHandle} <span>↗</span></a>
      </section>
    </div>
  )
}
