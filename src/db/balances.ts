import { useLiveQuery } from 'dexie-react-hooks'
import { balances, billShares, type Balance } from '../lib/balances'
import type { Receipt } from '../lib/types'
import { db } from './schema'

export interface BalancesData {
  meId: string | undefined
  /** Saved bills, newest first. */
  receipts: Receipt[]
  byPerson: Map<string, Balance>
}

/** Live balances between me and everyone, from saved bills. */
export function useBalances(): BalancesData {
  return (
    useLiveQuery(async () => {
      const me = await db.people.filter((p) => Boolean(p.isSelf)).first()
      const receipts = (await db.receipts.where('status').equals('final').toArray()).sort(
        (a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt,
      )
      return { meId: me?.id, receipts, byPerson: me ? balances(receipts, me.id) : new Map() }
    }, []) ?? { meId: undefined, receipts: [], byPerson: new Map() }
  )
}

/** Marks shares as paid back. Without `personIds`, settles everyone on those bills. */
export async function markSettled(receiptIds: string[], meId: string, personIds?: string[]) {
  await db.transaction('rw', db.receipts, async () => {
    for (const r of await db.receipts.bulkGet(receiptIds)) {
      if (!r) continue
      const counterparts = billShares(r, meId).map((s) => s.personId)
      const add = personIds ? counterparts.filter((id) => personIds.includes(id)) : counterparts
      r.settledWith = [...new Set([...(r.settledWith ?? []), ...add])]
      await db.receipts.put(r)
    }
  })
}

/** Settles every open bill with one person. */
export async function settleWithPerson(balance: Balance, meId: string) {
  const open = balance.shares.filter((s) => !s.settled).map((s) => s.receiptId)
  await markSettled(open, meId, [balance.personId])
}

/** Undo for a single bill: their share counts toward the balance again. */
export async function markUnsettled(receiptId: string, personId: string) {
  await db.receipts
    .where('id')
    .equals(receiptId)
    .modify((r) => {
      r.settledWith = (r.settledWith ?? []).filter((id) => id !== personId)
    })
}
