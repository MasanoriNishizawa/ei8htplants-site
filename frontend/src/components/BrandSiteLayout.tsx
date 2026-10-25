import { Link, Outlet } from 'react-router-dom'
import { useLang } from '../lib/lang'
import Analytics from './Analytics'
import PageLoading from './PageLoading'
import { Suspense, useEffect } from 'react'
import type { SiteKey } from '../lib/siteHost'

export interface BrandSiteConfig {
  key: Exclude<SiteKey, 'ei8htplants'>
  name: string
  descriptor: string
  origin: string
  logo: string
  instagramUrl: string
  instagramHandle: string
  accent: string
  sections: { href: string; label: string }[]
}

/** 独立ドメインのブランド用レイアウト。各サイトの設定に応じたヘッダー・フッターを表示する。 */
export default function BrandSiteLayout({ site }: { site: BrandSiteConfig }) {
  const { lang, toggle: toggleLang } = useLang()

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
      <header className="brand-site-header" style={{ position: 'fixed', zIndex: 1000, inset: '0 0 auto', height: 72, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, padding: '0 clamp(18px, 5vw, 64px)', background: 'rgba(255,255,255,.96)', borderBottom: '2px solid var(--brand-accent)', backdropFilter: 'blur(12px)' }}>
        <Link to="/" aria-label={`${site.name} home`} style={{ display: 'flex', alignItems: 'center', gap: 13, textDecoration: 'none', color: 'var(--c-ink)', minWidth: 0 }}>
          <img src={site.logo} alt="" style={{ width: 42, height: 42, objectFit: 'contain' }} />
          <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
            <strong style={{ fontSize: 14, fontWeight: 500, letterSpacing: '.12em', whiteSpace: 'nowrap' }}>{site.name}</strong>
            <small style={{ marginTop: 4, fontSize: 9, letterSpacing: '.16em', color: 'var(--c-muted)', textTransform: 'uppercase' }}>{site.descriptor}</small>
          </span>
        </Link>
        <nav aria-label="Main navigation" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 'clamp(12px, 3vw, 32px)' }}>
          {site.sections.map((section) => <a key={section.href} href={section.href} style={{ color: 'var(--c-ink)', fontSize: 11, letterSpacing: '.12em', textDecoration: 'none', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{section.label}</a>)}
          <button type="button" className="header-lang-btn" onClick={toggleLang} aria-label={lang === 'ja' ? 'Switch to English' : '日本語に切り替える'}>{lang === 'ja' ? 'EN' : 'JA'}</button>
        </nav>
      </header>
      <main style={{ paddingTop: 72, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Suspense fallback={<PageLoading />}><Outlet /></Suspense>
      </main>
      <footer style={{ marginTop: 'auto', padding: '44px clamp(20px, 5vw, 64px)', background: '#fff', borderTop: '1px solid var(--c-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 18, maxWidth: 1280, margin: '0 auto' }}>
          <Link to="/" style={{ color: 'var(--c-ink)', textDecoration: 'none', fontSize: 12, letterSpacing: '.12em' }}>{site.name}</Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
            <a href={site.instagramUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--c-muted)', textDecoration: 'none', fontSize: 11 }}>{site.instagramHandle} ↗</a>
            <a href="https://ei8htplants.com/privacy" style={{ color: 'var(--c-muted)', textDecoration: 'none', fontSize: 11 }}>Privacy</a>
            <span style={{ color: 'var(--c-faint)', fontSize: 10 }}>© {new Date().getFullYear()} {site.name}</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
