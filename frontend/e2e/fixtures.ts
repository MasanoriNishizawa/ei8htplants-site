// 画面テスト（Playwright）の共通の準備。各 spec は '@playwright/test' の代わりにこのファイルから test・expect を読み込む。
//
// なぜ必要か:
//   E2E は Vite の開発サーバー（MSW のモックつき）に対して動かしている。テストごとに新しいブラウザの状態で開くため、
//   最初の page.goto のたびに 200 前後のファイル（画面ごとに分けたファイル・MSW の Service Worker など）を読み直す。
//   マシンの負荷が高い（load average が 26〜70）と、この「アプリが起動して最初の画面が出るまで」が 5 秒を超え、
//   その直後の expect（既定 5 秒）が、今回の変更と関係なく待ち時間切れになっていた。
//
// どう直すか:
//   page.goto・page.reload のあとに「アプリの準備ができた」ことを待つ（決まった秒数は待たない）。
//   準備ができたら、そのあとの expect は既定の 5 秒のまま動かすので、本当の不具合（表示されない・値が違う）は隠さない。
//   「準備ができた」とは次の 2 つがそろった状態:
//     1. #root に画面が描画されている（main.tsx は MSW の Service Worker の起動を待ってから描画するので、
//        描画されていれば API はモックに届く）
//     2. 画面ごとに分けたファイルの読み込み中の表示（components/PageLoading.tsx の「読み込み中...」）が出ていない
//   さらに、その時点で応答待ちの API（最初の画面のデータ。MSW のモックが返す）が無くなるまで待つ。
//   そのあとの表示の中身（値・件数など）は、各テストの expect（既定 5 秒）で確かめる。
import { test as base, type Page, type Request } from '@playwright/test'

// '@playwright/test' のほかの名前（expect・型の Page・Locator など）はそのまま使えるようにする。
// 下で書き出す test は、ここでの test より優先される
export * from '@playwright/test'

/**
 * 最初の読み込み（アプリの起動）を待つ最大の時間（ミリ秒）。
 * 負荷が無いときは 1 秒前後で終わる。load average 70 程度でも間に合うように 45 秒にする。
 * 待つのは「起動したか」だけなので、長くしても画面の不具合は隠れない（起動しなければこの待ちで失敗する）
 */
export const APP_READY_TIMEOUT = 45_000

/**
 * アプリの準備ができる（#root に画面が描画され、画面のファイルの読み込み中の表示が消える）まで待つ。
 * page.goto・page.reload のあとに自動で呼ばれる。ほかの場面（ページ内のリンクで別の画面へ移ったあと等）で使ってもよい
 * @param page - 対象のページ
 * @param timeout - 待つ最大の時間（ミリ秒）。既定は APP_READY_TIMEOUT
 * @returns 準備ができたら解決する Promise。時間内に準備ができなければ、その旨のエラーで失敗する
 */
export async function waitForAppReady(page: Page, timeout: number = APP_READY_TIMEOUT): Promise<void> {
  // 1. ブラウザの中で、準備ができたかを繰り返し確かめる
  await page
    .waitForFunction(
      () => {
        // root: アプリを描画する要素（index.html の <div id="root">）
        const root = document.getElementById('root')
        // 2. まだ何も描画されていなければ準備中（MSW の起動待ち・最初のファイルの読み込み中）
        if (!root || root.childElementCount === 0) return false
        // 3. 画面のファイルの読み込み中の表示（PageLoading。role="status" と aria-live="polite" を持つ）が残っていれば準備中
        // loading: PageLoading の文言（日本語・英語）だけを持つ表示が今あるか
        const loading = Array.from(document.querySelectorAll('[role="status"][aria-live="polite"]')).some((el) =>
          /^(読み込み中\.\.\.|Loading\.\.\.)$/.test((el.textContent ?? '').trim()),
        )
        return !loading
      },
      null,
      { timeout },
    )
    .catch((error: Error) => {
      // 4. 待ち時間切れのときは、どこで止まったか分かる文にして失敗させる
      throw new Error(`アプリの準備（#root の描画と画面のファイルの読み込み）が ${timeout} ミリ秒以内に終わりませんでした: ${error.message}`)
    })
}

/**
 * ページの中で、まだ応答が返っていない API（/api/。E2E では MSW のモックが返す）の通信を数える係を付ける。
 * 最初の画面のデータ（イベント一覧など）の読み込みも「最初の読み込み」に含めて待つために使う
 * @param page - 対象のページ
 * @returns reset（前の文書の通信を除外）と waitForIdle（現在の文書の API 応答待ち。timeout ミリ秒を過ぎたら失敗する）
 */
