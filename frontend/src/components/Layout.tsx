import { Outlet, Link, useLocation } from 'react-router-dom'
import Header from './Header'
import Footer from './Footer'

/** チャットページ以外の全ページに表示する右下固定のAIチャットボタン */
function ChatFab() {
  const { pathname } = useLocation()
  if (pathname === '/chat') return null
  return (
    <Link
      to="/chat"
      style={{
        position: 'fixed',
        bottom: 28,
        right: 24,
        zIndex: 500,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 18px',
        background: '#2d3a24',
        color: '#fff',
        borderRadius: 999,
        textDecoration: 'none',
        fontSize: 13,
        letterSpacing: '0.05em',
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        transition: 'background 0.2s, transform 0.2s',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#3d4f32' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '#2d3a24' }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      AI
    </Link>
  )
}

/** サイト全体（ブランドサイト側）の共通レイアウト。Header と Footer に挟んでページを描画する */
export default function Layout() {
  return (
    <>
      <Header />
      <main className="site-main" style={{ paddingTop: 64, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </main>
      <Footer />
      <ChatFab />
    </>
  )
}
