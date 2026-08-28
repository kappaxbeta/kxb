import 'server-only'
import {
  type FlaggedLimitKey,
  type Limit,
  LIMIT_FLAGS,
  maxLimit,
  minLimit,
  resolveLimit,
  UNLIMITED,
  withinLimit,
} from '@/domain/billing/limits'
import {
  asTier,
  DEFAULT_TIER,
  FALLBACK_TIER,
  FREE_SPACES_PER_ACCOUNT,
  type Tier,
} from '@/domain/billing/tiers'
import type { Client } from '@/es/store'

/**
 * The limit in force for one space, with the database's two rungs fetched.
 *
 * The server half of `limits.ts`. That file decides *what beats what* and is
 * pure so the decision can be tested without a database; this one goes and gets
 * the numbers. Same split as `capacity.ts` and `occupancy.ts` next door, and
 * for the same reason - the interesting part should be reachable by a test.
 *
 * ---------------------------------------------------------------------------
 * Why every failure lifts the cap
 * ---------------------------------------------------------------------------
 * Every path here returns "no limit" when it cannot get an answer, and that is
 * the direction argued at `seat_limit` in `flags/keys.ts`: a lookup that broke
 * must not be the thing that turns somebody away at a door they were sent a
 * link to. An outage that briefly lets a space open one extra room costs a room
 * an admin can see and remove. One that clamps every space to zero is an
 * incident, and it arrives during the outage rather than after it.
 *
 * Note that this is *not* the same as failing to unlimited on the tier. The
 * tier is a constant in this process and cannot fail; only the override and the
 * ceiling are fetched. A broken fetch therefore leaves the tier's own number
 * standing, which is exactly right - what somebody bought is still known.
 */

interface Rungs {
  hasOverride: boolean
  overrideValue: Limit
  ceilingValue: Limit
}

/** Neither rung, for when the lookup fails. Leaves the tier's number standing. */
const NO_RUNGS: Rungs = { hasOverride: false, overrideValue: UNLIMITED, ceilingValue: UNLIMITED }

/**
 * A row from either `*_feature_limit` function, in this file's own shape.
 *
 * Both functions return the same three columns as a single-row table, so one
 * reader serves both. `value <= 0` is treated as absent rather than as a cap of
 * zero: the columns come back NULL when a flag is off, and a zero would mean a
 * cap nobody could ever satisfy - which is never what an operator meant and is
 * what the `> 0` guard in the SQL is already saying.
 */
function toRungs(
  row: { has_override: boolean; override_value: number | null; ceiling_value: number | null } | undefined,
): Rungs {
  if (!row) return NO_RUNGS

  return {
    hasOverride: row.has_override === true,
    overrideValue: typeof row.override_value === 'number' && row.override_value > 0
      ? row.override_value
      : UNLIMITED,
    ceilingValue: typeof row.ceiling_value === 'number' && row.ceiling_value > 0
      ? row.ceiling_value
      : UNLIMITED,
  }
}

/**
 * How many of `key` this space may have.
 *
 * `undefined` for the override when there is no override row at all, which is a
 * different answer from `UNLIMITED` and `resolveLimit` treats it as one: no row
 * leaves the tier alone, where a row saying unlimited is an operator
 * deliberately taking the cap off this one space.
 */
export async function limitFor(
  supabase: Client,
  tenantId: string,
  tier: Tier,
  key: FlaggedLimitKey,
): Promise<Limit> {
  const { data, error } = await supabase.rpc('tenant_feature_limit', {
    p_key: LIMIT_FLAGS[key],
    p_tenant_id: tenantId,
  })

  const rungs = error ? NO_RUNGS : toRungs(data?.[0])

  return resolveLimit({
    tier,
    key,
    override: rungs.hasOverride ? rungs.overrideValue : undefined,
    ceiling: rungs.ceilingValue,
  })
}

/**
 * Is there room for one more?
 *
 * The whole question in one call, for the create paths - which otherwise each
 * have to remember to fetch the limit, compare with `<` rather than `<=`, and
 * handle `null` as unlimited. Three chances to get it subtly wrong, in every
 * path, forever.
 *
 * `count` is the caller's, because counting differs per resource in ways this
 * file should not know: rooms are a filtered row count, seats are members plus
 * pending invitations, matches are open battles. Passing the number in keeps
 * the quota logic in one place without pulling every query into it.
 */
