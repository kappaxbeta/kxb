/**
 * The calendar arithmetic a streak is built on, and nothing else.
 *
 * Pure and free of any storage or React concern, because three different layers
 * need the same answer and must not disagree about it: the decider counts
 * consecutive days with it, the layout stamps "today" with it, and the read
 * side asks whether a run has gone cold with it. One definition of "a day" or
 * they drift, and a streak that counts differently in two places is worse than
 * no streak.
 *
 * A day is a **UTC calendar day**, written `YYYY-MM-DD`. UTC rather than the
 * viewer's zone on purpose: the streak is a fact in the event log, shared by a
 * whole space across whatever zones its members are in, and a boundary that
 * moved with the reader would let one person's midnight break another's run.
 */

/** The UTC day a moment falls in, as `YYYY-MM-DD`. */
export function utcDay(at: Date): string {
  return at.toISOString().slice(0, 10)
}

/**
 * A day as a count of whole days since the epoch.
 *
 * The only thing the streak math needs is "are these two days adjacent", which
 * is a subtraction once each day is a number. Parsed as UTC midnight so no zone
 * or daylight-saving hour can shift a date across a boundary - `YYYY-MM-DD` is
 * exactly what `Date.parse` reads as UTC.
 */
export function dayNumber(day: string): number {
  return Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000)
}

/** How many days lie between two days. Positive when `b` is after `a`. */
export function daysBetween(a: string, b: string): number {
  return dayNumber(b) - dayNumber(a)
}

/**
 * Is a run whose last day was `lastDay` still alive as of `today`?
 *
 * Alive means it can still be extended: seen today, or seen yesterday and not
 * yet today. Any older and the run is broken - the next visit starts again at
 * one. This is the read-time rule the read model deliberately does not bake in;
 * see the migration.
 */
export function streakAlive(lastDay: string, today: string): boolean {
  const gap = daysBetween(lastDay, today)
  return gap === 0 || gap === 1
}

/**
 * The streak worth *showing* for a stored run, given today.
 *
 * The stored `current` is the run as of `last_day`; once that has gone cold the
 * honest number to put in front of somebody is zero, not the stale height it
 * reached last week. A live run shows its stored height unchanged.
 */
export function liveStreak(current: number, lastDay: string, today: string): number {
  return streakAlive(lastDay, today) ? current : 0
}
