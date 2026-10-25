import { describe, expect, it } from 'vitest'
import grocery from './fixtures/grocery.json'
import restaurant from './fixtures/restaurant.json'
import screenshot from './fixtures/screenshot.json'
import { categorize, emptyMemory } from '../categories'
import { parseReceipt, type OcrLine } from './parse'

/** Builds OCR lines from rows of [left text, right text], laid out like a printed receipt. */
function receipt(rows: [string, string?][]): OcrLine[] {
  return rows.flatMap(([left, right], i) => {
    const y = 100 + i * 40
    const box = (text: string, x: number): OcrLine => ({
      text,
      score: 1,
      poly: [[x, y], [x + text.length * 15, y], [x + text.length * 15, y + 30], [x, y + 30]],
    })
    return [left ? box(left, 40) : null, right ? box(right, 600) : null].filter((b) => b !== null)
  })
}

describe('parseReceipt on real OCR output', () => {
  it('reads a tilted grocery receipt', () => {
    const r = parseReceipt(grocery.lines as OcrLine[])
    expect(r.store).toBe('Star Market')
    expect(r.date).toBe('2026-10-18')
    expect(r.items).toEqual([
      { name: 'Organic Bananas', quantity: 1, totalCents: 249, discountCents: 0, taxable: false },
      { name: 'Whole Milk 1gal', quantity: 1, totalCents: 429, discountCents: 0, taxable: false },
      { name: 'Sourdough Bread', quantity: 1, totalCents: 599, discountCents: 0, taxable: false },
      { name: 'Greek Yogurt', quantity: 2, totalCents: 698, discountCents: 0, taxable: false },
      { name: 'Paper Towels 6pk', quantity: 1, totalCents: 1199, discountCents: 200, taxable: true },
      { name: 'Dish Soap', quantity: 1, totalCents: 379, discountCents: 0, taxable: true },
      { name: 'Chicken Thighs', quantity: 1, totalCents: 912, discountCents: 0, taxable: false },
    ])
    expect(r.charges).toEqual([
      { kind: 'fee', label: 'Bag fee', amountCents: 10 },
      { kind: 'tax', label: 'Tax', amountCents: 86 },
    ])
    expect(r.subtotalCents).toBe(4275)
    expect(r.printedTotalCents).toBe(4361)
  })

  it('reads a restaurant bill with leading quantities and tip', () => {
    const r = parseReceipt(restaurant.lines as OcrLine[])
    expect(r.store).toBe('The Blue Plate')
    expect(r.date).toBe('2026-10-20')
    expect(r.items.map((i) => [i.name, i.quantity, i.totalCents])).toEqual([
      ['Margherita Pizza', 2, 3100],
      ['Caesar Salad', 1, 1250],
      ['Iced Tea', 3, 1050],
      ['Tiramisu', 1, 900],
    ])
    expect(r.charges).toEqual([
      { kind: 'tax', label: 'Sales Tax 7%', amountCents: 441 },
      { kind: 'tip', label: 'Tip 20%', amountCents: 1260 },
    ])
    expect(r.printedTotalCents).toBe(8001)
  })
})

describe('parseReceipt on an app screenshot', () => {
  it('reads "Qty" lines, delivery fees and "Taxes"', () => {
    const r = parseReceipt(screenshot.lines as OcrLine[])
    expect(r.store).toBe('FreshCart Order')
    expect(r.date).toBe('2026-10-22')
    expect(r.items.map((i) => [i.name, i.quantity, i.totalCents])).toEqual([
      ['Honeycrisp Apples', 3, 647],
      ['Oat Milk Barista', 1, 499],
      ['Cage-Free Eggs 12ct', 1, 549],
      ['Basmati Rice 2 lb', 1, 729],
      ['Frozen Dumplings', 2, 998],
      ['Dish Sponges 3pk', 1, 379],
      ['Avocados', 4, 500],
      ['Greek Yogurt Tub', 1, 629],
      ['Sparkling Water 12pk', 1, 599],
      ['Coffee Beans', 1, 1299],
    ])
    expect(r.charges).toEqual([
      { kind: 'fee', label: 'Service fee', amountCents: 341 },
      { kind: 'fee', label: 'Bag fee', amountCents: 25 },
      { kind: 'fee', label: 'Delivery fee', amountCents: 399 },
      { kind: 'tax', label: 'Taxes', amountCents: 114 },
      { kind: 'tip', label: 'Tip', amountCents: 600 },
    ])
    expect(r.subtotalCents).toBe(6828)
    expect(r.printedTotalCents).toBe(8307)
  })
})

