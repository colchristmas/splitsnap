import 'fake-indexeddb/auto'
import { beforeAll, describe, expect, it } from 'vitest'
import { SplitSnapDB } from '../db/schema'
import type { Person, Receipt } from '../lib/types'
import { deriveWorkingKeys, newVaultKey, type WorkingKeys } from './crypto'
import { linkDevice, pull, push, sync, type PushRow, type Remote, type RemoteRow, type SyncContext } from './engine'
import { SyncStateDB } from './store'

/** An in-memory stand-in for Supabase: rows get increasing seqs, photos are kept by key. */
class FakeServer implements Remote {
  rows = new Map<string, RemoteRow>()
  photos = new Map<string, Uint8Array<ArrayBuffer>>()
  pushed = 0
  offline = false
  private seq = 0

  async pull(since: number, limit: number) {
    this.check()
    return [...this.rows.values()]
      .filter((r) => r.seq > since)
      .sort((a, b) => a.seq - b.seq)
      .slice(0, limit)
      .map((r) => ({ ...r }))
  }
  async push(rows: PushRow[]) {
    this.check()
    this.pushed += rows.length
    for (const r of rows) this.rows.set(r.key, { ...r, seq: ++this.seq })
  }
  async uploadPhoto(key: string, data: Uint8Array<ArrayBuffer>) {
    this.check()
    this.photos.set(key, data.slice())
  }
  async downloadPhoto(key: string) {
    this.check()
    return this.photos.get(key)?.slice() ?? null
  }
  async deletePhotos(keys: string[]) {
    this.check()
    for (const k of keys) this.photos.delete(k)
  }
  private check() {
    if (this.offline) throw new TypeError('Failed to fetch')
  }
}

let keys: WorkingKeys
let count = 0
beforeAll(async () => {
  keys = await deriveWorkingKeys(newVaultKey())
})

async function device(server: FakeServer): Promise<SyncContext> {
  const name = `device-${count++}`
  const db = new SplitSnapDB(name)
  await db.open() // creating the database adds the starter categories
  return { db, state: new SyncStateDB(`${name}-sync`), remote: server, keys }
}

const person = (id: string, name: string, extra: Partial<Person> = {}): Person => ({
  id,
  name,
  color: '#000',
  createdAt: 1,
  lastUsedAt: 1,
  ...extra,
})

const receipt = (id: string, payerId: string, extra: Partial<Receipt> = {}): Receipt => ({
  id,
  store: 'Corner Market',
  date: '2026-11-01',
  status: 'final',
  payerId,
  participantIds: [payerId],
  items: [{ id: `${id}-i`, name: 'Oat milk', quantity: 1, totalCents: 499, discountCents: 0, shares: { [payerId]: 1 } }],
  charges: [],
  createdAt: 1,
  updatedAt: 1,
  ...extra,
})

const photo = (text: string) => new Blob([new TextEncoder().encode(text)], { type: 'image/jpeg' })
const blobText = async (blob: Blob) => new TextDecoder().decode(await blob.arrayBuffer())

