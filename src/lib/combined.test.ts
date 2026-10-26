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

describe('combining bills adds up to the penny (2,000 random sets of bills)', () => {
  it('holds for every random set', () => {
    const rand = rng(20261026)
    for (let trial = 0; trial < 2000; trial++) {
      const bills = Array.from({ length: 1 + Math.floor(rand() * 5) }, (_, i) => randomBill(rand, trial * 10 + i))
      const results = bills.map((b) => split(b))

      // 1. Each bill on its own: every item fully assigned, shares add up to the bill.
      for (const [i, r] of results.entries()) {
        expect(r.unassignedItemIds).toEqual([])
        expect(r.people.reduce((a, p) => a + p.totalCents, 0)).toBe(r.grandTotalCents)
        // Every item's pieces add up to what the item costs.
        for (const item of bills[i].items) {
          const pieces = r.people.flatMap((p) => p.items).filter((s) => s.itemId === item.id)
          expect(pieces.reduce((a, s) => a + s.cents, 0)).toBe(itemNetCents(item))
        }
      }

      // 2. The combined list: Total is the sum of the bills, and people add up to it.
      const combined = combineShares(bills)
      const billsTotal = results.reduce((a, r) => a + r.grandTotalCents, 0)
      expect(combined.totalCents).toBe(billsTotal)
      expect([...combined.people.values()].reduce((a, p) => a + p.cents, 0)).toBe(billsTotal)
      for (const [id, p] of combined.people) {
        // A person's combined total is exactly their shares from each bill…
        const fromBills = results.reduce((a, r) => a + (r.people.find((x) => x.personId === id)?.totalCents ?? 0), 0)
        expect(p.cents).toBe(fromBills)
        // …and exactly what their listed lines add up to.
        const lines = p.items.reduce((a, s) => a + s.cents, 0) + [...p.charges.values()].reduce((a, c) => a + c, 0)
        expect(lines).toBe(p.cents)
      }

      // 3. Balances with me, worked out independently from each bill.
      const expected = new Map<string, number>()
      for (const [i, b] of bills.entries()) {
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
    }
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
