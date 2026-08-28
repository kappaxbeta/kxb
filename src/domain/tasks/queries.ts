import 'server-only'
import type { TaskEvent } from '@/domain/tasks/events'
import type { Client } from '@/es/store'
import type { StoredEvent } from '@/es/types'

/**
 * The read side. These only ever touch the read model (or the raw log for the
 * inspector) - they never replay aggregates, which is the point of having a
 * projection at all.
 *
 * Every function takes a tenantId. RLS would scope these anyway, but passing it
 * explicitly means a page that forgot to establish which workspace it is in
 * cannot compile, rather than quietly returning whatever the policies allow.
 */

export interface TaskView {
  id: string
  title: string
  completed: boolean
  createdBy: string | null
  createdAt: string
  updatedAt: string
  version: number
}

export async function listTasks(supabase: Client, tenantId: string): Promise<TaskView[]> {
  const { data, error } = await supabase
    .from('tasks_read_model')
    .select('id, title, completed, created_by, created_at, updated_at, version')
    .eq('tenant_id', tenantId)
    .eq('deleted', false)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to list tasks: ${error.message}`)
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    completed: row.completed,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
  }))
}

export interface EventLogEntry {
  globalSeq: number
  streamId: string
  streamType: string
  version: number
  type: string
  data: unknown
  /** Null for system events, e.g. a Stripe webhook. */
  actorId: string | null
  createdAt: string
}

/**
 * The raw event log for one workspace, newest first - what the inspector panel
 * renders.
 *
 * It deliberately does not filter by stream type. A workspace's history is
 * tasks *and* the membership changes around them, in one sequence, and seeing
 * "carol joined" land between two task events is the clearest possible
 * demonstration that this is a single append-only log rather than a per-feature
 * audit table.
 */
export async function listRecentEvents(
  supabase: Client,
  tenantId: string,
  limit = 50,
): Promise<EventLogEntry[]> {
  const { data, error } = await supabase
    .from('events')
    .select('global_seq, stream_id, stream_type, version, type, data, actor_id, created_at')
    .eq('tenant_id', tenantId)
    .order('global_seq', { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(`Failed to read event log: ${error.message}`)
  }

  return (data ?? []).map((row) => ({
    globalSeq: Number(row.global_seq),
    streamId: row.stream_id,
    streamType: row.stream_type,
    version: row.version,
    type: row.type,
    data: row.data,
    actorId: row.actor_id,
    createdAt: row.created_at,
  }))
}

/** History of a single task, oldest first. */
export async function listTaskHistory(
  supabase: Client,
  tenantId: string,
  taskId: string,
): Promise<StoredEvent<TaskEvent>[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('stream_id', taskId)
    .order('version', { ascending: true })

  if (error) {
    throw new Error(`Failed to read history for ${taskId}: ${error.message}`)
  }

  return (data ?? []).map(
    (row) =>
      ({
        type: row.type,
        data: row.data,
        globalSeq: Number(row.global_seq),
        tenantId: row.tenant_id,
        streamId: row.stream_id,
        streamType: row.stream_type,
        version: row.version,
        actorId: row.actor_id,
        createdAt: row.created_at,
        metadata: row.metadata ?? {},
      }) as StoredEvent<TaskEvent>,
  )
}
