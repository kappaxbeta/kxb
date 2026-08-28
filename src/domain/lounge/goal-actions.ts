'use server'

import { randomUUID } from 'node:crypto'
import { loungeGoalDecider } from '@/domain/lounge/goal-aggregate'
import {
  goalPositionSchema,
  goalSizeSchema,
  goalKindSchema,
  type LoungeGoalCommand,
  placeGoalSchema,
} from '@/domain/lounge/goal-commands'
import { MAX_GOALS_PER_WORLD } from '@/domain/lounge/goal-events'
import { loungeGoalsProjection } from '@/domain/lounge/goal-projection'
import { countGoals } from '@/domain/lounge/goal-queries'
import { buildMode, resolveWorld } from '@/domain/lounge/world-access'
import { executeCommand } from '@/es/command'
import { ConcurrencyError, DomainError } from '@/es/errors'
import { runProjection } from '@/es/projection'
import { requireTenant, writeBlockedReason } from '@/lib/tenant'
import { z } from 'zod'

/**
 * Commands for the goals in a world.
 *
 * One stream per goal, so these look like the image actions rather than the block
 * ones: load, fold, decide, append, against a single aggregate. Resizing a goal
 * is one event, not a rewritten wall.
 *
 * Like every other action that touches the world, none of these revalidate the
 * page. The lounge is a live canvas and re-rendering the route would throw away
 * the WebGL context - the client applies the change optimistically and there is
 * nothing to fetch back.
 *
 * Placing a goal is *building*, and follows exactly the rule building follows:
 * the space has to be in creative mode, and a member who cannot place a block
 * cannot place a goal either. A goal that could be moved during a match would be
 * a goal somebody could move while a shot was in the air.
 */

export type GoalResult = { ok: true; id: string } | { ok: false; error: string }

const goalIdSchema = z.object({ id: z.string().uuid() })

/**
 * A spawn cell.
 *
 * Whole cells, and bounded to the same reach a goal is placed within. Integers
 * because `arrivalCell` adds whole-cell offsets to it and `surfaceAt` looks up
 * the column by its cell - a spawn on a half block would put the ring between
 * two columns and the arrivals on neither.
 */
const spawnSchema = z.object({
  x: z.number().int().min(-512).max(512),
  z: z.number().int().min(-512).max(512),
  /**
   * The surface it was set on, and the only optional part of a door.
   *
   * Bounded well above and a little below the reach of the other two: a world
   * has far less height than width, and a door under the floor is a typo
   * rather than a place. Optional because a caller that does not know the
   * height - a world import, an older client - should still be able to set a
   * door, and gets the arrival every spawn had before heights existed.
   */
  y: z.number().int().min(-64).max(512).optional(),
})

function toResult(error: unknown): { ok: false; error: string } {
  if (error instanceof DomainError) return { ok: false, error: error.message }
  if (error instanceof ConcurrencyError) {
    return { ok: false, error: 'Someone else changed that goal. Try again.' }
  }
  throw error
}

/**
 * Membership, write access, and the creative-mode gate.
 *
 * The mode check asks whichever mode governs the world being edited - the
 * tenant's column for the lounge, the room's own for a room - and asks nothing
 * of a battlefield, which is edited from the creative tools regardless of what
 * mode anything else is in because it is not a room anybody is standing in. See
 * `buildMode`, which is the one copy of that rule.
 */
async function prepare(slug: string, worldId: string | undefined) {
  const context = await requireTenant(slug)

  const blocked = writeBlockedReason(context)
  if (blocked) return { ok: false as const, error: blocked }

  const tenantId = context.tenant.id
  const world = await resolveWorld(context.supabase, tenantId, worldId)
  if (!world.ok) return world

  const blockedByMode = buildMode(world, context.tenant.loungeMode)
  if (blockedByMode) return { ok: false as const, error: blockedByMode }

  return {
    ok: true as const,
    supabase: context.supabase,
    tenantId,
    worldId: world.worldId,
    userId: context.user.id,
  }
}

