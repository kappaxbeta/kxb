'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { tenantDecider } from '@/domain/tenants/aggregate'
import {
  changeRoleSchema,
  createTenantSchema,
  inviteeKeySchema,
  inviteMemberSchema,
  memberIdSchema,
  renameTenantSchema,
  type TenantCommand,
} from '@/domain/tenants/commands'
import { isSpaceCapability, tokenInvitee, userInvitee } from '@/domain/tenants/events'
import { findTenantIdBySlug } from '@/domain/tenants/queries'
import { executeCommand } from '@/es/command'
import { ConcurrencyError, DomainError } from '@/es/errors'
import type { Client } from '@/es/store'
import { requireUser } from '@/lib/auth'
import {
  countOwnedTenants,
  entitlementMessage,
  syncUserEntitlement,
} from '@/domain/billing/entitlement'
import { resolveFeatures } from '@/domain/flags/queries'
import { freeSpaceLimit, tenantLimit } from '@/domain/billing/quota'
import { withinLimit } from '@/domain/billing/limits'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTenant, writeBlockedReason } from '@/lib/tenant'

/**
 * Command handlers for the tenant aggregate.
 *
 * Same four steps as the task actions - authenticate, validate, execute,
 * project - with one addition: the actor is stamped from the session here and
 * nowhere else. Every command in this file carries `actorId: user.id`, and no
 * argument the client sends can influence it. The decider then does the actual
 * permission check against the log.
 */

export type ActionResult = { ok: true } | { ok: false; error: string }

/** Postgres unique violation - the slug was claimed while we were deciding. */
const UNIQUE_VIOLATION = '23505'

function toResult(error: unknown): ActionResult {
  if (error instanceof DomainError) {
    return { ok: false, error: error.message }
  }
  if (error instanceof ConcurrencyError) {
    return {
      ok: false,
      error: 'This space was changed elsewhere. Please try again.',
    }
  }
  throw error
}

/**
 * Run a command against a tenant the caller is already a member of.
 *
 * `requireTenant` proves membership before the command is even built, so a
 * non-member gets a 404 from the page rather than a domain error from the log.
 */
async function dispatch(
  slug: string,
  build: (actorId: string) => TenantCommand,
  // Leaving is the one command that revokes the caller's own access. Asking
  // Next.js to re-render the workspace layout afterwards would run
  // requireTenant() for someone who is no longer a member and blow up with a
  // 404 on the way to a successful redirect.
  options: { revalidateTenant?: boolean } = {},
) {
  const { revalidateTenant = true } = options
  const { user, supabase, tenant } = await requireTenant(slug)

  try {
    await executeCommand({
      supabase,
      decider: tenantDecider,
      tenantId: tenant.id,
      // A tenant's stream id is its tenant id.
      streamId: tenant.id,
      command: build(user.id),
      metadata: { actorId: user.id },
    })
  } catch (error) {
    return toResult(error)
  }

  if (revalidateTenant) revalidatePath(`/t/${slug}`, 'layout')
  return { ok: true } as const
}

/**
 * Create a workspace.
 *
 * The slug is claimed *before* the events are appended, because uniqueness
 * across tenants is not something an aggregate can decide - see the reservation
 * table in the tenants migration. If the command then fails, the claim is
 * released so the name does not stay burnt.
 */
