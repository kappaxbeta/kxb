'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { tenantDecider } from '@/domain/tenants/aggregate'
import { inviteMemberSchema, changeRoleSchema } from '@/domain/tenants/commands'
import { tokenInvitee, userInvitee } from '@/domain/tenants/events'
import { tenantsProjection } from '@/domain/tenants/projection'
import { resolveSeatLimit } from '@/domain/flags/queries'
import { recordBackofficeAction } from '@/domain/backoffice/audit'
import { executeCommand } from '@/es/command'
import { ConcurrencyError, DomainError } from '@/es/errors'
import { runProjection } from '@/es/projection'
import { requireBackofficeSection } from '@/lib/backoffice'

export type StaffResult = { ok: true } | { ok: false; error: string }

/**
 * ---------------------------------------------------------------------------
 * Running somebody else's space without being in it
 * ---------------------------------------------------------------------------
 * Every action here appends to a tenant stream the operator is not a member
 * of. Two things make that possible and neither is incidental:
 *
 *   * `is_backoffice_admin()` in `events_insert_tenant`, added in
 *     20260903000000. The database, not this file, is what decides an operator
 *     may write here - so a bug in this file is a bug, not a hole.
 *   * `platform: true` on the command, which satisfies `requireRole` in the
 *     decider and nothing else. Every other rule still applies: the last owner
 *     still cannot be removed, an archived space still refuses writes.
 *
 * `actorId` is the operator's own id throughout. The customer's log therefore
 * says which person at this company invited their staff, which is the whole
 * point of not doing this with the service role.
 *
 * Projections run with the service-role client, because the read models are
 * gated on membership - `rooms_insert` is `is_tenant_member(tenant_id)` - and
 * an operator is deliberately not one. Same split the event console already
 * uses to read a space it does not belong to.
 */

function toError(error: unknown): StaffResult {
  if (error instanceof DomainError) return { ok: false, error: error.message }
  if (error instanceof ConcurrencyError) {
    return { ok: false, error: 'That space was changed elsewhere. Try again.' }
  }
  throw error
}

const tenantIdSchema = z.uuid()

/**
 * Invite the people who will actually run this event.
 *
 * The lookup RPCs are the space's own - amended in 20260903010000 to admit a
 * backoffice admin - so an operator inviting somebody and a host inviting them
 * resolve the addressee by identical code. The one difference is which client
 * writes `tenant_invitation_emails`: that table is gated on owner-or-admin
 * membership, so the address goes in with the service role.
 */
export async function inviteEventStaff(
  tenantId: string,
  invitee: string,
  role: string,
): Promise<StaffResult> {
  const id = tenantIdSchema.safeParse(tenantId)
  if (!id.success) return { ok: false, error: 'Unknown event' }

  const parsed = inviteMemberSchema.safeParse({ invitee, role })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid invitation' }
  }

  const { supabase, admin, user } = await requireBackofficeSection('events', 'write')

  const typed = parsed.data.invitee
  const isEmail = typed.includes('@')

  const { data: foundUserId, error: lookupError } = await supabase.rpc(
    isEmail ? 'lookup_invitee_by_email' : 'lookup_invitee_by_username',
    isEmail
      ? { p_tenant_id: id.data, p_email: typed }
      : { p_tenant_id: id.data, p_username: typed },
  )

  if (lookupError) {
    return { ok: false, error: `Could not look that person up: ${lookupError.message}` }
  }

  if (!isEmail && !foundUserId) {
    return { ok: false, error: `Nobody here goes by "${typed}"` }
  }

  let key: string

  if (foundUserId) {
    key = userInvitee(foundUserId)
  } else {
    // Reuse a pending invitation's token, exactly as `inviteMember` does and
    // for the same reason: two tokens for one mailbox means two invitations to
    // one space landing in front of the same person.
    const { data: pending } = await admin
      .from('tenant_invitation_emails')
      .select('invitee_key')
      .eq('tenant_id', id.data)
      .eq('email', typed)
      .maybeSingle()

    key = pending?.invitee_key ?? tokenInvitee(randomUUID().replace(/-/g, ''))

    const { error: addressError } = await admin.from('tenant_invitation_emails').upsert(
      { tenant_id: id.data, invitee_key: key, email: typed },
      { onConflict: 'tenant_id,invitee_key' },
    )

    if (addressError) {
      return { ok: false, error: `Could not save that invitation: ${addressError.message}` }
    }
  }

  const seatLimit = await resolveSeatLimit(admin, id.data)

  try {
    await executeCommand({
      supabase,
      decider: tenantDecider,
      tenantId: id.data,
      streamId: id.data,
      command: {
        type: 'InviteMember',
        actorId: user.id,
        invitee: key,
        role: parsed.data.role,
        seatLimit,
        platform: true,
      },
      metadata: { actorId: user.id, platform: true },
    })
  } catch (error) {
    return toError(error)
  }

  await runProjection(admin, tenantsProjection, id.data)

  await recordBackofficeAction({
    actor: user,
    section: 'events',
    action: 'staff.invite',
    summary: `Invited "${typed}" as ${parsed.data.role} to event ${id.data}`,
    detail: { tenantId: id.data, invitee: typed, role: parsed.data.role },
  })

  revalidatePath(`/ovaloffice/events/${id.data}`)
  return { ok: true }
}