async function dispatch(
  slug: string,
  worldId: string | undefined,
  streamId: string,
  makeCommand: (worldId: string) => LoungeGoalCommand,
): Promise<GoalResult> {
  const prepared = await prepare(slug, worldId)
  if (!prepared.ok) return prepared

  const { supabase, tenantId, userId } = prepared

  try {
    await executeCommand({
      supabase,
      decider: loungeGoalDecider,
      tenantId,
      streamId,
      command: makeCommand(prepared.worldId),
      metadata: { actorId: userId },
    })
  } catch (error) {
    return toResult(error)
  }

  await runProjection(supabase, loungeGoalsProjection, tenantId)
  return { ok: true, id: streamId }
}

/**
 * Stand a new goal in the world.
 *
 * The id is minted here rather than by the client, for the same reason an image's
 * is: the stream id has to exist before the first event is written, and it is not
 * something a browser should get to choose.
 *
 * The cap is checked against the read model rather than in the decider, because
 * the decider sees one goal's stream and "how many goals does this world have" is
 * a question about all of them. That makes it racy in principle - two people
 * placing the last goal at the same instant could both pass - and the
 * consequence is a world with one goal more than the cap, which the query above
 * is written to survive. The alternative is a per-world aggregate that exists
 * only to count, which is a lot of machinery to make an off-by-one impossible.
 */
export async function placeGoal(
  slug: string,
  input: {
    kind: string
    x: number
    y: number
    z: number
    width?: number
    height?: number
    facing?: number
  },
  worldId?: string,
): Promise<GoalResult> {
  const parsed = placeGoalSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid goal' }
  }

  const prepared = await prepare(slug, worldId)
  if (!prepared.ok) return prepared

  const existing = await countGoals(
    prepared.supabase,
    prepared.tenantId,
    prepared.worldId,
  )
  if (existing >= MAX_GOALS_PER_WORLD) {
    return {
      ok: false,
      error: `A world holds ${MAX_GOALS_PER_WORLD} marks`,
    }
  }

  return dispatch(slug, worldId, randomUUID(), (world) => ({
    type: 'PlaceGoal',
    worldId: world,
    ...parsed.data,
  }))
}

export async function moveGoal(
  slug: string,
  input: { id: string; x: number; y: number; z: number },
  worldId?: string,
): Promise<GoalResult> {
  const parsed = goalPositionSchema.and(goalIdSchema).safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid position' }
  }

  const { id, ...cell } = parsed.data
  return dispatch(slug, worldId, id, () => ({ type: 'MoveGoal', ...cell }))
}

/**
 * Make the mouth bigger or smaller.
 *
 * The thing the build picker's goal panel is for. Whole cells only, so a goal
 * stays lined up with whatever was built around it.
 */
export async function resizeGoal(
  slug: string,
  input: { id: string; width: number; height: number },
  worldId?: string,
): Promise<GoalResult> {
  const parsed = goalSizeSchema.and(goalIdSchema).safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid size' }
  }

  const { id, width, height } = parsed.data
  return dispatch(slug, worldId, id, () => ({ type: 'ResizeGoal', width, height }))
}

/** Turn it. `facing` is quarter turns; the decider wraps out-of-range values. */
export async function rotateGoal(
  slug: string,
  input: { id: string; facing: number },
  worldId?: string,
): Promise<GoalResult> {
  const parsed = z
    .object({ facing: z.number().int() })
    .and(goalIdSchema)
    .safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid rotation' }
  }

  return dispatch(slug, worldId, parsed.data.id, () => ({
    type: 'RotateGoal',
    facing: parsed.data.facing,
  }))
}

/** Hand it to the other side, or re-mark it as something else. */
export async function setGoalTeam(
  slug: string,
  input: { id: string; kind: string },
  worldId?: string,
): Promise<GoalResult> {
  const parsed = z
    .object({ kind: goalKindSchema })
    .and(goalIdSchema)
    .safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid mark' }
  }

  return dispatch(slug, worldId, parsed.data.id, () => ({
    type: 'SetGoalTeam',
    kind: parsed.data.kind,
  }))
}

export async function removeGoal(
  slug: string,
  id: string,
  worldId?: string,
): Promise<GoalResult> {
  const parsed = goalIdSchema.safeParse({ id })
  if (!parsed.success) return { ok: false, error: 'Invalid goal id' }

  return dispatch(slug, worldId, parsed.data.id, () => ({ type: 'RemoveGoal' }))
}

