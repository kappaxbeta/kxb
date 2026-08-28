'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { recordBackofficeAction } from '@/domain/backoffice/audit'
import { requireBackofficeSection } from '@/lib/backoffice'
import { chatOpen, requireFeature, requireTenant, writeBlockedReason } from '@/lib/tenant'

/**
 * Reporting a world or a chat message, and what an admin does about either.
 *
 * Two audiences in one file, gated differently and deliberately kept apart in
 * what they can see: a member may say "this is not alright" and read back their
 * own report; only a backoffice admin sees the queue, the reporter, or the
 * takedown switch. A space never learns who reported it - knowing that is what
 * stops people reporting, and in a chat, where the reported person is standing
 * in the room with you, that is not a theoretical concern.
 *
 * The two subjects are shaped the same way on purpose - report, uphold,
 * dismiss - because they are the same problem and the same queue reads both.
 * Where they differ is what upholding *does*: a world is banned from the
 * platform but stays in its owners' hands, and a message is hidden from the
 * room but stays in the record.
 */

export type ModerationResult = { ok: true } | { ok: false; error: string }

const reportSchema = z.object({
  worldId: z.uuid(),
  reason: z
    .string()
    .trim()
    .min(4, 'Say a little about what is wrong')
    .max(500, 'Keep it under 500 characters'),
})

/**
 * Report a battlefield.
 *
 * Any member of any space may report an arena they can see - which, thanks to
 * the select policy, means their own space's or a public one. There is no role
 * check: needing to be an admin to report something you were sent into would
 * defeat the purpose.
 */
export async function reportWorld(
  slug: string,
  worldId: string,
  reason: string,
): Promise<ModerationResult> {
  const parsed = reportSchema.safeParse({ worldId, reason })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid report' }
  }

  const context = await requireTenant(slug)
  requireFeature(context, 'battle')

  const { supabase, tenant, user } = context

  // Readable means reportable. If the select policy hides it, there is nothing
  // here to complain about.
  const { data: arena } = await supabase
    .from('battlefields_read_model')
    .select('world_id')
    .eq('world_id', parsed.data.worldId)
    .maybeSingle()

  if (!arena) return { ok: false, error: 'Battlefield not found' }

  const { error } = await supabase.from('world_reports').insert({
    world_id: parsed.data.worldId,
    reported_by: user.id,
    tenant_id: tenant.id,
    reason: parsed.data.reason,
  })

  if (error) {
    // The partial unique index on (world_id, reported_by) where open.
    if (error.code === '23505') {
      return { ok: false, error: 'You have already reported this one — it is in the queue' }
    }
    return { ok: false, error: `Failed to send the report: ${error.message}` }
  }

  revalidatePath(`/t/${slug}/battle/battlefields`)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Backoffice
// ---------------------------------------------------------------------------

const banSchema = z.object({
  worldId: z.uuid(),
  reason: z.string().trim().min(4, 'Say why').max(500),
})

/**
 * Take a world off the platform.
 *
 * A ban does not delete anything. The blocks stay, the space that built the
 * arena keeps every bit of access it had, and its own members can still walk
 * around in it. What stops is the reach `visibility = 'public'` granted: it
 * drops out of every other space's search, its blocks stop being readable by
 * outsiders, and no new match can be staged on it. See the policies in
 * 20260803080000_world_reports.sql.
 *
 * That line is the point. Moderation here is about what a space may send
 * strangers into, not about confiscating somebody's building.
 */
export async function banWorld(
  worldId: string,
  reason: string,
): Promise<ModerationResult> {
  const parsed = banSchema.safeParse({ worldId, reason })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid ban' }
  }

  const { user, admin } = await requireBackofficeSection('reports', 'write')

  const { error } = await admin.from('banned_worlds').upsert(
    {
      world_id: parsed.data.worldId,
      reason: parsed.data.reason,
      banned_by: user.id,
    },
    { onConflict: 'world_id' },
  )

  if (error) return { ok: false, error: `Failed to ban: ${error.message}` }

  // Every open report about this world is now answered.
  await admin
    .from('world_reports')
    .update({
      status: 'upheld',
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
    })
    .eq('world_id', parsed.data.worldId)
    .eq('status', 'open')

  await recordBackofficeAction({
    actor: user,
    section: 'reports',
    action: 'world.ban',
    summary: `Banned world ${parsed.data.worldId} from the platform`,
    detail: { worldId: parsed.data.worldId, reason: parsed.data.reason },
  })

  revalidatePath('/ovaloffice/reports')
  return { ok: true }
}

