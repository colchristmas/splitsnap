import { animate, utils } from 'animejs'
import { QrCode, RefreshCw, Wifi, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { encode } from 'uqr'
import { reducedMotion, usePopIn } from '../lib/motion'

interface LanUrl {
  name: string
  url: string
}

// Only worth showing on the computer itself, not once you've opened the app
// through its network address (on the phone, or on the computer).
const ON_COMPUTER = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)

/**
 * Dev only (`npx vite --host --mode phone`): a small bento box with a QR code
 * of this computer's Wi-Fi address, so a phone on the same network opens the
 * app by scanning it. The addresses come from vite.config.ts.
 */
export function PhoneQr() {
  const [urls, setUrls] = useState<LanUrl[]>([])
  const [pick, setPick] = useState(0)
  // Starts folded on narrow windows, where it would cover the app.
  const [open, setOpen] = useState(() => matchMedia('(min-width: 1040px)').matches)

  useEffect(() => {
    if (!ON_COMPUTER) return
    let live = true
    fetch('/__splitsnap/lan')
      .then((r) => (r.ok ? (r.json() as Promise<LanUrl[]>) : []))
      .then((u) => live && setUrls(u))
      .catch(() => {})
    return () => void (live = false)
  }, [])

  if (!ON_COMPUTER || urls.length === 0) return null
  const current = urls[pick % urls.length]

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        aria-label="Show a QR code to open SplitSnap on your phone"
        className="fixed top-3 right-3 z-30 grid size-12 place-items-center rounded-[1.1rem] bg-stone-900 text-teal-400 shadow-[0_12px_28px_-12px_rgb(40_54_24/0.7)] hover:text-teal-300"
      >
        <QrCode size={24} />
      </button>
    )

  return <QrBox current={current} count={urls.length} index={pick % urls.length} onNext={() => setPick((i) => i + 1)} onClose={() => setOpen(false)} />
}

function QrBox({
  current,
  count,
  index,
  onNext,
  onClose,
}: {
  current: LanUrl
  count: number
  index: number
  onNext: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLElement>(null)
  usePopIn(ref)
  return (
    // The forest frame is the box; the gaps between compartments show it.
    <aside
      ref={ref}
      aria-label="Open SplitSnap on your phone"
      className="fixed top-3 right-3 z-30 grid w-60 grid-cols-[1fr_3rem] gap-1.5 rounded-[1.75rem] bg-stone-900 p-1.5 shadow-[0_16px_36px_-14px_rgb(40_54_24/0.7)]"
    >
      <div className="row-span-2 rounded-[1.25rem] bg-stone-100 p-1.5">
        <QrSvg url={current.url} />
      </div>
      <div className="grid place-items-center rounded-[1rem] bg-teal-400 text-stone-900" title="Phone and computer on the same Wi-Fi">
        <Wifi size={22} aria-hidden />
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-expanded
        aria-label="Hide the QR code"
        className="grid place-items-center rounded-[1rem] bg-teal-600 text-stone-100 hover:bg-teal-700"
      >
        <X size={22} />
      </button>
      <div className="col-span-2 rounded-[1.25rem] bg-emerald-700 px-3 py-2 text-stone-100">
        <p className="text-sm font-semibold">Scan on the same Wi-Fi</p>
        <p className="truncate font-mono text-xs" title={current.url}>
          {current.url.replace(/\/$/, '')}
        </p>
        {count > 1 && (
          <button type="button" onClick={onNext} className="mt-1 inline-flex items-center gap-1 text-xs font-medium underline-offset-2 hover:underline">
            <RefreshCw size={12} aria-hidden /> Not opening? Try address {((index + 1) % count) + 1} of {count}
          </button>
        )}
      </div>
    </aside>
  )
}

// The QR code's blank margin, in modules. The cream cell around it adds more.
const QUIET = 2

/**
 * The QR code as a grid of small rounded tiles, with pebble-shaped corner
 * markers. Forest on cream keeps it at 12:1 contrast, so cameras read it
 * easily. The tiles ripple in from the middle whenever the address changes.
 */
function QrSvg({ url }: { url: string }) {
  const ref = useRef<SVGSVGElement>(null)
  const { size, data } = useMemo(() => encode(url, { ecc: 'M', border: 0 }), [url])

  const finder = (r: number, c: number) => (r < 7 || r >= size - 7) && (c < 7 || c >= size - 7) && !(r >= size - 7 && c >= size - 7)
  const mid = (size - 1) / 2
  const modules = []
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (data[r][c] && !finder(r, c))
        modules.push(
          <rect key={`${r}-${c}`} data-d={Math.hypot(r - mid, c - mid).toFixed(1)} x={c + 0.06} y={r + 0.06} width={0.88} height={0.88} rx={0.26} />,
        )

  useLayoutEffect(() => {
    const svg = ref.current
    if (!svg || reducedMotion()) return
    const tiles = [...svg.querySelectorAll<SVGRectElement>('[data-d]')]
    const anim = animate(tiles, {
      opacity: { from: 0, to: 1, duration: 260, ease: 'outQuad' },
      scale: { from: 0.2, to: 1, duration: 420, ease: 'outBack(2)' },
      delay: (el: unknown) => Number((el as SVGElement).dataset.d) * 22,
      onComplete: (a) => void utils.cleanInlineStyles(a),
    })
    // Hidden until their turn. This comes after animate(), which records the
    // inline styles it finds and would otherwise restore these.
    for (const t of tiles) t.style.opacity = '0'
    return () => void anim.revert()
  }, [url])

  return (
    <svg
      ref={ref}
      viewBox={`${-QUIET} ${-QUIET} ${size + QUIET * 2} ${size + QUIET * 2}`}
      role="img"
      aria-label={`QR code for ${url}`}
      className="block aspect-square w-full text-stone-900 [&_rect]:origin-center [&_rect]:[transform-box:fill-box]"
      fill="currentColor"
    >
      {[
        [0, 0],
        [0, size - 7],
        [size - 7, 0],
      ].map(([r, c]) => (
        <g key={`${r}-${c}`}>
          <rect x={c + 0.5} y={r + 0.5} width={6} height={6} rx={1.8} fill="none" stroke="currentColor" strokeWidth={1} />
          <rect x={c + 2} y={r + 2} width={3} height={3} rx={0.9} />
        </g>
      ))}
      {modules}
    </svg>
  )
}
