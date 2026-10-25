import { formatCents } from '../lib/money'
import { cx } from './ui'

/** "owes you $41.20" / "you owe $8.10" / "settled up", always in words, never colour alone. */
export function BalanceText({ cents, className }: { cents: number; className?: string }) {
  if (cents === 0) return <span className={cx('text-stone-500', className)}>settled up</span>
  return cents > 0 ? (
    <span className={cx('text-emerald-700 dark:text-emerald-400', className)}>
      owes you <strong className="tabular-nums">{formatCents(cents)}</strong>
    </span>
  ) : (
    <span className={cx('text-amber-700 dark:text-amber-400', className)}>
      you owe <strong className="tabular-nums">{formatCents(-cents)}</strong>
    </span>
  )
}
