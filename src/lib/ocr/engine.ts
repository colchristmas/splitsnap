import type { ImageSource } from '@paddleocr/paddleocr-js'
import ocrWorkerUrl from 'paddleocr-worker?url'
import type { OcrLine } from '../receipt/parse'

export type OcrModel = 'accurate' | 'fast'

// Keep in sync with the default list in scripts/fetch-ocr-assets.mjs.
export const OCR_MODELS: Record<OcrModel, { family: string; label: string; sizeMB: number }> = {
  accurate: { family: 'PP-OCRv6_small', label: 'Accurate', sizeMB: 31 },
  fast: { family: 'PP-OCRv6_tiny', label: 'Fast', sizeMB: 6 },
}

// The ONNX Runtime files the OCR worker loads from /ort/.
// Keep in sync with ortFiles in scripts/fetch-ocr-assets.mjs.
const ORT_FILES = ['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm']

// Uncompressed size of each scanner file by name (plus `worker`), measured at
// build time by vite.config.ts.
declare const __SCANNER_BYTES__: Record<string, number>
const expectedBytes = (name: string) => __SCANNER_BYTES__[name] ?? 0

export type OcrProgress =
  | { stage: 'download'; loaded: number; total: number }
  | { stage: 'starting' }
  | { stage: 'reading' }

type Engine = Awaited<ReturnType<(typeof import('@paddleocr/paddleocr-js'))['PaddleOCR']['create']>>
type Listener = (p: OcrProgress) => void
type OnBytes = (loaded: number, total: number) => void

// Models are cached here by us rather than the service worker: the SDK's
// worker can't use a custom fetch, so we download with progress, keep the
// bytes in Cache Storage, and hand the SDK blob: URLs.
const CACHE = 'splitsnap-ocr-models-v1'
const engines = new Map<OcrModel, Promise<Engine>>()
// Everyone waiting on an engine that's still loading, and its latest progress,
// so a caller that arrives mid-download (Scan, after Home started it) sees it.
const watchers = new Map<OcrModel, { listeners: Set<Listener>; latest?: OcrProgress }>()

const BASE = import.meta.env.BASE_URL
const modelUrl = (file: string) => `${BASE}models/${file}.tar`

/** The OCR worker and ONNX Runtime files, which the SDK loads by URL. */
const runtimeFiles = () => [
  { url: ocrWorkerUrl, size: expectedBytes('worker') },
  ...ORT_FILES.map((file) => ({ url: `${BASE}ort/${file}`, size: expectedBytes(file) })),
]

/**
 * Streams `url`, reporting bytes read against `expected` (the uncompressed
 * size). Content-Length is only a fallback: compressed responses leave it out
 * or count compressed bytes. Returns the bytes when `keep` is set.
 */
async function download(url: string, expected: number, onBytes: OnBytes, keep: boolean) {
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`Couldn't download the scanner (HTTP ${res.status}).`)
  const total = expected || Number(res.headers.get('Content-Length')) || 0
  const reader = res.body.getReader()
  const chunks: Uint8Array<ArrayBuffer>[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (keep) chunks.push(value)
    loaded += value.length
    onBytes(loaded, Math.max(total, loaded))
  }
  onBytes(loaded, loaded)
  return chunks
}

async function getModelBlob(file: string, onBytes: OnBytes): Promise<Blob> {
  const url = modelUrl(file)
  const cache = await caches.open(CACHE)
  const hit = await cache.match(url)
  if (hit) {
    const blob = await hit.blob()
    onBytes(blob.size, blob.size)
    return blob
  }
  const chunks = await download(url, expectedBytes(`${file}.tar`), onBytes, true)
  const blob = new Blob(chunks, { type: 'application/x-tar' })
  await cache.put(url, new Response(blob, { headers: { 'Content-Length': String(blob.size) } }))
  return blob
}

/**
 * Fetches a worker or ONNX Runtime file once, so it's ready when the SDK asks
 * for it. The service worker's runtime route (vite.config.ts) or the HTTP cache
 * keeps the copy, so the bytes are counted and dropped rather than held here.
 */
async function prefetch({ url, size }: { url: string; size: number }, onBytes: OnBytes) {
  if (await caches.match(url)) return onBytes(size, size)
  await download(url, size, onBytes, false)
}

