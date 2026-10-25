import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { Person } from '../lib/types'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-teal-700 text-white hover:bg-teal-800 disabled:bg-stone-300 disabled:text-stone-500 dark:disabled:bg-stone-800',
  secondary:
    'bg-white text-stone-900 ring-1 ring-stone-300 hover:bg-stone-50 dark:bg-stone-900 dark:text-stone-100 dark:ring-stone-700 dark:hover:bg-stone-800',
  ghost: 'text-teal-800 hover:bg-teal-50 dark:text-teal-300 dark:hover:bg-stone-800',
  danger: 'text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-stone-800',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:cursor-not-allowed',
        size === 'sm' && 'px-2.5 py-1.5 text-sm',
        size === 'md' && 'px-4 py-2.5',
        size === 'lg' && 'w-full px-4 py-3.5 text-lg',
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800', className)}>
      {children}
    </div>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-6 mb-2 flex items-center justify-between px-1">
      <h2 className="text-sm font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">{children}</h2>
      {action}
    </div>
  )
}

export function Avatar({ person, size = 'md' }: { person?: Pick<Person, 'name' | 'color'>; size?: 'sm' | 'md' }) {
  const name = person?.name ?? '?'
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white',
        size === 'sm' ? 'size-6 text-xs' : 'size-8 text-sm',
      )}
      style={{ backgroundColor: person?.color ?? '#a8a29e' }}
      aria-hidden
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}

/** A tappable person pill; `selected` fills it with the person's colour. */
export function PersonChip({
  person,
  selected,
  onClick,
  trailing,
}: {
  person?: Pick<Person, 'name' | 'color'>
  selected?: boolean
  onClick?: () => void
  trailing?: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full py-1 pr-3 pl-1 text-sm font-medium ring-1 transition-colors',
        selected
          ? 'text-white ring-transparent'
          : 'bg-white text-stone-800 ring-stone-300 dark:bg-stone-900 dark:text-stone-200 dark:ring-stone-700',
      )}
      style={selected ? { backgroundColor: person?.color } : undefined}
    >
      <Avatar person={person} size="sm" />
      <span className="max-w-32 truncate">{person?.name ?? 'Unknown'}</span>
      {trailing}
    </button>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  size?: 'sm' | 'md'
}) {
  return (
    <div className="inline-flex rounded-lg bg-stone-200 p-0.5 dark:bg-stone-800">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={o.value === value}
          className={cx(
            'rounded-md font-medium transition-colors',
            size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
            o.value === value
              ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-600 dark:text-white'
              : 'text-stone-600 dark:text-stone-400',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Banner({ tone, children }: { tone: 'ok' | 'warn' | 'info'; children: ReactNode }) {
  return (
    <div
      className={cx(
        'flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm',
        tone === 'ok' && 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
        tone === 'warn' && 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
        tone === 'info' && 'bg-stone-200/60 text-stone-700 dark:bg-stone-800 dark:text-stone-300',
      )}
    >
      {children}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-1 py-6 text-center text-stone-500 dark:text-stone-400">{children}</p>
}