export async function createTenant(name: string, slug: string): Promise<ActionResult> {
  const parsed = createTenantSchema.safeParse({ name, slug })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid space' }
  }

  const { user, supabase } = await requireUser()

  /**
   * A visitor pass cannot own a space.
   *
   * `/tenants` and `/onboarding` both redirect an anonymous session away
   * already, so this was reachable only by posting to the action directly - and
   * a Server Action is a public endpoint, so "the page redirects" is not a
   * gate. It *was* refused, but by accident: an anonymous user has no address,
   * so they fell into the check below and were told their account has no email.
   * True, unhelpful, and it describes a missing field rather than the actual
   * rule.
   *
   * The rule is worth stating plainly because the consequence is not obvious.
   * An anonymous session is a browser, not a person: it lives in one set of
   * cookies and there is no way to sign back into it. A space owned by one is a
   * space that becomes unreachable - along with anything anybody else put in it
   * - the moment that browser clears its storage. Refusing is kinder than the
   * alternative, which is somebody losing a room they invited friends into.
   */
  if (user.is_anonymous) {
    return {
      ok: false,
      error:
        'You are here on a visitor pass, which cannot own a space — there would be no way to sign back into it. Make an account first and the space will be waiting.',
    }
  }

  if (!user.email) {
    return { ok: false, error: 'Your account has no email address' }
  }

  // Outside any workspace, so only this person's override and the global
  // default apply.
  //
  // Skipping the block below is the whole of "free someone from paying" on this
  // path, and skipping it *entirely* is the point: with billing off there is
  // nothing to verify, and the Stripe round trip exists only to answer a
  // question that no longer has consequences. A comped account should not be
  // able to fail to create a workspace because Stripe was down.
  const { billing } = await resolveFeatures(supabase)

  if (billing) {
    // Entitlement, checked against Stripe rather than our cached mirror.
    //
    // This is the one moment where being a few hours stale actually costs money
    // - someone who cancelled this morning could still mint workspaces until
    // the nightly job noticed. So it asks Stripe, and refreshes the mirror on
    // the way past, which means the check pays for the sync rather than the
    // reverse.
    try {
      const admin = createAdminClient() as unknown as typeof supabase
      const entitlement = await syncUserEntitlement(admin, user.id, user.email)
      const owned = await countOwnedTenants(supabase, user.id)

      /**
       * The gate is now "too many spaces waiting for a plan", not "out of seats".
       *
       * Under tiers a space is free to make and picks xo or xp for itself
       * afterwards, so there is no seat to spend here - see the note at the top
       * of `billing/entitlement.ts`. What is left to prevent is somebody
       * scripting a thousand empty spaces, and the things that legitimately
       * hold a space up all count against that: its own subscription, a legacy
       * seat, a granted month.
       */
      const covered = entitlement.seats + owned.subscribed
      const unpaid = Math.max(0, owned.total - covered)

      /*
       * The number is resolved rather than constant now.
       *
       * It was a flat three - a spam guard from before the free tier, when a
       * space with no plan was read-only and therefore nearly worthless to
       * hoard. A free space is a working product, so this became a pricing
       * number: one per account, raisable for one person from the backoffice
       * without a deploy, and clamped by the installation's own ceiling.
       *
       * `withinLimit` rather than a comparison, so "unlimited" needs no
       * sentinel and the off-by-one is decided in one tested place: `unpaid` is
       * what they already hold, and this asks whether there is room for one
       * more.
       */
      const freeSpaces = await freeSpaceLimit(supabase)

      if (!withinLimit(unpaid, freeSpaces)) {
        return { ok: false, error: entitlementMessage(freeSpaces ?? unpaid) }
      }
    } catch (error) {
      // A Stripe outage must not silently hand out free workspaces, and must
      // not pretend the person is unsubscribed either. Say what actually
      // happened.
      const message = error instanceof Error ? error.message : 'unknown error'
      return {
        ok: false,
        error: `Could not verify your subscription just now (${message}). Please try again in a moment.`,
      }
    }
  }

  const tenantId = randomUUID()

  const { error: claimError } = await supabase.from('tenant_slugs').insert({
    slug: parsed.data.slug,
    tenant_id: tenantId,
    claimed_by: user.id,
  })

  if (claimError) {
    if (claimError.code === UNIQUE_VIOLATION) {
      return { ok: false, error: `The URL "${parsed.data.slug}" is already taken` }
    }
    return { ok: false, error: `Could not reserve that URL: ${claimError.message}` }
  }

  try {
    await executeCommand({
      supabase,
      decider: tenantDecider,
      tenantId,
      streamId: tenantId,
      command: {
        type: 'CreateTenant',
        actorId: user.id,
        name: parsed.data.name,
        slug: parsed.data.slug,
      },
      metadata: { actorId: user.id },
    })
  } catch (error) {
    await releaseSlug(supabase, parsed.data.slug)
    return toResult(error)
  }

  // Guarded, and it has to be. The events are committed and the membership
  // trigger has already run, so the space is real and the caller is its owner -
  // but a throw here would escape the action as a generic error, and by then
  // the slug can no longer be released (`tenant_slugs_delete_unused` allows a
  // delete only while the tenant has no events). Retrying the form would say
  // "that URL is already taken" about a space the person owns and cannot see:
  // /tenants drops memberships with no projected row, and nothing on that page
  // runs this projection.
  //
  // So: succeed, and send them in. `loadTenant` re-projects on a read miss, so
  // arriving at the space is itself the repair.
  try {
  } catch {
    // Deliberately swallowed. The write side is done; a read model that has not
    // caught up is the one failure this system is built to shrug off.
  }

  revalidatePath('/tenants')
  /**
   * Into the space itself, not into a surface of it.
   *
   * This pointed at `/tasks`, which has been a 404 since the tasks flag was
   * withdrawn: that route calls `requireFeature(context, 'tasks')` and the flag's
   * fallback is `false` on purpose. So the last step of creating a space - the
   * one moment somebody has just paid for it - ended on a not-found page.
   *
   * The root is the right target rather than another surface with a flag on it:
   * it is the board, it has no flag, and it is already documented as the thing
   * opening a workspace should land you on. See the note on that page.
   */
  redirect(`/t/${parsed.data.slug}`)
}

