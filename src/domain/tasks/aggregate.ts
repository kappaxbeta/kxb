import type { TaskCommand } from '@/domain/tasks/commands'
import { type TaskEvent, TASK_STREAM_TYPE } from '@/domain/tasks/events'
import { DomainError } from '@/es/errors'
import type { Decider } from '@/es/types'

/**
 * State is *only* what the decider needs to make its next decision.
 *
 * Note what is absent: no `createdAt`, no display fields. Those matter to the
 * UI, so they live in the read model. Keeping this struct minimal is what stops
 * the write side from slowly turning back into a CRUD row.
 */
export interface TaskState {
  status: 'none' | 'active' | 'deleted'
  title: string
  completed: boolean
}

export const initialTaskState: TaskState = {
  status: 'none',
  title: '',
  completed: false,
}

/**
 * Fold one event into state. Pure, total, and never throws - it must be able to
 * replay anything already in the log, including events written by older code.
 */
export function evolve(state: TaskState, event: TaskEvent): TaskState {
  switch (event.type) {
    case 'TaskCreated':
      return { status: 'active', title: event.data.title, completed: false }
    case 'TaskRenamed':
      return { ...state, title: event.data.title }
    case 'TaskCompleted':
      return { ...state, completed: true }
    case 'TaskReopened':
      return { ...state, completed: false }
    case 'TaskDeleted':
      return { ...state, status: 'deleted' }
    default:
      // An event type this version does not know about. Ignore it rather than
      // crash, so a rolled-back deploy can still replay newer history.
      return state
  }
}

/**
 * Decide what happened, given where we are and what was asked.
 *
 * Three possible outcomes, and the distinction matters:
 *   - events    -> something changed
 *   - `[]`      -> the request was already satisfied; succeed without writing
 *   - throw     -> the request is invalid and cannot be satisfied
 *
 * Returning `[]` for redundant commands keeps the log free of no-op noise, so
 * "completed" appears once per actual completion rather than once per click.
 */
export function decide(state: TaskState, command: TaskCommand): TaskEvent[] {
  switch (command.type) {
    case 'CreateTask': {
      if (state.status !== 'none') {
        throw new DomainError('This task already exists', 'task_exists')
      }
      return [{ type: 'TaskCreated', data: { title: command.title } }]
    }

    case 'RenameTask': {
      assertActive(state)
      if (state.title === command.title) return []
      return [{ type: 'TaskRenamed', data: { title: command.title } }]
    }

    case 'CompleteTask': {
      assertActive(state)
      if (state.completed) return []
      return [{ type: 'TaskCompleted', data: {} }]
    }

    case 'ReopenTask': {
      assertActive(state)
      if (!state.completed) return []
      return [{ type: 'TaskReopened', data: {} }]
    }

    case 'DeleteTask': {
      if (state.status === 'none') {
        throw new DomainError('Task not found', 'task_not_found')
      }
      // Deleting twice is not an error, it is a no-op.
      if (state.status === 'deleted') return []
      return [{ type: 'TaskDeleted', data: {} }]
    }

    default: {
      const exhaustive: never = command
      throw new DomainError(`Unknown command: ${JSON.stringify(exhaustive)}`)
    }
  }
}

function assertActive(state: TaskState): void {
  if (state.status === 'none') {
    throw new DomainError('Task not found', 'task_not_found')
  }
  if (state.status === 'deleted') {
    throw new DomainError('This task has been deleted', 'task_deleted')
  }
}

export const taskDecider: Decider<TaskState, TaskCommand, TaskEvent> = {
  streamType: TASK_STREAM_TYPE,
  initialState: initialTaskState,
  evolve,
  decide,
}
