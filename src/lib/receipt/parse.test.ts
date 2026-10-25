import { describe, expect, it } from 'vitest'
import grocery from './fixtures/grocery.json'
import restaurant from './fixtures/restaurant.json'
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
      { kind: 'fee', label: 'Bag Fee', amountCents: 10 },
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
