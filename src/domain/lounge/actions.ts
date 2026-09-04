'use server'

import { loungeDecider } from '@/domain/lounge/aggregate'
import { type LoungeEdit } from '@/domain/lounge/commands'
import {
  type BlockPlacement,
  CHUNK_SIZE,
  chunkOf,
  DEFAULT_WORLD_SIZE,
} from '@/domain/lounge/events'
import { applyEditsFor } from '@/domain/lounge/edit'
import { chunkStreamId } from '@/domain/lounge/streams'
import { loungeGoalDecider } from '@/domain/lounge/goal-aggregate'
import { loungeGoalsProjection } from '@/domain/lounge/goal-projection'
import { listGoals } from '@/domain/lounge/goal-queries'
import type { Goal } from '@/domain/lounge/goal-events'
import { findTemplate } from '@/domain/lounge/templates'
import { clearWorld, copyWorld, countBlocks, MAX_COPY_BLOCKS } from '@/domain/lounge/copy'
import { DEFAULT_GROUND_MODEL, isKnownModel } from '@/domain/lounge/palette'
import { loungeProjection } from '@/domain/lounge/projection'
import { layTemplate, occupiedChunks } from '@/domain/lounge/lay-template'
import { buildMode, resolveWorld } from '@/domain/lounge/world-access'
import { executeCommand } from '@/es/command'
import { ConcurrencyError, DomainError } from '@/es/errors'
import { runProjection } from '@/es/projection'
import type { Client } from '@/es/store'
import { requireFeature, requireTenant, writeBlockedReason } from '@/lib/tenant'

/**
 * Applying a batch of world edits.
 *
 * This is where the world's coordinate space is translated into the aggregate's
 * chunk space. The player drags a line of blocks across a chunk boundary and
 * neither knows nor cares; this function splits that into one command per
 * affected chunk, each against its own stream.
 *
 * Two things are deliberately absent:
 *
 *   - **No revalidatePath.** Every other action in this codebase ends with one.
 *     Here it would re-render the page around a live WebGL canvas, throwing away
 *     the scene graph and the player's camera several times a second. The client
 *     already knows what it placed - it applied the change optimistically - so
 *     there is nothing to fetch back.
 *
 *   - **No per-block round trip.** The client buffers and flushes; see
 *     src/domain/lounge/events.ts for why one-event-per-block is quadratic.
 */

export type LoungeResult =
  | { ok: true; applied: number; goals?: Goal[] }
  | { ok: false; error: string }

export async function applyLoungeEdits(
  slug: string,
  edit: LoungeEdit,
  /** Omitted means the workspace's own lounge. A battlefield passes its id. */
  worldId?: string,
): Promise<LoungeResult> {
  /**
   * Everything after the door - the schema, the allow-list, the mode, the
   * budget, the per-chunk commands - moved to ./edit.ts when the native app
   * became a second caller, exactly the split chat made for say.ts. This
   * wrapper is the cookie door; `/api/m` holds the bearer one.
   */
  const context = await requireTenant(slug)
  return applyEditsFor(context, edit, worldId)
}

/**
 * Lay a flat floor at y=0, centred on the origin.
 *
 * The default 50x50 floor is 2,500 blocks, and the numbers that matter are the
 * ones batching turns it into:
 *
 *   * **~16 events, not 2,500.** The floor is emitted one chunk at a time, and
 *     a full chunk is 16x16 = 256 blocks - exactly MAX_BLOCKS_PER_EDIT. So each
 *     chunk's floor is a single event. That ratio is the whole argument for
 *     chunked streams from ./events.ts, at its most extreme.
 *
 *   * **2,500 read-model rows**, which is nothing for Postgres and a small
 *     payload to the browser on page load.
 *
 *   * **~32 round trips**, a few seconds. Still setup, not a hot path.
 *
 * It is idempotent by construction: the decider drops placements that match
 * what is already there, so running it twice writes nothing the second time,
 * and running it after someone has built writes only the gaps.
 */
