'use server'

import { agentsDecider } from '@/domain/agents/aggregate'
import {
  adoptAgentSchema,
  type AgentCommand,
  releaseAgentSchema,
  renameAgentSchema,
} from '@/domain/agents/commands'
import { agentsProjection } from '@/domain/agents/projection'
import { agentsStreamId } from '@/domain/agents/streams'
import { executeCommand } from '@/es/command'
import { ConcurrencyError, DomainError } from '@/es/errors'
import { runProjection } from '@/es/projection'
import { requireTenant, writeBlockedReason } from '@/lib/tenant'

export type AgentResult = { ok: true } | { ok: false; error: string }

/**
 * Every write goes through here, for the reasons `run` in the homestead's
 * actions gives: the boilerplate is identical in all three, and identical
 * boilerplate is where the one that forgot its entitlement check hides.
 *
 * Also not revalidating a path, and for the same reason: these are fired from
 * inside a live WebGL canvas, and a `revalidatePath` would tear the React tree
 * down and take the scene with it. The client draws the change optimistically.
 */
async function run(slug: string, command: AgentCommand): Promise<AgentResult> {
  const context = await requireTenant(slug)

  const blocked = writeBlockedReason(context)
  if (blocked) return { ok: false, error: blocked }

  const { supabase, tenant, user } = context

  try {
    await executeCommand({
      supabase,
      decider: agentsDecider,
      tenantId: tenant.id,
      // Derived from the session's own user id, which is what makes putting a
      // creature in somebody else's kitchen unaddressable rather than refused.
      streamId: agentsStreamId(tenant.id, user.id),
      command,
      metadata: { actorId: user.id },
    })
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, error: error.message }
    if (error instanceof ConcurrencyError) {
      return { ok: false, error: 'That did not take. Try again.' }
    }
    throw error
  }

  await runProjection(supabase, agentsProjection, tenant.id)
  return { ok: true }
}

/**
 * Take in a creature.
 *
 * The caller supplies the id, which is unusual enough to be worth defending.
 * Two things fall out of it. The client can draw the animal the instant the
 * button is pressed, because the id is the seed and the seed is the whole
 * schedule - there is nothing to wait for the server to tell us. And a retried
 * request carries the same id, which the decider treats as a no-op, so a double
 * tap adopts one cat rather than two.
 *
 * What it does not open up: the id is checked as a uuid, so a caller cannot
 * fish for a seed whose routine parks the animal somewhere convenient.
 */
export async function adoptAgent(
  slug: string,
  input: { agentId: string; name: string; avatar: string; place: string },
): Promise<AgentResult> {
  const parsed = adoptAgentSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Bad adoption' }
  }
  return run(slug, { type: 'AdoptAgent', ...parsed.data })
}

export async function renameAgent(
  slug: string,
  input: { agentId: string; name: string },
): Promise<AgentResult> {
  const parsed = renameAgentSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Bad name' }
  }
  return run(slug, { type: 'RenameAgent', ...parsed.data })
}

/** Let one go. A new one adopted later gets a new id, and so a new routine. */
export async function releaseAgent(
  slug: string,
  input: { agentId: string },
): Promise<AgentResult> {
  const parsed = releaseAgentSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Bad release' }
  }
  return run(slug, { type: 'ReleaseAgent', ...parsed.data })
}
