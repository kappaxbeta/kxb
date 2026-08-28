/**
 * Where a tracer is, at a moment.
 *
 * Split out of ./tracers for the reason everything in this project is split:
 * the component draws and cannot be watched - the Browser pane never fires a
 * frame - so the half that decides *what* is drawn is a function with a test,
 * and the half that puts it on the screen is four lines of matrix.
 *
 * It is small enough to look unnecessary. It is not: the invariant below is one
 * a picture can break silently, and a bullet drawn through the wall it just hit
 * is the picture contradicting the only thing `castRay` promises.
 */

/** Cells a second. Fast enough to be instant, slow enough to have a direction. */
export const STREAK_SPEED = 140

/** How long the streak is, in cells. */
export const STREAK_LENGTH = 1.4

export interface Streak {
  /** How far along the shot the leading end is, in cells. */
  head: number
  /** And the trailing end. Never behind the muzzle. */
  tail: number
  /** Whether it is still worth drawing. */
  alive: boolean
}

/**
 * A shot's streak, `age` seconds after it was fired.
 *
 * Two clamps and both are the point:
 *
 * - **The head stops at the target.** A streak that overshoots is a bullet that
 *   went through the thing it hit, which is the one thing the picture must not
 *   say - the whole reason `castRay` tests the wall in front of a target is that
 *   it did not.
 * - **The tail does not start behind the muzzle.** On the first frame the head
 *   has travelled two metres and the streak is one and a half long, so an
 *   unclamped tail is half a metre behind the gun - a bullet leaving from inside
 *   the person firing it.
 */
export function streak(age: number, distance: number): Streak {
  const travelled = age * STREAK_SPEED
  const head = Math.min(travelled, distance)
  /**
   * The tail keeps going after the head has stopped.
   *
   * Which is what makes a shot *land*: the streak runs into the wall and is
   * swallowed by it, rather than parking against it at full length and then
   * blinking out. Taking it from `head` instead of from `travelled` freezes it
   * the moment the head clamps, and the difference between the two is the whole
   * of how an impact reads.
   */
  const tail = Math.min(Math.max(travelled - STREAK_LENGTH, 0), distance)
  return {
    head,
    tail,
    /**
     * Gone once the whole streak has arrived, not once its head has.
     *
     * Ending at the head would cut every shot off a length short of what it
     * hit, which reads as a bullet stopping in mid-air just before the target -
     * the exact impression the clamp above exists to avoid.
     */
    alive: travelled <= distance + STREAK_LENGTH,
  }
}
