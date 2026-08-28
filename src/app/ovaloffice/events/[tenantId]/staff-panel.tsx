'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  inviteEventStaff,
  joinEventSpace,
  leaveEventSpace,
  removeEventStaff,
  setEventStaffRole,
} from '@/domain/events/staff-actions'
import { ErrorNote } from '@/app/components/error-note'

export interface StaffMember {
  userId: string
  username: string
  role: 'owner' | 'admin' | 'member' | 'guest'
}

export interface StaffInvitation {
  invitee: string
  label: string
  role: string
}

/**
 * Who runs this event, operated from outside it.
 *
 * This panel exists because the operator is no longer a member of the spaces
 * they build - see 20260903000000 - so the space's own members page is a 404
 * for them. Every button here appends to the customer's tenant stream as the
 * platform, stamped with the operator's own id.
 *
 * The order is the order of the job: hand it to the people who will run it,
 * see who has it, and only then the two buttons about yourself.
 */
export function StaffPanel({
  tenantId,
  slug,
  members,
  invitations,
  viewerIsMember,
}: {
  tenantId: string
  slug: string
  members: StaffMember[]
  invitations: StaffInvitation[]
  viewerIsMember: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [invitee, setInvitee] = useState('')
  const [role, setRole] = useState<'admin' | 'member'>('admin')

  function run(id: string, work: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null)
    setBusy(id)
    startTransition(async () => {
      const result = await work()
      setBusy(null)
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  const owners = members.filter((member) => member.role === 'owner').length

  return (
    <section className="space-y-4 rounded-xl border border-line bg-surface-raised/40 p-5">
      <div>
        <h3 className="font-semibold text-ink">Staff</h3>
        <p className="mt-1 text-sm text-ink-muted">
          The people who run this event, in their space. You are not one of them
          unless you say so — building it does not put you in it.
          {owners === 0 && (
            <>
              {' '}
              <span className="text-amber-300">
                Nobody owns this space yet. Invite the customer as an admin and
                promote them once they have accepted.
              </span>
            </>
          )}
        </p>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={invitee}
          onChange={(changed) => setInvitee(changed.target.value)}
          placeholder="username or email"
          aria-label="Who to invite"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
        <select
          value={role}
          onChange={(changed) => setRole(changed.target.value as 'admin' | 'member')}
          aria-label="Role"
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        >
          <option value="admin">Admin</option>
          <option value="member">Member</option>
        </select>
        <button
          type="button"
          disabled={pending || !invitee.trim()}
          onClick={() =>
            run('invite', async () => {
              const result = await inviteEventStaff(tenantId, invitee.trim(), role)
              if (result.ok) setInvitee('')
              return result
            })
          }
          className="rounded-lg border border-accent/60 bg-accent/15 px-3 py-2 text-sm text-ink transition hover:bg-accent/25 disabled:opacity-40"
        >
          {busy === 'invite' ? 'Inviting…' : 'Invite'}
        </button>
      </div>

      {/*
        Ownership is a promotion rather than an invitation, because an
        invitation can only carry admin or member - see `invitableRoleSchema`.
        Which is the right order anyway: you hand a space over to somebody who
        has actually turned up.
      */}
      <ul className="space-y-2">
        {members.length === 0 && invitations.length === 0 && (
          <li className="text-sm text-ink-muted">Nobody yet.</li>
        )}

        {members.map((member) => (
          <li
            key={member.userId}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line px-3 py-2"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm">{member.username}</span>
              <span className="block text-xs text-ink-muted">{member.role}</span>
            </span>

            <span className="flex shrink-0 gap-2">
              {member.role !== 'owner' && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(member.userId, () => setEventStaffRole(tenantId, member.userId, 'owner'))
                  }
                  className="rounded-lg border border-line px-2.5 py-1 text-xs text-ink-muted transition hover:border-accent/60 hover:text-ink disabled:opacity-40"
                >
                  Make owner
                </button>
              )}
              <button
                type="button"
                disabled={pending}
                onClick={() => run(member.userId, () => removeEventStaff(tenantId, member.userId))}
                className="rounded-lg border border-line px-2.5 py-1 text-xs text-ink-muted transition hover:border-red-400/50 hover:text-red-300 disabled:opacity-40"
              >
                Remove
              </button>
            </span>
          </li>
        ))}

        {invitations.map((invitation) => (
          <li
            key={invitation.invitee}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-line px-3 py-2"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm text-ink-muted">{invitation.label}</span>
              <span className="block text-xs text-ink-muted">
                invited as {invitation.role} · not accepted yet
              </span>
            </span>
          </li>
        ))}
      </ul>

      {/*
        The two buttons about the operator themselves, kept apart from the
        list because they are the only ones that change who *you* are here.
      */}
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        {viewerIsMember ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run('leave', () => leaveEventSpace(tenantId))}
            className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink-muted transition hover:border-red-400/50 hover:text-red-300 disabled:opacity-40"
          >
            {busy === 'leave' ? 'Leaving…' : 'Step back out of this space'}
          </button>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => run('join', () => joinEventSpace(tenantId, 'admin'))}
            className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink-muted transition hover:border-accent/60 hover:text-ink disabled:opacity-40"
          >
            {busy === 'join' ? 'Joining…' : 'Put me in this space as an admin'}
          </button>
        )}

        <span className="text-xs text-ink-muted">
          {viewerIsMember ? (
            <>
              You are in <span className="text-ink">/t/{slug}</span> and its staff can see you.
            </>
          ) : (
            <>You can run everything on this page without being in the room.</>
          )}
        </span>
      </div>
    </section>
  )
}
