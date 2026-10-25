import type { OcrLine } from '../receipt/parse'

export type OcrModel = 'accurate' | 'fast'

// Keep in sync with the default list in scripts/fetch-ocr-assets.mjs.
export const OCR_MODELS: Record<OcrModel, { family: string; label: string; sizeMB: number }> = {
  accurate: { family: 'PP-OCRv6_small', label: 'Accurate', sizeMB: 31 },
  fast: { family: 'PP-OCRv6_tiny', label: 'Fast', sizeMB: 6 },
}

export type OcrProgress =
  | { stage: 'download'; loaded: number; total: number }
  | { stage: 'starting' }
  | { stage: 'reading' }

type Engine = Awaited<ReturnType<(typeof import('@paddleocr/paddleocr-js'))['PaddleOCR']['create']>>

// Models are cached here by us rather than the service worker: the SDK's
// worker can't use a custom fetch, so we download with progress, keep the
// bytes in Cache Storage, and hand the SDK blob: URLs.
const CACHE = 'splitsnap-ocr-models-v1'
const engines = new Map<OcrModel, Promise<Engine>>()

const modelUrl = (file: string) => `${import.meta.env.BASE_URL}models/${file}.tar`

async function getModelBlob(file: string, onBytes: (loaded: number, total: number) => void): Promise<Blob> {
  const url = modelUrl(file)
  const cache = await caches.open(CACHE)
  const hit = await cache.match(url)
  if (hit) {
    const blob = await hit.blob()
    onBytes(blob.size, blob.size)
    return blob
  }
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`Couldn't download the scanner (HTTP ${res.status}).`)
  const total = Number(res.headers.get('Content-Length')) || 0
  const reader = res.body.getReader()
  const chunks: Uint8Array<ArrayBuffer>[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
    onBytes(loaded, total || loaded)
  }
  const blob = new Blob(chunks, { type: 'application/x-tar' })
  await cache.put(url, new Response(blob, { headers: { 'Content-Length': String(blob.size) } }))
  return blob
}

/** True when both of the model's files are already cached on this device. */
export async function isModelDownloaded(model: OcrModel): Promise<boolean> {
  const { family } = OCR_MODELS[model]
  const cache = await caches.open(CACHE)
  const hits = await Promise.all([cache.match(modelUrl(`${family}_det`)), cache.match(modelUrl(`${family}_rec`))])
  return hits.every(Boolean)
}

/** Removes cached models other than `keep`, to free space after switching. */
export async function pruneModels(keep: OcrModel) {
  const cache = await caches.open(CACHE)
  const keepFamily = OCR_MODELS[keep].family
  for (const req of await cache.keys()) if (!req.url.includes(keepFamily)) await cache.delete(req)
}

async function createEngine(model: OcrModel, onProgress: (p: OcrProgress) => void): Promise<Engine> {
  const { family } = OCR_MODELS[model]
  const bytes = { det: [0, 0], rec: [0, 0] }
  const report = () =>
    onProgress({ stage: 'download', loaded: bytes.det[0] + bytes.rec[0], total: bytes.det[1] + bytes.rec[1] })
  const [det, rec] = await Promise.all([
    getModelBlob(`${family}_det`, (l, t) => ((bytes.det = [l, t]), report())),
    getModelBlob(`${family}_rec`, (l, t) => ((bytes.rec = [l, t]), report())),
  ])

  onProgress({ stage: 'starting' })
  const { PaddleOCR } = await import('@paddleocr/paddleocr-js')
  const detUrl = URL.createObjectURL(det)
  const recUrl = URL.createObjectURL(rec)
  try {
    return await PaddleOCR.create({
      textDetectionModelName: `${family}_det`,
      textDetectionModelAsset: { url: detUrl },
      textRecognitionModelName: `${family}_rec`,
      textRecognitionModelAsset: { url: recUrl },
      worker: true,
      ortOptions: { backend: 'auto', wasmPaths: `${import.meta.env.BASE_URL}ort/` },
    })
  } finally {
    URL.revokeObjectURL(detUrl)
    URL.revokeObjectURL(recUrl)
  }
}

/** Downloads (once) and starts the model without reading anything, e.g. from Settings. */
export async function prepareEngine(model: OcrModel, onProgress: (p: OcrProgress) => void = () => {}) {
  let engine = engines.get(model)
  if (!engine) {
    engine = createEngine(model, onProgress)
    engines.set(model, engine)
    engine.catch(() => engines.delete(model))
  }
  return engine
}

/** Reads all text boxes from a receipt photo, entirely on this device. */
export async function recognize(
  image: Blob,
  model: OcrModel,
  onProgress: (p: OcrProgress) => void = () => {},
): Promise<OcrLine[]> {
  const engine = await prepareEngine(model, onProgress)
  onProgress({ stage: 'reading' })
  const [result] = await engine.predict(image)
  return result.items.map(({ text, score, poly }) => ({ text, score, poly }))
}
