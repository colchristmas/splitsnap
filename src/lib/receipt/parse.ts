import { parseMoney } from '../money'
import type { ChargeKind } from '../types'

/** One recognized text box from the OCR engine. `poly` starts top-left, clockwise. */
export interface OcrLine {
  text: string
  score: number
  poly: [number, number][]
}

export interface ParsedItem {
  name: string
  quantity: number
  totalCents: number
  discountCents: number
  taxable?: boolean
}

export interface ParsedCharge {
  kind: ChargeKind
  label: string
  /** Signed: discounts are negative. */
  amountCents: number
}

export interface ParsedReceipt {
  store?: string
  /** yyyy-mm-dd */
  date?: string
  items: ParsedItem[]
  charges: ParsedCharge[]
  subtotalCents?: number
  printedTotalCents?: number
}

interface Box {
  text: string
  x0: number
  cy: number
  h: number
}

// A trailing amount: "4.29", "$80.01", "2.00-", "11.99 T", "5.99F".
const PRICE_AT_END = /(-?\$?\s?\d{1,4}(?:,\d{3})*[.,]\d{2})\s*(-)?\s*([A-Z*]{1,2})?$/i
// "2 @ 3.49", "2 X 3.49", "2 @ $3.49 ea"
const QTY_AT = /(\d{1,3})\s*(?:@|[xX×])\s*\$?(\d{1,4}[.,]\d{2})(?:\s*(?:EA|EACH|\/EA))?/i
const UNIT_WORDS = /^(PK|PACK|CT|COUNT|OZ|FL|LB|LBS|G|KG|ML|L|GAL|IN|PC|PCS|ROLL|ROLLS)\b/i

// Keywords end at a non-letter so OCR'd "Tip20%" or "Tax7%" still match.
const SUBTOTAL = /\bSUB\s*-?\s*TOTAL(?![A-Z])/i
const TAX = /\b(TAX|VAT|GST|HST|PST)(?![A-Z])/i
const TAX_INCLUDED = /\b(INCL\.?|INCLUDING|WITH|W\/)\s*(SALES\s+)?TAX\b/i
const TIP = /\b(TIP|GRATUITY)(?![A-Z])/i
const TOTAL = /\b(GRAND\s+)?TOTAL(?![A-Z])|\bAMOUNT\s+DUE\b|\bBALANCE\s+DUE\b/i
const NOT_TOTAL = /\b(SAVINGS|SAVED|ITEMS?|QTY|COUNT)\b/i
// Payment lines normally follow the total (where parsing stops); this catches the few that don't.
const PAYMENT = /\b(VISA|MASTERCARD|AMEX|DEBIT|CREDIT CARD|TENDER(ED)?|AUTH|APPROVAL|APPROVED|CHANGE DUE)\b|\*{2,}\s*\d{3,4}/i
const DISCOUNT = /\b(COUPON|DISCOUNT|SAVINGS|PROMO|MFR|MARKDOWN)\b/i
const FEE = /\b(FEE|CHARGE|SURCHARGE|DEPOSIT|CRV)\b|^\W*(PAPER |PLASTIC |REUSABLE |CHECKOUT )?BAGS?\b/i

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/**
 * Turns raw OCR boxes into items and charges. Boxes are deskewed and grouped
 * into printed rows; each row is classified by its keywords and trailing
 * price. The result is a best guess for the user to correct on the Review
 * screen, not a guarantee.
 */
