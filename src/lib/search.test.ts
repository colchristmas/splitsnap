import { describe, expect, it } from 'vitest'
import { matchesReceipt, parseSearch, searchItems, type SearchNames } from './search'
import type { Item, Receipt } from './types'

const item = (name: string, totalCents: number, extra: Partial<Item> = {}): Item => ({
  id: name,
  name,
  quantity: 1,
  totalCents,
  discountCents: 0,
  shares: { sam: 1 },
  ...extra,
})

const receipt = (store: string, date: string, items: Item[], extra: Partial<Receipt> = {}): Receipt => ({
  id: `${store} ${date}`,
  store,
  date,
  status: 'final',
  payerId: 'sam',
  participantIds: ['sam'],
  items,
  charges: [],
  createdAt: 0,
  updatedAt: 0,
  ...extra,
})

const names: SearchNames = {
  person: (id) => ({ sam: 'Sam', alex: 'Alex' })[id],
  category: (id) => ({ 'i:dairy': 'Dairy', 'r:groceries': 'Groceries' })[id ?? ''],
}

const costco = receipt(
  'Costco',
  '2026-11-02',
  [
    item('Whole Milk', 399, { categoryId: 'i:dairy' }),
    item('Bananas', 129),
    item('Sparkling Water', 600, { quantity: 3 }),
    item('Coffee Beans', 1299, { discountCents: 300 }),
  ],
  { categoryId: 'r:groceries', participantIds: ['sam', 'alex'] },
)
const corner = receipt('Corner Store', '2026-10-15', [item('Whole Milk 1GAL', 429), item('Bread', 349)])
const draft = receipt('Fresh Market', '2026-11-05', [item('Oat Milk', 499), item('', 0)], { status: 'draft' })
const all = [corner, costco, draft]

const found = (query: string) => searchItems(all, parseSearch(query), names).map((m) => m.item.name)
const bills = (query: string) => all.filter((r) => matchesReceipt(r, parseSearch(query), names)).map((r) => r.store)

describe('parseSearch', () => {
  const price = (query: string) => parseSearch(query).price

  it('keeps plain words, lowercased', () => {
    expect(parseSearch('  Whole   MILK ')).toEqual({ words: ['whole', 'milk'], price: undefined })
    expect(parseSearch('')).toEqual({ words: [], price: undefined })
  })

  it('matches prices that start with an amount', () => {
    expect(price('4.99')).toEqual({ min: 499, max: 499 })
    expect(price('$4.99')).toEqual({ min: 499, max: 499 })
    expect(price('4')).toEqual({ min: 400, max: 499 })
    expect(price('4.')).toEqual({ min: 400, max: 499 })
    expect(price('4.9')).toEqual({ min: 490, max: 499 })
    expect(price('.99')).toEqual({ min: 99, max: 99 })
    expect(price('$1,299.99')).toEqual({ min: 129999, max: 129999 })
  })

  it('reads ranges, either way round', () => {
    for (const q of ['5-10', '$5 - $10', '5 to 10', '5–10', '10-5']) expect(price(q)).toEqual({ min: 500, max: 1000 })
  })

  it('reads under and over', () => {
    for (const q of ['under 5', '<5', 'below 5', 'less than 5']) expect(price(q)).toEqual({ min: 0, max: 499 })
    expect(price('<=5')).toEqual({ min: 0, max: 500 })
    for (const q of ['over 20', '>20', 'above $20', 'more than 20']) expect(price(q)).toEqual({ min: 2001, max: Infinity })
    expect(price('>=20')).toEqual({ min: 2000, max: Infinity })
  })

  it('mixes words and a price', () => {
    expect(parseSearch('milk under 5')).toEqual({ words: ['milk'], price: { min: 0, max: 499 } })
    expect(parseSearch('milk $4')).toEqual({ words: ['milk'], price: { min: 400, max: 499 } })
    expect(parseSearch('costco 5-10 milk')).toEqual({ words: ['costco', 'milk'], price: { min: 500, max: 1000 } })
  })

  it('leaves numbers that belong to words alone', () => {
    expect(parseSearch('milk 4')).toEqual({ words: ['milk', '4'], price: undefined })
    expect(parseSearch('coke 12').price).toBeUndefined()
    expect(parseSearch('2% milk').words).toEqual(['2%', 'milk'])
    for (const q of ['7up', '7-eleven', '16oz', '$']) expect(parseSearch(q)).toEqual({ words: [q], price: undefined })
  })

  it('uses only the first price', () => {
    expect(parseSearch('under 5 over 2')).toEqual({ words: [], price: { min: 0, max: 499 } })
  })
})

describe('searchItems', () => {
  it('finds items by name, newest receipt first', () => {
    expect(found('milk')).toEqual(['Oat Milk', 'Whole Milk', 'Whole Milk 1GAL'])
  })

  it('narrows by store, but a store alone lists no items', () => {
    expect(found('costco milk')).toEqual(['Whole Milk'])
    expect(found('costco')).toEqual([])
  })

  it('finds items by category', () => {
    expect(found('dairy')).toEqual(['Whole Milk'])
  })

  it('finds items by price', () => {
    expect(found('3.99')).toEqual(['Whole Milk'])
    expect(found('$4')).toEqual(['Oat Milk', 'Whole Milk 1GAL'])
    expect(found('under 2')).toEqual(['Bananas']) // not the blank row
    expect(found('milk under 4.50')).toEqual(['Whole Milk', 'Whole Milk 1GAL'])
  })

  it('matches the printed price, the price after coupons, or the price per unit', () => {
    expect(found('12.99')).toEqual(['Coffee Beans'])
    expect(found('9.99')).toEqual(['Coffee Beans'])
    expect(found('2.00')).toEqual(['Sparkling Water'])
    const [water] = searchItems(all, parseSearch('sparkling'), names)
    expect(water).toMatchObject({ cents: 600, unitCents: 200 })
  })

  it('returns nothing for an empty search', () => {
    expect(found('  ')).toEqual([])
  })
})

describe('matchesReceipt', () => {
  it('needs every word somewhere on the bill', () => {
    expect(bills('costco milk')).toEqual(['Costco'])
    expect(bills('milk')).toEqual(['Corner Store', 'Costco', 'Fresh Market'])
    expect(bills('alex')).toEqual(['Costco'])
    expect(bills('groceries')).toEqual(['Costco'])
    expect(bills('dairy')).toEqual(['Costco'])
  })

  it('compares a price with the bill total', () => {
    // Costco: 3.99 + 1.29 + 6.00 + 9.99 = 21.27
    expect(bills('21.27')).toEqual(['Costco'])
    expect(bills('over 20')).toEqual(['Costco'])
    expect(bills('7.78')).toEqual(['Corner Store'])
    expect(bills('milk under 5')).toEqual(['Fresh Market'])
  })
})
