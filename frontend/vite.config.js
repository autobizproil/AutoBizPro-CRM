import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName:             'api-cache',
              networkTimeoutSeconds: 5,
              expiration:            { maxEntries: 100, maxAgeSeconds: 86400 },
              cacheableResponse:     { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName:         'google-fonts-cache',
              expiration:        { maxEntries: 10, maxAgeSeconds: 31536000 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name:             'AutoBiz Pro IL',
        short_name:       'AutoBizPro',
        description:      'CRM ניהול עסקי',
        theme_color:      '#2398c2',
        background_color: '#f4f6f8',
        display:          'standalone',
        dir:              'rtl',
        lang:             'he',
        icons: [
          { src: '/assets/autobizpro-logo.png', sizes: '256x256', type: 'image/png' },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target:       'http://localhost:8000',
        changeOrigin: true,
        credentials:  true,
      },
      '/sanctum': {
        target:       'http://localhost:8000',
        changeOrigin: true,
        credentials:  true,
      },
    },
  },
})
