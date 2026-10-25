import { formatCents } from './money'
import type { ItemShare, PersonSplit, SplitResult } from './split'
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

export interface CategoryGroup {
  /** Empty when the receipt has no item categories at all (no headings needed). */
  name: string
  items: ItemShare[]
  cents: number
}

/** Groups a person's items by item category, in category-list order. */
export function groupByCategory(items: ItemShare[], receipt: Receipt, categories: Map<string, Category>): CategoryGroup[] {
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

function personBlock(p: PersonSplit, receipt: Receipt, name: Names, categories: Map<string, Category>): string {
  const payer = name(receipt.payerId)
  const payerSelf = payer.trim().toLowerCase() === 'me'
  const title =
    p.personId === receipt.payerId
      ? `${name(p.personId)} (paid) ${formatCents(p.totalCents)}`
      : `${name(p.personId)} owes ${payerSelf ? 'me' : payer} ${formatCents(p.totalCents)}`
  const lines = groupByCategory(p.items, receipt, categories).flatMap((g) => [
    ...(g.name ? [g.name] : []),
    ...g.items.map((i) => {
      const frac = shareLabel(i)
      return `• ${i.name}${frac ? ` ${frac}` : ''} ${formatCents(i.cents)}`
    }),
  ])
  const charges = p.charges.filter((c) => c.cents !== 0)
  if (charges.length) lines.push(`• ${charges.map((c) => `${c.label} ${formatCents(c.cents)}`).join(' · ')}`)
  return [title, ...lines].join('\n')
}

/** The whole split as plain text, payer last. */
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
    `${header(receipt)}\nTotal ${formatCents(result.grandTotalCents)} · paid by ${name(receipt.payerId)}`,
    ...people.map((p) => personBlock(p, receipt, name, categories)),
  ].join('\n\n')
}

/** One person's share as plain text. */
export function personText(receipt: Receipt, p: PersonSplit, name: Names, categories: Map<string, Category> = new Map()): string {
  return `${header(receipt)}\n\n${personBlock(p, receipt, name, categories)}`
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
