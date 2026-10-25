import Dexie, { type EntityTable } from 'dexie'
import { DEFAULT_CATEGORIES, categorize, emptyMemory } from '../lib/categories'
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
    // v2: categories. Existing receipts get categorized by the keyword rules.
    this.version(2)
      .stores({ categories: 'id, kind', categoryMemory: 'key' })
      .upgrade(async (tx) => {
        await tx.table('categories').bulkAdd(DEFAULT_CATEGORIES)
        await tx
          .table<Receipt>('receipts')
          .toCollection()
          .modify((r) => {
            const c = categorize(r, emptyMemory())
            r.categoryId = c.categoryId
            r.items.forEach((item, i) => (item.categoryId = c.itemCategoryIds[i]))
          })
      })
    this.on('populate', (tx) => tx.table('categories').bulkAdd(DEFAULT_CATEGORIES))
  }
}

export const db = new SplitSnapDB()

export const newId = () => crypto.randomUUID()
