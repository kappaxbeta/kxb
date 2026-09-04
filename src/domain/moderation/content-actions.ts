'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { recordBackofficeAction } from '@/domain/backoffice/audit'
import {
  MAX_REPORT_REASON,
  MAX_REPORT_TITLE,
  MIN_REPORT_REASON,
  REPORT_KINDS,
  type ReportKind,
  tableFor,
} from '@/domain/moderation/content'
import { requireBackofficeSection } from '@/lib/backoffice'
import { requireTenant } from '@/lib/tenant'

/**
 * Reporting a blueprint, a clip, an XP, a script or a movie - and taking it
 * down.
 *
 * Its own file rather than more functions in ./actions.ts, and the seam is the
 * one that file already describes: it is about *worlds and chat messages*, two
 * subjects with a foreign key each and a takedown that means something
 * different for both. This is the polymorphic queue - one table, six kinds -
 * and mixing them would put two different `reportSchema`s in one module.
 *
 * The audiences and the gating are identical, deliberately: a member may say
 * "this is not alright" and read back their own report; only a backoffice admin
 * sees the queue, the reporter, or the switch.
 */

export type ContentResult = { ok: true } | { ok: false; error: string }

const reportSchema = z.object({
  kind: z.enum(REPORT_KINDS),
  targetId: z.uuid(),
  title: z.string().trim().max(MAX_REPORT_TITLE).optional(),
  reason: z
    .string()
    .trim()
    .min(MIN_REPORT_REASON, 'Say a little about what is wrong')
    .max(MAX_REPORT_REASON, `Keep it under ${MAX_REPORT_REASON} characters`),
})

/**
 * Report something somebody made.
 *
 * Any member of any space may report anything they can *see*, and that is the
 * whole of the permission check - there is no role gate, because needing to be
 * an admin to report something offensive would defeat the purpose. `world_reports`
 * makes the same argument at greater length.
 *
 * "Can see" is enforced the way `reportWorld` enforces it, and it is worth
 * spelling out because it is doing real work: the existence check below runs as
 * **the caller**, through their own row-level security. A blueprint that is
 * private to another space returns nothing, so a crafted request cannot be used
 * to discover that a given uuid exists - which is the one thing a report
 * endpoint could otherwise be turned into.
 */
export async function reportContent(
  slug: string,
  input: { kind: string; targetId: string; title?: string; reason: string },
): Promise<ContentResult> {
  const parsed = reportSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid report' }
  }

  const { supabase, tenant, user } = await requireTenant(slug)
  const { kind, targetId, title, reason } = parsed.data

  // Readable means reportable. See the note above about why this runs as the
  // caller rather than as the service role.
  if (!(await exists(supabase, kind, targetId))) {
    return { ok: false, error: 'That is not something you can report' }
  }

  const { error } = await supabase.from('content_reports').insert({
    kind,
    target_id: targetId,
    title: title ?? null,
    reported_by: user.id,
    tenant_id: tenant.id,
    reason,
  })

  if (error) {
    // The one-open-per-reporter index. Reported twice is reported once, and
    // saying so is friendlier than a constraint name.
    if (error.code === '23505') return { ok: false, error: 'You have already reported that' }
    return { ok: false, error: `Failed to report: ${error.message}` }
  }

  return { ok: true }
}

const hideSchema = z.object({
  kind: z.enum(REPORT_KINDS),
  targetId: z.uuid(),
  reason: z.string().trim().min(1).max(MAX_REPORT_REASON),
})

/**
 * Take it down, and answer every open report about it.
 *
 * Hides rather than deletes - see `Hidden`, which argues it, and `banned_worlds`,
 * which decided it first. Keyed on the target alone, so a thing hidden as a
 * `vehicle` is also hidden from a query asking about `blueprint`s.
 */
export async function hideContent(input: {
  kind: string
  targetId: string
  reason: string
}): Promise<ContentResult> {
  const parsed = hideSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid takedown' }
  }

  const { user, admin } = await requireBackofficeSection('reports', 'write')
  const { kind, targetId, reason } = parsed.data

  const { error } = await admin
    .from('hidden_content')
    .upsert({ kind, target_id: targetId, reason, hidden_by: user.id }, { onConflict: 'target_id' })

  if (error) return { ok: false, error: `Failed to take down: ${error.message}` }

  // Every open report about this thing is now answered - whichever kind it was
  // reported as, because they are all about the same row.
  await admin
    .from('content_reports')
    .update({
      status: 'upheld',
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
    })
    .eq('target_id', targetId)
    .eq('status', 'open')

  await recordBackofficeAction({
    actor: user,
    section: 'reports',
    action: 'content.hide',
    summary: `Took down ${kind} ${targetId}`,
    detail: { kind, targetId, reason },
  })

  revalidatePath('/ovaloffice/reports')
  return { ok: true }
}

/** Put it back. */
export async function showContent(targetId: string): Promise<ContentResult> {
  const parsed = z.uuid().safeParse(targetId)
  if (!parsed.success) return { ok: false, error: 'Invalid target' }

  const { user, admin } = await requireBackofficeSection('reports', 'write')

  const { error } = await admin.from('hidden_content').delete().eq('target_id', parsed.data)
  if (error) return { ok: false, error: `Failed to restore: ${error.message}` }

  await recordBackofficeAction({
    actor: user,
    section: 'reports',
    action: 'content.show',
    summary: `Put back ${parsed.data}`,
    detail: { targetId: parsed.data },
  })

  revalidatePath('/ovaloffice/reports')
  return { ok: true }
}

/**
 * Decide a report without touching what it is about.
 *
 * Dismissing is the common verdict and is deliberately *not* the same call as
 * hiding: most reports are somebody disliking something rather than something
 * being wrong, and an admin should be able to close one without the takedown
 * switch being anywhere near their cursor.
 */
export async function dismissContentReport(reportId: string): Promise<ContentResult> {
  const parsed = z.uuid().safeParse(reportId)
  if (!parsed.success) return { ok: false, error: 'Invalid report' }

  const { user, admin } = await requireBackofficeSection('reports', 'write')

  const { error } = await admin
    .from('content_reports')
    .update({
      status: 'dismissed',
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', parsed.data)

  if (error) return { ok: false, error: `Failed to dismiss: ${error.message}` }

  await recordBackofficeAction({
    actor: user,
    section: 'reports',
    action: 'content.dismiss',
    summary: `Dismissed report ${parsed.data}`,
    detail: { reportId: parsed.data },
  })

  revalidatePath('/ovaloffice/reports')
  return { ok: true }
}

/**
 * Is there such a thing, and may this reader see it?
 *
 * Readable means reportable - see the note above about why this runs as the
 * caller rather than as the service role.
 *
 * The branch is here because four of the five tables key on `id` and
 * `channel_releases_read_model` keys on `episode_id`: a release is one row per
 * episode, and giving it a second identity purely so this lookup could stay
 * one line would be inventing a column to serve a query. The query takes the
 * extra line instead.
 */
async function exists(
  supabase: Awaited<ReturnType<typeof requireTenant>>['supabase'],
  kind: ReportKind,
  targetId: string,
): Promise<boolean> {
  const table = tableFor(kind)

  if (table === 'channel_releases_read_model') {
    const { data } = await supabase
      .from(table)
      .select('episode_id')
      .eq('episode_id', targetId)
      .maybeSingle()
    return Boolean(data)
  }

  const { data } = await supabase.from(table).select('id').eq('id', targetId).maybeSingle()
  return Boolean(data)
}
