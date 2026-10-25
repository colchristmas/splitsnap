import basicSsl from '@vitejs/plugin-basic-ssl'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { createReadStream, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Cross-origin isolation unlocks threaded WASM and WebGPU for on-device OCR.
// Any host we deploy to must send these same two headers.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

// ONNX Runtime dynamically imports /ort/*.mjs, which the dev server refuses
// to transform from public/. Serve those files untouched instead; production
// builds copy public/ as-is, so this is dev-only.
function serveOrtRuntime(): Plugin {
  return {
    name: 'serve-ort-runtime',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0] ?? ''
        if (!path.startsWith('/ort/')) return next()
        const file = join(server.config.publicDir, path)
        if (!existsSync(file)) return next()
        res.setHeader('Content-Type', file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript')
        // ORT starts its thread workers from these files, and workers need
        // their own isolation headers.
        for (const [k, v] of Object.entries(isolationHeaders)) res.setHeader(k, v)
        createReadStream(file).pipe(res)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    serveOrtRuntime(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon-64.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'SplitSnap',
        short_name: 'SplitSnap',
        description: 'Snap a receipt, tap who had what, and share everyone’s total.',
        theme_color: '#0f766e',
        background_color: '#f5f5f4',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The app shell is precached. The big OCR files (worker, OpenCV, ORT
        // WASM) are cached on first scan instead, and the models are cached by
        // src/lib/ocr/engine.ts.
        globPatterns: ['**/*.{js,css,html,png,svg}'],
        globIgnores: ['models/**', 'ort/**'],
        maximumFileSizeToCacheInBytes: 32 * 1024 * 1024,
        manifestTransforms: [
          async (entries) => ({ manifest: entries.filter((e) => e.size < 2 * 1024 * 1024), warnings: [] }),
        ],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/ort/') || url.pathname.startsWith('/assets/'),
            handler: 'CacheFirst',
            options: { cacheName: 'splitsnap-runtime', expiration: { maxEntries: 30 } },
          },
        ],
      },
    }),
    // `npm run dev:phone` serves over HTTPS on the LAN; phones only allow
    // cross-origin isolation (and the camera) on secure pages.
    mode === 'phone' && basicSsl(),
  ],
  resolve: {
    alias: [{ find: /^onnxruntime-web$/, replacement: fileURLToPath(new URL('./src/lib/ocr/ort-stub.ts', import.meta.url)) }],
  },
  // Fixed ports: old SplitSnap servers are stopped first (scripts/stop-servers.mjs),
  // so a new one never drifts to 5174, 5175…
  server: { headers: isolationHeaders, port: 5173, strictPort: true },
  preview: { headers: isolationHeaders, port: 4173, strictPort: true },
  optimizeDeps: {
    // Pre-bundling breaks the SDK's `new URL('./assets/worker-…', import.meta.url)`.
    exclude: ['@paddleocr/paddleocr-js'],
    include: [
      '@paddleocr/paddleocr-js > js-yaml',
      '@paddleocr/paddleocr-js > clipper-lib',
      '@paddleocr/paddleocr-js > @techstark/opencv-js',
    ],
  },
  worker: { format: 'es' },
}))
