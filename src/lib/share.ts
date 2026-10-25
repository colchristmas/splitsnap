import { formatCents } from './money'
import { split, type ItemShare, type PersonSplit, type SplitResult } from './split'
import { byCategoryOrder } from './categories'
import type { Category, Receipt } from './types'

const FRACTIONS: Record<string, string> = { '1/2': '½', '1/3': '⅓', '2/3': '⅔', '1/4': '¼', '3/4': '¾' }

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

/** "" for a whole item, otherwise "½", "⅔", "2/5"… */
export function shareLabel(s: Pick<ItemShare, 'weight' | 'totalWeight'>): string {
  if (s.weight >= s.totalWeight) return ''
  const g = gcd(s.weight, s.totalWeight)
  const key = `${s.weight / g}/${s.totalWeight / g}`
  return FRACTIONS[key] ?? key
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

type Names = (id: string) => string

/** "Oct 17–24", "Sep 28 – Oct 24", "Oct 17, 2026"… */
export function dateRange(dates: string[]): string {
  const sorted = [...dates].sort()
  if (sorted.length === 0) return ''
  const [first, last] = [sorted[0], sorted.at(-1)!]
  if (first === last) return formatDate(first)
  const [y1, m1] = first.split('-')
  const [y2, m2] = last.split('-')
  const short = (iso: string) => formatDate(iso).replace(/, \d{4}$/, '')
  if (y1 === y2 && m1 === m2) return `${short(first)}–${Number(last.split('-')[2])}`
  return y1 === y2 ? `${short(first)} – ${short(last)}` : `${formatDate(first)} – ${formatDate(last)}`
}

export interface CategoryGroup {
  /** Empty when the receipt has no item categories at all (no headings needed). */
  name: string
  items: ItemShare[]
  cents: number
}

/** Groups a person's items by item category, in category-list order. */
export function groupByCategory(
  items: ItemShare[],
  receipt: Pick<Receipt, 'items'>,
  categories: Map<string, Category>,
): CategoryGroup[] {
  const categoryOf = new Map(receipt.items.map((i) => [i.id, i.categoryId]))
  if (!receipt.items.some((i) => i.categoryId && categories.has(i.categoryId))) {
    return items.length ? [{ name: '', items, cents: items.reduce((a, i) => a + i.cents, 0) }] : []
  }
  const groups = new Map<string | undefined, ItemShare[]>()
  for (const share of items) {
    const id = categoryOf.get(share.itemId)
    const key = id && categories.has(id) ? id : undefined
    groups.set(key, [...(groups.get(key) ?? []), share])
  }
  return [...groups.keys()].sort(byCategoryOrder(categories)).map((id) => {
    const shares = groups.get(id)!
    return { name: id ? categories.get(id)!.name : 'Uncategorized', items: shares, cents: shares.reduce((a, i) => a + i.cents, 0) }
  })
}

function header(receipt: Receipt): string {
  return [receipt.store || 'Receipt', formatDate(receipt.date)].filter(Boolean).join(' — ')
}

/**
 * One person's lines. "neutral" just states their share ("Paul: $3.69");
 * "owes" phrases it as a request ("Paul owes me $3.69").
 */
function personBlock(
  p: PersonSplit,
  receipt: Receipt,
  name: Names,
  categories: Map<string, Category>,
  wording: 'neutral' | 'owes',
): string {
  const payer = name(receipt.payerId)
  const payerSelf = payer.trim().toLowerCase() === 'me'
  const title =
    wording === 'neutral'
      ? `${name(p.personId)}: ${formatCents(p.totalCents)}`
      : p.personId === receipt.payerId
        ? `${name(p.personId)} (paid) ${formatCents(p.totalCents)}`
        : `${name(p.personId)} owes ${payerSelf ? 'me' : payer} ${formatCents(p.totalCents)}`
  const charges = p.charges.filter((c) => c.cents !== 0).map((c): [string, number] => [c.label, c.cents])
  return [title, ...itemLines(p.items, receipt, categories, charges)].join('\n')
}

/** Item lines under category headings, then one line of fees and tax. */
function itemLines(
  items: ItemShare[],
  receipt: Pick<Receipt, 'items'>,
  categories: Map<string, Category>,
  charges: [label: string, cents: number][],
): string[] {
  const lines = groupByCategory(items, receipt, categories).flatMap((g) => [
    ...(g.name ? [g.name] : []),
    ...g.items.map((i) => {
      const frac = shareLabel(i)
      return `• ${i.name}${frac ? ` ${frac}` : ''} ${formatCents(i.cents)}`
    }),
  ])
  if (charges.length) lines.push(`• ${charges.map(([label, cents]) => `${label} ${formatCents(cents)}`).join(' · ')}`)
  return lines
}

/** The whole split as plain text: each person's share, stated neutrally. */
export function receiptText(
  receipt: Receipt,
  result: SplitResult,
  name: Names,
  categories: Map<string, Category> = new Map(),
): string {
  const people = [...result.people]
    .filter((p) => p.totalCents !== 0 || p.items.length > 0)
    .sort((a, b) => Number(a.personId === receipt.payerId) - Number(b.personId === receipt.payerId))
  return [
    `${header(receipt)}\nTotal ${formatCents(result.grandTotalCents)}`,
    ...people.map((p) => personBlock(p, receipt, name, categories, 'neutral')),
  ].join('\n\n')
}

/**
 * Several bills as one itemized list per person: everyone's items from all the
 * bills under shared category headings, with fees and tax added up by name.
 * Neutral wording like receiptText; `selfId` goes last.
 */
export function combinedReceiptsText(
  receipts: Receipt[],
  name: Names,
  categories: Map<string, Category> = new Map(),
  selfId?: string,
): string {
  type Person = { items: ItemShare[]; charges: Map<string, number>; cents: number }
  const people = new Map<string, Person>()
  let total = 0
  // Oldest bill first, so people appear in a predictable order.
  for (const r of [...receipts].sort((a, b) => a.date.localeCompare(b.date))) {
    const result = split(r)
    total += result.grandTotalCents
    for (const p of result.people) {
      if (p.items.length === 0 && p.totalCents === 0) continue
      const acc: Person = people.get(p.personId) ?? { items: [], charges: new Map(), cents: 0 }
      acc.items.push(...p.items)
      for (const c of p.charges) acc.charges.set(c.label, (acc.charges.get(c.label) ?? 0) + c.cents)
      acc.cents += p.totalCents
      people.set(p.personId, acc)
    }
  }
  // Item ids are unique across bills, so one merged list maps every item to its category.
  const allItems = { items: receipts.flatMap((r) => r.items) }
  const order = [...people.keys()].sort((a, b) => Number(a === selfId) - Number(b === selfId))
  const header = `Combined: ${receipts.length} ${receipts.length === 1 ? 'bill' : 'bills'} · ${dateRange(receipts.map((r) => r.date))}`
  return [
    `${header}\nTotal ${formatCents(total)}`,
    ...order.map((id) => {
      const p = people.get(id)!
      const charges = [...p.charges].filter(([, cents]) => cents !== 0)
      return [`${name(id)}: ${formatCents(p.cents)}`, ...itemLines(p.items, allItems, categories, charges)].join('\n')
    }),
  ].join('\n\n')
}

/** One person's share as plain text, phrased as what they owe the payer. */
export function personText(receipt: Receipt, p: PersonSplit, name: Names, categories: Map<string, Category> = new Map()): string {
  return `${header(receipt)}\n\n${personBlock(p, receipt, name, categories, 'owes')}`
}

/** Opens the share sheet when available, otherwise copies to the clipboard. */
export async function shareText(text: string): Promise<'shared' | 'copied' | 'cancelled'> {
  if (navigator.share) {
    try {
      await navigator.share({ text })
      return 'shared'
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'
    }
  }
  await navigator.clipboard.writeText(text)
  return 'copied'
}
