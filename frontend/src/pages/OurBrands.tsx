import { useEffect, useState } from 'react'
import PageMeta from '../components/PageMeta'
import { useT } from '../lib/lang'
import { BRAND_SHOWCASES } from '../lib/brandShowcase'
import { api } from '../lib/api'

/**
 *  ei8ht plantsが展開する3ブランドを紹介する一覧ページ。
 * @returns ei8ht plants グループのブランド一覧ページの React 要素。
 */
export default function OurBrands() {
  // 現在の表示言語に合わせて文言を選ぶ翻訳関数
  const t = useT()
  // HUE のブランドカードに表示する画像 URL。サイト設定から取得する
  const [hueImage, setHueImage] = useState('')

  useEffect(() => {
    // 1. 画面を離れた後に取得結果を反映しないための有効フラグを立てる
    let active = true
    // 2. HUE の画像 URL を取得し、画面が有効な間だけ state へ反映する
    api.siteAssets.get('hue-color-01')
      .then(({ url }) => { if (active) setHueImage(url) })
      .catch(() => {})
    // 3. 画面を離れるときにフラグを下げ、遅れて届く結果の反映を止める
    return () => { active = false }
  }, [])

  return (
    <>
      <PageMeta
        title="Our Brands"
        description={t('植物との向き合い方から生まれた、ei8ht plantsの3つのブランドをご紹介します。', 'Discover three distinct brands shaped by different ways of living with plants.')}
      />
      {/* ブランド一覧への導入と、一覧セクションへのスクロール案内 */}
      <section className="our-brands-hero">
        <div className="our-brands-hero-copy">
          <p className="our-brands-kicker">ei8ht plants / BOTANICAL WORLDS</p>
          <h1>Our<br /><em>Brands.</em></h1>
          <p>{t('植物のかたちを集め、景色を仕立て、暮らしに迎える。植物とのさまざまな関係から生まれた3つのブランドです。', 'Collecting unusual forms, shaping living landscapes, and making room for plants at home. Three brands, each with its own way of seeing plants.')}</p>
          <a href="#brand-collection" className="our-brands-scroll">{t('ブランドを知る', 'MEET OUR BRANDS')} <span>↓</span></a>
        </div>
        <div className="our-brands-hero-stamp" aria-hidden="true">
          <span>GROW / STYLE / LIVE</span>
          <i />
          <b>03</b>
        </div>
      </section>

      {/* 3ブランドの特徴と各ブランドページへのリンク */}
      <section className="our-brands-collection" id="brand-collection" aria-label={t('ブランド一覧', 'Brand collection')}>
        <header className="our-brands-section-heading">
          <p className="home-section-index">01 / OUR BRANDS</p>
          <h2>{t('それぞれの、植物との暮らし。', 'Different ways to live with plants.')}</h2>
        </header>
        <div className="our-brands-grid">
          {BRAND_SHOWCASES.map((brand, index) => {
            // HUE は管理画面の画像、それ以外はブランド情報に登録された画像
            const image = index === 2 ? hueImage : brand.img
            return (
              <a
                className={`our-brand-card our-brand-card--${index + 1}`}
                href={brand.to}
                key={brand.to}
                target="_blank"
                rel="noopener noreferrer"
                style={{ background: brand.bg }}
              >
                {image && <img className="our-brand-card-photo" src={image} alt="" loading="lazy" />}
                <span className="our-brand-card-shade" aria-hidden="true" />
                {!image && <span className="our-brand-card-orbit" aria-hidden="true" />}
                <span className="our-brand-number">0{index + 1}</span>
                <div className="our-brand-card-content">
                  <img className="our-brand-logo" src={brand.logo} alt="" />
                  <p>{t(brand.descriptorJa, brand.descriptorEn)}</p>
                  <h3>{brand.name}</h3>
                  <span className="our-brand-description">{t(brand.descJa, brand.descEn)}</span>
                  <span className="our-brand-visit">{t('ブランドサイトへ', 'VISIT BRAND')} <b>↗</b></span>
                </div>
              </a>
            )
          })}
        </div>
      </section>

      {/* ブランド全体のメッセージと ei8ht plants トップへのリンク */}
      <section className="our-brands-note">
        <p>{t('育て、仕立て、ともに暮らす。', 'GROW IT. STYLE IT. LIVE WITH IT.')}</p>
        <a href="/">ei8ht plants <span>↗</span></a>
      </section>
    </>
  )
}
