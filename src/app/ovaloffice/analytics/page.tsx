import { asRange, readAnalytics } from '@/domain/analytics/queries'
import { sectionLabel } from '@/domain/analytics/sections'
import { BUILT_ON as geoTableBuiltOn } from '@/domain/analytics/geo-built-on'
import { requireBackofficeSection } from '@/lib/backoffice'
import { AnalyticsNav } from './nav'
import { Breakdown, flagOf, Stat } from './parts'

export const dynamic = 'force-dynamic'

/**
 * Traffic.
 *
 * From the cookieless counter in the root layout: how many people came, where
 * from, and which pages they opened. Everything is derived from the
 * `page_views` table, and nothing in it can name a person - see the migration.
 * The People tab beside this one is the exception, and only for accounts that
 * were signed in.
 */
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>
}) {
  const { days } = await searchParams
  const range = asRange(days)

  const { supabase } = await requireBackofficeSection('analytics')
  const report = await readAnalytics(supabase, range)

  const { totals } = report
  const peak = Math.max(1, ...report.daily.map((d) => d.views))

  return (
    <>
      <AnalyticsNav
        view="traffic"
        range={range}
        title="Visitors"
        blurb="Cookieless and anonymous: a visitor is a salted hash that changes at
               midnight UTC, so nobody can be followed from one day to the next."
      />

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Visitors" value={totals.visitors} hint="unique per day" />
        <Stat label="Page views" value={totals.views} />
        <Stat label="Signed in" value={totals.signedIn} hint="of those views" />
        <Stat label="Accounts" value={totals.accounts} hint="behind them" />
        <Stat label="Bots" value={totals.bots} hint="excluded above" />
      </div>

      {/* The shape of the window. A bar per day, empty days included, so a
          quiet week looks quiet rather than being compressed away. */}
      <section className="mb-10 rounded-lg border border-border bg-secondary p-4">
        <h3 className="mb-3 text-xs text-muted-foreground">Views per day</h3>
        <div className="flex h-28 items-end gap-[2px]">
          {report.daily.map((day) => (
            <div
              key={day.day}
              title={`${day.day} — ${day.views} views, ${day.visitors} visitors`}
              className="flex-1 rounded-t bg-primary text-primary-foreground/70 transition hover:bg-primary text-primary-foreground"
              style={{ height: `${Math.max(2, (day.views / peak) * 100)}%` }}
            />
          ))}
        </div>
        {report.daily.length > 0 && (
          <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
            <span>{report.daily[0]?.day}</span>
            <span>{report.daily[report.daily.length - 1]?.day}</span>
          </div>
        )}
      </section>

      <div className="mb-10 grid gap-6 lg:grid-cols-2">
        <Breakdown
          title="Where they came from"
          head="Source"
          empty="No traffic yet."
          rows={report.sources.map((s) => ({
            key: s.source,
            label: s.source === 'direct' ? 'Direct / bookmark' : s.source,
            views: s.views,
            visitors: s.visitors,
          }))}
        />
        {/* Sections before paths: every real surface lives under a workspace
            slug, so the raw list answers "which workspace is busy" and this one
            answers "which part of the product gets used". */}
        <Breakdown
          title="Which parts they use"
          head="Section"
          empty="No traffic yet."
          note="Paths folded to their route, so one feature is one row across every workspace."
          rows={report.sections.map((s) => ({
            key: s.section,
            label: sectionLabel(s.section),
            views: s.views,
            visitors: s.visitors,
          }))}
        />
        <Breakdown
          title="Which pages they open"
          head="Path"
          empty="No page views yet."
          mono
          rows={report.pages.map((p) => ({
            key: p.path,
            label: p.path,
            views: p.views,
            visitors: p.visitors,
          }))}
        />
        <Breakdown
          title="Where they are"
          head="Country"
          empty="No traffic yet."
          note={`Resolved on this box from a registry table built ${geoTableBuiltOn}, or from the proxy when one says. Registration country, not a location.`}
          rows={report.countries.map((c) => ({
            key: c.country,
            label:
              c.country === 'unknown'
                ? `Unknown${c.language ? ` (${c.language})` : ''}`
                : `${flagOf(c.country)} ${c.country}`,
            views: c.views,
            visitors: c.visitors,
          }))}
        />
        <Breakdown
          title="What they are on"
          head="Device"
          empty="No traffic yet."
          rows={report.devices.map((d) => ({
            key: d.device,
            label: d.device,
            views: d.views,
            visitors: d.visitors,
          }))}
        />
      </div>

      <section className="mb-10">
        <h3 className="mb-3 text-sm font-semibold">Latest hits</h3>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Page</th>
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 font-medium">Country</th>
                <th className="px-3 py-2 font-medium">Device</th>
              </tr>
            </thead>
            <tbody>
              {report.recent.map((hit, i) => (
                <tr key={`${hit.at}-${i}`} className="border-t border-border">
                  <td className="px-3 py-2 text-muted-foreground">
                    {new Date(hit.at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {hit.path}
                    {hit.signedIn && (
                      <span className="ml-2 rounded bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        signed in
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {hit.source === 'direct' ? '—' : hit.source}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {hit.country ? `${flagOf(hit.country)} ${hit.country}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{hit.device}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {report.recent.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Nothing recorded in the last {range} days.
            </p>
          )}
        </div>
      </section>
    </>
  )
}