/** Best-effort cleanup of a claim whose TenantCreated never landed. */
async function releaseSlug(supabase: Client, slug: string): Promise<void> {
  // The delete policy only permits this while the tenant has no events, so a
  // partially-created workspace keeps its URL rather than being half-freed.
  await supabase.from('tenant_slugs').delete().eq('slug', slug)
}

export async function renameTenant(slug: string, name: string): Promise<ActionResult> {
  const parsed = renameTenantSchema.safeParse({ name })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid name' }
  }

  return dispatch(slug, (actorId) => ({
    type: 'RenameTenant',
    actorId,
    name: parsed.data.name,
  }))
}

export async function archiveTenant(slug: string): Promise<ActionResult> {
  const result = await dispatch(slug, (actorId) => ({ type: 'ArchiveTenant', actorId }))
  if (result.ok) revalidatePath('/tenants')
  return result
}

export async function setLoungePublicityAction(
  slug: string,
  isPublic: boolean,
): Promise<ActionResult> {
  const result = await dispatch(slug, (actorId) => ({
    type: 'SetLoungePublicity',
    actorId,
    isPublic,
  }))
  if (result.ok) {
    revalidatePath(`/t/${slug}`, 'layout')
    revalidatePath(`/v/${slug}`)
  }
  return result
}

/**
 * Switch the lounge between free sparring ('battle') and admin-gated building
 * ('creative').
 *
 * No revalidatePath, same reason the lounge's own actions skip it: the caller
 * is standing inside the live WebGL canvas when they flip this, and the
 * layout re-render that `dispatch()` would otherwise trigger tears the scene
 * down. The scene applies the new mode to its own state once this resolves.
 */
export async function setLoungeMode(
  slug: string,
  mode: 'creative' | 'battle',
): Promise<ActionResult> {
  return dispatch(
    slug,
    (actorId) => ({ type: 'SetLoungeMode', actorId, mode }),
    { revalidateTenant: false },
  )
}

