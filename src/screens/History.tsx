import { useLiveQuery } from 'dexie-react-hooks'
import { Search, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { PageTitle } from '../components/layouts'
import { ReceiptRow } from '../components/ReceiptRow'
import { Card, Empty, cx } from '../components/ui'
import { useCategories } from '../db/categories'
import { usePeopleById } from '../db/hooks'
import { deleteReceipt } from '../db/receipts'
import { db } from '../db/schema'

export function History() {
  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState<string>()
  const byId = usePeopleById()
  const categories = useCategories()
  const categoryName = (id: string | undefined) => categories.find((c) => c.id === id)?.name.toLowerCase() ?? ''
  const receipts =
    useLiveQuery(() => db.receipts.orderBy('date').reverse().toArray(), [])?.sort(
      (a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt,
    ) ?? []

  const q = query.trim().toLowerCase()
  const inCategory = categoryId ? receipts.filter((r) => r.categoryId === categoryId) : receipts
  const shown = q
    ? inCategory.filter(
        (r) =>
          r.store.toLowerCase().includes(q) ||
          categoryName(r.categoryId).includes(q) ||
          r.participantIds.some((id) => byId.get(id)?.name.toLowerCase().includes(q)) ||
          r.items.some((i) => i.name.toLowerCase().includes(q) || categoryName(i.categoryId).includes(q)),
      )
    : inCategory
  // Only offer filters for categories that some receipt actually uses.
  const used = categories.filter((c) => c.kind === 'receipt' && receipts.some((r) => r.categoryId === c.id))

  return (
    <>
      <PageTitle>History</PageTitle>
      <label className="mb-3 flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 ring-1 ring-stone-300 focus-within:ring-2 focus-within:ring-teal-600 dark:bg-stone-900 dark:ring-stone-700">
        <Search size={18} className="text-stone-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search stores, people, items, categories"
          className="w-full bg-transparent outline-none"
        />
      </label>

      {used.length > 1 && (
        <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Filter by category">
          {[{ id: undefined, name: 'All' }, ...used].map((c) => (
            <button
              key={c.id ?? 'all'}
              type="button"
              onClick={() => setCategoryId(c.id)}
              aria-pressed={categoryId === c.id}
              className={cx(
                'shrink-0 rounded-full px-3 py-1 text-sm font-medium ring-1',
                categoryId === c.id
                  ? 'bg-teal-700 text-white ring-transparent'
                  : 'bg-white text-stone-700 ring-stone-300 dark:bg-stone-900 dark:text-stone-300 dark:ring-stone-700',
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <Empty>{receipts.length === 0 ? 'No receipts yet.' : 'Nothing matches.'}</Empty>
      ) : (
        <Card className="divide-y divide-stone-100 p-0! dark:divide-stone-800">
          {shown.map((r) => (
            <div key={r.id} className="flex items-center">
              <div className="min-w-0 flex-1">
                <ReceiptRow receipt={r} />
              </div>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Delete “${r.store || 'Untitled receipt'}”? This can't be undone.`)) void deleteReceipt(r.id)
                }}
                className="p-3 text-stone-400 hover:text-red-600"
                aria-label={`Delete ${r.store || 'receipt'}`}
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </Card>
      )}
    </>
  )
}
