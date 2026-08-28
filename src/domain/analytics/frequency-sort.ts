/**
 * Ordering for the frequency table.
 *
 * Its own module, and pure, for the reason `sections.ts` is: `frequency.ts`
 * holds the reads and is `server-only`, and a comparator does not need a
 * database to be worth testing. The type comes across as `import type`, which
 * is erased at compile time and so does not drag the server module with it.
 *
 * The column lives in the URL rather than in client state, like every other
 * control in the backoffice - a table sorted by "this week" should be a link
 * you can send someone, and it keeps the sort working without JavaScript.
 */
import type { Frequency } from './frequency'

/**
 * The sortable columns, in the order the table lays them out.
 *
 * The header row is rendered straight from this array, so the order here *is*
 * the column order on screen and the two cannot drift apart.
 */
export const SORTS = ['path', 'day', 'week', 'month', 'year', 'visitors', 'lastSeen'] as const
export type Sort = (typeof SORTS)[number]

/** Anything else falls back to the year, which is the total. */
export function asSort(raw: string | undefined): Sort {
  return (SORTS as readonly string[]).includes(raw ?? '') ? (raw as Sort) : 'year'
}

export const SORT_LABELS: Record<Sort, string> = {
  day: '24h',
  week: 'Week',
  month: 'Month',
  year: 'Year',
  visitors: 'Visitors',
  lastSeen: 'Last seen',
  path: 'Page',
}

/**
 * The rows, ordered by one column.
 *
 * Descending for every count and for the timestamp, because "most" and "most
 * recent" are what you are looking for in each; only the path sorts ascending,
 * where alphabetical is the point. Ties fall back to the year total, so rows
 * that are equal on a narrow column still come out in a stable, sensible order
 * rather than in whatever order the database happened to return.
 *
 * A copy, never a sort in place - the caller's array came from a server
 * component's props.
 */
export function sortFrequency<T extends Frequency>(rows: readonly T[], sort: Sort): T[] {
  return [...rows].sort((a, b) => {
    if (sort === 'path') {
      return (a.path ?? a.section).localeCompare(b.path ?? b.section)
    }
    if (sort === 'lastSeen') {
      return (
        new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime() || b.year - a.year
      )
    }
    return b[sort] - a[sort] || b.year - a.year
  })
}