export async function hasRoomFor(
  supabase: Client,
  tenantId: string,
  tier: Tier,
  key: FlaggedLimitKey,
  count: number,
): Promise<{ allowed: boolean; limit: Limit }> {
  const limit = await limitFor(supabase, tenantId, tier, key)
  return { allowed: withinLimit(count, limit), limit }
}

/**
 * The tier of a space, for a caller with no `TenantContext` to read it off.
 *
 * `null` means the lookup itself failed, which is not the same as a space
 * having no tier - that answers `free`. Callers that must fail closed need the
 * difference; `tenantLimit` below does not and resolves it away.
 */
async function tierOf(client: Client, tenantId: string): Promise<Tier | null> {
  const { data, error } = await client.rpc('tenant_tier', { p_tenant_id: tenantId })
  if (error) return null
  return asTier(data) ?? DEFAULT_TIER
}

/**
 * `limitFor` for a caller that does not already hold the tier.
 *
 * One extra round trip, taken deliberately rather than by threading a tier
 * through call sites that have no other reason to know one - the guest door and
 * the invite path both have a tenant id and nothing else.
 *
 * Fails soft, like everything else here: an unreadable tier falls back to
 * `FALLBACK_TIER` rather than to `free`, so a database blip cannot clamp a
 * paying space to two seats. See the argument on those constants.
 */
export async function tenantLimit(
  client: Client,
  tenantId: string,
  key: FlaggedLimitKey,
): Promise<Limit> {
  const tier = await tierOf(client, tenantId)
  return limitFor(client, tenantId, tier ?? FALLBACK_TIER, key)
}

/** What `tenantLimitStrict` says when it could not work the answer out. */
export const UNKNOWN_LIMIT = 'unknown' as const

/**
 * The same answer, for a caller that must refuse rather than guess.
 *
 * `UNKNOWN_LIMIT` when any part of the lookup failed, so the caller can turn
 * somebody away and say "try again" instead of admitting them under a cap it
 * never actually read.
 *
 * This exists because the guest door needs the opposite posture from everything
 * else in this file. Everywhere else, a failed lookup lifting a cap costs a
 * seat an admin can see and correct. At that door it costs the cap itself:
 * admission is written with the service role and bypasses RLS, so that check is
 * the *only* thing enforcing the number - and a statement timeout or an
 * exhausted pool is exactly what a full event looks like from in there. The
 * failure mode and the attack are the same shape.
 *
 * Note it can only ever be *stricter* than `tenantLimit`, never more generous.
 * A caller wanting the soft answer should say so by calling the other one.
 */
export async function tenantLimitStrict(
  client: Client,
  tenantId: string,
  key: FlaggedLimitKey,
): Promise<Limit | typeof UNKNOWN_LIMIT> {
  const tier = await tierOf(client, tenantId)
  if (tier === null) return UNKNOWN_LIMIT

  const { data, error } = await client.rpc('tenant_feature_limit', {
    p_key: LIMIT_FLAGS[key],
    p_tenant_id: tenantId,
  })

  if (error) return UNKNOWN_LIMIT

  const rungs = toRungs(data?.[0])

  return resolveLimit({
    tier,
    key,
    override: rungs.hasOverride ? rungs.overrideValue : undefined,
    ceiling: rungs.ceilingValue,
  })
}

/**
 * How many free spaces the calling account may own.
 *
 * Its own function rather than a `key` on the one above, because it is the one
 * limit that is not about a space at all - `FREE_SPACES_PER_ACCOUNT` stands
 * where a tier would, and there is no tenant to pass. The underlying RPC takes
 * no user id on purpose: an arbitrary one would let anybody walk the account
 * table asking which accounts are comped.
 */
export async function freeSpaceLimit(supabase: Client): Promise<Limit> {
  const { data, error } = await supabase.rpc('account_feature_limit', {
    p_key: 'free_space_limit',
  })

  const rungs = error ? NO_RUNGS : toRungs(data?.[0])

  // The same rule as `resolveLimit`, spelled with the same primitives rather
  // than by hand: raise with the override, then clamp with the ceiling. It
  // cannot call `resolveLimit` itself because that reads a tier's table and
  // this limit has no tier - `FREE_SPACES_PER_ACCOUNT` stands in that slot.
  // Reusing `maxLimit`/`minLimit` is what keeps the two from drifting.
  const granted = rungs.hasOverride
    ? maxLimit(FREE_SPACES_PER_ACCOUNT, rungs.overrideValue)
    : FREE_SPACES_PER_ACCOUNT

  return minLimit(granted, rungs.ceilingValue)
}
