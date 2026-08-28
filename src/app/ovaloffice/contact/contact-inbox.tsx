'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { markContactHandled, reopenContactMessage } from '@/domain/contact/actions'
import type { ContactMessageView } from '@/domain/contact/queries'
import { ErrorNote } from '@/app/components/error-note'
import { Pager, TableToolbar, useTableView } from '@/app/ovaloffice/_table/table-view'

const FILTERS = [
  { id: 'open', label: 'Open' },
  { id: 'handled', label: 'Handled' },
  { id: 'all', label: 'All' },
] as const

/**
 * The second axis: which door it came in through.
 *
 * Its own row rather than three more values on the status row, because they are
 * independent questions - "open business inquiries" is the view that actually
 * matters and a single combined row cannot express it. Both are carried in the
 * URL so a view of the inbox stays a link.
 */
const KINDS = [
  { id: 'all', label: 'Everything' },
  { id: 'business', label: 'Business inquiries' },
  { id: 'general', label: 'Support' },
] as const

const BUTTON =
  'rounded-lg border border-border px-3 py-1.5 text-xs transition hover:bg-secondary disabled:opacity-50'

export function ContactInbox({
  messages,
  filter,
  kind,
  openBusiness,
}: {
  messages: ContactMessageView[]
  filter: string
  kind: string
  /** Open enquiries waiting, whichever view is on screen. */
  openBusiness: number
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

  // Changing one filter has to preserve the other, or the two rows fight:
  // picking "Handled" from the business view would drop you back into every
  // support message ever handled.
  const href = (next: { status?: string; kind?: string }) =>
    `/ovaloffice/contact?status=${next.status ?? filter}&kind=${next.kind ?? kind}`

  // Subject, sender, email, the body and where they wrote from are what an
  // operator scans for. The status/kind tabs page the server, so this searches
  // whatever slice they already narrowed to.
  const view = useTableView(
    messages,
    (message) =>
      `${message.subject} ${message.username} ${message.email} ${message.message} ${message.path ?? ''}`,
  )

  return (
    <div className="space-y-4">
      <nav className="flex gap-1 text-xs">
        {FILTERS.map((option) => (
          <Link
            key={option.id}
            href={href({ status: option.id })}
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

      <nav className="flex flex-wrap gap-1 text-xs">
        {KINDS.map((option) => (
          <Link
            key={option.id}
            href={href({ kind: option.id })}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 transition ${
              kind === option.id
                ? 'bg-secondary text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {option.label}
            {/* The badge lives on the business tab in every view, including the
                handled one - a count that empties when you change filter reads
                as "nothing waiting" rather than "not shown". */}
            {option.id === 'business' && openBusiness > 0 && (
              <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-500">
                {openBusiness}
              </span>
            )}
          </Link>
        ))}
      </nav>

      {error && <ErrorNote>{error}</ErrorNote>}

      {messages.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing here.</p>
      ) : (
        <div>
          <TableToolbar view={view} placeholder="Search by subject, sender or body…" unit="messages" />
          <ul className="space-y-3">
            {view.pageRows.map((message) => (
            <li
              key={message.id}
              /* An enquiry is picked out of a mixed list by its edge rather
                 than by its badge: in the "Everything" view the badge is one
                 more small word among five, and the border is visible before
                 anything is read. */
              className={`rounded-xl border bg-secondary/40 p-4 ${
                message.kind === 'business'
                  ? 'border-amber-500/40'
                  : 'border-border'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {message.kind === 'business' && (
                      <span className="mr-2 rounded bg-amber-500/20 px-2 py-0.5 text-xs text-amber-500">
                        business
                      </span>
                    )}
                    {message.subject}
                    {message.status === 'handled' && (
                      <span className="ml-2 rounded bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-500">
                        handled
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {message.username} ·{' '}
                    {message.signedIn ? 'signed in' : 'not signed in'} ·{' '}
                    {new Date(message.createdAt).toLocaleString()}
                    {message.path && ` · from ${message.path}`}
                  </p>
                </div>

                {/* The reply itself happens in a mail client - the subject is
                    carried over so the thread reads as an answer rather than as
                    a fresh message from strangers. */}
                <a
                  href={`mailto:${encodeURIComponent(message.email)}?subject=${encodeURIComponent(
                    `Re: ${message.subject}`,
                  )}`}
                  className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90"
                >
                  Reply ↗
                </a>
              </div>

              {/* The three answers a price is built from, above the prose
                  rather than inside it. They are what the reply has to be
                  correct about, and hunting for the date in a paragraph is how
                  a quote goes out for the wrong weekend. */}
              {message.kind === 'business' && (
                <dl className="mt-3 grid gap-3 rounded-lg border border-amber-500/20 bg-card px-3 py-2 text-sm sm:grid-cols-3">
                  {[
                    ['What', message.eventType],
                    ['When', message.eventWhen],
                    ['How many', message.eventSize],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className="mt-0.5">{value || '—'}</dd>
                    </div>
                  ))}
                </dl>
              )}

              <p className="mt-3 whitespace-pre-wrap rounded-lg bg-card px-3 py-2 text-sm">
                {message.message}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <a href={`mailto:${message.email}`} className="hover:text-foreground">
                  {message.email}
                </a>
                {message.phone && (
                  <a href={`tel:${message.phone.replace(/\s/g, '')}`} className="hover:text-foreground">
                    {message.phone}
                  </a>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {message.status === 'open' ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act(() => markContactHandled(message.id))}
                    className={BUTTON}
                  >
                    Mark handled
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act(() => reopenContactMessage(message.id))}
                    className={BUTTON}
                  >
                    Put it back
                  </button>
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