export async function generateFloor(
  slug: string,
  model = DEFAULT_GROUND_MODEL,
  size = DEFAULT_WORLD_SIZE,
  /** Omitted means the workspace's own lounge. A battlefield passes its id. */
  worldId?: string,
): Promise<LoungeResult> {
  const prepared = await prepare(slug, model, size)
  if (!prepared.ok) return prepared

  const { supabase, tenantId, userId } = prepared

  const world = await resolveWorld(supabase, tenantId, worldId)
  if (!world.ok) return world

  // Laying a floor is building, so it follows the same rule as every other
  // placement - see the note in applyLoungeEdits.
  const blockedByMode = buildMode(world, prepared.loungeMode)
  if (blockedByMode) return { ok: false, error: blockedByMode }

  try {
    const applied = await layFloor(
      supabase,
      tenantId,
      world.worldId,
      userId,
      model,
      size,
    )
    await runProjection(supabase, loungeProjection, tenantId)
    return { ok: true, applied }
  } catch (error) {
    return toLoungeError(error, 'the floor was generating')
  }
}

/**
 * Wipe the world and lay a fresh floor.
 *
 * Destructive in the ordinary sense - every build in the workspace disappears -
 * but not in the event-sourcing sense. `ChunkCleared` is an event like any
 * other, so the history of what was there is still in the log and the world
 * before the reset can still be reconstructed by replaying to an earlier point.
 * The read model is what gets emptied, and the read model was always
 * disposable.
 */
export async function resetWorld(
  slug: string,
  model = DEFAULT_GROUND_MODEL,
  size = DEFAULT_WORLD_SIZE,
  /** Omitted means the workspace's own lounge. A battlefield passes its id. */
  worldId?: string,
): Promise<LoungeResult> {
  // Owner-only for the lounge, because it wipes every member's work at once.
  // A battlefield is not everyone's shared room, so an admin may reset one -
  // the same pair that could create and retire it in the first place.
  const prepared = await prepare(slug, model, size, !worldId)
  if (!prepared.ok) return prepared

  const { supabase, tenantId, userId } = prepared

  const world = await resolveWorld(supabase, tenantId, worldId)
  if (!world.ok) return world

  if (worldId && !prepared.canModerate) {
    return { ok: false, error: 'Only an owner or admin can reset a battlefield' }
  }

  try {
    // Clear only chunks that actually contain something. Iterating a fixed
    // range instead would miss anything built outside the new floor's extent -
    // a tower at x=5000 would survive a "reset everything".
    const occupied = await occupiedChunks(supabase, tenantId, world.worldId)

    let applied = 0

    for (const key of occupied) {
      const [cx, cz] = key.split(',').map(Number)
      const events = await executeCommand({
        supabase,
        decider: loungeDecider,
        tenantId,
        streamId: chunkStreamId(world.worldId, cx, cz),
        command: { type: 'ClearChunk', worldId: world.worldId, cx, cz },
        metadata: { actorId: userId },
      })
      applied += events.length
    }

    applied += await layFloor(
      supabase,
      tenantId,
      world.worldId,
      userId,
      model,
      size,
    )
    await runProjection(supabase, loungeProjection, tenantId)

    return { ok: true, applied }
  } catch (error) {
    return toLoungeError(error, 'the world was resetting')
  }
}

/**
 * Wipe the world and leave nothing behind.
 *
 * `resetWorld`'s counterpart for a room: a room opens exactly this way - see
 * `createRoom` - so this is the way back to it after somebody has built
 * something and wants the bare stream again. Not offered as a catalogue
 * template: `templates.test.ts` asserts every entry lays *something*, on
 * purpose, because a template that lays nothing is a template nobody chose
 * anything by picking. This skips that catalogue entirely and calls the same
 * `clearWorld` a template swap already clears with, laying nothing after.
 */
