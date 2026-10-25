import { Check, ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { useCategoriesById } from '../db/categories'
import { usePeopleById } from '../db/hooks'
import { formatCents } from '../lib/money'
import { formatDate } from '../lib/share'
import { split } from '../lib/split'
import type { Receipt } from '../lib/types'
import { Avatar, cx } from './ui'

/** A receipt in a list. With `onSelect`, tapping toggles a checkbox instead of opening it. */
export function ReceiptRow({ receipt, onSelect, selected }: { receipt: Receipt; onSelect?: () => void; selected?: boolean }) {
  const byId = usePeopleById()
  const category = useCategoriesById().get(receipt.categoryId ?? '')
  const total = split(receipt).grandTotalCents
  const shown = receipt.participantIds.slice(0, 4)
  const body = (
    <>
      {onSelect && (
        <span
          className={cx(
            'inline-flex size-6 shrink-0 items-center justify-center rounded-full ring-2',
            selected ? 'bg-teal-700 text-white ring-teal-700' : 'ring-stone-300 dark:ring-stone-600',
          )}
        >
          {selected && <Check size={14} strokeWidth={3} />}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate font-medium">
          {receipt.store || 'Untitled receipt'}
          {receipt.status === 'draft' && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              Draft
            </span>
          )}
        </p>
        <p className="truncate text-sm text-stone-500">
          {formatDate(receipt.date)}
          {category && ` · ${category.name}`}
        </p>
      </div>
      <div className="flex -space-x-1.5">
        {shown.map((id) => (
          <Avatar key={id} person={byId.get(id)} size="sm" />
        ))}
      </div>
      <span className="w-20 text-right font-semibold tabular-nums">{formatCents(total)}</span>
      {!onSelect && <ChevronRight size={18} className="text-stone-400" />}
    </>
  )
  const className = 'flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-stone-50 dark:hover:bg-stone-800/50'
  return onSelect ? (
    <button
      type="button"
      onClick={onSelect}
      disabled={receipt.status !== 'final'}
      aria-pressed={selected}
      className={cx(className, receipt.status !== 'final' && 'opacity-50')}
    >
      {body}
    </button>
  ) : (
    <Link to={`/r/${receipt.id}/${receipt.status === 'final' ? 'split' : 'items'}`} className={className}>
      {body}
    </Link>
  )
}
