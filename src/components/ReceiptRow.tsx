import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { usePeopleById } from '../db/hooks'
import { formatCents } from '../lib/money'
import { formatDate } from '../lib/share'
import { split } from '../lib/split'
import type { Receipt } from '../lib/types'
import { Avatar } from './ui'

export function ReceiptRow({ receipt }: { receipt: Receipt }) {
  const byId = usePeopleById()
  const total = split(receipt).grandTotalCents
  const shown = receipt.participantIds.slice(0, 4)
  return (
    <Link
      to={`/r/${receipt.id}/${receipt.status === 'final' ? 'split' : 'items'}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/50"
    >
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate font-medium">
          {receipt.store || 'Untitled receipt'}
          {receipt.status === 'draft' && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              Draft
            </span>
          )}
        </p>
        <p className="text-sm text-stone-500">{formatDate(receipt.date)}</p>
      </div>
      <div className="flex -space-x-1.5">
        {shown.map((id) => (
          <Avatar key={id} person={byId.get(id)} size="sm" />
        ))}
      </div>
      <span className="w-20 text-right font-semibold tabular-nums">{formatCents(total)}</span>
      <ChevronRight size={18} className="text-stone-400" />
    </Link>
  )
}
