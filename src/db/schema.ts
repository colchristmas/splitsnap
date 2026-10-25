import Dexie, { type EntityTable } from 'dexie'
import { DEFAULT_CATEGORIES } from '../lib/categories'
import type { Category, Group, Person, Receipt, StoredImage } from '../lib/types'

export interface Setting {
  key: string
  value: unknown
}

/** A learned category choice. `key` is "item:<categoryKey>" or "receipt:<categoryKey>". */
export interface CategoryChoice {
  key: string
  categoryId: string
}

class SplitSnapDB extends Dexie {
  people!: EntityTable<Person, 'id'>
  groups!: EntityTable<Group, 'id'>
  receipts!: EntityTable<Receipt, 'id'>
  images!: EntityTable<StoredImage, 'id'>
  settings!: EntityTable<Setting, 'key'>
  categories!: EntityTable<Category, 'id'>
  categoryMemory!: EntityTable<CategoryChoice, 'key'>

  constructor() {
    super('splitsnap')
    this.version(1).stores({
      people: 'id, lastUsedAt',
      groups: 'id',
      receipts: 'id, status, date, updatedAt',
      images: 'id',
      settings: 'key',
    })
    // v2: categories. Saved receipts are categorized at startup by ensureCategoryRules().
    this.version(2)
      .stores({ categories: 'id, kind', categoryMemory: 'key' })
      .upgrade((tx) => tx.table('categories').bulkAdd(DEFAULT_CATEGORIES))
    this.on('populate', (tx) => tx.table('categories').bulkAdd(DEFAULT_CATEGORIES))
  }
}

export const db = new SplitSnapDB()

export const newId = () => crypto.randomUUID()
