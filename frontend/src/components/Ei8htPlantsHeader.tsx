import { Link } from 'react-router-dom'
import { TEXT_LOGO } from '../lib/brands'
import { useLang } from '../lib/lang'

/** ei8ht plants ブランドトップ専用ヘッダー。公式サイトのグローバルナビと分ける。 */
export default function Ei8htPlantsHeader() {
  const { lang, toggle } = useLang()
  const languageLabel = lang === 'ja' ? 'EN' : 'JA'
  const languageAccessibleLabel = lang === 'ja' ? 'Switch to English' : '日本語に切り替える'
  return (
    <header className="ep-brand-header">
      <Link to="/" className="ep-brand-header-logo" aria-label="ei8ht plants ブランドホーム">
        <img src={TEXT_LOGO} alt="ei8ht plants" />
      </Link>
      <nav className="ep-brand-header-nav" aria-label="ei8ht plants">
        <Link to="/">Home</Link>
        <a href="#concept">Concept</a>
        <a href="#store">Store</a>
        <Link to="/brands">Our Brands</Link>
        <Link to="/official" className="ep-brand-header-official">Official Site <span aria-hidden="true">↗</span></Link>
        <button type="button" className="ep-brand-header-language" onClick={toggle} aria-label={languageAccessibleLabel}>{languageLabel}</button>
      </nav>
      <details className="ep-brand-header-mobile">
        <summary aria-label="ブランドメニューを開く">Menu</summary>
        <nav aria-label="ei8ht plants">
          <Link to="/" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open') }}>Home</Link>
          <a href="#concept" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open') }}>Concept</a>
          <a href="#store" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open') }}>Store</a>
          <Link to="/brands" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open') }}>Our Brands</Link>
          <Link to="/official" className="ep-brand-header-official">Official Site ↗</Link>
          <button type="button" className="ep-brand-header-language" onClick={toggle} aria-label={languageAccessibleLabel}>{languageLabel}</button>
        </nav>
      </details>
    </header>
  )
}
