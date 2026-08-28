import Link from 'next/link'
import { formatShare, readFunnels } from '@/domain/analytics/funnel-report'
import { asRange, rangeLabel, RANGES } from '@/domain/analytics/queries'
import { requireBackofficeSection } from '@/lib/backoffice'

export const dynamic = 'force-dynamic'

/**
 * Where people stop.
 *
 * ---------------------------------------------------------------------------
 * Every number here is a within-a-day number
 * ---------------------------------------------------------------------------
 * The visitor hash rotates at midnight, so nothing can join Monday's hash to
 * Tuesday's. A funnel is a claim about one person doing several things, which
 * makes a day the longest window it can honestly span - somebody who read the
 * pricing page on Monday and subscribed on Wednesday is not counted as having
 * subscribed.
 *
 * That under-counts conversion and never over-counts it, which is the right
 * direction for a number to be wrong in, but it means the later steps of a
 * slow-decision funnel are always pessimistic. Said on the page rather than
 * left in a migration comment, because it changes what the numbers mean.
 */
export default async function FunnelsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>
}) {
  const { days } = await searchParams
  const range = asRange(days)

  const { supabase } = await requireBackofficeSection('experiments')
  const funnels = await readFunnels(supabase, range)

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Funnels</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Counted within a single day, because the visitor hash rotates at midnight and nothing
            can join one day to the next. A decision that took a week reads as a leak at whatever
            step the sleep happened after — these numbers under-count conversion, never over-count
            it.
          </p>
        </div>
        <nav className="flex gap-1 text-sm">
          {RANGES.map((option) => (
            <Link
              key={option}
              href={`/ovaloffice/experiments/funnels?days=${option}`}
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

      {funnels.map(({ funnel, steps, worstStep }) => {
        // The widest bar is the top of the funnel; everything is drawn relative
        // to it so the shape of the drop-off is visible without reading a
        // single number.
        const top = Math.max(1, steps[0]?.visitors ?? 0)

        return (
          <section key={funnel.id} className="rounded-xl border border-border bg-card">
            <header className="border-b border-border px-5 py-4">
              <h2 className="font-medium">{funnel.label}</h2>
            </header>

            <ol className="divide-y divide-border/60">
              {steps.map((step, index) => (
                <li key={step.label} className="px-5 py-3">
                  <div className="flex items-baseline justify-between gap-4 text-sm">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      {step.label}
                      {worstStep === index && (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-400">
                          biggest drop
                        </span>
                      )}
                    </span>
                    <span className="flex items-baseline gap-3 tabular-nums">
                      <span>{step.visitors.toLocaleString()}</span>
                      <span
                        className="w-12 text-right text-xs text-muted-foreground"
                        title="Share of the step above that got here"
                      >
                        {formatShare(step.survived)}
                      </span>
                      <span
                        className="w-12 text-right text-xs text-muted-foreground/70"
                        title="Share of everyone who entered the funnel"
                      >
                        {formatShare(step.ofTotal)}
                      </span>
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary/60"
                      style={{ width: `${Math.max(1, (step.visitors / top) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ol>

            <footer className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
              First column is visitor-days at that step. Second is the share of the step above —
              which is the one that says where the leak is. Third is the share of everyone who
              entered.
            </footer>
          </section>
        )
      })}
    </div>
  )
}
