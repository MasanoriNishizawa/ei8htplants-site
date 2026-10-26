import { Link } from 'react-router-dom'
import PageMeta from '../../components/PageMeta'
import { useT } from '../../lib/lang'
import { BRAND, TEXT_LOGO } from '../../lib/brands'

/** ei8ht plants のブランドトップ。植物とブランドの考え方へ案内する。 */
export default function Ei8htPlants() {
  const t = useT()

  return (
    <div className="ep-editorial-page ep-home-page">
      <PageMeta
        title="ei8ht plants"
        description={t('アガベ、塊根植物、灌木。一株ごとに異なる個性を持つ植物を育て、植物との暮らしを提案します。', 'Agaves, caudiciform plants, and shrubs, grown and selected for their singular character.')}
      />

      <section className="ep-home-hero" aria-labelledby="ep-home-title">
        <figure className="ep-home-visual">
          <img src="/img/ei8htPlants/ei8htplants_hero.jpg" alt={t('手のオブジェに載る小さなアガベ', 'A small agave resting on a hand-shaped object')} />
          <figcaption>GROW / SELECT / LIVE</figcaption>
        </figure>
        <div className="ep-home-copy">
          <p className="ep-home-kicker">BIZARRE PLANTS <span>—</span> EI8HT PLANTS</p>
          <img className="ep-home-wordmark" src={TEXT_LOGO} alt={BRAND.ei8htPlants.name} />
          <h1 id="ep-home-title">{t(<>ひと株の個性と、<br /><em>暮らす。</em></>, <>Live with<br /><em>a plant’s character.</em></>)}</h1>
          <p className="ep-home-lead">{t('アガベ、塊根植物、灌木。姿も育つ時間も異なる植物を、自ら育て、一株ずつの魅力を届けています。', 'Agaves, caudiciform plants, and shrubs. We grow distinctive plants and share the character of each individual.')}</p>
          <div className="ep-home-actions">
            <Link className="ep-home-primary" to="/plants">{t('植物のラインを見る', 'Explore the plants')} <span aria-hidden="true">↗</span></Link>
            <Link className="ep-home-secondary" to="/about">{t('ei8ht plantsについて', 'Our approach')}</Link>
          </div>
          <p className="ep-home-index"><span>01</span> / GROW WITH CHARACTER</p>
        </div>
      </section>

      <section className="ep-home-intro" aria-labelledby="ep-home-intro-title">
        <p className="ep-editorial-kicker">A PLANT, A STORY</p>
        <div className="ep-home-intro-grid">
          <h2 id="ep-home-intro-title">{t(<>かたちの奥にある、<br /><em>その株だけの時間。</em></>, <>Every form holds<br /><em>its own story.</em></>)}</h2>
          <div>
            <p>{t('葉の重なり、幹の曲線、育ってきた時間。珍しさだけではなく、一株ごとに異なる姿と向き合いながら、植物との関係が長く続く一鉢を提案します。', 'The way leaves overlap, the curve of a trunk, the time held in its form. We look beyond rarity to help each plant find a lasting place in your life.')}</p>
            <Link className="ep-editorial-link" to="/about">{t('私たちの考え方', 'Read our approach')} <span aria-hidden="true">↗</span></Link>
          </div>
        </div>
        <div className="ep-home-lines" aria-label={t('取り扱う植物', 'Plants we grow')}>
          <span>01 <b>AGAVE</b></span>
          <span>02 <b>CAUDICIFORM</b></span>
          <span>03 <b>SHRUB</b></span>
        </div>
      </section>

      <section className="ep-home-store" aria-labelledby="ep-home-store-title">
        <div>
          <p className="ep-editorial-kicker">FIND YOUR PLANT</p>
          <h2 id="ep-home-store-title">{t(<>次に迎える一株を、<br /><em>見つけに。</em></>, <>Find the plant<br /><em>that feels like yours.</em></>)}</h2>
        </div>
        <div className="ep-home-store-action">
          <p>{t('植物のラインから個性を知り、オンラインストアで現在の出会いをご覧ください。', 'Explore our plant lines, then see what is available in the online store.')}</p>
          <Link className="ep-home-primary" to="/official/shop">{t('オンラインストアへ', 'Visit the online store')} <span aria-hidden="true">↗</span></Link>
        </div>
        <span className="ep-home-store-mark" aria-hidden="true" />
      </section>
    </div>
  )
}
