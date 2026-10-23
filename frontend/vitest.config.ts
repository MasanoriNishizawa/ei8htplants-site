/// <reference types="vitest" />
// Vitest（フロントのロジック・画面の部品のテスト）の設定。`npx vitest run` で使う
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // React（JSX）を読めるようにする
  plugins: [react()],
  test: {
    // ブラウザの代わりに jsdom で画面の部品を動かす
    environment: 'jsdom',
    // describe・it・expect を import せずに使えるようにする
    globals: true,
    // 各テストの前に読み込む準備ファイル（jest-dom と MSW のモック）
    setupFiles: ['./src/test/setup.ts'],
    // Playwright の画面テスト（e2e/）は Vitest では動かさない
    exclude: ['**/node_modules/**', '**/e2e/**'],
    // 1件あたりの制限時間（ミリ秒）。既定の 5 秒だと、マシンの負荷が高いときに各ファイルの最初のテスト
    // （画面の部品やモックの読み込みを含むため時間がかかる）が時間切れになることがあったので 15 秒にする
    testTimeout: 15000,
  },
})
