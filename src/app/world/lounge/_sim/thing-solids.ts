'use client'

import type { Deck as Footing } from '@/app/world/lounge/_sim/physics'
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
 * The rounding is deliberately *inward* at the edges - see `BITE` - so a bench
 * that overhangs its square does not claim the cell next to it and leave
 * somebody bumping into thin air. And where the rounding is wrong in a way no
 * threshold can fix, because the model is an arch and its opening is inside its
 * own bounds, a blueprint may hand over boxes drawn by somebody who can see it:
 * `BlueprintSpec.collider`, rasterised through this same function.
 *
 * ---------------------------------------------------------------------------
 * Except for the top of anything that moves
 * ---------------------------------------------------------------------------
 * Cells are enough for a bench because a bench never moves: rounding its top
 * down to a cell boundary puts you a few centimetres out once, and you cannot
 * see a few centimetres. A lift moves through those cells continuously, and
 * rounding its top makes the mistake visible - the deck is drawn at 1.3 and the
 * cell it registered says you stand at 1.0, so the platform slides up through
 * your feet, then teleports you a whole cell when it crosses the boundary. That
 * is what "i get lifted but i am not on the object, and it jitters" is: half a
 * cell of error, oscillating, four times over a three-second rise.
 *
 * So a moving thing registers a *deck* as well as its cells: the real
 * world-space box, with a top that is a number rather than a boundary. The
 * cells still stop you walking into its side, exactly as before; the deck is
 * consulted by the character controller for one question only - "what am I
 * standing on, and where exactly is its surface" - and that is what turns being
 * shoved out of a lift into riding it.
 *
 * Registered every frame rather than every cell, which is affordable because it
 * is one `Map.set` of six numbers: the expensive part of `set` is `drop`
 * rebuilding the occupied set, and a deck touches none of it.
 */
/**
 * The real, unrounded surface of something that moves.
 *
 * Only the top and the horizontal extent, because that is the whole of what a
 * rider needs. The underside of a lift is still a cell - being bonked on the
 * head by a rising platform is a collision like any other, and it does not need
 * to be accurate to the centimetre to read correctly.
 */
export interface Deck {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  /** Where its surface actually is, in world units. */
  top: number
}

export class ThingSolids {
  private readonly cells = new Map<string, string[]>()
  private readonly occupied = new Set<string>()
  private readonly decks = new Map<string, Deck>()

  /** What this thing now covers. Replaces whatever it covered before. */
  set(id: string, keys: string[]): void {
    // Its deck survives, because `set` and `ride` are two facts about the same
    // thing arriving on the same frame and `drop` clears everything. A lift
    // crossing a cell boundary calls both, and the order is the renderer's.
    const deck = this.decks.get(id)
    this.drop(id)
    if (deck) this.decks.set(id, deck)
    this.cells.set(id, keys)
    for (const key of keys) this.occupied.add(key)
  }

