/**
 * Turning a cursor into a place in the world.
 *
 * Two small functions, split out of ./stage for the reason everything in this
 * project is split: a drag cannot be watched here. The Browser pane never gives
 * the canvas a size, so R3F never creates its root, so the component that
 * listens for a drop never mounts - which means the *only* way to know whether
 * a dropped wall lands where the cursor was is to ask a function.
 *
 * What is left in the component after this is three event listeners and a
 * raycast, which is the part that cannot be wrong quietly.
 */

/**
 * A pixel on the canvas, as the normalised coordinates a camera takes.
 *
 * -1..1 on both axes with **y flipped**, because the screen counts downwards
 * and the camera counts up. Getting that backwards is the classic version of
 * this bug and it is invisible from the code: everything works, and dropping
 * above the middle puts the piece below it.
 */
export function ndcFor(
  client: { x: number; y: number },
  rect: { left: number; top: number; width: number; height: number },
): { x: number; y: number } | null {
  // A canvas with no area gives no answer rather than a division by zero, which
  // would otherwise arrive downstream as a placement at NaN.
  if (rect.width <= 0 || rect.height <= 0) return null
  return {
    x: ((client.x - rect.left) / rect.width) * 2 - 1,
    y: -((client.y - rect.top) / rect.height) * 2 + 1,
  }
}

/**
 * Where a ray meets the flat working plane, or null.
 *
 * The fallback for a drop that found nothing under it, and the reason it is
 * worked out rather than raycast against the plane mesh: a drop that finds
 * nothing must still put the piece *somewhere*, because the gesture visibly
 * happened and a gesture with no result is indistinguishable from an editor
 * that is broken.
 *
 * Null twice, and both are real: a ray parallel to the plane never meets it, and
 * one pointing away from it meets it *behind the camera*, which is a place you
 * cannot see and must not be able to build in.
 */
export function planeHit(
  origin: { x: number; y: number; z: number },
  direction: { x: number; y: number; z: number },
  level: number,
): { x: number; y: number; z: number } | null {
  if (Math.abs(direction.y) < 1e-6) return null
  const along = (level - origin.y) / direction.y
  if (along < 0) return null
  return {
    x: origin.x + direction.x * along,
    y: level,
    z: origin.z + direction.z * along,
  }
}
