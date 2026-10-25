import { describe, expect, it } from 'vitest'
import { DEFAULT_CATEGORIES } from './categories'
import { receiptText, shareLabel } from './share'
import { split } from './split'
import type { Receipt } from './types'

describe('shareLabel', () => {
  it('uses unicode fractions where they exist', () => {
    expect(shareLabel({ weight: 1, totalWeight: 1 })).toBe('')
    expect(shareLabel({ weight: 1, totalWeight: 2 })).toBe('½')
    expect(shareLabel({ weight: 2, totalWeight: 3 })).toBe('⅔')
    expect(shareLabel({ weight: 2, totalWeight: 4 })).toBe('½')
    expect(shareLabel({ weight: 2, totalWeight: 5 })).toBe('2/5')
  })
})

describe('receiptText', () => {
  it('lists each person with what they owe the payer, payer last', () => {
    const receipt: Receipt = {
      id: 'r',
      store: 'Star Market',
      date: '2026-10-18',
      status: 'final',
      payerId: 'me',
      participantIds: ['me', 'alex'],
      items: [
        { id: 'a', name: 'Bread', quantity: 1, totalCents: 600, discountCents: 0, shares: { me: 1, alex: 1 } },
        { id: 'b', name: 'Milk', quantity: 1, totalCents: 429, discountCents: 0, shares: { alex: 1 } },
      ],
      charges: [{ id: 'c', kind: 'fee', label: 'Bag Fee', amountCents: 10, splitMode: 'even' }],
      createdAt: 0,
      updatedAt: 0,
    }
    const names: Record<string, string> = { me: 'Christo', alex: 'Alex' }
    expect(receiptText(receipt, split(receipt), (id) => names[id])).toBe(
      [
        'Star Market — Oct 18, 2026',
        'Total $10.39 · paid by Christo',
        '',
        'Alex owes Christo $7.34',
        '• Bread ½ $3.00',
        '• Milk $4.29',
        '• Bag Fee $0.05',
        '',
        'Christo (paid) $3.05',
        '• Bread ½ $3.00',
        '• Bag Fee $0.05',
      ].join('\n'),
    )
  })
})

describe('receiptText with categories', () => {
  it('groups each person\'s items under category headings', () => {
    const receipt: Receipt = {
      id: 'r',
      store: 'Star Market',
      date: '2026-10-18',
      status: 'final',
      payerId: 'me',
      participantIds: ['me', 'alex'],
      items: [
        { id: 'a', name: 'Milk', quantity: 1, totalCents: 400, discountCents: 0, shares: { alex: 1 }, categoryId: 'i:dairy' },
        { id: 'b', name: 'Apples', quantity: 1, totalCents: 300, discountCents: 0, shares: { alex: 1 }, categoryId: 'i:produce' },
        { id: 'c', name: 'Cheese', quantity: 1, totalCents: 500, discountCents: 0, shares: { me: 1 }, categoryId: 'i:dairy' },
      ],
      charges: [],
      createdAt: 0,
      updatedAt: 0,
    }
    const categories = new Map(DEFAULT_CATEGORIES.map((c) => [c.id, c]))
    const names: Record<string, string> = { me: 'Me', alex: 'Alex' }
    expect(receiptText(receipt, split(receipt), (id) => names[id], categories)).toBe(
      [
        'Star Market — Oct 18, 2026',
        'Total $12.00 · paid by Me',
        '',
        'Alex owes me $7.00',
        'Produce',
        '• Apples $3.00',
        'Dairy & eggs',
        '• Milk $4.00',
        '',
        'Me (paid) $5.00',
        'Dairy & eggs',
        '• Cheese $5.00',
      ].join('\n'),
    )
  })
})
