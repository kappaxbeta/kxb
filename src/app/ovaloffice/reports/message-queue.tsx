'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  dismissMessageReport,
  hideChatMessage,
  unhideChatMessage,
} from '@/domain/moderation/actions'
import type { MessageReportView } from '@/domain/moderation/queries'
import { ErrorNote } from '@/app/components/error-note'
import { Pager, TableToolbar, useTableView } from '@/app/ovaloffice/_table/table-view'

/**
 * Reported chat messages.
 *
 * Deliberately not the same component as the world queue next door, even though
 * the buttons line up one for one. What an admin needs in front of them is
 * different in the way that matters: a world is a place you have to go and look
 * at, so that queue is a list of links; a message is the whole of the evidence,
 * so this one puts the words on the page and asks for a decision.
 *
 * The reporter is not shown, here or anywhere. `reported_by` is on the row - it
 * is what makes a pattern of bad-faith reporting findable later - but putting it
 * in the queue would make the person deciding aware of who complained, which is
 * exactly the thing that stops people complaining.
 */

const BUTTON =
  'rounded-lg border border-border px-3 py-1.5 text-xs transition hover:bg-secondary disabled:opacity-50'

export function MessageQueue({ reports }: { reports: MessageReportView[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // The words themselves, the reason given, the author and the space are what an
  // admin scans - reporter is deliberately left out here as it is everywhere.
  const view = useTableView(
    reports,
    (report) =>
      `${report.body ?? ''} ${report.reason} ${report.authorName ?? ''} ${report.spaceName ?? ''} ${report.spaceSlug ?? ''}`,
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
    return <p className="text-sm text-muted-foreground">No reported messages.</p>
  }

  return (
    <div className="space-y-4">
      <ErrorNote>{error}</ErrorNote>

      <TableToolbar view={view} placeholder="Search by message, author or space…" unit="reports" />

      <ul className="space-y-3">
        {view.pageRows.map((report) => (
          <li
            key={report.id}
            className="rounded-xl border border-border bg-secondary/40 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">
                  {report.authorName ?? 'someone'}
                  {report.hidden && (
                    <span className="ml-2 rounded bg-red-500/20 px-2 py-0.5 text-xs text-red-300">
                      hidden
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {report.spaceName ?? 'unknown space'}
                  {report.spaceSlug && ` (${report.spaceSlug})`}
                  {report.saidAt &&
                    ` · said ${new Date(report.saidAt).toLocaleString()}`}
                </p>
              </div>
            </div>

            {/*
              The message itself, quoted plainly. `whitespace-pre-wrap` because a
              message written across three lines was written that way, and
              collapsing it changes what is being judged.
            */}
            <blockquote className="mt-3 whitespace-pre-wrap break-words rounded-lg border-l-2 border-border bg-card px-3 py-2 text-sm">
              {report.body ?? <em className="text-muted-foreground">The message is gone.</em>}
            </blockquote>

            <p className="mt-2 text-sm text-muted-foreground">
              Reported: “{report.reason}”
            </p>

            {report.hidden && report.hiddenReason && (
              <p className="mt-1 text-xs text-muted-foreground">
                Hidden: {report.hiddenReason}
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              {report.hidden ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => act(() => unhideChatMessage(report.messageId))}
                  className={BUTTON}
                >
                  Put it back
                </button>
              ) : (
                <button
                  type="button"
                  disabled={pending || !report.body}
                  onClick={() => {
                    const reason = prompt('Why is this message being hidden?')
                    if (!reason) return
                    act(() => hideChatMessage(report.messageId, reason))
                  }}
                  className="rounded-lg border border-red-400/50 px-3 py-1.5 text-xs text-red-300 transition hover:bg-red-500/15 disabled:opacity-50"
                >
                  Hide this message
                </button>
              )}

              {report.status === 'open' && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => act(() => dismissMessageReport(report.id))}
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
  )
}
