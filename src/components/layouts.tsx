import { ArrowLeft, History, Home, Settings, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useOutletContext, useParams } from 'react-router'
import { useReceipt } from '../db/hooks'
import type { Receipt } from '../lib/types'
import { Empty, cx } from './ui'

const TABS = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/history', label: 'History', icon: History },
  { to: '/people', label: 'People', icon: Users },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function TabsLayout() {
  return (
    <>
      <main className="mx-auto max-w-lg px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-28">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 border-t border-stone-200 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-stone-800 dark:bg-stone-900/90">
        <ul className="mx-auto flex max-w-lg">
          {TABS.map(({ to, label, icon: Icon }) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                end
                className={({ isActive }) =>
                  cx(
                    'flex flex-col items-center gap-0.5 py-2 text-xs font-medium',
                    isActive ? 'text-teal-700 dark:text-teal-400' : 'text-stone-500',
                  )
                }
              >
                <Icon size={22} />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </>
  )
}

export function PageTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <header className="mb-4 flex items-center justify-between">
      <h1 className="text-2xl font-bold">{children}</h1>
      {action}
    </header>
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

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-stone-100/90 pt-[env(safe-area-inset-top)] backdrop-blur dark:border-stone-800 dark:bg-stone-950/90">
        <div className="mx-auto flex max-w-lg items-center gap-2 px-2 py-2">
          <Link to="/" className="rounded-full p-2 hover:bg-stone-200 dark:hover:bg-stone-800" aria-label="Back to home">
            <ArrowLeft size={22} />
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{receipt?.store || 'New receipt'}</h1>
        </div>
        {!scanning && receipt && (
          <nav className="mx-auto flex max-w-lg gap-1 px-4 pb-2" aria-label="Steps">
            {STEPS.map((s, i) => (
              <NavLink
                key={s.path}
                to={s.path}
                className={({ isActive }) =>
                  cx(
                    'flex-1 rounded-lg py-1.5 text-center text-sm font-medium',
                    isActive ? 'bg-teal-700 text-white' : 'text-stone-600 hover:bg-stone-200 dark:text-stone-400 dark:hover:bg-stone-800',
                  )
                }
              >
                {i + 1}. {s.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-lg px-4 pt-4 pb-32">
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

export const useReceiptContext = () => useOutletContext<Receipt>()

/** A button bar pinned above the bottom edge, for each step's main action. */
export function ActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 border-t border-stone-200 bg-white/95 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur dark:border-stone-800 dark:bg-stone-900/95">
      <div className="mx-auto flex max-w-lg gap-2 px-4 pt-3">{children}</div>
    </div>
  )
}