describe('sync between two devices', () => {
  it('copies people, receipts and photos across, and the server only sees ciphertext', async () => {
    const server = new FakeServer()
    const [a, b] = [await device(server), await device(server)]
    await a.db.people.bulkAdd([person('me', 'Me', { isSelf: true }), person('alex', 'Alex')])
    // Long ids: a short one like "r1" can turn up in random base64 by chance.
    await a.db.images.add({ id: 'photo-id-9c2e51', blob: photo('jpeg bytes'), createdAt: 5 })
    await a.db.receipts.add(receipt('receipt-id-7f3a08', 'me', { imageId: 'photo-id-9c2e51' }))
    await sync(a)
    await sync(b)

    expect((await b.db.people.get('alex'))?.name).toBe('Alex')
    expect((await b.db.receipts.get('receipt-id-7f3a08'))?.store).toBe('Corner Market')
    const image = await b.db.images.get('photo-id-9c2e51')
    expect(image?.blob.type).toBe('image/jpeg')
    expect(await blobText(image!.blob)).toBe('jpeg bytes')

    const everything = JSON.stringify([...server.rows.values()]) + [...server.photos.values()].map((p) => new TextDecoder().decode(p)).join()
    for (const secret of ['Corner Market', 'Oat milk', 'Alex', 'receipt-id-7f3a08', 'photo-id-9c2e51', 'jpeg bytes', 'receipts', 'image/jpeg']) {
      expect(everything).not.toContain(secret)
    }
  })

  it('sends nothing when nothing changed', async () => {
    const server = new FakeServer()
    const [a, b] = [await device(server), await device(server)]
    await a.db.receipts.add(receipt('r1', 'me'))
    await sync(a)
    await sync(b)
    const before = server.pushed
    expect(await sync(a)).toBe(0)
    expect(await sync(b)).toBe(0)
    expect(server.pushed).toBe(before)
  })

  it('carries edits and deletes both ways, and deletes the photo from storage', async () => {
    const server = new FakeServer()
    const [a, b] = [await device(server), await device(server)]
    await a.db.images.add({ id: 'img1', blob: photo('x'), createdAt: 1 })
    await a.db.receipts.add(receipt('r1', 'me', { imageId: 'img1' }))
    await sync(a)
    await sync(b)

    await b.db.receipts.update('r1', { store: 'Bakery', updatedAt: 2 })
    await sync(b)
    await sync(a)
    expect((await a.db.receipts.get('r1'))?.store).toBe('Bakery')

    await a.db.receipts.delete('r1')
    await a.db.images.delete('img1')
    await sync(a)
    await sync(b)
    expect(await b.db.receipts.get('r1')).toBeUndefined()
    expect(await b.db.images.get('img1')).toBeUndefined()
    expect(server.photos.size).toBe(0)
  })

  it("doesn't let its own earlier push undo a later local change", async () => {
    const server = new FakeServer()
    const a = await device(server)
    await a.db.people.add(person('alex', 'Alex'))
    await a.db.receipts.add(receipt('r1', 'me'))
    await sync(a)
    await a.db.people.update('alex', { name: 'Alexandra' })
    await a.db.receipts.delete('r1')
    await sync(a) // pulls its own first push back before pushing these changes
    expect((await a.db.people.get('alex'))?.name).toBe('Alexandra')
    expect(await a.db.receipts.get('r1')).toBeUndefined()
    await sync(a)
    expect(await a.db.receipts.get('r1')).toBeUndefined()
  })

  it('treats a rotated photo (new id) as a new upload and removes the old one', async () => {
    const server = new FakeServer()
    const [a, b] = [await device(server), await device(server)]
    await a.db.images.add({ id: 'old', blob: photo('sideways'), createdAt: 1 })
    await a.db.receipts.add(receipt('r1', 'me', { imageId: 'old' }))
    await sync(a)

    await a.db.transaction('rw', a.db.images, a.db.receipts, async () => {
      await a.db.images.add({ id: 'new', blob: photo('upright'), createdAt: 2 })
      await a.db.images.delete('old')
      await a.db.receipts.update('r1', { imageId: 'new', updatedAt: 2 })
    })
    await sync(a)
    await sync(b)
    expect((await b.db.receipts.get('r1'))?.imageId).toBe('new')
    expect(await blobText((await b.db.images.get('new'))!.blob)).toBe('upright')
    expect(await b.db.images.get('old')).toBeUndefined()
    expect(server.photos.size).toBe(1)
  })

  it('keeps a later local receipt edit over an earlier one from another device', async () => {
    const server = new FakeServer()
    const [a, b] = [await device(server), await device(server)]
    await a.db.receipts.add(receipt('r1', 'me'))
    await sync(a)
    await sync(b)

    await a.db.receipts.update('r1', { store: 'From A', updatedAt: 100 })
    await b.db.receipts.update('r1', { store: 'From B', updatedAt: 200 })
    await sync(a)
    await sync(b) // B's edit is newer: kept, then pushed
    await sync(a)
    expect((await a.db.receipts.get('r1'))?.store).toBe('From B')
    expect((await b.db.receipts.get('r1'))?.store).toBe('From B')
  })

  it("takes the other device's version when the local edit is older, or isn't a receipt", async () => {
    const server = new FakeServer()
    const [a, b] = [await device(server), await device(server)]
    await a.db.receipts.add(receipt('r1', 'me'))
    await a.db.people.add(person('alex', 'Alex'))
    await sync(a)
    await sync(b)

    await a.db.receipts.update('r1', { store: 'From A', updatedAt: 300 })
    await a.db.people.update('alex', { name: 'Alex A' })
    await b.db.receipts.update('r1', { store: 'From B', updatedAt: 200 })
    await b.db.people.update('alex', { name: 'Alex B' })
    await sync(a)
    await sync(b)
    expect((await b.db.receipts.get('r1'))?.store).toBe('From A')
    expect((await b.db.people.get('alex'))?.name).toBe('Alex A')
  })

  it('catches up after being offline', async () => {
    const server = new FakeServer()
    const [a, b] = [await device(server), await device(server)]
    await a.db.receipts.add(receipt('r1', 'me'))
    server.offline = true
    await expect(sync(a)).rejects.toThrow('Failed to fetch')
    server.offline = false
    await sync(a)
    await sync(b)
    expect(await b.db.receipts.get('r1')).toBeDefined()
  })

  it('pulls in pages without missing rows', async () => {
    const server = new FakeServer()
    const [a, b] = [await device(server), await device(server)]
    await a.db.people.bulkAdd(Array.from({ length: 1201 }, (_, i) => person(`p${i}`, `Person ${i}`)))
    await push(a)
    await pull(b)
    expect(await b.db.people.count()).toBe(1201)
  })
})

