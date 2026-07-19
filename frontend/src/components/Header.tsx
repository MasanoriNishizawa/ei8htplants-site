import { useState } from 'react'
import { NavLink, Link } from 'react-router-dom'

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [brandOpen, setBrandOpen] = useState(false)

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `text-text-muted hover:text-text-main transition-colors duration-300 text-base font-medium tracking-wider no-underline pb-1 border-b-2 ${
      isActive ? 'text-text-main border-text-main' : 'border-transparent'
    }`

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
          src="/img/text-logo-ei8htplants.jpeg"
          alt="ei8ht plants"
          style={{ height: 32, width: 'auto', objectFit: 'contain', mixBlendMode: 'multiply', filter: 'contrast(1.1)' }}
        />
      </Link>

      <button
        className="md:hidden"
        onClick={() => setMenuOpen(!menuOpen)}
        style={{ display: 'none', cursor: 'pointer', background: 'none', border: 'none', padding: 5 }}
        aria-label="menu"
      >
        <span style={{ display: 'block', width: 25, height: 2, background: '#1c2417', margin: '5px 0', transition: '0.3s' }} />
        <span style={{ display: 'block', width: 25, height: 2, background: '#1c2417', margin: '5px 0', transition: '0.3s' }} />
        <span style={{ display: 'block', width: 25, height: 2, background: '#1c2417', margin: '5px 0', transition: '0.3s' }} />
      </button>

      <nav style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
        <NavLink to="/" end className={navLinkClass}>HOME</NavLink>
        <NavLink to="/events" className={navLinkClass}>EVENT</NavLink>

        <div
          style={{ position: 'relative', paddingBottom: 16, marginBottom: -16 }}
          onMouseEnter={() => setBrandOpen(true)}
          onMouseLeave={() => setBrandOpen(false)}
        >
          <span
            style={{
              fontSize: 16, color: '#8a9a7e', fontWeight: 500, letterSpacing: '1.5px',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, userSelect: 'none',
            }}
          >
            BRAND
            <span style={{
              display: 'inline-block', width: 5, height: 5,
              borderRight: '1.5px solid currentColor', borderBottom: '1.5px solid currentColor',
              transform: 'rotate(45deg) translateY(-2px)',
            }} />
          </span>
          {brandOpen && (
            <div style={{
              position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(247,243,236,0.98)', border: '1px solid #ddd4c0',
              boxShadow: '0 8px 32px rgba(40,35,20,0.10)', minWidth: 200,
              zIndex: 200, padding: '8px 0', borderRadius: 8,
            }}>
              {[
                { to: '/ei8htplants', label: 'ei8ht plants' },
                { to: '/habitatoides', label: 'Habitat Oides' },
                { to: '/hue', label: 'HUE by ei8ht plants' },
              ].map(({ to, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  style={{ display: 'block', padding: '11px 20px', fontSize: 12, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#8a9a7e', textDecoration: 'none' }}
                >
                  {label}
                </NavLink>
              ))}
            </div>
          )}
        </div>

        <NavLink to="/concept" className={navLinkClass}>CONCEPT</NavLink>
        <NavLink to="/contact" className={navLinkClass}>CONTACT</NavLink>
        <a
          href="https://ei8htplants.square.site/s/shop"
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 16, color: '#8a9a7e', fontWeight: 500, letterSpacing: '1.5px', textDecoration: 'none' }}
        >
          ONLINE STORE
        </a>
      </nav>
    </header>
  )
}
