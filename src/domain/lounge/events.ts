import type { DomainEvent } from '@/es/types'

/**
 * The lounge is a voxel world, and voxel worlds break naive event sourcing.
 *
 * A creative-mode session places blocks several times a second. With one stream
 * for the whole world and one event per block, every placement would replay the
 * entire history - so the 5,000th block costs 5,000 events to place, and
 * building gets slower the more you build. That is quadratic, and it is the
 * reason this aggregate looks different from the others.
 *
 * Two changes fix it:
 *
 *   1. **One stream per chunk.** The world is cut into 16x16 columns. Replay
 *      cost is bounded by what fits in a chunk, not by the size of the world,
 *      and two people building in different places never touch the same stream.
 *
 *   2. **Batched events.** The client buffers edits and flushes them every few
 *      hundred milliseconds, so one event carries a run of blocks rather than
 *      one event per click. A wall built by dragging is a handful of events.
 *
 * Neither is a trick. "Which aggregate is this fact about" is the central
 * modelling question in event sourcing, and for a world the honest answer is a
 * region of it, not the whole thing.
 */

/** Blocks per chunk edge, in X and Z. Y is not chunked - the world is short. */
export const CHUNK_SIZE = 16

/** Height limit. Keeps a chunk's worst case at 16 * 16 * 64 = 16,384 blocks. */
export const WORLD_HEIGHT = 64

/**
 * How many blocks one command may carry. A flush bigger than this is split
 * across several commands rather than rejected - the cap exists to keep a
 * single event's jsonb payload sane, not to limit what a user can build.
 */
export const MAX_BLOCKS_PER_EDIT = 256

/**
 * How far from the origin anything may be built, in blocks.
 *
 * Cells run -128..127, so the buildable world is 256 across - exactly 16 chunks
 * a side, 256 chunk streams in total. A multiple of CHUNK_SIZE on purpose: a
 * bound that fell mid-chunk would leave edge streams that can only ever be
 * half-filled, and the cx/cz index ragged at the border.
 *
 * The limit this really imposes is on *streams*, not on space. Blocks are
 * stored sparsely - a cell nobody touched costs nothing anywhere - so a wider
 * world is free until somebody fills it. What is not free is a chunk: each one
 * is an event stream with its own projection checkpoint, and the previous
 * bound of +/-100,000 allowed something like 156 million of them per world.
 * Scattering single blocks across distant chunks was therefore a cheap way to
 * make a world enormously expensive to project. 256 is a ceiling that fits in
 * a page load; 156 million is not a ceiling at all.
 *
 * Bounded on placement only. Anything already standing outside this - built
 * back when the bound was 100,000 - still renders and can still be removed,
 * because a rule that made existing blocks impossible to tidy up would strand
 * them there permanently. See `blockPositionSchema` in ./commands.ts.
 */
export const WORLD_RADIUS = 128

/**
 * How many blocks the read path will fetch before it gives up.
 *
 * A cap rather than pagination, because a partially-loaded world is worse than
 * an obviously-empty one: you cannot tell missing ground from ground someone
 * removed.
 *
 * A generated 50x50 floor is only 2,500 blocks, so this ceiling is headroom for
 * what people build on top rather than a number the default world approaches.
 * It is still the limit of the approach: past this, a page load is a megabyte
 * of coordinates, and the fix is not a bigger number here - it is loading by
 * chunk around the player, which is what the cx/cz index exists for.
 *
 * Lives here rather than beside the query that uses it because
 * `MAX_WORLD_BLOCKS` below has to stay under it, and that invariant deserves a
 * test - which cannot import ./queries.ts, as it is marked `server-only`.
 */
export const MAX_BLOCKS_LOADED = 60_000

/**
 * How many blocks one world may hold.
 *
 * The bound above caps how far you can build; this caps how much. They are
 * genuinely different limits and only this one protects the page load: the
 * whole world is fetched on entry, 1,000 rows at a time, so the block count is
 * what a visitor actually pays in bandwidth and parse time.
 *
 * Set below `MAX_BLOCKS_LOADED` in ./queries.ts, which is the real hazard being
 * fixed. That read cap truncates *silently* - past it the world simply arrives
 * missing blocks, which renders as a floor full of holes and reads as a
 * generation bug rather than a limit. A world that cannot exceed this number
 * can never reach that cap, so the failure becomes an honest "this world is
 * full" at the moment somebody places the block that would have done it.
 *
 * Raising it is not the way to give people more room - loading by chunk around
 * the player is, which is what the cx/cz index is already there for.
 */
