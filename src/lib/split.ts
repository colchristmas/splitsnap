import { allocate } from './money'
import type { Charge, Item, Receipt } from './types'

export interface ItemShare {
  itemId: string
  name: string
  cents: number
  /** This person's weight and the item's total weight, for labels like "½" or "2 of 3". */
  weight: number
  totalWeight: number
}

export interface ChargeShare {
  chargeId: string
  kind: Charge['kind']
  label: string
  cents: number
}

export interface PersonSplit {
  personId: string
  items: ItemShare[]
  itemsCents: number
  charges: ChargeShare[]
  totalCents: number
}

export interface SplitResult {
  people: PersonSplit[]
  /** Items nobody is on yet (or with units left over); their cost isn't in anyone's total. */
  unassignedItemIds: string[]
  /**
   * Every cent of the bill is on someone: all items assigned, and tax/fees had
   * someone to go to (a bill with charges but no items can't be split).
   */
  complete: boolean
  itemsTotalCents: number
  chargesTotalCents: number
  grandTotalCents: number
}

/** What the item really costs: printed price, minus its coupon, plus its deposit. */
export function itemNetCents(item: Pick<Item, 'totalCents' | 'discountCents' | 'depositCents'>): number {
  return item.totalCents - item.discountCents + (item.depositCents ?? 0)
}

type SplitInput = Pick<Receipt, 'participantIds' | 'items' | 'charges'>

/**
 * Works out what each participant owes. Items split by their share weights;
 * proportional charges (tax, tip, discounts) split by each person's item
 * subtotal; even charges (bag fees etc.) split equally among people with at
 * least one item. Every amount is allocated to the penny, so per-person
 * totals add up exactly to the receipt total once all items are assigned.
 */
export function split(receipt: SplitInput): SplitResult {
  const ids = [...new Set(receipt.participantIds)]
  const people: PersonSplit[] = ids.map((personId) => ({
    personId,
    items: [],
    itemsCents: 0,
    charges: [],
    totalCents: 0,
  }))
  const taxableCents = ids.map(() => 0)
  const unassignedItemIds: string[] = []

  for (const item of receipt.items) {
    const weights = ids.map((id) => item.shares[id] ?? 0)
    const totalWeight = weights.reduce((a, b) => a + Math.max(0, b), 0)
    // A unit split only counts once every unit has someone.
    if (totalWeight === 0 || (item.byUnits && totalWeight < item.quantity)) {
      unassignedItemIds.push(item.id)
      continue
    }
    const parts = allocate(itemNetCents(item), weights)
    parts.forEach((cents, i) => {
      if (weights[i] <= 0) return
      people[i].items.push({ itemId: item.id, name: item.name, cents, weight: weights[i], totalWeight })
      people[i].itemsCents += cents
      if (item.taxable) taxableCents[i] += cents
    })
  }

  const hasTaxFlags = receipt.items.some((i) => i.taxable)
  const evenWeights = people.map((p) => (p.items.length > 0 ? 1 : 0))

  for (const charge of receipt.charges) {
    let weights: number[] = evenWeights
    if (charge.splitMode === 'proportional') {
      const base = charge.kind === 'tax' && hasTaxFlags ? taxableCents : people.map((p) => p.itemsCents)
      const clamped = base.map((c) => Math.max(0, c))
      // Nothing to be proportional to (e.g. no taxable items assigned yet): fall back to even.
      if (clamped.some((c) => c > 0)) weights = clamped
    }
    allocate(charge.amountCents, weights).forEach((cents, i) => {
      if (weights[i] <= 0) return
      people[i].charges.push({ chargeId: charge.id, kind: charge.kind, label: charge.label, cents })
    })
  }

  for (const p of people) {
    p.totalCents = p.itemsCents + p.charges.reduce((a, c) => a + c.cents, 0)
  }

  const itemsTotalCents = receipt.items.reduce((a, i) => a + itemNetCents(i), 0)
  const chargesTotalCents = receipt.charges.reduce((a, c) => a + c.amountCents, 0)
  const grandTotalCents = itemsTotalCents + chargesTotalCents
  return {
    people,
    unassignedItemIds,
    complete: unassignedItemIds.length === 0 && people.reduce((a, p) => a + p.totalCents, 0) === grandTotalCents,
    itemsTotalCents,
    chargesTotalCents,
    grandTotalCents,
  }
}
