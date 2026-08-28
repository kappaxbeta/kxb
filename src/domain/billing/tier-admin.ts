import 'server-only'
import {
  DEFAULT_TIER,
  isTier,
  LIMIT_KEYS,
  type LimitKey,
  type Tier,
} from '@/domain/billing/tiers'
import type { Client } from '@/es/store'

/**
 * The tier table as it is *stored*, for the one surface that edits it.
 *
 * `tier-table.ts` reads these same two tables and answers "what does this space
 * get" - merged over free, merged over the compiled constants, never failing.
 * That is the right shape for every caller in the product and the wrong shape
 * for an editor: a merged row cannot tell you whether xo's `matches: 15` is
 * written down or inherited, and saving it back would write nine values into a
 * row that deliberately states one.
 *
 * So this reads the rows raw and keeps the sparseness. Absent stays absent.
 *
 * These queries throw where `readTierTable` falls back, and the difference is
 * the audience. A failed read on the landing page must still quote a price; a
 * failed read in the backoffice must not draw an editable form over numbers it
 * could not fetch, because the next click would save that form.
 */

/**
 * What one row says about the limits, and nothing more.
 *
 * A key that is absent means *inherit*; a key whose value is `null` means
 * *unlimited*. `mergeLimits` depends on that difference and so does this: an
 * editor that could not express "absent" would turn every sparse row into a
 * snapshot the first time somebody saved it.
 */
export type StoredLimits = Partial<Record<LimitKey, number | null>>

export interface StoredTier {
  id: Tier
  /** Ordering only. `tierAtLeast` compares the compiled ranks, not this. */
  rank: number
  cents: number
  sold: boolean
  shownOnLanding: boolean
  limits: StoredLimits
  label: string
  tagline: string
  updatedAt: string
  /** True for `free`, which every other row is sparse against. */
  isBase: boolean
}

export interface StoredPrice {
  provider: string
  priceId: string
  tier: string
  sold: boolean
  limits: StoredLimits
  note: string | null
  createdAt: string
}

/**
 * A `limits` column, read with exactly the rules `mergeLimits` applies to it.
 *
 * Anything that is not a whole non-negative integer or an explicit null is
 * *dropped* rather than shown, because dropped is what it already is: the
 * reader ignores it, so the tier really is inheriting, and drawing `"12"` in a
 * field would tell an operator their twelve is in force when it never was.
 * Saving the form then writes the row clean.
 */
export function readStoredLimits(value: unknown): StoredLimits {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}

  const source = value as Record<string, unknown>
  const limits: StoredLimits = {}

  for (const key of LIMIT_KEYS) {
    if (!Object.hasOwn(source, key)) continue

    const stated = source[key]
    if (stated === null) {
      limits[key] = null
      continue
    }
    if (typeof stated === 'number' && Number.isInteger(stated) && stated >= 0) {
      limits[key] = stated
    }
  }

  return limits
}

/** Every tier row as stored, cheapest first. */
export async function listStoredTiers(admin: Client): Promise<StoredTier[]> {
  const { data, error } = await admin
    .from('tiers')
    .select('id, rank, cents, sold, shown_on_landing, limits, label, tagline, updated_at')
    .order('rank', { ascending: true })

  if (error) throw new Error(`Could not read the tier table: ${error.message}`)

  /*
   * A row whose id is not one of the three the code knows is filtered out here
   * as well as in `tier-table.ts`. It would be unreadable by the product, so
   * offering it for editing would be offering to change nothing.
   */
  return (data ?? [])
    .filter((row) => isTier(row.id))
    .map((row) => ({
      id: row.id as Tier,
      rank: row.rank,
      cents: row.cents,
      sold: row.sold,
      shownOnLanding: row.shown_on_landing,
      limits: readStoredLimits(row.limits),
      label: row.label,
      tagline: row.tagline,
      updatedAt: row.updated_at,
      isBase: row.id === DEFAULT_TIER,
    }))
}

/** Every provider price we have ever sold a tier on, newest first. */
export async function listStoredPrices(admin: Client): Promise<StoredPrice[]> {
  const { data, error } = await admin
    .from('tier_prices')
    .select('provider, price_id, tier, sold, limits, note, created_at')
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Could not read the price table: ${error.message}`)

  return (data ?? []).map((row) => ({
    provider: row.provider,
    priceId: row.price_id,
    tier: row.tier,
    sold: row.sold,
    limits: readStoredLimits(row.limits),
    note: row.note,
    createdAt: row.created_at,
  }))
}