export async function emptyWorld(
  slug: string,
  /** Omitted means the workspace's own lounge. A room or battlefield passes its id. */
  worldId?: string,
): Promise<LoungeResult> {
  // Owner-only for the lounge, admin-or-owner for a named world - the same
  // pair `resetWorld` and `applyWorldTemplate` answer to, because this is a
  // reset that happens to leave nothing rather than a floor.
  const prepared = await prepare(slug, DEFAULT_GROUND_MODEL, DEFAULT_WORLD_SIZE, !worldId)
  if (!prepared.ok) return prepared

  const { supabase, tenantId, userId } = prepared

  const world = await resolveWorld(supabase, tenantId, worldId)
  if (!world.ok) return world

  if (worldId && !prepared.canModerate) {
    return { ok: false, error: 'Only an owner or admin can empty this world' }
  }

  const blockedByMode = buildMode(world, prepared.loungeMode)
  if (blockedByMode) return { ok: false, error: blockedByMode }

  try {
    let applied = await clearWorld(supabase, tenantId, world.worldId, userId)

    /**
     * The goals too, one stream at a time.
     *
     * `clearWorld` is blocks only - goals are a different aggregate, one stream
     * per goal rather than per chunk (see `copyGoals`) - so emptying without
     * this leaves a pair of goalposts standing in mid-air over nothing, and the
     * world is not empty at all. The same loop `applyWorldTemplate` runs before
     * it lays a new plan.
     */
    for (const goal of await listGoals(supabase, tenantId, world.worldId)) {
      const events = await executeCommand({
        supabase,
        decider: loungeGoalDecider,
        tenantId,
        streamId: goal.id,
        command: { type: 'RemoveGoal' },
        metadata: { actorId: userId },
      })
      applied += events.length
    }

    await runProjection(supabase, loungeProjection, tenantId)
    // The goals have their own checkpoint, so an emptied world only *looks*
    // emptied on the next load if this one has caught up too.
    await runProjection(supabase, loungeGoalsProjection, tenantId)
    return { ok: true, applied }
  } catch (error) {
    return toLoungeError(error, 'the world was emptying')
  }
}

/**
 * Load a saved arena into a world, replacing what is there.
 *
 * The other half of `saveWorldAsArena`: a space keeps several worlds and
 * swaps between them, so a world becomes whichever one somebody feels like
 * standing in rather than the one thing they can never get back. Defaults to
 * the lounge; a room passes its own id - see the note on `targetWorldId`.
 *
 * Owner-or-admin, for the same reason `resetWorld` is: this overwrites every
 * occupant's work at once, and the fact that it is being replaced by something
 * rather than by bare ground does not make it less destructive. The arena it
 * came from is untouched, so this is reversible - provided somebody saved the
 * target first, which is what the confirm in the UI says.
 */
export async function loadArenaInto(
  slug: string,
  arenaWorldId: string,
  /** Omitted means the workspace's own lounge. A room passes its id. */
  targetWorldId?: string,
): Promise<LoungeResult> {
  const context = await requireTenant(slug)
  requireFeature(context, 'battle')

  const blocked = writeBlockedReason(context)
  if (blocked) return { ok: false, error: blocked }

  const { supabase, tenant, user } = context

  // Owner or admin, the same pair that may rebuild it from a template - see the
  // note in `prepare`. Replacing a world with a saved arena and replacing it
  // with a fresh pitch are the same act with a different payload, and they
  // should not answer to different roles.
  if (tenant.role !== 'owner' && tenant.role !== 'admin') {
    return {
      ok: false,
      error: `Only an owner or admin can replace ${targetWorldId ? 'this room' : 'the lounge'}`,
    }
  }

  // Must be one of this space's own arenas. A public one from elsewhere is
  // somebody else's world; copying it in would make a silent duplicate of it
  // under this tenant, outside the reach of its owner's bans and edits.
  const arena = await resolveWorld(supabase, tenant.id, arenaWorldId)
  if (!arena.ok) return arena

  // And the destination has to be proven the same way, not merely trusted
  // because it arrived as `targetWorldId` - this is a public endpoint, and an
  // unresolved id could name a stream belonging to another tenant entirely.
  // See the note at the top of ./world-access.ts.
  const target = await resolveWorld(supabase, tenant.id, targetWorldId)
  if (!target.ok) return target

  const size = await countBlocks(supabase, tenant.id, arena.worldId)
  if (size > MAX_COPY_BLOCKS) {
    return {
      ok: false,
      error: `That arena is ${size.toLocaleString()} blocks — too much to copy in one go`,
    }
  }

  try {
    const { applied } = await copyWorld(
      supabase,
      tenant.id,
      user.id,
      arena.worldId,
      target.worldId,
    )
    await runProjection(supabase, loungeProjection, tenant.id)
    // The goals came along with the world - see copyGoals - and they render on
    // the very next load only if their projection has caught up too.
    await runProjection(supabase, loungeGoalsProjection, tenant.id)
    return { ok: true, applied }
  } catch (error) {
    return toLoungeError(error, 'the arena was loading')
  }
}

