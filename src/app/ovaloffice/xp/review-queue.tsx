'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { publishXp, rejectXp, unpublishXp, type ReviewResult } from '@/domain/xps/backoffice-actions'
import type { XpReviewRow } from '@/domain/xps/backoffice'
import type { PlayTotals } from '@/domain/xps/plays'
import { Pager, TableToolbar, useTableView } from '@/app/ovaloffice/_table/table-view'

/**
 * One row of the queue, and the two or three things to do about it.
 *
 * ---------------------------------------------------------------------------
 * Reviewing an XP means opening it
 * ---------------------------------------------------------------------------
 * `/ovaloffice/reports` already knows this about worlds — a place is a thing
 * you have to go and stand in before judging it — and an XP is more so, because
 * it has rules in it. A screenshot cannot tell you the finish line is
 * unreachable.
 *
 * So the row is a link first and a verdict second, and the numbers on it are
 * deliberately the ones standing in the level *cannot* answer: how many files,
 * what kinds, and whether any of them is still in quarantine.
 */

type Result = ReviewResult | null

function useVerdict(run: (formData: FormData) => Promise<ReviewResult>) {
  return useActionState(async (_previous: Result, formData: FormData) => run(formData), null)
}

function Refusal({ state }: { state: Result }) {
  if (!state || state.ok) return null
  return (
    <p role="alert" className="mt-2 text-xs text-red-400">
      {state.error}
    </p>
  )
}

export function ReviewQueue({
  rows,
  mode,
}: {
  rows: XpReviewRow[]
  /** `waiting` offers publish and reject; `live` offers a take-down. */
  mode: 'waiting' | 'live'
}) {
  // Name, space and blurb are what a reviewer scans this queue for.
  const view = useTableView(
    rows,
    (row) => `${row.name} ${row.spaceName} ${row.spaceSlug} ${row.blurb ?? ''}`,
  )

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-5 text-sm text-neutral-400">
        {mode === 'waiting' ? 'Nothing waiting.' : 'Nothing live yet.'}
      </p>
    )
  }

  return (
    <div>
      <TableToolbar view={view} placeholder="Search by name or space…" unit="levels" />
      <ul className="space-y-3">
        {view.pageRows.map((row) => (
          <li key={row.id}>
            <Row row={row} mode={mode} />
          </li>
        ))}
      </ul>
      <Pager view={view} />
    </div>
  )
}

function Row({ row, mode }: { row: XpReviewRow; mode: 'waiting' | 'live' }) {
  const [publishState, publish, publishing] = useVerdict(publishXp)
  const [rejectState, reject, rejecting] = useVerdict(rejectXp)
  const [downState, takeDown, takingDown] = useVerdict(unpublishXp)

  const version = mode === 'live' ? row.publishedVersion : row.currentVersion

  return (
    <article className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="flex gap-4">
        <div className="size-20 shrink-0 overflow-hidden rounded-md bg-neutral-950">
          {row.coverPath ? (
            /* eslint-disable-next-line @next/next/no-img-element -- content-
               addressed and served behind an immutable cache header. */
            <img
              src={`/api/xp/${row.id}/${row.coverPath}`}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            <span className="flex size-full items-center justify-center text-[10px] text-neutral-600">
              no shot
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="font-medium">
            {/* Into the player, not into a detail page. The verdict is about
                what it is like to be in there. */}
            <Link href={`/xp/${row.id}`} className="hover:underline">
              {row.name}
            </Link>
          </h3>
          <p className="mt-0.5 text-xs text-neutral-400">
            {row.spaceName} · v{version ?? '—'} ·{' '}
            {new Date(row.updatedAt).toLocaleDateString()}
            {mode === 'live' && ` · ${describePlay(row.played)}`}
            {row.state === 'unlisted' && ' · taken down'}
          </p>
          {row.blurb && <p className="mt-1 text-sm text-neutral-300">{row.blurb}</p>}

          {/* What the walk cannot tell you. */}
          <p className="mt-2 font-mono text-[11px] text-neutral-500">
            {row.files} files · {describeSize(row.bytes)}
            {row.kinds.length > 0 && ` · ${row.kinds.join(', ')}`}
          </p>

          {row.unclean > 0 && (
            <p className="mt-2 rounded border border-amber-500/50 bg-amber-500/10 px-2 py-1 text-xs text-amber-200">
              {row.unclean} {row.unclean === 1 ? 'file is' : 'files are'} not marked clean.
              Do not publish this until that is resolved.
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-start gap-3 border-t border-neutral-800 pt-3">
        {mode === 'waiting' ? (
          <>
            <form action={publish}>
              <input type="hidden" name="xpId" value={row.id} />
              <button
                type="submit"
                /* The one guard that is in the interface rather than in the
                   decider. The database cannot know that an operator should not
                   approve something still in quarantine — `scan_status` gates
                   *serving*, not publishing — so the button refuses. */
                disabled={publishing || row.unclean > 0}
                className="rounded-md bg-emerald-600/80 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:opacity-40"
              >
                {publishing ? 'Publishing…' : 'Publish'}
              </button>
              <Refusal state={publishState} />
            </form>

            <form action={reject} className="flex flex-1 flex-wrap items-start gap-2">
              <input type="hidden" name="xpId" value={row.id} />
              <input
                name="reason"
                required
                maxLength={500}
                placeholder="Why — they will read this"
                className="min-w-48 flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm outline-none focus:border-neutral-500"
              />
              <button
                type="submit"
                disabled={rejecting}
                className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm transition hover:border-neutral-500 disabled:opacity-40"
              >
                {rejecting ? 'Sending…' : 'Send it back'}
              </button>
              <Refusal state={rejectState} />
            </form>
          </>
        ) : (
          row.state === 'published' && (
            <form action={takeDown} className="flex flex-1 flex-wrap items-start gap-2">
              <input type="hidden" name="xpId" value={row.id} />
              <input
                name="reason"
                required
                maxLength={500}
                placeholder="Why — they will read this"
                className="min-w-48 flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm outline-none focus:border-neutral-500"
              />
              <button
                type="submit"
                disabled={takingDown}
                className="rounded-md border border-red-800 px-3 py-1.5 text-sm text-red-300 transition hover:bg-red-950/40 disabled:opacity-40"
              >
                {takingDown ? 'Taking down…' : 'Take it down'}
              </button>
              <Refusal state={downState} />
            </form>
          )
        )}
      </div>
    </article>
  )
}

/**
 * How much it was played, in the fewest words that are true.
 *
 * `never played` rather than `0 plays`, because on a moderation queue those two
 * read differently: one is a figure and the other is the answer to "is anybody
 * in here". Until the session log landed every row said `0 plays` and meant
 * neither — nothing had ever written the column it came from.
 *
 * Hours and minutes rather than a duration to the second: this is a sense of
 * scale beside a name, and the reviewer's next action is to open the level, not
 * to reconcile a number.
 */
function describePlay(played: PlayTotals): string {
  if (played.plays === 0) return 'never played'

  const count = `${played.plays.toLocaleString()} ${played.plays === 1 ? 'play' : 'plays'}`
  if (played.seconds < 60) return count

  const minutes = Math.round(played.seconds / 60)
  if (minutes < 90) return `${count} · ${minutes}m`
  return `${count} · ${Math.round(minutes / 6) / 10}h`
}

function describeSize(bytes: number): string {
  if (bytes === 0) return '0'
  if (bytes >= 1024 * 1024) return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} kB`
}
