import Link from 'next/link'
import { InvitationActions } from '@/app/invitations/invitation-actions'
import { listMyInvitations } from '@/domain/tenants/queries'
import { requireUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * Invitations addressed to you, across every workspace.
 *
 * This page reads rows belonging to tenants you are not a member of, which
 * every other page in the app is forbidden from doing. It works because the
 * invitation row is itself the grant: the RLS policies on tenant_invitations
 * and tenants_read_model admit a caller the invitation is addressed to. Revoke
 * the invitation and the rows vanish from under them.
 *
 * "Addressed to" is no longer just "whose email matches". An invitation to an
 * account names it directly; one to a mailbox is matched through
 * my_pending_invitations(), because the address itself lives in a table the
 * invitee cannot read. Both routes land here.
 */
export default async function InvitationsPage() {
  const { user, supabase } = await requireUser()

  const invitations = await listMyInvitations(supabase)

  return (
    <div className="mx-auto min-h-screen w-full max-w-2xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Invitations</h1>
        <p className="mt-1 text-sm text-ink-muted">Addressed to {user.email}</p>
      </header>

      {invitations.length === 0 ? (
        <p className="text-sm text-ink-muted">
          Nothing pending.{' '}
          <Link href="/tenants" className="text-accent hover:underline">
            Back to your spaces
          </Link>
          .
        </p>
      ) : (
        <ul className="space-y-1.5">
          {invitations.map((invitation) => (
            <li
              key={invitation.tenantId}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface-raised px-3 py-2.5"
            >
              <div className="flex-1">
                <p className="text-sm font-medium">{invitation.tenantName}</p>
                <p className="text-xs text-ink-muted">
                  as {invitation.role} · invited{' '}
                  {new Date(invitation.invitedAt).toLocaleDateString()}
                </p>
              </div>
              <InvitationActions slug={invitation.tenantSlug} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
