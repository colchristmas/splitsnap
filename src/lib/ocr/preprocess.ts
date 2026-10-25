// Receipt images are stored once, already oriented and downscaled, and the
// same image is used for OCR and for viewing later. A pixel budget (rather
// than a max side) keeps tall scrolling screenshots readable: a 1179×5000
// order screenshot stays near full width instead of shrinking to 470px.
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
