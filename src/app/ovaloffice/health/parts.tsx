import type { ProbeStatus } from '@/domain/health/probe'
import { statusLabel } from '@/domain/health/format'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/**
 * The small pieces the health page is made of.
 *
 * Server components, all of them - none of this needs state, and a monitoring
 * page whose numbers arrive after a hydration round trip is a monitoring page
 * that is blank at the moment you most want to read it.
 */

/**
 * A status as a colour and a word, never a colour alone.
 *
 * Red and green are the two most common colour vision deficiencies, and a
 * dashboard whose entire meaning is carried by which of them a dot is has no
 * meaning for somebody who cannot tell them apart. The word is not a caption
 * for the dot; the dot is decoration on the word.
 */
export function StatusPill({
  status,
  label,
}: {
  status: ProbeStatus
  label?: string
}) {
  const tone =
    status === 'ok'
      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
      : status === 'slow'
        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
        : 'bg-red-500/10 text-red-400 border-red-500/20'

  const dot =
    status === 'ok' ? 'bg-emerald-400' : status === 'slow' ? 'bg-amber-400' : 'bg-red-400'

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium',
        tone,
      )}
    >
      <span className={cn('size-1.5 rounded-full', dot)} aria-hidden />
      {label ?? statusLabel(status)}
    </span>
  )
}

/** A labelled number, the unit of this whole page. */
export function Metric({
  label,
  value,
  hint,
  status,
}: {
  label: string
  value: string
  hint?: string
  /** Colours the value when the reading itself is the alarm. */
  status?: ProbeStatus | null
}) {
  const tone =
    status === 'down'
      ? 'text-red-400'
      : status === 'slow'
        ? 'text-amber-400'
        : 'text-foreground'

  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 text-lg font-semibold tabular-nums', tone)}>{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground/70">{hint}</p>}
    </div>
  )
}

/**
 * A series as a shape, not as numbers.
 *
 * Deliberately unlabelled and small. The question a sparkline answers is "is
 * this flat, climbing, or did it fall off a cliff", and putting axes on it
 * would invite reading exact values off something that is thirty pixels tall.
 * The precise numbers are in the cards above; this is the shape they made.
 */
export function Sparkline({
  values,
  className,
  title,
}: {
  /** Oldest first. Nulls are gaps - a replica that was not answering. */
  values: (number | null)[]
  className?: string
  title: string
}) {
  const present = values.filter((value): value is number => value !== null)

  if (present.length < 2) {
    return (
      <p className="text-[11px] text-muted-foreground/70">Not enough samples yet.</p>
    )
  }

  const max = Math.max(...present)
  // A floor of zero rather than the minimum, so a metric that hovers between
  // 340 and 350 MB reads as flat instead of as a mountain range. Scaling to the
  // data's own range is how a sparkline turns noise into a false alarm.
  const min = 0
  const span = max - min || 1
  const width = 100
  const height = 24

  /**
   * Gaps break the line rather than interpolating across them.
   *
   * A replica that was down for twenty minutes has no memory reading for that
   * window, and drawing a straight line between the readings either side would
   * claim it was fine and slowly changing. Each run of present values becomes
   * its own polyline, so a gap looks like a gap.
   */
  const runs: string[][] = []
  let run: string[] = []

  values.forEach((value, index) => {
    if (value === null) {
      if (run.length > 0) runs.push(run)
      run = []
      return
    }
    const x = (index / Math.max(1, values.length - 1)) * width
    const y = height - ((value - min) / span) * height
    run.push(`${x.toFixed(2)},${y.toFixed(2)}`)
  })
  if (run.length > 0) runs.push(run)

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn('h-6 w-full', className)}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      {runs.map((points, index) => (
        <polyline
          key={index}
          points={points.join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  )
}

/** A row in the dependency table. */
export function ProbeRow({
  name,
  status,
  ms,
  detail,
}: {
  name: string
  status: ProbeStatus
  ms: number
  detail?: string | null
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/50 py-2 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium capitalize">{name}</p>
        {/* The failure text, verbatim. This page is admin-only and the whole
            reason to open it is to find out what went wrong - paraphrasing the
            error into something friendlier removes the only actionable part. */}
        {detail && (
          <p className="truncate font-mono text-[11px] text-muted-foreground" title={detail}>
            {detail}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {ms} ms
        </span>
        <StatusPill status={status} />
      </div>
    </div>
  )
}

/** A neutral count, for things that are facts rather than alarms. */
export function Pill({ children }: { children: React.ReactNode }) {
  return (
    <Badge variant="outline" className="font-mono text-[11px]">
      {children}
    </Badge>
  )
}
