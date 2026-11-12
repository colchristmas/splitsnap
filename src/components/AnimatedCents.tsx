import { animate, type JSAnimation } from 'animejs'
import { useLayoutEffect, useRef } from 'react'
import { formatCents } from '../lib/money'
import { reducedMotion } from '../lib/motion'
import { cx } from './ui'

/**
 * A dollar amount that counts up from $0.00 when it first appears, and from
 * its old value to the new one when it changes. `format` must be a stable
 * function (defined outside the component).
 */
export function AnimatedCents({
  cents,
  className,
  format = formatCents,
}: {
  cents: number
  className?: string
  format?: (cents: number) => string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  // The value on screen right now, which may be partway through counting.
  const shown = useRef(0)

  useLayoutEffect(() => {
    const el = ref.current!
    const show = (v: number) => {
      shown.current = v
      el.textContent = format(v)
    }
    if (shown.current === cents || reducedMotion()) return show(cents)
    const counter = { value: shown.current }
    show(Math.round(counter.value))
    const anim: JSAnimation = animate(counter, {
      value: cents,
      duration: 750,
      ease: 'outExpo',
      onUpdate: () => show(Math.round(counter.value)),
      onComplete: () => show(cents),
    })
    // A new value takes over from wherever the count has got to.
    return () => void anim.pause()
  }, [cents, format])

  // The text is written by the effect above, not by React, so React never
  // overwrites a count in progress.
  return <span ref={ref} className={cx('tabular-nums', className)} />
}