describe('parseReceipt on a sectioned grocery receipt', () => {
  // Same layout as a real Star Market-style bill: section headers, a coupon with
  // "PRICE YOU PAY", bottle deposits, then TOTAL AFTER SAVINGS / TAX / BALANCE.
  const lines = receipt([
    ['STORE #73 10/17/26 08:05PM'],
    ['BAKE SHOP'],
    ['3SL VAR CHCK', '8.49 F'],
    ['DAIRY'],
    ['FAIRLIF2%CHC MLK', '5.49 F'],
    ['FROZEN FOOD'],
    ['HGDZ MNT CHC 16Z', '5.39 F'],
    ['SAVINGS', '1.40-F'],
    ['PRICE YOU PAY 3.99'],
    ['BJ CP CHO FG BR', '1.79 F'],
    ['BJ CUP CHRY GARC', '1.79 F'],
    ['GROCERY'],
    ['SPRKICE STRWBRY', '1.69 F'],
    ['DP BTL/CAN DEPOSIT', '0.05 F'],
    ['ORG MGO LM SPRKW', '1.69 F'],
    ['DP BTL/CAN DEPOSIT', '0.05 F'],
    ['CONVENIENCE ITEMS'],
    ['MR BAG FEE NP', '0.05'],
    ['Total After Savings', '25.08'],
    ['TAX', '0.00'],
    ['**** BALANCE', '25.08'],
    ['Payment Type: VISA CREDIT'],
  ])

  it('reads sections, coupons, deposits and the final balance', () => {
    const r = parseReceipt(lines)
    expect(r.store).toBeUndefined() // section headers aren't the store name
    expect(r.date).toBe('2026-10-17')
    expect(r.items.map((i) => [i.name, i.totalCents, i.discountCents, i.depositCents ?? 0, i.department])).toEqual([
      ['3sl Var Chck', 849, 0, 0, 'BAKE SHOP'],
      ['Fairlif 2%Chc Mlk', 549, 0, 0, 'DAIRY'],
      ['Hgdz Mnt Chc 16z', 539, 140, 0, 'FROZEN FOOD'],
      ['Bj Cp Cho Fg Br', 179, 0, 0, 'FROZEN FOOD'],
      ['Bj Cup Chry Garc', 179, 0, 0, 'FROZEN FOOD'],
      ['Sprkice Strwbry', 169, 0, 5, 'GROCERY'],
      ['Org Mgo Lm Sprkw', 169, 0, 5, 'GROCERY'],
    ])
    expect(r.charges).toEqual([{ kind: 'fee', label: 'Bag fee', amountCents: 5 }])
    expect(r.printedTotalCents).toBe(2508)
    const sum = r.items.reduce((a, i) => a + i.totalCents - i.discountCents + (i.depositCents ?? 0), 0)
    expect(sum + 5).toBe(2508)
  })

  it('uses the sections to pick categories', () => {
    const r = parseReceipt(lines)
    expect(categorize({ store: '', charges: [], items: r.items }, emptyMemory())).toEqual({
      categoryId: 'r:groceries',
      itemCategoryIds: ['i:bakery', 'i:dairy', 'i:frozen', 'i:frozen', 'i:frozen', 'i:drinks', 'i:drinks'],
    })
  })
})

describe('parseReceipt rules', () => {
  it('merges a name row with the price-only row under it', () => {
    const r = parseReceipt(
      receipt([['SHOP'], ['STRAWBERRIES', '4.99'], ['ORGANIC BABY SPINACH'], [undefined!, '3.49'], ['TOTAL', '8.48']]),
    )
    expect(r.items.map((i) => i.name)).toEqual(['Strawberries', 'Organic Baby Spinach'])
  })

  it('attaches a quantity line printed under its item', () => {
    const r = parseReceipt(receipt([['SHOP'], ['LIMES', '1.50'], ['3 @ 0.50'], ['TOTAL', '1.50']]))
    expect(r.items[0]).toMatchObject({ name: 'Limes', quantity: 3, totalCents: 150 })
  })

  it('reads inline quantities without mistaking pack sizes', () => {
    const r = parseReceipt(
      receipt([['SHOP'], ['COFFEE 2 @ 4.00', '8.00'], ['12 PACK SODA', '6.99'], ['TOTAL', '14.99']]),
    )
    expect(r.items.map((i) => [i.name, i.quantity])).toEqual([
      ['Coffee', 2],
      ['12 Pack Soda', 1],
    ])
  })

  it('keeps receipt-level discounts separate from item discounts', () => {
    const r = parseReceipt(
      receipt([['SHOP'], ['SOAP', '5.00'], ['SUBTOTAL', '5.00'], ['PROMO 10% OFF', '0.50-'], ['TOTAL', '4.50']]),
    )
    expect(r.items[0].discountCents).toBe(0)
    expect(r.charges).toEqual([{ kind: 'discount', label: 'Promo 10% Off', amountCents: -50 }])
  })

  it('treats "total tax" as tax and stops at the real total', () => {
    const r = parseReceipt(
      receipt([['SHOP'], ['TEA BAGS', '3.00'], ['TOTAL TAX', '0.19'], ['TOTAL', '3.19'], ['CASH', '5.00'], ['CHANGE', '1.81']]),
    )
    expect(r.items.map((i) => i.name)).toEqual(['Tea Bags'])
    expect(r.charges).toEqual([{ kind: 'tax', label: 'Total Tax', amountCents: 19 }])
    expect(r.printedTotalCents).toBe(319)
  })

  it('drops non-taxable flags when nothing is marked taxable', () => {
    const r = parseReceipt(receipt([['SHOP'], ['APPLES', '2.00 F'], ['TOTAL', '2.00']]))
    expect(r.items[0].taxable).toBeUndefined()
  })
})
