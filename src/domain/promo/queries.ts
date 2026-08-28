import 'server-only'
import type { Client } from '@/es/store'
import {
  type PromoCodeRecord,
  type RedeemSource,
  codeIsLive,
  grantIsLive,
  isRedeemSource,
} from '@/domain/promo/application'
import { asTier, DEFAULT_TIER, type Tier } from '@/domain/billing/tiers'

/**
 * Read side of the promo codes.
 *
 * Two audiences with almost no overlap. `readGrant` is on the critical path of
 * every page behind a workspace, runs as the visitor, and returns one row about
 * them. Everything below it is the backoffice report, runs as the service role,
 * and returns the whole campaign - which is only readable at all because the
 * policies on these tables let an admin through and nobody else.
 */

// ---------------------------------------------------------------------------
// The one row a member cares about
// ---------------------------------------------------------------------------

export interface Grant {
  /** When it ends, or `null` for a grant with no end at all. */
  until: string | null
  /** Still running. False for a grant that has already lapsed. */
  live: boolean
  source: RedeemSource
}

/**
 * This account's free month, if it ever had one.
 *
 * Returns the lapsed grant too rather than filtering to live ones, because
 * "your free month ended on the 6th" is the sentence a read-only space most
 * needs to be able to say. `live` carries the actual decision.
 *
 * Reads through the caller's own client - the select-own policy is what makes
 * that safe, and using the service role here would mean the one query on this
 * path that ignores RLS is the one that runs most often.
 *
 * Deliberately does not join `promo_codes` to name the code they used.
 * That table is admin-only, so the embed would come back empty for every
 * ordinary caller - a column that is always null in production and populated in
 * every test written against the service role. Better to not offer it than to
 * offer it and have it quietly mean nothing.
 */
export async function readGrant(supabase: Client, userId: string): Promise<Grant | null> {
  const { data, error } = await supabase
    .from('promo_redemptions')
    .select('granted_until, source')
    .eq('user_id', userId)
    .maybeSingle()

  // A grant that cannot be read must not blank the page it decorates. The
  // entitlement path treats a missing grant as no grant, which is the same
  // answer this failure produces - so the space is no more locked than it was.
  if (error || !data) return null

  return {
    until: data.granted_until,
    live: grantIsLive(data.granted_until),
    source: isRedeemSource(data.source) ? data.source : 'link',
  }
}

/**
 * Does this account have a live grant right now?
 *
 * The narrow question the seat arithmetic asks, kept separate from `readGrant`
 * so the hot path selects one column and does not join the codes table for a
 * name nobody is about to render.
 */
export async function hasLiveGrant(supabase: Client, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('promo_redemptions')
    .select('granted_until')
    .eq('user_id', userId)
    /*
      A grant with no end is NULL here, and `gt` would drop it: SQL compares
      NULL to a timestamp as NULL, which is not true. Both halves have to be
      asked for, in every place that asks - see `grantIsLive` and the migration
      that made the column nullable.
    */
    .or(`granted_until.is.null,granted_until.gt.${new Date().toISOString()}`)
    .limit(1)
    .maybeSingle()

  return data !== null && data !== undefined
}

// ---------------------------------------------------------------------------
// The backoffice report
// ---------------------------------------------------------------------------

export interface PromoCodeView extends PromoCodeRecord {
  id: string
  code: string
  label: string | null
  campaign: string | null
  /** How many days it grants, or `null` for a grant with no end. */
  freeDays: number | null
  /** How many of the holder's spaces it covers, or `null` for all of them. */
  spaces: number | null
  /** Which plan the free month is of. */
  tier: Tier
  createdAt: string
  /** Live under the same rules `redeem_promo_code` applies. */
  live: boolean
  /** How the redemptions of this code split across the doors. */
  bySource: Record<RedeemSource, number>
  /** The most recent redemption, so a dead campaign is visible at a glance. */
  lastRedeemedAt: string | null
}

/**
 * Every code, newest first, with its redemptions counted by door.
 *
 * Two queries rather than a join, and rather than a view. The codes table is
 * small enough that an admin page can hold all of it, and counting in
 * TypeScript means the split by source - which is the number this whole feature
 * exists to produce - can change shape without a migration.
 */
export async function listPromoCodes(admin: Client): Promise<PromoCodeView[]> {
  const { data: codes, error } = await admin
    .from('promo_codes')
    .select(
      'id, code, label, campaign, free_days, spaces, tier, max_uses, uses, starts_at, expires_at, revoked_at, created_at',
    )
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to list promo codes: ${error.message}`)
  if (!codes || codes.length === 0) return []

  const { data: redemptions } = await admin
    .from('promo_redemptions')
    .select('code_id, source, created_at')
    .in(
      'code_id',
      codes.map((row) => row.id),
    )

  const tallies = new Map<string, { bySource: Record<RedeemSource, number>; last: string | null }>()

  for (const row of redemptions ?? []) {
    const tally = tallies.get(row.code_id) ?? {
      bySource: { signup: 0, link: 0, picker: 0, space: 0, grant: 0 },
      last: null,
    }
    if (isRedeemSource(row.source)) tally.bySource[row.source] += 1
    if (!tally.last || row.created_at > tally.last) tally.last = row.created_at
    tallies.set(row.code_id, tally)
  }

  return codes.map((row) => {
    const record: PromoCodeRecord = {
      maxUses: row.max_uses,
      uses: row.uses,
      startsAt: row.starts_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
    }
    const tally = tallies.get(row.id)

    return {
      ...record,
      id: row.id,
      code: row.code,
      label: row.label,
      campaign: row.campaign,
      freeDays: row.free_days,
      spaces: row.spaces,
      tier: asTier(row.tier) ?? DEFAULT_TIER,
      createdAt: row.created_at,
      live: codeIsLive(record),
      bySource: tally?.bySource ?? { signup: 0, link: 0, picker: 0, space: 0, grant: 0 },
      lastRedeemedAt: tally?.last ?? null,
    }
  })
}

export interface RedemptionView {
  id: string
  code: string
  source: RedeemSource
  campaign: string | null
  /** When it ends, or `null` for a grant with no end at all. */
  grantedUntil: string | null
  /** How many spaces it reaches, or `null` for every space the holder owns. */
  grantedSpaces: number | null
  live: boolean
  createdAt: string
}

/**
 * The redemption log itself, newest first.
 *
 * No user id and no email. An admin looking at this page is asking how a
 * campaign performed, not who is on it - and a list of "these named people took
 * the free offer" is a thing worth not building by accident. The user id is in
 * the table for support and for the uniqueness rule; it does not need to be on
 * a screen.
 */
export async function listRedemptions(
  admin: Client,
  limit = 200,
): Promise<RedemptionView[]> {
  const { data, error } = await admin
    .from('promo_redemptions')
    .select('id, source, campaign, granted_until, granted_spaces, created_at, promo_codes ( code )')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`Failed to list redemptions: ${error.message}`)

  return (data ?? []).map((row) => {
    const related = row.promo_codes as { code: string } | { code: string }[] | null
    const code = Array.isArray(related) ? (related[0]?.code ?? '') : (related?.code ?? '')

    return {
      id: row.id,
      code,
      source: isRedeemSource(row.source) ? row.source : 'link',
      campaign: row.campaign,
      grantedUntil: row.granted_until,
      grantedSpaces: row.granted_spaces,
      live: grantIsLive(row.granted_until),
      createdAt: row.created_at,
    }
  })
}
