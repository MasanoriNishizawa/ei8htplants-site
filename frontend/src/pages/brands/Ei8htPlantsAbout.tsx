import { Link } from 'react-router-dom'
import PageMeta from '../../components/PageMeta'
import { useT } from '../../lib/lang'
import { BRAND, TEXT_LOGO } from '../../lib/brands'

/**
 *  ei8ht plantsのブランド背景を紹介するページ。
 * @returns ei8ht plants のブランド紹介ページの React 要素。
 */
export default function Ei8htPlantsAbout() {
  // 現在の表示言語に合わせて文言を選ぶ翻訳関数
  const t = useT()

  return (
    <div className="ep-editorial-page ep-about-page">
      <PageMeta
        title={t('ei8ht plantsについて', 'Our Story')}
        description={t('個性的な植物を育て、一株ごとの魅力を届けるei8ht plantsの考え方をご紹介します。', 'Meet ei8ht plants and our approach to growing and sharing distinctive plants.')}
      />
      {/* ブランドの背景を伝える導入と写真 */}
      <section className="ep-editorial-hero ep-about-hero">
        <div className="ep-editorial-hero-copy">
          <p className="ep-editorial-kicker">01 / OUR STORY</p>
          <h1>{t(<>植物の個性を、<br /><em>そのままに。</em></>, <>Let every plant<br /><em>be itself.</em></>)}</h1>
          <p className="ep-editorial-lead">{t('珍しさだけではなく、その株が持つかたちや時間に目を向ける。ei8ht plantsは、植物と人のあいだに長く続く関係をつくります。', 'We look beyond rarity to the form and time held in each plant. ei8ht plants makes room for lasting relationships between people and plants.')}</p>
          <Link className="ep-editorial-link" to="/plants">{t('植物のラインを見る', 'Explore our plants')} <span>↗</span></Link>
        </div>
        <div className="ep-about-image">
          <img src="/img/ei8htPlants/ei8htplants_hero.jpg" alt={t('手の形をしたオブジェに載る植物', 'A plant resting on a hand-shaped object')} />
          <span>GROW / STYLE / LIVE</span>
        </div>
      </section>

      {/* 植物を選び、育て、届けるときに大切にする考え方 */}
      <section className="ep-about-principles">
        <p className="ep-editorial-kicker">02 / OUR APPROACH</p>
        <div className="ep-about-principles-grid">
          <h2>{t(<>育てる。<br />選ぶ。<br /><em>ともに暮らす。</em></>, <>Grow.<br />Choose.<br /><em>Live together.</em></>)}</h2>
          <div>
            <p>{t('植物の姿は、一株ごとに違います。葉の重なり、幹の曲線、そこに宿る時間。その個性を見つけ、育てる人へつなぐことを大切にしています。', 'Every plant has its own character: the way leaves overlap, the curve of a trunk, the time held in its form. We find those qualities and connect each plant with the person who will grow with it.')}</p>
            <p>{t('育て方に迷ったときも、植物との日々を楽しめるように。選ぶところから、その後のケアまでサポートします。', 'When questions come up, we are here to help make everyday plant care rewarding, from choosing a plant to caring for it over time.')}</p>
            <img src={TEXT_LOGO} alt={BRAND.ei8htPlants.name} />
          </div>
        </div>
      </section>
      <section className="ep-editorial-endcap">
        <span>03 / NEXT</span>
        <h2>{t('植物との出会いへ。', 'Meet the plants.')}</h2>
        <Link to="/plants">{t('植物のラインを見る', 'Discover our plants')} <span>↗</span></Link>
      </section>
    </div>
  )
}
