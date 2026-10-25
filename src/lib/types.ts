// Domain types shared by storage, the split engine and the UI.
// All money is integer cents.

export interface Person {
  id: string
  name: string
  color: string
  /** The app's owner ("Me"). Exactly one person has this set. */
  isSelf?: boolean
  /** Hidden from pickers but kept so old receipts still show the name. */
  archived?: boolean
  createdAt: number
  lastUsedAt: number
}

export interface Group {
  id: string
  name: string
  memberIds: string[]
  createdAt: number
}

export interface Item {
  id: string
  name: string
  quantity: number
  /** Line total as printed, before any discount. */
  totalCents: number
  /** Amount taken off this line (positive), e.g. a coupon printed under it. */
  discountCents: number
  /** Bottle/can deposit added to this line, paid by whoever has the item. */
  depositCents?: number
  /** The store's section header the item was printed under, e.g. "FROZEN FOOD". */
  department?: string
  /** Set when the receipt marks taxed lines (T/TX); tax then splits over these only. */
  taxable?: boolean
  /**
   * Split weights by person id. Equal split = 1 each; unit split = units
   * taken (e.g. 3x Coffee → { alex: 2, me: 1 }).
   */
  shares: Record<string, number>
  /** UI mode for quantity items: hand out units instead of splitting equally. */
  byUnits?: boolean
  categoryId?: string
  /** Set when the user picked the category, so auto-categorizing leaves it alone. */
  categoryManual?: boolean
}

export type CategoryKind = 'receipt' | 'item'

export interface Category {
  id: string
  kind: CategoryKind
  name: string
  order: number
}

export type ChargeKind = 'tax' | 'tip' | 'fee' | 'discount'
export type SplitMode = 'proportional' | 'even'

export interface Charge {
  id: string
  kind: ChargeKind
  label: string
  /** Signed: discounts are negative. */
  amountCents: number
  splitMode: SplitMode
}

export interface Receipt {
  id: string
  store: string
  /** yyyy-mm-dd */
  date: string
  status: 'draft' | 'final'
  payerId: string
  participantIds: string[]
  items: Item[]
  charges: Charge[]
  printedTotalCents?: number
  imageId?: string
  categoryId?: string
  categoryManual?: boolean
  /** People whose share of this bill (with me) has been paid back. */
  settledWith?: string[]
  createdAt: number
  updatedAt: number
}

export interface StoredImage {
  id: string
  blob: Blob
  createdAt: number
}

export const DEFAULT_SPLIT_MODE: Record<ChargeKind, SplitMode> = {
  tax: 'proportional',
  tip: 'proportional',
  discount: 'proportional',
  fee: 'even',
}
