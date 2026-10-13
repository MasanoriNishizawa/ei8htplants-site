import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon/**', 'img/**'],
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
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
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
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