/**
 * Open or close this space's lounge chat.
 *
 * The second of the two gates in front of chat; the first is the `chat` feature
 * flag, and it is checked here rather than in the decider because a flag is not
 * state of the tenant stream. Refused rather than 404'd - unlike
 * `requireFeature`, which guards a whole page, this is a toggle inside a form
 * somebody is already looking at, and a not-found in response to flipping a
 * switch tells them nothing.
 *
 * Revalidates the layout, unlike `setLoungeMode` next door: this one is flipped
 * in Space Settings rather than from inside the canvas, so there is no scene to
 * tear down, and the lounge has to be re-rendered with the panel now present or
 * gone by the time somebody walks back into it.
 */
export async function setChatEnabled(
  slug: string,
  enabled: boolean,
): Promise<ActionResult> {
  const context = await requireTenant(slug)
  if (!context.features.chat) {
    return { ok: false, error: 'Chat is not available on this installation' }
  }

  const result = await dispatch(slug, (actorId) => ({
    type: 'SetChatEnabled',
    actorId,
    enabled,
  }))

  if (result.ok) revalidatePath(`/t/${slug}`, 'layout')
  return result
}

/**
 * Flip one of the host's day-to-day switches.
 *
 * No ceiling check here, and that is not an omission. The ceiling lives in
 * `event_spaces`, which the backoffice owns, and the database ANDs the two in
 * `event_guest_may_write()` - so a host who switches on something they were
 * never sold gets a switch that reads on and a guest who still cannot write.
 * Refusing here as well would mean the same rule enforced in two places, and
 * the copy in TypeScript is the one that would quietly fall out of date.
 *
 * What it *does* do is refuse silently-wrong input: an unknown capability name
 * would otherwise be written into the JSONB column and sit there matching
 * nothing forever.
 *
 * Revalidates the layout for the same reason `setChatEnabled` does - the
 * sidebar's contents depend on the answer, and a switch that needs a hard
 * refresh to take effect is one a host will press twice mid-event.
 */
export async function setSpaceCapability(
  slug: string,
  capability: string,
  enabled: boolean,
): Promise<ActionResult> {
  if (!isSpaceCapability(capability)) {
    return { ok: false, error: 'Unknown capability' }
  }

  const result = await dispatch(slug, (actorId) => ({
    type: 'SetSpaceCapability',
    actorId,
    capability,
    enabled,
  }))

  if (result.ok) revalidatePath(`/t/${slug}`, 'layout')
  return result
}

/**
 * Invite somebody, by username or by email address.
 *
 * The interesting work is deciding *how* to record the addressee, and it is the
 * whole of why this action is longer than its neighbours:
 *
 *   * A username resolves to an account, and the invitation is recorded as
 *     `user:<uuid>`. Nothing about that person's mailbox is written anywhere.
 *
 *   * An email address is looked up too. If it belongs to an account, it also
 *     becomes `user:<uuid>` - you typed an address, and nothing recorded that
 *     you did. This is the common case for inviting a colleague, and it is why
 *     the log stays clean without anybody having to learn a new habit.
 *
 *   * Only an address with no account behind it needs the address itself kept,
 *     because there is no other way to recognise them when they sign up. It
 *     goes into tenant_invitation_emails - beside the log, readable by the
 *     owners and admins of this workspace, and deleted the moment the
 *     invitation resolves.
 *
 * Both lookups run through SECURITY DEFINER functions gated on the caller being
 * an owner or admin here, so this is not an account-enumeration oracle for
 * anybody who happens to be signed in.
 */
