'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { attempt } from '@/app/components/connection'
import { fill } from '@/app/i18n/fill'
import type { WorkspaceDict } from '@/app/i18n/workspace'
import { drawStarterSet } from '@/domain/thingiverse/actions'
import { thumbnailFor } from '@/domain/thingiverse/models'
import { KXB_TAG, STARTER_SETS, type StarterSet } from '@/domain/thingiverse/starters'

/**
 * The sets we already made, and one button each.
 *
 * ---------------------------------------------------------------------------
 * Why the whole set, and why the contents are on the card
 * ---------------------------------------------------------------------------
 * Half of what is in a set means nothing on its own - a board with a recipe for
 * a burger is furniture until there is a bun to put on it - so the button adds
 * all of them. That is a lot of rows to appear on somebody's shelf from one
 * press, which is why every card lists exactly what is about to land, with the
 * picture of each: the honest way to ask for one press is to show the ten
 * things it makes.
 *
 * ---------------------------------------------------------------------------
 * `router.refresh()` rather than a list of our own
 * ---------------------------------------------------------------------------
 * The shelf is a server component two doors away and re-reading it is one
 * request against a read model that is already warm. Nothing here is a scene,
 * so there is no WebGL context to tear down - which is the reason the *world's*
 * actions refuse to do exactly this.
 */
export function SetsPanel({
  slug,
  t,
}: {
  slug: string
  t: WorkspaceDict['thingiverse']
}) {
  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-xs leading-relaxed text-ink-muted">{t.sets.intro}</p>

      <ul className="grid gap-3 lg:grid-cols-2">
        {STARTER_SETS.map((set) => (
          <SetCard key={set.id} slug={slug} set={set} t={t} />
        ))}
      </ul>
    </div>
  )
}

function SetCard({
  slug,
  set,
  t,
}: {
  slug: string
  set: StarterSet
  t: WorkspaceDict['thingiverse']
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  /**
   * What the last press came to, kept until the page is left.
   *
   * Two numbers rather than a tick, because "nothing happened" and "all ten of
   * these were already yours" look identical on a shelf you cannot see from
   * here - and the second is the answer somebody gets for pressing twice, which
   * is a thing people do.
   */
  const [done, setDone] = useState<{ added: number; skipped: number } | null>(null)

  const add = () =>
    start(async () => {
      setError(null)
      const result = await attempt(() => drawStarterSet(slug, set.id))
      if (!result.ok) {
        setError(result.error ?? 'Refused')
        return
      }
      setDone({ added: result.added, skipped: result.skipped })
      router.refresh()
    })

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-line/60 bg-surface p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">{set.title}</h3>
        <span className="font-mono text-[10px] tabular-nums text-ink-muted">
          {fill(t.sets.count, { n: set.things.length })}
        </span>
      </div>

      <p className="text-[11px] leading-relaxed text-ink-muted">{set.hint}</p>

      {/*
        Every thing in the set, with its picture and the line that says what it
        does. A grid rather than a sentence: the useful question in front of this
        card is "is the turret in here", and that is answered by looking.
      */}
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {set.things.map((starter) => (
          <li key={starter.id} className="flex items-center gap-2" title={starter.hint}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumbnailFor(starter.spec.model)}
              alt=""
              loading="lazy"
              className="size-8 shrink-0 rounded bg-surface-raised object-contain"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11px] text-ink">{starter.name}</span>
              <span className="block truncate text-[10px] text-ink-muted">{starter.hint}</span>
            </span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={add}
          className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs text-ink transition hover:border-accent/70 disabled:opacity-60"
        >
          {pending ? t.sets.adding : t.sets.add}
        </button>

        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-muted">
          {fill(t.sets.tagged, { tag: KXB_TAG })}
        </span>

        {done && (
          <span role="status" className="text-[11px] text-ink-muted">
            {done.added === 0
              ? t.sets.allThere
              : [
                  fill(t.sets.added, { n: done.added }),
                  done.skipped > 0 ? fill(t.sets.already, { n: done.skipped }) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
          </span>
        )}

        {error && (
          <span role="alert" className="text-[11px] text-red-400">
            {error}
          </span>
        )}
      </div>
    </li>
  )
}