function trackApiRequests(page: Page): { reset: () => void; waitForIdle: (timeout: number) => Promise<void> } {
  // pending: 応答待ちの API の通信
  const pending = new Set<Request>()
  // waiters: 応答待ちが無くなったときに呼ぶ関数
  let waiters: (() => void)[] = []
  // documentNavigation: goto/reload が開始してから、新しいメイン文書へ切り替わるまでの状態。
  let documentNavigation = false
  /**
   * 通信が終わった（成功・失敗とも）ときに数から外し、無くなったら待っている人に知らせる
   * @param request - 終わった通信
   * @returns なし
   */
  const done = (request: Request) => {
    pending.delete(request)
    if (pending.size > 0) return
    waiters.forEach((resolve) => resolve())
    waiters = []
  }
  page.on('request', (request) => {
    // API の通信だけを数える（画像・画面のファイルは数えない）
    if (new URL(request.url()).pathname.startsWith('/api/')) pending.add(request)
  })
  page.on('requestfinished', done)
  page.on('requestfailed', done)
  page.on('framenavigated', (frame) => {
    // goto/reload 開始後、旧文書から遅れて来た request も文書の切替時に外す。
    // 通常の SPA 移動や利用者のハッシュ操作ではフラグを立てず、現在の文書の通信を維持する。
    // goto/reload は新文書を開く前提。goto でハッシュだけを変える同一文書移動は未対応。
    if (documentNavigation && frame === page.mainFrame()) {
      pending.clear()
      documentNavigation = false
    }
  })
  // iframe が破棄されると、その文書の requestfinished/requestfailed が届かないことがある。
  // 現在の画面から外れた iframe の通信は、次の文書の準備待ちに持ち越さない。
  page.on('framedetached', (frame) => {
    for (const request of pending) {
      try {
        if (request.frame() === frame) done(request)
      } catch {
        // Service Worker が直接発行した通信には frame がない。識別できない通信は除外しない。
      }
    }
  })
  return {
    reset: () => {
      // 1. goto/reload は文書を作り直すため、前の文書で開始した通信を待つ対象から外す。
      pending.clear()
      documentNavigation = true
    },
    waitForIdle: async (timeout: number) => {
      if (pending.size === 0) return
      // 決まった秒数は待たず、最後の応答が返った時点で進む
      let timer: ReturnType<typeof setTimeout> | undefined
      await Promise.race([
        new Promise<void>((resolve) => waiters.push(resolve)),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`最初の画面の API の応答（${pending.size} 件）が ${timeout} ミリ秒以内に返りませんでした: ${[...pending].map((request) => `${request.method()} ${new URL(request.url()).pathname}`).join(', ')}`)), timeout)
        }),
      ]).finally(() => clearTimeout(timer))
    },
  }
}

/**
 * page を差し替えた test。page.goto・page.reload は、新しい文書を開いたあと次の 2 つを待ってから戻る。
 * goto でハッシュだけを変える同一文書移動は未対応（通常の SPA 移動・利用者によるハッシュ操作は通信を維持する）。
 *   1. waitForAppReady（アプリの起動と画面のファイルの読み込み）
 *   2. その時点で応答待ちの API（最初の画面のデータの読み込み。MSW のモックが返す）が無くなること
 * どちらも最大 APP_READY_TIMEOUT。移動そのものの待ち時間（navigationTimeout）も APP_READY_TIMEOUT にする
 */
export const test = base.extend<{ page: Page }>({
  page: async ({ page }, use) => {
    // 1. 元の goto・reload を取っておく
    // originalGoto: Playwright の本来の page.goto
    const originalGoto = page.goto.bind(page)
    // originalReload: Playwright の本来の page.reload
    const originalReload = page.reload.bind(page)
    // api: 応答待ちの API の通信を数える係
    const api = trackApiRequests(page)
    /**
     * 移動のあと、アプリの起動と最初の画面のデータの読み込みが終わるまで待つ
     * @returns 待ち終わったら解決する Promise
     */
    const settle = async () => {
      await waitForAppReady(page)
      await api.waitForIdle(APP_READY_TIMEOUT)
    }
    // 2. goto: 移動したあと、アプリの準備ができるまで待つ
    page.goto = async (url, options) => {
      // 前の文書の通信は、文書の破棄で完了通知が届かなくても次の画面の待機には含めない。
      api.reset()
      // response: 移動先の HTML の応答（呼び出し元へそのまま返す）
      const response = await originalGoto(url, { timeout: APP_READY_TIMEOUT, ...options })
      await settle()
      return response
    }
    // 3. reload: 読み込み直したあと、アプリの準備ができるまで待つ
    page.reload = async (options) => {
      // 再読み込みでも、前の文書の通信を新しい文書へ持ち越さない。
      api.reset()
      // response: 読み込み直した HTML の応答（呼び出し元へそのまま返す）
      const response = await originalReload({ timeout: APP_READY_TIMEOUT, ...options })
      await settle()
      return response
    }
    // 4. 差し替えた page をテストに渡す
    await use(page)
  },
})
