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
          <p className="habitat-eyebrow">HABITAT OIDES <span>—</span> PLANTS &amp; LANDSCAPE</p>
          <h1 id="habitat-title">A landscape,<br />held in your hands.</h1>
          <p className="habitat-hero-jp">植物の自生地に宿る景色の美しさを、ひと鉢の中に。</p>
          <div className="habitat-hero-actions">
            <a className="habitat-button habitat-button--light" href="#world">Explore our world <span>↓</span></a>
            <Link className="habitat-button habitat-button--outline" to="/workshop">Workshop <span>↗</span></Link>
          </div>
        </div>
        <span className="habitat-hero-index">01 / 03</span>
        <span className="habitat-hero-side-label">PLANT · STONE · SOIL</span>
      </section>

      <section id="world" className="habitat-world">
        <div className="habitat-section-kicker"><span>01</span><span>OUR POINT OF VIEW</span></div>
        <div className="habitat-world-grid">
          <div className="habitat-world-heading">
            <p className="habitat-small-label">HABITAT STYLE</p>
            <h2>Nature is the<br /><em>original artist.</em></h2>
            <p className="habitat-world-jp">自然の景色を、<br />手のひらの中へ。</p>
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
            <a className="habitat-text-link" href={BRAND.habitatOides.instagramUrl} target="_blank" rel="noreferrer">Follow the landscape <span>↗</span></a>
          </div>
        </div>
        <figure className="habitat-world-image">
          <img src="/img/habitatOides/habitat_oides_workshop_main.jpg" alt={t('ハビタットスタイルの制作風景', 'A habitat-style arrangement in progress')} />
          <figcaption><span>COMPOSITION STUDY</span><span>PLANTS / MATERIALS / PLACE</span></figcaption>
        </figure>
      </section>

      <section className="habitat-elements" aria-labelledby="habitat-elements-title">
        <div className="habitat-section-kicker habitat-section-kicker--light"><span>02</span><span>THE ELEMENTS</span></div>
        <h2 id="habitat-elements-title">A world in layers.</h2>
        <div className="habitat-elements-grid">
          <article><span>01</span><h3>PLANTS</h3><p>{t('個性ある姿と育つ環境に目を向け、景色をつくる植物を選びます。', 'Plants are chosen for their distinctive forms and the environments they come from.')}</p></article>
          <article><span>02</span><h3>STONE &amp; SAND</h3><p>{t('石や砂の形・色・手触りを重ね、風景の輪郭を描きます。', 'Stone and sand bring texture, color, and a sense of place to each composition.')}</p></article>
          <article><span>03</span><h3>VESSEL</h3><p>{t('植物と素材を受け止める鉢まで含めて、ひとつの景色として仕立てます。', 'The vessel completes the composition, holding every element as one landscape.')}</p></article>
        </div>
      </section>

      <section id="workshop" className="habitat-workshop">
        <div className="habitat-workshop-image"><img src="/img/habitatOides/habitat_oides_workshop_main.jpg" alt="" /></div>
        <div className="habitat-workshop-copy">
          <p className="habitat-small-label">MAKE YOUR OWN LANDSCAPE</p>
          <h2>Learn by<br />making.</h2>
          <p className="habitat-workshop-jp">自分の手で、ハビタットスタイルを。</p>
          <p>{t('植物と素材に触れながら、自分だけのレイアウトをつくるワークショップを開催しています。内容や参加費、開催情報はこちらからご覧ください。', 'Create your own layout with plants and materials in a hands-on workshop. Find details, fees, and upcoming sessions here.')}</p>
          <Link className="habitat-button habitat-button--navy" to="/workshop">Discover the workshop <span>↗</span></Link>
        </div>
        <span className="habitat-workshop-index">A PLACE TO BEGIN</span>
      </section>

      <section id="collaboration" className="habitat-collaboration">
        <div className="habitat-section-kicker habitat-section-kicker--light"><span>03</span><span>COLLABORATIONS</span></div>
        <div className="habitat-collaboration-grid">
          <div>
            <p className="habitat-small-label">MADE TOGETHER</p>
            <h2>Different hands.<br /><em>One landscape.</em></h2>
            <p>{t('作り手や素材との出会いから生まれる、Habitat Oides のコラボレーションをご紹介します。', 'Discover collaborations shaped by the people, makers, and materials we meet along the way.')}</p>
            <Link className="habitat-text-link habitat-text-link--light" to="/collaborations">View collaborations <span>↗</span></Link>
          </div>
          <video src="/collab.mp4" autoPlay loop muted playsInline aria-label="Habitat Oides collaboration film" />
        </div>
      </section>

      <section className="habitat-follow">
        <p className="habitat-small-label">FOLLOW THE LANDSCAPE</p>
        <h2>Find us in the field.</h2>
        <a href={BRAND.habitatOides.instagramUrl} target="_blank" rel="noreferrer">{BRAND.habitatOides.instagramHandle} <span>↗</span></a>
      </section>
    </div>
  )
}
