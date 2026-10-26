import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import PageMeta from '../../components/PageMeta'
import { useT } from '../../lib/lang'
import { BRAND } from '../../lib/brands'
import { useHueImages } from '../../sites/hue/useHueImages'

type HueEditorialPageKind = 'about' | 'choose' | 'living'

const PAGE_COPY = {
  about: {
    title: ['HUEについて', 'ABOUT HUE'],
    headline: ['植物と暮らす、\nHUEのこと。', 'A life with plants,\nin the HUE way.'],
    intro: [
      '植物を、部屋に置くものとしてだけでなく、日々を一緒に過ごす存在として。HUEは葉の色やかたちに目を向け、暮らしの景色になる一鉢を紹介します。',
      'More than an object in a room, a plant is something we share our days with. HUE looks closely at foliage, form, and the small ways plants change a space.',
    ],
    sectionTitle: ['HUEが大切にしていること', 'WHAT MATTERS TO HUE'],
    entries: [
      { label: ['01 / 色', '01 / COLOR'], title: ['葉の色を見つける', 'Notice the color'], body: ['光の向きや時間で変わる葉の色。いつもの部屋にある、小さな発見を楽しみます。', 'Foliage shifts with the light and the hour. We make room for small discoveries in familiar spaces.'], image: 0 },
      { label: ['02 / かたち', '02 / FORM'], title: ['育つかたちを眺める', 'Follow the form'], body: ['葉の重なりや枝の線。植物それぞれが持つかたちと、育つ時間に目を向けます。', 'Leaves overlap and stems find their own lines. We pay attention to each plant’s form as it grows.'], image: 2 },
      { label: ['03 / 居場所', '03 / PLACE'], title: ['部屋の景色に迎える', 'Make a place for it'], body: ['鉢や家具との組み合わせを考えながら、自分らしい場所に植物を迎えます。', 'A plant becomes part of a room through the pots, furniture, and personal details around it.'], image: 4 },
    ],
  },
  choose: {
    title: ['一鉢の選び方', 'CHOOSING A PLANT'],
    headline: ['好き、から始める\n一鉢選び。', 'Start with what\nyou love.'],
    intro: [
      '名前や育て方を調べる前に、まずは心に留まった葉の色やかたちを見つける。HUEの一鉢選びは、そんな小さな好みから始まります。',
      'Before looking up names or care, notice the leaf color or shape that caught your eye. Choosing a HUE plant can start with a simple preference.',
    ],
    sectionTitle: ['選ぶときの3つの視点', 'THREE WAYS TO LOOK'],
    entries: [
      { label: ['01 / 葉の色', '01 / FOLIAGE'], title: ['好きな色合いを見つける', 'Find a tone you like'], body: ['明るい葉、深い緑、やわらかな斑。部屋にある色や、毎日眺めたい色から考えてみます。', 'Fresh greens, deeper shades, gentle variegation. Begin with a color already in your room or one you would enjoy seeing each day.'], image: 0 },
      { label: ['02 / シルエット', '02 / SILHOUETTE'], title: ['かたちの違いを楽しむ', 'Explore different shapes'], body: ['葉が広がる姿や、すっと伸びる線。写真を見比べて、惹かれる輪郭を探します。', 'A spreading canopy or a tall, quiet line. Compare silhouettes and notice which one draws you in.'], image: 2 },
      { label: ['03 / 飾る場所', '03 / YOUR SPACE'], title: ['置きたい場所を思い浮かべる', 'Picture its place'], body: ['窓辺や棚の上など、迎えたい場所を思い浮かべると、大きさや鉢のイメージも見えてきます。', 'Picture a windowsill, a shelf, or another place you have in mind. It can help you imagine scale and pot style.'], image: 4 },
    ],
  },
  living: {
    title: ['植物のある部屋', 'PLANTS AT HOME'],
    headline: ['一鉢から、\n部屋の景色を。', 'Let one plant\nshape a room.'],
    intro: [
      '植物を迎えると、目に入る景色や部屋で過ごす時間が少し変わります。飾り方に決まりはありません。好きなものと並べながら、自分の居場所をつくっていきます。',
      'A plant can change the view you notice and the way you spend time in a room. There is no single way to style it. Let your own place take shape around what you love.',
    ],
    sectionTitle: ['部屋になじませるヒント', 'A FEW IDEAS FOR YOUR SPACE'],
    entries: [
      { label: ['01 / 光', '01 / LIGHT'], title: ['光の入る場所を眺める', 'Notice where light falls'], body: ['朝と夕方で変わる光の位置を眺めてみる。植物の姿が一日の中で違って見える場所を探します。', 'Watch how light moves through the room. Find a place where the plant’s presence changes through the day.'], image: 1 },
      { label: ['02 / 高さ', '02 / HEIGHT'], title: ['目線に変化をつくる', 'Change the view'], body: ['床や棚、テーブルの上。置く高さが変わると、葉の見え方や部屋の印象も変わります。', 'Floor, shelf, or tabletop: changing the height shifts how you see the leaves and the room around them.'], image: 3 },
      { label: ['03 / 組み合わせ', '03 / TOGETHER'], title: ['鉢や家具と並べてみる', 'Bring pieces together'], body: ['鉢の質感や家具の色と合わせてみる。植物が部屋の中に自然となじむ組み合わせを見つけます。', 'Consider the pot’s texture and nearby furniture. Find a combination that feels at home in your space.'], image: 5 },
    ],
  },
} as const

