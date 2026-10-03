import { Outlet, Link, useLocation } from 'react-router-dom'
import Header from './Header'
import Footer from './Footer'

/** チャットページ以外の全ページに表示する右下固定のAIチャットボタン */
function ChatFab() {
  const { pathname } = useLocation()
  if (pathname === '/chat') return null
  return (
    <>
      <style>{`
        @keyframes fab-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(45,58,36,0.35), 0 6px 24px rgba(0,0,0,0.18); }
          60% { box-shadow: 0 0 0 10px rgba(45,58,36,0), 0 6px 24px rgba(0,0,0,0.18); }
        }
        .chat-fab {
          position: fixed;
          bottom: 28px;
          right: 24px;
          z-index: 500;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0 22px 0 18px;
          height: 48px;
          background: #2d3a24;
          color: #fff;
          border-radius: 999px;
          text-decoration: none;
          font-family: 'Cormorant Garamond', 'Noto Serif JP', serif;
          font-size: 14px;
          font-weight: 400;
          letter-spacing: 0.1em;
          animation: fab-pulse 3s ease-in-out infinite;
          transition: background 0.25s, transform 0.2s;
          white-space: nowrap;
        }
        .chat-fab:hover {
          background: #3a4e2d;
          transform: translateY(-2px);
        }
        .chat-fab-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #a8c897;
          flex-shrink: 0;
        }
      `}</style>
      <Link to="/chat" className="chat-fab">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.85, flexShrink: 0 }}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        AI Concierge
        <span className="chat-fab-dot" />
      </Link>
    </>
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
