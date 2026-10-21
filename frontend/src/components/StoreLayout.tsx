import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import StoreHeader from './StoreHeader'
import Footer from './Footer'
import Analytics from './Analytics'
import PageLoading from './PageLoading'

// ショップ・ジャーナル側の共通レイアウト。StoreHeader と Footer に挟んでページを描画する
export default function StoreLayout() {
  return (
    <>
      {/* 本番サイトでだけ GA4 にページビューを送る（画面には何も出ない） */}
      <Analytics />
      <StoreHeader />
      <main style={{ paddingTop: 56, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        {/* ページは画面ごとに別ファイルで読み込む（App.tsx の lazy）。読み込み中は中身の部分にだけ控えめな表示を出す。
            遷移は startTransition で行われるので、一度表示したあとは読み込みが終わるまで前のページが残り、ちらつかない */}
        <Suspense fallback={<PageLoading />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
    </>
  )
}