export function parseReceipt(lines: OcrLine[]): ParsedReceipt {
  const rows = groupRows(lines)
  const out: ParsedReceipt = { items: [], charges: [] }

  let pendingName: string | null = null
  let pendingQty: { qty: number; unitCents: number } | null = null
  let lastWasItem = false
  let sawPrice = false

  for (const row of rows) {
    if (!out.date) out.date = findDate(row)

    // A quantity line with no line total, e.g. "2 @ 3.49" above or below its item.
    const qty = QTY_AT.exec(row)
    const rest = qty ? row.replace(QTY_AT, '') : ''
    if (qty && sawPrice && !/[A-Za-z]{2}/.test(rest) && !PRICE_AT_END.test(rest)) {
      const q = Number(qty[1])
      const unitCents = parseMoney(qty[2]) ?? 0
      const prev = out.items.at(-1)
      if (lastWasItem && prev && prev.quantity === 1 && prev.totalCents === q * unitCents) prev.quantity = q
      else pendingQty = { qty: q, unitCents }
      continue
    }

    const priceMatch = PRICE_AT_END.exec(row)
    let name = priceMatch ? row.slice(0, priceMatch.index).trim() : row
    let cents = priceMatch ? parseMoney(priceMatch[1].replace(/\s/g, '') + (priceMatch[2] ?? '')) : null
    const flag = priceMatch?.[3]?.toUpperCase()

    if (cents === null) {
      if (!sawPrice && !out.store && /[A-Za-z]{3}/.test(row) && !findDate(row)) out.store = tidy(row)
      if (/[A-Za-z]{2}/.test(row)) pendingName = row
      lastWasItem = false
      continue
    }
    sawPrice = true

    if (SUBTOTAL.test(name)) {
      out.subtotalCents = cents
      lastWasItem = false
      continue
    }
    if (TAX.test(name) && !TAX_INCLUDED.test(name)) {
      out.charges.push({ kind: 'tax', label: tidy(name) || 'Tax', amountCents: cents })
      lastWasItem = false
      continue
    }
    if (TIP.test(name)) {
      out.charges.push({ kind: 'tip', label: tidy(name) || 'Tip', amountCents: cents })
      lastWasItem = false
      continue
    }
    if (TOTAL.test(name) && !NOT_TOTAL.test(name)) {
      out.printedTotalCents = cents
      break // everything after the total is payment details
    }
    if (PAYMENT.test(name)) continue

    // Price-only row: the name was printed on the row above.
    if (!/[A-Za-z]{2}/.test(name.replace(QTY_AT, '')) && pendingName) {
      name = `${pendingName} ${name}`.trim()
    }
    pendingName = null

    if (cents < 0 || (DISCOUNT.test(name) && !FEE.test(name))) {
      const off = Math.abs(cents)
      const prev = out.items.at(-1)
      if (lastWasItem && prev) prev.discountCents += off
      else out.charges.push({ kind: 'discount', label: tidy(name) || 'Discount', amountCents: -off })
      continue
    }
    if (cents === 0) continue

    if (FEE.test(name)) {
      out.charges.push({ kind: 'fee', label: tidy(name.replace(QTY_AT, '')) || 'Fee', amountCents: cents })
      lastWasItem = false
      continue
    }

    const item: ParsedItem = { name: '', quantity: 1, totalCents: cents, discountCents: 0 }
    const qtyAt = QTY_AT.exec(name)
    if (qtyAt) {
      item.quantity = Number(qtyAt[1])
      name = name.replace(QTY_AT, ' ')
    } else {
      const lead = /^(\d{1,2})\s*[xX×]?\s+(?=[A-Za-z])/.exec(name)
      if (lead && Number(lead[1]) > 0 && !UNIT_WORDS.test(name.slice(lead[0].length))) {
        item.quantity = Number(lead[1])
        name = name.slice(lead[0].length)
      }
    }
    if (pendingQty && item.quantity === 1 && pendingQty.qty * pendingQty.unitCents === cents) {
      item.quantity = pendingQty.qty
    }
    pendingQty = null
    if (flag) item.taxable = flag === 'T' || flag === 'TX' || flag === 'X'
    item.name = tidy(name) || 'Item'
    out.items.push(item)
    lastWasItem = true
  }

  // Flags like "F" only mean something if the receipt also marks taxed lines.
  if (!out.items.some((i) => i.taxable)) for (const i of out.items) delete i.taxable
  return out
}

/** Deskews boxes by their median text angle and joins them into printed rows, top to bottom. */
function groupRows(lines: OcrLine[]): string[] {
  const usable = lines.filter((l) => l.text.trim() && l.poly.length >= 4)
  const angles = usable
    .map(({ poly: [p0, p1, , p3] }) => ({ dx: p1[0] - p0[0], dy: p1[1] - p0[1], h: Math.hypot(p3[0] - p0[0], p3[1] - p0[1]) }))
    .filter((a) => a.dx > 2 * a.h)
    .map((a) => Math.atan2(a.dy, a.dx))
  const theta = median(angles) ?? 0
  const sin = Math.sin(theta)
  const cos = Math.cos(theta)

  const boxes: Box[] = usable.map(({ text, poly }) => {
    const pts = poly.map(([x, y]) => [x * cos + y * sin, -x * sin + y * cos])
    const ys = pts.map((p) => p[1])
    const top = (ys[0] + ys[1]) / 2
    const bottom = (ys[2] + ys[3]) / 2
    return { text: text.trim(), x0: Math.min(...pts.map((p) => p[0])), cy: (top + bottom) / 2, h: Math.abs(bottom - top) }
  })
  const tol = (median(boxes.map((b) => b.h)) ?? 20) * 0.5

  const rows: { cy: number; boxes: Box[] }[] = []
  for (const box of [...boxes].sort((a, b) => a.cy - b.cy)) {
    const row = rows.find((r) => Math.abs(r.cy - box.cy) < tol)
    if (row) {
      row.boxes.push(box)
      row.cy = row.boxes.reduce((a, b) => a + b.cy, 0) / row.boxes.length
    } else {
      rows.push({ cy: box.cy, boxes: [box] })
    }
  }
  return rows
    .sort((a, b) => a.cy - b.cy)
    .map((r) => r.boxes.sort((a, b) => a.x0 - b.x0).map((b) => b.text).join(' ').replace(/\s+/g, ' '))
}

function findDate(text: string): string | undefined {
  const numeric = /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4}|\d{2})/.exec(text)
  if (numeric) {
    const [m, d, y] = [Number(numeric[1]), Number(numeric[2]), numeric[3]]
    const year = y.length === 2 ? 2000 + Number(y) : Number(y)
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return iso(year, m, d)
  }
  const isoMatch = /(20\d{2})-(\d{2})-(\d{2})/.exec(text)
  if (isoMatch) return iso(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]))
  const named = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|[o0]ct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s*(20\d{2})/i.exec(text)
  if (named) {
    const month = MONTHS.indexOf(named[1].toLowerCase().replace(/^0/, 'o')) + 1
    return iso(Number(named[3]), month, Number(named[2]))
  }
  return undefined
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Cleans a printed name: trims stray symbols and title-cases ALL-CAPS text. */
function tidy(text: string): string {
  const s = text
    .replace(/[$:*#]+/g, ' ')
    .replace(/([A-Za-z]{3,})(\d)/g, '$1 $2') // OCR often drops the space in "Tip20%"
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-.,]+|[\s\-.,]+$/g, '')
  if (/[a-z]/.test(s)) return s
  return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase())
}

function median(xs: number[]): number | undefined {
  if (xs.length === 0) return undefined
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}
