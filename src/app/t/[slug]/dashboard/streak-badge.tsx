import Link from 'next/link'
import { fill } from '@/app/i18n/fill'
import { workspaceDict } from '@/app/i18n/workspace'
import type { Locale } from '@/domain/i18n/locale'

/**
 * Your own streak, at the very top of the board, and the way into the table of
 * everybody's.
 *
 * It is the first thing on the page on purpose - above the space's own name -
 * because it is the one line here that is about *you*, and a streak is only a
 * reason to come back tomorrow if you see it the moment you arrive today. The
 * whole thing is a link to the leaderboard: the natural next thought after "I'm
 * on six" is "where does that put me".
 *
 * By the time this renders the layout has already counted today (see
 * `recordDailyVisit`), so a signed-in member's `current` is at least one. The
 * zero branch is the honest fallback for the rare load where that write did not
 * land - it still points at the leaderboard rather than showing a broken 0.
 */
export function StreakBadge({
  slug,
  current,
  longest,
  locale,
}: {
  slug: string
  /** The live run - already resolved against today by the query. */
  current: number
  /** The best run ever, shown once it is worth beating the current one. */
  longest: number
  /** Resolved by the page. A server component, so there is no context to read. */
  locale: Locale
}) {
  const t = workspaceDict(locale).board
  const cold = current <= 0
  // A best worth mentioning: strictly taller than today's run, so the line is
  // "you're on 3, your best is 9" and never "on 3, best 3".
  const showBest = longest > current

  return (
    <Link
      href={`/t/${slug}/leaderboard`}
      className={`group inline-flex items-center gap-2.5 rounded-full border py-1.5 pl-2.5 pr-3.5 text-sm transition ${
        cold
          ? 'border-line/60 text-ink-muted hover:border-accent/60 hover:text-ink'
          : 'border-amber-600/40 bg-amber-600/10 text-ink hover:border-amber-600/70'
      }`}
    >
      <Flame lit={!cold} />

      {cold ? (
        <span>
          {t.noStreak}
          <span className="ml-1 text-ink-muted/70 group-hover:text-accent-2">
            {t.seeTheBoard}
          </span>
        </span>
      ) : (
        <span className="flex items-baseline gap-1.5">
          <span className="font-pixel text-base leading-none text-amber-600 tabular-nums">
            {current}
          </span>
          <span>{current === 1 ? t.daysInARowOne : t.daysInARowMany}</span>
          {showBest && (
            <span className="text-[11px] text-ink-muted">
              {fill(t.bestStreak, { n: longest })}
            </span>
          )}
          <span
            aria-hidden
            className="ml-0.5 text-ink-muted transition group-hover:translate-x-0.5 group-hover:text-accent-2"
          >
            →
          </span>
        </span>
      )}
    </Link>
  )
}

/**
 * A hand-drawn flame, in the same weight as the rail's line icons so it sits in
 * the type rather than on it. Lit, it is filled amber; cold, it is a hollow
 * outline - the difference between a run that is going and one waiting to start.
 */
function Flame({ lit }: { lit: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={16}
      height={16}
      aria-hidden
      className={lit ? 'text-amber-600' : 'text-ink-muted'}
      fill={lit ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.3}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* An outer tongue and an inner heart, so the lit fill still reads as a
          flame rather than a blob. */}
      <path d="M8 1.6c.4 2.4 2.2 3.3 3.2 4.9a4.6 4.6 0 1 1-7.9 3.2c0-2 1.1-3 1.9-3.9.5 1 1.2 1.3 1.6 1.1C6 9.4 6.4 6.2 8 1.6Z" />
      {!lit && <path d="M8 13.4a2.4 2.4 0 0 0 1.4-4.3c-.5 1-1.4 1-1.8.6" />}
    </svg>
  )
}
