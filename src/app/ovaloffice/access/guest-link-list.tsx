'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { revokeGuestLinkAsAdmin } from '@/domain/guests/actions'
import { guestLandingLabel, linkProblem } from '@/domain/guests/application'
import type { AdminGuestLinkRow } from '@/domain/guests/queries'
import { Pager, TableToolbar, useTableView } from '@/app/ovaloffice/_table/table-view'

/**
 * Every guest link in the system, across every space.
 *
 * A moderation surface rather than a working one, and the difference decides
 * what is on it. The space's own rail is where links get *made* - it has the
 * checkbox and the create button, because handing somebody a link is the
 * owner's act. This page exists for the question an owner cannot answer: is
 * anybody running an open door into a space they should not be, and can it be
 * shut from outside.
 *
 * So there is no create form here. A backoffice admin minting a guest link into
 * somebody else's space would be a strange thing to be able to do quietly, and
 * nothing has needed it.
 *
 * The link itself is deliberately not rendered, only its token's first
 * characters - and now the browser is not even *sent* the rest: the server
 * hands over a `tokenPreview` and keeps the token (see `AdminGuestLinkRow`).
 * This page lists every live token in the system on one screen, and a full set
 * of working links in a screenshot, a shoulder-surf, or the page's own RSC
 * payload is a worse outcome than an admin having to go to the space to copy
 * one.
 */

const BUTTON =
  'rounded-lg border border-border px-3 py-1.5 text-xs transition hover:bg-secondary disabled:opacity-50'

export interface AdminGuestLink extends AdminGuestLinkRow {
  tenantName: string
  tenantSlug: string
}

export function GuestLinkList({ links }: { links: AdminGuestLink[] }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, startTransition] = useTransition()

  function revoke(link: AdminGuestLink) {
    setError(null)
    // Confirmed because it is somebody else's space, and because revoking also
    // ejects whoever the link let in - a consequence the admin cannot see from
    // here, since occupancy is not counted across every space.
    if (!confirm(`Revoke this guest link into ${link.tenantName}? Anyone it let in is removed.`)) {
      return
    }
    startTransition(async () => {
      const result = await revokeGuestLinkAsAdmin(link.id)
      if (!result.ok) setError(result.error ?? 'That did not work')
      else router.refresh()
    })
  }

  // `linkProblem` decides what "live" means, rather than this component
  // re-deriving it from three columns. The redemption path and this list
  // disagreeing about whether a link is dead is exactly the bug that shape
  // exists to prevent - an admin should never be looking at a row marked live
  // that would refuse somebody, or vice versa.
  const live = links.filter((link) => linkProblem(link) === null)

  // Space name, slug and token prefix are what an operator scans for - the
  // name to find a customer, the prefix to match a link pasted in a support
  // thread.
  const view = useTableView(
    links,
    (link) => `${link.tenantName} ${link.tenantSlug} ${link.tokenPreview} ${link.label ?? ''}`,
  )

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">
          Guest links{' '}
          <span className="font-normal text-muted-foreground">
            ({live.length} live of {links.length})
          </span>
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Links that let somebody into a space with no account. Made by space owners in
          their own rail; revocable from here when they should not be open.
        </p>
      </div>

      {error && (
        <p role="alert" className="break-all text-xs text-red-400">
          {error}
        </p>
      )}

      {links.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nobody has made a guest link yet.</p>
      ) : (
        <div>
          <TableToolbar view={view} placeholder="Search by space or token…" unit="links" />
          <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-2 pr-4 font-medium">Space</th>
                <th className="py-2 pr-4 font-medium">Kind</th>
                {/* Where it lands somebody. The room is named by slug here
                    rather than by name - see `listAllGuestLinks`. */}
                <th className="py-2 pr-4 font-medium">Lands in</th>
                <th className="py-2 pr-4 font-medium">Entered</th>
                <th className="py-2 pr-4 font-medium">State</th>
                <th className="py-2 pr-4 font-medium">Token</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {view.pageRows.map((link) => {
                const problem = linkProblem(link)
                const state = link.revokedAt
                  ? 'revoked'
                  : problem
                    ? 'spent or expired'
                    : 'live'

                return (
                  <tr key={link.id} className="border-t border-border">
                    <td className="py-2 pr-4">
                      <span className="text-foreground">{link.tenantName}</span>
                      <span className="ml-1 text-muted-foreground">/{link.tenantSlug}</span>
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {link.maxUses === null ? 'Open' : `Single (${link.uses}/${link.maxUses})`}
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {guestLandingLabel(link.landing)}
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">{link.uses}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={`rounded px-1.5 py-0.5 ${
                          state === 'live'
                            ? 'bg-emerald-500/20 text-emerald-500'
                            : 'bg-card text-muted-foreground'
                        }`}
                      >
                        {state}
                      </span>
                    </td>
                    {/* Enough to tell two rows apart and to match against a
                        link somebody has pasted in a support thread. Not
                        enough to use. */}
                    <td className="py-2 pr-4 font-mono text-muted-foreground">
                      {link.tokenPreview}…
                    </td>
                    <td className="py-2 text-right">
                      {!link.revokedAt && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => revoke(link)}
                          className={BUTTON}
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
          <Pager view={view} />
        </div>
      )}
    </section>
  )
}
