import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { DEFAULT_CATEGORIES, categorize, categoryKey, type CategoryMemory } from '../lib/categories'
import type { Category, CategoryKind } from '../lib/types'
import { db, newId } from './schema'

/** All categories in list order. */
export function useCategories(): Category[] {
  return useLiveQuery(() => db.categories.toArray(), [])?.sort((a, b) => a.order - b.order) ?? []
}

export function useCategoriesById(): Map<string, Category> {
  const categories = useCategories()
  return useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
}

export async function loadMemory(): Promise<CategoryMemory> {
  const memory: CategoryMemory = { item: new Map(), receipt: new Map() }
  for (const { key, categoryId } of await db.categoryMemory.toArray()) {
    const [kind, ...rest] = key.split(':')
    memory[kind as CategoryKind]?.set(rest.join(':'), categoryId)
  }
  return memory
}

/** Remembers a choice the user made, so the same name gets it next time. */
export async function rememberCategory(kind: CategoryKind, name: string, categoryId: string) {
  const key = categoryKey(name)
  if (key) await db.categoryMemory.put({ key: `${kind}:${key}`, categoryId })
}

/** Re-picks every category on a receipt the user hasn't set by hand. */
export async function recategorize(receiptId: string) {
  const memory = await loadMemory()
  await db.transaction('rw', db.receipts, async () => {
    const r = await db.receipts.get(receiptId)
    if (!r) return
    const c = categorize(r, memory)
    r.categoryId = c.categoryId
    r.items.forEach((item, i) => (item.categoryId = c.itemCategoryIds[i]))
    await db.receipts.put(r)
  })
}

export async function addCategory(kind: CategoryKind, name: string) {
  const order = Math.max(-1, ...(await db.categories.where('kind').equals(kind).toArray()).map((c) => c.order)) + 1
  await db.categories.add({ id: newId(), kind, name: name.trim(), order })
}

export async function renameCategory(id: string, name: string) {
  if (name.trim()) await db.categories.update(id, { name: name.trim() })
}

/** Deletes a category. Receipts and items that used it become uncategorized. */
export async function deleteCategory(id: string) {
  await db.transaction('rw', [db.categories, db.categoryMemory, db.receipts], async () => {
    await db.categories.delete(id)
    await db.categoryMemory.filter((m) => m.categoryId === id).delete()
    await db.receipts.toCollection().modify((r) => {
      if (r.categoryId === id) delete r.categoryId
      for (const item of r.items) if (item.categoryId === id) delete item.categoryId
    })
  })
}

export async function forgetLearnedCategories() {
  await db.categoryMemory.clear()
}

export function useLearnedCount(): number {
  return useLiveQuery(() => db.categoryMemory.count(), []) ?? 0
}

/** Puts the starter categories back and forgets learned choices. */
export async function resetCategories() {
  await db.transaction('rw', db.categories, db.categoryMemory, async () => {
    await db.categories.clear()
    await db.categoryMemory.clear()
    await db.categories.bulkAdd(DEFAULT_CATEGORIES)
  })
}
