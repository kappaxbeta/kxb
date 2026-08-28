'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { banWorld, dismissReport, unbanWorld } from '@/domain/moderation/actions'
import type { WorldReportView } from '@/domain/moderation/queries'
import { ErrorNote } from '@/app/components/error-note'
import { Pager, TableToolbar, useTableView } from '@/app/ovaloffice/_table/table-view'

const FILTERS = [
  { id: 'open', label: 'Open' },
  { id: 'upheld', label: 'Upheld' },
  { id: 'dismissed', label: 'Dismissed' },
  { id: 'all', label: 'All' },
] as const

const BUTTON =
  'rounded-lg border border-border px-3 py-1.5 text-xs transition hover:bg-secondary disabled:opacity-50'

export function ReportQueue({
  reports,
  filter,
}: {
  reports: WorldReportView[]
  filter: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // The arena, the space that built it and the reason given are what an admin
  // scans; the status filter above is already applied server-side, so search
  // composes on top of whichever tab is open.
  const view = useTableView(
    reports,
    (report) =>
      `${report.worldName ?? ''} ${report.spaceName ?? ''} ${report.spaceSlug ?? ''} ${report.reason}`,
  )

  function act(run: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null)
    startTransition(async () => {
      const result = await run()
      if (!result.ok) setError(result.error ?? 'That did not work')
      else router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <nav className="flex gap-1 text-xs">
        {FILTERS.map((option) => (
          <Link
            key={option.id}
            href={`/ovaloffice/reports?status=${option.id}`}
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

      {reports.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing here.</p>
      ) : (
        <div>
          <TableToolbar view={view} placeholder="Search by world, space or reason…" unit="reports" />
          <ul className="space-y-3">
          {view.pageRows.map((report) => (
            <li
              key={report.id}
              className="rounded-xl border border-border bg-secondary/40 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {report.worldName ?? 'A deleted arena'}
                    {report.banned && (
                      <span className="ml-2 rounded bg-red-500/20 px-2 py-0.5 text-xs text-red-300">
                        banned
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {report.spaceName ?? 'unknown space'}
                    {report.spaceSlug && ` (${report.spaceSlug})`} ·{' '}
                    {report.blockCount.toLocaleString()} blocks ·{' '}
                    {new Date(report.createdAt).toLocaleDateString()}
                  </p>
                </div>

                {/*
                  Look first. Opens in its own tab so the queue stays where it
                  is - an admin working through a list should not lose their
                  place to inspect one item.
                */}
                <Link
                  href={`/ovaloffice/worlds/${report.worldId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90"
                >
                  Walk around it ↗
                </Link>
              </div>

              <p className="mt-3 rounded-lg bg-card px-3 py-2 text-sm">
                “{report.reason}”
              </p>

              {report.banned && report.bannedReason && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Banned: {report.bannedReason}
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {report.banned ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act(() => unbanWorld(report.worldId))}
                    className={BUTTON}
                  >
                    Lift the ban
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      const reason = prompt('Why is this world being banned?')
                      if (!reason) return
                      act(() => banWorld(report.worldId, reason))
                    }}
                    className="rounded-lg border border-red-400/50 px-3 py-1.5 text-xs text-red-300 transition hover:bg-red-500/15 disabled:opacity-50"
                  >
                    Ban this world
                  </button>
                )}

                {report.status === 'open' && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act(() => dismissReport(report.id))}
                    className={BUTTON}
                  >
                    Nothing wrong with it
                  </button>
                )}

                {report.status !== 'open' && (
                  <span className="self-center text-xs text-muted-foreground">
                    {report.status}
                  </span>
                )}
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
