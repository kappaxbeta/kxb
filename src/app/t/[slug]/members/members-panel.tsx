'use client'

import { useState, useTransition } from 'react'
import {
  type ActionResult,
  archiveTenant,
  changeMemberRole,
  inviteMember,
  leaveTenant,
  removeMember,
  renameTenant,
  revokeInvitation,
} from '@/domain/tenants/actions'
import type { InvitationView, TenantMemberView } from '@/domain/tenants/queries'
import type { TenantRoleName } from '@/lib/supabase/types'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { workspaceDict } from '@/app/i18n/workspace'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * Membership management.
 *
 * Nothing here is optimistic, unlike the task list. Role changes are rare,
 * consequential, and occasionally refused by the decider ("the last owner
 * cannot leave"), so showing the change before the server has agreed to it
 * would be showing a lie more often than it would save a spinner. Optimism is
 * for the common case that almost always succeeds.
 */

/**
 * `guest` is here to satisfy the union rather than because this panel renders
 * it. A guest holds no `tenant_members` row, so no row in this list can carry
 * the role and the string is unreachable in practice - but writing it out is
 * cheaper than a cast, and a cast would go stale silently the next time the
 * union grows. Guests are managed on the settings page, beside the links that
 * let them in.
 */
export function MembersPanel({
  slug,
  currentUserId,
  currentRole,
  archived,
  members,
  invitations,
  canInvite,
  canManageRoles,
}: {
  slug: string
  currentUserId: string
  currentRole: TenantRoleName
  archived: boolean
  members: TenantMemberView[]
  invitations: InvitationView[]
  canInvite: boolean
  canManageRoles: boolean
}) {
  const refusal = useRefusal()
  const t = workspaceDict(useLocale()).members
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function run(action: () => Promise<ActionResult>) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (!result.ok) setError(refusal(result.error))
    })
  }

  async function handleInvite(formData: FormData) {
    const invitee = String(formData.get('invitee') ?? '').trim()
    const role = String(formData.get('role') ?? 'member')
    if (!invitee) return

    setError(null)
    const result = await inviteMember(slug, invitee, role)
    if (!result.ok) setError(refusal(result.error))
  }

  async function handleRename(formData: FormData) {
    const name = String(formData.get('name') ?? '').trim()
    if (!name) return

    setError(null)
    const result = await renameTenant(slug, name)
    if (!result.ok) setError(refusal(result.error))
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section>
        <h2 className="text-sm font-semibold">{t.heading}</h2>

        <div className="mt-2 min-h-5">
          {error && (
            <p role="alert" className="text-sm text-red-500">
              {error}
            </p>
          )}
        </div>

        <ul className="mt-2 space-y-1.5">
          {members.map((member) => (
            <li
              key={member.userId}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface-raised px-3 py-2.5"
            >
              <span className="flex-1 text-sm">
                {member.username}
                {member.userId === currentUserId && (
                  <span className="ml-2 text-xs text-ink-muted">{t.you}</span>
                )}
              </span>

              {canManageRoles && member.userId !== currentUserId ? (
                <select
                  defaultValue={member.role}
                  disabled={isPending || archived}
                  aria-label={fill(t.roleFor, { name: member.username })}
                  onChange={(e) =>
                    run(() => changeMemberRole(slug, member.userId, e.target.value))
                  }
                  className="rounded border border-line bg-surface px-2 py-1 text-xs outline-none focus:border-accent"
                >
                  <option value="owner">{t.roles.owner}</option>
                  <option value="admin">{t.roles.admin}</option>
                  <option value="member">{t.roles.member}</option>
                </select>
              ) : (
                <span
                  title={t.roleHelp[member.role]}
                  className="rounded bg-surface px-1.5 py-0.5 font-mono text-xs text-ink-muted"
                >
                  {t.roles[member.role]}
                </span>
              )}

              {canInvite && member.userId !== currentUserId && (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => run(() => removeMember(slug, member.userId))}
                  className="text-sm text-ink-muted hover:text-red-500 disabled:opacity-50"
                >
                  {t.remove}
                </button>
              )}
            </li>
          ))}
        </ul>

        {invitations.length > 0 && (
          <>
            <h2 className="mt-8 text-sm font-semibold">{t.pending}</h2>
            <ul className="mt-2 space-y-1.5">
              {invitations.map((invitation) => (
                <li
                  key={invitation.invitee}
                  className="flex items-center gap-3 rounded-lg border border-dashed border-line px-3 py-2.5"
                >
                  <span className="flex-1 text-sm text-ink-muted">{invitation.label}</span>
                  <span className="rounded bg-surface px-1.5 py-0.5 font-mono text-xs text-ink-muted">
                    {t.roles[invitation.role]}
                  </span>
                  {canInvite && (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => run(() => revokeInvitation(slug, invitation.invitee))}
                      className="text-sm text-ink-muted hover:text-red-500 disabled:opacity-50"
                    >
                      {t.revoke}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <aside className="space-y-6">
        {canInvite && (
          <div className="rounded-lg border border-line bg-surface-raised p-4">
            <h2 className="text-sm font-semibold">{t.invite}</h2>
            <form action={handleInvite} className="mt-3 space-y-2">
              {/* One field, not two. Whether this is a handle or an address is
                  our problem, not the person typing it - the `@` decides, the
                  same way every sign-in form already works. */}
              <input
                name="invitee"
                type="text"
                required
                placeholder={t.inviteePlaceholder}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-label={t.inviteeLabel}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <select
                name="role"
                defaultValue="member"
                aria-label={t.roleLabel}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
              >
                <option value="member">{t.roles.member}</option>
                <option value="admin">{t.roles.admin}</option>
              </select>
              <button
                type="submit"
                className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
              >
                {t.send}
              </button>
            </form>
            <p className="mt-2 text-xs text-ink-muted">
              {t.inviteNote}
            </p>
          </div>
        )}

        {canManageRoles && !archived && (
          <div className="rounded-lg border border-line bg-surface-raised p-4">
            <h2 className="text-sm font-semibold">{t.rename}</h2>
            <form action={handleRename} className="mt-3 space-y-2">
              <input
                name="name"
                required
                maxLength={80}
                placeholder={t.newName}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <button
                type="submit"
                className="w-full rounded-lg border border-line px-4 py-2 text-sm transition hover:bg-surface"
              >
                {t.renameCta}
              </button>
            </form>
            <p className="mt-2 text-xs text-ink-muted">
              {t.urlStaysLead}
              <span className="font-mono">/t/{slug}</span>
              {t.urlStaysTail}
            </p>
          </div>
        )}

        <div className="rounded-lg border border-dashed border-line p-4">
          <h2 className="text-sm font-semibold">{t.leave}</h2>
          <p className="mt-1 text-sm text-ink-muted">{t.leaveNote}</p>
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => leaveTenant(slug))}
            className="mt-3 rounded-lg border border-line px-3 py-1.5 text-sm transition hover:bg-surface-raised disabled:opacity-50"
          >
            {t.leaveCta}
          </button>

          {currentRole === 'owner' && !archived && (
            <>
              <p className="mt-4 text-sm text-ink-muted">{t.archiveNote}</p>
              <button
                type="button"
                disabled={isPending}
                onClick={() => run(() => archiveTenant(slug))}
                className="mt-2 rounded-lg border border-line px-3 py-1.5 text-sm transition hover:bg-surface-raised disabled:opacity-50"
              >
                {t.archive}
              </button>
            </>
          )}
        </div>
      </aside>
    </div>
  )
}