/** True when the model and the runtime files are all cached on this device. */
export async function isScannerDownloaded(model: OcrModel): Promise<boolean> {
  const { family } = OCR_MODELS[model]
  const cache = await caches.open(CACHE)
  const hits = await Promise.all([
    cache.match(modelUrl(`${family}_det`)),
    cache.match(modelUrl(`${family}_rec`)),
    ...runtimeFiles().map(({ url }) => caches.match(url)),
  ])
  return hits.every(Boolean)
}

/** Removes cached models other than `keep`, to free space after switching. */
export async function pruneModels(keep: OcrModel) {
  const cache = await caches.open(CACHE)
  const keepFamily = OCR_MODELS[keep].family
  for (const req of await cache.keys()) if (!req.url.includes(keepFamily)) await cache.delete(req)
}

async function createEngine(model: OcrModel, onProgress: Listener): Promise<Engine> {
  const { family } = OCR_MODELS[model]
  const det = `${family}_det`
  const rec = `${family}_rec`
  const runtime = runtimeFiles()

  // One bar for every file the scanner needs, fetched in parallel. Totals start
  // at the known sizes so the bar doesn't jump as responses arrive.
  const files: [loaded: number, total: number][] = [
    [0, expectedBytes(`${det}.tar`)],
    [0, expectedBytes(`${rec}.tar`)],
    ...runtime.map(({ size }): [number, number] => [0, size]),
  ]
  const track =
    (i: number): OnBytes =>
    (loaded, total) => {
      files[i] = [loaded, total]
      onProgress({
        stage: 'download',
        loaded: files.reduce((sum, [l]) => sum + l, 0),
        total: files.reduce((sum, [, t]) => sum + t, 0),
      })
    }
  const [[detBlob, recBlob]] = await Promise.all([
    Promise.all([getModelBlob(det, track(0)), getModelBlob(rec, track(1))]),
    Promise.all(runtime.map((file, i) => prefetch(file, track(i + 2)))),
  ])

  onProgress({ stage: 'starting' })
  const { PaddleOCR } = await import('@paddleocr/paddleocr-js')
  const detUrl = URL.createObjectURL(detBlob)
  const recUrl = URL.createObjectURL(recBlob)
  try {
    return await PaddleOCR.create({
      textDetectionModelName: det,
      textDetectionModelAsset: { url: detUrl },
      textRecognitionModelName: rec,
      textRecognitionModelAsset: { url: recUrl },
      // Start the worker from the URL prefetched above.
      worker: { createWorker: () => new Worker(ocrWorkerUrl, { type: 'module' }) },
      ortOptions: { backend: 'auto', wasmPaths: `${BASE}ort/` },
    })
  } finally {
    URL.revokeObjectURL(detUrl)
    URL.revokeObjectURL(recUrl)
  }
}

/**
 * Downloads (once) and starts the model without reading anything, e.g. from
 * Settings or as soon as the camera opens. Every caller shares one engine and
 * gets its progress, including callers that arrive mid-download.
 */
export function prepareEngine(model: OcrModel, onProgress?: Listener): Promise<Engine> {
  let engine = engines.get(model)
  if (!engine) {
    const watch: { listeners: Set<Listener>; latest?: OcrProgress } = { listeners: new Set() }
    watchers.set(model, watch)
    engine = createEngine(model, (p) => {
      watch.latest = p
      for (const listener of watch.listeners) listener(p)
    })
    engines.set(model, engine)
    const settled = () => watchers.delete(model)
    engine.then(settled, () => {
      engines.delete(model)
      settled()
    })
  }
  const watch = watchers.get(model)
  if (onProgress && watch) {
    watch.listeners.add(onProgress)
    if (watch.latest) onProgress(watch.latest)
    const unsubscribe = () => watch.listeners.delete(onProgress)
    engine.then(unsubscribe, unsubscribe)
  }
  return engine
}

/** Reads all text boxes from a receipt photo, entirely on this device. */
export async function recognize(image: ImageSource, model: OcrModel, onProgress: Listener = () => {}): Promise<OcrLine[]> {
  const engine = await prepareEngine(model, onProgress)
  onProgress({ stage: 'reading' })
  const [result] = await engine.predict(image)
  return result.items.map(({ text, score, poly }) => ({ text, score, poly }))
}
