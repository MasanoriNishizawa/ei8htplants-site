import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { isAnalyticsEnabled, loadGtag, trackPageView } from '../lib/analytics'

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
    // 2. 初回だけタグを読み込む
    loadGtag()
    // 3. この画面のページビューを送る。ページのコンポーネントが先に <title> を反映しているので、その値を使う
    trackPageView(pathname, search, document.title)
  }, [pathname, search])

  return null
}
