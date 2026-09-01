'use client'

import { blockKey } from '@/domain/lounge/events'

/**
 * Where a thing you are holding would land, and how a thumb moves it.
 *
 * Two small pieces of arithmetic, in `_sim` because that is where the sums that
 * would be just as true on paper live - and because both have a failure mode
 * that is invisible in a screenshot: a thing that lands one cell inside the
 * floor looks like a thing that landed, and a joystick that pushes north when
 * you are facing east looks like a joystick that is broken in a way nobody can
 * describe.
 */

/**
 * Drop it onto whatever is underneath.
 *
 * The crosshair answers *where* in the world you are pointing, and the answer
 * it gives - `target.place`, the empty cell against the face you are looking at
 * - is the right answer for a **block**, which is a cube you stack against
 * another cube. It is the wrong one for a bench: looking at the side of a wall
 * offers you the cell halfway up it, and a bench summoned there hangs in the
 * air beside the wall.
 *
 * So a thing falls to the top of its own column instead. Walking down from
 * where you pointed rather than up from the floor, because "under where I am
 * looking" is what somebody means when they point at the top of a table - and
 * the first solid cell going down is the surface they meant.
 *
 * The scan is bounded by the height it starts at, which is a page of cells at
 * most and a `Set.has` each. `surfaceAt` in ./spawn answers the same question
 * by scanning every block in the world, which is fine once at spawn and far too
 * slow for something that follows a crosshair.
 */
export function dropTo(
  /** The world, by cell key. A `Map` or a `Set` - only `has` is asked for. */
  solid: { has: (key: string) => boolean },
  x: number,
  z: number,
  from: number,
): number {
  /**
   * Whole cells, because that is the only thing a block key can be.
   *
   * A key is `${x},${y},${z}` built by hand, so `blockKey(-2.4, 0, -0.3)` is a
   * string no block in the world will ever equal - and the loop below then
   * walks the whole column, finds nothing, and reports a floor of zero. What
   * that looked like was reported as "a lot of things dont get rendered": a
   * thing standing on a fractional coordinate sank a full cell into the ground
   * and was drawn inside the floor, which from above is a thing that is simply
   * not there.
   *
   * It was correct until positions stopped being integers. A thing is nudged
   * by tenths of a cell now, a ball is written down wherever it stopped
   * rolling, and both go through here - so the conversion has to happen rather
   * than be assumed. Every other reader of this world already floors before it
   * asks (`collides`, `underfoot`, `ballHits`); this one had nothing to floor.
   *
   * `+ 0.5` because the number is the thing's *cell*, and the thing is drawn
   * in the middle of it - see `thingTransform`. Whole coordinates are
   * unaffected, which is what keeps every world built before this identical.
   */
  const cx = Math.floor(x + 0.5)
  const cz = Math.floor(z + 0.5)

  for (let y = Math.floor(from); y >= 0; y -= 1) {
    if (solid.has(blockKey(cx, y, cz))) return y + 1
  }
  return 0
}

/**
 * A thumb push, as cells on the lattice.
 *
 * `right` and `forward` are the pad's own axes, both -1, 0 or 1. What comes
 * back is a whole-cell step in the *world's* axes, turned by which way the
 * person is facing - so "push away from me" moves the thing away from them
 * whichever way they have turned, which is the only reading of a joystick
 * anybody has.
 *
 * Snapped to the nearest quarter turn rather than rotated smoothly, because the
 * thing lives on a lattice: a heading of 43 degrees would otherwise produce a
 * diagonal step and a bench that drifts off the grid it is meant to line up
 * with. The snap is where "roughly north" becomes "north".
 *
 * `heading` is in radians, measured the way `Math.atan2(x, z)` gives it - which
 * is what the scene's own `headingRef` holds.
 */
export function stepBy(
  heading: number,
  right: number,
  forward: number,
): { dx: number; dz: number } {
  // Quarter turns, wrapped: 0 is +Z, 1 is +X, 2 is -Z, 3 is -X.
  const quarter = ((Math.round(heading / (Math.PI / 2)) % 4) + 4) % 4

  // The forward axis at each quarter, and the right-hand axis with it.
  const forwards = [
    { dx: 0, dz: 1 },
    { dx: 1, dz: 0 },
    { dx: 0, dz: -1 },
    { dx: -1, dz: 0 },
  ][quarter]
  const rights = forwards ? { dx: forwards.dz, dz: -forwards.dx } : { dx: 1, dz: 0 }

  return {
    dx: (forwards?.dx ?? 0) * forward + rights.dx * right,
    dz: (forwards?.dz ?? 0) * forward + rights.dz * right,
  }
}

/**
 * A free spot to put something down, near somebody.
 *
 * `/xo bench` does not hand you a bench any more - it stands one in front of
 * you, and this is where. Which means the answer has to be somewhere it will
 * actually fit: dropping a bench into the wall somebody happens to be facing is
 * worse than not dropping it at all, because the only sign anything happened is
 * a bench you cannot see.
 *
 * ---------------------------------------------------------------------------
 * A ring, not a line
 * ---------------------------------------------------------------------------
 * Straight ahead first, because that is where somebody is looking and where
 * they will expect it. Then outward in rings around that spot, which finds the
 * gap beside a wall rather than giving up at it - and stops at
 * `SPOT_RINGS`, because past three cells the answer stops being "in front of
 * you" and becomes "somewhere over there".
 *
 * Null when there is nowhere, which is a real answer: a cupboard with a person
 * in it has no room for a wardrobe, and saying so beats putting one inside the
 * person.
 */
const SPOT_RINGS = 3

export function spotFor(
  from: { x: number; y: number; z: number },
  heading: { x: number; z: number },
  ahead: number,
  /** The world and everything standing in it. See `fits`. */
  solid: { has: (key: string) => boolean },
  isFree: (x: number, y: number, z: number) => boolean,
): { x: number; y: number; z: number } | null {
  const originX = Math.floor(from.x + heading.x * ahead)
  const originZ = Math.floor(from.z + heading.z * ahead)
  const top = Math.floor(from.y)

  for (let ring = 0; ring <= SPOT_RINGS; ring += 1) {
    for (let dx = -ring; dx <= ring; dx += 1) {
      for (let dz = -ring; dz <= ring; dz += 1) {
        // Only the edge of each ring: the inside was covered by the ring before.
        if (ring > 0 && Math.abs(dx) !== ring && Math.abs(dz) !== ring) continue

        const x = originX + dx
        const z = originZ + dz
        const y = dropTo(solid, x, z, top)

        if (isFree(x, y, z)) return { x, y, z }
      }
    }
  }

  return null
}
