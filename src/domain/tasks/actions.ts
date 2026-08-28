'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { taskDecider } from '@/domain/tasks/aggregate'
import {
  createTaskSchema,
  renameTaskSchema,
  type TaskCommand,
  taskIdSchema,
} from '@/domain/tasks/commands'
import { tasksProjection } from '@/domain/tasks/projection'
import { executeCommand } from '@/es/command'
import { ConcurrencyError, DomainError } from '@/es/errors'
import { resetProjection, runProjection } from '@/es/projection'
import { requireFeature, requireTenant, writeBlockedReason } from '@/lib/tenant'

/**
 * Server Actions are the command handlers. Each one does the same five things:
 *
 *   1. authenticate, and establish which workspace this is
 *   2. validate the command's shape
 *   3. execute it through the decider (load -> fold -> decide -> append)
 *   4. catch the read model up, then revalidate the page
 *
 * Step 1 grew a second half with tenants. The slug arrives from the client like
 * any other argument, so it is not trusted: requireTenant re-resolves it and
 * re-checks membership on every call. Rendering the page that holds the button
 * is not a permission check - the action is a POST endpoint anyone can reach.
 *
 * Any member may work on any task. Roles gate the workspace (who can invite,
 * rename, remove), not its contents; if you wanted per-task permissions they
 * would belong in the task decider, with the actor's role passed in as part of
 * the command.
 */

export type ActionResult = { ok: true } | { ok: false; error: string }

/**
 * Turn a thrown error into something worth showing a user, while letting
 * genuine bugs surface instead of being swallowed as "something went wrong".
 */
function toResult(error: unknown): ActionResult {
  if (error instanceof DomainError) {
    return { ok: false, error: error.message }
  }
  if (error instanceof ConcurrencyError) {
    return {
      ok: false,
      error: 'That task was changed elsewhere. Please try again.',
    }
  }
  throw error
}

async function dispatch(
  slug: string,
  streamId: string,
  command: TaskCommand,
): Promise<ActionResult> {
  const context = await requireTenant(slug)
  requireFeature(context, 'tasks')
  const { user, supabase, tenant } = context

  // Archived, or billing lapsed. Either way the workspace is readable but
  // records nothing new - which is the whole "read-only, keep all data" rule.
  const blocked = writeBlockedReason(context)
  if (blocked) {
    return { ok: false, error: blocked }
  }

  try {
    await executeCommand({
      supabase,
      decider: taskDecider,
      tenantId: tenant.id,
      streamId,
      command,
      metadata: { actorId: user.id },
    })
  } catch (error) {
    return toResult(error)
  }

  await runProjection(supabase, tasksProjection, tenant.id)
  revalidatePath(`/t/${slug}/tasks`)
  return { ok: true }
}

// These take plain arguments rather than (prevState, FormData). The UI drives
// them through useOptimistic, which needs to apply its local update and call
// the action itself - it is not a bare `<form action={...}>` submission.

export async function createTask(slug: string, title: string): Promise<ActionResult> {
  const parsed = createTaskSchema.safeParse({ title })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid title' }
  }

  // The client does not choose the id, and neither does the database - we mint
  // it here so the stream id is known before the write. The UI's optimistic row
  // carries a throwaway id until revalidation replaces it with this one.
  return dispatch(slug, randomUUID(), {
    type: 'CreateTask',
    title: parsed.data.title,
  })
}

export async function renameTask(
  slug: string,
  id: string,
  title: string,
): Promise<ActionResult> {
  const parsed = renameTaskSchema.safeParse({ id, title })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  return dispatch(slug, parsed.data.id, {
    type: 'RenameTask',
    title: parsed.data.title,
  })
}

export async function setTaskCompletion(
  slug: string,
  id: string,
  completed: boolean,
): Promise<ActionResult> {
  const parsed = taskIdSchema.safeParse({ id })
  if (!parsed.success) return { ok: false, error: 'Invalid task id' }

  return dispatch(slug, parsed.data.id, {
    type: completed ? 'CompleteTask' : 'ReopenTask',
  })
}

export async function deleteTask(slug: string, id: string): Promise<ActionResult> {
  const parsed = taskIdSchema.safeParse({ id })
  if (!parsed.success) return { ok: false, error: 'Invalid task id' }

  return dispatch(slug, parsed.data.id, { type: 'DeleteTask' })
}

/**
 * Wipe the workspace's read model and rebuild it from the log.
 *
 * Wired to a button in the UI because it is the clearest demonstration of what
 * event sourcing buys you: the projection is disposable, and the events are the
 * only thing that had to be right.
 *
 * Note this rebuilds for everyone in the workspace, not just the person who
 * clicked - the read model and its checkpoint are shared now. That is fine
 * because replaying is deterministic, but it is the kind of button that wants a
 * role check before it goes anywhere near production.
 */
export async function rebuildReadModel(slug: string): Promise<ActionResult> {
  const context = await requireTenant(slug)
  requireFeature(context, 'tasks')
  const { supabase, tenant } = context

  const { error } = await supabase
    .from('tasks_read_model')
    .delete()
    .eq('tenant_id', tenant.id)

  if (error) {
    return { ok: false, error: `Could not clear read model: ${error.message}` }
  }

  await resetProjection(supabase, tasksProjection, tenant.id)
  await runProjection(supabase, tasksProjection, tenant.id)

  revalidatePath(`/t/${slug}/tasks`)
  return { ok: true }
}