/**
 * Shared guard: membership, billing, and argument validation.
 *
 * An explicit discriminated union rather than an inferred one. Inferring it and
 * narrowing with `'error' in prepared` leaves TypeScript believing `error` might
 * be undefined on the failure branch, because the success shape simply lacks the
 * key rather than declaring it absent.
 */
type Prepared =
  | { ok: false; error: string }
  | {
      ok: true
      supabase: Client
      tenantId: string
      userId: string
      /** Owner or admin. Used for the battlefield-reset check. */
      canModerate: boolean
      loungeMode: 'creative' | 'battle'
    }

async function prepare(
  slug: string,
  model: string,
  size: number,
  moderatorOnly = false,
): Promise<Prepared> {
  if (!isKnownModel(model)) {
    return { ok: false, error: `Unknown block type: ${model}` }
  }
  if (!Number.isInteger(size) || size < 1 || size > 512) {
    return { ok: false, error: 'Floor size must be between 1 and 512' }
  }

  const context = await requireTenant(slug)
  const blocked = writeBlockedReason(context)
  if (blocked) return { ok: false, error: blocked }

  /**
   * Rebuilding the lounge destroys every member's work at once, so it is not a
   * member's call. Checked here rather than only in the UI: a Server Action is
   * a public endpoint, and hiding the button hides nothing.
   *
   * Owner *or* admin, not the owner alone. That pairing is what the role means
   * everywhere else in this space - an admin can already flip the lounge's
   * mode, rebuild a battlefield and retire one - and owner-only here had the
   * effect that an admin opened the world menu, found the world controls
   * missing, and had nothing to explain why.
   */
  const canModerate =
    context.tenant.role === 'owner' || context.tenant.role === 'admin'
  if (moderatorOnly && !canModerate) {
    return { ok: false, error: 'Only an owner or admin can rebuild the lounge' }
  }

  return {
    ok: true,
    supabase: context.supabase,
    tenantId: context.tenant.id,
    userId: context.user.id,
    canModerate,
    loungeMode: context.tenant.loungeMode,
  }
}

/** Emit one PlaceBlocks command per chunk of a size x size floor at y=0. */
async function layFloor(
  supabase: Client,
  tenantId: string,
  worldId: string,
  userId: string,
  model: string,
  size: number,
): Promise<number> {
  // Centred on the origin, so the player spawn is in the middle of it rather
  // than at a corner.
  const min = -Math.floor(size / 2)
  const max = min + size - 1

  const first = chunkOf(min, min)
  const last = chunkOf(max, max)

  let applied = 0

  for (let cx = first.cx; cx <= last.cx; cx++) {
    for (let cz = first.cz; cz <= last.cz; cz++) {
      // Clip each chunk to the requested extent, so edge chunks are partial
      // rather than spilling past the boundary.
      const blocks: BlockPlacement[] = []
      const xStart = Math.max(cx * CHUNK_SIZE, min)
      const xEnd = Math.min(cx * CHUNK_SIZE + CHUNK_SIZE - 1, max)
      const zStart = Math.max(cz * CHUNK_SIZE, min)
      const zEnd = Math.min(cz * CHUNK_SIZE + CHUNK_SIZE - 1, max)

      for (let x = xStart; x <= xEnd; x++) {
        for (let z = zStart; z <= zEnd; z++) {
          blocks.push({ x, y: 0, z, model })
        }
      }

      if (blocks.length === 0) continue

      const events = await executeCommand({
        supabase,
        decider: loungeDecider,
        tenantId,
        streamId: chunkStreamId(worldId, cx, cz),
        command: { type: 'PlaceBlocks', worldId, cx, cz, blocks },
        metadata: { actorId: userId },
      })
      applied += events.length
    }
  }

  return applied
}

