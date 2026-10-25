// Downloads the PaddleOCR models and copies the ONNX Runtime WASM files into
// public/ so the app serves them itself (required for COEP and offline use).
// Safe to re-run: files that already exist are skipped.
import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const MODEL_BASE =
  'https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0'

// Keep in sync with OCR_MODELS in src/lib/ocr/engine.ts.
const models = (process.env.OCR_MODELS ??
  'PP-OCRv6_small_det,PP-OCRv6_small_rec,PP-OCRv6_tiny_det,PP-OCRv6_tiny_rec').split(',')

// The OCR worker bundles onnxruntime-web 1.24.3 and loads the JSEP build,
// which covers both WebGPU and WASM.
const ortFiles = ['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm']

async function exists(path) {
  try {
    return (await stat(path)).size > 0
  } catch {
    return false
  }
}

await mkdir(join(root, 'public/models'), { recursive: true })
for (const name of models) {
  const dest = join(root, 'public/models', `${name}.tar`)
  if (await exists(dest)) continue
  const url = `${MODEL_BASE}/${name}_onnx_infer.tar`
  process.stdout.write(`Downloading ${name}… `)
  const bytes = await download(url)
  await writeFile(dest, bytes)
  console.log(`${(bytes.length / 1e6).toFixed(1)} MB`)
}

// The model host is in Beijing and drops long transfers now and then.
async function download(url, attempts = 4) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
      return new Uint8Array(await res.arrayBuffer())
    } catch (err) {
      if (i >= attempts) throw err
      process.stdout.write(`retry ${i}… `)
    }
  }
}

await mkdir(join(root, 'public/ort'), { recursive: true })
for (const file of ortFiles) {
  const dest = join(root, 'public/ort', file)
  if (await exists(dest)) continue
  await copyFile(join(root, 'node_modules/onnxruntime-web/dist', file), dest)
  console.log(`Copied ${file}`)
}
