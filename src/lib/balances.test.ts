import { describe, expect, it } from 'vitest'
import { balances, billShares, combine, combinedText, dateRange, owesLine } from './balances'
import type { Receipt } from './types'

const bill = (id: string, payerId: string, date: string, shares: Record<string, number>, extra: Partial<Receipt> = {}): Receipt => ({
  id,
  store: id,
  date,
  status: 'final',
  payerId,
  participantIds: Object.keys(shares),
  // One item per person at the given price, so each share is easy to read.
  items: Object.entries(shares).map(([person, cents]) => ({
    id: `${id}-${person}`,
    name: person,
    quantity: 1,
    totalCents: cents,
    discountCents: 0,
    shares: { [person]: 1 },
  })),
  charges: [],
  createdAt: 0,
  updatedAt: 0,
  ...extra,
})

describe('billShares', () => {
  it('when I paid, everyone else owes me their share', () => {
    expect(billShares(bill('a', 'me', '2026-10-17', { me: 500, seb: 1454, paul: 1451 }), 'me')).toEqual([
      { receiptId: 'a', personId: 'seb', cents: 1454, settled: false },
      { receiptId: 'a', personId: 'paul', cents: 1451, settled: false },
    ])
  })

  it('when someone else paid, I owe them mine (and nothing else is tracked)', () => {
    expect(billShares(bill('b', 'paul', '2026-10-20', { me: 810, seb: 300, paul: 400 }), 'me')).toEqual([
      { receiptId: 'b', personId: 'paul', cents: -810, settled: false },
    ])
  })

  it('ignores drafts and bills with unassigned items', () => {
    expect(billShares(bill('c', 'me', '2026-10-20', { me: 1, seb: 2 }, { status: 'draft' }), 'me')).toEqual([])
    const unassigned = bill('d', 'me', '2026-10-20', { seb: 200 })
    unassigned.items[0].shares = {}
    expect(billShares(unassigned, 'me')).toEqual([])
  })
})

describe('balances', () => {
  const receipts = [
    bill('a', 'me', '2026-10-17', { me: 500, seb: 1454, paul: 1451 }),
    bill('b', 'paul', '2026-10-20', { me: 810, paul: 400 }),
    bill('c', 'me', '2026-10-24', { me: 200, seb: 1460 }, { settledWith: ['seb'] }),
  ]

  it('nets bills per person and leaves out settled shares', () => {
    const b = balances(receipts, 'me')
    expect(b.get('seb')).toMatchObject({ openCents: 1454, openBills: 1 })
    expect(b.get('seb')!.shares).toHaveLength(2) // the settled one is still in the history
    expect(b.get('paul')).toMatchObject({ openCents: 1451 - 810, openBills: 2 })
  })
})

describe('combine', () => {
  const receipts = [
    bill('Star Market', 'me', '2026-10-17', { me: 500, seb: 1454, paul: 1451 }),
    bill('Bake Shop', 'me', '2026-10-20', { me: 300, seb: 1206 }),
    bill('CVS', 'paul', '2026-10-24', { me: 2000, paul: 100 }),
  ]

  it('gives one total per person across the bills', () => {
    expect(combine(receipts, 'me').map((p) => [p.personId, p.totalCents, p.shares.length])).toEqual([
      ['seb', 2660, 2],
      ['paul', 1451 - 2000, 2],
    ])
  })

  it('writes a shareable summary', () => {
    const names: Record<string, string> = { me: 'Me', seb: 'Sebastian', paul: 'Paul' }
    expect(combinedText(receipts, combine(receipts, 'me'), (id) => names[id], 'me')).toBe(
      [
        'Combined: 3 bills · Oct 17–24',
        '',
        'Sebastian owes me $26.60',
        '• Star Market, Oct 17: $14.54',
        '• Bake Shop, Oct 20: $12.06',
        '',
        'I owe Paul $5.49',
        '• Star Market, Oct 17: -$14.51',
        '• CVS, Oct 24: $20.00',
      ].join('\n'),
    )
  })
})

describe('owesLine', () => {
  it('uses first person until I set my name', () => {
    expect(owesLine(4120, 'Sebastian', 'Me')).toBe('Sebastian owes me $41.20')
    expect(owesLine(-810, 'Paul', 'Me')).toBe('I owe Paul $8.10')
    expect(owesLine(-810, 'Paul', 'Christo')).toBe('Christo owes Paul $8.10')
  })
})

describe('dateRange', () => {
  it('reads naturally', () => {
    expect(dateRange(['2026-10-24', '2026-10-17'])).toBe('Oct 17–24')
    expect(dateRange(['2026-09-28', '2026-10-24'])).toBe('Sep 28 – Oct 24')
    expect(dateRange(['2026-10-17'])).toBe('Oct 17, 2026')
    expect(dateRange(['2025-12-30', '2026-01-02'])).toBe('Dec 30, 2025 – Jan 2, 2026')
  })
})
