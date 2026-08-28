'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  approveApplication,
  rejectApplication,
  reopenApplication,
} from '@/domain/access/actions'
import type { ApplicationView } from '@/domain/access/queries'
import { ErrorNote } from '@/app/components/error-note'
import { Pager, TableToolbar, useTableView } from '@/app/ovaloffice/_table/table-view'

/**
 * The waiting list.
 *
 * Two ways to approve, side by side, because they are genuinely different jobs
 * rather than a default and a fallback. "Approve" mints the invite and leaves
 * the link for the admin to send however they like; "Approve & email" also asks
 * Supabase's auth mailer to deliver it. An installation with no outbound mail
 * configured needs the first, and pretending the second always works would mean
 * an admin marking somebody invited who never hears anything.
 *
 * The consent evidence is shown on the row rather than hidden behind a detail
 * view. It is the whole reason those columns exist, and evidence nobody can see
 * is evidence nobody will check.
 */

const FILTERS = [
  { id: 'pending', label: 'Waiting' },
  { id: 'invited', label: 'Invited' },
  { id: 'rejected', label: 'Turned down' },
  { id: 'all', label: 'All' },
] as const

const BUTTON =
  'rounded-lg border border-border px-3 py-1.5 text-xs transition hover:bg-secondary disabled:opacity-50'

export function ApplicationQueue({
  applications,
  filter,
  pending,
}: {
  applications: ApplicationView[]
  filter: string
  pending: number
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, startTransition] = useTransition()

  // The status chips filter server-side (they navigate), so `applications`
  // already arrives narrowed; search composes on top of it. Address, username
  // and note are what an admin scans for.
  const view = useTableView(
    applications,
    (a) => `${a.email} ${a.username ?? ''} ${a.note ?? ''}`,
  )

  function act(run: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const result = await run()
      if (!result.ok) setError(result.error ?? 'That did not work')
      else {
        if (result.message) setNotice(result.message)
        router.refresh()
      }
    })
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">
          Applications
          {pending > 0 && (
            <span className="ml-2 rounded-full bg-primary text-primary-foreground px-2 py-0.5 text-xs font-medium text-white">
              {pending}
            </span>
          )}
        </h3>

        <nav className="flex gap-1 text-xs">
          {FILTERS.map((option) => (
            <Link
              key={option.id}
              href={`/ovaloffice/access?status=${option.id}`}
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
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}
      {notice && (
        <p role="status" className="rounded-lg bg-emerald-600/15 px-3 py-2 text-sm text-emerald-500">
          {notice}
        </p>
      )}

      {applications.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {filter === 'pending' ? 'Nobody is waiting.' : 'Nothing here.'}
        </p>
      ) : (
        <div>
          <TableToolbar view={view} placeholder="Search by email, username or note…" unit="applications" />
          <ul className="space-y-3">
          {view.pageRows.map((application) => (
            <li
              key={application.id}
              className="rounded-xl border border-border bg-secondary/40 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {application.email}
                    {application.status === 'invited' && (
                      <span className="ml-2 rounded bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-500">
                        invited
                      </span>
                    )}
                    {application.status === 'rejected' && (
                      <span className="ml-2 rounded bg-card px-2 py-0.5 text-xs text-muted-foreground">
                        turned down
                      </span>
                    )}
                  </p>

                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {application.username ? `${application.username} · ` : ''}
                    applied {new Date(application.createdAt).toLocaleString()}
                  </p>

                  {application.note && (
                    <p className="mt-2 text-sm whitespace-pre-wrap text-muted-foreground">
                      {application.note}
                    </p>
                  )}

                  {/* The consent record. Shown in full - the tick on its own is
                      not the evidence, the time and the address are. */}
                  <p className="mt-2 text-xs">
                    {application.newsletterConsent ? (
                      <span className="text-muted-foreground">
                        <span className="text-emerald-500">✓ newsletter</span> — agreed{' '}
                        {application.consentAt
                          ? new Date(application.consentAt).toLocaleString()
                          : 'at an unknown time'}
                        {application.consentIp && ` from ${application.consentIp}`}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">no newsletter</span>
                    )}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {application.status === 'pending' ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => act(() => approveApplication(application.id))}
                        className={BUTTON}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          act(() =>
                            approveApplication(application.id, { sendEmail: true }),
                          )
                        }
                        className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                      >
                        Approve &amp; email
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (!confirm(`Turn down ${application.email}?`)) return
                          act(() => rejectApplication(application.id))
                        }}
                        className={BUTTON}
                      >
                        Turn down
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => act(() => reopenApplication(application.id))}
                      className={BUTTON}
                    >
                      Back to waiting
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
    </section>
  )
}
