import { Link, useLocation } from 'react-router-dom'

const SHOP_PATHS = ['/shop', '/checkout', '/order']

const NAV_LINKS = [
  { to: '/events', label: 'Event' },
  { to: '/gallery', label: 'Gallery' },
  { to: '/concept', label: 'Concept' },
  { to: '/stockists', label: 'Stockists' },
  { to: '/contact', label: 'Contact' },
  { to: '/shop', label: 'Shop' },
]

const BRAND_LINKS = [
  { to: '/ei8htplants', label: 'ei8ht plants' },
  { to: '/habitatoides', label: 'Habitat Oides' },
  { to: '/hue', label: 'HUE by ei8ht plants' },
]

const IG_LINKS = [
  { href: 'https://www.instagram.com/ei8ht.plants/', label: '@ei8ht.plants' },
  { href: 'https://www.instagram.com/habitatoides/', label: '@habitatoides' },
  { href: 'https://www.instagram.com/hue_by.ei8ht.plants/', label: '@hue_by.ei8ht.plants' },
]

const linkStyle: React.CSSProperties = {
  fontSize: 11, letterSpacing: '1.5px', textDecoration: 'none',
  color: 'var(--c-muted)', transition: 'color 0.2s', textTransform: 'uppercase',
  fontWeight: 300,
}

export default function Footer() {
  const { pathname } = useLocation()
  const showLegal = SHOP_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))

  return (
    <footer style={{ background: 'var(--c-bg)', borderTop: '1px solid var(--c-border)', marginTop: 'auto' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 'clamp(48px, 7vw, 80px) clamp(20px, 4vw, 48px) 40px' }}>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '48px 64px', marginBottom: 56 }}>
          <div style={{ minWidth: 180 }}>
            <Link to="/">
              <img src="/img/text-logo-ei8htplants.png" alt="ei8ht plants" style={{ height: 22, display: 'block', marginBottom: 24, opacity: 0.7 }} />
            </Link>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {IG_LINKS.map(({ href, label }) => (
                <a key={href} href={href} target="_blank" rel="noopener noreferrer"
                  style={{ ...linkStyle, fontSize: 10 }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--c-ink)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--c-muted)' }}
                >
                  {label}
                </a>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '40px 56px', flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontSize: 9, letterSpacing: '2.5px', color: 'var(--c-faint)', textTransform: 'uppercase', margin: '0 0 16px' }}>Pages</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {NAV_LINKS.map(({ to, label }) => (
                  <Link key={to} to={to} style={linkStyle}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--c-ink)' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--c-muted)' }}
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </div>

            <div>
              <p style={{ fontSize: 9, letterSpacing: '2.5px', color: 'var(--c-faint)', textTransform: 'uppercase', margin: '0 0 16px' }}>Brand</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {BRAND_LINKS.map(({ to, label }) => (
                  <Link key={to} to={to} style={linkStyle}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--c-ink)' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--c-muted)' }}
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: 28, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <p style={{ fontSize: 10, color: 'var(--c-faint)', margin: 0, letterSpacing: '0.5px', lineHeight: 1.8 }}>
            ※「HABITATSTYLE / ハビタットスタイル」は Shabomaniac! の登録商標です。
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            {showLegal && (
              <Link to="/legal" style={{ ...linkStyle, fontSize: 10 }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--c-ink)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--c-muted)' }}
              >
                特定商取引法
              </Link>
            )}
            <span style={{ fontSize: 10, color: 'var(--c-faint)', letterSpacing: '0.5px' }}>
              &copy; {new Date().getFullYear()} ei8ht plants
            </span>
          </div>
        </div>

      </div>
    </footer>
  )
}
