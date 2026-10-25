import { useCategories } from '../db/categories'
import type { CategoryKind } from '../lib/types'
import { cx } from './ui'

/** A native select of receipt or item categories. */
export function CategorySelect({
  kind,
  value,
  onChange,
  className,
  label,
}: {
  kind: CategoryKind
  value: string | undefined
  onChange: (id: string) => void
  className?: string
  label: string
}) {
  const options = useCategories().filter((c) => c.kind === kind)
  const known = options.some((c) => c.id === value)
  return (
    <select
      value={known ? value : ''}
      onChange={(e) => e.target.value && onChange(e.target.value)}
      aria-label={label}
      className={cx('rounded-lg bg-stone-100 px-2 py-1.5 text-sm dark:bg-stone-800', className)}
    >
      {!known && <option value="">Uncategorized</option>}
      {options.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  )
}