/**
 * Hand the space over, or take a role back.
 *
 * The route to making a customer the *owner*: invitations only carry `admin`
 * or `member` - see `invitableRoleSchema` - so somebody accepts as an admin
 * and is promoted here. Which is the correct order anyway, because the
 * promotion should happen when they have actually arrived.
 */
export async function setEventStaffRole(
  tenantId: string,
  userId: string,
  role: string,
): Promise<StaffResult> {
  const id = tenantIdSchema.safeParse(tenantId)
  if (!id.success) return { ok: false, error: 'Unknown event' }

  const parsed = changeRoleSchema.safeParse({ userId, role })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid role' }
  }

  const { supabase, admin, user } = await requireBackofficeSection('events', 'write')

  try {
    await executeCommand({
      supabase,
      decider: tenantDecider,
      tenantId: id.data,
      streamId: id.data,
      command: {
        type: 'ChangeMemberRole',
        actorId: user.id,
        userId: parsed.data.userId,
        role: parsed.data.role,
        platform: true,
      },
      metadata: { actorId: user.id, platform: true },
    })
  } catch (error) {
    return toError(error)
  }

  await runProjection(admin, tenantsProjection, id.data)

  await recordBackofficeAction({
    actor: user,
    section: 'events',
    action: 'staff.role',
    summary: `Set ${parsed.data.userId} to ${parsed.data.role} in event ${id.data}`,
    detail: { tenantId: id.data, userId: parsed.data.userId, role: parsed.data.role },
  })

  revalidatePath(`/ovaloffice/events/${id.data}`)
  return { ok: true }
}

export async function removeEventStaff(
  tenantId: string,
  userId: string,
): Promise<StaffResult> {
  const id = tenantIdSchema.safeParse(tenantId)
  const target = z.uuid().safeParse(userId)
  if (!id.success || !target.success) return { ok: false, error: 'Unknown member' }

  const { supabase, admin, user } = await requireBackofficeSection('events', 'write')

  try {
    await executeCommand({
      supabase,
      decider: tenantDecider,
      tenantId: id.data,
      streamId: id.data,
      command: {
        type: 'RemoveMember',
        actorId: user.id,
        userId: target.data,
        platform: true,
      },
      metadata: { actorId: user.id, platform: true },
    })
  } catch (error) {
    return toError(error)
  }

  await runProjection(admin, tenantsProjection, id.data)

  await recordBackofficeAction({
    actor: user,
    section: 'events',
    action: 'staff.remove',
    summary: `Removed ${target.data} from event ${id.data}`,
    detail: { tenantId: id.data, userId: target.data },
  })

  revalidatePath(`/ovaloffice/events/${id.data}`)
  return { ok: true }
}

