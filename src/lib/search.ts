// History search: words and prices typed into one box.
import { itemNetCents, split } from './split'
import type { Item, Receipt } from './types'

/** Inclusive, in cents. `max` is Infinity for "over 20". */
export interface PriceRange {
  min: number
  max: number
}

export interface Search {
  /** Lowercase words; each must match somewhere. */
  words: string[]
  price?: PriceRange
}

// An amount as typed: "4", "$4.99", "4.", ".99", "1,299.50". The lookahead
// needs a digit, so "$" or "." alone isn't one.
const NUMBER = String.raw`(?=\.?\d)(?:\d{1,3}(?:,\d{3})+|\d+)?(?:\.\d{0,2})?`
const AMOUNT = String.raw`\$?${NUMBER}`
// Amounts stand alone: not part of a word like "7up" or "16oz".
const START = String.raw`(?<![\w.,$])`
const END = String.raw`(?![\w.])`
const COMPARE = ['<=', '>=', '<', '>', 'under', 'below', 'less than', 'over', 'above', 'more than'].join('|')

// One pass finds price expressions, earliest first:
// "5-10" / "$5 to $10" (groups 1, 2), "under 5" / ">20" (3, 4), "$4" (5).
const PRICE = new RegExp(
  String.raw`${START}(${AMOUNT})\s*(?:-|to)\s*(${AMOUNT})${END}|(?<!\w)(${COMPARE})\s*(${AMOUNT})${END}|${START}(\$${NUMBER})${END}`,
  'g',
)
const BARE_AMOUNT = new RegExp(String.raw`^${AMOUNT}$`)

function amountParts(text: string) {
  const [whole = '', fraction = ''] = text.replace(/[$,]/g, '').split('.')
  return { base: Number(whole || 0) * 100, fraction }
}

const cents = (text: string) => {
  const { base, fraction } = amountParts(text)
  return base + Number(fraction.padEnd(2, '0'))
}

/** "4" → $4.00–$4.99, "4.9" → $4.90–$4.99, "4.99" → $4.99. */
function startingWith(text: string): PriceRange {
  const { base, fraction } = amountParts(text)
  return { min: base + Number(fraction.padEnd(2, '0')), max: base + Number(fraction.padEnd(2, '9')) }
}

function compare(op: string, amount: number): PriceRange {
  if (op === '<=') return { min: 0, max: amount }
  if (op === '>=') return { min: amount, max: Infinity }
  if (op === '<' || op === 'under' || op === 'below' || op === 'less than') return { min: 0, max: amount - 1 }
  return { min: amount + 1, max: Infinity }
}

/**
 * Splits a search into words and at most one price: a range ("5-10",
 * "$5 to $10"), a comparison ("under 5", ">20") or an amount that matches
 * prices starting with it ("$4" → $4.00–$4.99). A bare number counts as a
 * price only when it's the whole search, so "milk 4" and "coke 12" stay
 * words. Only the first price counts; any others are dropped.
 */
export function parseSearch(text: string): Search {
  const s = text.toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim()
  if (BARE_AMOUNT.test(s)) return { words: [], price: startingWith(s) }

  let price: PriceRange | undefined
  const rest = s.replace(PRICE, (_match, from, to, op, limit, dollars) => {
    if (!price) {
      if (from) {
        const [a, b] = [cents(from), cents(to)]
        price = { min: Math.min(a, b), max: Math.max(a, b) }
      } else if (op) price = compare(op, cents(limit))
      else price = startingWith(dollars)
    }
    return ' '
  })
  return { words: rest.split(' ').filter(Boolean), price }
}

export const isSearching = (search: Search) => search.words.length > 0 || search.price !== undefined

/** Name lookups for people and categories (any case). */
export interface SearchNames {
  person: (id: string) => string | undefined
  category: (id: string | undefined) => string | undefined
}

const has = (text: string | undefined, word: string) => Boolean(text?.toLowerCase().includes(word))
const inRange = (c: number, { min, max }: PriceRange) => c >= min && c <= max

/**
 * True when every word appears somewhere on the bill (store, category,
 * people, items, item categories) and its total is in the price range.
 */
export function matchesReceipt(receipt: Receipt, search: Search, names: SearchNames): boolean {
  if (search.price && !inRange(split(receipt).grandTotalCents, search.price)) return false
  return search.words.every(
    (w) =>
      has(receipt.store, w) ||
      has(names.category(receipt.categoryId), w) ||
      receipt.participantIds.some((id) => has(names.person(id), w)) ||
      receipt.items.some((i) => has(i.name, w) || has(names.category(i.categoryId), w)),
  )
}

export interface ItemMatch {
  receipt: Receipt
  item: Item
  /** What the line cost after coupons and deposits. */
  cents: number
  /** `cents` per unit (the same as `cents` for one unit). */
  unitCents: number
}

/**
 * Item lines that match, newest receipt first. Each word must appear in the
 * item's name or category or the receipt's store, and at least one in the
 * item itself, so "costco milk" finds milk from Costco but "costco" alone
 * lists bills, not every item on them. A price matches the printed line,
 * the line after coupons, or the price per unit.
 */
export function searchItems(receipts: Receipt[], search: Search, names: SearchNames): ItemMatch[] {
  if (!isSearching(search)) return []
  const { words, price } = search
  const newestFirst = [...receipts].sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt)
  const matches: ItemMatch[] = []
  for (const receipt of newestFirst) {
    for (const item of receipt.items) {
      const cents = itemNetCents(item)
      if (!item.name.trim() && cents === 0) continue // a blank row added by hand
      const unitCents = item.quantity > 1 ? Math.round(cents / item.quantity) : cents
      if (price && ![item.totalCents, cents, unitCents].some((c) => inRange(c, price))) continue
      const inItem = (w: string) => has(item.name, w) || has(names.category(item.categoryId), w)
      if (words.length && !(words.some(inItem) && words.every((w) => inItem(w) || has(receipt.store, w)))) continue
      matches.push({ receipt, item, cents, unitCents })
    }
  }
  return matches
}