export const MAX_WORLD_BLOCKS = 50_000

/**
 * Edge length of a generated floor, in blocks.
 *
 * 50x50 is 2,500 blocks: big enough to build on, small enough that the whole
 * world is one quick page load and generating it takes seconds rather than a
 * minute. Defined here rather than at each call site so the button copy and the
 * server action cannot drift apart.
 *
 * The floor spans -25..24, which reads asymmetric but is not: cell x occupies
 * [x, x+1], so those cells cover [-25, +25] and the geometric centre is exactly
 * the world origin. An even-sized floor cannot have a *cell* at its centre -
 * the centre is the corner where four cells meet.
 */
export const DEFAULT_WORLD_SIZE = 50

export interface BlockPlacement {
  /** World coordinates. Integers. */
  x: number
  y: number
  z: number
  /** Model id from the palette, e.g. "dirt_with_grass". */
  model: string
}

export interface BlockPosition {
  x: number
  y: number
  z: number
}

/**
 * Which world these blocks are in.
 *
 * A workspace's lounge uses its own tenant id. Every event written *since*
 * battlefields existed names its world outright, including the lounge's own;
 * the field is optional only because the log is full of events from before it
 * existed, and those meant the lounge. See `worldOf()` below, which is the one
 * place that default is spelled out.
 *
 * Recorded in the payload for the same reason cx/cz are: the stream id is an
 * opaque hash, so a projection holding one event has no way to work out which
 * world it belongs to unless the event says.
 */
export type WorldId = string

export type BlocksPlaced = DomainEvent<
  'BlocksPlaced',
  { worldId?: WorldId; cx: number; cz: number; blocks: BlockPlacement[] }
>

export type BlocksRemoved = DomainEvent<
  'BlocksRemoved',
  { worldId?: WorldId; cx: number; cz: number; positions: BlockPosition[] }
>

export type ChunkCleared = DomainEvent<
  'ChunkCleared',
  { worldId?: WorldId; cx: number; cz: number }
>

export type LoungeEvent = BlocksPlaced | BlocksRemoved | ChunkCleared

export const LOUNGE_CHUNK_STREAM_TYPE = 'lounge_chunk'

/**
 * Every event carries its own chunk coordinates even though the stream already
 * implies them. That redundancy is deliberate: a projection receives an event
 * with an opaque stream id and no way to invert the hash below, so without
 * cx/cz in the payload it could not tell where in the world the blocks go.
 *
 * The general rule it follows: an event must be interpretable from its own
 * contents, because the thing replaying it years from now may know nothing
 * about how its id was derived. The derivation itself lives in ./streams.ts,
 * which the browser never imports.
 */

/**
 * The world an event is about.
 *
 * Every event written before battlefields existed carries no `worldId`, and it
 * meant the workspace's own lounge - so that is what an absent one resolves
 * to. One function rather than `?? tenantId` at each call site, because a
 * projection that got the default wrong would file a battlefield's blocks into
 * the lounge, and the two are indistinguishable once written.
 */
export function worldOf(
  data: { worldId?: WorldId },
  tenantId: string,
): WorldId {
  return data.worldId ?? tenantId
}

/** Which chunk a world coordinate falls in. Floor division, so negatives work. */
export function chunkOf(x: number, z: number): { cx: number; cz: number } {
  return { cx: Math.floor(x / CHUNK_SIZE), cz: Math.floor(z / CHUNK_SIZE) }
}

/** Map key for a block. Cheaper than nesting three levels of record. */
export function blockKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`
}

export const LOUNGE_EVENT_LABELS: Record<LoungeEvent['type'], string> = {
  BlocksPlaced: 'blocks placed',
  BlocksRemoved: 'blocks removed',
  ChunkCleared: 'chunk cleared',
}
