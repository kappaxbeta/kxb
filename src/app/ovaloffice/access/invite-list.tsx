'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { createInvite, emailInvite, revokeInvite } from '@/domain/access/actions'
import type { InviteView } from '@/domain/access/queries'
import { ErrorNote } from '@/app/components/error-note'
import { Pager, TableToolbar, useTableView } from '@/app/ovaloffice/_table/table-view'

/**
 * The keys, and the form for cutting a new one.
 *
 * The link is built in the browser from `window.location.origin` rather than
 * handed down from the server. That is not laziness about NEXT_PUBLIC_APP_URL -
 * it is that an admin copying a link almost always wants the host they are
 * currently on, and a staging backoffice that hands out production links is a
 * quietly wrong answer that looks right.
 */

const BUTTON =
  'rounded-lg border border-border px-3 py-1.5 text-xs transition hover:bg-secondary disabled:opacity-50'

const STATE_STYLE: Record<InviteView['state'], string> = {
  live: 'bg-emerald-500/20 text-emerald-500',
  revoked: 'bg-card text-muted-foreground',
  expired: 'bg-card text-muted-foreground',
  spent: 'bg-card text-muted-foreground',
}

export function InviteList({ invites, live }: { invites: InviteView[]; live: number }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [busy, startTransition] = useTransition()

  // Address, note, token and state are what an admin scans for - the mailbox
  // or who-it's-for to find a row, the token to match a link pasted elsewhere.
  const view = useTableView(
    invites,
    (i) => `${i.email ?? ''} ${i.note ?? ''} ${i.token} ${i.state}`,
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

  async function copy(invite: InviteView) {
    const link = `${window.location.origin}/signup?invite=${invite.token}`
    try {
      await navigator.clipboard.writeText(link)
      setCopied(invite.id)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      // Clipboard access can be refused - an insecure origin, or a browser
      // that wants a user gesture it did not see. Falling back to showing the
      // link beats a button that silently does nothing.
      setError(link)
    }
  }

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-semibold">
        Invitations
        <span className="ml-2 text-xs font-normal text-muted-foreground">{live} usable</span>
      </h3>

      <ErrorNote className="break-all">{error}</ErrorNote>
      {notice && (
        <p role="status" className="rounded-lg bg-emerald-600/15 px-3 py-2 text-sm text-emerald-500">
          {notice}
        </p>
      )}

      <form
        action={(formData) => {
          act(() =>
            createInvite({
              email: String(formData.get('email') ?? '').trim(),
              note: String(formData.get('note') ?? ''),
              maxUses: Number(formData.get('maxUses') ?? 1),
              days: Number(formData.get('days') ?? 14),
            }),
          )
        }}
        className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5"
      >
        <input
          name="email"
          type="email"
          placeholder="email (optional)"
          aria-label="Email address"
          className="min-w-48 flex-1 rounded-lg border border-border bg-card px-2 py-1.5 text-sm"
        />
        <input
          name="note"
          placeholder="who is this for"
          aria-label="Note"
          className="min-w-40 flex-1 rounded-lg border border-border bg-card px-2 py-1.5 text-sm"
        />
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          uses
          <input
            name="maxUses"
            type="number"
            min={1}
            max={500}
            defaultValue={1}
            aria-label="How many accounts this invite may create"
            className="w-16 rounded-lg border border-border bg-card px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          days
          <input
            name="days"
            type="number"
            min={1}
            max={365}
            defaultValue={14}
            aria-label="Days until it expires"
            className="w-16 rounded-lg border border-border bg-card px-2 py-1.5 text-sm"
          />
        </label>
        <button type="submit" disabled={busy} className={BUTTON}>
          Create invite
        </button>
        <p className="w-full text-xs text-muted-foreground">
          Leave the address blank for a link anybody can use, up to the number of
          uses. With an address, only that mailbox can redeem it.
        </p>
      </form>

      {invites.length === 0 ? (
        <p className="text-sm text-muted-foreground">No invitations yet.</p>
      ) : (
        <div>
          <TableToolbar view={view} placeholder="Search by email, note or token…" unit="invites" />
          <ul className="space-y-2">
          {view.pageRows.map((invite) => (
            <li
              key={invite.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2.5 text-sm"
            >
              <span className={`rounded px-2 py-0.5 text-xs ${STATE_STYLE[invite.state]}`}>
                {invite.state}
              </span>

              <span className="min-w-0 flex-1">
                <span className="truncate">
                  {invite.email ?? <span className="text-muted-foreground">anyone with the link</span>}
                </span>
                {invite.note && (
                  <span className="ml-2 text-xs text-muted-foreground">— {invite.note}</span>
                )}
                <span className="ml-2 text-xs text-muted-foreground">
                  {invite.uses}/{invite.maxUses} used
                  {invite.expiresAt &&
                    ` · expires ${new Date(invite.expiresAt).toLocaleDateString()}`}
                </span>
              </span>

              <button
                type="button"
                onClick={() => copy(invite)}
                className={BUTTON}
                disabled={busy}
              >
                {copied === invite.id ? 'Copied' : 'Copy link'}
              </button>

              {invite.email && invite.state === 'live' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act(() => emailInvite(invite.id))}
                  className={BUTTON}
                >
                  Email it
                </button>
              )}

              {invite.state === 'live' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (!confirm('Revoke this invitation?')) return
                    act(() => revokeInvite(invite.id))
                  }}
                  className="text-xs text-muted-foreground transition hover:text-red-500 disabled:opacity-50"
                >
                  revoke
                </button>
              )}
            </li>
          ))}
          </ul>
          <Pager view={view} />
        </div>
      )}
    </section>
  )
}
