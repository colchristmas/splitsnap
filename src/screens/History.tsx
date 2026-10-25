import { useLiveQuery } from 'dexie-react-hooks'
import { Search, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { PageTitle } from '../components/layouts'
import { ReceiptRow } from '../components/ReceiptRow'
import { Card, Empty } from '../components/ui'
import { usePeopleById } from '../db/hooks'
import { deleteReceipt } from '../db/receipts'
import { db } from '../db/schema'

export function History() {
  const [query, setQuery] = useState('')
  const byId = usePeopleById()
  const receipts =
    useLiveQuery(() => db.receipts.orderBy('date').reverse().toArray(), [])?.sort(
      (a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt,
    ) ?? []

  const q = query.trim().toLowerCase()
  const shown = q
    ? receipts.filter(
        (r) =>
          r.store.toLowerCase().includes(q) ||
          r.participantIds.some((id) => byId.get(id)?.name.toLowerCase().includes(q)) ||
          r.items.some((i) => i.name.toLowerCase().includes(q)),
      )
    : receipts

  return (
    <>
      <PageTitle>History</PageTitle>
      <label className="mb-3 flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 ring-1 ring-stone-300 focus-within:ring-2 focus-within:ring-teal-600 dark:bg-stone-900 dark:ring-stone-700">
        <Search size={18} className="text-stone-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search stores, people, items"
          className="w-full bg-transparent outline-none"
        />
      </label>

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
