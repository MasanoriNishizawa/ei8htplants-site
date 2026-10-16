/**
 * Google アナリティクス 4（GA4）のタグの読み込みと、ページビューの送信。
 *
 * - 本番のドメイン（ei8htplants.com）で本番ビルドを開いたときだけ動く。
 *   開発サーバー・自動テスト・プレビューではタグを読み込まず、外部への送信もしない
 * - SPA なので、自動のページビューは止め（send_page_view: false）、画面が切り替わるたびに自分で送る
 * - 管理画面（/admin）は送信しない（公開ページのレイアウトからだけ呼ぶうえ、念のためここでも除外する）
 */

/** GA4 の測定 ID（公開して問題ない値。秘密情報ではない） */
export const GA_MEASUREMENT_ID = 'G-HCVVDNYL94'

/**
 * GA に送ってよい URL のクエリの名前。これ以外のクエリは外して送る。
 * 予約キャンセルの URL（/cancel?id=トークン）のように、URL に秘密の値が入るページがあるため、
 * 「送ってよいものだけ残す」方式にしている。ページで新しいクエリを使うときは、秘密でなければここに足す
 */
const ALLOWED_QUERY_KEYS = [
  'page', // イベント一覧の「過去のイベント」切り替え（/events?page=past）
  'event_id', // WS 予約ページのイベント（/reserve?event_id=…）
]

/** 計測を有効にするホスト名（本番サイトのドメイン） */
const PRODUCTION_HOSTS = ['ei8htplants.com', 'www.ei8htplants.com']

/** GA の dataLayer と gtag 関数の型（window に生やす） */
declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

/** タグをすでに読み込んだか（2回読み込まないための印） */
let loaded = false

/**
 * 計測を有効にしてよい環境かを判定する
 * @param hostname - 開いているページのホスト名
 * @param isProdBuild - 本番ビルドか（import.meta.env.PROD）
 * @returns 本番ビルドかつ本番ドメインなら true
 */
export function isAnalyticsEnabled(hostname: string, isProdBuild: boolean): boolean {
  return isProdBuild && PRODUCTION_HOSTS.includes(hostname)
}

/**
 * 計測しないパスかを判定する（管理画面）
 * @param pathname - URL のパス
 * @returns 管理画面なら true
 */
export function isExcludedPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/')
}

/**
 * URL のクエリから、送ってよいものだけを残す
 * （ALLOWED_QUERY_KEYS と、広告・SNS からの流入を見分ける utm_〜）
 * @param search - URL のクエリ文字列（例: "?id=abc&event_id=1"）
 * @returns 残したクエリ（例: "?event_id=1"）。何も残らなければ空文字
 */
export function sanitizeSearch(search: string): string {
  const params = new URLSearchParams(search)
  const kept = new URLSearchParams()
  params.forEach((value, key) => {
    if (ALLOWED_QUERY_KEYS.includes(key) || key.startsWith('utm_')) kept.append(key, value)
  })
  const q = kept.toString()
  return q ? `?${q}` : ''
}

/**
 * GA4 のタグ（gtag.js）を読み込み、初期設定をする。2回目以降の呼び出しは何もしない
 */
export function loadGtag(): void {
  if (loaded) return
  loaded = true
  // 1. Google が案内している標準のタグと同じく、dataLayer と gtag 関数を用意する
  window.dataLayer = window.dataLayer || []
  window.gtag = function gtag() {
    // gtag.js は arguments オブジェクトのまま積まれることを前提にしているので、配列にせずそのまま渡す
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments)
  }
  window.gtag('js', new Date())
  // 2. 自動のページビューは止める（SPA の画面遷移は trackPageView で送る）。
  //    GA が自動で送るスクロール・クリックなどにも、秘密のクエリを外した URL を使わせる
  window.gtag('config', GA_MEASUREMENT_ID, {
    send_page_view: false,
    page_location: window.location.origin + window.location.pathname + sanitizeSearch(window.location.search),
  })
  // 3. gtag.js 本体を非同期で読み込む（ページの表示を待たせない）
  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`
  document.head.appendChild(script)
}

/**
 * 1画面分のページビューを GA4 に送る。タグを読み込んでいないとき・管理画面では何もしない
 * @param pathname - URL のパス
 * @param search - URL のクエリ文字列（例: "?id=123"）。送ってよいものだけ残して送る
 * @param title - ページタイトル
 */
export function trackPageView(pathname: string, search: string, title: string): void {
  if (!window.gtag || isExcludedPath(pathname)) return
  // 1. 秘密の値が入りうるクエリを外す
  const query = sanitizeSearch(search)
  const pageLocation = window.location.origin + pathname + query
  // 2. この後に GA が自動で送るイベント（スクロール・クリックなど）も、この URL で送られるようにする
  window.gtag('set', { page_location: pageLocation })
  // 3. ページビューを送る
  window.gtag('event', 'page_view', {
    page_location: pageLocation,
    page_path: pathname + query,
    page_title: title,
  })
}
