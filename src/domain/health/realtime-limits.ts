/**
 * What the Realtime ceilings are supposed to be, and whether they still are.
 *
 * No 'server-only': the numbers are not secret and the drift comparison is pure,
 * which is what lets it be unit-tested. `readRealtimeLimits` needs an admin
 * client and is guarded by the RPC itself.
 *
 * ---------------------------------------------------------------------------
 * This file is the source of truth for the numbers
 * ---------------------------------------------------------------------------
 * `scripts/realtime-limits.sh` is what *applies* them, but it reads its
 * defaults from here via `scripts/realtime-limits-env.ts` rather than carrying
 * its own copy. That indirection exists for one reason: this whole feature is
 * about catching drift, and a checker that keeps its expectations in a second
 * place is a checker that eventually disagrees with the setter and reports a
 * problem that is really a typo.
 *
 * So: change a number here, run the script, and the page agrees by
 * construction. See docs/operations/realtime-limits.md for why each value is
 * what it is - the reasoning lives there, not in this file, because it is
 * several paragraphs per number.
 */

export interface RealtimeLimits {
  maxEventsPerSecond: number
  maxConcurrentUsers: number
  maxBytesPerSecond: number
  maxJoinsPerSecond: number
  maxChannelsPerClient: number
}

/**
 * Sized for ~1 000 spaces at ~500 concurrent players, against a measured
 * hardware ceiling near 63 000 messages/s.
 *
 * Every one is a circuit breaker rather than a capacity dial - raising one does
 * not make the box faster, it changes what happens when the box is asked for
 * more than it has. Realtime shares six cores with Postgres, Kong and GoTrue,
 * so an unbounded Realtime is an outage of login and the database.
 */
export const EXPECTED_REALTIME_LIMITS: RealtimeLimits = {
  maxEventsPerSecond: 25_000,
  maxConcurrentUsers: 10_000,
  maxBytesPerSecond: 25_000_000,
  maxJoinsPerSecond: 2_000,
  maxChannelsPerClient: 500,
}

/** Human labels, in the order the page shows them. */
export const LIMIT_LABELS: Record<keyof RealtimeLimits, string> = {
  maxEventsPerSecond: 'Events/s',
  maxConcurrentUsers: 'Connections',
  maxBytesPerSecond: 'Bytes/s',
  maxJoinsPerSecond: 'Joins/s',
  maxChannelsPerClient: 'Channels/client',
}

export const LIMIT_KEYS = Object.keys(LIMIT_LABELS) as (keyof RealtimeLimits)[]

export interface RealtimeTenantLimits extends RealtimeLimits {
  externalId: string
  /**
   * Weaker evidence than it looks - see the migration. No trigger writes it, so
   * applying new values does not move it. It is worth showing anyway because
   * the seed revert this exists to catch is a delete+insert, which does stamp a
   * fresh one.
   */
  updatedAt: string | null
}

export interface LimitDrift {
  key: keyof RealtimeLimits
  label: string
  expected: number
  actual: number
  /**
   * Below what we set is the dangerous direction and the one the seed produces.
   * Above is somebody having deliberately raised it on the box and not here,
   * which is worth surfacing but is not an incident.
   */
  lower: boolean
}

/**
 * Which limits no longer read as they were set.
 *
 * Returns [] for a healthy row. A tenant that cannot be read at all is not
 * "no drift" - it is unknown - so that case is `null` from the reader and the
 * page distinguishes the two. Conflating them would make a missing tenant row,
 * which is the worst state available, render as green.
 */
export function realtimeLimitDrift(
  actual: RealtimeLimits,
  expected: RealtimeLimits = EXPECTED_REALTIME_LIMITS,
): LimitDrift[] {
  return LIMIT_KEYS.flatMap((key) =>
    actual[key] === expected[key]
      ? []
      : [
          {
            key,
            label: LIMIT_LABELS[key],
            expected: expected[key],
            actual: actual[key],
            lower: actual[key] < expected[key],
          },
        ],
  )
}

/**
 * The signature of the seed having run: everything at once, and everything low.
 *
 * Worth telling apart from ordinary drift because the remedy differs. One value
 * off is somebody tuning on the box; every value off and below is
 * `SEED_SELF_HOST` having come back true, and the fix is a compose file rather
 * than an UPDATE - the UPDATE would hold only until the next restart.
 */
export function looksLikeSeedRevert(drift: LimitDrift[]): boolean {
  return drift.length === LIMIT_KEYS.length && drift.every((d) => d.lower)
}