export async function inviteMember(
  slug: string,
  invitee: string,
  role: string,
): Promise<ActionResult> {
  const parsed = inviteMemberSchema.safeParse({ invitee, role })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid invitation' }
  }

  // Growing the workspace is using the product, so it stops when billing does.
  // Note what is *not* gated: leaving, role changes, and revoking invitations.
  // A lapsed subscription must never trap an owner inside a workspace they
  // cannot administer their way out of.
  const context = await requireTenant(slug)
  const blocked = writeBlockedReason(context)
  if (blocked) return { ok: false, error: blocked }

  const { supabase, tenant, user } = context
  const typed = parsed.data.invitee
  const isEmail = typed.includes('@')

  const { data: foundUserId, error: lookupError } = await supabase.rpc(
    isEmail ? 'lookup_invitee_by_email' : 'lookup_invitee_by_username',
    isEmail
      ? { p_tenant_id: tenant.id, p_email: typed }
      : { p_tenant_id: tenant.id, p_username: typed },
  )

  if (lookupError) {
    return { ok: false, error: `Could not look that person up: ${lookupError.message}` }
  }

  // A username that belongs to nobody is a typo, and saying so is not a
  // disclosure - the caller can already invite anyone here by address.
  if (!isEmail && !foundUserId) {
    return { ok: false, error: `Nobody here goes by "${typed}"` }
  }

  if (foundUserId === user.id) {
    return { ok: false, error: 'You are already in this space' }
  }

  let key: string

  if (foundUserId) {
    key = userInvitee(foundUserId)
  } else {
    /**
     * Reuse the token of a pending invitation to the same address.
     *
     * Otherwise re-inviting somebody at a different role would mint a second
     * token for the same mailbox, and they would arrive to two invitations to
     * one workspace. The decider's "re-inviting is a correction" rule is keyed
     * on the invitee, so it only fires if the key is the same one.
     */
    const { data: pending, error: pendingError } = await supabase
      .from('tenant_invitation_emails')
      .select('invitee_key')
      .eq('tenant_id', tenant.id)
      .eq('email', typed)
      .maybeSingle()

    if (pendingError) {
      return { ok: false, error: `Could not check pending invitations: ${pendingError.message}` }
    }

    key = pending?.invitee_key ?? tokenInvitee(randomUUID().replace(/-/g, ''))

    /**
     * The address is written *before* the event, not after.
     *
     * If this insert fails the invitation simply never happens. If it ran
     * afterwards and failed, the log would hold an invitation whose addressee
     * could not be resolved by anybody - the invitee could not match it, and no
     * admin could see who it was for. An orphaned address row, by contrast, is
     * inert: nothing reads it without an invitation pointing at it, and the
     * next invite to that address picks it back up.
     */
    const { error: addressError } = await supabase.from('tenant_invitation_emails').upsert(
      {
        tenant_id: tenant.id,
        invitee_key: key,
        email: typed,
      },
      { onConflict: 'tenant_id,invitee_key' },
    )

    if (addressError) {
      return { ok: false, error: `Could not save that invitation: ${addressError.message}` }
    }
  }

  // Nothing here sends mail. The invitation is a row the invitee finds on
  // /invitations when they next sign in; wiring it to an email provider is the
  // one piece this starter leaves to you.
  // Read here rather than in the decider, which may not do I/O. Null is "no
  // limit", and is what a failed lookup resolves to - see `quota.ts`.
  //
  // `tenantLimit` and no longer `resolveSeatLimit`, which is the fix rather
  // than a tidy-up: that function reads the `seat_limit` flag alone, so it
  // answered with the *installation's* number and never with the one this space
  // bought. A free space and a EUR 12 space were handed the same cap. It looked
  // enforced and was not, which is worse than obviously missing.
  const seatLimit = await tenantLimit(supabase, tenant.id, 'seats')

  return dispatch(slug, (actorId) => ({
    type: 'InviteMember',
    actorId,
    invitee: key,
    role: parsed.data.role,
    seatLimit,
  }))
}

export async function revokeInvitation(
  slug: string,
  invitee: string,
): Promise<ActionResult> {
  const parsed = inviteeKeySchema.safeParse({ invitee })
  if (!parsed.success) return { ok: false, error: 'Invalid invitation' }

  return dispatch(slug, (actorId) => ({
    type: 'RevokeInvitation',
    actorId,
    invitee: parsed.data.invitee,
  }))
}

export async function changeMemberRole(
  slug: string,
  userId: string,
  role: string,
): Promise<ActionResult> {
  const parsed = changeRoleSchema.safeParse({ userId, role })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid role' }
  }

  return dispatch(slug, (actorId) => ({
    type: 'ChangeMemberRole',
    actorId,
    userId: parsed.data.userId,
    role: parsed.data.role,
  }))
}

