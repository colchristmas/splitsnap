// Colors for bento tiles (see Tile in ui.tsx).

export type TileTone = 'copper' | 'tan' | 'olive' | 'forest' | 'cream'

// Text on each tone passes WCAG AA, except copper, which only carries large
// text (20px bold and up) and icons.
export const TONES: Record<TileTone, string> = {
  copper: 'bg-teal-600 text-stone-100',
  tan: 'bg-teal-400 text-stone-900',
  olive: 'bg-emerald-700 text-stone-100',
  forest: 'bg-stone-900 text-stone-100 dark:bg-stone-800',
  cream: 'bg-white/90 text-stone-900 ring-1 ring-teal-200/70 dark:bg-stone-900 dark:text-stone-100 dark:ring-stone-700',
}

/** Secondary text that stays readable on each tone. */
export const TILE_MUTED: Record<TileTone, string> = {
  copper: 'text-stone-100',
  tan: 'text-stone-800',
  olive: 'text-stone-100',
  forest: 'text-stone-300',
  cream: 'text-stone-500 dark:text-stone-400',
}
