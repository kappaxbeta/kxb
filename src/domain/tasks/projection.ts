import { type TaskEvent, TASK_STREAM_TYPE } from '@/domain/tasks/events'
import type { Projection } from '@/es/projection'
import type { Client } from '@/es/store'
import type { StoredEvent } from '@/es/types'

/**
 * The read side of CQRS: fold the task event log into a flat table the UI can
 * query in one round trip.
 *
 * All of this is plain TypeScript - no triggers, no database functions. The
 * cost is that the read model is eventually consistent with the log; the
 * benefit is that projection logic is versioned, reviewable and debuggable
 * alongside the rest of the app, and rebuilding is just replaying it.
 *
 * Every handler here is idempotent (assignment, never accumulation), so a
 * replayed event lands on the same result.
 *
 * Note where tenant_id and created_by come from: the stored event, not a
 * session. A projection has no request and no signed-in user - it may be
 * replaying something written months ago by somebody who has since left. Every
 * value it writes has to come out of the log.
 */
export const tasksProjection: Projection<TaskEvent> = {
  name: 'tasks_read_model',
  streamTypes: [TASK_STREAM_TYPE],

  async handle(supabase: Client, event: StoredEvent<TaskEvent>): Promise<void> {
    switch (event.type) {
      case 'TaskCreated':
        await upsert(supabase, {
          id: event.streamId,
          tenant_id: event.tenantId,
          title: event.data.title,
          completed: false,
          deleted: false,
          created_by: event.actorId,
          created_at: event.createdAt,
          updated_at: event.createdAt,
          version: event.version,
        })
        return

      case 'TaskRenamed':
        await patch(supabase, event, { title: event.data.title })
        return

      case 'TaskCompleted':
        await patch(supabase, event, { completed: true })
        return

      case 'TaskReopened':
        await patch(supabase, event, { completed: false })
        return

      case 'TaskDeleted':
        // Soft delete. The row stays so the UI can show what was removed, and
        // the events are still there regardless - nothing is ever truly lost.
        await patch(supabase, event, { deleted: true })
        return

      default:
        // Unknown event type: leave the row alone rather than fail the batch.
        return
    }
  },
}

type TaskRow = {
  id: string
  tenant_id: string
  title: string
  completed: boolean
  deleted: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  version: number
}

async function upsert(supabase: Client, row: TaskRow): Promise<void> {
  const { error } = await supabase.from('tasks_read_model').upsert(row, { onConflict: 'id' })
  if (error) {
    throw new Error(`tasks projection failed to upsert ${row.id}: ${error.message}`)
  }
}

async function patch(
  supabase: Client,
  event: StoredEvent<TaskEvent>,
  changes: Partial<TaskRow>,
): Promise<void> {
  const { error } = await supabase
    .from('tasks_read_model')
    .update({
      ...changes,
      updated_at: event.createdAt,
      version: event.version,
    })
    .eq('id', event.streamId)

  if (error) {
    throw new Error(`tasks projection failed to update ${event.streamId}: ${error.message}`)
  }
}
