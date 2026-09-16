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
      manifest: false, // public/manifest.webmanifest を index.html から直接参照する
      injectRegister: 'auto',
      workbox: {
        // アプリの土台（JS・CSS・アイコン）だけを事前キャッシュする。
        // Supabase の /rest・/auth・/functions レスポンスはキャッシュしない
        // （共有端末で前の団体・利用者のデータが残らないようにするため）。
        globPatterns: ['**/*.{js,css,html,svg,webmanifest}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/share\//],
        runtimeCaching: [],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { port: 5173 },
})
