import { useRef } from 'react'
import { useDrift } from '../lib/motion'

// Fine paper grain, drawn by the browser from SVG noise (no image file).
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"

/**
 * Soft shapes of tan, olive and copper drifting behind every screen, under a
 * paper grain, so the cream background feels like a sunlit page, not a flat fill.
 */
export function NatureBackdrop() {
  const root = useRef<HTMLDivElement>(null)
  useDrift(root)
  return (
    <div ref={root} aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div data-drift className="rounded-blob absolute -top-[16vmax] -right-[20vmax] size-[56vmax] bg-teal-400 opacity-40 blur-3xl will-change-transform dark:opacity-15" />
      <div data-drift className="rounded-blob absolute top-[35%] -left-[24vmax] size-[50vmax] bg-emerald-600 opacity-20 blur-3xl will-change-transform dark:opacity-20" />
      <div data-drift className="rounded-blob absolute -right-[12vmax] -bottom-[22vmax] size-[48vmax] bg-teal-600 opacity-25 blur-3xl will-change-transform dark:opacity-15" />
      <div className="absolute inset-0 opacity-[0.08] mix-blend-multiply dark:opacity-[0.12] dark:mix-blend-soft-light" style={{ backgroundImage: GRAIN }} />
    </div>
  )
}
