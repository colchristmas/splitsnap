// Two-way sync between this device's Dexie database and the account's
// encrypted records on the server. The app keeps reading and writing Dexie as
// before; this compares it with what was last synced, pushes the differences
// and pulls what other devices changed.

import { DEFAULT_CATEGORIES } from '../lib/categories'
import type { Person } from '../lib/types'
import { remapGroup, remapReceipt, replaceId } from '../db/remap'
import type { SplitSnapDB } from '../db/schema'
import { canonicalJson, decryptBytes, decryptJson, encryptBytes, encryptJson, hashString, recordKey, type WorkingKeys } from './crypto'
import type { SyncStateDB, SyncedRef } from './store'

/** Settings stay per device: the scanner model and the category-rules marker belong to each install. */
export const SYNCED_TABLES = ['people', 'groups', 'receipts', 'categories', 'categoryMemory', 'images'] as const
export type SyncedTable = (typeof SYNCED_TABLES)[number]

export interface RemoteRow {
  key: string
  /** base64 of iv ‖ ciphertext; null for a deleted record. */
  data: string | null
  deleted: boolean
  /** Client time of the change, in ms. */
  changedAt: number
  /** Server-assigned, increasing with every write. */
  seq: number
}

export type PushRow = Omit<RemoteRow, 'seq'>

/** The server, as sync sees it. Supabase in the app (remote.ts); an in-memory fake in tests. */
export interface Remote {
  /** Rows written after `since`, in seq order. */
  pull(since: number, limit: number): Promise<RemoteRow[]>
  push(rows: PushRow[]): Promise<void>
  uploadPhoto(key: string, data: Uint8Array<ArrayBuffer>): Promise<void>
  /** Null when the photo isn't in storage. */
  downloadPhoto(key: string): Promise<Uint8Array<ArrayBuffer> | null>
  deletePhotos(keys: string[]): Promise<void>
}

export interface SyncContext {
  db: SplitSnapDB
  state: SyncStateDB
  remote: Remote
  keys: WorkingKeys
}

/** The plaintext inside every record: which table it belongs to, and the row. */
interface Envelope {
  t: SyncedTable
  v: Row
}

type Row = Record<string, unknown>

const PULL_PAGE = 500
const PUSH_BATCH = 200

const keyPath = (ctx: SyncContext, t: SyncedTable) => ctx.db.table(t).schema.primKey.keyPath as string
const refOf = (t: SyncedTable, id: string) => `${t}:${id}`
// Ids can contain ":" (categoryMemory keys are "item:…"), table names can't.
const parseRef = (ref: string): [SyncedTable, string] => {
  const i = ref.indexOf(':')
  return [ref.slice(0, i) as SyncedTable, ref.slice(i + 1)]
}

/** What's synced for a row. A photo's bytes go to storage separately, so its record only carries metadata. */
function syncedValue(t: SyncedTable, row: Row): Row {
  if (t !== 'images') return row
  const { blob, ...meta } = row
  return { ...meta, type: (blob as Blob).type }
}

const hashValue = (value: Row) => hashString(canonicalJson(value))
const hashRow = (t: SyncedTable, row: Row) => hashValue(syncedValue(t, row))

/**
 * When a record changed both here (not pushed yet) and on another device, the
 * other device's version wins, except for a receipt edited later here.
 */
const keepLocal = (t: SyncedTable, local: Row, incoming: RemoteRow) =>
  t === 'receipts' && typeof local.updatedAt === 'number' && local.updatedAt > incoming.changedAt

/** Pulls, then pushes. Returns how many records were pushed. */
export async function sync(ctx: SyncContext): Promise<number> {
  await pull(ctx)
  return push(ctx)
}

/** Applies every row written since the last pull. `serverWins` skips the conflict rule (used by "replace"). */
export async function pull(ctx: SyncContext, { serverWins = false } = {}) {
  let cursor = await ctx.state.getMeta('cursor', 0)
  for (;;) {
    const rows = await ctx.remote.pull(cursor, PULL_PAGE)
    for (const row of rows) await applyRow(ctx, row, serverWins)
    if (rows.length > 0) {
      cursor = rows[rows.length - 1].seq
      await ctx.state.setMeta('cursor', cursor)
    }
    if (rows.length < PULL_PAGE) return
  }
}

