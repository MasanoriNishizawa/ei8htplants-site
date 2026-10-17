import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { hasAdminSession, isAnalyticsEnabled, loadGtag, setAnalyticsDisabled, trackPageView } from '../lib/analytics'

/**
 * 公開ページで、画面が切り替わるたびに GA4 へページビューを送るコンポーネント（画面には何も描画しない）。
 * 公開ページのレイアウト（Layout・StoreLayout）に置く。管理画面のレイアウトには置かない
 * @returns null
 */
export default function Analytics() {
  // 現在の URL（パスとクエリが変わるたびに送信し直す）
  const { pathname, search } = useLocation()

  useEffect(() => {
    // 1. 本番サイト以外（開発・テスト・プレビュー）では何もしない
    if (!isAnalyticsEnabled(window.location.hostname, import.meta.env.PROD)) return
    // 1-2. 管理画面にログインしているブラウザ（管理者自身の閲覧）かを確かめる。
    //      Cookie を全てブロックしている環境などでは window.localStorage を読んだだけで例外が出るため、
    //      読み出しも try の中で行い、例外なら一般の訪問者として扱う（公開ページを止めないため）
    let isAdmin = false
    try {
      isAdmin = hasAdminSession(window.localStorage)
    } catch {
      isAdmin = false
    }
    // 1-3. 管理者なら GA4 への送信をまとめて止める（先にタグを読み込んでいても、自動の計測を含めて止まる）。
    //      画面が切り替わるたびに確かめるので、途中でログインした後の閲覧も数えず、ログアウトすれば再開する
    setAnalyticsDisabled(isAdmin)
    if (isAdmin) return
    // 2. 初回だけタグを読み込む
    loadGtag()
    // 3. この画面のページビューを送る。ページのコンポーネントが先に <title> を反映しているので、その値を使う
    trackPageView(pathname, search, document.title)
  }, [pathname, search])

  return null
}
