import { Link, Outlet } from 'react-router-dom'
import { useLang } from '../lib/lang'
import Analytics from './Analytics'
import PageLoading from './PageLoading'
import { Suspense, useEffect } from 'react'
import { BRAND } from '../lib/brands'
import { BRAND_SITE_URLS, type SiteKey } from '../lib/siteHost'

export interface BrandSiteConfig {
  key: Exclude<SiteKey, 'ei8htplants'>
  name: string
  descriptor: string
  descriptorEn?: string
  origin: string
  logo: string
  instagramUrl: string
  instagramHandle: string
  accent: string
  sections: { href: string; label: string; labelJa?: string }[]
}

/** 独立ドメインのブランド用レイアウト。各サイトの設定に応じたヘッダー・フッターを表示する。 */
export default function BrandSiteLayout({ site }: { site: BrandSiteConfig }) {
  const { lang, toggle: toggleLang } = useLang()
  const brandLinks = [
    { key: 'ei8htplants', label: BRAND.ei8htPlants.name, href: BRAND_SITE_URLS.ei8htplants },
    { key: 'habitat-oides', label: BRAND.habitatOides.name, href: BRAND_SITE_URLS['habitat-oides'] },
    { key: 'hue', label: 'HUE by ei8ht plants', href: BRAND_SITE_URLS.hue },
  ] as const

  useEffect(() => {
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (icon) icon.href = site.logo
    const appleIcon = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')
    if (appleIcon) appleIcon.href = site.logo
    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (themeColor) themeColor.content = site.accent
  }, [site.logo, site.accent])

  return (
    <div className={`brand-site brand-site-${site.key}`} style={{ '--brand-accent': site.accent } as React.CSSProperties}>
      <Analytics />
      <header className={`brand-site-header brand-site-header--${site.key}`}>
        <a className="brand-site-wordmark" href={site.origin} aria-label={`${site.name} home`}>
          <img src={site.logo} alt="" />
          <span><strong>{site.key === 'hue' ? 'HUE' : 'HABITAT OIDES'}</strong><small>{lang === 'ja' ? site.descriptor : site.descriptorEn ?? site.descriptor}</small></span>
        </a>
        <nav className="brand-site-nav" aria-label={`${site.name} navigation`}>
          {site.sections.map((section) => <a key={section.href} href={section.href}>{lang === 'ja' ? section.labelJa ?? section.label : section.label}</a>)}
        </nav>
        <nav className="brand-site-switcher" aria-label="Other brand sites">
          {brandLinks.filter((brand) => brand.key !== site.key).map((brand) => (
            <a key={brand.key} href={brand.href} target="_blank" rel="noopener noreferrer">{brand.label}</a>
          ))}
        </nav>
        <button type="button" className="brand-site-lang" onClick={toggleLang} aria-label={lang === 'ja' ? 'Switch to English' : '日本語に切り替える'}>{lang === 'ja' ? 'EN' : 'JA'}</button>
      </header>
      <main className="brand-site-main">
        <Suspense fallback={<PageLoading />}><Outlet /></Suspense>
      </main>
      <footer className={`brand-site-footer brand-site-footer--${site.key}`}>
        <div className="brand-site-footer-inner">
          <Link to="/" className="brand-site-footer-title">{site.name}</Link>
          <nav aria-label="Brand websites">
            {brandLinks.map((brand) => <a key={brand.key} href={brand.href} target="_blank" rel="noopener noreferrer">{brand.label}</a>)}
          </nav>
          <div className="brand-site-footer-meta">
            <a href={site.instagramUrl} target="_blank" rel="noopener noreferrer">{site.instagramHandle} ↗</a>
            <a href="https://ei8htplants.com/official/privacy">{lang === 'ja' ? 'プライバシーポリシー' : 'Privacy'}</a>
            <span>© {new Date().getFullYear()} {site.name}</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
