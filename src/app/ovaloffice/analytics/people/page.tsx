import { readProfiles } from '@/domain/analytics/profiles'
import { asRange } from '@/domain/analytics/queries'
import { requireBackofficeSection } from '@/lib/backoffice'
import { AnalyticsNav } from '../nav'
import { Stat } from '../parts'
import { PeopleList } from './people-list'

export const dynamic = 'force-dynamic'

/**
 * People.
 *
 * Accounts that were signed in while they browsed, busiest first. This is the
 * one analytics surface that is about individuals, and it can only exist for
 * accounts: an anonymous visitor's hash rotates at midnight, so there is no
 * history to line up. Nothing here is derived from an address.
 *
 * Ordered by active days rather than views, because ten visits on ten days is
 * a habit and ten visits in one afternoon is a single session.
 */
export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>
}) {
  const { days } = await searchParams
  const range = asRange(days)

  const { supabase } = await requireBackofficeSection('analytics')
  const list = await readProfiles(supabase, range)
  const { kpis } = list

  return (
    <>
      <AnalyticsNav
        view="people"
        range={range}
        title="People"
        blurb="Signed-in accounts only, ranked by the days they showed up on. Anonymous
               visitors cannot appear here - their identifier is thrown away nightly,
               so there is nothing to follow."
      />

      {/* Fixed windows, deliberately unmoved by the selector above: an MAU that
          changed when you clicked 7d could not be compared to last month's. */}
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Daily active" value={kpis.dau} hint="24h" />
        <Stat label="Weekly active" value={kpis.wau} hint="7d" />
        <Stat label="Monthly active" value={kpis.mau} hint="30d" />
        {/* DAU/MAU: of the people who used it this month, how many were here
            today. The standard read is that above ~20% it is a daily habit. */}
        <Stat
          label="Stickiness"
          value={kpis.mau ? `${Math.round((kpis.dau / kpis.mau) * 100)}%` : '—'}
          hint="DAU/MAU"
        />
      </div>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="New" value={kpis.newThisMonth} hint="first seen, 30d" />
        <Stat label="Ever seen" value={kpis.everSeen} hint="all time" />
        <Stat label="In this window" value={list.totals.accounts} hint={`${range}d`} />
        <Stat
          label="Views each"
          value={
            list.totals.accounts
              ? Math.round(list.totals.views / list.totals.accounts)
              : 0
          }
          hint="average"
        />
      </div>

      <PeopleList rows={list.accounts} range={range} />
    </>
  )
}