  /**
   * Where this thing's surface is right now. Only things that move have one.
   *
   * Separate from `set` because it is called on every frame of a lift's trip
   * and `set` is called on four of them.
   */
  ride(id: string, deck: Deck): void {
    this.decks.set(id, deck)
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
    this.decks.delete(id)
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

  /**
   * The highest moving surface a body at (x, z) could be standing on.
   *
   * Bounded on both sides by the caller: `lowest` is how far it will reach down
   * for a deck that has dropped away this frame, `highest` how far it will be
   * carried up by one that has risen. Unbounded in either direction is a
   * different bug each way - reach too far down and you are magnetised to a
   * lift you jumped off, too far up and a crusher parks you on its roof.
   *
   * Null when there is nothing, which is the answer nearly every time: a room
   * with no lift in it holds no decks at all and this is one empty-map walk.
   *
   * The winner is the *highest*, so two platforms crossing hand a rider to the
   * upper one rather than to whichever the map happened to hold first.
   */
  surfaceUnder(
    x: number,
    z: number,
    radius: number,
    lowest: number,
    highest: number,
  ): Footing | null {
    let best: Footing | null = null
    for (const [id, deck] of this.decks) {
      if (deck.top < lowest || deck.top > highest) continue
      if (x + radius <= deck.minX || x - radius >= deck.maxX) continue
      if (z + radius <= deck.minZ || z - radius >= deck.maxZ) continue
      if (best === null || deck.top > best.top) {
        // The corner comes back with it, because a rider on a platform that
        // slides keeps its place by measuring from one. See `physics.Riding`.
        best = { id, top: deck.top, minX: deck.minX, minZ: deck.minZ }
      }
    }
    return best
  }

  /** Nothing is standing here. Used when a scene is torn down. */
  clear(): void {
    this.cells.clear()
    this.occupied.clear()
    this.decks.clear()
  }
}

/**
 * How much of a cell a box has to fill before it owns it.
 *
 * ---------------------------------------------------------------------------
 * Why a fraction, when a centimetre used to do
 * ---------------------------------------------------------------------------
 * This was `EDGE = 0.01`: an inward bite of a centimetre, so a face landing on
 * a cell boundary was treated as stopping at it rather than reaching into the
 * cell beyond. It was written for one failure - a model exactly one cell across
 * claiming two, and an invisible wall beside everything you placed - and it
 * fixed exactly that one.
 *
 * The complaint it does not answer is the same shape a metre wider. A bench
 * 1.2 cells across, centred, reaches a tenth of a cell into its neighbours on
 * both sides, and claims all three: two thirds of what stops you is air. A
 * parasol is a pole and a canopy, and the canopy decides which cells the pole
 * blocks. A table 1.8 long claims three. None of those is within a centimetre
 * of anything, so no smaller `EDGE` reaches them - the bite has to be a
 * fraction of a cell, not a rounding tolerance.
 *
 * Three tenths, and the asymmetry is deliberate: claiming a cell you barely
 * touch is an invisible wall, which people report and cannot work around, and
 * declining one is a corner of a model you can stand a little way inside, which
 * nobody has ever reported. When the two errors are that unequal the threshold
 * belongs nearer the generous end.
 */
const BITE = 0.3

/** Floating-point slack, so a face exactly on the threshold is not a coin toss. */
const EPSILON = 1e-9

/**
 * Which cells a box reaches far enough into to own, on one axis.
 *
 * The `min(BITE, extent)` is what keeps a fence solid. A panel a tenth of a
 * cell thick can never fill three tenths of one, and a threshold it cannot
 * reach is a wall you walk through - so a box thinner than the bite is asked
 * only to be *inside* the cell rather than to fill a share of it. That is the
 * whole of the special case, and it is the same one `cellsIn`'s final fallback
 * makes in three dimensions at once.
 */
function span(min: number, max: number): number[] {
  const cells: number[] = []
  const need = Math.min(BITE, max - min)

  for (let cell = Math.floor(min); cell < Math.ceil(max); cell += 1) {
    const overlap = Math.min(max, cell + 1) - Math.max(min, cell)
    if (overlap + EPSILON >= need) cells.push(cell)
  }

  return cells
}

/**
 * The cells a world-space box covers.
 *
 * Deliberately not every cell it touches - see `BITE`.
 */
export function cellsIn(box: {
  minX: number
  minY: number
  minZ: number
  maxX: number
  maxY: number
  maxZ: number
}): string[] {
  const keys: string[] = []

  for (const x of span(box.minX, box.maxX)) {
    for (const y of span(box.minY, box.maxY)) {
      for (const z of span(box.minZ, box.maxZ)) {
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

/**
 * The cells a *moving* thing fills: everything below its surface, and not the
 * cell its surface sits inside.
 *
 * The partial top cell is the one the rider is standing in. A deck at 1.3 fills
 * the cell from 1 to 2 by a third, and claiming it puts a body with its feet at
 * 1.3 inside solid geometry - which the character controller reads as being
 * buried and shoves out of, sideways off a narrow platform and upward off a
 * wide one. Leaving it out and publishing the real top as a `Deck` instead is
 * what lets somebody stand on a lift.
 *
 * Here rather than in the renderer that calls it because it is half of a
 * contract with `surfaceUnder`: the cells stop where the deck begins, and the
 * two getting out of step is the bug, not a regression in either one alone.
 */
export function deckCells(box: {
  minX: number
  minY: number
  minZ: number
  maxX: number
  maxY: number
  maxZ: number
}): string[] {
  return cellsIn({ ...box, maxY: Math.floor(box.maxY) })
}
