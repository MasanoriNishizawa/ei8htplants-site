import { Link } from 'react-router-dom'
import PageMeta from '../../components/PageMeta'
import { useT } from '../../lib/lang'
import { BRAND } from '../../lib/brands'

/** Habitat Oides の独立サイト。自生地の景色を鉢に表現するブランド体験を紹介する。 */
export default function HabitatOides() {
  const t = useT()

  return (
    <div className="habitat-home">
      <PageMeta
        title="Habitat Oides"
        description={t('植物の自生地に宿る景色の美しさを、鉢の中に再現する。植物・石・砂を組み合わせたハビタットスタイルを提案します。', 'Habitat Oides brings the landscapes plants call home into a single pot, combining plants, stone, and sand.')}
        ogImage="/img/habitatOides/habitat_oides_hero.jpg"
      />

      <section className="habitat-hero" aria-labelledby="habitat-title">
        <img className="habitat-hero-image" src="/img/habitatOides/habitat_oides_hero.jpg" alt="" />
        <div className="habitat-hero-overlay" />
        <div className="habitat-hero-copy">
          <p className="habitat-eyebrow">HABITAT OIDES <span>—</span> {t('植物の景色を仕立てる', 'PLANTS & LANDSCAPE')}</p>
          <h1 id="habitat-title">{t(<>自然の景色を、<br /><em>一鉢に仕立てる。</em></>, <>Shape a landscape,<br /><em>one pot at a time.</em></>)}</h1>
          <p className="habitat-hero-jp">{t('植物と素材を組み合わせ、自生地の景色をひと鉢に。', 'Bring plants and natural materials together in one pot.')}</p>
          <div className="habitat-hero-actions">
            <a className="habitat-button habitat-button--light" href="#world">{t('世界観を見る', 'Explore our world')} <span>↓</span></a>
            <Link className="habitat-button habitat-button--outline" to="/workshop">{t('ワークショップ', 'Workshop')} <span>↗</span></Link>
          </div>
        </div>
        <span className="habitat-hero-index">01 / 03</span>
        <span className="habitat-hero-side-label">{t('植物 · 石 · 土', 'PLANT · STONE · SOIL')}</span>
      </section>

      <section id="world" className="habitat-world">
        <div className="habitat-section-kicker"><span>01</span><span>{t('私たちの考え方', 'OUR POINT OF VIEW')}</span></div>
        <div className="habitat-world-grid">
          <figure className="habitat-world-image">
            <img src="/img/habitatOides/habitat_oides_workshop_main.jpg" alt={t('ハビタットスタイルの制作風景', 'A habitat-style arrangement in progress')} />
            <figcaption><span>{t('仕立ての記録', 'COMPOSITION STUDY')}</span><span>{t('植物 / 素材 / 景色', 'PLANTS / MATERIALS / PLACE')}</span></figcaption>
          </figure>
          <div className="habitat-world-heading">
            <p className="habitat-small-label">{t('ハビタットスタイル', 'HABITAT STYLE')}</p>
            <h2>{t(<>自然を見つめ、<br /><em>景色を仕立てる。</em></>, <>Nature is the<br /><em>original artist.</em></>)}</h2>
            <p className="habitat-world-jp">{t(<>植物が生きる場所を、<br />手のひらの中へ。</>, <>A landscape,<br />held in your hands.</>)}</p>
          </div>
          <div className="habitat-world-copy">
            <p>{t(
              '植物の美しさは、その植物が生きてきた環境とともにあります。石、砂、土、そして植物。それぞれの質感や形を重ね、自生地の風景を思わせるハビタットスタイルの作品をつくります。',
              'A plant’s beauty is connected to the place it comes from. We bring together stone, sand, soil, and plants, composing habitat-style works that echo their natural landscapes.',
            )}</p>
            <p>{t(
              '作品だけでなく、世界観をつくる資材や鉢もご紹介します。ひとつの景色を選ぶように、植物との出会いをお楽しみください。',
              'We share the materials and pots that shape this world, too. Discover plants as you would discover a landscape.',
            )}</p>
            <a className="habitat-text-link" href={BRAND.habitatOides.instagramUrl} target="_blank" rel="noreferrer">{t('作品と制作風景を見る', 'Follow the landscape')} <span>↗</span></a>
          </div>
        </div>
      </section>

      <section className="habitat-elements" aria-labelledby="habitat-elements-title">
        <div className="habitat-section-kicker habitat-section-kicker--light"><span>02</span><span>{t('景色をつくる素材', 'THE ELEMENTS')}</span></div>
        <h2 id="habitat-elements-title">{t('重なりから、景色が生まれる。', 'A world in layers.')}</h2>
        <div className="habitat-elements-grid">
          <article><span>01</span><h3>{t('植物', 'PLANTS')}</h3><p>{t('個性ある姿と育つ環境に目を向け、景色をつくる植物を選びます。', 'Plants are chosen for their distinctive forms and the environments they come from.')}</p></article>
          <article><span>02</span><h3>{t('石と砂', 'STONE & SAND')}</h3><p>{t('石や砂の形・色・手触りを重ね、風景の輪郭を描きます。', 'Stone and sand bring texture, color, and a sense of place to each composition.')}</p></article>
          <article><span>03</span><h3>{t('鉢', 'VESSEL')}</h3><p>{t('植物と素材を受け止める鉢まで含めて、ひとつの景色として仕立てます。', 'The vessel completes the composition, holding every element as one landscape.')}</p></article>
        </div>
      </section>

      <section id="workshop" className="habitat-workshop">
        <div className="habitat-workshop-image"><img src="/img/habitatOides/habitat_oides_workshop_main.jpg" alt="" /></div>
        <div className="habitat-workshop-copy">
          <p className="habitat-small-label">{t('自分の手で仕立てる', 'MAKE YOUR OWN LANDSCAPE')}</p>
          <h2>{t(<>手を動かして、<br />景色を仕立てる。</>, <>Learn by<br />making.</>)}</h2>
          <p className="habitat-workshop-jp">{t('植物と素材から、自分だけの景色を。', 'Create a landscape of your own.')}</p>
          <p>{t('植物と素材に触れながら、自分だけのレイアウトをつくるワークショップを開催しています。内容や参加費、開催情報はこちらからご覧ください。', 'Create your own layout with plants and materials in a hands-on workshop. Find details, fees, and upcoming sessions here.')}</p>
          <Link className="habitat-button habitat-button--navy" to="/workshop">{t('開催内容を見る', 'Discover the workshop')} <span>↗</span></Link>
        </div>
        <span className="habitat-workshop-index">{t('ここから始まる', 'A PLACE TO BEGIN')}</span>
      </section>

      <section id="collaboration" className="habitat-collaboration">
        <div className="habitat-section-kicker habitat-section-kicker--light"><span>03</span><span>{t('コラボレーション', 'COLLABORATIONS')}</span></div>
        <div className="habitat-collaboration-grid">
          <div>
            <p className="habitat-small-label">{t('ともにつくる', 'MADE TOGETHER')}</p>
            <h2>{t(<>つくり手とともに、<br /><em>景色を仕立てる。</em></>, <>Different hands.<br /><em>One landscape.</em></>)}</h2>
            <p>{t('作り手や素材との出会いから生まれる、Habitat Oides のコラボレーションをご紹介します。', 'Discover collaborations shaped by the people, makers, and materials we meet along the way.')}</p>
            <Link className="habitat-text-link habitat-text-link--light" to="/official/collaborations">{t('これまでの取り組み', 'View collaborations')} <span>↗</span></Link>
          </div>
          <video src="/collab.mp4" autoPlay loop muted playsInline aria-label="Habitat Oides collaboration film" />
        </div>
      </section>

      <section className="habitat-follow">
        <p className="habitat-small-label">{t('制作の風景', 'FOLLOW THE LANDSCAPE')}</p>
        <h2>{t('仕立てる日々を、Instagramで。', 'Find us in the field.')}</h2>
        <a href={BRAND.habitatOides.instagramUrl} target="_blank" rel="noreferrer">{BRAND.habitatOides.instagramHandle} <span>↗</span></a>
      </section>
    </div>
  )
}
