import { readCtaClicks } from '@/domain/analytics/cta-report'
import { asRange } from '@/domain/analytics/queries'
import { requireBackofficeSection } from '@/lib/backoffice'
import { AnalyticsNav } from '../nav'
import { Breakdown, flagOf, Stat } from '../parts'

export const dynamic = 'force-dynamic'

/**
 * CTAs.
 *
 * Which buttons got pressed, from which page, and from which country - the
 * question the Traffic tab cannot answer, because looking and acting are
 * different things and only one of them is a `page_views` row.
 *
 * Country per click has only existed since the 20270131000000 migration, so a
 * window reaching back past it holds rows whose country is null forever. That
 * is called out on the page rather than left to look like a lot of unplaceable
 * addresses - see `withoutCountry`.
 *
 * One table per CTA rather than one big table with a country column: a reader
 * arrives asking about one button, and a single flat table forces them to scan
 * for its rows among everybody else's.
 */
export default async function CtasPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>
}) {
  const range = asRange((await searchParams).days)

  const { supabase } = await requireBackofficeSection('analytics')
  const report = await readCtaClicks(supabase, range)

  return (
    <>
      <AnalyticsNav
        view="ctas"
        range={range}
        title="CTAs"
        blurb="Every call to action that was clicked, where it was clicked from and where the
               person clicking was. Visitors are distinct per day, so somebody who came back
               on Tuesday is counted twice."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Clicks" value={report.clicks} hint={`past ${report.days} days`} />
        <Stat label="Buttons" value={report.ctas.length} hint="with at least one click" />
        <Stat label="Countries" value={report.countries.filter((c) => c.country).length} />
        <Stat label="No country" value={report.withoutCountry} hint="older rows, or unplaceable" />
      </div>

      {report.truncated && (
        <p className="mb-6 rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-muted-foreground">
          More clicks than one report reads. The numbers below are the most recent slice of the
          window, not its total.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Breakdown
          title="All CTAs"
          head="Button"
          rows={report.ctas.map((cta) => ({
            key: cta.id,
            label: cta.id,
            views: cta.clicks,
            visitors: cta.visitors,
          }))}
          empty="Nothing has been clicked in this window."
          mono
        />

        <Breakdown
          title="Countries"
          head="Country"
          rows={report.countries.map((row) => ({
            key: row.country ?? 'unknown',
            label: row.country ? `${flagOf(row.country)} ${row.country}` : 'Unknown',
            views: row.clicks,
          }))}
          empty="No clicks to place."
          note="Across every CTA. Resolved from the address offline; never sent anywhere."
        />

        {/*
          Then one pair per button. Capped at the five busiest of each, because
          the tail of a CTA's countries is a list of ones and the reader is
          looking for the shape.
        */}
        {report.ctas.map((cta) => (
          <div key={cta.id} className="grid gap-6 lg:col-span-2 lg:grid-cols-2">
            <Breakdown
              title={`${cta.id} — clicked from`}
              head="Page"
              rows={cta.paths.slice(0, 5).map((row) => ({
                key: row.path,
                label: row.path,
                views: row.clicks,
              }))}
              empty="Nowhere."
              mono
            />
            <Breakdown
              title={`${cta.id} — countries`}
              head="Country"
              rows={cta.countries.slice(0, 5).map((row) => ({
                key: row.country ?? 'unknown',
                label: row.country ? `${flagOf(row.country)} ${row.country}` : 'Unknown',
                views: row.clicks,
              }))}
              empty="Nowhere."
            />
          </div>
        ))}
      </div>
    </>
  )
}
