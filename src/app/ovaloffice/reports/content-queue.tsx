'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import {
  dismissContentReport,
  hideContent,
  showContent,
} from '@/domain/moderation/content-actions'
import { REPORT_KIND_LABELS } from '@/domain/moderation/content'
import type { ContentReportView } from '@/domain/moderation/queries'
import { ErrorNote } from '@/app/components/error-note'
import { TableToolbar, useTableView } from '@/app/ovaloffice/_table/table-view'

/**
 * Reported blueprints, clips, XPs, scripts and movies.
 *
 * A third queue rather than a third page, which is what the page around it
 * already argues for: an admin sitting down to moderate wants to know whether
 * anything is waiting, and splitting that across routes means one of them stops
 * being checked.
 *
 * Shaped like the message queue rather than the world one, and the reason is
 * what the evidence *is*. A world is a place you have to go and stand in, so
 * that queue is a list of links. A message is the whole of the evidence, so
 * that one prints it. Content is neither: what somebody reported is usually a
 * *name* - a blueprint called something vile, a clip titled something worse -
 * and the name is what was captured at report time. So this prints the title
 * and the reason, and offers the link for the cases where you do have to go and
 * look.
 *
 * The reporter is not shown, here or anywhere else. `reported_by` is on the row,
 * because it is what makes a pattern of bad-faith reporting findable later, but
 * putting it in the queue would make the person deciding aware of who
 * complained - which is exactly the thing that stops people complaining.
 */

const BUTTON =
  'rounded-lg border border-border px-3 py-1.5 text-xs transition hover:bg-secondary disabled:opacity-50'

export function ContentQueue({ reports }: { reports: ContentReportView[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const view = useTableView(
    reports,
    (report) =>
      `${report.title ?? ''} ${report.kind} ${report.reason} ${report.spaceName ?? ''} ${report.spaceSlug ?? ''}`,
  )

  function act(run: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null)
    startTransition(async () => {
      const result = await run()
      if (!result.ok) setError(result.error ?? 'That did not work')
      else router.refresh()
    })
  }

  if (reports.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing reported.</p>
  }

  return (
    <div className="space-y-4">
      <ErrorNote>{error}</ErrorNote>

      <TableToolbar view={view} placeholder="Search by name, kind or space…" unit="reports" />

      <ul className="space-y-3">
        {view.pageRows.map((report) => (
          <li key={report.id} className="rounded-xl border border-border bg-secondary/40 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">
                  {/*
                    The name as it was when somebody complained, not a join. By
                    now the thing may be down, retired or gone - see the note on
                    the column - and a row reading "a blueprint" and a uuid is
                    one nobody can act on.
                  */}
                  {report.title ?? <em className="text-muted-foreground">untitled</em>}
                  <span className="ml-2 rounded bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                    {REPORT_KIND_LABELS[report.kind]}
                  </span>
                  {report.hidden && (
                    <span className="ml-2 rounded bg-red-500/20 px-2 py-0.5 text-xs text-red-300">
                      taken down
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {report.spaceName ?? 'unknown space'}
                  {report.spaceSlug && ` (${report.spaceSlug})`}
                  {` · ${new Date(report.createdAt).toLocaleString()}`}
                </p>
              </div>
            </div>

            <p className="mt-3 text-sm text-muted-foreground">
              Reported: &ldquo;{report.reason}&rdquo;
            </p>

            {report.hidden && report.hiddenReason && (
              <p className="mt-1 text-xs text-muted-foreground">
                Taken down: {report.hiddenReason}
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              {report.hidden ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => act(() => showContent(report.targetId))}
                  className={BUTTON}
                >
                  Put it back
                </button>
              ) : (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    act(() =>
                      hideContent({
                        kind: report.kind,
                        targetId: report.targetId,
                        reason: report.reason,
                      }),
                    )
                  }
                  className={BUTTON}
                >
                  Take it down
                </button>
              )}

              {report.status === 'open' && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => act(() => dismissContentReport(report.id))}
                  className={BUTTON}
                >
                  Dismiss
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
