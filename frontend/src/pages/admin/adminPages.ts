/*
 * 管理画面のページを読み込む関数の一覧（画面ごとの読み込み・コード分割用）
 *
 * App.tsx はこの関数を React.lazy に渡して、ページを開いたときに別ファイルとして読み込む。
 * 一方で、管理画面を開いたあと最初のページ移動で毎回読み込みを待つと、
 * 「URL は変わったのに前の画面が出たまま」の時間ができて使いにくいので、
 * ログイン後の管理画面が表示されたら、手が空いたときに残りのページも先に読み込んでおく（preloadAdminPages）
 */

/** 管理画面の各ページを読み込む関数（キーは App.tsx で使う名前） */
export const adminPageLoaders = {
  Dashboard: () => import('./Dashboard'),
  Events: () => import('./Events'),
  EventForm: () => import('./EventForm'),
  Gallery: () => import('./Gallery'),
  Stockists: () => import('./Stockists'),
  Reservations: () => import('./Reservations'),
  Collaborations: () => import('./Collaborations'),
  Contacts: () => import('./Contacts'),
  EventFinance: () => import('./EventFinance'),
  EventReservations: () => import('./EventReservations'),
  AdminEventSite: () => import('./AdminEventSite'),
  Products: () => import('./Products'),
  Orders: () => import('./Orders'),
  Articles: () => import('./Articles'),
  Finances: () => import('./Finances'),
  PriceCalc: () => import('./PriceCalc'),
  AdminPotArtists: () => import('./AdminPotArtists'),
  AdminMedia: () => import('./AdminMedia'),
  SiteImages: () => import('./SiteImages'),
  AdminDocs: () => import('./AdminDocs'),
  AdminChatQA: () => import('./AdminChatQA'),
  AdminChatLogs: () => import('./AdminChatLogs'),
  AdminHelperPayment: () => import('./AdminHelperPayment'),
  AdminWsSummary: () => import('./AdminWsSummary'),
  EventAdminInfo: () => import('./EventAdminInfo'),
  EventAdminInfoView: () => import('./EventAdminInfoView'),
  EventImages: () => import('./EventImages'),
  NotFound: () => import('./AdminNotFound'),
}

/** 先読みを一度始めたかどうか（ログインし直しなどで何度も始めないため） */
let preloadStarted = false

/**
 * 管理画面の全ページを、ブラウザの手が空いたときにまとめて先に読み込む
 * 読み込んだファイルはブラウザ（と PWA のキャッシュ）に残り、React.lazy が同じファイルを使うので、
 * その後のページ移動では読み込みを待たずに表示できる。失敗しても、そのページを開いたときに読み込み直すので無視する
 * @returns なし
 */
export function preloadAdminPages(): void {
  // 単体テスト（Vitest）では先読みしない。テストの終わったあとに全ページの読み込みが走り、遅くなったり後始末の邪魔になったりするため
  if (preloadStarted || import.meta.env.MODE === 'test') return
  preloadStarted = true
  /** 全ページの読み込みを始める */
  const run = () => {
    for (const load of Object.values(adminPageLoaders)) {
      load().catch(() => {})
    }
  }
  // 最初の画面の表示を邪魔しないよう、手が空いたときに始める（requestIdleCallback が無いブラウザは少し待ってから）
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 2000 })
  else window.setTimeout(run, 200)
}
