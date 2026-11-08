// Receipt images are stored once, already oriented and downscaled, and kept
// in color for viewing later. The OCR reads a grayscale, high-contrast copy
// (enhanceForOcr). A pixel budget (rather than a max side) keeps tall
// scrolling screenshots readable: a 1179×5000 order screenshot stays near
// full width instead of shrinking to 470px.
const MAX_PIXELS = 4_000_000
// Matches the OCR detector's own upper limit.
const MAX_SIDE = 4000
const QUALITY = 0.82

/**
 * Applies EXIF orientation, an optional extra rotation (multiples of 90°),
 * and downscales to at most ~4 megapixels. Returns a JPEG.
 */
export async function prepareImage(source: Blob, rotate: 0 | 90 | 180 | 270 = 0): Promise<Blob> {
  const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' })
  const scale = Math.min(
    1,
    Math.sqrt(MAX_PIXELS / (bitmap.width * bitmap.height)),
    MAX_SIDE / Math.max(bitmap.width, bitmap.height),
  )
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const swap = rotate === 90 || rotate === 270

  const canvas = document.createElement('canvas')
  canvas.width = swap ? h : w
  canvas.height = swap ? w : h
  const ctx = canvas.getContext('2d')!
  // Screenshots can have transparent areas, which JPEG would turn black.
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((rotate * Math.PI) / 180)
  ctx.drawImage(bitmap, -w / 2, -h / 2, w, h)
  bitmap.close()

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process the image.'))), 'image/jpeg', QUALITY),
  )
}

/**
 * Makes the copy of a stored receipt photo that the OCR reads: grayscale,
 * with the contrast stretched. The stored photo itself is left unchanged.
 */
export async function enhanceForOcr(source: Blob): Promise<ImageData> {
  const bitmap = await createImageBitmap(source)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  enhanceContrast(image.data)
  return image
}

// Share of pixels clipped to pure black at the dark end and pure white at the
// bright end, so a few specks or glare spots don't limit the stretch.
const CLIP = 0.01
// Caps the stretch at about 5×. A nearly blank photo would otherwise have its
// sensor noise blown up into specks the OCR could read as text.
const MIN_RANGE = 48

/**
 * Converts RGBA pixels to grayscale in place, then stretches the contrast so
 * the darkest 1% become black and the brightest 1% white. Faded thermal print,
 * gray paper and dim photos come out as dark text on white.
 */
export function enhanceContrast(data: Uint8ClampedArray) {
  const pixels = data.length / 4
  if (pixels === 0) return
  const gray = new Uint8Array(pixels)
  const histogram = new Uint32Array(256)
  for (let i = 0; i < pixels; i++) {
    const o = i * 4
    // Rec. 601 luma in integer math; the weights sum to 256, so white stays 255.
    const y = (data[o] * 77 + data[o + 1] * 150 + data[o + 2] * 29) >> 8
    gray[i] = y
    histogram[y]++
  }

  const low = percentile(histogram, pixels * CLIP)
  const high = percentile(histogram, pixels * (1 - CLIP))
  // Widen a too-narrow range around its middle, so a blank page stays mid-gray
  // instead of turning black.
  const span = Math.max(high - low, MIN_RANGE)
  const start = Math.min(Math.max(Math.round((low + high - span) / 2), 0), 255 - span)

  // Uint8ClampedArray rounds and clamps to 0–255 on assignment.
  const levels = new Uint8ClampedArray(256)
  for (let v = 0; v < 256; v++) levels[v] = ((v - start) * 255) / span
  for (let i = 0; i < pixels; i++) {
    const o = i * 4
    data[o] = data[o + 1] = data[o + 2] = levels[gray[i]]
  }
}

/** The gray level at which the count of darker-or-equal pixels passes `rank`. */
function percentile(histogram: Uint32Array, rank: number): number {
  let seen = 0
  for (let v = 0; v < 256; v++) {
    seen += histogram[v]
    if (seen > rank) return v
  }
  return 255
}
