import 'server-only'
import { loungeDecider } from '@/domain/lounge/aggregate'
import { type LoungeEdit, loungeEditSchema } from '@/domain/lounge/commands'
import { MAX_WORLD_BLOCKS } from '@/domain/lounge/events'
import { groupByChunk } from '@/domain/lounge/lay-template'
import { isKnownModel } from '@/domain/lounge/palette'
import { loungeProjection } from '@/domain/lounge/projection'
import { chunkStreamId } from '@/domain/lounge/streams'
import { buildMode, resolveWorld } from '@/domain/lounge/world-access'
import { executeCommand } from '@/es/command'
import { ConcurrencyError, DomainError } from '@/es/errors'
import { runProjection } from '@/es/projection'
import { writeBlockedReason, type TenantContext } from '@/lib/tenant'

/**
 * Laying and breaking blocks, with the door already open.
 *
 * This used to be the body of `applyLoungeEdits` in ./actions.ts, and every
 * line of the argument for how it behaves is still written there. What moved
 * here is only the part that runs *after* somebody has been let into the
 * space, because there are two ways of being let in now: a browser arrives
 * with a session cookie and goes through `requireTenant`, and the native app
 * arrives with a bearer token and goes through `requireBearerTenant`. Both
 * hand back the same `TenantContext` - the arrangement `src/domain/chat/say.ts`
 * established, applied to the hottest write in the product.
 *
 * The gates are asked here rather than at either door, which is the point:
 * the write block, the mode, the world's naming rule and its size budget are
 * building's rules, they have to be right for both callers, and a second copy
 * under `/api/m` would be correct only until one of the two was edited.
 *
 * Not a `'use server'` file, deliberately. That directive turns every export
 * into a public POST endpoint, and this takes a context object a client must
 * never be able to supply.
 */

export type EditResult = { ok: true; applied: number } | { ok: false; error: string }

export async function applyEditsFor(
  context: TenantContext,
  edit: LoungeEdit,
  /** Omitted means the workspace's own lounge. A room or battlefield passes its id. */
  worldId?: string,
): Promise<EditResult> {
  const parsed = loungeEditSchema.safeParse(edit)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid edit' }
  }

  const { place, remove } = parsed.data

  // The allow-list check. `model` is written to an immutable log, so an unknown
  // id must never reach it - Zod only proved it was a short string.
  const unknown = place.find((block) => !isKnownModel(block.model))
  if (unknown) {
    return { ok: false, error: `Unknown block type: ${unknown.model}` }
  }

  const { supabase, tenant, user } = context

  const blocked = writeBlockedReason(context)
  if (blocked) return { ok: false, error: blocked }

  if (place.length === 0 && remove.length === 0) {
    return { ok: true, applied: 0 }
  }

  // Which world is being edited, resolved once. A battlefield's id has to be
  // proven to belong to this space before it is written to, or a member of one
  // workspace could address another's arena by guessing its id.
  const world = await resolveWorld(supabase, tenant.id, worldId)
  if (!world.ok) return world

  /**
   * Building is creative mode only.
   *
   * Checked here and not merely in the scene, because hiding a control hides
   * nothing - this is a public endpoint, and a client that kept sending edits
   * would otherwise be able to wall an opponent in mid-fight.
   *
   * After `resolveWorld` rather than before it, which it used to be: the mode
   * that governs this edit depends on which world it lands in - the tenant's
   * column for the lounge, the room's own for a room - and only that call can
   * say which. A battlefield answers to neither; it is edited from its own
   * builder, gated on being an owner or admin of the space that made it.
   */
  const blockedByMode = buildMode(world, tenant.loungeMode)
  if (blockedByMode) return { ok: false, error: blockedByMode }

  /**
   * Is there room left in this world?
   *
   * Counted from the read model rather than tracked in an aggregate, because
   * the budget is a fact about the *world* and the aggregate is a chunk - no
   * chunk can see the total, and a world-wide aggregate is precisely the
   * quadratic replay this design exists to avoid (see the note at the top of
   * ./events.ts).
   *
   * Only on placement, and only when something is actually being placed, so
   * removing blocks from a full world always works - otherwise a world that hit
   * the ceiling would be frozen rather than merely full.
   *
   * The count is approximate by the time it is used: another builder may commit
   * between the count and the write. That is deliberate and safe. Overshooting
   * by a few hundred blocks costs nothing - the number that matters is
   * MAX_BLOCKS_LOADED, which sits well above this - and the alternative is
   * serialising every placement in the world behind one lock, which would cost
   * far more than the slack does.
   */
  if (place.length > 0) {
    const { count, error } = await supabase
      .from('lounge_blocks_read_model')
      .select('x', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .eq('world_id', world.worldId)

    if (error) {
      return { ok: false, error: `Could not check the world's size: ${error.message}` }
    }

    // `place` is the batch as sent, so this over-counts the blocks that turn out
    // to be no-ops - a drag re-sending cells that already hold that model. Erring
    // that way keeps the check cheap; the alternative is resolving every
    // placement against state before knowing whether it is allowed.
    if ((count ?? 0) + place.length > MAX_WORLD_BLOCKS) {
      return {
        ok: false,
        error: `This world is full — ${MAX_WORLD_BLOCKS.toLocaleString()} blocks is the limit. Remove some to build more.`,
      }
    }
  }

  const placeByChunk = groupByChunk(place)
  const removeByChunk = groupByChunk(remove)
  const touched = new Set([...placeByChunk.keys(), ...removeByChunk.keys()])

  let applied = 0

  for (const key of touched) {
    const [cx, cz] = key.split(',').map(Number)
    const streamId = chunkStreamId(world.worldId, cx, cz)

    try {
      // Removals first. Within one flush a player may break a block and place
      // another in the same cell; doing it in this order means the placement
      // wins, which is what they saw happen on screen.
      const removals = removeByChunk.get(key)
      if (removals && removals.length > 0) {
        const events = await executeCommand({
          supabase,
          decider: loungeDecider,
          tenantId: tenant.id,
          streamId,
          command: {
            type: 'RemoveBlocks',
            worldId: world.worldId,
            cx,
            cz,
            positions: removals,
          },
          metadata: { actorId: user.id },
        })
        applied += events.length
      }

      const placements = placeByChunk.get(key)
      if (placements && placements.length > 0) {
        const events = await executeCommand({
          supabase,
          decider: loungeDecider,
          tenantId: tenant.id,
          streamId,
          command: {
            type: 'PlaceBlocks',
            worldId: world.worldId,
            cx,
            cz,
            blocks: placements,
          },
          metadata: { actorId: user.id },
        })
        applied += events.length
      }
    } catch (error) {
      if (error instanceof DomainError) {
        return { ok: false, error: error.message }
      }
      if (error instanceof ConcurrencyError) {
        return {
          ok: false,
          error: 'Someone else was building right there. Try again.',
        }
      }
      throw error
    }
  }

  // One projection run for the whole flush, not one per chunk: runProjection
  // reads forward across the tenant's log, so a single pass picks up every
  // chunk we just touched.
  await runProjection(supabase, loungeProjection, tenant.id)

  return { ok: true, applied }
}
