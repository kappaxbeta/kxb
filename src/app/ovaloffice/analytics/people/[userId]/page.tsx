import Link from 'next/link'
import { notFound } from 'next/navigation'
import { readProfile } from '@/domain/analytics/profiles'
import { byFrecency, frecencyShare } from '@/domain/analytics/frecency'
import { sectionLabel } from '@/domain/analytics/sections'
import { asRange } from '@/domain/analytics/queries'
import { requireBackofficeSection } from '@/lib/backoffice'
import { Breakdown, flagOf, lastSeenAt, Stat } from '../../parts'

export const dynamic = 'force-dynamic'

/**
 * One account's history.
 *
 * Answers "where are they most" twice over, because the two readings are both
 * useful and neither replaces the other: by section, which is what they do,
 * and by exact path, which is where they did it. Plus when in the day they
 * turn up, which is the closest thing to a timezone we have - the browser
 * never told us theirs, so the hours are UTC and labelled as such.
 */
export default async function PersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>
  searchParams: Promise<{ days?: string }>
}) {
  const [{ userId }, { days }] = await Promise.all([params, searchParams])
  const range = asRange(days)

  const { supabase } = await requireBackofficeSection('analytics')
  const profile = await readProfile(supabase, userId, range)

  // Nothing in the window and a non-existent account look the same on purpose:
  // in both cases there is no history to show, and which one it is is not a
  // question this page needs to answer.
  if (!profile) notFound()

  const { totals } = profile
  const peakHour = Math.max(1, ...profile.hours.map((h) => h.views))
  const peakDay = Math.max(1, ...profile.daily.map((d) => d.views))
  const busiest = profile.hours.reduce((a, b) => (b.views > a.views ? b : a), profile.hours[0])
  const ranked = byFrecency(profile.sections)

  return (
    <>
      <div className="mb-6">
        <Link
          href={`/ovaloffice/analytics/people?days=${range}`}
          className="text-xs text-muted-foreground transition hover:text-foreground"
        >
          ← People
        </Link>
        <h2 className="mt-2 text-lg font-semibold">{profile.username ?? 'no username'}</h2>
        <p className="mt-1 font-mono text-xs text-muted-foreground">{profile.userId}</p>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Page views" value={totals.views} hint={`in ${range}d`} />
        <Stat label="Active days" value={totals.activeDays} />
        <Stat
          label="First seen"
          value={totals.firstSeen ? new Date(totals.firstSeen).toLocaleDateString() : '—'}
        />
        <Stat
          label="Last seen"
          value={totals.lastSeen ? lastSeenAt(totals.lastSeen) : '—'}
        />
      </div>

      <section className="mb-8 rounded-lg border border-border bg-secondary p-4">
        <h3 className="mb-3 text-xs text-muted-foreground">Views per day</h3>
        <div className="flex h-24 items-end gap-[2px]">
          {profile.daily.map((day) => (
            <div
              key={day.day}
              title={`${day.day} — ${day.views} views`}
              className="flex-1 rounded-t bg-primary text-primary-foreground/70 transition hover:bg-primary text-primary-foreground"
              style={{ height: `${Math.max(2, (day.views / peakDay) * 100)}%` }}
            />
          ))}
        </div>
        {profile.daily.length > 0 && (
          <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
            <span>{profile.daily[0]?.day}</span>
            <span>{profile.daily[profile.daily.length - 1]?.day}</span>
          </div>
        )}
      </section>

      {/* 24 buckets, always all 24 - a histogram with the quiet hours left out
          draws somebody who only exists in the afternoon. */}
      <section className="mb-10 rounded-lg border border-border bg-secondary p-4">
        <h3 className="mb-1 text-xs text-muted-foreground">When they turn up</h3>
        <p className="mb-3 text-[11px] text-muted-foreground/70">
          Hour of day, UTC — the browser never sends its timezone.
          {busiest && busiest.views > 0 && (
            <> Busiest around {String(busiest.hour).padStart(2, '0')}:00.</>
          )}
        </p>
        <div className="flex h-20 items-end gap-[3px]">
          {profile.hours.map((hour) => (
            <div
              key={hour.hour}
              title={`${String(hour.hour).padStart(2, '0')}:00 — ${hour.views} views`}
              className="flex-1 rounded-t bg-primary text-primary-foreground/70 transition hover:bg-primary text-primary-foreground"
              style={{ height: `${Math.max(2, (hour.views / peakHour) * 100)}%` }}
            />
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
          <span>00:00</span>
          <span>12:00</span>
          <span>23:00</span>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Ranked by frecency rather than by count, so what they are into now
            sits above what they were into a month ago. The bar measures the
            score; the number stays the honest view count. */}
        <Breakdown
          title="Where they are most"
          head="Section"
          empty="Nothing in this window."
          note="By frecency — how much, weighted by how recently. Folded to the route, so one feature is one row across every workspace."
          rows={ranked.map((s) => ({
            key: s.section,
            label: sectionLabel(s.section),
            views: s.views,
            weight: frecencyShare(s, ranked),
            note: lastSeenAt(s.lastSeen),
          }))}
        />
        <Breakdown
          title="Exact pages"
          head="Path"
          empty="Nothing in this window."
          mono
          rows={profile.pages.map((p) => ({ key: p.path, label: p.path, views: p.views }))}
        />
        <Breakdown
          title="Where from"
          head="Country"
          empty="Nothing in this window."
          rows={profile.countries.map((c) => ({
            key: c.country,
            label: c.country === 'unknown' ? 'Unknown' : `${flagOf(c.country)} ${c.country}`,
            views: c.views,
          }))}
        />
        <Breakdown
          title="What they are on"
          head="Device"
          empty="Nothing in this window."
          rows={profile.devices.map((d) => ({ key: d.device, label: d.device, views: d.views }))}
        />
      </div>
    </>
  )
}
