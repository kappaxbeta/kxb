import { z } from 'zod'
import {
  MAX_BLOCKS_PER_EDIT,
  WORLD_HEIGHT,
  WORLD_RADIUS,
} from '@/domain/lounge/events'

/**
 * Commands against one chunk.
 *
 * Note these are chunk-scoped, while the *user* acts on the world. Turning "the
 * player dragged across these 40 blocks" into one command per affected chunk is
 * the action's job - see groupByChunk in ./actions.ts. Keeping the aggregate
 * ignorant of the world is what lets two people build in different places
 * without ever contending on the same stream.
 */

/**
 * A coordinate on a block that already exists.
 *
 * Deliberately looser than `buildable` below, and this is the grandfather
 * clause: the world was bounded at +/-100,000 for most of its life, so blocks
 * are standing out there in worlds people have already built. Tightening
 * *removal* to the new bound would make those permanently unremovable - a
 * limit that creates litter it then forbids you to clear up.
 */
const coordinate = z.number().int().min(-100_000).max(100_000)

/**
 * A coordinate on a block somebody is placing now.
 *
 * See `WORLD_RADIUS` for why the world is 256 across, and why the reason is
 * chunk streams rather than space. Cells run -128..127: cell x occupies
 * [x, x+1], so those cover [-128, +128] and the origin is the exact centre -
 * the same off-by-one the default floor's -25..24 span has.
 */
const buildable = z.number().int().min(-WORLD_RADIUS).max(WORLD_RADIUS - 1)

export const blockPlacementSchema = z.object({
  x: buildable,
  y: z.number().int().min(0).max(WORLD_HEIGHT - 1),
  z: buildable,
  // The palette is validated against the actual model list in the action; here
  // we only bound the shape, so a hostile client cannot stuff a megabyte of
  // string into the event log.
  model: z.string().min(1).max(64),
})

export const blockPositionSchema = z.object({
  x: coordinate,
  y: z.number().int().min(0).max(WORLD_HEIGHT - 1),
  z: coordinate,
})

export const loungeEditSchema = z.object({
  place: z.array(blockPlacementSchema).max(MAX_BLOCKS_PER_EDIT).default([]),
  remove: z.array(blockPositionSchema).max(MAX_BLOCKS_PER_EDIT).default([]),
})

export type LoungeEdit = z.infer<typeof loungeEditSchema>

/**
 * `worldId` is optional on every command for the same reason it is optional on
 * the events: omitting it means the workspace's own lounge, which is what the
 * only caller meant before battlefields existed. The action fills it in.
 */
export type PlaceBlocks = {
  type: 'PlaceBlocks'
  worldId?: string
  cx: number
  cz: number
  blocks: { x: number; y: number; z: number; model: string }[]
}

export type RemoveBlocks = {
  type: 'RemoveBlocks'
  worldId?: string
  cx: number
  cz: number
  positions: { x: number; y: number; z: number }[]
}

export type ClearChunk = {
  type: 'ClearChunk'
  worldId?: string
  cx: number
  cz: number
}

export type LoungeCommand = PlaceBlocks | RemoveBlocks | ClearChunk
