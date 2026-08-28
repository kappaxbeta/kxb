import 'server-only'
import type { Client } from '@/es/store'
import type { Json } from '@/lib/supabase/database.types'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Writing a line in the backoffice audit log.
 *
 * Called by an action *after* it has done the thing and confirmed it worked, so
 * the log records what happened rather than what was attempted. The write goes
 * through the service role on purpose: `backoffice_audit` has no insert policy,
 * because a log any client can append to is a log anybody can forge a line in,
 * and the action already proved the actor's right to act before it logs that
 * they did.
 *
 * Best-effort, and deliberately so. A failed audit write must not fail the
 * action it is recording - undoing a revoke because the diary was full would be
 * the log damaging the thing it exists to observe. It is logged to the server
 * console and swallowed. If audit integrity ever needs to be load-bearing, that
 * is a different design (write in the same transaction), and this comment is
 * where that decision would be argued.
 */
export async function recordBackofficeAction(input: {
  actor: { id: string; email?: string | null }
  section: string
  action: string
  summary: string
  detail?: Record<string, unknown>
}): Promise<void> {
  const admin = createAdminClient()

  const { error } = await admin.from('backoffice_audit').insert({
    actor_email: input.actor.email?.toLowerCase() ?? 'unknown',
    actor_id: input.actor.id,
    section: input.section,
    action: input.action,
    summary: input.summary,
    // The column is jsonb; the caller passes a plain object of ids and words.
    detail: (input.detail ?? {}) as Json,
  })

  if (error) {
    console.warn(`could not write audit line (${input.action}): ${error.message}`)
  }
}

export interface AuditEntry {
  id: string
  actorEmail: string
  section: string
  action: string
  summary: string
  detail: Record<string, unknown>
  createdAt: string
}

/**
 * The log, newest first, for the audit page.
 *
 * Capped like every other backoffice list - the page filters and pages what it
 * is given in the browser (see `useTableView`). The day this needs to reach
 * further back than the cap, it grows a date range that reaches the database;
 * until then the most recent few hundred lines are what anybody actually reads.
 */
export async function listAuditEntries(supabase: Client, limit = 300): Promise<AuditEntry[]> {
  const { data, error } = await supabase
    .from('backoffice_audit')
    .select('id, actor_email, section, action, summary, detail, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`Failed to load the audit log: ${error.message}`)

  return (data ?? []).map((row) => ({
    id: row.id,
    actorEmail: row.actor_email,
    section: row.section,
    action: row.action,
    summary: row.summary,
    detail: (row.detail ?? {}) as Record<string, unknown>,
    createdAt: row.created_at,
  }))
}
