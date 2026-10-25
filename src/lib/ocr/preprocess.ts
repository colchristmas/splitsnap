// Receipt photos are stored once, already oriented and downscaled, and the
// same image is used for OCR and for viewing later.
const MAX_SIDE = 2000
const QUALITY = 0.82

/**
 * Applies EXIF orientation, an optional extra rotation (multiples of 90°),
 * and downscales so the long side is at most 2000px. Returns a JPEG.
 */
export async function prepareImage(source: Blob, rotate: 0 | 90 | 180 | 270 = 0): Promise<Blob> {
  const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' })
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const swap = rotate === 90 || rotate === 270

  const canvas = document.createElement('canvas')
  canvas.width = swap ? h : w
  canvas.height = swap ? w : h
  const ctx = canvas.getContext('2d')!
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((rotate * Math.PI) / 180)
  ctx.drawImage(bitmap, -w / 2, -h / 2, w, h)
  bitmap.close()

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process the photo.'))), 'image/jpeg', QUALITY),
  )
}
