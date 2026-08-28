import {
  type BlockPlacement,
  MAX_WORLD_BLOCKS,
  WORLD_HEIGHT,
  WORLD_RADIUS,
} from '@/domain/lounge/events'
import { isKnownModel } from '@/domain/lounge/palette'
import { splitModel } from '@/domain/builder/packs'
import { type BuilderWorld, groundPlacements, type Placement } from '@/domain/builder/world'

/**
 * A built world, as blocks somebody can stand on.
 *
 * The builder draws from 1308 models across twelve packs; a world people walk
 * around in is 58 palette blocks in chunk streams. This is the crossing, and it
 * is lossy in one direction on purpose - see below - so it reports what it left
 * behind rather than quietly doing it.
 *
 * ---------------------------------------------------------------------------
 * Why the palette is not simply widened
 * ---------------------------------------------------------------------------
 * The obvious alternative is to let a park bench into the lounge's allow-list
 * and copy everything. `@/domain/lounge/palette` says why not: that list guards
 * an immutable event log, where a model id that turns out to be wrong is
 * permanent, and it is also the list the collision, the burning check and the
 * block picker are all written against. A bench in it would be a cube you walk
 * on that happens to be drawn as a bench.
 *
 * So the crossing keeps what is already a block - the `bb10` pack, which *is*
 * the lounge palette - and leaves the furniture behind. The document keeps
 * everything either way: reopening a published world in the builder gets the
 * park back, because the park was never removed from the thing that was saved.
 *
 * The other two things that do not survive are rotation and per-placement
 * scale. A lounge block is an axis-aligned unit cube; there is nowhere in
 * `BlockPlacement` to put a turn, and inventing one would change the shape of
 * every event ever written. A turned crate lands facing the way crates face.
 */

export interface WorldBlocks {
  blocks: BlockPlacement[]
  /**
   * How many placements were furniture rather than blocks.
   *
   * Shown before the copy happens. A space about to pull in a world that is
   * mostly park deserves to know it is going to arrive as a lawn.
   */
  props: number
  /** Placements dropped for being outside what a walkable world can hold. */
  clipped: number
  /**
   * How far the world was lifted to sit on y=0.
   *
   * The builder digs to -8 and the lounge's floor is 0, so a world with a
   * basement is raised bodily rather than having its basement chopped off.
   */
  lift: number
}

/** Whether a builder model id is one the lounge would accept as a block. */
export function isBlockModel(model: string): boolean {
  const parts = splitModel(model)
  return parts?.packId === 'bb10' && isKnownModel(parts.name)
}

/** The palette id for a builder model, or null when it is not a block. */
export function toBlockModel(model: string): string | null {
  const parts = splitModel(model)
  if (!parts || parts.packId !== 'bb10' || !isKnownModel(parts.name)) return null
  return parts.name
}

/**
 * Every placement in a world, the generated floor included.
 *
 * The floor is part of what somebody built - a world copied into a space
 * without its ground is a set of walls standing in the void - and it is not in
 * `placements`, so it has to be expanded here the same way the editor expands
 * it to draw.
 */
function allPlacements(world: BuilderWorld): Placement[] {
  return [...groundPlacements(world.ground), ...world.placements]
}

/**
 * How many of a world's placements would become blocks.
 *
 * The cheap half of `toBlocks`, for the save path: the card wants a number, not
 * fifty thousand coordinates.
 */
export function countBlockable(world: BuilderWorld): number {
  let count = 0
  for (const placement of allPlacements(world)) {
    if (isBlockModel(placement.model)) count += 1
  }
  return count
}

/**
 * The world, as blocks.
 *
 * Ordered by the placement order it was built in, so the cap below - if it is
 * ever reached - takes the last thing built rather than a random slice.
 */
export function toBlocks(world: BuilderWorld): WorldBlocks {
  const placements = allPlacements(world)

  let props = 0
  const blockable: { placement: Placement; model: string }[] = []

  for (const placement of placements) {
    const model = toBlockModel(placement.model)
    if (model === null) {
      props += 1
      continue
    }
    blockable.push({ placement, model })
  }

  // Lifted so the deepest cell sits on the floor. Computed over what survives
  // rather than over everything, because a world whose only sub-zero placement
  // was a park bench should not arrive floating a cell in the air.
  let lowest = 0
  for (const entry of blockable) lowest = Math.min(lowest, entry.placement.y)
  // Written as a branch rather than `-lowest`, which is negative zero for a
  // world that needed no lifting - a value that compares equal to 0 and prints
  // as `-0` in every report that carries it.
  const lift = lowest < 0 ? -lowest : 0

  let clipped = 0
  // Keyed by cell, because the floor and a placement can occupy the same cell
  // once the lift has moved them - and two blocks in one cell is not something
  // a chunk stream can hold. The later one wins, which is the rule `place`
  // follows in the builder and the rule the renderer follows in the lounge.
  const byCell = new Map<string, BlockPlacement>()

  for (const { placement, model } of blockable) {
    const y = placement.y + lift
    if (
      y < 0 ||
      y >= WORLD_HEIGHT ||
      Math.abs(placement.x) > WORLD_RADIUS ||
      Math.abs(placement.z) > WORLD_RADIUS
    ) {
      clipped += 1
      continue
    }
    byCell.set(`${placement.x},${y},${placement.z}`, { x: placement.x, y, z: placement.z, model })
  }

  const blocks = [...byCell.values()]

  // The ceiling a world may not exceed once it is somewhere people load it.
  // Trimmed from the end rather than refused: a world that is 3% too big should
  // arrive missing its last few walls, not fail to arrive.
  if (blocks.length > MAX_WORLD_BLOCKS) {
    clipped += blocks.length - MAX_WORLD_BLOCKS
    blocks.length = MAX_WORLD_BLOCKS
  }

  return { blocks, props, clipped, lift }
}
