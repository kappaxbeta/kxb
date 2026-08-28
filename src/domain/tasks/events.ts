import type { DomainEvent } from '@/es/types'

/**
 * The task aggregate's events.
 *
 * These are the source of truth and the hardest thing in the system to change,
 * because old events stay in the log forever. Rules that pay off later:
 *
 *   - Name them as facts in the past tense.
 *   - Record intent, not a state diff. `TaskCompleted` says why the row
 *     changed; `TaskUpdated { completed: true }` throws that away.
 *   - Only add optional fields. To change a field's meaning, add a new event
 *     type (`TaskRenamedV2`) and keep handling the old one.
 */

export type TaskCreated = DomainEvent<'TaskCreated', { title: string }>
export type TaskRenamed = DomainEvent<'TaskRenamed', { title: string }>
export type TaskCompleted = DomainEvent<'TaskCompleted', Record<string, never>>
export type TaskReopened = DomainEvent<'TaskReopened', Record<string, never>>
export type TaskDeleted = DomainEvent<'TaskDeleted', Record<string, never>>

export type TaskEvent =
  | TaskCreated
  | TaskRenamed
  | TaskCompleted
  | TaskReopened
  | TaskDeleted

export const TASK_STREAM_TYPE = 'task'

/** Human-readable labels for the event log viewer. */
export const TASK_EVENT_LABELS: Record<TaskEvent['type'], string> = {
  TaskCreated: 'created',
  TaskRenamed: 'renamed',
  TaskCompleted: 'completed',
  TaskReopened: 'reopened',
  TaskDeleted: 'deleted',
}
