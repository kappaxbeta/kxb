import { parseXpRef } from '@/domain/xps/ref'

/**
 * A session that ended, on its way into `xp_sessions`.
 *
 * docs/xp/creator.md §18.6. The fund is an idea; this is the one part of it
 * that has to exist now, because play that nobody wrote down cannot be
 * reconstructed later. Everything §18 argues about - pro-rata against
 * user-centric, the 60-second floor, the per-member cap, whether a *version*
 * earns or a *world* does - is a query over the rows this produces, and none of
 * it is decided here. That separation is the reason to store the raw session
 * rather than an accrual: changing the rule is rewriting a query, not migrating
 * a table.
 *
 * ---------------------------------------------------------------------------
 * Pure, because the interesting half is the refusals
 * ---------------------------------------------------------------------------
 * The route around this is four lines - read the cookie, shape the row, insert
 * it. Everything worth being sure of is in `sessionFrom`: what a browser is
 * allowed to claim about how long it played, which strings name a world, and
 * which of the three outcomes it can have had. A beacon endpoint is an
 * unauthenticated-shaped surface even when there is a session behind it, and
 * the only defence that can be tested without a database is this one.
 *
 * ---------------------------------------------------------------------------
 * What the browser is never asked
 * ---------------------------------------------------------------------------
 * **Who played.** The account comes from the request's own cookie, never from
 * the body, because the one thing a forged beacon would want is to attribute
 * play to somebody else - under §18.2's user-centric split, that is somebody
 * else's €3 being spent. `sessionFrom` takes the account as an argument for
 * exactly this reason: there is no field for it to arrive in.
 */

/** §18.6's three, and no others. The check constraint holds the same list. */
export const SESSION_OUTCOMES = ['finished', 'left', 'disconnected'] as const

export type SessionOutcome = (typeof SESSION_OUTCOMES)[number]

/**
 * The shortest thing that is a session at all.
 *
 * Not §18.3's floor, which is 60 seconds and belongs to the payout: that one
 * decides whether a session *earns*, and it is applied by whichever query
 * eventually computes a balance, over rows that are all present. This one
 * decides whether something was a session, and it is much lower on purpose - a
 * world that failed to load and was closed, or a mis-click into a room and
 * straight back out, is not play, and a table full of those is a table whose
 * counts mean less than they appear to.
 */
export const MIN_SESSION_SECONDS = 1

/** A day. Past this the number is not a session; see the column's own comment. */
export const MAX_SESSION_SECONDS = 86_400

/** The column's ceiling for an instance, restated so this cannot outgrow it. */
const MAX_INSTANCE = 128

/** What the browser posts when a level closes behind somebody. */
export interface PlayedSession {
  /** As `domain/xps/ref.ts` spells it: `sidestep`, or `p-<uuid>-v3`. */
  ref: string
  /** The room or match it was played in, when there was one. */
  instance?: string | null
  /** ISO, from the browser that was playing. */
  startedAt: string
  seconds: number
  outcome: SessionOutcome
}

/** One row of `xp_sessions`, named the way the table is. */
export interface XpSessionRow {
  xp_ref: string
  account_id: string | null
  instance: string | null
  started_at: string
  seconds: number
  outcome: SessionOutcome
}

/**
 * A reported session as a row, or `null` for one not worth keeping.
 *
 * `null` rather than a thrown error or a list of problems, because the only
 * caller is a beacon: there is nobody to tell. A refusal here and a successful
 * write look identical from the browser, which is what keeps a failing ledger
 * from being visible in the game it is measuring.
 */
export function sessionFrom(
  reported: PlayedSession,
  accountId: string | null,
): XpSessionRow | null {
  /**
   * A reference the rest of the codebase would recognise, or nothing.
   *
   * Through `parseXpRef` rather than against the column's regex, even though
   * the column has one: the regex says what fits, and this says what *means*
   * something. A row naming a world nobody can resolve is a row no payout can
   * ever be attributed to, and it would sit in the table looking like usage.
   */
  if (typeof reported.ref !== 'string' || !parseXpRef(reported.ref)) return null

  const outcome = reported.outcome
  if (!SESSION_OUTCOMES.includes(outcome)) return null

  const seconds = Math.floor(reported.seconds)
  if (!Number.isFinite(seconds)) return null
  if (seconds < MIN_SESSION_SECONDS || seconds > MAX_SESSION_SECONDS) return null

  /**
   * A start the database will accept, normalised here rather than passed on.
   *
   * The browser's own clock, so it can be wrong - and it is kept anyway,
   * because the pair of it and `seconds` is what tells a later reader that a
   * client was lying. What it may not be is unparseable: that is the one shape
   * that would fail at the boundary rather than in the data.
   */
  const startedAt = new Date(reported.startedAt)
  if (Number.isNaN(startedAt.getTime())) return null

  /**
   * A silly instance loses the instance, not the session.
   *
   * Where it was played is worth having and is not the fact being recorded.
   * Refusing the whole row over a field that only sharpens attribution would
   * throw away the play to punish the label.
   */
  const instance =
    typeof reported.instance === 'string' &&
    reported.instance.length > 0 &&
    reported.instance.length <= MAX_INSTANCE
      ? reported.instance
      : null

  return {
    xp_ref: reported.ref,
    account_id: accountId,
    instance,
    started_at: startedAt.toISOString(),
    seconds,
    outcome,
  }
}

/**
 * How long a session lasted, in whole seconds.
 *
 * From two `performance.now()` readings rather than two `Date` ones, which is
 * the same choice `localHost` makes about its clock and for the same reason: a
 * monotonic clock does not move when the system clock is corrected, and a
 * session that appears to have lasted negative four hours because NTP stepped
 * is one somebody has to explain later.
 *
 * Never negative, so a caller that hands them over the wrong way round writes a
 * zero instead of something the check constraint will reject.
 */
export function elapsedSeconds(fromMs: number, toMs: number): number {
  return Math.max(0, Math.floor((toMs - fromMs) / 1000))
}
