// 画面テスト（Playwright）を始める前に 1 回だけ動く準備（playwright.config.ts の globalSetup）。
//
// なぜ必要か:
//   E2E は Vite の開発サーバーに対して動かしている。開発サーバーは、ブラウザから初めて求められたときに
//   各ファイル（.tsx・.css など）を変換するので、最初にその画面を開いたテストだけが変換を待たされる。
//   負荷が高いと、この変換待ちで最初の画面が出るまでに 5 秒以上かかり、テストが待ち時間切れになっていた。
//
// どうするか:
//   テストを始める前に、アプリの入口（/src/main.tsx）から import・動的な import（画面ごとに分けたファイル）を
//   たどって全部のファイルを 1 回ずつ取得し、開発サーバーに変換を済ませておく。
//   決まった秒数は待たず、「たどれるファイルを全部取得し終えた」ことで準備完了とする。
//   取得するのはテスト用の開発サーバー（127.0.0.1）だけで、外部には接続しない。
import type { FullConfig } from '@playwright/test'

/** 同時に取得するファイルの数。多すぎると開発サーバー自体が詰まるので控えめにする */
const CONCURRENCY = 8

/** 1 ファイルの取得を待つ最大の時間（ミリ秒）。負荷が高いときの変換待ちを見込む */
const FETCH_TIMEOUT = 60_000

/**
 * 変換後のコードから、ほかのファイルを読み込んでいる場所（import 先のパス）を取り出す。
 * Vite は import 先を "/src/..."・"/node_modules/.vite/deps/..." のような絶対パスに書き換えて返す
 * @param code - 開発サーバーが返した変換後のコード
 * @returns 見つかった import 先のパス（重複あり）
 */
function findImports(code: string): string[] {
  // 1. 静的な import / export ... from、副作用だけの import、動的な import() の 3 つの書き方を拾う
  // patterns: import 先のパスを 1 番目の組に取る正規表現
  const patterns = [
    /\b(?:import|export)\s[^'"`;]*?\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
  ]
  // found: 見つけた import 先のパス
  const found: string[] = []
  for (const pattern of patterns) {
    for (const match of code.matchAll(pattern)) found.push(match[1])
  }
  return found
}

/**
 * index.html の <script type="module" src="..."> から、アプリの入口のパスを取り出す
 * @param html - 開発サーバーが返した index.html
 * @returns 入口のパス（例: /src/main.tsx、/@vite/client）
 */
function findEntryScripts(html: string): string[] {
  // 1. script の src を全部拾う
  return Array.from(html.matchAll(/<script[^>]*\bsrc=["']([^"']+)["']/g), (match) => match[1])
}

/**
 * 1 つのファイルを開発サーバーから取得する（変換を済ませるため）。失敗しても準備全体は止めない
 * @param url - 取得する URL
 * @returns 変換後のコード。取得できなかったときは空文字
 */
async function fetchText(url: string): Promise<string> {
  try {
    // 1. 時間を区切って取得する
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) })
    // 2. JavaScript として返されたものだけ中身をたどる（画像などはたどらない）
    // type: 応答の種類（Content-Type）
    const type = response.headers.get('content-type') ?? ''
    if (!response.ok || !/javascript|html/.test(type)) return ''
    return await response.text()
  } catch {
    // 3. 取得できなかったファイルは、テストの中で改めて読み込まれるだけなので、ここでは無視する
    return ''
  }
}

/**
 * テストの前に、アプリの全部のファイルを開発サーバーに変換させておく
 * @param config - Playwright の設定（baseURL を取り出す）
 * @returns 全部のファイルを取得し終えたら解決する Promise
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  // 1. 開発サーバーの URL（playwright.config.ts の use.baseURL）
  // baseURL: テスト用の開発サーバーの URL
  const baseURL = String(config.projects[0]?.use.baseURL ?? 'http://127.0.0.1:4174')
  // origin: たどってよい URL の頭（テスト用の開発サーバーだけをたどり、外部には出ない）
  const origin = new URL(baseURL).origin
  // started: かかった時間を出すための開始時刻
  const started = Date.now()

  // 2. index.html から入口のファイルを取り出す
  const html = await fetchText(baseURL)
  if (!html) {
    // 入口を取得できないときは、準備を飛ばしてテストに任せる（テスト側の waitForAppReady が長めに待つ）
    console.warn(`[global-setup] ${baseURL} を取得できなかったため、ファイルの事前変換を飛ばします`)
    return
  }
  // queue: これから取得するファイルの URL
  const queue = findEntryScripts(html).map((src) => new URL(src, baseURL).href)
  // seen: 一度取得の予定に入れた URL（同じファイルを二度取らない）
  const seen = new Set(queue)

  // 3. import をたどりながら、CONCURRENCY 個ずつ並べて取得する
  /**
   * キューが空になるまで、ファイルを 1 つずつ取って中の import を追加する
   * @returns キューが空になったら解決する Promise
   */
  async function worker(): Promise<void> {
    while (queue.length > 0) {
      // url: 今回取得するファイル
      const url = queue.shift()!
      const code = await fetchText(url)
      for (const spec of findImports(code)) {
        // 相対・絶対パスだけをたどる（"react" のような名前は Vite が書き換え済みなので出てこない）
        if (!spec.startsWith('/') && !spec.startsWith('.')) continue
        // 事前にまとめられたライブラリ（/node_modules/.vite/deps/）の中は、本物の分割ファイル（.js）だけをたどる。
        // ライブラリの中の説明文にある import の例（'./MyComponent' など）まで取りに行かないため
        if (url.includes('/node_modules/') && !/\.js(\?|$)/.test(spec)) continue
        // next: import 先の URL
        const next = new URL(spec, url)
        if (next.origin !== origin || seen.has(next.href)) continue
        seen.add(next.href)
        queue.push(next.href)
      }
    }
  }
  // 取得中にキューが一時的に空になった worker が早く終わらないよう、全部の worker が止まるまで繰り返す
  while (queue.length > 0) {
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
  }

  // 4. 何件変換させたかを出す（準備が効いているかの確認用）
  console.log(`[global-setup] 開発サーバーで ${seen.size} 件のファイルを変換済みにしました（${Math.round((Date.now() - started) / 1000)} 秒）`)
}
