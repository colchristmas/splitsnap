import basicSsl from '@vitejs/plugin-basic-ssl'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
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

const fromHere = (path: string) => fileURLToPath(new URL(path, import.meta.url))

// The OCR SDK ships its worker prebuilt under a hashed name. An alias to it
// lets src/lib/ocr/engine.ts import its URL (`paddleocr-worker?url`), so the
// scanner loader can prefetch exactly the file the SDK will start.
function ocrWorkerFile() {
  const dir = fromHere('./node_modules/@paddleocr/paddleocr-js/dist/assets/')
  const name = existsSync(dir) && readdirSync(dir).find((f) => /^worker-entry-.*\.js$/.test(f))
  if (!name) throw new Error(`Couldn't find the PaddleOCR worker in ${dir}. Run npm install.`)
  return join(dir, name)
}

// Uncompressed size of every file the scanner downloads, keyed by file name.
// The loader's progress bar uses these: a host that compresses sends no
// Content-Length, or a smaller one than the bytes the page reads. Missing files
// count as 0 (e.g. in tests, before `npm run setup:ocr`).
function scannerBytes(workerFile: string) {
  const size = (file: string) => (existsSync(file) ? statSync(file).size : 0)
  const sizes: Record<string, number> = { worker: size(workerFile) }
  for (const dir of ['models', 'ort']) {
    const path = fromHere(`./public/${dir}/`)
    if (existsSync(path)) for (const f of readdirSync(path)) sizes[f] = size(join(path, f))
  }
  return sizes
}

const workerFile = ocrWorkerFile()

// Virtual adapters (WSL, Docker, VMs, VPNs) usually aren't reachable from a
// phone, so they're offered last.
const VIRTUAL_ADAPTER = /vEthernet|WSL|Hyper-V|VirtualBox|VMware|vbox|docker|br-|veth|Loopback|Tailscale|ZeroTier|utun|(tun|tap)\d*/i
const WIFI_ADAPTER = /wi-?fi|wlan|wireless|^en0$|^wl/i
const PRIVATE_LAN = /^(192\.168|10)\.|^172\.(1[6-9]|2\d|3[01])\./

/** This computer's IPv4 addresses that a phone on the same network might reach, likeliest first. */
function lanAddresses() {
  const found: { name: string; address: string }[] = []
  for (const [name, addresses] of Object.entries(networkInterfaces())) {
    for (const a of addresses ?? []) {
      if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) found.push({ name, address: a.address })
    }
  }
  const rank = ({ name, address }: { name: string; address: string }) =>
    (VIRTUAL_ADAPTER.test(name) ? 4 : 0) + (WIFI_ADAPTER.test(name) ? 0 : 1) + (PRIVATE_LAN.test(address) ? 0 : 2)
  return found.sort((a, b) => rank(a) - rank(b))
}

// `--mode phone` only: tells the app (src/components/PhoneQr.tsx) which
// addresses to put in the QR code for opening it on a phone. Worked out per
// request, so it follows you if the computer changes networks.
function phoneAddresses(): Plugin {
  return {
    name: 'phone-addresses',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__splitsnap/lan', (_req, res) => {
        const protocol = server.config.server.https ? 'https' : 'http'
        const urls = lanAddresses().map(({ name, address }) => ({ name, url: `${protocol}://${address}:${server.config.server.port}/` }))
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        res.end(JSON.stringify(urls))
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
        theme_color: '#606c38',
        background_color: '#fefae0',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The app shell is precached. The big OCR files (worker, ORT WASM) are
        // fetched by the scanner loader in src/lib/ocr/engine.ts on first scan
        // and kept by the runtime route below; engine.ts caches the models.
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
    mode === 'phone' && phoneAddresses(),
  ],
  resolve: {
    alias: [
      { find: /^onnxruntime-web$/, replacement: fromHere('./src/lib/ocr/ort-stub.ts') },
      { find: /^(@techstark\/opencv-js|clipper-lib)$/, replacement: fromHere('./src/lib/ocr/sdk-main-thread-stub.ts') },
      { find: /^paddleocr-worker(?=\?|$)/, replacement: workerFile },
    ],
  },
  define: { __SCANNER_BYTES__: JSON.stringify(scannerBytes(workerFile)) },
  // Fixed ports: old SplitSnap servers are stopped first (scripts/stop-servers.mjs),
  // so a new one never drifts to 5174, 5175…
  server: { headers: isolationHeaders, port: 5173, strictPort: true },
  preview: { headers: isolationHeaders, port: 4173, strictPort: true },
  optimizeDeps: {
    // Pre-bundling breaks the SDK's `new URL('./assets/worker-…', import.meta.url)`.
    // It would also turn the `paddleocr-worker?url` alias into a module with no
    // default export (a blank page in dev), so that stays out too. Vite matches
    // aliased imports here by the whole specifier, so the entry keeps its `?url`.
    exclude: ['@paddleocr/paddleocr-js', 'paddleocr-worker?url'],
    // OpenCV and Clipper are stubbed on the main thread (see resolve.alias).
    include: ['@paddleocr/paddleocr-js > js-yaml'],
  },
  worker: { format: 'es' },
}))