/**
 * Wipe the world and lay a football pitch in it, goals included.
 *
 * The template. Everything it writes is something a person could have built by
 * hand - grass, white lines, a wall, and two goals of the same size a hand-placed
 * one starts at - which is the point: the pitch is not a special kind of world
 * with special rules, it is a head start on building one. Once it is down it can
 * be edited like anything else, and the goals can be dragged, resized and
 * reassigned from the build picker.
 *
 * Destructive in the same ordinary sense `resetWorld` is, and behind the same
 * owner-only gate for the lounge: it clears every chunk that has anything in it,
 * and every goal already standing. Not destructive in the event-sourcing sense -
 * `ChunkCleared` and `GoalRemoved` are events like any other, and the world
 * before the template is still in the log.
 *
 * The layout itself is decided by `planPitch`, which is pure and tested. This
 * function's whole job is turning that plan into the right commands against the
 * right streams.
 *
 * Kept as its own export now that `applyWorldTemplate` below generalises it,
 * because it is the shape the scene has always called and there is nothing to
 * gain from making every caller name a string.
 */
export async function generateFootballPitch(
  slug: string,
  /** Omitted means the workspace's own lounge. A battlefield passes its id. */
  worldId?: string,
): Promise<LoungeResult> {
  return applyWorldTemplate(slug, 'pitch', worldId)
}

/**
 * Wipe the world and lay one of the catalogue's templates in it.
 *
 * The generalisation of the pitch above: the destructive half - clear every
 * occupied chunk, take down every goal, lay the new blocks, stand the new goals
 * - is the same whatever is being laid, and the only thing that varies is the
 * plan. So the plan comes from ./templates.tsx, which is a file rather than a
 * table precisely so that adding a world is adding an entry there.
 *
 * `templateId` arrives from a client, so an unknown one is an ordinary refusal
 * rather than a crash - the catalogue is the allowlist.
 *
 * Everything else - who may do this, what it costs, why it is destructive in
 * only the ordinary sense - is exactly as `generateFootballPitch` describes it
 * above, because this is that function with the plan lifted out.
 */
export async function applyWorldTemplate(
  slug: string,
  templateId: string,
  /** Omitted means the workspace's own lounge. A battlefield passes its id. */
  worldId?: string,
): Promise<LoungeResult> {
  const template = findTemplate(templateId)
  if (!template) return { ok: false, error: 'No such world template' }

  // Owner-only for the lounge, admin-or-owner for a battlefield: the same pair
  // of rules `resetWorld` applies, because this is a reset that happens to leave
  // something behind.
  const prepared = await prepare(slug, DEFAULT_GROUND_MODEL, DEFAULT_WORLD_SIZE, !worldId)
  if (!prepared.ok) return prepared

  const { supabase, tenantId, userId } = prepared

  const world = await resolveWorld(supabase, tenantId, worldId)
  if (!world.ok) return world

  // A named world - a battlefield or a room - answers to the same pair the
  // lounge does. `prepare` only asked the question when `worldId` was absent,
  // so it is asked here for the other branch.
  if (worldId && !prepared.canModerate) {
    return { ok: false, error: 'Only an owner or admin can rebuild this world' }
  }

  // Laying a template is building, so it follows the rule building follows. A
  // room or the lounge being in battle mode while somebody replaces the floor
  // everyone is standing on is exactly the interruption the mode exists to
  // prevent.
  const blockedByMode = buildMode(world, prepared.loungeMode)
  if (blockedByMode) return { ok: false, error: blockedByMode }

  try {
    const laid = await layTemplate(supabase, tenantId, world.worldId, userId, template)
    return { ok: true, applied: laid.applied, goals: laid.goals }
  } catch (error) {
    return toLoungeError(error, `“${template.name}” was being laid`)
  }
}

function toLoungeError(error: unknown, during: string): LoungeResult {
  if (error instanceof DomainError) {
    return { ok: false, error: error.message }
  }
  if (error instanceof ConcurrencyError) {
    return { ok: false, error: `Someone was building while ${during}. Try again.` }
  }
  throw error
}
