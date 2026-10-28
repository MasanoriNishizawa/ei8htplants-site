import { Suspense } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import Header from './Header'
import Footer from './Footer'
import Analytics from './Analytics'
import PageLoading from './PageLoading'
import Ei8htPlantsHeader from './Ei8htPlantsHeader'

/**
 * チャットページ以外の全ページに表示する右下固定のAIチャットボタン
 * @returns チャットページへのリンク（チャットページでは null）
 */
function ChatFab() {
  // 今のページのパス（チャットページではボタンを出さない）
  const { pathname } = useLocation()
  if (pathname === '/official/chat') return null
  return (
    <>
      {/* ボタンの見た目。この部品の中だけで使うので、ここに CSS を置いている */}
      <style>{`
        /* ボタンの周りに広がって消える影の輪（3 秒ごとに繰り返す） */
        @keyframes fab-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(45,58,36,0.35), 0 6px 24px rgba(0,0,0,0.18); }
          60% { box-shadow: 0 0 0 10px rgba(45,58,36,0), 0 6px 24px rgba(0,0,0,0.18); }
        }
        /* ボタン本体: 画面右下に固定した、濃い緑の丸い横長ボタン */
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
        /* マウスを乗せたとき: 少し明るい緑にして 2px 浮かせる */
        .chat-fab:hover {
          background: #3a4e2d;
          transform: translateY(-2px);
        }
        /* ラベルの右の小さな薄緑の丸（受付中の印） */
        .chat-fab-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #a8c897;
          flex-shrink: 0;
        }
        /* スマホではラベルを "AI" のみ表示し、パディングを詰める */
        .chat-fab-label-full { display: inline; }
        .chat-fab-label-short { display: none; }
        @media (max-width: 767px) {
          .chat-fab { padding: 0 16px 0 14px; gap: 7px; }
          .chat-fab-label-full { display: none; }
          .chat-fab-label-short { display: inline; }
        }
      `}</style>
      <Link to="/official/chat" className="chat-fab">
        {/* 吹き出しのアイコン */}
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.85, flexShrink: 0 }}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span className="chat-fab-label-full">AI Concierge</span>
        <span className="chat-fab-label-short">AI</span>
        <span className="chat-fab-dot" />
      </Link>
    </>
  )
}

/**
 * サイト全体（ブランドサイト側）の共通レイアウト。Header と Footer に挟んでページを描画する
 * @returns ヘッダー・ページ本体（Outlet）・フッター・チャットボタン
 */
export default function Layout() {
  // 今の URL を確認し、ei8ht plants ブランドページ専用のヘッダーを選ぶ
  const { pathname } = useLocation()
  // ei8ht plants の複数ページだけブランド専用ヘッダーを使う判定
  const isEi8htPlantsBrandPage = pathname === '/' || pathname === '/about' || pathname === '/plants'
  return (
    <>
      {/* 本番サイトでだけ GA4 にページビューを送る（画面には何も出ない） */}
      <Analytics />
      {isEi8htPlantsBrandPage ? <Ei8htPlantsHeader /> : <Header />}
      {/* paddingTop: 64 は固定ヘッダーの高さ分。縦並びの flex にして、短いページでもフッターが画面下に来るようにする */}
      <main className="site-main" style={{ paddingTop: 64, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        {/* ページは画面ごとに別ファイルで読み込む（App.tsx の lazy）。読み込み中は中身の部分にだけ控えめな表示を出す。
            遷移は startTransition で行われるので、一度表示したあとは読み込みが終わるまで前のページが残り、ちらつかない */}
        <Suspense fallback={<PageLoading />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
      <ChatFab />
    </>
  )
}
