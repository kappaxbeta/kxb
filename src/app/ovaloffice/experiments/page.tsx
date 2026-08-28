import { cookies } from 'next/headers'
import Link from 'next/link'
import { asRange, rangeLabel, RANGES } from '@/domain/analytics/queries'
import {
  formatRate,
  MINIMUM_VIEWS_PER_ARM,
  readExperiments,
} from '@/domain/analytics/experiment-report'
import { PIN_COOKIE, pinnedArm } from '@/domain/analytics/pin'
import { requireBackofficeSection } from '@/lib/backoffice'
import { ArmPin } from './arm-pin'

export const dynamic = 'force-dynamic'

/**
 * What is being tested, and whether it has decided anything yet.
 *
 * ---------------------------------------------------------------------------
 * The page is mostly about refusing to answer
 * ---------------------------------------------------------------------------
 * An A/B report's failure mode is not a wrong number, it is a right number read
 * too early: two arms forty visits in will always differ, and the difference is
 * noise every time. So the leader is withheld until every arm has cleared a
 * floor, and until then the page says so in the place a reader looks for the
 * answer rather than in a footnote under it.
 *
 * The floor is a fixed count rather than a significance test on purpose - see
 * the note on `ExperimentResult.enough`.
 *
 * ---------------------------------------------------------------------------
 * Two numbers that are not the same, and are not interchangeable
 * ---------------------------------------------------------------------------
 * `views` is well-defined and is what every rate divides by. `visitorDays` is
 * distinct visitors *per day*, summed, because the visitor hash rotates at
 * midnight and no query can join Monday's hash to Tuesday's - so somebody who
 * came twice counts twice. The column is labelled "visitor-days" rather than
 * "visitors" for exactly that reason: the honest name is the ugly one.
 */
export default async function ExperimentsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>
}) {
  const { days } = await searchParams
  const range = asRange(days)

  const { supabase } = await requireBackofficeSection('experiments')
  const [results, jar] = await Promise.all([readExperiments(supabase, range), cookies()])
  const pinValue = jar.get(PIN_COOKIE)?.value ?? null

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Experiments</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Arms are drawn per visit rather than per visitor — there is no cookie holding a
            bucket, so somebody who comes back may see the other one. Read these as “of the
            visits that saw A, what share clicked”, never as “how many people preferred A”.
          </p>
        </div>
        <nav className="flex gap-1 text-sm">
          {RANGES.map((option) => (
            <Link
              key={option}
              href={`/ovaloffice/experiments?days=${option}`}
              className={`rounded-lg px-2.5 py-1 transition ${
                option === range
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              {rangeLabel(option)}
            </Link>
          ))}
        </nav>
      </header>

      {results.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nothing is under test. Experiments are declared in{' '}
          <code className="font-mono text-xs">domain/analytics/experiment.ts</code>.
        </p>
      )}

      {results.map(({ experiment, arms, leader, enough }) => (
        <section key={experiment.id} className="rounded-xl border border-border bg-card">
          <header className="border-b border-border px-5 py-4">
            <h2 className="font-medium">{experiment.question}</h2>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">{experiment.id}</p>
          </header>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-2 font-medium">Arm</th>
                <th className="px-5 py-2 text-right font-medium">Views</th>
                {/* Named for what it is. See the header note. */}
                <th className="px-5 py-2 text-right font-medium" title="Distinct visitors per day, summed. Somebody who came on two days counts twice.">
                  Visitor-days
                </th>
                <th className="px-5 py-2 text-right font-medium">Clicked through</th>
                <th className="px-5 py-2 text-right font-medium">Rate</th>
                <th className="px-5 py-2 text-right font-medium">Preview</th>
              </tr>
            </thead>
            <tbody>
              {arms.map((arm) => (
                <tr key={arm.id} className="border-b border-border/60 last:border-0">
                  <td className="px-5 py-3">
                    <span className="font-mono text-xs text-muted-foreground">{arm.id}</span>
                    <span className="ml-2">{arm.label}</span>
                    {leader === arm.id && (
                      <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-400">
                        ahead
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">{arm.views.toLocaleString()}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">
                    {arm.visitorDays.toLocaleString()}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {arm.conversions.toLocaleString()}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">{formatRate(arm.rate)}</td>
                  <td className="px-5 py-3 text-right">
                    <ArmPin
                      experimentId={experiment.id}
                      armId={arm.id}
                      pinned={pinnedArm(pinValue, experiment.id) === arm.id}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <footer className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
            {enough ? (
              <>Both arms have cleared {MINIMUM_VIEWS_PER_ARM.toLocaleString()} views.</>
            ) : (
              <>
                Not enough traffic to call it. Every arm needs{' '}
                {MINIMUM_VIEWS_PER_ARM.toLocaleString()} views before a leader is named — two arms a
                few dozen visits in always differ, and the difference is noise every time.
              </>
            )}
          </footer>
        </section>
      ))}

      <p className="text-xs text-muted-foreground">
        “Preview” sets a cookie so you keep seeing one arm while you review it. It is set only
        here, only for a signed-in admin, and ordinary visitors never receive one — the banner
        promises essential cookies only and that promise is not being bent for a layout test.
      </p>
    </div>
  )
}
