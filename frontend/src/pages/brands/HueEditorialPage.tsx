import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import PageMeta from '../../components/PageMeta'
import { useT } from '../../lib/lang'
import { BRAND } from '../../lib/brands'
import { useHueImages } from '../../sites/hue/useHueImages'
import { usePageImageEditMode } from '../../lib/pageImageEdit'
import { HUE_PAGE_SLOTS } from '../../lib/pageImageSlots'
import PageImageSlotTarget from '../../components/PageImageSlotTarget'

/** HUE の編集ページ種別。ブランド紹介・一鉢の選び方・植物のある部屋を識別する */
type HueEditorialPageKind = 'about' | 'choose' | 'living'

/**
 * HUE のブランド編集ページに表示する日英コピー・読みもの項目。
 * `about`・`choose`・`living` のページ種別とキーをそろえ、各項目の画像番号は管理画面の6枚画像に対応する。
 */
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

// 各編集ページの末尾に表示する次に読むページのリンク
const NEXT_PAGE: Record<HueEditorialPageKind, { href: string; ja: string; en: string }> = {
  about: { href: '/choose', ja: '一鉢の選び方', en: 'Choosing a plant' },
  choose: { href: '/living', ja: '植物のある部屋', en: 'Plants at home' },
  living: { href: '/about', ja: 'HUEについて', en: 'About HUE' },
}

/** ページの見出しの横に出す写真の番号（0 始まり。about: 02・choose: 03・living: 04 の写真） */
const HERO_IMAGE_INDEX: Record<HueEditorialPageKind, number> = { about: 1, choose: 2, living: 3 }

/**
 * 色の写真の番号（0 始まり）から、管理画面の枠のキーを返す（'hue-color-01' など）。
 * @param index - 0 始まりの写真の番号
 * @returns 枠のキー
 */
const hueSlotKey = (index: number) => HUE_PAGE_SLOTS[index]?.key ?? `hue-color-${String(index + 1).padStart(2, '0')}`

/**
 * 指定された HUE の編集ページを表示する。
 * 管理画面「ページ画像の編集」のプレビュー（編集モード）では、スクロールで現れる動きを止めて最初から表示し、
 * 写真の上に枠（PageImageSlotTarget）を重ねる。見出しの写真と同じ写真を記事でも使うとき（choose の 03・living の 04）は、
 * 記事の枠を2つ目以降の枠にする。
 * @param page - 表示するページの種別
 * @returns `page` で指定された HUE 編集ページの React 要素。
 */
export default function HueEditorialPage({ page }: { page: HueEditorialPageKind }) {
  // 現在の表示言語に合わせて文言を選ぶ翻訳関数
  const t = useT()
  // 管理画面で設定した HUE の6枚の写真
  const images = useHueImages()
  // IntersectionObserver が表示状態を切り替える対象をまとめたページルート
  const pageRef = useRef<HTMLDivElement>(null)
  // 現在のページ種別に対応する見出し・紹介文・記事データ
  const content = PAGE_COPY[page]
  // 現在のページから次に読む編集ページ
  const next = NEXT_PAGE[page]
  // 管理画面のプレビュー（編集モード）か
  const editMode = usePageImageEditMode()
  // 見出しの横の写真の番号と URL
  const heroIndex = HERO_IMAGE_INDEX[page]
  const heroImage = images[heroIndex]

  useEffect(() => {
    // 1. アニメーション対象を取得し、表示準備用クラスを付ける
    const root = pageRef.current
    if (!root) return
    // 1-2. 管理画面のプレビュー（編集モード）では、表示準備用クラス（最初は透明にして、現れるときにふわっと出す）を付けず、
    //      最初から表示した状態のまま動かさない
    if (editMode) return
    // スクロール表示演出の監視対象要素
    const items = Array.from(root.querySelectorAll<HTMLElement>('[data-hue-reveal]'))
    root.classList.add('hue-motion-ready')
    // 2. 動きを減らす設定または未対応環境では、要素をすぐ表示して監視を登録しない
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
      items.forEach((item) => item.classList.add('is-inview'))
      return () => root.classList.remove('hue-motion-ready')
    }
    // 3. 要素が画面に入ったら表示状態にし、再監視を止める
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        entry.target.classList.add('is-inview')
        observer.unobserve(entry.target)
      })
    }, { threshold: 0.12, rootMargin: '0px 0px -7% 0px' })
    items.forEach((item) => observer.observe(item))
    // 4. ページ種別が変わるか画面を離れるとき、監視と準備用クラスを解除する
    return () => {
      observer.disconnect()
      root.classList.remove('hue-motion-ready')
    }
  }, [page, editMode])

  return (
    <div className="hue-editorial-page" ref={pageRef}>
      <PageMeta
        title={`${t(content.title[0], content.title[1])} | HUE by ei8ht plants`}
        description={t(content.intro[0], content.intro[1])}
        ogImage="/img/logo-hue.png"
      />
      {/* ページの見出し、概要、代表写真 */}
      <header className={`hue-subpage-hero hue-subpage-hero--${page}`}>
        <div className="hue-subpage-copy" data-hue-reveal="rise">
          <p className="hue-overline">HUE by ei8ht plants <span> / {page === 'about' ? '01' : page === 'choose' ? '02' : '03'}</span></p>
          <h1>{t(content.headline[0], content.headline[1]).split('\n').map((line, index) => <span key={index}>{line}</span>)}</h1>
          <p className="hue-subpage-intro">{t(content.intro[0], content.intro[1])}</p>
          <Link className="hue-discover-link" to="#hue-subpage-content">{t('ページを読む', 'EXPLORE')} <span>↓</span></Link>
        </div>
        <figure className="hue-subpage-hero-image" data-hue-reveal="art">
          {heroImage && <img src={heroImage} alt={t('HUE by ei8ht plants の植物', 'A plant from HUE by ei8ht plants')} />}
          <figcaption>{t('色 / かたち / 暮らし', 'COLOR / FORM / LIFE')}</figcaption>
          {/* 編集モードのときだけ、写真の上に枠を重ねる（ふつうの公開ページでは何も出さない） */}
          <PageImageSlotTarget slotKey={hueSlotKey(heroIndex)} empty={!heroImage} className="page-edit-target--center" />
        </figure>
        <span className="hue-subpage-index" aria-hidden="true">0{page === 'about' ? '1' : page === 'choose' ? '2' : '3'}</span>
      </header>

      {/* ページ種別ごとの編集記事 */}
      <section className="hue-subpage-content" id="hue-subpage-content">
        <div className="hue-section-label" data-hue-reveal="rise"><span>01</span><span>{t(content.sectionTitle[0], content.sectionTitle[1])}</span></div>
        <div className="hue-subpage-entries">
          {content.entries.map((entry) => (
            <article className="hue-subpage-entry" key={entry.label[0]} data-hue-reveal="rise">
              <figure className="hue-subpage-entry-image" style={{ '--photo-index': entry.image } as React.CSSProperties}>
                {images[entry.image] && <img src={images[entry.image]} alt={t(entry.title[0], entry.title[1])} loading="lazy" />}
                <span>0{entry.image + 1}</span>
                {/* 編集モードのときだけ、写真の上に枠を重ねる。見出しの写真と同じなら2つ目以降の枠にする */}
                <PageImageSlotTarget slotKey={hueSlotKey(entry.image)} empty={!images[entry.image]} secondary={entry.image === heroIndex} className="page-edit-target--center" />
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

      {/* HUE トップと次の編集ページへの移動 */}
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
