import { useState, useEffect } from 'react'
import { NavLink, Link } from 'react-router-dom'

const BRAND_ITEMS = [
  { to: '/ei8htplants', label: 'ei8ht plants' },
  { to: '/habitatoides', label: 'Habitat Oides' },
  { to: '/hue', label: 'HUE by ei8ht plants' },
]

const NAV_ITEMS = [
  { to: '/', label: 'Home', end: true },
  { to: '/events', label: 'Event' },
  { to: '/gallery', label: 'Gallery' },
  { to: '/concept', label: 'Concept' },
  { to: '/stockists', label: 'Stockists' },
  { to: '/collaborations', label: 'Collabs' },
  { to: '/contact', label: 'Contact' },
]

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [brandOpen, setBrandOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 4)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  const navItemStyle = (isActive: boolean): React.CSSProperties => ({
    fontSize: 11,
    fontWeight: 300,
    letterSpacing: '0.14em',
    textDecoration: 'none',
    padding: '4px 0',
    color: isActive ? 'var(--c-ink)' : 'var(--c-muted)',
    borderBottom: isActive ? '1px solid var(--c-ink)' : '1px solid transparent',
    transition: 'color 0.2s, border-color 0.2s',
    textTransform: 'uppercase' as const,
    whiteSpace: 'nowrap' as const,
  })

  const desktopNav = (
    <>
      {NAV_ITEMS.map(({ to, label, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          style={({ isActive }) => navItemStyle(isActive)}
        >
          {label}
        </NavLink>
      ))}

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <span
          style={{ ...navItemStyle(false), cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, userSelect: 'none' }}
          onClick={() => setBrandOpen(!brandOpen)}
          onMouseEnter={() => setBrandOpen(true)}
          onMouseLeave={() => setBrandOpen(false)}
        >
          Brand
          <span style={{
            display: 'inline-block', width: 4, height: 4,
            borderRight: '1px solid currentColor', borderBottom: '1px solid currentColor',
            transform: 'rotate(45deg) translateY(-2px)',
          }} />
        </span>
        {brandOpen && (
          <div
            onMouseEnter={() => setBrandOpen(true)}
            onMouseLeave={() => setBrandOpen(false)}
            style={{
              position: 'absolute', top: 'calc(100% + 14px)', left: '50%',
              transform: 'translateX(-50%)',
              background: 'var(--c-surface)',
              border: '1px solid var(--c-border)',
              minWidth: 190, zIndex: 200, padding: '6px 0',
            }}
          >
            {BRAND_ITEMS.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setBrandOpen(false)}
                style={({ isActive }) => ({
                  display: 'block', padding: '10px 20px',
                  fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase',
                  textDecoration: 'none', fontWeight: 300,
                  color: isActive ? 'var(--c-ink)' : 'var(--c-muted)',
                  transition: 'color 0.2s',
                })}
              >
                {label}
              </NavLink>
            ))}
          </div>
        )}
      </div>

      <Link
        to="/shop"
        style={{
          fontSize: 11, fontWeight: 300, letterSpacing: '0.14em',
          textDecoration: 'none', padding: '5px 14px',
          border: '1px solid var(--c-ink)', color: 'var(--c-ink)',
          whiteSpace: 'nowrap', transition: 'background 0.2s, color 0.2s',
          textTransform: 'uppercase',
        }}
        onMouseEnter={(e) => {
          ;(e.currentTarget as HTMLAnchorElement).style.background = 'var(--c-ink)'
          ;(e.currentTarget as HTMLAnchorElement).style.color = 'var(--c-bg)'
        }}
        onMouseLeave={(e) => {
          ;(e.currentTarget as HTMLAnchorElement).style.background = 'transparent'
          ;(e.currentTarget as HTMLAnchorElement).style.color = 'var(--c-ink)'
        }}
      >
        Shop
      </Link>
    </>
  )

  return (
    <>
      <header
        style={{
          position: 'fixed', top: 0, left: 0, width: '100%',
          background: 'var(--c-bg)',
          borderBottom: scrolled ? '1px solid var(--c-border)' : '1px solid transparent',
          zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 clamp(20px, 4vw, 48px)', boxSizing: 'border-box', height: 64,
          transition: 'border-color 0.3s',
        }}
      >
        <Link to="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <img
            src="/img/text-logo-ei8htplants.png"
            alt="ei8ht plants"
            style={{ height: 26, width: 'auto', objectFit: 'contain' }}
          />
        </Link>

        <nav className="header-nav-desktop" style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          {desktopNav}
        </nav>

        <button
          className="menu-btn"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={menuOpen ? 'close menu' : 'open menu'}
          style={{ padding: 8, zIndex: 1100 }}
        >
          <span style={{
            display: 'block', width: 22, height: 1,
            background: 'var(--c-ink)',
            transition: 'transform 0.35s cubic-bezier(.22,1,.36,1)',
            transform: menuOpen ? 'translateY(4.5px) rotate(45deg)' : 'none',
          }} />
          <span style={{
            display: 'block', height: 1,
            background: 'var(--c-ink)',
            transition: 'transform 0.35s cubic-bezier(.22,1,.36,1), width 0.35s cubic-bezier(.22,1,.36,1)',
            width: menuOpen ? 22 : 11,
            marginTop: 8,
            transform: menuOpen ? 'translateY(-4.5px) rotate(-45deg)' : 'none',
          }} />
        </button>
      </header>

      {/* モバイルオーバーレイ */}
      <div
        onClick={() => setMenuOpen(false)}
        style={{
          position: 'fixed', inset: 0, zIndex: 1040,
          background: 'rgba(66,66,66,0.25)',
          opacity: menuOpen ? 1 : 0,
          visibility: menuOpen ? 'visible' : 'hidden',
          transition: 'opacity 0.35s, visibility 0.35s',
          backdropFilter: menuOpen ? 'blur(2px)' : 'none',
        }}
      />
      <nav
        style={{
          position: 'fixed', top: 0, right: 0, height: '100vh',
          width: 'min(320px, 85vw)',
          background: 'var(--c-surface)',
          zIndex: 1050,
          display: 'flex', flexDirection: 'column',
          padding: '96px 40px 48px',
          gap: 32,
          transform: menuOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.4s cubic-bezier(.22,1,.36,1)',
          overflowY: 'auto',
        }}
      >
        {NAV_ITEMS.map(({ to, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => setMenuOpen(false)}
            style={({ isActive }) => ({
              fontSize: 13, fontWeight: 300, letterSpacing: '0.14em',
              textDecoration: 'none', textTransform: 'uppercase',
              color: isActive ? 'var(--c-ink)' : 'var(--c-muted)',
              borderBottom: isActive ? '1px solid var(--c-ink)' : '1px solid transparent',
              paddingBottom: 4, display: 'inline-block',
              transition: 'color 0.2s',
            })}
          >
            {label}
          </NavLink>
        ))}
        <div style={{ height: '1px', background: 'var(--c-border)', margin: '4px 0' }} />
        {BRAND_ITEMS.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => setMenuOpen(false)}
            style={({ isActive }) => ({
              fontSize: 13, fontWeight: 300, letterSpacing: '0.14em',
              textDecoration: 'none', textTransform: 'uppercase',
              color: isActive ? 'var(--c-ink)' : 'var(--c-muted)',
              transition: 'color 0.2s',
            })}
          >
            {label}
          </NavLink>
        ))}
        <div style={{ height: '1px', background: 'var(--c-border)', margin: '4px 0' }} />
        <NavLink
          to="/shop"
          onClick={() => setMenuOpen(false)}
          style={({ isActive }) => ({
            fontSize: 13, fontWeight: 300, letterSpacing: '0.14em',
            textDecoration: 'none', textTransform: 'uppercase',
            color: isActive ? 'var(--c-ink)' : 'var(--c-muted)',
            transition: 'color 0.2s',
          })}
        >
          Shop
        </NavLink>
      </nav>
    </>
  )
}
