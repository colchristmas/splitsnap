import Dexie, { type EntityTable } from 'dexie'
import type { Group, Person, Receipt, StoredImage } from '../lib/types'

export interface Setting {
  key: string
  value: unknown
}

class SplitSnapDB extends Dexie {
  people!: EntityTable<Person, 'id'>
  groups!: EntityTable<Group, 'id'>
  receipts!: EntityTable<Receipt, 'id'>
  images!: EntityTable<StoredImage, 'id'>
  settings!: EntityTable<Setting, 'key'>

  constructor() {
    super('splitsnap')
    this.version(1).stores({
      people: 'id, lastUsedAt',
      groups: 'id',
      receipts: 'id, status, date, updatedAt',
      images: 'id',
      settings: 'key',
    })
  }
}

export const db = new SplitSnapDB()

export const newId = () => crypto.randomUUID()
