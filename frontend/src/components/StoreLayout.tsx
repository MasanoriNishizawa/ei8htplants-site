import { Outlet } from 'react-router-dom'
import StoreHeader from './StoreHeader'
import Footer from './Footer'

// ショップ・ジャーナル側の共通レイアウト。StoreHeader と Footer に挟んでページを描画する
export default function StoreLayout() {
  return (
    <>
      <StoreHeader />
      <main style={{ paddingTop: 56, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </main>
      <Footer />
    </>
  )
}
