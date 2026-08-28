import Link from 'next/link'
import { RANGES, type Range, rangeLabel } from '@/domain/analytics/queries'

/**
 * The header both analytics surfaces share: which view, and how far back.
 *
 * The window is a URL parameter rather than client state, for the reason the
 * traffic page already gave - "last 90 days" should be a link you can send
 * someone - and it survives the move between Traffic and People, because both
 * links carry the range that is currently on.
 */
export function AnalyticsNav({
  view,
  range,
  title,
  blurb,
  showRange = true,
}: {
  view: 'traffic' | 'pages' | 'people'
  range: Range
  title: string
  /** Omitted where the range does not apply - the frequency table is fixed. */
  showRange?: boolean
  blurb: string
}) {
  const views = [
    { key: 'traffic', href: '/ovaloffice/analytics', label: 'Traffic' },
    { key: 'pages', href: '/ovaloffice/analytics/pages', label: 'Pages' },
    { key: 'people', href: '/ovaloffice/analytics/people', label: 'People' },
  ] as const

  return (
    <div className="mb-6">
      <div className="mb-4 flex gap-1 rounded-lg border border-border p-1 text-sm sm:w-fit">
        {views.map((item) => (
          <Link
            key={item.key}
            href={`${item.href}?days=${range}`}
            aria-current={item.key === view ? 'page' : undefined}
            className={`flex-1 rounded px-4 py-1 text-center transition sm:flex-none ${
              item.key === view
                ? 'bg-secondary text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">{blurb}</p>
          {/* The one thing worth knowing while reading these numbers: our own
              visits are in them unless the browser looking at them has been
              told otherwise. The switch is public and per browser, so it has to
              be set again in each of the ones used for testing - the link is
              here because this is where the thought occurs. */}
          <p className="mt-1 text-xs text-muted-foreground">
            <Link href="/notme" className="underline hover:text-foreground">
              Don&rsquo;t count this browser
            </Link>
          </p>
        </div>
        <div className={`gap-1 rounded-lg border border-border p-1 text-sm ${showRange ? 'flex' : 'hidden'}`}>
          {RANGES.map((option) => (
            <Link
              key={option}
              href={`${views.find((v) => v.key === view)?.href}?days=${option}`}
              aria-current={option === range ? 'page' : undefined}
              className={`rounded px-3 py-1 transition ${
                option === range
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {rangeLabel(option)}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
