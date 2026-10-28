// アプリの入口。CSS を読み込み、#root に App を描画する
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

/**
 * 描画の前の準備。開発中に VITE_MSW=true（`npm run mock`）のときだけ、API を MSW のモックで受けるようにする。
 * モックに無い通信（画像・フォントなど）はそのまま外へ通す
 * @returns 準備が終わったら解決する Promise
 */
async function prepare() {
  if (import.meta.env.DEV && import.meta.env.VITE_MSW === 'true') {
    /** 開発時に API リクエストを受ける Service Worker */
    const { worker } = await import('./mocks/browser')
    await worker.start({ onUnhandledRequest: 'bypass' })
  }
}

/** 画面のファイルの読み込み失敗で再読み込みした時刻を入れておく sessionStorage のキー */
const PRELOAD_RELOAD_KEY = 'preload-error-reloaded-at'

/*
 * 画面ごとに分けたファイル（App.tsx の React.lazy）の読み込みに失敗したときに、ページを1回だけ再読み込みする。
 * 新しい版を公開すると古いファイル名が消えるため、公開前から開いていたタブで別のページへ移ると読み込みに失敗することがある。
 * 再読み込みすれば新しい版の index.html とファイルを読み直せる。
 * 失敗が続くとき（ネットワークが切れているなど）に再読み込みを繰り返さないよう、10秒以内の2回目は再読み込みしない。
 * そのときはエラーがそのまま投げられ、App.tsx の LoadErrorBoundary が「ページを読み込めませんでした」と再読み込みボタンを出す
 */
window.addEventListener('vite:preloadError', (event) => {
  // 前回この理由で再読み込みした時刻（無ければ 0）
  const last = Number(sessionStorage.getItem(PRELOAD_RELOAD_KEY) ?? '0')
  if (Date.now() - last < 10_000) return
  sessionStorage.setItem(PRELOAD_RELOAD_KEY, String(Date.now()))
  // 既定ではエラーとして投げられ画面が真っ白になるので、それを止めて再読み込みする
  event.preventDefault()
  window.location.reload()
})

// モックの準備が済んでから描画する（先に描画すると最初の API 呼び出しがモックに届かない）
prepare().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
})