export async function removeMember(slug: string, userId: string): Promise<ActionResult> {
  const parsed = memberIdSchema.safeParse({ userId })
  if (!parsed.success) return { ok: false, error: 'Invalid member' }

  return dispatch(slug, (actorId) => ({
    type: 'RemoveMember',
    actorId,
    userId: parsed.data.userId,
  }))
}

export async function leaveTenant(slug: string): Promise<ActionResult> {
  const result = await dispatch(slug, (actorId) => ({ type: 'LeaveTenant', actorId }), {
    revalidateTenant: false,
  })
  if (!result.ok) return result

  revalidatePath('/tenants')
  redirect('/tenants')
}

/**
 * Accept an invitation.
 *
 * This is the one command run by somebody who is *not* a member yet, so it
 * cannot go through requireTenant. What lets it work is the invitation itself:
 * the RLS policies on `events` admit a pending invitee to the tenant stream
 * specifically so this command can load the history it decides against.
 */
export async function acceptInvitation(tenantSlug: string): Promise<ActionResult> {
  const { user, supabase } = await requireUser()

  const tenantId = await findTenantIdBySlug(supabase, tenantSlug)
  if (!tenantId) return { ok: false, error: 'That space no longer exists' }

  const invitee = await findMyInvitee(supabase, tenantId)
  if (!invitee) {
    return { ok: false, error: 'That invitation is no longer valid' }
  }

  try {
    await executeCommand({
      supabase,
      decider: tenantDecider,
      tenantId,
      streamId: tenantId,
      command: {
        type: 'AcceptInvitation',
        actorId: user.id,
        invitee,
        // Resolved through RPCs that answer for a workspace the caller is not
        // a member of - which is exactly what an accepter is, and why
        // `resolve_features` cannot be used here. Both `tenant_tier` and
        // `tenant_feature_limit` are SECURITY DEFINER for that reason.
        seatLimit: await tenantLimit(supabase, tenantId, 'seats'),
      },
      metadata: { actorId: user.id },
    })
  } catch (error) {
    return toResult(error)
  }


  revalidatePath('/invitations')
  revalidatePath('/tenants')
  // Not straight to the task list any more. Joining is the one moment where
  // "which animal are you" is worth a question rather than a default - see the
  // welcome window, whose own exit is the task list this used to be.
  redirect(`/t/${tenantSlug}/welcome`)
}

export async function declineInvitation(tenantSlug: string): Promise<ActionResult> {
  const { user, supabase } = await requireUser()

  const tenantId = await findTenantIdBySlug(supabase, tenantSlug)
  if (!tenantId) return { ok: false, error: 'That space no longer exists' }

  const invitee = await findMyInvitee(supabase, tenantId)
  // Nothing to decline is the outcome the caller wanted anyway.
  if (!invitee) return { ok: true }

  try {
    await executeCommand({
      supabase,
      decider: tenantDecider,
      tenantId,
      streamId: tenantId,
      command: {
        type: 'DeclineInvitation',
        actorId: user.id,
        invitee,
      },
      metadata: { actorId: user.id },
    })
  } catch (error) {
    return toResult(error)
  }

  revalidatePath('/invitations')
  return { ok: true }
}

/**
 * Which invitation in this workspace is addressed to the caller.
 *
 * Answered by the database, under SECURITY DEFINER, scoped to auth.uid() - the
 * key never comes from the request. That matters more than it looks: the key is
 * what the decider matches an acceptance against, so a caller who could choose
 * it could redeem somebody else's invitation. Same reason `actorId` is stamped
 * from the session and never read from an argument.
 */
async function findMyInvitee(supabase: Client, tenantId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('my_tenant_invitation', {
    p_tenant_id: tenantId,
  })

  if (error) {
    throw new Error(`Failed to find your invitation: ${error.message}`)
  }

  return data ?? null
}