describe('linking a device to an account', () => {
  it('merge: keeps both, folds "Me" and same-name people into the account\'s', async () => {
    const server = new FakeServer()
    const [a, b] = [await device(server), await device(server)]
    await a.db.people.bulkAdd([person('a-me', 'Sam', { isSelf: true }), person('a-alex', 'Alex')])
    await a.db.receipts.add(receipt('ra', 'a-me'))
    await sync(a)

    await b.db.people.bulkAdd([person('b-me', 'Me', { isSelf: true }), person('b-alex', 'alex'), person('b-jo', 'Jo')])
    await b.db.receipts.add(
      receipt('rb', 'b-me', {
        participantIds: ['b-me', 'b-alex', 'b-jo'],
        items: [{ id: 'i', name: 'Pizza', quantity: 1, totalCents: 1200, discountCents: 0, shares: { 'b-alex': 1, 'b-jo': 1 } }],
        settledWith: ['b-alex'],
      }),
    )
    await b.db.groups.add({ id: 'g', name: 'Roommates', memberIds: ['b-me', 'b-alex'], createdAt: 1 })
    await linkDevice(b, 'merge')
    await sync(a)

    for (const d of [a, b]) {
      const people = await d.db.people.toArray()
      expect(people.map((p) => p.id).sort()).toEqual(['a-alex', 'a-me', 'b-jo'])
      const rb = await d.db.receipts.get('rb')
      expect(rb?.payerId).toBe('a-me')
      expect(rb?.participantIds).toEqual(['a-me', 'a-alex', 'b-jo'])
      expect(rb?.items[0].shares).toEqual({ 'a-alex': 1, 'b-jo': 1 })
      expect(rb?.settledWith).toEqual(['a-alex'])
      expect((await d.db.groups.get('g'))?.memberIds).toEqual(['a-me', 'a-alex'])
      expect(await d.db.receipts.get('ra')).toBeDefined()
    }
  })

  it("replace: this device ends up with exactly the account's data", async () => {
    const server = new FakeServer()
    const [a, b] = [await device(server), await device(server)]
    await a.db.people.add(person('a-me', 'Sam', { isSelf: true }))
    await a.db.receipts.add(receipt('ra', 'a-me'))
    await a.db.categories.update('r:other', { name: 'Misc' })
    await sync(a)

    await b.db.people.add(person('b-me', 'Me', { isSelf: true }))
    await b.db.receipts.add(receipt('rb', 'b-me', { updatedAt: 9_999_999_999_999 }))
    await b.db.categories.update('r:other', { name: 'Local name' })
    await linkDevice(b, 'replace')

    expect((await b.db.people.toArray()).map((p) => p.id)).toEqual(['a-me'])
    expect((await b.db.receipts.toArray()).map((r) => r.id)).toEqual(['ra'])
    expect((await b.db.categories.get('r:other'))?.name).toBe('Misc')
    // Nothing from B leaked into the account.
    await sync(a)
    expect(await a.db.receipts.get('rb')).toBeUndefined()
  })
})
