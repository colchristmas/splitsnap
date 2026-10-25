import { Check, Share2, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ActionBar, useReceiptContext } from '../components/layouts'
import { ShareTextBox, useShareDraft } from '../components/ShareTextBox'
import { Avatar, Banner, Button, Card } from '../components/ui'
import { useCategoriesById } from '../db/categories'
import { usePeopleById } from '../db/hooks'
import { updateReceipt } from '../db/receipts'
import { formatCents } from '../lib/money'
import { formatDate, groupByCategory, personText, receiptText, shareLabel, shareText, type CategoryGroup } from '../lib/share'
import { split, type PersonSplit } from '../lib/split'

export function Summary() {
  const receipt = useReceiptContext()
  const navigate = useNavigate()
  const byId = usePeopleById()
  const categories = useCategoriesById()
  const [toast, setToast] = useState<string>()
  const result = useMemo(() => split(receipt), [receipt])
  const name = (id: string) => byId.get(id)?.name ?? 'Someone'
  // Share all sends this message; the user can edit it at the bottom of the page.
  const draft = useShareDraft(receiptText(receipt, result, name, categories), receipt.shareText, (shareText) =>
    void updateReceipt(receipt.id, (r) => {
      if (shareText) r.shareText = shareText
      else delete r.shareText
    }),
  )

  const share = async (text: string) => {
    const outcome = await shareText(text).catch(() => 'failed' as const)
    if (outcome === 'copied') setToast('Copied to clipboard')
    if (outcome === 'failed') setToast("Couldn't share or copy")
    setTimeout(() => setToast(undefined), 2500)
  }

  if (result.unassignedItemIds.length > 0) {
    return (
      <Banner tone="warn">
        <TriangleAlert size={18} className="shrink-0" />
        <span>
          {result.unassignedItemIds.length} item(s) still need someone.{' '}
          <Link to="../people" className="font-semibold underline">
            Assign them
          </Link>
        </span>
      </Banner>
    )
  }

  const people = [...result.people]
    .filter((p) => p.items.length > 0 || p.totalCents !== 0)
    .sort((a, b) => Number(a.personId === receipt.payerId) - Number(b.personId === receipt.payerId))
  const sum = people.reduce((a, p) => a + p.totalCents, 0)
  const printedDiff = receipt.printedTotalCents === undefined ? 0 : result.grandTotalCents - receipt.printedTotalCents

  return (
    <>
      <Card className="mb-3">
        <p className="text-sm text-stone-500">
          {formatDate(receipt.date)} · paid by {name(receipt.payerId)}
        </p>
        <p className="text-3xl font-bold tabular-nums">{formatCents(result.grandTotalCents)}</p>
        <div className="mt-2 grid gap-2">
          {sum === result.grandTotalCents && (
            <Banner tone="ok">
              <Check size={18} className="shrink-0" /> Everyone's shares add up to the total.
            </Banner>
          )}
          {printedDiff !== 0 && (
            <Banner tone="warn">
              <TriangleAlert size={18} className="shrink-0" /> The receipt says {formatCents(receipt.printedTotalCents ?? 0)}.{' '}
              <Link to="../items" className="font-semibold underline">
                Check items
              </Link>
            </Banner>
          )}
        </div>
      </Card>

      <div className="grid gap-3">
        {people.map((p) => (
          <PersonCard
            key={p.personId}
            split={p}
            name={name(p.personId)}
            color={byId.get(p.personId)?.color}
            payerName={name(receipt.payerId)}
            isPayer={p.personId === receipt.payerId}
            groups={groupByCategory(p.items, receipt, categories)}
            onShare={() => void share(personText(receipt, p, name, categories))}
          />
        ))}
      </div>

      <ShareTextBox draft={draft} hint="Edit anything here before sharing. Share all sends this message, and your changes are saved with the receipt." />

      {toast && (
        <div className="fixed inset-x-0 bottom-28 flex justify-center" role="status">
          <span className="rounded-full bg-stone-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-stone-100 dark:text-stone-900">
            {toast}
          </span>
        </div>
      )}

      <ActionBar>
        <Button className="flex-1" onClick={() => void share(draft.text)}>
          <Share2 size={18} /> Share all
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          onClick={async () => {
            await updateReceipt(receipt.id, (r) => void (r.status = 'final'))
            // Ask the browser not to evict our data once there's something worth keeping.
            void navigator.storage?.persist?.()
            navigate('/history')
          }}
        >
          <Check size={18} /> {receipt.status === 'final' ? 'Done' : 'Save'}
        </Button>
      </ActionBar>
    </>
  )
}

function PersonCard({
  split: p,
  name,
  color,
  payerName,
  isPayer,
  groups,
  onShare,
}: {
  split: PersonSplit
  name: string
  color?: string
  payerName: string
  isPayer: boolean
  groups: CategoryGroup[]
  onShare: () => void
}) {
  const charges = p.charges.filter((c) => c.cents !== 0)
  return (
    <Card>
      <div className="flex items-center gap-3">
        <Avatar person={{ name, color: color ?? '#a8a29e' }} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{name}</p>
          <p className="text-sm text-stone-500">{isPayer ? 'Paid the bill' : `Owes ${payerName}`}</p>
        </div>
        <span className="text-xl font-bold tabular-nums">{formatCents(p.totalCents)}</span>
        {!isPayer && (
          <button type="button" onClick={onShare} className="rounded-full p-2 text-teal-700 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-stone-800" aria-label={`Share ${name}'s total`}>
            <Share2 size={18} />
          </button>
        )}
      </div>
      <ul className="mt-3 grid gap-0.5 border-t border-stone-100 pt-2 text-sm dark:border-stone-800">
        {groups.map((g) => [
          g.name && (
            <li key={`h-${g.name}`} className="mt-1.5 flex justify-between gap-2 text-xs font-semibold tracking-wide text-stone-500 uppercase first:mt-0">
              <span>{g.name}</span>
              {g.items.length > 1 && <span className="tabular-nums">{formatCents(g.cents)}</span>}
            </li>
          ),
          ...g.items.map((i) => {
            const frac = shareLabel(i)
            return (
              <li key={i.itemId} className="flex justify-between gap-2 text-stone-700 dark:text-stone-300">
                <span className="min-w-0 truncate">
                  {i.name || 'Item'}
                  {frac && <span className="text-stone-500"> {frac}</span>}
                </span>
                <span className="tabular-nums">{formatCents(i.cents)}</span>
              </li>
            )
          }),
        ])}
        {charges.length > 0 && groups.some((g) => g.name) && (
          <li className="mt-1.5 text-xs font-semibold tracking-wide text-stone-500 uppercase">Shared charges</li>
        )}
        {charges.map((c) => (
          <li key={c.chargeId} className="flex justify-between gap-2 text-stone-500">
            <span className="min-w-0 truncate">{c.label}</span>
            <span className="tabular-nums">{formatCents(c.cents)}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
