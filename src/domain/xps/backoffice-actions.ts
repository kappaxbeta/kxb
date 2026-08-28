'use server'

import { revalidatePath } from 'next/cache'
import { xpDecider } from '@/domain/xps/aggregate'
import { reasonSchema, type XpCommand } from '@/domain/xps/commands'
import { xpsProjection } from '@/domain/xps/projection'
import { executeCommand } from '@/es/command'
import { ConcurrencyError, DomainError } from '@/es/errors'
import { runProjection } from '@/es/projection'
import type { Client } from '@/es/store'
import { recordBackofficeAction } from '@/domain/backoffice/audit'
import { requireBackofficeSection } from '@/lib/backoffice'

/**
 * The three verdicts only the platform may reach.
 *
 * ---------------------------------------------------------------------------
 * Why these are not in `actions.ts`
 * ---------------------------------------------------------------------------
 * Everything in that file is gated by `requireTenant` — membership of the space
 * the project lives in. An operator is not a member of anybody's space, and
 * making them one to review a level would be the wrong shape of fix. So these
 * are gated by `requireBackofficeSection('xp', 'write')` and run with the **service role**,
 * which is how `/ovaloffice/reports` already writes.
 *
 * The separation is also a boundary worth being able to see: the file a tenant
 * surface imports cannot publish anything, because the function is not in it.
 *
 * ---------------------------------------------------------------------------
 * The decider does not need to be told these are the platform
 * ---------------------------------------------------------------------------
 * `PublishXp`, `RejectXp` and `UnpublishXp` never check who is asking, unlike
 * every other command in the aggregate — the only questions they ask are about
 * the project's state, because "is this person allowed to publish" is not a
 * fact the project's stream holds. There is nothing here for a `platform: true`
 * flag to satisfy, which is why there isn't one.
 *
 * What *is* recorded is `by`: every one of these events carries the operator's
 * account, so the log answers who approved a level and who pulled one.
 */

export type ReviewResult = { ok: true } | { ok: false; error: string }

function toResult(error: unknown): ReviewResult {
  if (error instanceof DomainError) return { ok: false, error: error.message }
  if (error instanceof ConcurrencyError) {
    return { ok: false, error: 'That project changed while you were reading it. Reload.' }
  }
  throw error
}

async function run(
  admin: Client,
  tenantId: string,
  xpId: string,
  command: XpCommand,
): Promise<ReviewResult> {
  try {
    await executeCommand({ supabase: admin, decider: xpDecider, tenantId, streamId: xpId, command })
    await runProjection(admin, xpsProjection, tenantId)
    return { ok: true }
  } catch (error) {
    return toResult(error)
  }
}

/**
 * The tenant a project belongs to, read rather than trusted from the form.
 *
 * `executeCommand` needs a tenant id and the browser is the only other place it
 * could come from — and a tenant id from a form is a tenant id somebody can
 * change. Reading it back means a tampered one produces "not found" instead of
 * a write into a stream in a space the project is not in.
 */
async function tenantFor(admin: Client, xpId: string): Promise<string | null> {
  const { data } = await admin
    .from('xps_read_model')
    .select('tenant_id')
    .eq('id', xpId)
    .maybeSingle()
  return data?.tenant_id ?? null
}

export async function publishXp(formData: FormData): Promise<ReviewResult> {
  const { user, admin } = await requireBackofficeSection('xp', 'write')
  const xpId = String(formData.get('xpId') ?? '')

  const tenantId = await tenantFor(admin, xpId)
  if (!tenantId) return { ok: false, error: 'That project could not be found' }

  const result = await run(admin, tenantId, xpId, { type: 'PublishXp', actorId: user.id })
  if (result.ok) {
    await recordBackofficeAction({
      actor: user,
      section: 'xp',
      action: 'xp.publish',
      summary: `Published project ${xpId}`,
      detail: { xpId, tenantId },
    })
    revalidateSurfaces(xpId)
  }
  return result
}

/**
 * Send it back, with something to act on.
 *
 * The reason is required by the schema rather than optional, because this is
 * one of the two moments the platform does something to somebody's work that
 * they did not ask for. "Rejected" with nothing after it produces a support
 * email; a sentence produces a fix.
 */
export async function rejectXp(formData: FormData): Promise<ReviewResult> {
  const { user, admin } = await requireBackofficeSection('xp', 'write')
  const xpId = String(formData.get('xpId') ?? '')

  const reason = reasonSchema.safeParse(formData.get('reason'))
  if (!reason.success) {
    return { ok: false, error: reason.error.issues[0]?.message ?? 'Say why' }
  }

  const tenantId = await tenantFor(admin, xpId)
  if (!tenantId) return { ok: false, error: 'That project could not be found' }

  const result = await run(admin, tenantId, xpId, {
    type: 'RejectXp',
    actorId: user.id,
    reason: reason.data,
  })
  if (result.ok) {
    await recordBackofficeAction({
      actor: user,
      section: 'xp',
      action: 'xp.reject',
      summary: `Rejected project ${xpId}`,
      detail: { xpId, tenantId, reason: reason.data },
    })
    revalidateSurfaces(xpId)
  }
  return result
}

/** Take a live one down. Same shape as a rejection, and the same argument for the reason. */
export async function unpublishXp(formData: FormData): Promise<ReviewResult> {
  const { user, admin } = await requireBackofficeSection('xp', 'write')
  const xpId = String(formData.get('xpId') ?? '')

  const reason = reasonSchema.safeParse(formData.get('reason'))
  if (!reason.success) {
    return { ok: false, error: reason.error.issues[0]?.message ?? 'Say why' }
  }

  const tenantId = await tenantFor(admin, xpId)
  if (!tenantId) return { ok: false, error: 'That project could not be found' }

  const result = await run(admin, tenantId, xpId, {
    type: 'UnpublishXp',
    actorId: user.id,
    reason: reason.data,
  })
  if (result.ok) {
    await recordBackofficeAction({
      actor: user,
      section: 'xp',
      action: 'xp.unpublish',
      summary: `Unpublished project ${xpId}`,
      detail: { xpId, tenantId, reason: reason.data },
    })
    revalidateSurfaces(xpId)
  }
  return result
}

/**
 * Every page whose contents just changed.
 *
 * The store and the project's own page both read `state` and
 * `published_version`, and both are `force-dynamic` — so this is belt and
 * braces rather than load-bearing. It is here because the day one of them
 * becomes statically rendered, the bug is a published project that never
 * appears, and that is a hard one to attribute back to a review click.
 */
function revalidateSurfaces(xpId: string): void {
  revalidatePath('/ovaloffice/xp')
  revalidatePath('/browse')
  revalidatePath(`/browse/xp/${xpId}`)
}
