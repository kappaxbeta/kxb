import { cn } from '@/lib/utils'

/**
 * The small pieces the performance page is made of.
 *
 * Server components, all of them, exactly as the health page's are and for the
 * same reason: none of this needs state, and a monitoring page whose numbers
 * arrive after a hydration round trip is blank at the moment you most want to
 * read it.
 */

/**
 * How a reading is doing, as a word and a colour - never a colour alone.
 *
 * The same rule the health page's `StatusPill` keeps. Red and green are the two
 * most common colour vision deficiencies, and a dashboard whose meaning is
 * carried entirely by which of them a number is has no meaning for somebody who
 * cannot tell them apart.
 */
export type Grade = 'good' | 'warn' | 'bad' | 'none'

const TONE: Record<Grade, string> = {
  good: 'text-emerald-400',
  warn: 'text-amber-400',
  bad: 'text-red-400',
  none: 'text-muted-foreground',
}

/** A labelled number. The unit this page is built out of. */
export function Metric({
  label,
  value,
  hint,
  grade = 'none',
}: {
  label: string
  value: string
  hint?: string
  grade?: Grade
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-0.5 text-lg font-semibold tabular-nums',
          grade === 'none' ? 'text-foreground' : TONE[grade],
        )}
      >
        {value}
      </p>
      {hint && <p className="text-[11px] leading-snug text-muted-foreground/70">{hint}</p>}
    </div>
  )
}

/** A word with a dot on it, for a state rather than a number. */
export function StatePill({ state }: { state: string }) {
  const grade: Grade =
    state === 'subscribed' ? 'good' : state === 'joining' ? 'warn' : 'bad'

  const dot =
    grade === 'good' ? 'bg-emerald-400' : grade === 'warn' ? 'bg-amber-400' : 'bg-red-400'

  const skin =
    grade === 'good'
      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
      : grade === 'warn'
        ? 'border-amber-500/20 bg-amber-500/10 text-amber-400'
        : 'border-red-500/20 bg-red-500/10 text-red-400'

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium',
        skin,
      )}
    >
      <span className={cn('size-1.5 rounded-full', dot)} aria-hidden />
      {state.replace('_', ' ')}
    </span>
  )
}

/**
 * A bar against a ceiling.
 *
 * For the one number on this page that has a real limit behind it - what the
 * room is delivering, against the tenant's 5000 events a second. Everything
 * else here is a reading with no line to cross, and drawing a bar for those
 * would invent a threshold nobody set.
 */
export function CeilingBar({ share }: { share: number }) {
  const width = Math.min(100, Math.max(0, share * 100))
  const grade: Grade = share > 0.8 ? 'bad' : share > 0.4 ? 'warn' : 'good'
  const fill =
    grade === 'bad' ? 'bg-red-400' : grade === 'warn' ? 'bg-amber-400' : 'bg-emerald-400'

  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className={cn('h-full rounded-full', fill)} style={{ width: `${width}%` }} />
    </div>
  )
}

/** Milliseconds, rounded to something a person can read. */
export function ms(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  if (value < 10) return `${value.toFixed(1)} ms`
  return `${Math.round(value)} ms`
}

/** A per-second rate. */
export function hz(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  if (value === 0) return '0/s'
  if (value < 10) return `${value.toFixed(1)}/s`
  return `${Math.round(value)}/s`
}

/** A fraction as a percentage, for shares rather than rates. */
export function share(value: number): string {
  return `${(value * 100).toFixed(value < 0.1 ? 1 : 0)}%`
}

/**
 * How long ago, in words.
 *
 * Rendered on the server, so it is relative to the render and not to the
 * reader's clock - which is right here and wrong for a timestamp. This page
 * refreshes every fifteen seconds, so "40s ago" is never more than a window
 * stale, and the exact instant is in the title attribute for anybody who wants
 * it.
 */
export function ago(iso: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`
  return `${Math.round(seconds / 3600)}h ago`
}

/** Frame time to a grade. 20ms is 50fps; 33ms is 30. */
export function frameGrade(p95: number | null): Grade {
  if (p95 === null) return 'none'
  if (p95 > 33) return 'bad'
  if (p95 > 20) return 'warn'
  return 'good'
}

/**
 * A round trip to a grade.
 *
 * 150ms is about where a shove stops feeling like it landed when you pressed
 * the key, and 300ms is where people describe a room as laggy. Both are the
 * *round* trip, which is the number this page leads with everywhere.
 */
export function rttGrade(ms: number | null): Grade {
  if (ms === null) return 'none'
  if (ms > 300) return 'bad'
  if (ms > 150) return 'warn'
  return 'good'
}
