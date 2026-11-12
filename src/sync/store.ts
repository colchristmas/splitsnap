import Dexie, { type EntityTable } from 'dexie'
import type { WorkingKeys } from './crypto'

/** The signed-in account's keys on this device. Non-extractable CryptoKeys, stored as-is by IndexedDB. */
export interface SavedKeys extends WorkingKeys {
  id: 'current'
  userId: string
  email: string
}

/** What this device last sent or received for one record: `ref` is "table:id", `key` its server-side name. */
export interface SyncedRef {
  ref: string
  key: string
  hash: string
}

interface MetaRow {
  key: string
  value: unknown
}

/**
 * Sync's own bookkeeping, in a separate database from the app's data so that
 * backups and "Delete all data" never touch it.
 */
export class SyncStateDB extends Dexie {
  keys!: EntityTable<SavedKeys, 'id'>
  synced!: EntityTable<SyncedRef, 'ref'>
  meta!: EntityTable<MetaRow, 'key'>

  constructor(name = 'splitsnap-sync') {
    super(name)
    this.version(1).stores({ keys: 'id', synced: 'ref, key', meta: 'key' })
  }

  async getMeta<T>(key: string, fallback: T): Promise<T> {
    return ((await this.meta.get(key))?.value as T | undefined) ?? fallback
  }

  async setMeta(key: string, value: unknown) {
    await this.meta.put({ key, value })
  }

  /** Forgets which records were synced, so the next sync compares everything afresh. */
  async forgetSynced() {
    await this.transaction('rw', this.synced, this.meta, async () => {
      await this.synced.clear()
      await this.meta.clear()
    })
  }

  /** Forgets the account on this device: keys and all sync bookkeeping. */
  async reset() {
    await this.transaction('rw', this.keys, this.synced, this.meta, async () => {
      await this.keys.clear()
      await this.synced.clear()
      await this.meta.clear()
    })
  }
}

export const syncState = new SyncStateDB()
