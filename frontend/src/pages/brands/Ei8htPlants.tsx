import { Link } from 'react-router-dom'
import PageMeta from '../../components/PageMeta'
import { useT } from '../../lib/lang'
import { BRAND } from '../../lib/brands'
import { usePageImageAssets } from '../../lib/usePageImageAssets'
import { usePageImageEditMode } from '../../lib/pageImageEdit'
import { EI8HT_PAGE_SLOTS } from '../../lib/pageImageSlots'
import PageImageSlotTarget from '../../components/PageImageSlotTarget'

/** 枠の localSrc（保存した URL がない・一括取得に失敗したときに出す、プロジェクト内の画像）。キー → パス */
const LOCAL_SRC: Readonly<Record<string, string>> = Object.fromEntries(
  EI8HT_PAGE_SLOTS.map(({ key, localSrc }) => [key, localSrc ?? '']),
)

/**
 * ei8ht plants のブランドトップを描画し、植物とブランドの考え方へ案内する。
 * メインの写真とロゴ（文字）は、管理画面「ページ画像の編集」で保存した URL → プロジェクト内の画像（localSrc）の順で出す。
 * 管理画面のプレビュー（編集モード）では、2つの画像に枠（PageImageSlotTarget）を重ね、草稿の URL を出す。
 * @returns ei8ht plants ブランドトップの React 要素。
 */
export default function Ei8htPlants() {
  // 現在の表示言語に合わせて文言を選ぶ翻訳関数
  const t = useT()
  // 管理画面で保存した画像 URL（編集モードなら草稿）から、枠ごとの表示画像を返す関数
  const { resolve } = usePageImageAssets('ei8htplants')
  // 管理画面のプレビュー（編集モード）か
  const editMode = usePageImageEditMode()
  // メインの写真とロゴの URL（保存した URL → localSrc の順）
  const heroSrc = resolve('ei8ht-hero') ?? LOCAL_SRC['ei8ht-hero']
  const wordmarkSrc = resolve('ei8ht-wordmark') ?? LOCAL_SRC['ei8ht-wordmark']
  // ロゴの画像（編集モードでは、枠を重ねられるよう包む要素の中に入れる）
  const wordmark = <img className="ep-home-wordmark" src={wordmarkSrc} alt={BRAND.ei8htPlants.name} />

  return (
    <div className="ep-editorial-page ep-home-page">
      <PageMeta
        title="ei8ht plants"
        description={t('アガベ、塊根植物、灌木。一株ごとに異なる個性を持つ植物を育て、植物との暮らしを提案します。', 'Agaves, caudiciform plants, and shrubs, grown and selected for their singular character.')}
      />

      {/* ブランドの考え方と植物ラインへの入口を示すヒーロー */}
      <section className="ep-home-hero" aria-labelledby="ep-home-title">
        <figure className="ep-home-visual">
          <img src={heroSrc} alt={t('手のオブジェに載る小さなアガベ', 'A small agave resting on a hand-shaped object')} />
          <figcaption>GROW / SELECT / LIVE</figcaption>
          {/* 編集モードのときだけ、写真の上に枠を重ねる（ふつうの公開ページでは何も出さない） */}
          <PageImageSlotTarget slotKey="ei8ht-hero" />
        </figure>
        <div className="ep-home-copy">
          <p className="ep-home-kicker">BIZARRE PLANTS <span>—</span> EI8HT PLANTS</p>
          {/* ロゴ（文字）。編集モードでは包む要素に枠を重ねる */}
          {editMode ? (
            <span className="page-edit-frame">
              {wordmark}
              <PageImageSlotTarget slotKey="ei8ht-wordmark" />
            </span>
          ) : wordmark}
          <h1 id="ep-home-title">{t(<>ひと株の個性と、<br /><em>暮らす。</em></>, <>Live with<br /><em>a plant’s character.</em></>)}</h1>
          <p className="ep-home-lead">{t('アガベ、塊根植物、灌木。姿も育つ時間も異なる植物を、自ら育て、一株ずつの魅力を届けています。', 'Agaves, caudiciform plants, and shrubs. We grow distinctive plants and share the character of each individual.')}</p>
          <div className="ep-home-actions">
            <Link className="ep-home-primary" to="/plants">{t('植物のラインを見る', 'Explore the plants')} <span aria-hidden="true">↗</span></Link>
            <Link className="ep-home-secondary" to="/about">{t('ei8ht plantsについて', 'Our approach')}</Link>
          </div>
          <p className="ep-home-index"><span>01</span> / GROW WITH CHARACTER</p>
        </div>
      </section>

      {/* 一株ごとの個性を大切にするブランドの姿勢 */}
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

      {/* 植物ラインからオンラインストアへ進む案内 */}
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
