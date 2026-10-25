import { formatCents } from '../lib/money'

export interface BarRow {
  key: string
  name: string
  cents: number
}

/**
 * Ranked horizontal bars, one hue: a single series, so no legend. Each row
 * is labelled with its value (it doubles as the table view), and hovering a
 * row shows its share of the total.
 */
export function BarList({ rows, totalCents, label }: { rows: BarRow[]; totalCents: number; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.cents))
  return (
    <ul aria-label={label} className="grid gap-3">
      {rows.map((r) => {
        const pct = totalCents > 0 ? Math.round((r.cents / totalCents) * 100) : 0
        return (
          <li key={r.key} title={`${r.name}: ${formatCents(r.cents)} (${pct}% of total)`}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate text-stone-800 dark:text-stone-200">{r.name}</span>
              <span className="shrink-0 tabular-nums">
                <span className="mr-2 text-xs text-stone-500">{pct}%</span>
                {formatCents(r.cents)}
              </span>
            </div>
            <div className="mt-1 h-2.5" aria-hidden>
              {r.cents > 0 && (
                <div className="h-full rounded-r-[4px] bg-teal-600" style={{ width: `${Math.max(1, (r.cents / max) * 100)}%` }} />
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
