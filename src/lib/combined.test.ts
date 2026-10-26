import { describe, expect, it } from 'vitest'
import { balances, combine } from './balances'
import { combineShares } from './share'
import { itemNetCents, split } from './split'
import type { Charge, Item, Receipt } from './types'

// Deterministic random numbers, so a failure can be reproduced.
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const PEOPLE = ['me', 'alex', 'sam', 'paul']

/** A random but fully assigned bill: random people, payer, items, coupons, deposits, tax/tip/fees. */
function randomBill(rand: () => number, n: number): Receipt {
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1))
  const pick = <T,>(xs: T[]) => xs[int(0, xs.length - 1)]
  const participantIds = PEOPLE.filter(() => rand() < 0.7)
  if (participantIds.length === 0) participantIds.push(pick(PEOPLE))
  const items: Item[] = Array.from({ length: int(1, 8) }, (_, i) => {
    const quantity = rand() < 0.2 ? int(2, 4) : 1
    const byUnits = quantity > 1 && rand() < 0.5
    const totalCents = int(1, 5000)
    let shares: Record<string, number>
    if (byUnits) {
      shares = {}
      for (let u = 0; u < quantity; u++) {
        const p = pick(participantIds)
        shares[p] = (shares[p] ?? 0) + 1
      }
    } else {
      const who = participantIds.filter(() => rand() < 0.6)
      shares = Object.fromEntries((who.length ? who : [pick(participantIds)]).map((p) => [p, 1]))
    }
    return {
      id: `${n}-i${i}`,
      name: `Item ${i}`,
      quantity,
      byUnits,
      totalCents,
      discountCents: rand() < 0.2 ? int(0, Math.floor(totalCents / 2)) : 0,
      depositCents: rand() < 0.15 ? 5 : undefined,
      taxable: rand() < 0.3 ? true : undefined,
      shares,
    }
  })
  const charges: Charge[] = []
  const charge = (kind: Charge['kind'], label: string, amountCents: number, splitMode: Charge['splitMode']) =>
    charges.push({ id: `${n}-${label}`, kind, label, amountCents, splitMode })
  if (rand() < 0.8) charge('tax', 'Tax', int(0, 900), rand() < 0.8 ? 'proportional' : 'even')
  if (rand() < 0.3) charge('tip', 'Tip', int(100, 3000), 'proportional')
  if (rand() < 0.5) charge('fee', 'Bag fee', int(1, 30), rand() < 0.8 ? 'even' : 'proportional')
  if (rand() < 0.15) charge('discount', 'Promo', -int(1, 500), 'proportional')
  return {
    id: `bill-${n}`,
    store: `Store ${n}`,
    date: `2026-10-${String(int(1, 28)).padStart(2, '0')}`,
    status: 'final',
    payerId: pick(participantIds),
    participantIds,
    items,
    charges,
    settledWith: PEOPLE.filter(() => rand() < 0.15),
    createdAt: n,
    updatedAt: n,
  }
}

/**
 * Checks one bill's charges independently of the split engine: each person's
 * part of every tax, tip, fee and discount must be within 1¢ of the exact
 * fraction (rounding to whole cents can move it by less than a cent).
 */
function checkCharges(bill: Receipt) {
  const r = split(bill)
  const taxable = new Set(bill.items.filter((i) => i.taxable).map((i) => i.id))
  const withItems = r.people.filter((p) => p.items.length > 0)
  for (const charge of bill.charges) {
    const base = (p: (typeof r.people)[number]) =>
      Math.max(0, charge.kind === 'tax' && taxable.size > 0 ? p.items.filter((s) => taxable.has(s.itemId)).reduce((a, s) => a + s.cents, 0) : p.itemsCents)
    const totalBase = withItems.reduce((a, p) => a + base(p), 0)
    // Proportional falls back to an even split when there's nothing to be proportional to.
    const proportional = charge.splitMode === 'proportional' && totalBase > 0
    for (const p of withItems) {
      const exact = proportional ? (charge.amountCents * base(p)) / totalBase : charge.amountCents / withItems.length
      const actual = p.charges.find((c) => c.chargeId === charge.id)?.cents ?? 0
      expect(Math.abs(actual - exact)).toBeLessThan(1)
    }
    // And the pieces add up to exactly the charge.
    expect(r.people.reduce((a, p) => a + (p.charges.find((c) => c.chargeId === charge.id)?.cents ?? 0), 0)).toBe(charge.amountCents)
  }
}

