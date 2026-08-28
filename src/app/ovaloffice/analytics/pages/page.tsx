import Link from 'next/link'
import { readFrequency } from '@/domain/analytics/frequency'
import { asSort, sortFrequency } from '@/domain/analytics/frequency-sort'
import { asRange } from '@/domain/analytics/queries'
import { requireBackofficeSection } from '@/lib/backoffice'
import { AnalyticsNav } from '../nav'
import { Stat } from '../parts'
import { PagesList } from './pages-list'

export const dynamic = 'force-dynamic'

/**
 * Pages.
 *
 * How often each page is opened, over four windows at once. The traffic tab's
 * top-30 answers "what is busiest right now"; this answers "how often is *this*
 * page opened, and is that going up or down", which needs the windows beside
 * each other on one row and needs the long tail rather than the head.
 *
 * The four counts are nested: a view in the last 24 hours is also in the week,
 * the month and the year. So a row reads straight across - Year is the total,
 * and each narrower column is the share of it that is recent. A page with
 * 400/0/0/0 across is dead; one with 400/380 is this week's news.
 *
 * The window buttons are hidden here because these columns *are* the windows -
 * a range selector on top of them would be a second, contradictory answer to
 * the same question.
 */
export default async function PagesPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; sort?: string; view?: string }>
}) {
  const { days, sort: rawSort, view } = await searchParams
  const range = asRange(days)
  const sort = asSort(rawSort)
  const folded = view !== 'paths'

  const { supabase } = await requireBackofficeSection('analytics')
  const report = await readFrequency(supabase)

  const rows = sortFrequency(folded ? report.sections : report.paths, sort)
  const truncated = !folded && report.distinctPaths > report.paths.length

  return (
    <>
      <AnalyticsNav
        view="pages"
        range={range}
        showRange={false}
        title="Pages"
        blurb="Every page and how often it is opened. The counts are nested — a view in the
               last 24 hours is also in the week, the month and the year — so Year is the
               total and each narrower column is the share of it that is recent."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Distinct paths" value={report.distinctPaths} hint="past year" />
        <Stat label="Routes" value={report.sections.length} hint="folded" />
        <Stat
          label="Views today"
          value={report.sections.reduce((sum, s) => sum + s.day, 0)}
          hint="24h"
        />
        <Stat
          label="Views this year"
          value={report.sections.reduce((sum, s) => sum + s.year, 0)}
        />
      </div>

      {/* Folded vs raw is the same choice the traffic tab makes between its two
          page tables, offered here as a switch because this one table is long
          enough that showing both would be two long tables. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border border-border p-1 text-sm">
          {[
            { key: 'sections', label: 'By route', on: folded },
            { key: 'paths', label: 'Every path', on: !folded },
          ].map((option) => (
            <Link
              key={option.key}
              href={`/ovaloffice/analytics/pages?view=${option.key}&sort=${sort}`}
              aria-current={option.on ? 'page' : undefined}
              className={`rounded px-3 py-1 transition ${
                option.on ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {option.label}
            </Link>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {rows.length} rows
          {truncated && ` of ${report.distinctPaths} — busiest 500 shown`}
        </p>
      </div>

      <PagesList rows={rows} folded={folded} sort={sort} />
    </>
  )
}
