import { Check, ChevronDown, Image, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { CategorySelect } from '../components/CategorySelect'
import { MoneyField, Stepper, TextField } from '../components/fields'
import { ActionBar, useReceiptContext } from '../components/layouts'
import { Banner, Button, Card, Empty, SectionTitle, Segmented, cx } from '../components/ui'
import { recategorize, rememberCategory, setItemCategory, useCategoriesById } from '../db/categories'
import { useImageUrl } from '../db/hooks'
import { updateReceipt } from '../db/receipts'
import { newId } from '../db/schema'
import { formatCents } from '../lib/money'
import { split } from '../lib/split'
import { DEFAULT_SPLIT_MODE, type Charge, type ChargeKind, type Item, type Receipt } from '../lib/types'

const CHARGE_KINDS: { kind: ChargeKind; label: string; add: string }[] = [
  { kind: 'tax', label: 'Tax', add: 'Tax' },
  { kind: 'tip', label: 'Tip', add: 'Tip' },
  { kind: 'fee', label: 'Fee', add: 'Bag fee' },
  { kind: 'discount', label: 'Discount', add: 'Discount' },
]

export function Items() {
  const receipt = useReceiptContext()
  const navigate = useNavigate()
  const photo = useImageUrl(receipt.imageId)
  const [showPhoto, setShowPhoto] = useState(false)
  const result = useMemo(() => split(receipt), [receipt])
  const categories = useCategoriesById()
  const update = (change: (r: Receipt) => void) => void updateReceipt(receipt.id, change)

  const changeItem = async (id: string, patch: Partial<Item>) => {
    await updateReceipt(receipt.id, (r) => {
      const item = r.items.find((i) => i.id === id)
      if (item) Object.assign(item, patch)
    })
    // A new name may mean a new category (unless the user picked one).
    if ('name' in patch) await recategorize(receipt.id)
  }
  const setStore = async (store: string) => {
    await updateReceipt(receipt.id, (r) => void (r.store = store))
    await recategorize(receipt.id)
  }
  const setReceiptCategory = async (categoryId: string) => {
    await updateReceipt(receipt.id, (r) => {
      r.categoryId = categoryId
      r.categoryManual = true
    })
    await rememberCategory('receipt', receipt.store, categoryId)
    // Items are guessed differently at a restaurant than at a grocery store.
    await recategorize(receipt.id)
  }
  const changeCharge = (id: string, patch: Partial<Charge>) =>
    update((r) => {
      const c = r.charges.find((x) => x.id === id)
      if (c) Object.assign(c, patch)
    })

  const addItem = () =>
    update((r) => {
      r.items.push({ id: newId(), name: '', quantity: 1, totalCents: 0, discountCents: 0, shares: {} })
    })
  const addCharge = (kind: ChargeKind, label: string) =>
    update((r) => {
      r.charges.push({ id: newId(), kind, label, amountCents: 0, splitMode: DEFAULT_SPLIT_MODE[kind] })
    })

  const hasTaxFlags = receipt.items.some((i) => i.taxable)
  const diff = receipt.printedTotalCents === undefined ? undefined : result.grandTotalCents - receipt.printedTotalCents

  return (
    <>
      <Card className="flex flex-col gap-2">
        <div className="flex items-center gap-1">
          <TextField value={receipt.store} onCommit={(store) => void setStore(store)} placeholder="Store or restaurant" className="flex-1 text-lg font-semibold" aria-label="Store" />
          {photo && (
            <Button size="sm" variant="ghost" className="shrink-0" onClick={() => setShowPhoto(!showPhoto)} aria-pressed={showPhoto}>
              <Image size={16} /> {showPhoto ? 'Hide' : 'Photo'}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={receipt.date}
            onChange={(e) => e.target.value && update((r) => void (r.date = e.target.value))}
            className="shrink-0 rounded-lg bg-transparent px-2 py-1 text-stone-600 ring-1 ring-stone-300 dark:text-stone-300 dark:ring-stone-700"
            aria-label="Date"
          />
          <CategorySelect kind="receipt" value={receipt.categoryId} onChange={(id) => void setReceiptCategory(id)} label="Receipt category" className="min-w-0 flex-1" />
        </div>
        {showPhoto && photo && <img src={photo} alt="Receipt photo" className="mt-1 max-h-[70vh] w-full rounded-lg object-contain" />}
      </Card>

      <SectionTitle>Items</SectionTitle>
      <Card className="px-2 py-1">
        {receipt.items.length === 0 ? (
          <Empty>No items yet.</Empty>
        ) : (
          <ul className="divide-y divide-stone-100 dark:divide-stone-800">
            {receipt.items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                categoryName={item.categoryId ? categories.get(item.categoryId)?.name : undefined}
                onCategory={(id) => void setItemCategory(receipt.id, item.id, id)}
                onChange={(patch) => void changeItem(item.id, patch)}
                onDelete={() => update((r) => void (r.items = r.items.filter((i) => i.id !== item.id)))}
              />
            ))}
          </ul>
        )}
        <Button variant="ghost" size="sm" className="my-1" onClick={addItem}>
          <Plus size={16} /> Add item
        </Button>
      </Card>

      <SectionTitle>Shared charges</SectionTitle>
      <Card className="px-2 py-1">
        {receipt.charges.length > 0 && (
          <ul className="divide-y divide-stone-100 dark:divide-stone-800">
            {receipt.charges.map((c) => (
              <ChargeRow
                key={c.id}
                charge={c}
                onChange={(patch) => changeCharge(c.id, patch)}
                onDelete={() => update((r) => void (r.charges = r.charges.filter((x) => x.id !== c.id)))}
              />
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-1 py-1">
          {CHARGE_KINDS.map((k) => (
            <Button key={k.kind} variant="ghost" size="sm" onClick={() => addCharge(k.kind, k.add)}>
              <Plus size={16} /> {k.add}
            </Button>
          ))}
        </div>
        {hasTaxFlags && (
          <p className="px-2 pb-2 text-xs text-stone-500">Tax is split over items marked “Taxed” only.</p>
        )}
      </Card>

      <SectionTitle>Total</SectionTitle>
      <Card className="grid gap-1.5">
        <Row label="Items" cents={result.itemsTotalCents} />
        <Row label="Shared charges" cents={result.chargesTotalCents} />
        <Row label="Total" cents={result.grandTotalCents} strong />
        <div className="mt-1 flex items-center justify-between gap-2 border-t border-stone-100 pt-2 dark:border-stone-800">
          <span className="text-stone-600 dark:text-stone-400">Receipt says</span>
          <MoneyField
            value={receipt.printedTotalCents}
            onCommit={(c) => update((r) => void (r.printedTotalCents = c))}
            placeholder="Total on receipt"
            className="w-36"
            aria-label="Total printed on the receipt"
          />
        </div>
        {diff === 0 && (
          <Banner tone="ok">
            <Check size={18} className="shrink-0" /> Matches the receipt.
          </Banner>
        )}
        {diff !== undefined && diff !== 0 && (
          <Banner tone="warn">
            <TriangleAlert size={18} className="shrink-0" />
            {diff > 0 ? `${formatCents(diff)} more` : `${formatCents(-diff)} less`} than the receipt. Check the photo for a
            missed or misread line.
          </Banner>
        )}
      </Card>

      <ActionBar>
        <Button variant="primary" size="lg" disabled={receipt.items.length === 0} onClick={() => navigate('../people')}>
          Next: who's splitting
        </Button>
      </ActionBar>
    </>
  )
}

function Row({ label, cents, strong }: { label: string; cents: number; strong?: boolean }) {
  return (
    <div className={cx('flex justify-between', strong ? 'text-lg font-semibold' : 'text-stone-600 dark:text-stone-400')}>
      <span>{label}</span>
      <span className="tabular-nums">{formatCents(cents)}</span>
    </div>
  )
}

function ItemRow({
  item,
  categoryName,
  onCategory,
  onChange,
  onDelete,
}: {
  item: Item
  categoryName?: string
  onCategory: (id: string) => void
  onChange: (p: Partial<Item>) => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <li className="py-1">
      <div className="flex items-center gap-1">
        <TextField value={item.name} onCommit={(name) => onChange({ name })} placeholder="Item name" className="flex-1 font-medium" aria-label="Item name" />
        {item.quantity > 1 && <span className="shrink-0 text-sm text-stone-500">×{item.quantity}</span>}
        <MoneyField value={item.totalCents} onCommit={(c) => onChange({ totalCents: c ?? 0 })} className="w-24 shrink-0" aria-label={`Price of ${item.name}`} />
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="shrink-0 rounded-full p-1.5 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
          aria-label={open ? 'Hide details' : 'Show details'}
          aria-expanded={open}
        >
          <ChevronDown size={18} className={cx('transition-transform', open && 'rotate-180')} />
        </button>
      </div>
      {!open && (categoryName || item.discountCents > 0 || item.depositCents || item.taxable) && (
        <p className="flex gap-3 pl-2 text-xs text-stone-500">
          {categoryName && <span>{categoryName}</span>}
          {item.discountCents > 0 && <span className="text-emerald-700 dark:text-emerald-400">Coupon −{formatCents(item.discountCents)}</span>}
          {Boolean(item.depositCents) && <span>Deposit +{formatCents(item.depositCents!)}</span>}
          {item.taxable && <span>Taxed</span>}
        </p>
      )}
      {open && (
        <div className="mx-2 mt-1 mb-2 grid gap-2 rounded-xl bg-stone-50 p-3 text-sm dark:bg-stone-950">
          <div className="flex items-center justify-between gap-2">
            <span>Category</span>
            <CategorySelect kind="item" value={item.categoryId} onChange={onCategory} label={`Category of ${item.name}`} />
          </div>
          <div className="flex items-center justify-between">
            <span>Quantity</span>
            <Stepper value={item.quantity} min={1} max={99} label="units" onChange={(quantity) => onChange({ quantity })} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>Coupon or discount</span>
            <MoneyField
              value={item.discountCents || undefined}
              onCommit={(c) => onChange({ discountCents: Math.abs(c ?? 0) })}
              placeholder="$0.00"
              className="w-24"
              aria-label="Discount on this item"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>Bottle deposit</span>
            <MoneyField
              value={item.depositCents || undefined}
              onCommit={(c) => onChange({ depositCents: Math.abs(c ?? 0) })}
              placeholder="$0.00"
              className="w-24"
              aria-label="Bottle deposit on this item"
            />
          </div>
          <label className="flex items-center justify-between">
            <span>Taxed item</span>
            <input type="checkbox" className="size-5 accent-teal-700" checked={Boolean(item.taxable)} onChange={(e) => onChange({ taxable: e.target.checked })} />
          </label>
          <Button variant="danger" size="sm" className="justify-self-start" onClick={onDelete}>
            <Trash2 size={16} /> Remove item
          </Button>
        </div>
      )}
    </li>
  )
}

function ChargeRow({ charge, onChange, onDelete }: { charge: Charge; onChange: (p: Partial<Charge>) => void; onDelete: () => void }) {
  const sign = (kind: ChargeKind, cents: number) => (kind === 'discount' ? -Math.abs(cents) : Math.abs(cents))
  return (
    <li className="flex flex-col gap-1 py-2">
      <div className="flex items-center gap-1">
        <select
          value={charge.kind}
          onChange={(e) => {
            const kind = e.target.value as ChargeKind
            onChange({ kind, splitMode: DEFAULT_SPLIT_MODE[kind], amountCents: sign(kind, charge.amountCents) })
          }}
          className="shrink-0 rounded-lg bg-stone-100 px-1.5 py-1.5 text-sm dark:bg-stone-800"
          aria-label="Charge type"
        >
          {CHARGE_KINDS.map((k) => (
            <option key={k.kind} value={k.kind}>
              {k.label}
            </option>
          ))}
        </select>
        <TextField value={charge.label} onCommit={(label) => onChange({ label })} className="flex-1" aria-label="Charge name" />
        <MoneyField value={charge.amountCents} onCommit={(c) => onChange({ amountCents: sign(charge.kind, c ?? 0) })} className="w-24 shrink-0" aria-label={`Amount of ${charge.label}`} />
      </div>
      <div className="flex items-center justify-between pl-1">
        <Segmented
          size="sm"
          value={charge.splitMode}
          options={[
            { value: 'proportional', label: 'By share' },
            { value: 'even', label: 'Evenly' },
          ]}
          onChange={(splitMode) => onChange({ splitMode })}
        />
        <button type="button" onClick={onDelete} className="rounded-full p-1.5 text-stone-400 hover:text-red-600" aria-label={`Remove ${charge.label}`}>
          <Trash2 size={16} />
        </button>
      </div>
    </li>
  )
}
