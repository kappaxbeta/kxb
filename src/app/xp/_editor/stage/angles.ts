/**
 * The three angles a placement has, in and out of a three.js Euler.
 *
 * ---------------------------------------------------------------------------
 * Why this is not two lines inside the gizmo
 * ---------------------------------------------------------------------------
 * It was one line, and it was wrong in both directions at once: the proxy was
 * set with `rotation.set(0, yaw, 0)` and read back as `object.rotation.y`, so
 * `pitch` and `roll` were invisible to the handle. A tilted crate straightened
 * up the moment it was selected, and dragging the x or z ring did nothing at
 * all - a dead control with no way to tell it was dead.
 *
 * The pair has to be exact inverses or the piece you see and the piece you drag
 * are turned by two conventions, and two conventions agree right up until two
 * angles are non-zero at once - which is the case nobody tries until a ramp is
 * leaning the wrong way and there is nothing to bisect. That is a property, and
 * a property is a test, and a test needs the arithmetic somewhere a test can
 * reach it. Hence a file.
 *
 * ---------------------------------------------------------------------------
 * `YXZ`, which is not a preference
 * ---------------------------------------------------------------------------
 * Yaw, then pitch, then roll - the order `instances.tsx` composes for drawing,
 * the order `skinned.tsx` sets on a weapon in a hand, and the order
 * `rotationMatrix` in the engine is transcribed from. The cells you stand on
 * and the mesh you see are already tilted by it; anything else here would make
 * the editor a third opinion.
 */

/** What a placement says about which way it is turned. Degrees. */
export interface Angles {
  /** Yaw, about Y. The one every document has had since the format did. */
  rotation: number
  pitch?: number
  roll?: number
}

/** Radians, in the order a `THREE.Euler` with order `YXZ` takes them. */
export interface Euler {
  x: number
  y: number
  z: number
}

const RADIANS = Math.PI / 180
const DEGREES = 180 / Math.PI

/**
 * A placement's angles as an Euler, for the proxy the handle is attached to.
 *
 * Absent is zero rather than absent: an Euler has three numbers whatever a
 * document left out.
 */
export function eulerOf(angles: Angles): Euler {
  return {
    x: (angles.pitch ?? 0) * RADIANS,
    y: angles.rotation * RADIANS,
    z: (angles.roll ?? 0) * RADIANS,
  }
}

/**
 * And back, as a change against where the handle started.
 *
 * Deltas rather than absolutes, which is what the position beside it does and
 * for the same reason: a child is dragged in *world* space while its numbers
 * stay relative to whatever it hangs off, so what can be reported is how far the
 * handle moved rather than where it ended up.
 *
 * `base` is the document's numbers and `was` is the world transform the proxy
 * was set from. For anything without a parent they are the same and the
 * subtraction cancels - which is most placements, and is why this was invisible
 * for as long as it was.
 */
export function turnedBy(base: Angles, was: Angles, now: Euler): Required<Angles> {
  return {
    rotation: base.rotation + (now.y * DEGREES - was.rotation),
    pitch: (base.pitch ?? 0) + (now.x * DEGREES - (was.pitch ?? 0)),
    roll: (base.roll ?? 0) + (now.z * DEGREES - (was.roll ?? 0)),
  }
}