/**
 * Put yourself in the room.
 *
 * Written as an invitation you then accept, rather than as a membership
 * conjured by fiat, because the log should say what happened: the platform
 * invited this person and this person joined. There is no `MemberJoined`
 * command for exactly that reason - membership is something somebody accepts.
 *
 * Two appends and, for `owner`, a third. Each is an ordinary command against
 * the same stream, so a failure halfway leaves a real state: an invitation the
 * operator has not accepted, which they can accept from /invitations like
 * anybody else.
 */
export async function joinEventSpace(
  tenantId: string,
  role: 'owner' | 'admin' = 'admin',
): Promise<StaffResult> {
  const id = tenantIdSchema.safeParse(tenantId)
  if (!id.success) return { ok: false, error: 'Unknown event' }

  const { supabase, admin, user } = await requireBackofficeSection('events', 'write')
  const key = userInvitee(user.id)
  const seatLimit = await resolveSeatLimit(admin, id.data)

  try {
    await executeCommand({
      supabase,
      decider: tenantDecider,
      tenantId: id.data,
      streamId: id.data,
      command: {
        type: 'InviteMember',
        actorId: user.id,
        invitee: key,
        role: 'admin',
        seatLimit,
        platform: true,
      },
      metadata: { actorId: user.id, platform: true },
    })

    // No `platform` here, and that is not an oversight: this one really is an
    // ordinary person accepting an invitation addressed to them.
    await executeCommand({
      supabase,
      decider: tenantDecider,
      tenantId: id.data,
      streamId: id.data,
      command: {
        type: 'AcceptInvitation',
        actorId: user.id,
        invitee: key,
        seatLimit,
      },
      metadata: { actorId: user.id },
    })

    if (role === 'owner') {
      await executeCommand({
        supabase,
        decider: tenantDecider,
        tenantId: id.data,
        streamId: id.data,
        command: {
          type: 'ChangeMemberRole',
          actorId: user.id,
          userId: user.id,
          role: 'owner',
          platform: true,
        },
        metadata: { actorId: user.id, platform: true },
      })
    }
  } catch (error) {
    return toError(error)
  }

  await runProjection(admin, tenantsProjection, id.data)

  await recordBackofficeAction({
    actor: user,
    section: 'events',
    action: 'staff.join',
    summary: `Joined event ${id.data} as ${role}`,
    detail: { tenantId: id.data, role },
  })

  revalidatePath(`/ovaloffice/events/${id.data}`)
  return { ok: true }
}

/**
 * Step back out.
 *
 * `LeaveTenant`, flagged, and the flag matters for exactly one reason: it lets
 * the operator go even when they are the only owner. Which is the case for
 * every event created before 20260903000000, when standing one up made you its
 * owner - and those are the spaces this button is mostly for. What is left
 * behind is an ownerless space, which is now the normal shape of an event and
 * is administered from this page. See the note in the decider.
 */
export async function leaveEventSpace(tenantId: string): Promise<StaffResult> {
  const id = tenantIdSchema.safeParse(tenantId)
  if (!id.success) return { ok: false, error: 'Unknown event' }

  const { supabase, admin, user } = await requireBackofficeSection('events', 'write')

  try {
    await executeCommand({
      supabase,
      decider: tenantDecider,
      tenantId: id.data,
      streamId: id.data,
      command: { type: 'LeaveTenant', actorId: user.id, platform: true },
      metadata: { actorId: user.id, platform: true },
    })
  } catch (error) {
    return toError(error)
  }

  await runProjection(admin, tenantsProjection, id.data)

  await recordBackofficeAction({
    actor: user,
    section: 'events',
    action: 'staff.leave',
    summary: `Left event ${id.data}`,
    detail: { tenantId: id.data },
  })

  revalidatePath(`/ovaloffice/events/${id.data}`)
  return { ok: true }
}
