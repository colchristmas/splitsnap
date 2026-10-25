import { split } from './split'
import type { Receipt } from './types'

/** Item-category row for everything that isn't an item: tax, tip, fees, receipt-wide discounts. */
export const CHARGES_ROW = 'charges'

export interface SpendingRow {
  /** A category id, CHARGES_ROW, or null for uncategorized. */
  id: string | null
  cents: number
}

export interface Spending {
  totalCents: number
  receiptCount: number
  byReceiptCategory: SpendingRow[]
  byItemCategory: SpendingRow[]
}

export type Period = { kind: 'month'; year: number; month: number } | { kind: 'year'; year: number } | { kind: 'all' }

export function inPeriod(date: string, period: Period): boolean {
  if (period.kind === 'all') return true
  const [y, m] = date.split('-').map(Number)
  return y === period.year && (period.kind === 'year' || m === period.month)
}

function rows(totals: Map<string | null, number>): SpendingRow[] {
  return [...totals]
    .filter(([, cents]) => cents !== 0)
    .map(([id, cents]) => ({ id, cents }))
    .sort((a, b) => b.cents - a.cents)
}

/**
 * Totals per receipt category and per item category. With `personId`, counts
 * only that person's share of each receipt (their items and their part of
 * tax, tip and fees); otherwise counts whole receipts.
 */
export function spending(receipts: Receipt[], personId?: string): Spending {
  const byReceipt = new Map<string | null, number>()
  const byItem = new Map<string | null, number>()
  const add = (m: Map<string | null, number>, id: string | null, cents: number) => m.set(id, (m.get(id) ?? 0) + cents)
  let totalCents = 0
  let receiptCount = 0

  for (const receipt of receipts) {
    const result = split(receipt)
    const itemCategory = new Map(receipt.items.map((i) => [i.id, i.categoryId ?? null]))
    const receiptCategory = receipt.categoryId ?? null

    if (personId) {
      const mine = result.people.find((p) => p.personId === personId)
      if (!mine || (mine.items.length === 0 && mine.totalCents === 0)) continue
      totalCents += mine.totalCents
      add(byReceipt, receiptCategory, mine.totalCents)
      for (const share of mine.items) add(byItem, itemCategory.get(share.itemId) ?? null, share.cents)
      add(byItem, CHARGES_ROW, mine.charges.reduce((a, c) => a + c.cents, 0))
    } else {
      totalCents += result.grandTotalCents
      add(byReceipt, receiptCategory, result.grandTotalCents)
      for (const item of receipt.items) add(byItem, item.categoryId ?? null, item.totalCents - item.discountCents)
      add(byItem, CHARGES_ROW, result.chargesTotalCents)
    }
    receiptCount++
  }

  return { totalCents, receiptCount, byReceiptCategory: rows(byReceipt), byItemCategory: rows(byItem) }
}
