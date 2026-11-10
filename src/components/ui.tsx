import { useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router'
import { usePop, usePopIn, withPress } from '../lib/motion'
import type { Person } from '../lib/types'
import { TONES, type TileTone } from './tones'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

// Primary buttons are tan pebbles with a copper underside. Forest text on tan
// reads at 5.7:1; cream on copper would only pass for large text.
const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-teal-400 font-semibold text-stone-900 shadow-[inset_0_-3px_0_var(--color-teal-600)] hover:bg-teal-300 disabled:bg-stone-200 disabled:text-stone-500 disabled:shadow-none dark:disabled:bg-stone-800',
  secondary:
    'bg-white text-stone-900 ring-1 ring-teal-200 hover:bg-teal-50 dark:bg-stone-900 dark:text-stone-100 dark:ring-stone-700 dark:hover:bg-stone-800',
  ghost: 'text-teal-700 hover:bg-teal-100/70 dark:text-teal-300 dark:hover:bg-stone-800',
  danger: 'text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-stone-800',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  onPointerCancel,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <button
      type="button"
      {...withPress({ onPointerDown, onPointerUp, onPointerLeave, onPointerCancel }, size === 'lg' ? 0.97 : 0.94)}
      className={cx(
        'inline-flex items-center justify-center gap-2 font-medium transition-colors disabled:cursor-not-allowed',
        size === 'sm' && 'rounded-full px-3 py-1.5 text-sm',
        size === 'md' && 'rounded-full px-4 py-2.5',
        size === 'lg' && 'w-full rounded-[1.5rem] px-4 py-3.5 text-lg',
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  )
}

/** `stagger` makes the card's rows animate in one after another (see useEnterAnimations). */
export function Card({ children, className, stagger }: { children: ReactNode; className?: string; stagger?: boolean }) {
  return (
    <div
      data-stagger={stagger || undefined}
      className={cx(
        'rounded-pebble bg-white/85 p-4 shadow-warm ring-1 ring-teal-200/60 dark:bg-stone-900/85 dark:shadow-none dark:ring-stone-800',
        className,
      )}
    >
      {children}
    </div>
  )
}

/**
 * A bento tile, square unless `square` is false. With `to` it's a link, with
 * `onClick` a button. A soft blob in one corner, in the tile's own text
 * color, keeps tiles of the same tone from looking stamped out.
 */
export function Tile({
  tone = 'cream',
  square = true,
  to,
  onClick,
  disabled,
  pressed,
  className,
  children,
  'aria-label': ariaLabel,
}: {
  tone?: TileTone
  square?: boolean
  to?: string
  onClick?: () => void
  disabled?: boolean
  /** For toggle tiles: sets aria-pressed. */
  pressed?: boolean
  className?: string
  children: ReactNode
  'aria-label'?: string
}) {
  const cls = cx(
    'relative isolate flex flex-col justify-between gap-2 overflow-hidden rounded-pebble p-4 text-left shadow-warm dark:shadow-none',
    square && 'aspect-square',
    TONES[tone],
    className,
  )
  const blob = <span aria-hidden className="rounded-blob pointer-events-none absolute -right-8 -bottom-10 -z-10 size-32 bg-current opacity-10" />
  if (to)
    return (
      <Link to={to} className={cls} aria-label={ariaLabel} {...withPress()}>
        {children}
        {blob}
      </Link>
    )
  if (onClick)
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-pressed={pressed}
        aria-label={ariaLabel}
        className={cx(cls, 'disabled:opacity-60')}
        {...withPress()}
      >
        {children}
        {blob}
      </button>
    )
  return (
    <div className={cls} aria-label={ariaLabel}>
      {children}
      {blob}
    </div>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-7 mb-3 flex items-center justify-between px-1">
      <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-teal-700 uppercase dark:text-teal-300">
        <span aria-hidden className="rounded-blob size-2.5 bg-teal-400" />
        {children}
      </h2>
      {action}
    </div>
  )
}

/** Small avatars stay round so they stack neatly; larger ones are pebble-shaped. */
export function Avatar({ person, size = 'md' }: { person?: Pick<Person, 'name' | 'color'>; size?: 'sm' | 'md' | 'lg' }) {
  const name = person?.name ?? '?'
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center justify-center font-semibold text-white',
        size === 'sm' && 'size-6 rounded-full text-xs',
        size === 'md' && 'rounded-blob size-9 text-sm',
        size === 'lg' && 'rounded-blob size-14 text-xl',
      )}
      style={{ backgroundColor: person?.color ?? '#a3a595' }}
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
  const ref = useRef<HTMLButtonElement>(null)
  usePop(ref, selected, { from: 0.88 })
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      {...withPress()}
      aria-pressed={selected}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full py-1 pr-3 pl-1 text-sm font-medium ring-1 transition-colors',
        selected
          ? 'text-white ring-transparent'
          : 'bg-white text-stone-800 ring-teal-200 dark:bg-stone-900 dark:text-stone-200 dark:ring-stone-700',
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
    <div className="inline-flex rounded-full bg-teal-100/80 p-1 dark:bg-stone-800">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={o.value === value}
          className={cx(
            'rounded-full font-medium transition-colors',
            size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3.5 py-1 text-sm',
            o.value === value
              ? 'bg-white text-stone-900 shadow-warm dark:bg-stone-600 dark:text-white'
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
  const ref = useRef<HTMLDivElement>(null)
  usePopIn(ref)
  return (
    <div
      ref={ref}
      className={cx(
        'flex items-start gap-2 rounded-[1.25rem] px-3.5 py-2.5 text-sm',
        tone === 'ok' && 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
        tone === 'warn' && 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
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
