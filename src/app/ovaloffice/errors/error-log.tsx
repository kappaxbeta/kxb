'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { reopenErrorGroup, resolveErrorGroup } from '@/domain/observability/actions'
import type { ErrorGroupView } from '@/domain/observability/queries'
import { ErrorNote } from '@/app/components/error-note'
import { Pager, TableToolbar, useTableView } from '@/app/ovaloffice/_table/table-view'

const FILTERS = [
  { id: 'open', label: 'Open' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'all', label: 'All' },
] as const

const BUTTON =
  'rounded-lg border border-border px-3 py-1.5 text-xs transition hover:bg-secondary disabled:opacity-50'

/**
 * Where a row came from, as a word.
 *
 * The three sources answer genuinely different questions - a `server` row has a
 * stack and no user, a `client` row has a user and the browser's view of the
 * same failure, and a `not-found` row is not a crash at all - so telling them
 * apart at a glance is most of the triage.
 */
const SOURCES = {
  server: { label: 'server', className: 'bg-red-500/15 text-red-300' },
  client: { label: 'browser', className: 'bg-amber-500/20 text-amber-300' },
  'not-found': { label: '404', className: 'bg-sky-500/15 text-sky-300' },
} as const

export function ErrorLog({
  groups,
  filter,
}: {
  groups: ErrorGroupView[]
  filter: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function act(run: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null)
    startTransition(async () => {
      const result = await run()
      if (!result.ok) setError(result.error ?? 'That did not work')
      else router.refresh()
    })
  }

  // Message, route/path, source and digest are what triage scans for. The
  // status tabs page the server, so this searches whatever they narrowed to.
  const view = useTableView(
    groups,
    (group) =>
      `${group.message} ${group.route ?? ''} ${group.path ?? ''} ${group.source} ${group.digest ?? ''}`,
  )

  return (
    <div className="space-y-4">
      <nav className="flex gap-1 text-xs">
        {FILTERS.map((option) => (
          <Link
            key={option.id}
            href={`/ovaloffice/errors?status=${option.id}`}
            className={`rounded-lg px-3 py-1.5 transition ${
              filter === option.id
                ? 'bg-secondary text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {option.label}
          </Link>
        ))}
      </nav>

      {error && <ErrorNote>{error}</ErrorNote>}

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {filter === 'open' ? 'Nothing is broken.' : 'Nothing here.'}
        </p>
      ) : (
        <div>
          <TableToolbar view={view} placeholder="Search by message, route or digest…" unit="errors" />
          <ul className="space-y-3">
            {view.pageRows.map((group) => (
            <li
              key={group.fingerprint}
              className="rounded-xl border border-border bg-secondary/40 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${SOURCES[group.source].className}`}
                    >
                      {SOURCES[group.source].label}
                    </span>
                    {group.openCount === 0 && (
                      <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-500">
                        resolved
                      </span>
                    )}
                    <span className="min-w-0 break-words font-medium">
                      {group.message}
                    </span>
                  </p>

                  {/* Where, as the app names it. The route file is the thing
                      that is broken; the URL is one visit to it, and is kept
                      because a `[slug]` on its own has never helped anybody
                      reproduce a bug. */}
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {group.route ?? group.path ?? 'unknown route'}
                    {group.route && group.path && group.route !== group.path && (
                      <span className="opacity-60"> · {group.path}</span>
                    )}
                  </p>

                  <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      <strong className="font-medium text-foreground">
                        {group.occurrences}
                      </strong>{' '}
                      {group.occurrences === 1 ? 'time' : 'times'}
                    </span>
                    {group.affected > 0 && (
                      <span>
                        <strong className="font-medium text-foreground">
                          {group.affected}
                        </strong>{' '}
                        {group.affected === 1 ? 'person' : 'people'}
                      </span>
                    )}
                    <span>last {when(group.lastSeen)}</span>
                    <span className="opacity-60">first {when(group.firstSeen)}</span>
                  </p>

                  {group.digest && (
                    // select-all because the only thing anybody does with a
                    // digest is paste it somewhere else.
                    <p className="mt-2 select-all font-mono text-[0.6875rem] text-muted-foreground/70">
                      digest {group.digest}
                    </p>
                  )}

                  {group.stack && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                        Stack
                      </summary>
                      <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-black/30 p-3 text-[0.6875rem] leading-relaxed text-muted-foreground">
                        {group.stack}
                      </pre>
                    </details>
                  )}
                </div>

                <div className="flex shrink-0 gap-2">
                  {group.openCount > 0 ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => act(() => resolveErrorGroup(group.fingerprint))}
                      className={BUTTON}
                    >
                      Resolve
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => act(() => reopenErrorGroup(group.fingerprint))}
                      className={BUTTON}
                    >
                      Reopen
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
          </ul>
          <Pager view={view} />
        </div>
      )}
    </div>
  )
}

/**
 * How long ago, in words.
 *
 * "3 hours ago" is what triage actually asks - whether this is still happening.
 * An ISO timestamp makes that a subtraction the reader has to do, and the
 * absolute moment is in the row's `title` for the rare case where it matters.
 */
function when(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000)

  const steps: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, 'second'],
    [60, 'minute'],
    [24, 'hour'],
    [7, 'day'],
    [Number.POSITIVE_INFINITY, 'week'],
  ]

  let value = seconds
  for (const [size, unit] of steps) {
    if (Math.abs(value) < size) {
      return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(
        -Math.round(value),
        unit,
      )
    }
    value /= size
  }

  return iso
}
