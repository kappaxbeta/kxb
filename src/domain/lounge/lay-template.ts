import { randomUUID } from 'node:crypto'
import { loungeDecider } from '@/domain/lounge/aggregate'
import {
  type BlockPlacement,
  type BlockPosition,
  chunkOf,
  MAX_BLOCKS_PER_EDIT,
} from '@/domain/lounge/events'
import { loungeGoalDecider } from '@/domain/lounge/goal-aggregate'
import type { Goal } from '@/domain/lounge/goal-events'
import { loungeGoalsProjection } from '@/domain/lounge/goal-projection'
import { listGoals } from '@/domain/lounge/goal-queries'
import { loungeProjection } from '@/domain/lounge/projection'
import { MAX_BLOCKS_LOADED } from '@/domain/lounge/queries'
import { chunkStreamId } from '@/domain/lounge/streams'
import type { WorldTemplate } from '@/domain/lounge/templates'
import { executeCommand } from '@/es/command'
import { runProjection } from '@/es/projection'
import type { Client } from '@/es/store'

/**
 * Laying a template into a world, with nobody asked whether they may.
 *
 * This is the *mechanism* half of `applyWorldTemplate`, lifted out of
 * ./actions.ts so that it has two callers with two different answers to "who
 * may do this":
 *
 *   - The action rebuilds a world that already has something in it, which is
 *     destructive for everybody standing in it, and stays owner-or-admin.
 *   - `ensureTemplateWorld` lays the space's standard pitch into an arena it
 *     created empty two lines earlier, which destroys nothing, and is open to
 *     any member.
 *
 * The split has to be a module boundary rather than an argument: ./actions.ts
 * is `'use server'`, so every export in it is a public endpoint and a
 * `skipTheRoleCheck` parameter would be one anybody could pass. Nothing in
 * here is reachable from a browser.
 *
 * Errors are thrown rather than returned - `DomainError` and `ConcurrencyError`
 * both mean something specific to a caller, and each of the two has its own
 * sentence for them.
 */
export async function layTemplate(
  supabase: Client,
  tenantId: string,
  worldId: string,
  userId: string,
  template: WorldTemplate,
): Promise<{ applied: number; goals: Goal[] }> {
  const plan = template.plan()

  let applied = 0

  // --- out with the old -----------------------------------------------------
  for (const key of await occupiedChunks(supabase, tenantId, worldId)) {
    const [cx, cz] = key.split(',').map(Number)
    const events = await executeCommand({
      supabase,
      decider: loungeDecider,
      tenantId,
      streamId: chunkStreamId(worldId, cx!, cz!),
      command: { type: 'ClearChunk', worldId, cx: cx!, cz: cz! },
      metadata: { actorId: userId },
    })
    applied += events.length
  }

  /**
   * The goals that were already there, removed one stream at a time.
   *
   * Read before the new ones are placed, so the template cannot delete the
   * goals it just laid down. A pitch dropped on top of a pitch should leave two
   * goals standing, not four.
   */
  for (const goal of await listGoals(supabase, tenantId, worldId)) {
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

  // --- in with the new ------------------------------------------------------
  applied += await layBlocks(supabase, tenantId, worldId, userId, plan.blocks)

  /**
   * The goals as they were actually stood, ids and all.
   *
   * Handed back rather than left for the caller to re-read, because the id is
   * the one part of a goal the client cannot derive: the plan says where they
   * go, and this mints the stream each one lives on. Without them the scene
   * would have to reload to be able to edit a goal it just laid.
   */
  const goals: Goal[] = []
  for (const goal of plan.goals) {
    const id = randomUUID()
    const events = await executeCommand({
      supabase,
      decider: loungeGoalDecider,
      tenantId,
      streamId: id,
      command: { type: 'PlaceGoal', worldId, ...goal },
      metadata: { actorId: userId },
    })
    applied += events.length
    goals.push({ id, ...goal })
  }

  await runProjection(supabase, loungeProjection, tenantId)
  await runProjection(supabase, loungeGoalsProjection, tenantId)

  return { applied, goals }
}

/** Which chunks hold at least one block, as "cx,cz" keys. */
export async function occupiedChunks(
  supabase: Client,
  tenantId: string,
  worldId: string,
): Promise<Set<string>> {
  // PostgREST cannot express SELECT DISTINCT, so this reads the coordinates and
  // folds them down here. It is a lot of rows for a couple of hundred answers,
  // but a reset is rare and the alternative is a database function for one
  // caller.
  //
  // Paged for the same reason as listLoungeBlocks: a single large request gets
  // silently truncated at the server's row ceiling. Missing a page here means
  // missing a chunk, and a chunk that never gets cleared survives a "reset
  // everything" as an island of old world.
  const chunks = new Set<string>()
  let offset = 0

  while (offset < MAX_BLOCKS_LOADED) {
    const { data, error } = await supabase
      .from('lounge_blocks_read_model')
      .select('cx, cz')
      .eq('tenant_id', tenantId)
      .eq('world_id', worldId)
      .order('cx', { ascending: true })
      .order('cz', { ascending: true })
      .range(offset, offset + CHUNK_SCAN_PAGE - 1)

    if (error) {
      throw new Error(`Failed to find occupied chunks: ${error.message}`)
    }

    const page = data ?? []
    for (const row of page) {
      chunks.add(`${row.cx},${row.cz}`)
    }

    // Advance by the rows actually returned; stop only when a page is empty.
    if (page.length === 0) break
    offset += page.length
  }

  return chunks
}

const CHUNK_SCAN_PAGE = 1000

/**
 * Write an arbitrary set of placements, batched the way the log wants them.
 *
 * `layFloor` in ./actions.ts can assume one event per chunk, because a floor is
 * one block deep and a chunk is exactly MAX_BLOCKS_PER_EDIT cells across. A
 * pitch has walls, so a chunk containing a corner holds several hundred blocks
 * and has to be split into more than one event - hence a general version rather
 * than a parameter on the other one.
 */
async function layBlocks(
  supabase: Client,
  tenantId: string,
  worldId: string,
  userId: string,
  blocks: readonly BlockPlacement[],
): Promise<number> {
  let applied = 0

  for (const [key, bucket] of groupByChunk(blocks)) {
    const [cx, cz] = key.split(',').map(Number)

    for (let start = 0; start < bucket.length; start += MAX_BLOCKS_PER_EDIT) {
      const events = await executeCommand({
        supabase,
        decider: loungeDecider,
        tenantId,
        streamId: chunkStreamId(worldId, cx!, cz!),
        command: {
          type: 'PlaceBlocks',
          worldId,
          cx: cx!,
          cz: cz!,
          blocks: bucket.slice(start, start + MAX_BLOCKS_PER_EDIT),
        },
        metadata: { actorId: userId },
      })
      applied += events.length
    }
  }

  return applied
}

/**
 * Bucket positions by the chunk that owns them.
 *
 * Keyed by "cx,cz" because a Map keyed on an object compares by identity, and
 * two different {cx:0,cz:0} objects would land in different buckets.
 */
export function groupByChunk<T extends BlockPosition | BlockPlacement>(
  items: readonly T[],
): Map<string, T[]> {
  const grouped = new Map<string, T[]>()

  for (const item of items) {
    const { cx, cz } = chunkOf(item.x, item.z)
    const key = `${cx},${cz}`
    const bucket = grouped.get(key)
    if (bucket) {
      bucket.push(item)
    } else {
      grouped.set(key, [item])
    }
  }

  return grouped
}
