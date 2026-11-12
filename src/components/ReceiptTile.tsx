import { Check } from 'lucide-react'
import { useCategoriesById } from '../db/categories'
import { usePeopleById } from '../db/hooks'
import { formatCents } from '../lib/money'
import { formatDate } from '../lib/share'
import { split } from '../lib/split'
import type { Receipt } from '../lib/types'
import { TILE_MUTED, type TileTone } from './tones'
import { Avatar, Tile, cx } from './ui'

/** Cream and tan tiles in a checkerboard, so a grid of receipts doesn't read as one block. */
const receiptTone = (index: number): TileTone => ((index + Math.floor(index / 2)) % 2 ? 'tan' : 'cream')

/**
 * A receipt as a square tile: who was on it, the store, and the total.
 * `index` is its place in the grid, which picks its color. With `onSelect`,
 * tapping toggles it instead of opening it.
 */
export function ReceiptTile({
  receipt,
  index = 0,
  onSelect,
  selected,
}: {
  receipt: Receipt
  index?: number
  onSelect?: () => void
  selected?: boolean
}) {
  const tone = receiptTone(index)
  const byId = usePeopleById()
  const category = useCategoriesById().get(receipt.categoryId ?? '')
  const total = split(receipt).grandTotalCents
  const final = receipt.status === 'final'
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex -space-x-1.5">
          {receipt.participantIds.slice(0, 4).map((id) => (
            <Avatar key={id} person={byId.get(id)} size="sm" />
          ))}
        </div>
        {onSelect && (
          <span
            className={cx(
              'inline-flex size-6 shrink-0 items-center justify-center rounded-full ring-2',
              selected ? 'bg-teal-700 text-white ring-teal-700' : 'ring-current/40',
            )}
          >
            {selected && <Check size={14} strokeWidth={3} />}
          </span>
        )}
      </div>
      <div className="min-w-0">
        {!final && <span className="mb-1 inline-block rounded-full bg-stone-900 px-2 py-0.5 text-xs font-semibold text-teal-300">Draft</span>}
        <p className="line-clamp-2 leading-snug font-semibold">{receipt.store || 'Untitled receipt'}</p>
        <p className={cx('truncate text-xs', TILE_MUTED[tone])}>
          {formatDate(receipt.date)}
          {category && ` · ${category.name}`}
        </p>
        <p className="mt-1.5 text-2xl font-bold tracking-tight tabular-nums">{formatCents(total)}</p>
      </div>
    </>
  )
  if (onSelect)
    return (
      <Tile
        tone={tone}
        onClick={onSelect}
        disabled={!final}
        pressed={selected}
        className={cx('w-full', selected && 'ring-4! ring-teal-600!')}
      >
        {body}
      </Tile>
    )
  return (
    <Tile tone={tone} to={`/r/${receipt.id}/${final ? 'split' : 'items'}`}>
      {body}
    </Tile>
  )
}
