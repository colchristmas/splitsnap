import type { Group, Receipt } from '../lib/types'

/**
 * Rewrites every person id in a receipt through `swap`. Used when two copies
 * of the data each have their own "Me" (restoring a backup, or signing in on a
 * second device) and one must take over the other's bills.
 */
export function remapReceipt(r: Receipt, swap: (id: string) => string): Receipt {
  return {
    ...r,
    payerId: swap(r.payerId),
    participantIds: r.participantIds.map(swap),
    ...(r.settledWith && { settledWith: r.settledWith.map(swap) }),
    items: r.items.map((i) => ({
      ...i,
      shares: Object.fromEntries(Object.entries(i.shares).map(([k, v]) => [swap(k), v])),
    })),
  }
}

export function remapGroup(g: Group, swap: (id: string) => string): Group {
  return { ...g, memberIds: g.memberIds.map(swap) }
}

/** A swap that turns `from` into `to` and leaves every other id alone. */
export const replaceId = (from: string, to: string) => (id: string) => (id === from ? to : id)
