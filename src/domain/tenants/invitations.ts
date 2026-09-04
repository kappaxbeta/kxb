import 'server-only'
import type { User } from '@supabase/supabase-js'
import { tenantLimit } from '@/domain/billing/quota'
import { tenantDecider } from '@/domain/tenants/aggregate'
import { findTenantIdBySlug } from '@/domain/tenants/queries'
import { executeCommand } from '@/es/command'
import { ConcurrencyError, DomainError } from '@/es/errors'
import type { Client } from '@/es/store'

/**
 * Answering an invitation, from either front door.
 *
 * Both halves of `acceptInvitation` and `declineInvitation` except the parts
 * that are about being a browser - the cache revalidation and the redirect into
 * the welcome window. What is here is what decides: which invitation in this
 * space is addressed to the caller, and the command that spends a seat.
 *
 * The seat limit is resolved through `tenantLimit`, which asks RPCs that answer
 * for a space the caller is *not yet a member of* - which is exactly what an
 * accepter is, and why `resolveFeatures` cannot be used here. Both
 * `tenant_tier` and `tenant_feature_limit` are SECURITY DEFINER for that reason.
 *
 * Not a `'use server'` file: it takes a client and a verified user.
 */

export type InvitationResult = { ok: true } | { ok: false; error: string }

function toResult(error: unknown): InvitationResult {
  if (error instanceof DomainError) return { ok: false, error: error.message }
  if (error instanceof ConcurrencyError) {
    return { ok: false, error: 'This space was changed elsewhere. Please try again.' }
  }
  throw error
}

/**
 * Which invitation in this workspace is addressed to the caller.
 *
 * Answered by the database, under SECURITY DEFINER, scoped to `auth.uid()` -
 * the key never comes from the request. A key a client could name is a key
 * somebody could accept on another person's behalf.
 */
async function findMyInvitee(supabase: Client, tenantId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('my_tenant_invitation', {
    p_tenant_id: tenantId,
  })

  if (error) throw new Error(`Failed to find your invitation: ${error.message}`)
  return data ?? null
}

export async function acceptInvitationFor(
  supabase: Client,
  user: User,
  tenantSlug: string,
): Promise<InvitationResult> {
  const tenantId = await findTenantIdBySlug(supabase, tenantSlug)
  if (!tenantId) return { ok: false, error: 'That space no longer exists' }

  const invitee = await findMyInvitee(supabase, tenantId)
  if (!invitee) return { ok: false, error: 'That invitation is no longer valid' }

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
        seatLimit: await tenantLimit(supabase, tenantId, 'seats'),
      },
      metadata: { actorId: user.id },
    })
  } catch (error) {
    return toResult(error)
  }

  return { ok: true }
}

export async function declineInvitationFor(
  supabase: Client,
  user: User,
  tenantSlug: string,
): Promise<InvitationResult> {
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

  return { ok: true }
}
