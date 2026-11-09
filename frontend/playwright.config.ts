// Playwright（画面テスト・E2E）の設定。`npx playwright test` で使う。
// API は MSW のモックで受けるので、本物のバックエンド・外部サービスにはつながない
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  // テストのファイルを置くフォルダ
  testDir: './e2e',
  // テストを始める前に 1 回だけ、開発サーバーにアプリの全部のファイルを変換させておく（e2e/global-setup.ts）。
  // 変換を済ませておかないと、各画面を最初に開いたテストだけが変換待ちになり、負荷が高いと待ち時間切れになっていた
  globalSetup: './e2e/global-setup.ts',
  // 1 件のテストにかけてよい最大の時間（ミリ秒）。既定の 30 秒から 60 秒にする。
  // 理由: 最初の読み込み（e2e/fixtures.ts の waitForAppReady）に負荷が高いときは最大 45 秒かかることを見込むため。
  // 画面の確かめ（expect）は下の expect.timeout のままなので、表示されない不具合はこれまでどおり 5 秒で失敗する
  timeout: 60_000,
  expect: {
    // 画面の確かめ（toBeVisible など）が待つ時間は、既定の 5 秒のまま変えない（不具合を隠さないため）。
    // 負荷の影響を受ける「アプリの起動」は、e2e/fixtures.ts が page.goto・page.reload のあとに別に待つ
    timeout: 5_000,
  },
  // 同じspec内の状態依存を避けるため、spec内テストは引き続き順に実行する。
  // fullyParallel: false を保ち、独立したspecファイルだけをworker間で処理する。
  fullyParallel: false,
  // CI では test.only の消し忘れをエラーにする
  forbidOnly: !!process.env.CI,
  // CI でだけ、失敗したテストを 1 回やり直す
  retries: process.env.CI ? 1 : 0,
  // workers: 独立したspecファイルを最大2つずつ処理し、共有ページ状態を持ち込まず待ち時間を短縮する。
  workers: 2,
  // 結果を 1 行ずつ表示する
  reporter: 'list',
  use: {
    // page.goto('/events') のような相対パスの頭
    baseURL: 'http://127.0.0.1:4174',
    // ブラウザの言語を日本語にする（サイトの表示言語が日本語になる）
    locale: 'ja-JP',
    // やり直したときだけ、操作の記録（トレース）を残す
    trace: 'on-first-retry',
    // ページの移動（page.goto など）を待つ最大の時間（ミリ秒）。既定はテスト全体の時間までだが、明示して 45 秒にする。
    // 理由: 負荷が高いと最初の HTML とファイルの読み込みに時間がかかるため（e2e/fixtures.ts の APP_READY_TIMEOUT と同じ値）
    navigationTimeout: 45_000,
    // クリック・入力などの操作の待ち時間は既定（上限なし＝テストの時間まで）のまま変えない
  },
  // 使うブラウザ（PC の Chrome のみ）
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // テスト専用ポートでログイン省略・MSW のモックつきサーバーを起動し、終了後に Playwright が停止する
  webServer: {
    command: 'npm run mock:e2e -- --port 4174 --strictPort',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: false,
    // 起動を待つ最大の時間（ミリ秒）。60 秒から 120 秒にする。
    // 理由: load average が数百のとき、Vite の起動だけで 15 秒ほどかかったため（ふだんは 1 秒未満）
    timeout: 120_000,
  },
})
