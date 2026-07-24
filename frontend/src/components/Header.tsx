import { useState } from 'react'
import { NavLink, Link } from 'react-router-dom'

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [brandOpen, setBrandOpen] = useState(false)

  const navLinkStyle: React.CSSProperties = {
    fontSize: 16, color: '#8a9a7e', fontWeight: 500,
    letterSpacing: '1.5px', textDecoration: 'none',
  }

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `text-text-muted hover:text-text-main transition-colors duration-300 text-base font-medium tracking-wider no-underline pb-1 border-b-2 ${
      isActive ? 'text-text-main border-text-main' : 'border-transparent'
    }`

  const navItems = (
    <>
      <NavLink to="/" end className={navLinkClass} onClick={() => setMenuOpen(false)}>HOME</NavLink>
      <NavLink to="/events" className={navLinkClass} onClick={() => setMenuOpen(false)}>EVENT</NavLink>
      <NavLink to="/gallery" className={navLinkClass} onClick={() => setMenuOpen(false)}>GALLERY</NavLink>

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <span
          style={{ ...navLinkStyle, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, userSelect: 'none', paddingBottom: 4, borderBottom: '2px solid transparent' }}
          onClick={() => setBrandOpen(!brandOpen)}
          onMouseEnter={() => setBrandOpen(true)}
          onMouseLeave={() => setBrandOpen(false)}
        >
          BRAND
          <span style={{
            display: 'inline-block', width: 5, height: 5,
            borderRight: '1.5px solid currentColor', borderBottom: '1.5px solid currentColor',
            transform: 'rotate(45deg) translateY(-2px)',
          }} />
        </span>
        {brandOpen && (
          <div
            onMouseEnter={() => setBrandOpen(true)}
            onMouseLeave={() => setBrandOpen(false)}
            style={{
              position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(247,243,236,0.98)', border: '1px solid #ddd4c0',
              boxShadow: '0 8px 32px rgba(40,35,20,0.10)', minWidth: 200,
              zIndex: 200, padding: '8px 0', borderRadius: 8,
            }}
          >
            {[
              { to: '/ei8htplants', label: 'ei8ht plants' },
              { to: '/habitatoides', label: 'Habitat Oides' },
              { to: '/hue', label: 'HUE by ei8ht plants' },
            ].map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => { setBrandOpen(false); setMenuOpen(false) }}
                style={{ display: 'block', padding: '11px 20px', fontSize: 12, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#8a9a7e', textDecoration: 'none' }}
              >
                {label}
              </NavLink>
            ))}
          </div>
        )}
      </div>

      <NavLink to="/concept" className={navLinkClass} onClick={() => setMenuOpen(false)}>CONCEPT</NavLink>
      <NavLink to="/stockists" className={navLinkClass} onClick={() => setMenuOpen(false)}>STOCKISTS</NavLink>
      <NavLink to="/collaborations" className={navLinkClass} onClick={() => setMenuOpen(false)}>COLLABORATIONS</NavLink>
      <NavLink to="/contact" className={navLinkClass} onClick={() => setMenuOpen(false)}>CONTACT</NavLink>
      <a
        href="https://ei8htplants.square.site/s/shop"
        target="_blank"
        rel="noopener noreferrer"
        style={{ ...navLinkStyle, paddingBottom: 4, borderBottom: '2px solid transparent' }}
      >
        ONLINE STORE
      </a>
    </>
  )

  return (
    <header
      style={{
        position: 'fixed', top: 0, left: 0, width: '100%',
        background: 'rgba(247,243,236,0.97)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid #b8a88a',
        boxShadow: '0 2px 16px rgba(40,35,20,0.08)',
        zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 30px', boxSizing: 'border-box', minHeight: 60,
      }}
    >
      <Link to="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
        <img
          src="/img/text-logo-ei8htplants.png"
          alt="ei8ht plants"
          style={{ height: 32, width: 'auto', objectFit: 'contain' }}
        />
      </Link>

      <button
        className="menu-btn"
        onClick={() => setMenuOpen(!menuOpen)}
        aria-label="menu"
      >
        <span style={{ display: 'block', width: 25, height: 2, background: '#1c2417', margin: '5px 0', transition: '0.3s' }} />
        <span style={{ display: 'block', width: 25, height: 2, background: '#1c2417', margin: '5px 0', transition: '0.3s' }} />
        <span style={{ display: 'block', width: 25, height: 2, background: '#1c2417', margin: '5px 0', transition: '0.3s' }} />
      </button>

      <nav className="header-nav-desktop" style={{ display: 'flex', gap: 0, alignItems: 'center' }}>
        {navItems}
      </nav>

      <nav className={`header-nav-overlay${menuOpen ? ' nav-open' : ''}`}>
        {navItems}
      </nav>

      {menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 1040, background: 'rgba(0,0,0,0.2)' }}
        />
      )}
    </header>
  )
}
