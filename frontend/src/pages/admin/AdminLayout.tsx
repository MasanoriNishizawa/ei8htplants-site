import { Outlet, NavLink } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null

const navStyle = ({ isActive }: { isActive: boolean }): React.CSSProperties => ({
  display: 'block', padding: '10px 16px', textDecoration: 'none',
  borderRadius: 8, fontSize: 14, letterSpacing: 1,
  background: isActive ? '#1c2417' : 'transparent',
  color: isActive ? '#fff' : '#3a4535',
})

export default function AdminLayout() {
  const [checking, setChecking] = useState(true)
  const [authed, setAuthed] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!supabase) { setChecking(false); return }
    supabase.auth.getSession().then(({ data }) => {
      setAuthed(!!data.session)
      setChecking(false)
    })
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
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f7f3ec' }}>
      <form onSubmit={login} style={{ background: '#fffcf6', padding: 40, borderRadius: 14, boxShadow: '0 2px 24px rgba(40,35,20,0.08)', width: 320, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h1 style={{ margin: '0 0 8px', fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 300 }}>Admin</h1>
        <input required type="email" placeholder="メールアドレス" value={email} onChange={(e) => setEmail(e.target.value)}
          style={{ padding: '10px 14px', border: '1px solid #ddd4c0', borderRadius: 8, fontSize: 15, fontFamily: 'inherit' }} />
        <input required type="password" placeholder="パスワード" value={password} onChange={(e) => setPassword(e.target.value)}
          style={{ padding: '10px 14px', border: '1px solid #ddd4c0', borderRadius: 8, fontSize: 15, fontFamily: 'inherit' }} />
        {error && <p style={{ color: '#c0392b', fontSize: 13, margin: 0 }}>{error}</p>}
        <button type="submit" style={{ padding: '12px', background: '#1c2417', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, cursor: 'pointer' }}>ログイン</button>
      </form>
    </div>
  )

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{ width: 200, background: '#fffcf6', borderRight: '1px solid #ddd4c0', padding: 20, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 300, marginBottom: 20, letterSpacing: 2 }}>ei8ht admin</div>
        <NavLink to="/admin" end style={navStyle}>ダッシュボード</NavLink>
        <NavLink to="/admin/events" style={navStyle}>イベント</NavLink>
        <NavLink to="/admin/gallery" style={navStyle}>ギャラリー</NavLink>
        <NavLink to="/admin/stockists" style={navStyle}>取扱店</NavLink>
        <NavLink to="/admin/reservations" style={navStyle}>WS予約</NavLink>
        <NavLink to="/admin/collaborations" style={navStyle}>コラボレーション</NavLink>
        <NavLink to="/admin/contacts" style={navStyle}>お問い合わせ</NavLink>
        <div style={{ marginTop: 'auto' }}>
          <button onClick={logout} style={{ width: '100%', padding: '10px', background: 'none', border: '1px solid #ddd4c0', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: '#8a9a7e' }}>ログアウト</button>
        </div>
      </aside>
      <main style={{ flex: 1, padding: 40, overflowY: 'auto' }}>
        <Outlet />
      </main>
    </div>
  )
}
