import { Link } from 'react-router-dom'
import PageMeta from '../../components/PageMeta'
import { useT } from '../../lib/lang'
import { BRAND, TEXT_LOGO } from '../../lib/brands'
import { usePageImageAssets } from '../../lib/usePageImageAssets'
import { usePageImageEditMode } from '../../lib/pageImageEdit'
import { EI8HT_ABOUT_HERO_SLOT } from '../../lib/pageImageSlots'
import PageImageSlotTarget from '../../components/PageImageSlotTarget'

/**
 *  ei8ht plantsのブランド背景を紹介するページ。
 *  メインの写真（ei8ht-about-hero）と文字ロゴ（トップページと共通の ei8ht-wordmark）は、
 *  管理画面「ページ画像の編集」で保存した URL → プロジェクト内の画像（localSrc）の順で出す。
 *  管理画面のプレビュー（編集モード）では、2つの画像に枠（PageImageSlotTarget）を重ね、草稿の URL を出す。
 * @returns ei8ht plants のブランド紹介ページの React 要素。
 */
export default function Ei8htPlantsAbout() {
  // 現在の表示言語に合わせて文言を選ぶ翻訳関数
  const t = useT()
  // 管理画面で保存した画像 URL（編集モードなら草稿）から、枠ごとの表示画像を返す関数（prefix=ei8ht- の一括取得）
  const { resolve } = usePageImageAssets('ei8htplants')
  // 管理画面のプレビュー（編集モード）か
  const editMode = usePageImageEditMode()
  // メインの写真と文字ロゴの URL（保存した URL → localSrc の順）
  const heroSrc = resolve(EI8HT_ABOUT_HERO_SLOT.key) ?? EI8HT_ABOUT_HERO_SLOT.localSrc ?? ''
  const wordmarkSrc = resolve('ei8ht-wordmark') ?? TEXT_LOGO
  // 文字ロゴの画像（編集モードでは、枠を重ねられるよう包む要素の中に入れる）
  const wordmark = <img src={wordmarkSrc} alt={BRAND.ei8htPlants.name} />

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
          <img src={heroSrc} alt={t('手の形をしたオブジェに載る植物', 'A plant resting on a hand-shaped object')} />
          <span>GROW / STYLE / LIVE</span>
          {/* 編集モードのときだけ、写真の上に枠を重ねる（ふつうの公開ページでは何も出さない） */}
          <PageImageSlotTarget slotKey={EI8HT_ABOUT_HERO_SLOT.key} />
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
            {/* 文字ロゴ。編集モードでは包む要素に枠を重ねる（トップページと同じ枠） */}
            {editMode ? (
              <span className="page-edit-frame">
                {wordmark}
                <PageImageSlotTarget slotKey="ei8ht-wordmark" />
              </span>
            ) : wordmark}
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
