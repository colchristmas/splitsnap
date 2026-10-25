import { Minus, Plus } from 'lucide-react'
import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react'
import { formatCents, parseMoney } from '../lib/money'
import { cx } from './ui'

// No width here: callers size each field (w-24, flex-1, w-full…).
const INPUT =
  'min-w-0 rounded-lg bg-transparent px-2 py-1.5 outline-none ring-1 ring-transparent transition focus:bg-white focus:ring-teal-600 hover:ring-stone-300 dark:focus:bg-stone-950 dark:hover:ring-stone-700'

type BaseProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>

/**
 * A text input that edits a local copy and commits on blur, Enter, or after
 * a short pause, so typing stays smooth while drafts still autosave.
 */
export function TextField({
  value,
  onCommit,
  className,
  ...props
}: BaseProps & { value: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value)
  const focused = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (!focused.current) setText(value)
  }, [value])

  const commit = (v: string) => {
    clearTimeout(timer.current)
    if (v !== value) onCommit(v)
  }

  return (
    <input
      {...props}
      className={cx(INPUT, className)}
      value={text}
      onFocus={() => (focused.current = true)}
      onChange={(e) => {
        setText(e.target.value)
        clearTimeout(timer.current)
        const v = e.target.value
        timer.current = setTimeout(() => onCommit(v), 500)
      }}
      onBlur={() => {
        focused.current = false
        commit(text)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
    />
  )
}

/** A dollar amount input that stores cents. Shows "$4.29" when not editing. */
export function MoneyField({
  value,
  onCommit,
  className,
  ...props
}: BaseProps & { value: number | undefined; onCommit: (cents: number | undefined) => void }) {
  const display = (c: number | undefined) => (c === undefined ? '' : formatCents(c))
  const [text, setText] = useState(display(value))
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!editing) setText(display(value))
  }, [value, editing])

  return (
    <input
      {...props}
      inputMode="decimal"
      className={cx(INPUT, 'text-right tabular-nums', className)}
      value={text}
      onFocus={(e) => {
        setEditing(true)
        setText(value === undefined ? '' : (value / 100).toFixed(2))
        requestAnimationFrame(() => e.target.select())
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setEditing(false)
        const cents = text.trim() === '' ? undefined : (parseMoney(text) ?? value)
        if (cents !== value) onCommit(cents)
        setText(display(cents))
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
    />
  )
}

export function Stepper({
  value,
  min = 0,
  max = Infinity,
  onChange,
  label,
}: {
  value: number
  min?: number
  max?: number
  onChange: (v: number) => void
  label: string
}) {
  const btn =
    'inline-flex size-8 items-center justify-center rounded-full ring-1 ring-stone-300 disabled:opacity-30 dark:ring-stone-700'
  return (
    <div className="inline-flex items-center gap-2" role="group" aria-label={label}>
      <button type="button" className={btn} disabled={value <= min} onClick={() => onChange(value - 1)} aria-label={`Fewer ${label}`}>
        <Minus size={16} />
      </button>
      <span className="w-6 text-center font-semibold tabular-nums">{value}</span>
      <button type="button" className={btn} disabled={value >= max} onClick={() => onChange(value + 1)} aria-label={`More ${label}`}>
        <Plus size={16} />
      </button>
    </div>
  )
}