/**
 * Where people come in.
 *
 * A row rather than a stream, deliberately, and unlike everything else in this
 * file. A goal has a lifecycle - it is placed, moved, resized, reassigned and
 * taken away, and each of those refers to the same object over time, which is
 * what earns it an event stream. A spawn point has none of that: there is one
 * per world, it is a pair of numbers, and "it used to be over there" is not a
 * fact anybody has ever wanted back. `world_spawns` already existed for exactly
 * this shape - see 20260907000000_world_spawns.sql - and was only ever written
 * by a world import, which is why standing in a lounge there was no way to say
 * where the door was.
 *
 * Owner and admin only, which is the table's own policy and not a check made
 * here. Where somebody arrives is a property of the room rather than a piece of
 * building, so a member with the build flag does not get to move it - the same
 * split the room's own settings already make.
 */
export async function setWorldSpawn(
  slug: string,
  input: { x: number; z: number; y?: number },
  worldId?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = spawnSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid spot' }
  }

  const prepared = await prepare(slug, worldId)
  if (!prepared.ok) return prepared

  const { error } = await prepared.supabase.from('world_spawns').upsert({
    world_id: prepared.worldId,
    tenant_id: prepared.tenantId,
    x: parsed.data.x,
    z: parsed.data.z,
    /**
     * The height, when the caller knows one.
     *
     * Written as null rather than omitted when it is absent, so moving a door
     * from an island back down to the floor clears the old preference instead
     * of leaving the upsert silently carrying it.
     */
    y: parsed.data.y ?? null,
  })

  /**
   * The policy's refusal, said in words somebody can act on.
   *
   * RLS answers a forbidden upsert with a row-level-security violation, which
   * is accurate and tells the person reading it nothing about what they should
   * have done. Everything else that can go wrong here is a real fault.
   */
  if (error) {
    return {
      ok: false,
      error: error.code === '42501'
        ? 'Only an owner or an admin can move the door'
        : 'Could not move the door. Try again.',
    }
  }

  return { ok: true }
}

/** Back to the middle, which is what every world did before doors existed. */
export async function clearWorldSpawn(
  slug: string,
  worldId?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const prepared = await prepare(slug, worldId)
  if (!prepared.ok) return prepared

  const { error } = await prepared.supabase
    .from('world_spawns')
    .delete()
    .eq('world_id', prepared.worldId)

  if (error) {
    return {
      ok: false,
      error: error.code === '42501'
        ? 'Only an owner or an admin can move the door'
        : 'Could not clear the door. Try again.',
    }
  }

  return { ok: true }
}

/**
 * Whether the arrival ring is drawn on the floor of this world.
 *
 * A property of the room and not of the browser looking at it. It began as a
 * localStorage flag, which was wrong twice over: an owner who tidied the chalk
 * away had tidied it away only for themselves, and the same owner on a phone
 * found it back again. How a room looks belongs to the room.
 *
 * Its own action rather than a field on `setWorldSpawn`, because the two are
 * pressed at different moments - the position is set once by walking somewhere,
 * the ring is turned off afterwards when the building is done - and folding them
 * together would mean a visibility toggle that also had to know a position.
 *
 * Refuses when there is no door to describe. That is not a limitation to work
 * around: with no row people arrive in the middle of the world by default, there
 * is no placed spawn, and the ring is not drawn at all - so there is nothing for
 * this to say. The picker only offers the switch once a spawn exists.
 */
export async function setWorldSpawnRing(
  slug: string,
  visible: boolean,
  worldId?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const prepared = await prepare(slug, worldId)
  if (!prepared.ok) return prepared

  const { data, error } = await prepared.supabase
    .from('world_spawns')
    .update({ show_ring: visible })
    .eq('world_id', prepared.worldId)
    .select('world_id')

  if (error) {
    return {
      ok: false,
      error: error.code === '42501'
        ? 'Only an owner or an admin can change the door'
        : 'Could not change the ring. Try again.',
    }
  }

  /**
   * No rows updated is not an error the database reports.
   *
   * RLS turns a forbidden update into zero rows rather than a refusal, and a
   * missing row looks identical. Both mean the switch did nothing, and a switch
   * that flips back on the next load with no explanation is the worst of the
   * three outcomes - so it is said out loud.
   */
  if (!data || data.length === 0) {
    return { ok: false, error: 'There is no door here to change. Place one first.' }
  }

  return { ok: true }
}
