import type { DomainEvent } from '@/es/types'

/**
 * The login-streak aggregate's events.
 *
 * There is exactly one: a member showed up on a given UTC day. The stream is
 * one per (space, member), so the fact needs no subject beyond the day.
 *
 * ---------------------------------------------------------------------------
 * Why the event carries the streak it reached, not just the day
 * ---------------------------------------------------------------------------
 * A streak is a fold over an ordered history - "how many days in a row up to
 * here" is only knowable by walking every earlier day. A projection sees one
 * event at a time and must be idempotent under replay, so it cannot count. The
 * two honest ways out are to recompute the whole run from source rows on every
 * event (what `recount_battle_scores` does in SQL for a set-based count), or to
 * have the one place that *does* hold the folded history - the decider - record
 * the number it reached. This takes the second: `DayVisited` is a snapshot of
 * the run as of that day, so the read model is a plain assignment and a replay
 * lands on the same values.
 *
 * These numbers are a fact *about that day*. If the streak rules ever change,
 * old events keep the heights they recorded, which is correct - that is what
 * the streak was, then. The decider folds them straight back (see aggregate.ts)
 * and builds the next day on top.
 */

export type DayVisited = DomainEvent<
  'DayVisited',
  {
    /** The UTC calendar day, `YYYY-MM-DD`. See days.ts for why UTC. */
    day: string
    /** The consecutive-day run this visit reached. */
    streak: number
    /** The best run ever, as of this visit. */
    longest: number
    /** Distinct days seen ever, as of this visit. */
    total: number
  }
>

export type StreakEvent = DayVisited

export const STREAK_STREAM_TYPE = 'login_streak'

/** Human-readable labels for the event log viewer. */
export const STREAK_EVENT_LABELS: Record<StreakEvent['type'], string> = {
  DayVisited: 'showed up',
}
