import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { TextField } from '../components/fields'
import { Button, Card, SectionTitle } from '../components/ui'
import {
  addCategory,
  deleteCategory,
  forgetLearnedCategories,
  renameCategory,
  resetCategories,
  useCategories,
  useLearnedCount,
} from '../db/categories'
import type { Category, CategoryKind } from '../lib/types'

export function CategorySettings() {
  const categories = useCategories()
  const learned = useLearnedCount()

  return (
    <>
      <SectionTitle>Categories</SectionTitle>
      <Card className="grid gap-3">
        <p className="text-sm text-stone-600 dark:text-stone-400">
          SplitSnap guesses categories from store and item names, and remembers whenever you change one.
        </p>
        <CategoryList kind="receipt" categories={categories.filter((c) => c.kind === 'receipt')} />
        <CategoryList kind="item" categories={categories.filter((c) => c.kind === 'item')} />
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={learned === 0}
            onClick={() => {
              if (confirm('Forget the categories you picked by hand? Future guesses will use the keyword rules only.')) {
                void forgetLearnedCategories()
              }
            }}
          >
            Forget {learned} learned {learned === 1 ? 'choice' : 'choices'}
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              if (confirm('Restore the starter categories? Categories you added are removed, and anything using them becomes uncategorized.')) {
                void resetCategories()
              }
            }}
          >
            Restore starter list
          </Button>
        </div>
      </Card>
    </>
  )
}

function CategoryList({ kind, categories }: { kind: CategoryKind; categories: Category[] }) {
  const [name, setName] = useState('')
  const title = kind === 'receipt' ? 'Receipt types' : 'Item types'

  return (
    <details className="group rounded-xl bg-stone-50 dark:bg-stone-950">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 font-medium">
        {title} <span className="text-sm font-normal text-stone-500">({categories.length})</span>
        <ChevronDown size={18} className="ml-auto text-stone-400 transition-transform group-open:rotate-180" />
      </summary>
      <ul className="divide-y divide-stone-200 px-2 dark:divide-stone-800">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center gap-1 py-1">
            <TextField value={c.name} onCommit={(n) => void renameCategory(c.id, n)} className="flex-1" aria-label={`Name of ${c.name}`} />
            <button
              type="button"
              onClick={() => {
                if (confirm(`Delete “${c.name}”? Receipts and items using it become uncategorized.`)) void deleteCategory(c.id)
              }}
              className="p-2 text-stone-400 hover:text-red-600"
              aria-label={`Delete ${c.name}`}
            >
              <Trash2 size={16} />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2 p-2"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!name.trim()) return
          await addCategory(kind, name)
          setName('')
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={kind === 'receipt' ? 'Add a receipt type' : 'Add an item type'}
          className="w-full rounded-lg bg-white px-3 py-2 ring-1 ring-stone-300 outline-none focus:ring-2 focus:ring-teal-600 dark:bg-stone-900 dark:ring-stone-700"
        />
        <Button type="submit" variant="primary" size="sm" disabled={!name.trim()} aria-label={`Add ${title.toLowerCase()}`}>
          <Plus size={18} />
        </Button>
      </form>
    </details>
  )
}
