import { env } from '@/lib/env'
import { listSubscribers } from '@/domain/news-signup/queries'
import { requireBackofficeSection } from '@/lib/backoffice'

export const dynamic = 'force-dynamic'

/**
 * Who asked to hear from us, and what exactly they agreed to.
 *
 * ---------------------------------------------------------------------------
 * A consent log that happens to be a mailing list
 * ---------------------------------------------------------------------------
 * The wording is on the page rather than behind a column heading, because it
 * is the whole point of the table. When somebody complains, the question is
 * "what did this person read and when", and a list of addresses cannot answer
 * it. Each row carries the sentence that was on screen when they ticked the
 * box - not a version number pointing at a document that may since have
 * changed.
 *
 * ---------------------------------------------------------------------------
 * The confirm link is here on purpose
 * ---------------------------------------------------------------------------
 * There is no confirmation mail yet: this app has no outbound mail of its own,
 * so a signup lands pending and stays there. Showing the link means a pending
 * signup is not stuck - somebody can be sent theirs by hand - and it is the
 * honest shape for a half-built feature: the machinery works, the delivery
 * does not, and the gap is visible rather than silent.
 *
 * It comes out when the sender lands. A confirm token on an operator's screen
 * is a credential in a screenshot, and the only thing making that acceptable
 * today is that there is currently no other way to use it.
 */
export default async function NewsletterPage() {
  const { supabase } = await requireBackofficeSection('newsletter')
  const { subscribers, counts } = await listSubscribers(supabase)
  const origin = env.appUrl()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Newsletter</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Addresses that asked for news about Project Oasis, and the exact
          sentence each one agreed to. Nothing may be sent to a row until it is
          confirmed.
        </p>
      </div>

      <div className="flex gap-3 text-sm">
        {(
          [
            ['Confirmed', counts.confirmed],
            ['Pending', counts.pending],
            ['Unsubscribed', counts.unsubscribed],
          ] as const
        ).map(([label, n]) => (
          <div key={label} className="rounded-md border border-border px-3 py-2">
            <span className="font-mono tabular-nums">{n}</span>{' '}
            <span className="text-muted-foreground">{label.toLowerCase()}</span>
          </div>
        ))}
      </div>

      {counts.pending > 0 ? (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {counts.pending} {counts.pending === 1 ? 'person is' : 'people are'} waiting
          on a confirmation email this app cannot send yet — it has no outbound
          mail of its own. Until that lands, the confirm link below is how
          somebody gets confirmed.
        </p>
      ) : null}

      {subscribers.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nobody has signed up yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {subscribers.map((s) => {
            const state = s.unsubscribedAt
              ? 'unsubscribed'
              : s.confirmedAt
                ? 'confirmed'
                : 'pending'

            return (
              <li key={s.id} className="px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-medium">{s.email}</span>
                  <span className="font-mono text-xs uppercase text-muted-foreground">
                    {s.locale}
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs ${
                      state === 'confirmed'
                        ? 'border-border text-foreground'
                        : 'border-border text-muted-foreground'
                    }`}
                  >
                    {state}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(s.consentedAt).toLocaleString()}
                    {s.sourcePath ? ` · ${s.sourcePath}` : ''}
                  </span>
                </div>

                {/* The record itself. Quoted rather than paraphrased. */}
                <p className="mt-2 max-w-prose text-xs leading-relaxed text-muted-foreground">
                  “{s.consentText}”
                </p>

                {state === 'pending' ? (
                  <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                    {origin}/news/confirm/{s.token}
                  </p>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
