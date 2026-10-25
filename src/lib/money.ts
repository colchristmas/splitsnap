const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export function formatCents(cents: number): string {
  return usd.format(cents / 100)
}

/**
 * Parses user or receipt text like "$1,234.56", "12", "2.00-", "-2.00" or
 * "(2.00)" into cents. Returns null when there is no amount.
 */
export function parseMoney(text: string): number | null {
  const s = text.trim().replace(/\s+/g, '')
  const m = /^(\()?(-)?\$?(\d{1,3}(?:,\d{3})+|\d+)?(?:[.,](\d{1,2}))?(-)?(\))?$/.exec(s)
  if (!m || (m[3] === undefined && m[4] === undefined)) return null
  const whole = Number((m[3] ?? '0').replace(/,/g, ''))
  const frac = Number((m[4] ?? '0').padEnd(2, '0'))
  const negative = Boolean(m[2] || m[5] || (m[1] && m[6]))
  const cents = whole * 100 + frac
  return negative ? -cents : cents
}

/**
 * Splits `total` cents by integer `weights` so the parts always add up to
 * `total` exactly (largest-remainder method). Leftover pennies go to the
 * largest fractional parts; ties go to the earlier index, so results are
 * deterministic. Returns all zeros when the weights sum to zero.
 */
export function allocate(total: number, weights: number[]): number[] {
  const w = weights.map((x) => Math.max(0, Math.round(x)))
  const sum = w.reduce((a, b) => a + b, 0)
  if (sum === 0) return w.map(() => 0)
  if (total < 0) return allocate(-total, w).map((x) => (x === 0 ? 0 : -x))

  const parts = w.map((x) => Math.floor((total * x) / sum))
  let left = total - parts.reduce((a, b) => a + b, 0)
  const order = w
    .map((x, i) => ({ i, rem: (total * x) % sum }))
    .filter((o) => w[o.i] > 0)
    .sort((a, b) => b.rem - a.rem || a.i - b.i)
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) parts[order[k].i]++
  return parts
}
