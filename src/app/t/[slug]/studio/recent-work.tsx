'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Clapperboard, Gamepad2 } from 'lucide-react'
import type { WorkspaceDict } from '@/app/i18n/workspace'

/**
 * One list of everything this space has been making, newest first.
 *
 * ---------------------------------------------------------------------------
 * Why the two kinds are mixed
 * ---------------------------------------------------------------------------
 * The studio had a section of games and a section of movies, each sorted by
 * itself. That is the right shape for *browsing* and the wrong one for the
 * thing somebody actually does on this page, which is carry on with whatever
 * they were doing yesterday - and which sort of thing that was is not usually
 * the first thing they remember about it. Two lists mean reading both and
 * comparing dates by eye.
 *
 * So there is one list in one order, and the *kind* is a chip rather than a
 * heading. The sections underneath are still there for browsing; this is the
 * short answer above them.
 *
 * ---------------------------------------------------------------------------
 * Filtered here rather than re-queried
 * ---------------------------------------------------------------------------
 * The same call the battle wizard's picker makes and for the same reasons: the
 * list is already loaded and already bounded, so a round trip per press would
 * be slower *and* would make the cap visible somewhere new.
 *
 * ---------------------------------------------------------------------------
 * The strings arrive made
 * ---------------------------------------------------------------------------
 * `detail` and `when` are composed on the server - a version number for a game,
 * a duration for a movie, and a relative time in the reader's own language.
 * Formatting a date in the browser would mean the first paint disagreeing with
 * the server's, which is a hydration warning in exchange for nothing.
 */

export type WorkKind = 'game' | 'movie'

export interface RecentItem {
  id: string
  kind: WorkKind
  name: string
  href: string
  /** The right-hand fact: `v3` for a game, `8s` for a movie. */
  detail: string
  /** How long ago, already worded. */
  when: string
  /** Draft, live, shared - whatever the kind has to say. */
  badge: string | null
}

const ICONS: Record<WorkKind, typeof Gamepad2> = {
  game: Gamepad2,
  movie: Clapperboard,
}

const FILTERS = ['all', 'game', 'movie'] as const
type Filter = (typeof FILTERS)[number]

export function RecentWork({
  items,
  t,
}: {
  items: readonly RecentItem[]
  t: WorkspaceDict['studio']
}) {
  const [from, setFrom] = useState<Filter>('all')

  /*
    Only the filters that can return something.

    A space with no movies in it should not be offered a `movies` button whose
    only possible answer is an empty list - that is a control which teaches
    somebody the page is broken. The same rule `filtersFor` states in the battle
    picker, and the reason `all` is unconditional: it is the state, not a filter.
  */
  const offered = useMemo(
    () =>
      FILTERS.filter(
        (option) => option === 'all' || items.some((item) => item.kind === option),
      ),
    [items],
  )

  const shown = useMemo(
    () => (from === 'all' ? items : items.filter((item) => item.kind === from)),
    [items, from],
  )

  return (
    <section className="space-y-3" aria-labelledby="studio-recent">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2
          id="studio-recent"
          className="font-mono text-xs uppercase tracking-[0.2em] text-ink-muted"
        >
          {t.recent}
        </h2>

        {/* Only when there is a choice to make. One button that cannot be
            turned off is a label pretending to be a control. */}
        {offered.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {offered.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setFrom(option)}
                aria-pressed={from === option}
                className={`rounded-lg border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.15em] transition ${
                  from === option
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-line text-ink-muted hover:border-accent/60'
                }`}
              >
                {t.recentFilters[option]}
              </button>
            ))}
          </div>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line/60 p-6 text-sm text-ink-muted">
          {t.nothingRecent}
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {shown.map((item) => {
            const Icon = ICONS[item.kind]
            return (
              <li key={`${item.kind}-${item.id}`}>
                <Link
                  href={item.href}
                  className="flex items-center gap-3 rounded-xl border border-line/50 bg-surface-raised/30 px-3 py-2.5 transition hover:border-accent/60"
                >
                  <Icon className="size-4 shrink-0 text-ink-muted" aria-hidden />

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{item.name}</span>
                    <span className="block font-mono text-[10px] text-ink-muted/70">
                      {t.kinds[item.kind]} · {item.when}
                    </span>
                  </span>

                  {item.badge && (
                    <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.15em] text-accent-2">
                      {item.badge}
                    </span>
                  )}
                  <span className="shrink-0 font-mono text-xs text-ink-muted">
                    {item.detail}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
