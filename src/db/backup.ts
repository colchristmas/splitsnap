import type { Group, Person, Receipt } from '../lib/types'
import { db } from './schema'

interface BackupFile {
  app: 'splitsnap'
  version: 1
  exportedAt: string
  people: Person[]
  groups: Group[]
  receipts: Receipt[]
  /** Receipt photos as data: URLs; left out when exporting without photos. */
  images?: { id: string; dataUrl: string; createdAt: number }[]
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

export async function exportBackup(includePhotos: boolean): Promise<Blob> {
  const [people, groups, receipts] = await Promise.all([db.people.toArray(), db.groups.toArray(), db.receipts.toArray()])
  const file: BackupFile = { app: 'splitsnap', version: 1, exportedAt: new Date().toISOString(), people, groups, receipts }
  if (includePhotos) {
    const images = await db.images.toArray()
    file.images = await Promise.all(
      images.map(async (i) => ({ id: i.id, dataUrl: await blobToDataUrl(i.blob), createdAt: i.createdAt })),
    )
  } else {
    file.receipts = receipts.map((r) => ({ ...r, imageId: undefined }))
  }
  return new Blob([JSON.stringify(file)], { type: 'application/json' })
}

/**
 * Restores a backup. "replace" wipes this device first; "merge" keeps local
 * data and overwrites anything with the same id. The backup's "Me" is mapped
 * onto this device's "Me" so there's never two.
 */
export async function importBackup(text: string, mode: 'merge' | 'replace') {
  let file: BackupFile
  try {
    file = JSON.parse(text)
  } catch {
    throw new Error("That file isn't a SplitSnap backup.")
  }
  if (file?.app !== 'splitsnap' || !Array.isArray(file.people) || !Array.isArray(file.receipts)) {
    throw new Error("That file isn't a SplitSnap backup.")
  }

  const images = await Promise.all(
    (file.images ?? []).map(async (i) => ({ id: i.id, blob: await (await fetch(i.dataUrl)).blob(), createdAt: i.createdAt })),
  )

  await db.transaction('rw', [db.people, db.groups, db.receipts, db.images], async () => {
    if (mode === 'replace') await Promise.all([db.people.clear(), db.groups.clear(), db.receipts.clear(), db.images.clear()])

    let people = file.people
    let groups = file.groups ?? []
    let receipts = file.receipts
    const localSelf = await db.people.filter((p) => Boolean(p.isSelf)).first()
    const theirSelf = people.find((p) => p.isSelf)
    if (localSelf && theirSelf && localSelf.id !== theirSelf.id) {
      const swap = (id: string) => (id === theirSelf.id ? localSelf.id : id)
      people = people.filter((p) => p !== theirSelf)
      groups = groups.map((g) => ({ ...g, memberIds: g.memberIds.map(swap) }))
      receipts = receipts.map((r) => ({
        ...r,
        payerId: swap(r.payerId),
        participantIds: r.participantIds.map(swap),
        items: r.items.map((i) => ({
          ...i,
          shares: Object.fromEntries(Object.entries(i.shares).map(([k, v]) => [swap(k), v])),
        })),
      }))
    }

    await db.people.bulkPut(people)
    await db.groups.bulkPut(groups)
    await db.receipts.bulkPut(receipts)
    await db.images.bulkPut(images)
  })
}

export async function clearAllData() {
  await db.transaction('rw', [db.people, db.groups, db.receipts, db.images], () =>
    Promise.all([db.people.clear(), db.groups.clear(), db.receipts.clear(), db.images.clear()]),
  )
}
