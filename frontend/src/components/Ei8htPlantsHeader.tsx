import { Link } from 'react-router-dom'
import { TEXT_LOGO } from '../lib/brands'
import { useLang } from '../lib/lang'
import { BRAND_SITE_URLS } from '../lib/siteHost'

/**
 * ei8ht plants ブランドページ専用ヘッダー。公式サイトのグローバルナビと分ける。
 * @returns ブランド内ナビ、関連ブランド・公式サイトへのリンク、言語切り替え
 */
export default function Ei8htPlantsHeader() {
  // ナビの言語切り替えに使う現在の言語と切り替え操作
  const { lang, toggle } = useLang()
  // 現在の言語に応じて表示する切り替えボタンの短いラベル
  const languageLabel = lang === 'ja' ? 'EN' : 'JA'
  // 現在の言語に応じて読み上げる切り替えボタンの説明
  const languageAccessibleLabel = lang === 'ja' ? 'Switch to English' : '日本語に切り替える'
  return (
    <header className="ep-brand-header">
      {/* ブランド用の固定ヘッダー。デスクトップナビとスマートフォン用メニューを切り替えて表示する */}
      <Link to="/" className="ep-brand-header-logo" aria-label="ei8ht plants ブランドホーム">
        <img src={TEXT_LOGO} alt="ei8ht plants" />
      </Link>
      {/* 広い画面で表示するブランドページと系列サイトへのナビゲーション */}
      <nav className="ep-brand-header-nav" aria-label="ei8ht plants">
        <Link to="/">Home</Link>
        <Link to="/about">Our Story</Link>
        <Link to="/plants">Plants</Link>
        <a href={BRAND_SITE_URLS['habitat-oides']} target="_blank" rel="noopener noreferrer">Habitat Oides</a>
        <a href={BRAND_SITE_URLS.hue} target="_blank" rel="noopener noreferrer">HUE by ei8ht plants</a>
        <Link to="/official/shop">Shop</Link>
        <Link to="/official" className="ep-brand-header-official">Official Site <span aria-hidden="true">↗</span></Link>
        <button type="button" className="ep-brand-header-language" onClick={toggle} aria-label={languageAccessibleLabel}>{languageLabel}</button>
      </nav>
      {/* 狭い画面で使う開閉式ナビ。内部リンクを選ぶとメニューを閉じる */}
      <details className="ep-brand-header-mobile">
        <summary aria-label="ブランドメニューを開く">Menu</summary>
        <nav aria-label="ei8ht plants">
          <Link to="/" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open') }}>Home</Link>
          <Link to="/about" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open') }}>Our Story</Link>
          <Link to="/plants" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open') }}>Plants</Link>
          <a href={BRAND_SITE_URLS['habitat-oides']} target="_blank" rel="noopener noreferrer">Habitat Oides</a>
          <a href={BRAND_SITE_URLS.hue} target="_blank" rel="noopener noreferrer">HUE by ei8ht plants</a>
          <Link to="/official/shop" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open') }}>Shop</Link>
          <Link to="/official" className="ep-brand-header-official">Official Site ↗</Link>
          <button type="button" className="ep-brand-header-language" onClick={toggle} aria-label={languageAccessibleLabel}>{languageLabel}</button>
        </nav>
      </details>
    </header>
  )
}
