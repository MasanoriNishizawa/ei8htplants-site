import { Outlet, NavLink } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const NAV_ITEMS = [
  { to: '/admin', label: 'ダッシュボード', end: true },
  { to: '/admin/events', label: 'イベント' },
  { to: '/admin/gallery', label: 'ギャラリー' },
  { to: '/admin/stockists', label: '取扱店' },
  { to: '/admin/reservations', label: 'WS予約' },
  { to: '/admin/collaborations', label: 'コラボレーション' },
  { to: '/admin/contacts', label: 'お問い合わせ' },
  { to: '/admin/products', label: '商品管理' },
  { to: '/admin/orders', label: '注文管理' },
  { to: '/admin/articles', label: '記事管理' },
  { to: '/admin/finances', label: '収支一覧' },
]

const navStyle = ({ isActive }: { isActive: boolean }): React.CSSProperties => ({
  display: 'block', padding: '10px 16px', textDecoration: 'none',
  borderRadius: 4, fontSize: 14, letterSpacing: 1,
  background: isActive ? '#1c2417' : 'transparent',
  color: isActive ? '#fff' : '#3a4535',
  whiteSpace: 'nowrap',
})

export default function AdminLayout() {
  const [checking, setChecking] = useState(true)
  const [authed, setAuthed] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!supabase) { setChecking(false); return }
    supabase.auth.getSession().then(({ data }) => {
      setAuthed(!!data.session)
      setChecking(false)
    })
  }, [])

  // ルート変更時にメニューを閉じる
  useEffect(() => {
    setMenuOpen(false)
  }, [])

  const login = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase) { setError('Supabase not configured'); return }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); return }
    setAuthed(true)
  }

  const logout = async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    setAuthed(false)
  }

  if (checking) return null

  if (!authed) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f5f5f7', padding: '20px' }}>
      <form onSubmit={login} style={{ background: '#ffffff', padding: 40, borderRadius: 4, boxShadow: '0 2px 24px rgba(40,35,20,0.08)', width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h1 style={{ margin: '0 0 8px', fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 300 }}>Admin</h1>
        <input required type="text" placeholder="ID" value={email} onChange={(e) => setEmail(e.target.value)}
          style={{ padding: '10px 14px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 15, fontFamily: 'inherit' }} />
        <input required type="password" placeholder="パスワード" value={password} onChange={(e) => setPassword(e.target.value)}
          style={{ padding: '10px 14px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 15, fontFamily: 'inherit' }} />
        {error && <p style={{ color: '#c0392b', fontSize: 13, margin: 0 }}>{error}</p>}
        <button type="submit" style={{ padding: '12px', background: 'var(--c-ink)', color: '#fff', border: 'none', borderRadius: 4, fontSize: 15, cursor: 'pointer' }}>ログイン</button>
      </form>
    </div>
  )

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* モバイルオーバーレイ */}
      {menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 199 }}
        />
      )}

      {/* サイドバー */}
      <aside
        className={`admin-sidebar${menuOpen ? ' drawer-open' : ''}`}
        style={{
          width: 200,
          background: '#ffffff',
          borderRight: '1px solid #dddde8',
          padding: 16,
          flexShrink: 0,
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 300, marginBottom: 12, letterSpacing: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>ei8ht admin</span>
          <button
            onClick={() => setMenuOpen(false)}
            className="admin-menu-close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--c-muted)', padding: '0 4px', lineHeight: 1 }}
          >
            ×
          </button>
        </div>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            style={navStyle}
            onClick={() => setMenuOpen(false)}
          >
            {item.label}
          </NavLink>
        ))}
        <div style={{ marginTop: 'auto', paddingTop: 16 }}>
          <button onClick={logout} style={{ width: '100%', padding: '10px', background: 'none', border: '1px solid #dddde8', borderRadius: 4, fontSize: 13, cursor: 'pointer', color: 'var(--c-muted)' }}>ログアウト</button>
        </div>
      </aside>

      {/* メインコンテンツ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* モバイルヘッダー */}
        <div className="admin-mobile-header" style={{ display: 'none', padding: '12px 16px', background: '#fff', borderBottom: '1px solid #dddde8', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 100 }}>
          <button
            onClick={() => setMenuOpen(true)}
            style={{ background: 'none', border: '1px solid #dddde8', borderRadius: 4, padding: '6px 10px', cursor: 'pointer', fontSize: 16, lineHeight: 1, color: 'var(--c-body)' }}
          >
            ☰
          </button>
          <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 16, fontWeight: 300, letterSpacing: 2 }}>ei8ht admin</span>
        </div>

        <main style={{ flex: 1, padding: 'clamp(16px, 3vw, 40px)', overflowY: 'auto', minWidth: 0 }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
