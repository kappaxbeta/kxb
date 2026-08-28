import type { Standing } from '@/app/xp/_runtime/match/standings'
import type { Vec3 } from '@kxb/xp/engine'

/**
 * Who a spectator watches, and from where.
 *
 * Pure, and the reason is the usual one twice over: a camera cannot be looked
 * at where this is developed, and the interesting parts are not the maths -
 * they are what happens when the person you are watching leaves, is eliminated,
 * or is the last one there. Every one of those is a frame where the camera
 * points at nothing, and nothing throws.
 *
 * ---------------------------------------------------------------------------
 * Watching is not a mode the runtime enters
 * ---------------------------------------------------------------------------
 * There is no spectator state machine here on purpose. Being out is one boolean
 * the arbiter decides (`standings`), and this only answers *who* and *where* -
 * so a level where nobody can be eliminated never calls any of it, and a
 * spectator who is somehow revived simply stops.
 */

/**
 * Everybody worth watching, in a stable order.
 *
 * Sorted by id rather than left in the board's order, which sorts by kills:
 * without this, somebody scoring would reshuffle the list under the keys that
 * cycle through it, and pressing right twice would land somewhere unrelated.
 *
 * Only players who are *here* - somebody who left is a body nobody is drawing,
 * and a camera pointed at their last sample is a camera pointed at a corpse
 * that will never move again.
 */
export function watchable(standings: readonly Standing[]): string[] {
  return standings
    .filter((row) => !row.mine && !row.out && row.here)
    .map((row) => row.id)
    .sort()
}

/**
 * The next one along, wrapping, and robust to the list changing underneath.
 *
 * `current` not being in the list any more is the common case rather than the
 * edge one - it is what happens the moment the person you are watching is
 * eliminated - so it lands on the first rather than on nothing.
 */
export function nextWatch(current: string | null, ids: readonly string[], step: 1 | -1): string | null {
  if (ids.length === 0) return null
  const at = current === null ? -1 : ids.indexOf(current)
  if (at < 0) return ids[0]!
  return ids[(at + step + ids.length) % ids.length]!
}

/** How far behind the watched body the camera sits, in cells. */
export const WATCH_BACK = 4

/** And how far above their feet. Head height plus a little, to see over them. */
export const WATCH_UP = 2.4

/**
 * Where to put the camera to watch somebody, and what to point it at.
 *
 * Behind and above, looking at their head - the same shape as the third-person
 * camera, because a spectator view that framed people differently to the way
 * the game frames you reads as a different game.
 *
 * `facing` is the document's unit: degrees about Y, clockwise from north, which
 * is what a `Sample` carries. Behind means *opposite* to where they are looking,
 * so the maths is the same as the chase camera's and the sign is the thing to
 * get wrong.
 */
export function watchFrom(at: Vec3 & { facing: number }): { eye: Vec3; look: Vec3 } {
  const radians = (at.facing * Math.PI) / 180
  return {
    eye: {
      // Behind is minus the forward vector, and forward here is
      // `(sin θ, 0, cos θ)` - the mark's convention, which ./camera documents at
      // length because getting it backwards is what opened `ladder-run` on a
      // black screen. Minus *both* components: the first version of this had
      // the sign right on x and wrong on z, which parks the camera in somebody's
      // face at exactly the right distance.
      x: at.x - Math.sin(radians) * WATCH_BACK,
      y: at.y + WATCH_UP,
      z: at.z - Math.cos(radians) * WATCH_BACK,
    },
    look: { x: at.x, y: at.y + 1.5, z: at.z },
  }
}
