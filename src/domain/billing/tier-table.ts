import 'server-only'
import {
  DEFAULT_TIER,
  isTier,
  mergeLimits,
  type Tier,
  TIER_DETAILS,
  TIER_LIMITS,
  type TierLimits,
} from '@/domain/billing/tiers'
import type { Client } from '@/es/store'

/**
 * The tier table, read from the database with the constants underneath it.
 *
 * `docs/product/pricing.md` §10 argued this table had to stay in code, and one
 * of its two reasons was wrong - it claimed the landing page was a Client
 * Component, and it is a Server Component that already queries this database.
 * The other reason is why `TIER_LIMITS` has not gone anywhere.
 *
 * ---------------------------------------------------------------------------
 * The fallback is the point, not a nicety
 * ---------------------------------------------------------------------------
 * Every limit in this product now resolves through a row. A query that fails
 * and returned zeros would clamp every space in the product at once, for the
 * length of the outage, on the surface where it is felt immediately - somebody
 * inviting a colleague or opening a room. So a failed read falls back to the
 * compiled constants, which are the last numbers anybody reviewed.
 *
 * That also makes this table safe to be wrong about. An operator who deletes a
 * row gets the constant, not an outage.
 */

export interface TierRow {
  tier: Tier
  rank: number
  cents: number
  /** Does it get a card on the public pricing table? Not the same as `sold`. */
  shownOnLanding: boolean
  /** False for grandfathered prices and for free. Honoured, never offered. */
  sold: boolean
  limits: TierLimits
  label: string
  tagline: string
}

/** Every tier as the constants have it, for when the table cannot be read. */
function compiled(): TierRow[] {
  const RANK: Record<Tier, number> = { free: 0, xo: 1, xp: 2 }

  return (Object.keys(TIER_LIMITS) as Tier[]).map((tier) => ({
    tier,
    rank: RANK[tier],
    cents: TIER_DETAILS[tier].cents,
    shownOnLanding: true,
    sold: tier !== 'free',
    limits: TIER_LIMITS[tier],
    label: TIER_DETAILS[tier].label,
    tagline: TIER_DETAILS[tier].tagline,
  }))
}

/**
 * Every tier, cheapest first.
 *
 * The base row is applied to the others here rather than in SQL, because the
 * merge has rules - absent inherits, null is unlimited, anything else is
 * dropped - and those belong somewhere a test can reach them. See
 * `mergeLimits`.
 */
export async function readTierTable(supabase: Client): Promise<TierRow[]> {
  const { data, error } = await supabase
    .from('tiers')
    .select('id, rank, cents, sold, shown_on_landing, limits, label, tagline')
    .order('rank', { ascending: true })

  if (error || !data || data.length === 0) return compiled()

  const base = data.find((row) => row.id === DEFAULT_TIER)

  /*
   * No free row is a broken table, not a table without a free tier.
   *
   * Every other row is sparse *against free*, so without it they would each be
   * merged over the compiled constants for their own tier - which would look
   * like it worked and would silently ignore whatever an operator had changed
   * about the base. Falling back wholesale is the honest answer.
   */
  if (!base) return compiled()

  const baseLimits = mergeLimits(TIER_LIMITS[DEFAULT_TIER], base.limits)

  return data.filter((row) => isTier(row.id)).map((row) => ({
    tier: row.id as Tier,
    rank: row.rank,
    cents: row.cents,
    shownOnLanding: row.shown_on_landing,
    sold: row.sold,
    limits: row.id === DEFAULT_TIER ? baseLimits : mergeLimits(baseLimits, row.limits),
    label: row.label,
    tagline: row.tagline,
  }))
}

/** One tier's row, or its compiled fallback. */
export async function readTier(supabase: Client, tier: Tier): Promise<TierRow> {
  const rows = await readTierTable(supabase)
  return rows.find((row) => row.tier === tier) ?? compiled().find((row) => row.tier === tier)!
}

/**
 * What one provider price sells: which tier, and what it promised.
 *
 * The mapping lives in `tier_prices` rather than on the tier, because several
 * prices map to one tier and each sold something different - today's xo price
 * sells six seats, and the one people bought on was advertised with unlimited
 * members. `docs/product/pricing.md` §9.
 *
 * Null is a real answer and callers must handle it. An account can carry
 * subscriptions we did not sell, and treating an unrecognised price as a tier
 * is how an unrelated purchase unlocks the product.
 *
 * No fallback to the constants here, and that is deliberate: the compiled table
 * knows what a tier *is* and has never known which price sells it. An
 * unreadable `tier_prices` answers "not one of ours", which refuses to honour a
 * real subscription for the length of an outage - recoverable - where guessing
 * would hand the product to an unrelated purchase, which is not.
 */
export interface PriceGrant {
  tier: Tier
  sold: boolean
  /** The tier's limits with this price's own promises merged over them. */
  limits: TierLimits
  note: string | null
}

export async function grantForPrice(
  supabase: Client,
  priceId: string | null | undefined,
  provider = 'stripe',
): Promise<PriceGrant | null> {
  if (!priceId) return null

  const { data, error } = await supabase
    .from('tier_prices')
    .select('tier, sold, limits, note')
    .eq('provider', provider)
    .eq('price_id', priceId)
    .maybeSingle()

  if (error || !data || !isTier(data.tier)) return null

  const tier = data.tier as Tier
  const rows = await readTierTable(supabase)
  const base = rows.find((row) => row.tier === tier)?.limits ?? TIER_LIMITS[tier]

  return {
    tier,
    sold: data.sold,
    // Sparse over the tier's own, exactly as a tier row is sparse over free.
    // An override rather than a snapshot, so a grandfathered customer still
    // receives every limit added after they bought.
    limits: mergeLimits(base, data.limits),
    note: data.note,
  }
}

/** The price a new checkout should be built against, or null if none is on sale. */
export async function sellingPriceFor(
  supabase: Client,
  tier: Tier,
  provider = 'stripe',
): Promise<string | null> {
  const { data } = await supabase
    .from('tier_prices')
    .select('price_id')
    .eq('provider', provider)
    .eq('tier', tier)
    .eq('sold', true)
    .maybeSingle()

  return data?.price_id ?? null
}

/** The tiers somebody may actually buy today, cheapest first. */
export async function soldTiers(supabase: Client): Promise<TierRow[]> {
  const rows = await readTierTable(supabase)
  return rows.filter((row) => row.sold && row.tier !== 'free')
}

/**
 * The tiers the public pricing table should draw, cheapest first.
 *
 * Free is included where `sold` deliberately excludes it: it has no checkout
 * and every reason to be on the page. The two flags answer different questions
 * and this is the one place the difference is visible - `sold` is "may somebody
 * buy this", `shown_on_landing` is "does it belong in the shop window", and a
 * grandfathered price is false for both while free is false for one.
 */
export async function landingTiers(supabase: Client): Promise<TierRow[]> {
  const rows = await readTierTable(supabase)
  return rows.filter((row) => row.shownOnLanding)
}
