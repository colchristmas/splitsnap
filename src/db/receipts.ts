import type { ParsedReceipt } from '../lib/receipt/parse'
import { DEFAULT_SPLIT_MODE, type Receipt } from '../lib/types'
import { ensureSelf } from './people'
import { db, newId } from './schema'

export function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Starts a draft receipt paid by "Me", optionally with a photo already attached. */
export async function createReceipt(image?: Blob): Promise<string> {
  const me = await ensureSelf()
  const id = newId()
  const now = Date.now()
  let imageId: string | undefined
  if (image) {
    imageId = newId()
    await db.images.add({ id: imageId, blob: image, createdAt: now })
  }
  await db.receipts.add({
    id,
    store: '',
    date: today(),
    status: 'draft',
    payerId: me.id,
    participantIds: [me.id],
    items: [],
    charges: [],
    imageId,
    createdAt: now,
    updatedAt: now,
  })
  return id
}

/** Applies `change` to the stored receipt (drafts autosave on every edit). */
export async function updateReceipt(id: string, change: (r: Receipt) => void) {
  await db.transaction('rw', db.receipts, async () => {
    const r = await db.receipts.get(id)
    if (!r) return
    change(r)
    r.updatedAt = Date.now()
    await db.receipts.put(r)
  })
}

/** Replaces a draft's items and charges with what the OCR parser found. */
export async function applyParsed(id: string, parsed: ParsedReceipt) {
  await updateReceipt(id, (r) => {
    if (parsed.store) r.store = parsed.store
    if (parsed.date) r.date = parsed.date
    r.printedTotalCents = parsed.printedTotalCents
    r.items = parsed.items.map((i) => ({ ...i, id: newId(), shares: {} }))
    r.charges = parsed.charges.map((c) => ({ ...c, id: newId(), splitMode: DEFAULT_SPLIT_MODE[c.kind] }))
  })
}

export async function deleteReceipt(id: string) {
  await db.transaction('rw', db.receipts, db.images, async () => {
    const r = await db.receipts.get(id)
    if (r?.imageId) await db.images.delete(r.imageId)
    await db.receipts.delete(id)
  })
}