/** Every total in a set of bills: per bill, per item, per charge, combined, and balances with me. */
function checkBills(bills: Receipt[]) {
  const results = bills.map((b) => split(b))
  const countable = bills.filter((_, i) => results[i].complete)

  for (const [i, r] of results.entries()) {
    if (!r.complete) continue
    // Each bill: shares add up to the bill, and every item's pieces to what it costs.
    expect(r.people.reduce((a, p) => a + p.totalCents, 0)).toBe(r.grandTotalCents)
    for (const item of bills[i].items) {
      const pieces = r.people.flatMap((p) => p.items).filter((s) => s.itemId === item.id)
      expect(pieces.reduce((a, s) => a + s.cents, 0)).toBe(itemNetCents(item))
    }
    checkCharges(bills[i])
  }

  // The combined list: Total is the sum of the countable bills, and people add up to it.
  const combined = combineShares(bills)
  const billsTotal = results.filter((r) => r.complete).reduce((a, r) => a + r.grandTotalCents, 0)
  expect(combined.skipped.length).toBe(bills.length - countable.length)
  expect(combined.totalCents).toBe(billsTotal)
  expect([...combined.people.values()].reduce((a, p) => a + p.cents, 0)).toBe(billsTotal)
  for (const [id, p] of combined.people) {
    const fromBills = results.reduce((a, r) => a + (r.complete ? (r.people.find((x) => x.personId === id)?.totalCents ?? 0) : 0), 0)
    expect(p.cents).toBe(fromBills)
    const lines = p.items.reduce((a, s) => a + s.cents, 0) + [...p.charges.values()].reduce((a, c) => a + c, 0)
    expect(lines).toBe(p.cents)
  }

  // Balances with me, worked out independently from each countable bill.
  const expected = new Map<string, number>()
  for (const [i, b] of bills.entries()) {
    if (!results[i].complete) continue
    const share = (id: string) => results[i].people.find((p) => p.personId === id)?.totalCents ?? 0
    const settled = new Set(b.settledWith)
    if (b.payerId === 'me') {
      for (const p of results[i].people) {
        if (p.personId !== 'me' && !settled.has(p.personId)) expected.set(p.personId, (expected.get(p.personId) ?? 0) + p.totalCents)
      }
    } else if (b.participantIds.includes('me') && !settled.has(b.payerId)) {
      expected.set(b.payerId, (expected.get(b.payerId) ?? 0) - share('me'))
    }
  }
  const fromCombine = new Map(combine(bills, 'me').map((p) => [p.personId, p.totalCents]))
  const fromBalances = new Map([...balances(bills, 'me')].map(([id, b]) => [id, b.openCents]))
  for (const id of PEOPLE.filter((p) => p !== 'me')) {
    expect(fromCombine.get(id) ?? 0).toBe(expected.get(id) ?? 0)
    expect(fromBalances.get(id) ?? 0).toBe(expected.get(id) ?? 0)
  }
  return combined
}

describe('combining bills adds up to the penny (2,000 random sets of bills)', () => {
  it('holds for every random set, including tax, tip, fees and discounts per person', () => {
    const rand = rng(20261026)
    for (let trial = 0; trial < 2000; trial++) {
      const bills = Array.from({ length: 1 + Math.floor(rand() * 5) }, (_, i) => randomBill(rand, trial * 10 + i))
      for (const r of bills.map((b) => split(b))) expect(r.complete).toBe(true)
      checkBills(bills)
    }
  })

  it('stays correct after deleting items, down to the last one', () => {
    const rand = rng(31337)
    let emptied = 0
    for (let trial = 0; trial < 2000; trial++) {
      let bills = Array.from({ length: 1 + Math.floor(rand() * 4) }, (_, i) => randomBill(rand, trial * 10 + i))
      // Delete a few random items one at a time, rechecking everything after each.
      for (let step = 0; step < 3; step++) {
        const before = checkBills(bills)
        const b = Math.floor(rand() * bills.length)
        if (bills[b].items.length === 0) continue
        const victim = bills[b].items[Math.floor(rand() * bills[b].items.length)]
        const wasComplete = split(bills[b]).complete
        const edited = { ...bills[b], items: bills[b].items.filter((i) => i !== victim) }
        bills = bills.map((x, i) => (i === b ? edited : x))
        const after = checkBills(bills)
        const result = split(edited)
        // The printed tax, tip and fees stay as they were on the receipt.
        expect(result.chargesTotalCents).toBe(edited.charges.reduce((a, c) => a + c.amountCents, 0))
        if (result.complete && wasComplete) {
          // The bill, and the combined total, drop by exactly what the item cost.
          expect(before.totalCents - after.totalCents).toBe(itemNetCents(victim))
        } else if (!result.complete) {
          // Only possible once the last item is gone but tax/fees remain: the bill is left out, not miscounted.
          expect(edited.items).toHaveLength(0)
          expect(after.skipped.map((x) => x.id)).toContain(edited.id)
          emptied++
        }
      }
    }
    expect(emptied).toBeGreaterThan(0) // the "last item deleted" case really was exercised
  })

  it('leaves out a bill with an unassigned item instead of miscounting it', () => {
    const rand = rng(7)
    const ok = randomBill(rand, 1)
    const broken = randomBill(rand, 2)
    broken.items[0].shares = {}
    broken.items[0].byUnits = false
    const combined = combineShares([ok, broken])
    expect(combined.skipped.map((b) => b.id)).toEqual([broken.id])
    expect(combined.totalCents).toBe(split(ok).grandTotalCents)
    expect([...combined.people.values()].reduce((a, p) => a + p.cents, 0)).toBe(combined.totalCents)
  })
})
