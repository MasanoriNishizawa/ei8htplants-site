import { Link } from 'react-router-dom'
import PageMeta from '../../components/PageMeta'
import { useT } from '../../lib/lang'

// 公開ページに並べる植物ラインごとの番号・名称・説明・マーク
const LINES = [
  { number: '01', name: 'Agave', ja: 'アガベ', copyJa: '鋸歯や葉先がつくる力強いシルエット。育つ環境によって変わる表情も魅力です。', copyEn: 'Sculptural rosettes, defined edges, and forms shaped by their growing conditions.', mark: 'A' },
  { number: '02', name: 'Caudex', ja: '塊根植物', copyJa: '幹や根に蓄えられた時間を楽しむ植物。芽吹きや休眠を通じて季節を感じます。', copyEn: 'Plants that hold time in their trunks and roots, revealing the seasons through growth and dormancy.', mark: 'C' },
  { number: '03', name: 'Shrubs', ja: '灌木・樹木', copyJa: '枝ぶりや葉の重なりに、自然の景色を感じるライン。鉢と合わせて仕立てます。', copyEn: 'Branching forms and layered foliage bring a sense of landscape into a pot.', mark: 'S' },
  { number: '04', name: 'Succulents', ja: '多肉植物', copyJa: '小さな姿に詰まった多彩なフォルム。ひと鉢から始めやすい植物も揃えています。', copyEn: 'A wide range of compact forms, including plants that are easy to begin with.', mark: '∞' },
]

/**
 *  ei8ht plantsが扱う植物のラインを案内するページ。
 * @returns ei8ht plants の植物ライン紹介ページの React 要素。
 */
export default function Ei8htPlantsPlants() {
  // 現在の表示言語に合わせて文言を選ぶ翻訳関数
  const t = useT()

  return (
    <div className="ep-editorial-page ep-plants-page">
      <PageMeta
        title={t('植物のライン', 'Plants')}
        description={t('アガベ、塊根植物、灌木、多肉植物。ei8ht plantsが扱うビザールプランツをご紹介します。', 'Explore the agaves, caudiciform plants, shrubs, and succulents at ei8ht plants.')}
      />
      {/* 植物ラインを紹介するページの導入 */}
      <section className="ep-plants-intro">
        <p className="ep-editorial-kicker">01 / PLANT LINES</p>
        <h1>{t(<>育つ姿まで、<br /><em>好きになる。</em></>, <>Love the form.<br /><em>Enjoy the journey.</em></>)}</h1>
        <p className="ep-editorial-lead">{t('かたちも、育つ速さも、それぞれ違う。植物との暮らしに迎えたい一株を、個性豊かなラインから見つけてください。', 'Each plant has its own form and pace. Find a distinctive plant to welcome into your life.')}</p>
        <div className="ep-plants-index" aria-label={t('植物の種類', 'Plant lines')}>
          {LINES.map((line) => <a key={line.number} href={`#plant-${line.number}`}>{line.number} <span>{t(line.ja, line.name)}</span></a>)}
        </div>
      </section>
      {/* 扱う植物をラインごとに並べた紹介カード */}
      <section className="ep-plant-lines" aria-label={t('ei8ht plantsの植物', 'Plants at ei8ht plants')}>
        {LINES.map((line, index) => (
          <article className={`ep-plant-line ep-plant-line--${index + 1}`} id={`plant-${line.number}`} key={line.number}>
            <div className="ep-plant-line-art" aria-hidden="true"><span>{line.mark}</span><i /><b /></div>
            <div className="ep-plant-line-copy">
              <p className="ep-editorial-kicker">{line.number} / {t(line.ja, line.name)}</p>
              <h2>{line.name}<em>{t(line.ja, line.name)}</em></h2>
              <p>{t(line.copyJa, line.copyEn)}</p>
            </div>
          </article>
        ))}
      </section>
      <section className="ep-editorial-endcap ep-plants-endcap">
        <span>02 / FIND YOUR PLANT</span>
        <h2>{t('今出会える植物を探す。', 'Find your next plant.')}</h2>
        <Link to="/official/shop">{t('オンラインストアへ', 'Visit the online store')} <span>↗</span></Link>
      </section>
    </div>
  )
}
