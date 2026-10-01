import { Outlet } from 'react-router-dom'
import Header from './Header'
import Footer from './Footer'

/** サイト全体（ブランドサイト側）の共通レイアウト。Header と Footer に挟んでページを描画する */
export default function Layout() {
  return (
    <>
      <Header />
      <main className="site-main" style={{ paddingTop: 64, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </main>
      <Footer />
    </>
  )
}
