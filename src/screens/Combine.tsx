import { ArrowLeft, Check, Share2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { BalanceText } from '../components/BalanceText'
import { ShareTextBox, useShareDraft } from '../components/ShareTextBox'
import { Avatar, Button, Card, Empty, SectionTitle } from '../components/ui'
import { markSettled, useBalances } from '../db/balances'
import { useCategoriesById } from '../db/categories'
import { usePeopleById } from '../db/hooks'
import { combine } from '../lib/balances'
import { formatCents } from '../lib/money'
import { combinedReceiptsText, dateRange, formatDate, shareText } from '../lib/share'

/** Several bills combined into one total per person, to share and settle in one go. */
export function Combine() {
  const [params] = useSearchParams()
  const ids = (params.get('ids') ?? '').split(',').filter(Boolean)
  const people = usePeopleById()
  const categories = useCategoriesById()
  const { meId, receipts } = useBalances()
  const [toast, setToast] = useState<string>()
  const name = (id: string) => people.get(id)?.name ?? 'Someone'

  const bills = receipts.filter((r) => ids.includes(r.id))
  const combined = meId ? combine(bills, meId) : []
  const byId = new Map(bills.map((r) => [r.id, r]))

  // What gets shared is one neutral, itemized list per person across all the
  // bills, editable at the bottom of the page (not saved: the selection is ad hoc).
  const draft = useShareDraft(combinedReceiptsText(bills, name, categories, meId))
  const share = async () => {
    const outcome = await shareText(draft.text).catch(() => 'failed' as const)
    setToast(outcome === 'copied' ? 'Copied to clipboard' : outcome === 'failed' ? "Couldn't share or copy" : undefined)
    setTimeout(() => setToast(undefined), 2500)
  }

  return (
    <>
      <Link to="/history" className="-ml-1 mb-3 inline-flex items-center gap-1 text-sm font-medium text-teal-700 dark:text-teal-400">
        <ArrowLeft size={16} /> History
      </Link>
      <header className="mb-4">
        <h1 className="text-2xl font-bold">Combined bills</h1>
        <p className="text-stone-500">
          {bills.length} {bills.length === 1 ? 'bill' : 'bills'} · {dateRange(bills.map((r) => r.date))}
        </p>
      </header>

      {combined.length === 0 ? (
        <Empty>{bills.length ? 'Everything on these bills is settled.' : 'No saved bills selected.'}</Empty>
      ) : (
        <>
          <div className="mb-3 flex gap-2">
            <Button className="flex-1" onClick={() => void share()}>
              <Share2 size={18} /> Share
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={() => {
                if (meId && confirm('Mark everyone on these bills as settled?')) void markSettled(ids, meId)
              }}
            >
              <Check size={18} /> Mark all settled
            </Button>
          </div>
          <div className="grid gap-3">
            {combined.map((p) => {
              const sign = Math.sign(p.totalCents) || 1
              return (
                <Card key={p.personId}>
                  <div className="flex items-center gap-3">
                    <Avatar person={people.get(p.personId)} />
                    <p className="min-w-0 flex-1 truncate font-semibold">{name(p.personId)}</p>
                    <BalanceText cents={p.totalCents} />
                  </div>
                  <ul className="mt-3 grid gap-0.5 border-t border-stone-100 pt-2 text-sm dark:border-stone-800">
                    {p.shares.map((s) => {
                      const r = byId.get(s.receiptId)!
                      return (
                        <li key={s.receiptId} className="flex justify-between gap-2 text-stone-700 dark:text-stone-300">
                          <span className="min-w-0 truncate">
                            {r.store || 'Receipt'} <span className="text-stone-500">· {formatDate(r.date)}</span>
                          </span>
                          <span className="tabular-nums">{formatCents(s.cents * sign)}</span>
                        </li>
                      )
                    })}
                  </ul>
                </Card>
              )
            })}
          </div>
        </>
      )}

      {bills.length > 0 && (
        <>
          <ShareTextBox draft={draft} hint="Edit anything here before sharing. Share sends this message." />
          <SectionTitle>Bills included</SectionTitle>
          <ul className="grid gap-1 px-1 text-sm text-stone-600 dark:text-stone-400">
            {bills.map((r) => (
              <li key={r.id}>
                <Link to={`/r/${r.id}/split`} className="underline-offset-2 hover:underline">
                  {r.store || 'Untitled receipt'} · {formatDate(r.date)}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {toast && (
        <div className="fixed inset-x-0 bottom-24 flex justify-center" role="status">
          <span className="rounded-full bg-stone-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-stone-100 dark:text-stone-900">{toast}</span>
        </div>
      )}
    </>
  )
}
