import { ArrowLeft, Check, Share2, UserMinus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { TextField } from '../components/fields'
import { Avatar, Button, Card, Empty, SectionTitle, cx } from '../components/ui'
import { markUnsettled, settleWithPerson, useBalances } from '../db/balances'
import { usePeopleById } from '../db/hooks'
import { archivePerson, renamePerson } from '../db/people'
import { balancesText, combine } from '../lib/balances'
import { formatCents } from '../lib/money'
import { formatDate, shareText } from '../lib/share'

/** One person: what's open between you, every bill you've shared, and settling up. */
export function PersonPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const people = usePeopleById()
  const person = people.get(id)
  const { meId, receipts, byPerson } = useBalances()
  const balance = byPerson.get(id)
  const [toast, setToast] = useState<string>()
  const name = (pid: string) => people.get(pid)?.name ?? 'Someone'

  if (!person) return <Empty>Loading…</Empty>

  const receiptById = new Map(receipts.map((r) => [r.id, r]))
  const shares = balance?.shares ?? []
  const openReceipts = shares.filter((s) => !s.settled).map((s) => receiptById.get(s.receiptId)!)

  // Running balance, oldest first, counting only what isn't settled.
  let running = 0
  const runningAfter = new Map<string, number>()
  for (const s of [...shares].reverse()) {
    if (!s.settled) running += s.cents
    runningAfter.set(s.receiptId, running)
  }

  const share = async () => {
    if (!meId) return
    const mine = combine(openReceipts, meId).filter((p) => p.personId === id)
    const outcome = await shareText(balancesText(openReceipts, mine, name, meId)).catch(() => 'failed' as const)
    setToast(outcome === 'copied' ? 'Copied to clipboard' : outcome === 'failed' ? "Couldn't share or copy" : undefined)
    setTimeout(() => setToast(undefined), 2500)
  }

  return (
    <>
      <Link to="/people" className="-ml-1 mb-3 inline-flex items-center gap-1 text-sm font-medium text-teal-700 dark:text-teal-400">
        <ArrowLeft size={16} /> People
      </Link>

      <Card className="flex items-center gap-3">
        <Avatar person={person} />
        <TextField value={person.name} onCommit={(n) => void renamePerson(person.id, n)} className="min-w-0 flex-1 text-lg font-semibold" aria-label="Name" />
      </Card>

      <Card className="mt-3">
        {balance ? (
          <>
            <p className="text-2xl font-semibold">
              {balance.openCents === 0 ? (
                <span className="text-stone-500">All settled up</span>
              ) : balance.openCents > 0 ? (
                <span className="text-emerald-700 dark:text-emerald-400">
                  {person.name} owes you <strong>{formatCents(balance.openCents)}</strong>
                </span>
              ) : (
                <span className="text-amber-700 dark:text-amber-400">
                  You owe {person.name} <strong>{formatCents(-balance.openCents)}</strong>
                </span>
              )}
            </p>
            <p className="mt-1 text-sm text-stone-500">
              {balance.openBills} open {balance.openBills === 1 ? 'bill' : 'bills'} · {shares.length} in total
            </p>
            {balance.openBills > 0 && meId && (
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => void share()}>
                  <Share2 size={16} /> Share
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    if (confirm(`Mark all ${balance.openBills} open bills with ${person.name} as settled?`)) void settleWithPerson(balance, meId)
                  }}
                >
                  <Check size={16} /> Mark all settled
                </Button>
              </div>
            )}
          </>
        ) : (
          <p className="text-stone-500">No saved bills with {person.name} yet.</p>
        )}
      </Card>

      {shares.length > 0 && (
        <>
          <SectionTitle>Activity</SectionTitle>
          <Card className="divide-y divide-stone-100 p-0! dark:divide-stone-800">
            {shares.map((s) => {
              const r = receiptById.get(s.receiptId)!
              const after = runningAfter.get(s.receiptId) ?? 0
              return (
                <div key={s.receiptId} className={cx('flex items-center gap-3 px-4 py-3', s.settled && 'opacity-60')}>
                  <Link to={`/r/${r.id}/split`} className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.store || 'Untitled receipt'}</p>
                    <p className="text-sm text-stone-500">
                      {formatDate(r.date)} · {r.payerId === meId ? 'you paid' : `${name(r.payerId)} paid`}
                    </p>
                  </Link>
                  <div className="text-right">
                    <p className="font-semibold tabular-nums">
                      {s.cents >= 0 ? '+' : '−'}
                      {formatCents(Math.abs(s.cents))}
                    </p>
                    <p className="text-xs text-stone-500 tabular-nums">balance {formatCents(after)}</p>
                  </div>
                  {s.settled ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm('Mark this bill as not settled?')) void markUnsettled(s.receiptId, id)
                      }}
                      className="rounded-full bg-stone-200 px-2 py-1 text-xs font-medium dark:bg-stone-800"
                    >
                      Settled
                    </button>
                  ) : (
                    meId && (
                      <button
                        type="button"
                        onClick={() => void settleWithPerson({ ...balance!, shares: [s] }, meId)}
                        className="rounded-full px-2 py-1 text-xs font-medium text-teal-800 ring-1 ring-teal-600 dark:text-teal-300"
                      >
                        Settle
                      </button>
                    )
                  )}
                </div>
              )
            })}
          </Card>
          <p className="mt-2 px-1 text-xs text-stone-500">
            + means {person.name} owes you, − means you owe {person.name}. Settled bills don't count toward the balance.
          </p>
        </>
      )}

      <Button
        variant="danger"
        size="sm"
        className="mt-6"
        onClick={async () => {
          if (!confirm(`Remove ${person.name}? Past receipts will still show their name.`)) return
          await archivePerson(person.id)
          navigate('/people')
        }}
      >
        <UserMinus size={16} /> Remove {person.name}
      </Button>

      {toast && (
        <div className="fixed inset-x-0 bottom-24 flex justify-center" role="status">
          <span className="rounded-full bg-stone-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-stone-100 dark:text-stone-900">{toast}</span>
        </div>
      )}
    </>
  )
}
