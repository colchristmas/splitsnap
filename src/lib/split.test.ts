import { describe, expect, it } from 'vitest'
import { allocate, formatCents, parseMoney } from './money'
import { split } from './split'
import type { Charge, Item } from './types'

const item = (id: string, totalCents: number, shares: Record<string, number>, extra: Partial<Item> = {}): Item => ({
  id,
  name: id,
  quantity: 1,
  totalCents,
  discountCents: 0,
  shares,
  ...extra,
})

const charge = (id: string, kind: Charge['kind'], amountCents: number, splitMode: Charge['splitMode']): Charge => ({
  id,
  kind,
  label: id,
  amountCents,
  splitMode,
})

const totals = (r: ReturnType<typeof split>) => Object.fromEntries(r.people.map((p) => [p.personId, p.totalCents]))

describe('allocate', () => {
  it('always adds up to the total', () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33])
    expect(allocate(1, [1, 1, 1])).toEqual([1, 0, 0])
    expect(allocate(1000, [3, 0, 7])).toEqual([300, 0, 700])
    for (let t = 0; t < 500; t += 7) {
      const parts = allocate(t, [5, 3, 11, 2])
      expect(parts.reduce((a, b) => a + b, 0)).toBe(t)
    }
  })

  it('gives leftover pennies to the largest remainders', () => {
    // 10 split 1:2 → 3.33 / 6.67 → the second share has the larger remainder.
    expect(allocate(10, [1, 2])).toEqual([3, 7])
  })

  it('handles negative totals and zero weights', () => {
    expect(allocate(-100, [1, 1, 1])).toEqual([-34, -33, -33])
    expect(allocate(50, [0, 0])).toEqual([0, 0])
  })
})

describe('parseMoney', () => {
  it('reads common receipt formats', () => {
    expect(parseMoney('$1,234.56')).toBe(123456)
    expect(parseMoney('12')).toBe(1200)
    expect(parseMoney('4.5')).toBe(450)
    expect(parseMoney('2.00-')).toBe(-200)
    expect(parseMoney('-2.00')).toBe(-200)
    expect(parseMoney('(2.00)')).toBe(-200)
    expect(parseMoney('3,49')).toBe(349)
    expect(parseMoney('abc')).toBeNull()
    expect(parseMoney('')).toBeNull()
  })

  it('formats cents as dollars', () => {
    expect(formatCents(123456)).toBe('$1,234.56')
    expect(formatCents(-200)).toBe('-$2.00')
  })
})

describe('split', () => {
  it('splits items equally and charges by share', () => {
    const r = split({
      participantIds: ['a', 'b'],
      items: [item('milk', 400, { a: 1 }), item('bread', 600, { a: 1, b: 1 })],
      charges: [charge('tax', 'tax', 100, 'proportional')],
    })
    // a: 400 + 300 = 700 (70%), b: 300 (30%) → tax 70 / 30
    expect(totals(r)).toEqual({ a: 770, b: 330 })
    expect(r.grandTotalCents).toBe(1100)
    expect(r.unassignedItemIds).toEqual([])
  })

  it('splits flat fees evenly among people with items', () => {
    const r = split({
      participantIds: ['a', 'b', 'c'],
      items: [item('x', 1000, { a: 1 }), item('y', 100, { b: 1 })],
      charges: [charge('bag', 'fee', 10, 'even')],
    })
    // c has no items, so pays no bag fee.
    expect(totals(r)).toEqual({ a: 1005, b: 105, c: 0 })
  })

  it('splits by units for quantity items', () => {
    const r = split({
      participantIds: ['a', 'b'],
      items: [item('coffee', 900, { a: 2, b: 1 }, { quantity: 3 })],
      charges: [],
    })
    expect(totals(r)).toEqual({ a: 600, b: 300 })
    expect(r.people[0].items[0]).toMatchObject({ weight: 2, totalWeight: 3 })
  })

  it('treats a unit split with units left over as unassigned', () => {
    const r = split({
      participantIds: ['a', 'b'],
      items: [item('coffee', 900, { a: 2 }, { quantity: 3, byUnits: true })],
      charges: [],
    })
    expect(r.unassignedItemIds).toEqual(['coffee'])
  })

  it('subtracts item discounts before splitting', () => {
    const r = split({
      participantIds: ['a', 'b'],
      items: [item('towels', 1199, { a: 1, b: 1 }, { discountCents: 200 })],
      charges: [],
    })
    expect(totals(r)).toEqual({ a: 500, b: 499 })
  })

  it('applies tax only over taxable items when the receipt marks them', () => {
    const r = split({
      participantIds: ['a', 'b'],
      items: [item('food', 1000, { a: 1 }), item('soap', 400, { b: 1 }, { taxable: true })],
      charges: [charge('tax', 'tax', 25, 'proportional')],
    })
    expect(totals(r)).toEqual({ a: 1000, b: 425 })
  })

  it('splits receipt-level discounts proportionally', () => {
    const r = split({
      participantIds: ['a', 'b'],
      items: [item('x', 3000, { a: 1 }), item('y', 1000, { b: 1 })],
      charges: [charge('promo', 'discount', -400, 'proportional')],
    })
    expect(totals(r)).toEqual({ a: 2700, b: 900 })
  })

  it('reports unassigned items and leaves them out of totals', () => {
    const r = split({
      participantIds: ['a'],
      items: [item('x', 500, { a: 1 }), item('y', 300, {})],
      charges: [],
    })
    expect(r.unassignedItemIds).toEqual(['y'])
    expect(totals(r)).toEqual({ a: 500 })
    expect(r.grandTotalCents).toBe(800)
  })

  it('ignores shares for people who are not participants', () => {
    const r = split({
      participantIds: ['a'],
      items: [item('x', 500, { a: 1, ghost: 1 })],
      charges: [],
    })
    expect(totals(r)).toEqual({ a: 500 })
  })

  it('adds up to the penny on a realistic receipt', () => {
    const r = split({
      participantIds: ['me', 'alex', 'sam'],
      items: [
        item('bananas', 249, { me: 1, alex: 1, sam: 1 }),
        item('milk', 429, { me: 1, sam: 1 }),
        item('bread', 599, { alex: 1 }),
        item('yogurt', 698, { me: 1, alex: 1 }, { quantity: 2 }),
        item('towels', 1199, { me: 1, alex: 1, sam: 1 }, { taxable: true, discountCents: 200 }),
        item('soap', 379, { sam: 1 }, { taxable: true }),
        item('chicken', 912, { me: 1, alex: 1, sam: 1 }),
      ],
      charges: [charge('tax', 'tax', 86, 'proportional'), charge('bag', 'fee', 10, 'even')],
    })
    const sum = r.people.reduce((a, p) => a + p.totalCents, 0)
    expect(sum).toBe(r.grandTotalCents)
    expect(r.grandTotalCents).toBe(4361)
  })
})
