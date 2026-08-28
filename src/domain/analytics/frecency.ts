/**
 * Frecency: frequency weighted by recency.
 *
 * "Where is this person most" is badly answered by a raw view count. A section
 * somebody lived in three weeks ago and has not opened since outranks the one
 * they were in this morning, and the list then describes their past. Ranking by
 * recency alone is the opposite mistake - one idle click yesterday beats a
 * habit of months.
 *
 * So a view is worth more the more recently it happened, and the weights below
 * are the whole rule. They live in TypeScript rather than in the SQL that
 * counts, because unlike a count this is a judgement someone will want to argue
 * with, and an argument is easier against a function with tests than against a
 * number embedded in an aggregate.
 *
 * The buckets arrive nested from `visitor_profile()` - a view today is also in
 * this week's count and this month's - which is what makes the weighting
 * cumulative: today's view scores 8 (1 + 2 + 2 + 3), a view from five days ago
 * scores 5, one from three weeks ago 3, and anything older 1. No decay curve,
 * no half-life to tune; four numbers you can hold in your head and defend.
 */

/** What the ranking needs. A superset of it is fine. */
export interface FrecencyInput {
  /** Every view in the window. */
  views: number
  /** Of those, in the last 24 hours. */
  today: number
  /** Of those, in the last 7 days. Includes `today`. */
  thisWeek: number
  /** Of those, in the last 30 days. Includes `thisWeek`. */
  thisMonth: number
}

/**
 * The weights, as bonuses stacked on top of every view's base worth of 1.
 *
 * Exported so a test can restate the arithmetic rather than hard-code totals
 * that stop meaning anything the moment somebody retunes this.
 */
export const WEIGHTS = { base: 1, month: 2, week: 2, today: 3 } as const

/** The score. Higher is more present in this person's life right now. */
export function frecency(input: FrecencyInput): number {
  return (
    input.views * WEIGHTS.base +
    input.thisMonth * WEIGHTS.month +
    input.thisWeek * WEIGHTS.week +
    input.today * WEIGHTS.today
  )
}

/**
 * The same list, most present first.
 *
 * A copy rather than a sort in place: the caller got its array from a server
 * component's props, and reordering someone else's array is how a list ends up
 * in a different order than the thing that rendered it expected.
 *
 * Ties break on raw views, so two sections last opened in the same bucket are
 * ordered by how much they were actually used.
 */
export function byFrecency<T extends FrecencyInput>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => frecency(b) - frecency(a) || b.views - a.views)
}

/**
 * The score as a share of the strongest in the list, 0-1.
 *
 * The absolute number is meaningless on its own - it has no unit and its range
 * depends on how busy the account is - so nothing renders it. What a bar can
 * honestly show is the comparison, which is all this is for.
 */
export function frecencyShare(row: FrecencyInput, rows: readonly FrecencyInput[]): number {
  const peak = Math.max(1, ...rows.map(frecency))
  return frecency(row) / peak
}
