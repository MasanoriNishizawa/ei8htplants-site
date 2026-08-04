import { Link, NavLink, useLocation } from 'react-router-dom'
import { useCart } from '../lib/cart'

const SANS = "'Noto Sans JP', sans-serif"

export default function StoreHeader() {
  const { items } = useCart()
  const cartCount = items.reduce((s, i) => s + i.quantity, 0)
  const { pathname } = useLocation()
  const isCheckout = pathname === '/checkout' || pathname === '/order/complete'

  return (
    <header style={{
      position: 'fixed', top: 0, left: 0, width: '100%',
      background: 'var(--c-surface)',
      borderBottom: '1px solid var(--c-border)',
      zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 clamp(16px, 3vw, 32px)', boxSizing: 'border-box', height: 56,
    }}>
      {/* 左: ロゴ + ブランドサイトへ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <img
            src="/img/text-logo-ei8htplants.png"
            alt="ei8ht plants"
            style={{ height: 26, width: 'auto', objectFit: 'contain' }}
          />
        </Link>
        <nav style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          {[{ to: '/shop', label: 'Shop' }, { to: '/journal', label: 'Journal' }].map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              style={({ isActive }) => ({
                fontFamily: SANS, fontSize: 10, letterSpacing: '2px', textDecoration: 'none', textTransform: 'uppercase',
                color: isActive ? 'var(--c-ink)' : 'var(--c-muted)',
                borderBottom: isActive ? '1px solid var(--c-ink)' : '1px solid transparent',
                paddingBottom: 2,
              })}
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* 右: ブランドサイトへ戻る + カート */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <Link
          to="/"
          style={{ fontFamily: SANS, fontSize: 10, letterSpacing: '1.5px', color: 'var(--c-surface)', textDecoration: 'none', textTransform: 'uppercase', whiteSpace: 'nowrap', background: 'var(--c-muted)', padding: '5px 12px' }}
        >
          Official Site
        </Link>
        {!isCheckout && cartCount > 0 && (
          <Link
            to="/checkout"
            style={{ fontFamily: SANS, fontSize: 11, letterSpacing: '1px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, background: 'var(--c-ink)', color: '#fffdf9', padding: '6px 14px' }}
          >
            Cart &nbsp;<span style={{ fontVariantNumeric: 'tabular-nums' }}>{cartCount}</span>
          </Link>
        )}
        {isCheckout && cartCount > 0 && (
          <span style={{ fontFamily: SANS, fontSize: 11, letterSpacing: '1px', color: 'var(--c-muted)' }}>
            {cartCount} item{cartCount > 1 ? 's' : ''}
          </span>
        )}
      </div>
    </header>
  )
}
