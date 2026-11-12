import { useState } from 'react'
import { Link } from 'react-router'
import { formatCents } from '../lib/money'
import type { ItemMatch } from '../lib/search'
import { formatDate } from '../lib/share'
import { Button, Card, SectionTitle } from './ui'

/** Rows shown before "Show all", so a broad search doesn't bury the bills below. */
const FIRST_ROWS = 20

/**
 * Item lines found by a History search, each opening its receipt. The summary
 * gives the lowest and highest price per unit, to compare stores at a glance.
 * "Show all" lasts until `search` (the text typed) changes.
 */
export function ItemResults({ matches, search }: { matches: ItemMatch[]; search: string }) {
  const [expandedFor, setExpandedFor] = useState<string>()
  const shown = expandedFor === search ? matches : matches.slice(0, FIRST_ROWS)
  const units = matches.map((m) => m.unitCents)
  const [low, high] = [Math.min(...units), Math.max(...units)]
  // Per unit, so "each" once a line has several (it shows "3 × $2.00").
  const each = matches.some((m) => m.item.quantity > 1) ? ' each' : ''
  const summary = `${matches.length} ${matches.length === 1 ? 'match' : 'matches'} · ${formatCents(low)}${high > low ? `–${formatCents(high)}` : ''}${each}`

  return (
    <section aria-label="Matching items">
      <SectionTitle action={<span className="text-sm text-stone-500 tabular-nums dark:text-stone-400">{summary}</span>}>Items</SectionTitle>
      <Card stagger className="divide-y divide-stone-100 p-0! dark:divide-stone-800">
        {shown.map(({ receipt, item, cents, unitCents }) => (
          <Link
            key={`${receipt.id} ${item.id}`}
            to={`/r/${receipt.id}/${receipt.status === 'final' ? 'split' : 'items'}`}
            className="flex items-start gap-3 px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{item.name || 'Untitled item'}</p>
              <p className="truncate text-sm text-stone-500 dark:text-stone-400">
                {receipt.store || 'Untitled receipt'} · {formatDate(receipt.date)}
                {receipt.status !== 'final' && ' · Draft'}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-semibold tabular-nums">{formatCents(cents)}</p>
              {item.quantity > 1 && (
                <p className="text-xs text-stone-500 tabular-nums dark:text-stone-400">
                  {item.quantity} × {formatCents(unitCents)}
                </p>
              )}
              {item.discountCents > 0 && (
                <p className="text-xs text-emerald-700 tabular-nums dark:text-emerald-400">−{formatCents(item.discountCents)} off</p>
              )}
            </div>
          </Link>
        ))}
      </Card>
      {matches.length > shown.length && (
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => setExpandedFor(search)}>
          Show all {matches.length} items
        </Button>
      )}
    </section>
  )
}
