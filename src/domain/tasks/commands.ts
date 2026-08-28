import { z } from 'zod'

/**
 * Commands are requests, named in the imperative. They can be rejected -
 * that is the difference between a command and an event.
 *
 * The schemas here validate *shape*. Rules that depend on current state
 * ("cannot rename a deleted task") belong in the decider, not here.
 */

export const titleSchema = z
  .string()
  .trim()
  .min(1, 'Title cannot be empty')
  .max(200, 'Title cannot exceed 200 characters')

export const createTaskSchema = z.object({ title: titleSchema })
export const renameTaskSchema = z.object({ id: z.uuid(), title: titleSchema })
export const taskIdSchema = z.object({ id: z.uuid() })

export type CreateTask = { type: 'CreateTask'; title: string }
export type RenameTask = { type: 'RenameTask'; title: string }
export type CompleteTask = { type: 'CompleteTask' }
export type ReopenTask = { type: 'ReopenTask' }
export type DeleteTask = { type: 'DeleteTask' }

export type TaskCommand =
  | CreateTask
  | RenameTask
  | CompleteTask
  | ReopenTask
  | DeleteTask
