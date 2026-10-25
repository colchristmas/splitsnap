import { useLiveQuery } from 'dexie-react-hooks'
import { Layers, Search, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { PageTitle } from '../components/layouts'
import { ReceiptRow } from '../components/ReceiptRow'
import { Button, Card, Empty, cx } from '../components/ui'
import { useCategories } from '../db/categories'
import { usePeopleById } from '../db/hooks'
import { deleteReceipt } from '../db/receipts'
import { db } from '../db/schema'

export function History() {
  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState<string>()
  // Select mode: pick saved bills to combine into one total per person.
  const [selected, setSelected] = useState<Set<string> | null>(null)
  const navigate = useNavigate()
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
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
      <PageTitle
        action={
          receipts.some((r) => r.status === 'final') && (
            <Button variant="ghost" size="sm" onClick={() => setSelected(selected ? null : new Set())}>
              {selected ? (
                'Cancel'
              ) : (
                <>
                  <Layers size={16} /> Combine bills
                </>
              )}
            </Button>
          )
        }
      >
        History
      </PageTitle>
      {selected && <p className="-mt-2 mb-3 text-sm text-stone-500">Pick saved bills to combine into one total per person.</p>}
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
                <ReceiptRow receipt={r} onSelect={selected ? () => toggle(r.id) : undefined} selected={selected?.has(r.id)} />
              </div>
              {!selected && (
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
              )}
            </div>
          ))}
        </Card>
      )}

      {selected && selected.size > 0 && (
        <div className="fixed inset-x-0 px-4" style={{ bottom: 'calc(4.25rem + env(safe-area-inset-bottom))' }}>
          <div className="mx-auto max-w-lg">
            <Button variant="primary" size="lg" className="shadow-lg" onClick={() => navigate(`/combine?ids=${[...selected].join(',')}`)}>
              <Layers size={20} /> Combine {selected.size} {selected.size === 1 ? 'bill' : 'bills'}
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