async function applyRow(ctx: SyncContext, row: RemoteRow, serverWins: boolean) {
  const known = await ctx.state.synced.where('key').equals(row.key).first()

  if (row.deleted || row.data === null) {
    if (!known) return // never had it here
    const [t, id] = parseRef(known.ref)
    const table = ctx.db.table(t)
    const kept = await ctx.db.transaction('rw', table, async () => {
      const local = (await table.get(id)) as Row | undefined
      if (local && !serverWins && hashRow(t, local) !== known.hash && keepLocal(t, local, row)) return true
      await table.delete(id)
      return false
    })
    if (!kept) await ctx.state.synced.delete(known.ref)
    return
  }

  const { t, v } = await decryptJson<Envelope>(ctx.keys.encKey, row.data, row.key)
  if (!SYNCED_TABLES.includes(t)) return // from a newer app version
  const id = String(v[keyPath(ctx, t)])
  const ref = refOf(t, id)
  const hash = hashValue(v)
  const entry = known ?? (await ctx.state.synced.get(ref))
  // The version this device last synced: typically its own push coming back.
  // Nothing new, and applying it would undo local changes made since.
  if (entry?.hash === hash) return

  let value = v
  if (t === 'images') {
    // Photos never change once saved, so one already here needs no download.
    if (await ctx.db.images.get(id)) {
      await ctx.state.synced.put({ ref, key: row.key, hash })
      return
    }
    const data = await ctx.remote.downloadPhoto(row.key)
    if (!data) return // missing from storage: the receipt still shows, without its photo
    const { type, ...meta } = v
    value = { ...meta, blob: new Blob([await decryptBytes(ctx.keys.encKey, data, row.key)], { type: String(type) }) }
  }

  const table = ctx.db.table(t)
  const outcome = await ctx.db.transaction('rw', table, async () => {
    const local = (await table.get(id)) as Row | undefined
    if (local) {
      const localHash = hashRow(t, local)
      if (localHash === hash) return 'same'
      const dirty = !entry || entry.hash !== localHash
      if (dirty && !serverWins && keepLocal(t, local, row)) return 'kept'
    }
    await table.put(value)
    return 'applied'
  })
  // A kept local edit stays "dirty", so the next push sends it.
  if (outcome !== 'kept') await ctx.state.synced.put({ ref, key: row.key, hash })
}

/** Sends every record that changed since it was last synced, and tombstones for deleted ones. */
export async function push(ctx: SyncContext): Promise<number> {
  const synced = new Map((await ctx.state.synced.toArray()).map((s) => [s.ref, s]))
  const seen = new Set<string>()
  const pending: { entry: SyncedRef; row: PushRow }[] = []
  const now = Date.now()
  const seal = (key: string, t: SyncedTable, v: Row) => encryptJson(ctx.keys.encKey, { t, v } satisfies Envelope, key)

  for (const t of SYNCED_TABLES) {
    if (t === 'images') {
      for (const id of (await ctx.db.images.toCollection().primaryKeys()) as string[]) {
        const ref = refOf(t, id)
        seen.add(ref)
        if (synced.has(ref)) continue // photos never change
        const image = await ctx.db.images.get(id)
        if (!image) continue
        const key = await recordKey(ctx.keys.macKey, t, id)
        const bytes = new Uint8Array(await image.blob.arrayBuffer())
        await ctx.remote.uploadPhoto(key, await encryptBytes(ctx.keys.encKey, bytes, key))
        const value = syncedValue(t, image as unknown as Row)
        pending.push({ entry: { ref, key, hash: hashValue(value) }, row: { key, data: await seal(key, t, value), deleted: false, changedAt: now } })
      }
      continue
    }

    const pk = keyPath(ctx, t)
    for (const local of (await ctx.db.table(t).toArray()) as Row[]) {
      const id = String(local[pk])
      const ref = refOf(t, id)
      seen.add(ref)
      const hash = hashValue(local)
      const known = synced.get(ref)
      if (known?.hash === hash) continue
      const key = known?.key ?? (await recordKey(ctx.keys.macKey, t, id))
      const changedAt = t === 'receipts' && typeof local.updatedAt === 'number' ? local.updatedAt : now
      pending.push({ entry: { ref, key, hash }, row: { key, data: await seal(key, t, local), deleted: false, changedAt } })
    }
  }

  const gone = [...synced.values()].filter((s) => !seen.has(s.ref))
  for (const entry of gone) pending.push({ entry, row: { key: entry.key, data: null, deleted: true, changedAt: now } })

  for (let i = 0; i < pending.length; i += PUSH_BATCH) {
    const batch = pending.slice(i, i + PUSH_BATCH)
    await ctx.remote.push(batch.map((p) => p.row))
    await ctx.state.transaction('rw', ctx.state.synced, async () => {
      for (const { entry, row } of batch) {
        if (row.deleted) await ctx.state.synced.delete(entry.ref)
        else await ctx.state.synced.put(entry)
      }
    })
  }

  // A photo left behind is harmless (unreadable, and no record points to it),
  // so a failed cleanup doesn't fail the sync.
  const photos = gone.filter((s) => s.ref.startsWith('images:')).map((s) => s.key)
  if (photos.length > 0) await ctx.remote.deletePhotos(photos).catch((e: unknown) => console.warn('Photo cleanup failed', e))
  return pending.length
}

