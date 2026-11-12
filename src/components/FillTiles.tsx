import { animate, spring } from 'animejs'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { reducedMotion } from '../lib/motion'
import { AnimatedCents } from './AnimatedCents'
import { cx } from './ui'

export interface FillRow {
  key: string
  name: string
  cents: number
}

// Each tile's water takes the next palette color: tan, olive, copper, forest.
// The text color matches so the wave on top (drawn in currentColor) does too.
const WATERS = [
  'bg-teal-400 text-teal-400',
  'bg-emerald-700 text-emerald-700',
  'bg-teal-600 text-teal-600',
  'bg-stone-900 text-stone-900 dark:bg-stone-700 dark:text-stone-700',
]

/**
 * Spending as square tiles that fill like water: each one's level is its
 * share of the total. The label sits on a cream chip, so it reads over any
 * level and any color.
 */
export function FillTiles({ rows, totalCents, label }: { rows: FillRow[]; totalCents: number; label: string }) {
  return (
    <ul aria-label={label} data-stagger className="grid grid-cols-2 gap-3">
      {rows.map((r, i) => {
        const share = totalCents > 0 ? r.cents / totalCents : 0
        return (
          <li
            key={r.key}
            className="rounded-pebble relative isolate aspect-square overflow-hidden bg-white/90 shadow-warm ring-1 ring-teal-200/70 dark:bg-stone-900 dark:shadow-none dark:ring-stone-700"
          >
            <Water level={Math.max(0.04, share)} index={i} />
            <div className="relative m-2.5 inline-block max-w-[calc(100%-1.25rem)] rounded-[1.1rem] bg-white/85 px-3 py-2 backdrop-blur-sm dark:bg-stone-950/70">
              <p className="line-clamp-2 text-sm leading-snug font-medium">{r.name}</p>
              <AnimatedCents cents={r.cents} className="block text-lg font-bold" />
              <p className="text-xs text-stone-600 dark:text-stone-400">{Math.round(share * 100)}% of total</p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** The water in a tile: it rises to `level` with a little slosh, and its surface ripples. */
function Water({ level, index }: { level: number; index: number }) {
  const body = useRef<HTMLDivElement>(null)
  const surface = useRef<SVGSVGElement>(null)
  const filled = useRef(false)

  // The first time, rise from empty, each tile a beat after the one before.
  // After that, glide to the new level (another month, another person).
  useLayoutEffect(() => {
    const el = body.current!
    const height = `${level * 100}%`
    if (reducedMotion()) {
      el.style.height = height
      return
    }
    const first = !filled.current
    if (first) el.style.height = '0%'
    const anim = animate(el, {
      height,
      delay: first ? 150 + index * 90 : 0,
      // A spring sets its own duration.
      ...(first ? { ease: spring({ bounce: 0.35, duration: 1100 }) } : { ease: 'outQuart', duration: 700 }),
      // Marked only once it lands, so an interrupted first rise starts over.
      onComplete: () => void (filled.current = true),
    })
    return () => void anim.pause()
  }, [level, index])

  // The surface drifts sideways forever, each tile at its own pace.
  useEffect(() => {
    const el = surface.current
    if (!el || reducedMotion()) return
    const anim = animate(el, { translateX: ['0%', '-50%'], duration: 5200 + (index % 4) * 900, ease: 'linear', loop: true })
    return () => void anim.revert()
  }, [index])

  // Height is set by the effect above, not by React, so a re-render never
  // jumps the water mid-rise.
  return (
    <div ref={body} aria-hidden className={cx('absolute inset-x-0 bottom-0 -z-10', WATERS[index % WATERS.length])}>
      {/* Two wave periods, so sliding by half loops without a seam. */}
      <svg
        ref={surface}
        viewBox="0 0 200 12"
        preserveAspectRatio="none"
        className="absolute bottom-[calc(100%-1px)] left-0 h-3 w-[200%]"
        fill="currentColor"
      >
        <path d="M0 6 Q 25 0 50 6 T 100 6 T 150 6 T 200 6 V 12 H 0 Z" />
      </svg>
    </div>
  )
}