const NEXT_PAGE: Record<HueEditorialPageKind, { href: string; ja: string; en: string }> = {
  about: { href: '/choose', ja: '一鉢の選び方', en: 'Choosing a plant' },
  choose: { href: '/living', ja: '植物のある部屋', en: 'Plants at home' },
  living: { href: '/about', ja: 'HUEについて', en: 'About HUE' },
}

export default function HueEditorialPage({ page }: { page: HueEditorialPageKind }) {
  const t = useT()
  const images = useHueImages()
  const pageRef = useRef<HTMLDivElement>(null)
  const content = PAGE_COPY[page]
  const next = NEXT_PAGE[page]

  useEffect(() => {
    const root = pageRef.current
    if (!root) return
    const items = Array.from(root.querySelectorAll<HTMLElement>('[data-hue-reveal]'))
    root.classList.add('hue-motion-ready')
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
      items.forEach((item) => item.classList.add('is-inview'))
      return () => root.classList.remove('hue-motion-ready')
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        entry.target.classList.add('is-inview')
        observer.unobserve(entry.target)
      })
    }, { threshold: 0.12, rootMargin: '0px 0px -7% 0px' })
    items.forEach((item) => observer.observe(item))
    return () => {
      observer.disconnect()
      root.classList.remove('hue-motion-ready')
    }
  }, [page])

  return (
    <div className="hue-editorial-page" ref={pageRef}>
      <PageMeta
        title={`${t(content.title[0], content.title[1])} | HUE by ei8ht plants`}
        description={t(content.intro[0], content.intro[1])}
        ogImage="/img/logo-hue.png"
      />
      <header className={`hue-subpage-hero hue-subpage-hero--${page}`}>
        <div className="hue-subpage-copy" data-hue-reveal="rise">
          <p className="hue-overline">HUE by ei8ht plants <span> / {page === 'about' ? '01' : page === 'choose' ? '02' : '03'}</span></p>
          <h1>{t(content.headline[0], content.headline[1]).split('\n').map((line, index) => <span key={index}>{line}</span>)}</h1>
          <p className="hue-subpage-intro">{t(content.intro[0], content.intro[1])}</p>
          <Link className="hue-discover-link" to="#hue-subpage-content">{t('ページを読む', 'EXPLORE')} <span>↓</span></Link>
        </div>
        <figure className="hue-subpage-hero-image" data-hue-reveal="art">
          {images[page === 'living' ? 3 : page === 'choose' ? 2 : 1] && <img src={images[page === 'living' ? 3 : page === 'choose' ? 2 : 1]} alt={t('HUE by ei8ht plants の植物', 'A plant from HUE by ei8ht plants')} />}
          <figcaption>{t('色 / かたち / 暮らし', 'COLOR / FORM / LIFE')}</figcaption>
        </figure>
        <span className="hue-subpage-index" aria-hidden="true">0{page === 'about' ? '1' : page === 'choose' ? '2' : '3'}</span>
      </header>

      <section className="hue-subpage-content" id="hue-subpage-content">
        <div className="hue-section-label" data-hue-reveal="rise"><span>01</span><span>{t(content.sectionTitle[0], content.sectionTitle[1])}</span></div>
        <div className="hue-subpage-entries">
          {content.entries.map((entry) => (
            <article className="hue-subpage-entry" key={entry.label[0]} data-hue-reveal="rise">
              <figure className="hue-subpage-entry-image" style={{ '--photo-index': entry.image } as React.CSSProperties}>
                {images[entry.image] && <img src={images[entry.image]} alt={t(entry.title[0], entry.title[1])} loading="lazy" />}
                <span>0{entry.image + 1}</span>
              </figure>
              <div className="hue-subpage-entry-copy">
                <p className="hue-story-kicker">{t(entry.label[0], entry.label[1])}</p>
                <h2>{t(entry.title[0], entry.title[1])}</h2>
                <p>{t(entry.body[0], entry.body[1])}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <nav className="hue-subpage-next" aria-label={t('次のページ', 'Next page')}>
        <Link to="/">{t('HUE トップへ戻る', 'BACK TO HUE HOME')} <span>↗</span></Link>
        <Link to={next.href}><small>{t('次に読む', 'NEXT')}</small>{t(next.ja, next.en)} <span>→</span></Link>
      </nav>
      <section className="hue-subpage-follow">
        <img src={BRAND.hue.logo} alt="HUE by ei8ht plants" />
        <p>{t('植物と暮らす日々の風景を、Instagramで。', 'Find HUE plants and everyday scenes on Instagram.')}</p>
        <a href={BRAND.hue.instagramUrl} target="_blank" rel="noreferrer">{BRAND.hue.instagramHandle} ↗</a>
      </section>
    </div>
  )
}
