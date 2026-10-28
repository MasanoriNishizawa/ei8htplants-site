import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import PageMeta from '../../components/PageMeta'
import { useT } from '../../lib/lang'
import { BRAND } from '../../lib/brands'
import { useHueImages } from '../../sites/hue/useHueImages'

/**
 * HUE 専用サイトを描画し、色とフォルムから植物を楽しむブランド体験を提供する。
 * @returns HUE ブランドトップの React 要素。
 */
export default function Hue() {
  // 現在の表示言語に合わせて文言を選ぶ翻訳関数
  const t = useT()
  // 管理画面から設定した6枚の色写真
  const paletteImages = useHueImages()
  // ページ全体の動き用クラスと進捗 CSS 変数を設定するルート要素
  const homeRef = useRef<HTMLDivElement>(null)
  // スクロール進捗で背景の変化を制御するヒーロー領域
  const heroRef = useRef<HTMLElement>(null)
  // 横移動ストーリーの進捗計算に使うセクション
  const storyRef = useRef<HTMLElement>(null)
  // スクロール進捗に合わせて横へ移動するストーリー列
  const storyTrackRef = useRef<HTMLDivElement>(null)
  // ストーリーのスクロール進捗を示すバー
  const storyProgressRef = useRef<HTMLSpanElement>(null)
  // 現在表示中の章番号を示すカウンター
  const storyCounterRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    // 動きの設定を適用する HUE トップのルート要素
    const root = homeRef.current
    if (!root) return

    // スクロール表示演出の対象要素
    const revealItems = Array.from(root.querySelectorAll<HTMLElement>('[data-hue-reveal]'))
    // OS 設定でアニメーションを減らす必要があるか
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    root.classList.add('hue-motion-ready')

    if (reducedMotion || !('IntersectionObserver' in window)) {
      root.classList.add('hue-motion-reduced')
      revealItems.forEach((item) => item.classList.add('is-inview'))
      return () => root.classList.remove('hue-motion-ready', 'hue-motion-reduced')
    }

    // 画面に入った要素へ表示済みクラスを付ける監視処理
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        entry.target.classList.add('is-inview')
        observer.unobserve(entry.target)
      })
    }, { threshold: 0.12, rootMargin: '0px 0px -7% 0px' })
    revealItems.forEach((item) => observer.observe(item))

    /**
     * スクロール進捗を 0〜1 の範囲に収める。
     * @param value - 0〜1 に収める進捗値
     * @returns 0 以上 1 以下に制限した進捗値
     */
    const clamp = (value: number) => Math.min(1, Math.max(0, value))
    // 予約中のアニメーションフレーム ID（0 は未予約）
    let frame = 0
    /**
     * スクロール位置に応じてヒーローと横移動ストーリーの表示を更新する。
     * @returns 戻り値なし。
     */
    const updateScrollMotion = () => {
      frame = 0
      // 背景進捗を更新するヒーロー要素
      const hero = heroRef.current
      // 横スクロールの進捗を計算するストーリーセクション
      const story = storyRef.current
      // 横方向に移動させるストーリー列
      const track = storyTrackRef.current
      if (hero) {
        // 画面上のヒーロー位置と高さ
        const rect = hero.getBoundingClientRect()
        root.style.setProperty('--hue-hero-progress', clamp(-rect.top / Math.max(1, rect.height)).toFixed(3))
      }
      if (!story || !track) return

      if (window.matchMedia('(min-width: 900px)').matches) {
        // 1. 固定ヘッダーを差し引いたストーリー表示領域と、横移動に使うスクロール距離を求める
        const storyTop = window.scrollY + story.getBoundingClientRect().top
        // CSS で設定された固定ヘッダー高（未設定時は既定値）
        const headerHeight = Number.parseFloat(getComputedStyle(root).getPropertyValue('--brand-site-header-height')) || 82
        // 固定ヘッダーを除いたストーリーの表示可能な高さ
        const pinHeight = Math.max(1, window.innerHeight - headerHeight)
        // 横移動の進捗に割り当てる縦スクロール距離
        const travel = Math.max(1, story.offsetHeight - pinHeight)
        // 2. 進捗を横移動距離と進捗バーに反映し、表示中の章番号を更新する
        const progress = clamp((window.scrollY - storyTop) / travel)
        // ストーリー列を横へ動かす最大距離
        const maxX = Math.max(0, track.scrollWidth - window.innerWidth)
        track.style.transform = `translate3d(${-maxX * progress}px, 0, 0)`
        if (storyProgressRef.current) storyProgressRef.current.style.transform = `scaleX(${progress})`
        if (storyCounterRef.current) {
          // 進捗に応じて表示する章番号（1〜3）
          const chapter = Math.min(3, Math.round(progress * 2) + 1)
          storyCounterRef.current.textContent = `${String(chapter).padStart(2, '0')} / 03`
        }
      } else {
        track.style.transform = ''
        if (storyProgressRef.current) storyProgressRef.current.style.transform = 'scaleX(0)'
      }
    }
    /**
     * スクロール更新を次のアニメーションフレームにまとめて依頼する。
     * @returns 戻り値なし。
     */
    const requestScrollUpdate = () => {
      if (frame) return
      frame = window.requestAnimationFrame(updateScrollMotion)
    }
    updateScrollMotion()
    window.addEventListener('scroll', requestScrollUpdate, { passive: true })
    window.addEventListener('resize', requestScrollUpdate)

    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', requestScrollUpdate)
      window.removeEventListener('resize', requestScrollUpdate)
      if (frame) window.cancelAnimationFrame(frame)
      root.classList.remove('hue-motion-ready', 'hue-motion-reduced')
      root.style.removeProperty('--hue-hero-progress')
      if (storyTrackRef.current) storyTrackRef.current.style.transform = ''
    }
  }, [])

  // トップページの横移動ストーリーで表示する3つの章
  const stories = [
    {
      label: t('光 / 葉', 'LIGHT / LEAF'),
      title: t(<>朝の光で、<br />葉の表情に気づく。</>, <>Notice a leaf in the morning light.</>),
      body: t('窓辺の光が変わるたび、葉の色も違って見える。昨日は見過ごした小さな変化が、植物と暮らす楽しみになります。', 'As the light shifts by the window, foliage takes on a different tone. Small changes become part of the pleasure of living with a plant.'),
      image: paletteImages[0],
      caption: t('朝の光と葉の色', 'MORNING LIGHT / FOLIAGE'),
    },
    {
      label: t('かたち / 成長', 'FORM / GROWTH'),
      title: t(<>伸びる線を、<br />ゆっくり眺める。</>, <>Follow the shape as it grows.</>),
      body: t('新しい葉の重なりや、枝が描く線。植物が育つ時間を眺めると、部屋の中にもゆるやかなリズムが生まれます。', 'A new leaf, the line of a branch. Watching a plant grow brings a slower rhythm into the room.'),
      image: paletteImages[2],
      caption: t('葉が描くかたち', 'THE SHAPE OF GROWTH'),
    },
    {
      label: t('鉢 / 居場所', 'POT / PLACE'),
      title: t(<>一鉢から、<br />部屋の景色をつくる。</>, <>Let one plant shape a room.</>),
      body: t('お気に入りの鉢と、いつもの家具。その組み合わせの中に植物を迎えると、見慣れた場所に自分らしい景色ができます。', 'Bring a plant together with a favorite pot and familiar furniture. A personal scene begins to take shape.'),
      image: paletteImages[4],
      caption: t('暮らしになじむ一鉢', 'A PLANT IN ITS PLACE'),
    },
  ]
  // 下部に並べる HUE 編集ページへのリンク一覧
  const readingLinks = [
    { href: '/about', label: t('HUEについて', 'ABOUT HUE'), title: t('植物と暮らす、HUEのこと。', 'A life with plants, in the HUE way.'), image: paletteImages[1], index: '01' },
    { href: '/choose', label: t('一鉢の選び方', 'CHOOSING A PLANT'), title: t('好き、から始める一鉢選び。', 'Start with what you love.'), image: paletteImages[3], index: '02' },
    { href: '/living', label: t('植物のある部屋', 'PLANTS AT HOME'), title: t('一鉢から、部屋の景色をつくる。', 'Let one plant shape a room.'), image: paletteImages[5], index: '03' },
  ]

  return (
    <div className="hue-home" ref={homeRef}>
      <PageMeta
        title="HUE by ei8ht plants"
        description={t('葉の色彩とフォルムを楽しむ、インテリアのためのオーナメントプランツ。', 'An ornamental plant line celebrating foliage color and sculptural form.')}
        ogImage="/img/logo-hue.png"
      />

      {/* HUE の色彩表現とブランドメッセージを伝えるヒーロー */}
      <section className="hue-editorial-hero" aria-labelledby="hue-title" ref={heroRef}>
        <div className="hue-hero-copy" data-hue-reveal="rise">
          <p className="hue-overline">{t('植物と暮らす、HUEのある暮らし', 'A BOTANICAL COLOR STUDY')} <span>NO. 01</span></p>
          <h1 id="hue-title">{t(<>植物と、<br /><em>暮らす。</em></>, <>Live with<br /><em>plants.</em></>)}</h1>
          <p className="hue-hero-jp">{t('好きな一鉢と、日々を重ねる。', 'Make room for a plant in everyday life.')}</p>
          <p className="hue-hero-description">{t(
            '葉の色やかたちを楽しみながら、植物と暮らす。部屋になじみ、日々の景色になる一鉢をご紹介します。',
            'Live with plants chosen for the color and shape of their leaves. Find a plant that settles naturally into your everyday space.',
          )}</p>
          <a className="hue-discover-link" href="#point-of-view">{t('HUEの考え方', 'Discover HUE')} <span>↓</span></a>
        </div>
        <div className="hue-hero-art" aria-hidden="true" data-hue-reveal="art">
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

      {/* 植物と暮らすことへの HUE の考え方 */}
      <section id="point-of-view" className="hue-point-of-view">
        <div className="hue-section-label"><span>01</span><span>{t('植物と暮らす', 'OUR POINT OF VIEW')}</span></div>
        <div className="hue-point-grid">
          <h2 data-hue-reveal="rise">{t(<>一鉢の植物が、<br /><em>暮らしの景色になる。</em></>, <>Not just a plant.<br /><em>A point of color.</em></>)}</h2>
          <div data-hue-reveal="rise">
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

      {/* 写真とスクロール連動のパネルで色・形・暮らしを紹介する */}
      <section className="hue-color-study" aria-labelledby="hue-color-title">
        <div className="hue-section-label" data-hue-reveal="rise"><span>02</span><span>{t('植物のある暮らし', 'COLOR / FORM / SPACE')}</span></div>
        <h2 id="hue-color-title" data-hue-reveal="rise">{t('一鉢から、暮らしを選ぶ。', 'Choose by feeling.')}</h2>
        <p className="hue-color-intro" data-hue-reveal="rise">{t('朝の光に葉の色を見つける。部屋に似合う形を選ぶ。植物と過ごす日々を、自分らしく。', 'Notice the leaves in morning light. Find a shape that feels at home. Live with plants in your own way.')}</p>
        <div className="hue-photo-grid" aria-label={t('HUE by ei8ht plants の植物写真', 'Plant photos from HUE by ei8ht plants')}>
          {paletteImages.map((url, index) => (
            <div className="hue-photo-shape" key={index} data-hue-reveal="photo" style={{ '--photo-index': index } as React.CSSProperties}>
              {url && <img src={url} alt={t(`HUE by ei8ht plants の植物 ${index + 1}`, `HUE by ei8ht plants plant ${index + 1}`)} loading="lazy" />}
            </div>
          ))}
        </div>
        <section className="hue-story-scroll" aria-label={t('HUEの植物と暮らす3つの視点', 'Three ways to live with HUE plants')} ref={storyRef}>
          <div className="hue-story-pin">
            <div className="hue-story-track" ref={storyTrackRef}>
              {stories.map((story, index) => (
                <article className="hue-story-panel" key={story.label} data-hue-reveal="story">
                  <div className="hue-story-copy">
                    <p className="hue-story-kicker"><span>0{index + 1}</span> / {story.label}</p>
                    <h3>{story.title}</h3>
                    <p className="hue-story-body">{story.body}</p>
                  </div>
                  <figure className={`hue-story-visual hue-story-visual--${index + 1}${story.image ? '' : ' hue-story-visual--empty'}`}>
                    {story.image && <img src={story.image} alt={story.caption} loading="lazy" />}
                    <figcaption>{story.caption}</figcaption>
                    <span className="hue-story-visual-index">0{index + 1}</span>
                  </figure>
                </article>
              ))}
            </div>
            <div className="hue-story-footer" aria-hidden="true">
              <span className="hue-story-counter" ref={storyCounterRef}>01 / 03</span>
              <span className="hue-story-progress"><span ref={storyProgressRef} /></span>
              <span className="hue-story-cue">{t('スクロールして見る', 'SCROLL TO EXPLORE')} <span>→</span></span>
            </div>
          </div>
        </section>
      </section>

      {/* HUE の各編集ページへ案内するカード */}
      <section className="hue-reading" aria-labelledby="hue-reading-title">
        <div className="hue-section-label"><span>03</span><span>{t('HUEを知る', 'EXPLORE HUE')}</span></div>
        <div className="hue-reading-heading">
          <h2 id="hue-reading-title">{t(<>植物と暮らすヒントを、<br /><em>もう少し。</em></>, <>A little more about<br /><em>living with plants.</em></>)}</h2>
          <p>{t('HUEの考え方や、一鉢との出会い方。気になるテーマからご覧ください。', 'Explore HUE’s point of view, choosing a plant, and making room for it at home.')}</p>
        </div>
        <div className="hue-reading-grid">
          {readingLinks.map((item) => (
            <Link className="hue-reading-card" to={item.href} key={item.href}>
              <figure className="hue-reading-image">
                {item.image && <img src={item.image} alt="" loading="lazy" />}
                <span>{item.index}</span>
              </figure>
              <p className="hue-story-kicker">{item.label}</p>
              <h3>{item.title}</h3>
              <span className="hue-reading-arrow" aria-hidden="true">↗</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="hue-follow" data-hue-reveal="rise">
        <img src={BRAND.hue.logo} alt="HUE by ei8ht plants" />
        <p className="hue-overline">{t('暮らしに、もうひとつの彩りを', 'A LITTLE MORE COLOR')}</p>
        <h2>{t('植物と暮らす日々を。', 'Bring your space to life.')}</h2>
        <p>{t('HUE の植物や日々の風景は Instagram でご覧いただけます。', 'Find HUE plants and everyday scenes on Instagram.')}</p>
        <a href={BRAND.hue.instagramUrl} target="_blank" rel="noreferrer">{BRAND.hue.instagramHandle} <span>↗</span></a>
      </section>
    </div>
  )
}
