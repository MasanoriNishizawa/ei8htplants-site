// Playwright（画面テスト・E2E）の設定。`npx playwright test` で使う。
// API は MSW のモックで受けるので、本物のバックエンド・外部サービスにはつながない
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  // テストのファイルを置くフォルダ
  testDir: './e2e',
  // テストは 1 つずつ順に動かす（同じ開発サーバーとモックを使うため）
  // fullyParallel: 同じモック・開発サーバーを共有するため、テストファイルを並列化しない。
  fullyParallel: false,
  // CI では test.only の消し忘れをエラーにする
  forbidOnly: !!process.env.CI,
  // CI でだけ、失敗したテストを 1 回やり直す
  retries: process.env.CI ? 1 : 0,
  // workers: 同時に動かすworker数を1つに固定する。
  workers: 1,
  // 結果を 1 行ずつ表示する
  reporter: 'list',
  use: {
    // page.goto('/events') のような相対パスの頭
    baseURL: 'http://127.0.0.1:4174',
    // ブラウザの言語を日本語にする（サイトの表示言語が日本語になる）
    locale: 'ja-JP',
    // やり直したときだけ、操作の記録（トレース）を残す
    trace: 'on-first-retry',
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
    // 起動を待つ最大の時間（ミリ秒）
    timeout: 60000,
  },
})
