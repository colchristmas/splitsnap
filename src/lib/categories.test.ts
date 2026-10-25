import { describe, expect, it } from 'vitest'
import { categorize, categoryKey, emptyMemory, guessItemCategory, guessReceiptCategory } from './categories'
import { spending } from './spending'
import type { Charge, Item, Receipt } from './types'

const items = (...names: string[]) => names.map((name) => ({ name }))
const tip: Pick<Charge, 'kind' | 'label'> = { kind: 'tip', label: 'Tip' }
const delivery: Pick<Charge, 'kind' | 'label'> = { kind: 'fee', label: 'Delivery fee' }

describe('categoryKey', () => {
  it('drops sizes, digits and punctuation', () => {
    expect(categoryKey('Whole Milk 1GAL')).toBe('whole milk')
    expect(categoryKey('Cage-Free Eggs 12ct')).toBe('cage free eggs')
    expect(categoryKey('Jalapeño Chips')).toBe('jalapeno chips')
  })
})

describe('guessItemCategory', () => {
  const guess = (name: string, receipt?: string) => guessItemCategory(name, receipt, emptyMemory())

  it('matches grocery keywords, most specific first', () => {
    expect(guess('Organic Bananas')).toBe('i:produce')
    expect(guess('Chicken Thighs')).toBe('i:meat')
    expect(guess('Greek Yogurt')).toBe('i:dairy')
    expect(guess('Sourdough Bread')).toBe('i:bakery')
    expect(guess('Coffee Beans')).toBe('i:pantry') // not Drinks
    expect(guess('Dish Soap')).toBe('i:household') // not Personal care
    expect(guess('Paper Towels 6pk')).toBe('i:household')
    expect(guess('Frozen Dumplings')).toBe('i:frozen')
    expect(guess('Ginger Ale')).toBe('i:drinks') // not Alcohol
    expect(guess('Pinot Noir')).toBe('i:alcohol')
    expect(guess('Mystery Thing')).toBe('i:other')
  })

  it('treats restaurant food as meals, except drinks and desserts', () => {
    expect(guess('Caesar Salad', 'r:dining')).toBe('i:meals')
    expect(guess('Margherita Pizza', 'r:dining')).toBe('i:meals')
    expect(guess('Iced Tea', 'r:dining')).toBe('i:drinks')
    expect(guess('Tiramisu', 'r:dining')).toBe('i:snacks')
    expect(guess('House Margarita', 'r:dining')).toBe('i:alcohol')
  })

  it('prefers what the user chose before', () => {
    const memory = emptyMemory()
    memory.item.set('whole milk', 'i:drinks')
    expect(guessItemCategory('WHOLE MILK 1GAL', undefined, memory)).toBe('i:drinks')
  })
})

describe('guessReceiptCategory', () => {
  const guess = (store: string, itemCategoryIds: string[] = [], charges: Pick<Charge, 'kind' | 'label'>[] = []) =>
    guessReceiptCategory({ store, itemCategoryIds, charges }, emptyMemory())

  it('uses the store name first', () => {
    expect(guess('Star Market')).toBe('r:groceries')
    expect(guess('CVS Pharmacy')).toBe('r:household')
    expect(guess('Blue Bottle Coffee')).toBe('r:coffee')
    expect(guess('The Blue Plate')).toBe('r:dining')
  })

  it('falls back to what was bought and how it was paid', () => {
    expect(guess('Unknown', ['i:produce', 'i:dairy', 'i:meals'])).toBe('r:groceries')
    expect(guess('Unknown', ['i:meals', 'i:drinks'], [tip])).toBe('r:dining')
    expect(guess('Unknown', ['i:meals', 'i:meals'], [tip, delivery])).toBe('r:takeout')
    // A grocery delivery has a tip and a delivery fee but is still groceries.
    expect(guess('FreshCart Order', ['i:produce', 'i:dairy', 'i:pantry'], [tip, delivery])).toBe('r:groceries')
    expect(guess('Unknown')).toBe('r:other')
  })

  it('remembers the store', () => {
    const memory = emptyMemory()
    memory.receipt.set('corner shop', 'r:coffee')
    expect(guessReceiptCategory({ store: 'Corner Shop #12', itemCategoryIds: [], charges: [] }, memory)).toBe('r:coffee')
  })
})

describe('categorize', () => {
  it('re-guesses items once the receipt is known to be a restaurant', () => {
    const r = categorize({ store: 'Lucky Noodle', charges: [tip as Charge], items: items('Caesar Salad', 'Iced Tea') }, emptyMemory())
    expect(r).toEqual({ categoryId: 'r:dining', itemCategoryIds: ['i:meals', 'i:drinks'] })
  })

  it('keeps categories the user picked', () => {
    const r = categorize(
      {
        store: 'Star Market',
        charges: [],
        categoryId: 'r:household',
        categoryManual: true,
        items: [{ name: 'Bananas', categoryId: 'i:snacks', categoryManual: true }, { name: 'Milk' }],
      },
      emptyMemory(),
    )
    expect(r).toEqual({ categoryId: 'r:household', itemCategoryIds: ['i:snacks', 'i:dairy'] })
  })
})

describe('spending', () => {
  const item = (id: string, cents: number, categoryId: string, shares: Record<string, number>): Item => ({
    id,
    name: id,
    quantity: 1,
    totalCents: cents,
    discountCents: 0,
    shares,
    categoryId,
  })
  const receipt = (id: string, categoryId: string, its: Item[], charges: Charge[] = []): Receipt => ({
    id,
    store: id,
    date: '2026-10-01',
    status: 'final',
    payerId: 'me',
    participantIds: ['me', 'alex'],
    items: its,
    charges,
    categoryId,
    createdAt: 0,
    updatedAt: 0,
  })
  const receipts = [
    receipt('a', 'r:groceries', [item('milk', 400, 'i:dairy', { me: 1 }), item('bread', 600, 'i:bakery', { me: 1, alex: 1 })], [
      { id: 'tax', kind: 'tax', label: 'Tax', amountCents: 100, splitMode: 'proportional' },
    ]),
    receipt('b', 'r:dining', [item('pizza', 2000, 'i:meals', { alex: 1 })]),
  ]

  it('totals whole receipts by receipt and item category', () => {
    expect(spending(receipts)).toEqual({
      totalCents: 3100,
      receiptCount: 2,
      byReceiptCategory: [
        { id: 'r:dining', cents: 2000 },
        { id: 'r:groceries', cents: 1100 },
      ],
      byItemCategory: [
        { id: 'i:meals', cents: 2000 },
        { id: 'i:bakery', cents: 600 },
        { id: 'i:dairy', cents: 400 },
        { id: 'charges', cents: 100 },
      ],
    })
  })

  it("counts only one person's share", () => {
    // me: milk 400 + half bread 300 = 700 → 70% of tax = 70
    expect(spending(receipts, 'me')).toEqual({
      totalCents: 770,
      receiptCount: 1,
      byReceiptCategory: [{ id: 'r:groceries', cents: 770 }],
      byItemCategory: [
        { id: 'i:dairy', cents: 400 },
        { id: 'i:bakery', cents: 300 },
        { id: 'charges', cents: 70 },
      ],
    })
  })
})
