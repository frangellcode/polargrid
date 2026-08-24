import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  server: {
    port: 5174,
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt' (not 'autoUpdate') is required for the "Actualizar app"
      // badge/animation in App.tsx to ever be visible: autoUpdate makes the
      // new service worker self-activate and workbox-window silently calls
      // window.location.reload() the instant it does — the page reloads
      // before React can paint the pending-update badge at all, and the
      // fresh reload resets the store's updateAvailable flag to false, so
      // the "1" never has a moment to show. 'prompt' leaves the new worker
      // waiting until pwaUpdate.ts explicitly tells it to take over (see
      // onNeedRefresh/onNeedReload there).
      registerType: 'prompt',
      // Registered manually in main.tsx instead (with a periodic update
      // check) — the default injected script only ever checks for a new
      // service worker on a cold page load, which an installed PWA opened
      // from its home-screen icon almost never does.
      injectRegister: false,
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'PolarGrid',
        short_name: 'PolarGrid',
        description: 'Bordes blancos y collages de fotos en alta calidad, 100% offline.',
        // Matches the app's dark rebrand (bg-ink-900, #141e30) — otherwise the
        // OS-generated splash screen shown while the app cold-launches from
        // the home screen icon is white, then flashes to the actual dark UI.
        theme_color: '#141e30',
        background_color: '#141e30',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // The Syne/Jost Google Fonts are loaded from a separate origin, so
        // globPatterns above (same-origin build output) never covers them —
        // without this they're at the mercy of the browser's own HTTP cache,
        // which iOS can evict after as little as a week of the app not being
        // opened directly in Safari. Caching them here keeps the "100%
        // offline" claim true and avoids the visible reflow that happens
        // when the fallback font has to be swapped for the real one after
        // a slow/failed re-fetch.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
