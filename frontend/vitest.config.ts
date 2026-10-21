/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['**/node_modules/**', '**/e2e/**'],
    // 1件あたりの制限時間（ミリ秒）。既定の 5 秒だと、マシンの負荷が高いときに各ファイルの最初のテスト
    // （画面の部品やモックの読み込みを含むため時間がかかる）が時間切れになることがあったので 15 秒にする
    testTimeout: 15000,
  },
})
