import { ArrowLeft, ChartBar, History, Home, Settings, Users, type LucideIcon } from 'lucide-react'
import { useRef, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useOutletContext, useParams } from 'react-router'
import { useReceipt } from '../db/hooks'
import { useEnter, useEnterAnimations, usePop, useSlidingIndicator } from '../lib/motion'
import type { Receipt } from '../lib/types'
import { Empty, cx } from './ui'

const TABS = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/history', label: 'History', icon: History },
  { to: '/spending', label: 'Spending', icon: ChartBar },
  { to: '/people', label: 'People', icon: Users },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function TabsLayout() {
  const main = useRef<HTMLElement>(null)
  const nav = useRef<HTMLElement>(null)
  const pill = useRef<HTMLSpanElement>(null)
  const { pathname } = useLocation()
  useEnterAnimations(main)
  useSlidingIndicator(nav, pill, pathname, { anchor: '[aria-current="page"] [data-tab-icon]', pad: { x: 14, y: 4 } })

  return (
    <>
      <main ref={main} className="mx-auto max-w-lg px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-32">
        <Outlet />
      </main>
      {/* A floating dock, like a pebble resting at the bottom of the screen. */}
      <nav
        ref={nav}
        className="fixed inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 mx-auto w-[calc(100%-1.5rem)] max-w-md rounded-[2rem] bg-stone-900/95 p-1.5 shadow-[0_16px_36px_-14px_rgb(40_54_24/0.65)] backdrop-blur dark:bg-stone-800/95"
      >
        <span ref={pill} aria-hidden className="pointer-events-none absolute left-0 rounded-full bg-teal-400 opacity-0 transition-opacity" />
        <ul className="relative flex">
          {TABS.map(({ to, label, icon }) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  cx(
                    'flex flex-col items-center gap-1 rounded-[1.5rem] py-1.5 text-[11px] font-medium transition-colors',
                    isActive ? 'text-teal-400 [&_[data-tab-icon]]:text-stone-900' : 'text-stone-400 hover:text-stone-200',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <TabIcon icon={icon} active={isActive} />
                    {label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </>
  )
}

/** A tab's icon, which pops when its tab becomes active. */
function TabIcon({ icon: Icon, active }: { icon: LucideIcon; active: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  usePop(ref, active, { from: 0.6, when: active })
  return (
    <span ref={ref} data-tab-icon className="inline-flex transition-colors">
      <Icon size={22} strokeWidth={1.9} />
    </span>
  )
}

export function PageTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <header className="mb-5 flex items-end justify-between gap-2">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{children}</h1>
        <Wave className="mt-1 h-2.5 w-16 text-teal-600" />
      </div>
      {action}
    </header>
  )
}

/** A short hand-drawn wave, used as an underline. */
export function Wave({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 10" fill="none" aria-hidden className={className} preserveAspectRatio="none">
      <path d="M2 6c6-5 10-5 15 0s9 5 15 0 10-5 15 0 9 4 15-1" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

const STEPS = [
  { path: 'items', label: 'Items' },
  { path: 'people', label: 'People' },
  { path: 'split', label: 'Split' },
]

/** Wraps the receipt flow: loads the receipt and passes it to each step. */
export function ReceiptLayout() {
  const { id } = useParams()
  const receipt = useReceipt(id)
  const { pathname } = useLocation()
  const scanning = pathname.endsWith('/scan')
  const main = useRef<HTMLElement>(null)
  useEnterAnimations(main)

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-teal-200/60 bg-stone-100/85 pt-[env(safe-area-inset-top)] backdrop-blur dark:border-stone-800 dark:bg-stone-950/85">
        <div className="mx-auto flex max-w-lg items-center gap-2 px-2 py-2">
          <Link to="/" className="rounded-full p-2 hover:bg-teal-100 dark:hover:bg-stone-800" aria-label="Back to home">
            <ArrowLeft size={22} />
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{receipt?.store || 'New receipt'}</h1>
        </div>
        {!scanning && receipt && <StepNav />}
      </header>
      <main ref={main} className="mx-auto max-w-lg px-4 pt-4 pb-32">
        {receipt === undefined ? null : receipt === null ? (
          <Empty>
            This receipt doesn't exist anymore. <Link to="/" className="text-teal-700 underline">Go home</Link>
          </Empty>
        ) : (
          <Outlet context={receipt} />
        )}
      </main>
    </>
  )
}

/** Items / People / Split, with the highlight sliding to the current step. */
function StepNav() {
  const nav = useRef<HTMLElement>(null)
  const pill = useRef<HTMLSpanElement>(null)
  const { pathname } = useLocation()
  useSlidingIndicator(nav, pill, pathname)

  return (
    <div className="px-4 pb-2.5">
    <nav ref={nav} className="relative mx-auto flex max-w-lg gap-1 rounded-full bg-teal-100/80 p-1 dark:bg-stone-900" aria-label="Steps">
      <span ref={pill} aria-hidden className="pointer-events-none absolute left-0 rounded-full bg-teal-400 shadow-[inset_0_-2px_0_var(--color-teal-600)] opacity-0 transition-opacity" />
      {STEPS.map((s, i) => (
        <NavLink
          key={s.path}
          to={s.path}
          className={({ isActive }) =>
            cx(
              'relative flex-1 rounded-full py-1.5 text-center text-sm font-medium transition-colors duration-300',
              isActive ? 'font-semibold text-stone-900' : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100',
            )
          }
        >
          {i + 1}. {s.label}
        </NavLink>
      ))}
    </nav>
    </div>
  )
}

export const useReceiptContext = () => useOutletContext<Receipt>()

/** A button bar pinned above the bottom edge, for each step's main action. It rises in when it appears. */
export function ActionBar({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEnter(ref, 28)
  return (
    <div ref={ref} className="fixed inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 px-3">
      <div className="mx-auto flex max-w-lg gap-2 rounded-[2rem] bg-white/90 p-2 shadow-warm ring-1 ring-teal-200/70 backdrop-blur dark:bg-stone-900/90 dark:ring-stone-700">
        {children}
      </div>
    </div>
  )
}