// ---- First sign-in on a device

export type LinkMode = 'merge' | 'replace'

/** True if this device has anything beyond what a fresh install creates. */
export async function deviceHasData(db: SplitSnapDB): Promise<boolean> {
  const [receipts, groups, memory, people, categories] = await Promise.all([
    db.receipts.count(),
    db.groups.count(),
    db.categoryMemory.count(),
    db.people.toArray(),
    db.categories.toArray(),
  ])
  if (receipts || groups || memory) return true
  if (people.some((p) => !p.isSelf || p.name !== 'Me')) return true
  const byId = <T extends { id: string }>(list: T[]) => [...list].sort((a, b) => (a.id < b.id ? -1 : 1))
  return canonicalJson(byId(categories)) !== canonicalJson(byId(DEFAULT_CATEGORIES))
}

/** True if the account has at least one record. */
export async function accountHasData(remote: Remote): Promise<boolean> {
  return (await remote.pull(0, 1)).length > 0
}

/**
 * Connects this device to an account for the first time.
 * - "replace": the account's data replaces this device's.
 * - "merge": both are kept. People with the same name become one person, and
 *   this device's "Me" becomes the account's "Me".
 */
export async function linkDevice(ctx: SyncContext, mode: LinkMode) {
  await ctx.state.forgetSynced()
  await pull(ctx, { serverWins: mode === 'replace' })
  if (mode === 'replace') await dropLocalOnly(ctx)
  else await mergePeople(ctx)
  if ((await ctx.db.categories.count()) === 0) await ctx.db.categories.bulkAdd(DEFAULT_CATEGORIES)
  await push(ctx)
}

/** Deletes every record the account doesn't have. */
async function dropLocalOnly(ctx: SyncContext) {
  const synced = new Set((await ctx.state.synced.toCollection().primaryKeys()) as string[])
  for (const t of SYNCED_TABLES) {
    const ids = (await ctx.db.table(t).toCollection().primaryKeys()) as string[]
    const drop = ids.filter((id) => !synced.has(refOf(t, id)))
    if (drop.length > 0) await ctx.db.table(t).bulkDelete(drop)
  }
}

/** Folds this device's people into the account's: its "Me" into the account's "Me", and same-name people together. */
async function mergePeople(ctx: SyncContext) {
  const synced = new Set((await ctx.state.synced.toCollection().primaryKeys()) as string[])
  const people = await ctx.db.people.toArray()
  const fromAccount = people.filter((p) => synced.has(refOf('people', p.id)))
  if (fromAccount.length === 0) return
  const name = (p: Person) => p.name.trim().toLowerCase()
  const accountSelf = fromAccount.find((p) => p.isSelf)

  const merges: [from: Person, to: Person][] = []
  for (const local of people.filter((p) => !synced.has(refOf('people', p.id)))) {
    const match = local.isSelf ? accountSelf : fromAccount.find((p) => !p.isSelf && !p.archived && name(p) === name(local))
    if (match) merges.push([local, match])
  }
  if (merges.length === 0) return

  await ctx.db.transaction('rw', ctx.db.people, ctx.db.groups, ctx.db.receipts, async () => {
    for (const [from, to] of merges) {
      const swap = replaceId(from.id, to.id)
      await ctx.db.receipts.toCollection().modify((r) => void Object.assign(r, remapReceipt(r, swap)))
      await ctx.db.groups.toCollection().modify((g) => void Object.assign(g, remapGroup(g, swap)))
      await ctx.db.people.delete(from.id)
    }
  })
}
