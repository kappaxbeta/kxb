'use client'

import { blockKey } from '@/domain/lounge/events'

/**
 * The cells a summoned thing stands in, so you cannot walk through it.
 *
 * ---------------------------------------------------------------------------
 * Why the footprint is measured rather than declared
 * ---------------------------------------------------------------------------
 * A blueprint says `blocking: true` and nothing more. It does not say how wide
 * the thing is, and it cannot: the packs the thingiverse draws from - bb10, the
 * Tiny Treats sets, the park - ship no measurements, and the one catalogue in
 * this product that *does* carry them (`@kxb/xp/catalogue`, with bounds and a
 * voxel mask per model) is a different pack set entirely. There is no table to
 * look a bench up in.
 *
 * What there is, at the moment it matters, is the model itself. The renderer
 * has just loaded the glTF to draw it; a `Box3` around the drawn object is the
 * true footprint, at this thing's scale and this thing's turn, and it costs one
 * traversal on load rather than anything per frame.
 *
 * So the renderer measures and writes here, and the character controller reads.
 * The cost is that a thing does not block until it has been drawn once - about
 * a frame after the model arrives - and that is the right way round: a thing
 * you cannot see is a thing that must not stop you.
 *
 * ---------------------------------------------------------------------------
 * Cells, not boxes
 * ---------------------------------------------------------------------------
 * The measurement is a box and what goes in here is a set of cell keys, which
 * throws away precision on purpose. The lounge's character controller asks one
 * question - `isSolid(x, y, z)` - and it asks it of the block lattice. A second
 * collision path testing boxes would be a second set of bugs about standing on
 * edges, sliding along faces and getting stuck in seams, all of which the cell
 * path has already had and fixed (see `separate()` and the step-up in
 * `./physics`). Rounding a bench up to the cells it covers makes it a piece of
 * the world the controller already understands.
 *
 * The rounding is deliberately *inward* at the edges - see `cellsIn` - so a
 * bench that overhangs its square by a centimetre does not claim the cell next
 * to it and leave somebody bumping into thin air.
 */
export class ThingSolids {
  private readonly cells = new Map<string, string[]>()
  private readonly occupied = new Set<string>()

  /** What this thing now covers. Replaces whatever it covered before. */
  set(id: string, keys: string[]): void {
    this.drop(id)
    this.cells.set(id, keys)
    for (const key of keys) this.occupied.add(key)
  }

  /**
   * Forget it: dismissed, or made walk-through.
   *
   * Rebuilds the occupied set from what is left rather than removing this
   * thing's keys from it, because two things may stand in the same cell - a
   * lamp on a table - and removing the lamp's keys would open a hole in the
   * table. A world holds at most `MAX_THINGS_PER_WORLD` of these and this runs
   * when one is moved, not per frame.
   */
  drop(id: string): void {
    if (!this.cells.delete(id)) return
    this.occupied.clear()
    for (const keys of this.cells.values()) {
      for (const key of keys) this.occupied.add(key)
    }
  }

  /** Is this cell inside something? Asked by the character controller. */
  has(key: string): boolean {
    return this.occupied.has(key)
  }

  /** Nothing is standing here. Used when a scene is torn down. */
  clear(): void {
    this.cells.clear()
    this.occupied.clear()
  }
}

/**
 * The cells a world-space box covers.
 *
 * `EDGE` is the inward bite: a face that lands within a centimetre of a cell
 * boundary is treated as stopping at it. Without it every model whose bounding
 * box is exactly one cell across claims two, because a box from x=3.0 to x=4.0
 * mathematically touches cell 4 - and the effect in the world is an invisible
 * wall one cell wide beside everything you place.
 */
const EDGE = 0.01

export function cellsIn(box: {
  minX: number
  minY: number
  minZ: number
  maxX: number
  maxY: number
  maxZ: number
}): string[] {
  const keys: string[] = []

  const x0 = Math.floor(box.minX + EDGE)
  const x1 = Math.ceil(box.maxX - EDGE) - 1
  const y0 = Math.floor(box.minY + EDGE)
  const y1 = Math.ceil(box.maxY - EDGE) - 1
  const z0 = Math.floor(box.minZ + EDGE)
  const z1 = Math.ceil(box.maxZ - EDGE) - 1

  for (let x = x0; x <= x1; x += 1) {
    for (let y = y0; y <= y1; y += 1) {
      for (let z = z0; z <= z1; z += 1) {
        keys.push(blockKey(x, y, z))
      }
    }
  }

  // A thing smaller than a cell still stands somewhere. Without this a coin on
  // the floor would be solid nowhere, which is right, and a crate 0.9 across
  // would be solid nowhere too, which is not.
  if (keys.length === 0) {
    keys.push(
      blockKey(
        Math.floor((box.minX + box.maxX) / 2),
        Math.floor((box.minY + box.maxY) / 2),
        Math.floor((box.minZ + box.maxZ) / 2),
      ),
    )
  }

  return keys
}
