/**
 * The pieces both analytics surfaces draw with.
 *
 * Extracted from the traffic page when People was added, unchanged - a stat
 * tile and a ranked table are the whole visual vocabulary here, and two
 * divergent copies of them is how a section starts looking like a different
 * product.
 */

export interface Row {
  key: string
  label: string
  views: number
  /** Omitted where the count is meaningless - one account is one person. */
  visitors?: number
  /** Optional right-hand annotation, e.g. when it was last seen. */
  note?: string
  /**
   * What the bar behind the row measures, 0-1, when that is not the view
   * count. The frecency list needs it: its rows are ordered by a score, and a
   * bar drawn from `views` would then shrink and grow down the column at
   * random, which reads as a rendering bug rather than as a second dimension.
   */
  weight?: number
}

/**
 * One breakdown table.
 *
 * The bar is drawn behind the row rather than in its own column: the point of
 * these tables is the ranking, and a proportional background reads at a glance
 * without spending width on a chart.
 */
export function Breakdown({
  title,
  head,
  rows,
  empty,
  note,
  mono,
}: {
  title: string
  head: string
  rows: Row[]
  empty: string
  note?: string
  mono?: boolean
}) {
  const peak = Math.max(1, ...rows.map((r) => r.views))
  const hasVisitors = rows.some((r) => r.visitors !== undefined)

  return (
    <section>
      <h3 className="mb-1 text-sm font-semibold">{title}</h3>
      {note && <p className="mb-2 text-xs text-muted-foreground">{note}</p>}

      <div className="overflow-hidden rounded-lg border border-border">
        <div className="flex justify-between bg-secondary px-3 py-2 text-xs text-muted-foreground">
          <span>{head}</span>
          <span className="flex gap-6">
            {hasVisitors && <span>Visitors</span>}
            <span>Views</span>
          </span>
        </div>

        {rows.map((row) => (
          <div
            key={row.key}
            className="relative flex items-center justify-between border-t border-border px-3 py-2 text-sm"
          >
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 bg-primary text-primary-foreground/10"
              style={{ width: `${(row.weight ?? row.views / peak) * 100}%` }}
            />
            <span className={`relative truncate pr-3 ${mono ? 'font-mono text-xs' : ''}`}>
              {row.label}
              {row.note && <span className="ml-2 text-xs text-muted-foreground">{row.note}</span>}
            </span>
            <span className="relative flex shrink-0 gap-6 tabular-nums">
              {hasVisitors && (
                <span className="w-14 text-right text-muted-foreground">{row.visitors ?? ''}</span>
              )}
              <span className="w-12 text-right">{row.views}</span>
            </span>
          </div>
        ))}

        {rows.length === 0 && (
          <p className="border-t border-border px-3 py-6 text-center text-sm text-muted-foreground">
            {empty}
          </p>
        )}
      </div>
    </section>
  )
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string
  value: number | string
  hint?: string
}) {
  return (
    <div className="rounded-lg border border-border bg-secondary px-4 py-3">
      <p className="text-xs text-muted-foreground">
        {label}
        {hint && <span className="ml-1 text-muted-foreground/70">({hint})</span>}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}

/**
 * A "last seen" stamp, to the minute.
 *
 * The date alone answers "did they come back this week"; the time answers "are
 * they in there right now", which is the question you actually have when you
 * are looking at somebody's row. First seen keeps the date on its own - the
 * minute an account first appeared is trivia.
 */
export function lastSeenAt(when: string): string {
  return new Date(when).toLocaleString(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

/** DE -> 🇩🇪. The regional indicator block sits 0x1F1A5 above ASCII capitals. */
export function flagOf(country: string): string {
  if (!/^[A-Z]{2}$/.test(country)) return ''
  return String.fromCodePoint(...[...country].map((c) => c.charCodeAt(0) + 0x1f1a5))
}
