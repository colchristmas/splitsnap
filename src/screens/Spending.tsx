import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { BarList, type BarRow } from '../components/BarList'
import { PageTitle } from '../components/layouts'
import { Card, Empty, PersonChip, SectionTitle, Segmented, cx } from '../components/ui'
import { useCategoriesById } from '../db/categories'
import { usePeopleById } from '../db/hooks'
import { db } from '../db/schema'
import { CHARGES_ROW, inPeriod, spending, type Period, type SpendingRow } from '../lib/spending'

type Range = Period['kind']

export function Spending() {
  const receipts = useLiveQuery(() => db.receipts.where('status').equals('final').toArray(), []) ?? []
  const people = usePeopleById()
  const categories = useCategoriesById()
  const [range, setRange] = useState<Range>('month')
  const [cursor, setCursor] = useState(() => ({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 }))
  const [personId, setPersonId] = useState<string>()

  const period: Period = range === 'all' ? { kind: 'all' } : range === 'year' ? { kind: 'year', year: cursor.year } : { kind: 'month', ...cursor }
  const inRange = receipts.filter((r) => inPeriod(r.date, period))
  const data = spending(inRange, personId)

  // Everyone who's on a saved receipt, "Me" first.
  const personIds = [...new Set(receipts.flatMap((r) => r.participantIds))].sort(
    (a, b) => Number(Boolean(people.get(b)?.isSelf)) - Number(Boolean(people.get(a)?.isSelf)),
  )

  const step = (delta: number) =>
    setCursor(({ year, month }) => {
      if (range === 'year') return { year: year + delta, month }
      const m = month + delta
      return { year: year + Math.floor((m - 1) / 12), month: ((m - 1 + 120) % 12) + 1 }
    })

  const periodLabel =
    period.kind === 'all'
      ? 'All time'
      : period.kind === 'year'
        ? String(period.year)
        : new Date(period.year, period.month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const toBars = (rows: SpendingRow[]): BarRow[] =>
    rows.map((r) => ({
      key: r.id ?? 'none',
      name: r.id === CHARGES_ROW ? 'Tax, tip & fees' : r.id ? (categories.get(r.id)?.name ?? 'Uncategorized') : 'Uncategorized',
      cents: r.cents,
    }))

  const personName = personId ? (people.get(personId)?.name ?? 'Someone') : undefined

  return (
    <>
      <PageTitle>Spending</PageTitle>

      <div className="flex items-center justify-between gap-2">
        <Segmented<Range>
          value={range}
          options={[
            { value: 'month', label: 'Month' },
            { value: 'year', label: 'Year' },
            { value: 'all', label: 'All time' },
          ]}
          onChange={setRange}
        />
        {range !== 'all' && (
          <div className="flex items-center">
            <button type="button" onClick={() => step(-1)} className="rounded-full p-1.5 hover:bg-stone-200 dark:hover:bg-stone-800" aria-label="Previous">
              <ChevronLeft size={20} />
            </button>
            <button type="button" onClick={() => step(1)} className="rounded-full p-1.5 hover:bg-stone-200 dark:hover:bg-stone-800" aria-label="Next">
              <ChevronRight size={20} />
            </button>
          </div>
        )}
      </div>

      {personIds.length > 1 && (
        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Whose spending">
          <button
            type="button"
            onClick={() => setPersonId(undefined)}
            aria-pressed={!personId}
            className={cx(
              'shrink-0 rounded-full px-3 py-1 text-sm font-medium ring-1',
              !personId ? 'bg-teal-700 text-white ring-transparent' : 'bg-white ring-stone-300 dark:bg-stone-900 dark:ring-stone-700',
            )}
          >
            Everyone
          </button>
          {personIds.map((id) => (
            <PersonChip key={id} person={people.get(id)} selected={personId === id} onClick={() => setPersonId(id)} />
          ))}
        </div>
      )}

      <Card className="mt-3">
        <p className="text-sm text-stone-500">
          {periodLabel}
          {personName && ` · ${personName}'s share`}
        </p>
        <p className="text-5xl font-bold tracking-tight">{formatTotal(data.totalCents)}</p>
        <p className="mt-1 text-sm text-stone-500">
          {data.receiptCount} {data.receiptCount === 1 ? 'receipt' : 'receipts'}
        </p>
      </Card>

      {data.receiptCount === 0 ? (
        <Empty>No saved receipts here yet. Receipts count once you tap Save on the split.</Empty>
      ) : (
        <>
          <SectionTitle>By receipt type</SectionTitle>
          <Card>
            <BarList rows={toBars(data.byReceiptCategory)} totalCents={data.totalCents} label="Spending by receipt type" />
          </Card>
          <SectionTitle>By item type</SectionTitle>
          <Card>
            <BarList rows={toBars(data.byItemCategory)} totalCents={data.totalCents} label="Spending by item type" />
          </Card>
        </>
      )}
    </>
  )
}

/** Big totals drop the cents once they're in the thousands. */
function formatTotal(cents: number): string {
  const dollars = cents / 100
  return dollars >= 1000
    ? dollars.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
    : dollars.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}
