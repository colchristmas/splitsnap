import { formatCents } from './money'
import { formatDate } from './share'
import { split } from './split'
import type { Receipt } from './types'

/** One person's share of one bill, from my side. */
export interface BillShare {
  receiptId: string
  personId: string
  /** Positive: they owe me. Negative: I owe them. */
  cents: number
  settled: boolean
}

/**
 * What each person and I owe each other on one saved bill. Only pairs that
 * include me count: if I paid, everyone else owes me their share; if someone
 * else paid, I owe them mine.
 */
export function billShares(receipt: Receipt, meId: string): BillShare[] {
  if (receipt.status !== 'final') return []
  const result = split(receipt)
  if (result.unassignedItemIds.length > 0) return []
  const settled = new Set(receipt.settledWith ?? [])
  const share = (personId: string, cents: number): BillShare => ({
    receiptId: receipt.id,
    personId,
    cents,
    settled: settled.has(personId),
  })
  if (receipt.payerId === meId) {
    return result.people.filter((p) => p.personId !== meId && p.totalCents !== 0).map((p) => share(p.personId, p.totalCents))
  }
  const mine = result.people.find((p) => p.personId === meId)
  return mine && mine.totalCents !== 0 ? [share(receipt.payerId, -mine.totalCents)] : []
}

export interface Balance {
  personId: string
  /** Sum of unsettled shares: positive means they owe me. */
  openCents: number
  openBills: number
  /** Every share with this person, settled or not. */
  shares: BillShare[]
}

/** Running balances between me and each person, across saved bills. */
export function balances(receipts: Receipt[], meId: string): Map<string, Balance> {
  const out = new Map<string, Balance>()
  for (const r of receipts) {
    for (const s of billShares(r, meId)) {
      const b = out.get(s.personId) ?? { personId: s.personId, openCents: 0, openBills: 0, shares: [] }
      b.shares.push(s)
      if (!s.settled) {
        b.openCents += s.cents
        b.openBills++
      }
      out.set(s.personId, b)
    }
  }
  return out
}

export interface CombinedPerson {
  personId: string
  /** Positive: they owe me. Negative: I owe them. */
  totalCents: number
  shares: BillShare[]
}

/** One total per person across several bills (unsettled shares only), biggest first. */
export function combine(receipts: Receipt[], meId: string): CombinedPerson[] {
  const people = new Map<string, CombinedPerson>()
  for (const r of receipts) {
    for (const s of billShares(r, meId)) {
      if (s.settled) continue
      const p = people.get(s.personId) ?? { personId: s.personId, totalCents: 0, shares: [] }
      p.totalCents += s.cents
      p.shares.push(s)
      people.set(s.personId, p)
    }
  }
  return [...people.values()].filter((p) => p.totalCents !== 0).sort((a, b) => Math.abs(b.totalCents) - Math.abs(a.totalCents))
}

/** "Oct 17–24", "Sep 28 – Oct 24", "Oct 17, 2026"… */
export function dateRange(dates: string[]): string {
  const sorted = [...dates].sort()
  if (sorted.length === 0) return ''
  const [first, last] = [sorted[0], sorted.at(-1)!]
  if (first === last) return formatDate(first)
  const [y1, m1] = first.split('-')
  const [y2, m2] = last.split('-')
  const short = (iso: string) => formatDate(iso).replace(/, \d{4}$/, '')
  if (y1 === y2 && m1 === m2) return `${short(first)}–${Number(last.split('-')[2])}`
  return y1 === y2 ? `${short(first)} – ${short(last)}` : `${formatDate(first)} – ${formatDate(last)}`
}

/**
 * "Sebastian owes me $41.20" / "I owe Paul $8.10". Uses first person while
 * I'm still called "Me"; once I've set a name, "Paul owes Christo $8.10".
 */
export function owesLine(cents: number, personName: string, myName: string): string {
  const firstPerson = myName.trim().toLowerCase() === 'me'
  if (cents >= 0) return `${personName} owes ${firstPerson ? 'me' : myName} ${formatCents(cents)}`
  return `${firstPerson ? 'I owe' : `${myName} owes`} ${personName} ${formatCents(-cents)}`
}

/** Plain text for sharing a set of bills combined into one total per person. */
export function combinedText(
  receipts: Receipt[],
  people: CombinedPerson[],
  name: (id: string) => string,
  meId: string,
): string {
  const byId = new Map(receipts.map((r) => [r.id, r]))
  const header = `Combined: ${receipts.length} ${receipts.length === 1 ? 'bill' : 'bills'} · ${dateRange(receipts.map((r) => r.date))}`
  const blocks = people.map((p) => {
    const sign = Math.sign(p.totalCents) || 1
    const lines = p.shares.map((s) => {
      const r = byId.get(s.receiptId)!
      return `• ${r.store || 'Receipt'}, ${formatDate(r.date).replace(/, \d{4}$/, '')}: ${formatCents(s.cents * sign)}`
    })
    return [owesLine(p.totalCents, name(p.personId), name(meId)), ...lines].join('\n')
  })
  return [header, ...blocks].join('\n\n')
}
