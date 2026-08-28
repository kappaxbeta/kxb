import 'server-only'
import { randomUUID } from 'node:crypto'
import { loungeDecider } from '@/domain/lounge/aggregate'
import {
  type BlockPlacement,
  chunkOf,
  MAX_BLOCKS_PER_EDIT,
} from '@/domain/lounge/events'
import { loungeGoalDecider } from '@/domain/lounge/goal-aggregate'
import { listGoals } from '@/domain/lounge/goal-queries'
import { listLoungeBlocks, MAX_BLOCKS_LOADED } from '@/domain/lounge/queries'
import { chunkStreamId } from '@/domain/lounge/streams'
import { executeCommand } from '@/es/command'
import type { Client } from '@/es/store'

/**
 * Copying one world into another.
 *
 * This is what "save the lounge as an arena" and "load an arena into the
 * lounge" both are underneath: read every block of one world, write it into the
 * chunk streams of another. Nothing is moved and nothing is shared - the copy
 * is a copy, so building on the arena afterwards does not change the lounge it
 * came from, which is the whole point of saving one.
 *
 * Deliberately not a "link" or a reference. Two worlds pointing at one set of
 * blocks would mean a battle could be reshaped from the lounge while it was
 * being fought in.
 *
 * Kept out of ./actions.ts because both that file and the battlefields actions
 * need it, and two `'use server'` modules importing each other is a cycle.
 */

/**
 * Write `blocks` into `worldId`, batched the way the client's flush is.
 *
 * One command per chunk per batch of MAX_BLOCKS_PER_EDIT, which is the same
 * shape `layFloor` uses and for the same reason: a 2,500-block floor becomes
 * ~16 events rather than 2,500.
 *
 * Returns how many events were appended.
 */
export async function writeBlocks(
  supabase: Client,
  tenantId: string,
  worldId: string,
  userId: string,
  blocks: readonly BlockPlacement[],
): Promise<number> {
  const byChunk = new Map<string, BlockPlacement[]>()

  for (const block of blocks) {
    const { cx, cz } = chunkOf(block.x, block.z)
    const key = `${cx},${cz}`
    const bucket = byChunk.get(key)
    if (bucket) bucket.push(block)
    else byChunk.set(key, [block])
  }

  let applied = 0

  for (const [key, bucket] of byChunk) {
    const [cx, cz] = key.split(',').map(Number)
    const streamId = chunkStreamId(worldId, cx, cz)

    // Split each chunk's blocks into command-sized runs. A full 16x16x64 column
    // is 16,384 blocks, well past what one event should carry.
    for (let offset = 0; offset < bucket.length; offset += MAX_BLOCKS_PER_EDIT) {
      const batch = bucket.slice(offset, offset + MAX_BLOCKS_PER_EDIT)
      const events = await executeCommand({
        supabase,
        decider: loungeDecider,
        tenantId,
        streamId,
        command: { type: 'PlaceBlocks', worldId, cx: cx!, cz: cz!, blocks: batch },
        metadata: { actorId: userId },
      })
      applied += events.length
    }
  }

  return applied
}

/**
 * Empty a world.
 *
 * Clears only chunks that hold something, for the reason `resetWorld` gives:
 * iterating a fixed range would miss a tower somebody built at x=5000, and it
 * would survive a "replace everything" as an island of the old world.
 */
export async function clearWorld(
  supabase: Client,
  tenantId: string,
  worldId: string,
  userId: string,
): Promise<number> {
  const occupied = await occupiedChunks(supabase, tenantId, worldId)

  let applied = 0

  for (const key of occupied) {
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

  return applied
}

/**
 * Copy one world's goals into another, replacing whatever stood there.
 *
 * Goals are part of a world in exactly the way blocks are - a football arena
 * whose goals stayed behind when it was saved is a green rectangle - but they
 * cannot ride along in the block copy, because they are a different aggregate:
 * one stream per goal, not per chunk. So the copy is per goal too: retire the
 * target world's own, then stand a fresh copy of each of the source's, on a
 * fresh stream. A copy, not a link, for the reason the block copy is one - the
 * arena's goals must survive the lounge's being dragged around afterwards.
 */
export async function copyGoals(
  supabase: Client,
  tenantId: string,
  userId: string,
  fromWorldId: string,
  toWorldId: string,
): Promise<number> {
  let applied = 0

  // Out with the target's own first, so a load replaces rather than accumulates
  // - the same order the block copy clears in, for the same reason.
  for (const goal of await listGoals(supabase, tenantId, toWorldId)) {
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

  for (const goal of await listGoals(supabase, tenantId, fromWorldId)) {
    const events = await executeCommand({
      supabase,
      decider: loungeGoalDecider,
      tenantId,
      // A fresh stream: the copy is a new goal that happens to match, not the
      // same goal in two worlds. Everything but the identity travels.
      streamId: randomUUID(),
      command: {
        type: 'PlaceGoal',
        worldId: toWorldId,
        kind: goal.kind,
        x: goal.x,
        y: goal.y,
        z: goal.z,
        width: goal.width,
        height: goal.height,
        facing: goal.facing,
      },
      metadata: { actorId: userId },
    })
    applied += events.length
  }

  return applied
}

/**
 * Copy every block of one world into another, replacing whatever was there.
 *
 * The clear comes first, so loading an arena into a lounge that already has
 * something in it produces the arena rather than the two of them tangled
 * together.
 *
 * Goals travel with the world - see `copyGoals`. Saving a lounge with a pitch
 * in it has to produce an arena a football match can actually be played on.
 */
export async function copyWorld(
  supabase: Client,
  tenantId: string,
  userId: string,
  fromWorldId: string,
  toWorldId: string,
): Promise<{ blocks: number; applied: number }> {
  const source = await listLoungeBlocks(supabase, tenantId, fromWorldId)

  let applied = await clearWorld(supabase, tenantId, toWorldId, userId)
  applied += await writeBlocks(supabase, tenantId, toWorldId, userId, source)
  applied += await copyGoals(supabase, tenantId, userId, fromWorldId, toWorldId)

  return { blocks: source.length, applied }
}

/** How big a world is, for the "that is too much to copy" check. */
export async function countBlocks(
  supabase: Client,
  tenantId: string,
  worldId: string,
): Promise<number> {
  const { count } = await supabase
    .from('lounge_blocks_read_model')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('world_id', worldId)

  return count ?? 0
}

/** The most a single save or load will copy. Above this it is asked for twice. */
export const MAX_COPY_BLOCKS = MAX_BLOCKS_LOADED

/** Which chunks hold at least one block, as "cx,cz" keys. */
async function occupiedChunks(
  supabase: Client,
  tenantId: string,
  worldId: string,
): Promise<Set<string>> {
  const chunks = new Set<string>()
  let offset = 0

  // Paged, and advancing by what actually arrived: PostgREST silently truncates
  // an oversized request, and a page missed here is a chunk that never gets
  // cleared - an island of the old world inside the new one.
  while (offset < MAX_BLOCKS_LOADED) {
    const { data, error } = await supabase
      .from('lounge_blocks_read_model')
      .select('cx, cz')
      .eq('tenant_id', tenantId)
      .eq('world_id', worldId)
      .order('cx', { ascending: true })
      .order('cz', { ascending: true })
      .range(offset, offset + CHUNK_SCAN_PAGE - 1)

    if (error) throw new Error(`Failed to find occupied chunks: ${error.message}`)

    const page = data ?? []
    for (const row of page) chunks.add(`${row.cx},${row.cz}`)

    if (page.length === 0) break
    offset += page.length
  }

  return chunks
}

const CHUNK_SCAN_PAGE = 1000
