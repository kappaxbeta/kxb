import 'server-only'
import { taskDecider } from '@/domain/tasks/aggregate'
import type { TaskCommand } from '@/domain/tasks/commands'
import { tasksProjection } from '@/domain/tasks/projection'
import { executeCommand } from '@/es/command'
import { ConcurrencyError, DomainError } from '@/es/errors'
import { runProjection } from '@/es/projection'
import { writeBlockedReason, type TenantContext } from '@/lib/tenant'

/**
 * A task command, executed against a space somebody is already inside.
 *
 * The five steps `actions.ts` describes, minus the two that are about being a
 * browser: the door (`requireTenant`, which redirects) and the revalidation
 * (`revalidatePath`, which is a Next.js cache and means nothing to a phone).
 * What is left is the part that has to be identical for both callers - the
 * write gate, the decider, and catching the read model up afterwards.
 *
 * The feature flag is *not* checked here, and that is deliberate rather than an
 * omission: `requireFeature` answers with `notFound()`, which is right in front
 * of a page and wrong inside a route handler, so each caller asks in the mood
 * it can act on. Both are asking `context.features.tasks`.
 *
 * Not a `'use server'` file - it takes a context object, which a client must
 * never be able to supply.
 */

export type TaskResult = { ok: true } | { ok: false; error: string }

export async function dispatchTask(
  context: TenantContext,
  streamId: string,
  command: TaskCommand,
): Promise<TaskResult> {
  const { user, supabase, tenant } = context

  // Archived, or billing lapsed. Either way the workspace is readable but
  // records nothing new - which is the whole "read-only, keep all data" rule.
  const blocked = writeBlockedReason(context)
  if (blocked) return { ok: false, error: blocked }

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
    /**
     * A thrown error worth showing somebody, or a genuine bug left to surface.
     * Swallowing the second as "something went wrong" is how a broken decider
     * becomes a support ticket instead of a stack trace.
     */
    if (error instanceof DomainError) return { ok: false, error: error.message }
    if (error instanceof ConcurrencyError) {
      return { ok: false, error: 'That task was changed elsewhere. Please try again.' }
    }
    throw error
  }

  await runProjection(supabase, tasksProjection, tenant.id)
  return { ok: true }
}