/** Put a world back. */
export async function unbanWorld(worldId: string): Promise<ModerationResult> {
  const parsed = z.uuid().safeParse(worldId)
  if (!parsed.success) return { ok: false, error: 'Invalid world' }

  const { user, admin } = await requireBackofficeSection('reports', 'write')

  const { error } = await admin.from('banned_worlds').delete().eq('world_id', parsed.data)
  if (error) return { ok: false, error: `Failed to lift the ban: ${error.message}` }

  await recordBackofficeAction({
    actor: user,
    section: 'reports',
    action: 'world.unban',
    summary: `Lifted the ban on world ${parsed.data}`,
    detail: { worldId: parsed.data },
  })

  revalidatePath('/ovaloffice/reports')
  return { ok: true }
}

/** Nothing wrong with it. Closes the report and leaves the world alone. */
export async function dismissReport(reportId: string): Promise<ModerationResult> {
  const parsed = z.uuid().safeParse(reportId)
  if (!parsed.success) return { ok: false, error: 'Invalid report' }

  const { user, admin } = await requireBackofficeSection('reports', 'write')

  const { error } = await admin
    .from('world_reports')
    .update({
      status: 'dismissed',
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', parsed.data)
    .eq('status', 'open')

  if (error) return { ok: false, error: `Failed to dismiss: ${error.message}` }

  await recordBackofficeAction({
    actor: user,
    section: 'reports',
    action: 'world.dismiss',
    summary: `Dismissed world report ${parsed.data}`,
    detail: { reportId: parsed.data },
  })

  revalidatePath('/ovaloffice/reports')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Chat messages
// ---------------------------------------------------------------------------

const messageReportSchema = z.object({
  messageId: z.uuid(),
  reason: z
    .string()
    .trim()
    .min(4, 'Say a little about what is wrong')
    .max(500, 'Keep it under 500 characters'),
})

/**
 * Report a chat message.
 *
 * The report records three things and the request asked for all three by name:
 * the message, who reported it, and why. `reported_by` is stamped from the
 * session here and demanded again by the insert policy, so it is the reporter's
 * own id in both places and cannot be somebody else's.
 *
 * Any member may report any message they can see, with no role check, for the
 * same reason reporting a world has none: needing to be an admin to complain
 * about something said to you would defeat the purpose. Guests are refused by
 * `writeBlockedReason` and by the insert policy underneath - a guest writes
 * nothing durable, and a report is durable.
 *
 * No revalidatePath. The reporter is standing inside the live canvas when they
 * press this, and a layout re-render would tear the scene down around them; the
 * panel shows the outcome from the returned result instead. The queue this
 * lands in is a different page, rendered fresh when an admin opens it.
 */
export async function reportChatMessage(
  slug: string,
  messageId: string,
  reason: string,
): Promise<ModerationResult> {
  const parsed = messageReportSchema.safeParse({ messageId, reason })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid report' }
  }

  const context = await requireTenant(slug, { guests: true })

  // Both chat gates, re-asked. A Server Action is a public POST endpoint, and a
  // space that turned chat off should not still have a reporting endpoint open
  // on it.
  if (!chatOpen(context)) return { ok: false, error: 'Chat is off in this space' }

  const blocked = writeBlockedReason(context)
  if (blocked) return { ok: false, error: blocked }

  const { supabase, tenant, user } = context

  // Readable means reportable, exactly as for a world. If the select policy
  // hides it - another space's message, or one already taken down - there is
  // nothing here to complain about.
  const { data: message } = await supabase
    .from('chat_messages_read_model')
    .select('id')
    .eq('id', parsed.data.messageId)
    .eq('tenant_id', tenant.id)
    .maybeSingle()

  if (!message) return { ok: false, error: 'That message is no longer here' }

  const { error } = await supabase.from('chat_message_reports').insert({
    message_id: parsed.data.messageId,
    reported_by: user.id,
    tenant_id: tenant.id,
    reason: parsed.data.reason,
  })

  if (error) {
    // The partial unique index on (message_id, reported_by) where open.
    if (error.code === '23505') {
      return { ok: false, error: 'You have already reported this one — it is in the queue' }
    }
    return { ok: false, error: `Failed to send the report: ${error.message}` }
  }

  return { ok: true }
}

/**
 * Take a message out of the room.
 *
 * A row in `hidden_chat_messages`, not a column on the message and not an event
 * on the space's stream - see the migration for why both of those are wrong. The
 * message itself is untouched: the words stay in the log, stay in the read
 * model, and stay visible to this queue, which is what makes the verdict
 * auditable afterwards. What stops is the select policy letting the room read
 * it.
 *
 * Upholding one report about a message answers all of them, the same way
 * banning a world does.
 */
export async function hideChatMessage(
  messageId: string,
  reason: string,
): Promise<ModerationResult> {
  const parsed = messageReportSchema.safeParse({ messageId, reason })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid takedown' }
  }

  const { user, admin } = await requireBackofficeSection('reports', 'write')

  const { error } = await admin.from('hidden_chat_messages').upsert(
    {
      message_id: parsed.data.messageId,
      reason: parsed.data.reason,
      hidden_by: user.id,
    },
    { onConflict: 'message_id' },
  )

  if (error) return { ok: false, error: `Failed to hide it: ${error.message}` }

  await admin
    .from('chat_message_reports')
    .update({
      status: 'upheld',
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
    })
    .eq('message_id', parsed.data.messageId)
    .eq('status', 'open')

  await recordBackofficeAction({
    actor: user,
    section: 'reports',
    action: 'message.hide',
    summary: `Hid chat message ${parsed.data.messageId} from the room`,
    detail: { messageId: parsed.data.messageId, reason: parsed.data.reason },
  })

  revalidatePath('/ovaloffice/reports')
  return { ok: true }
}

/** Put a message back. */
export async function unhideChatMessage(messageId: string): Promise<ModerationResult> {
  const parsed = z.uuid().safeParse(messageId)
  if (!parsed.success) return { ok: false, error: 'Invalid message' }

  const { user, admin } = await requireBackofficeSection('reports', 'write')

  const { error } = await admin
    .from('hidden_chat_messages')
    .delete()
    .eq('message_id', parsed.data)

  if (error) return { ok: false, error: `Failed to restore it: ${error.message}` }

  await recordBackofficeAction({
    actor: user,
    section: 'reports',
    action: 'message.unhide',
    summary: `Restored chat message ${parsed.data} to the room`,
    detail: { messageId: parsed.data },
  })

  revalidatePath('/ovaloffice/reports')
  return { ok: true }
}

/** Nothing wrong with it. Closes the report and leaves the message where it is. */
export async function dismissMessageReport(reportId: string): Promise<ModerationResult> {
  const parsed = z.uuid().safeParse(reportId)
  if (!parsed.success) return { ok: false, error: 'Invalid report' }

  const { user, admin } = await requireBackofficeSection('reports', 'write')

  const { error } = await admin
    .from('chat_message_reports')
    .update({
      status: 'dismissed',
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', parsed.data)
    .eq('status', 'open')

  if (error) return { ok: false, error: `Failed to dismiss: ${error.message}` }

  await recordBackofficeAction({
    actor: user,
    section: 'reports',
    action: 'message.dismiss',
    summary: `Dismissed chat message report ${parsed.data}`,
    detail: { reportId: parsed.data },
  })

  revalidatePath('/ovaloffice/reports')
  return { ok: true }
}
