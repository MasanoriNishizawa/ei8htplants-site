// Vite の設定（開発サーバー・本番ビルド）。`npm run dev` / `npm run build` で使う
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    // React（JSX・Fast Refresh）
    react(),
    // PWA: 管理画面をスマホのホーム画面に追加して使えるようにする（サービスワーカーとマニフェストを作る）
    VitePWA({
      // 新しい版を公開したら、次に開いたときに自動で入れ替える
      registerType: 'autoUpdate',
      // public/ のうち、先にキャッシュしておくファイル
      includeAssets: ['favicon/**', 'img/**'],
      // ホーム画面に追加したときの名前・開くページ（/admin）・色・アイコン
      manifest: {
        name: 'ei8ht plants 管理',
        short_name: 'ei8ht Admin',
        description: 'ei8ht plants 管理画面',
        start_url: '/admin',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#1c2417',
        lang: 'ja',
        icons: [
          {
            src: '/favicon/pwa-icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/favicon/pwa-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      // サービスワーカーのキャッシュの設定
      workbox: {
        // 5MB までのファイルをキャッシュする
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // キャッシュするビルド結果のファイルの種類
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // Google Fonts の CSS は一度取ったらキャッシュを優先して使う
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-cache' },
          },
        ],
      },
    }),
  ],
  // 開発サーバー: /api への通信を手元のバックエンド（FastAPI・ポート 8000）へ中継する
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
