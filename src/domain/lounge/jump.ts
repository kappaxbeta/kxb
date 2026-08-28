/**
 * What a jump is, as numbers and as a curve.
 *
 * The constants live here rather than in the character controller because two
 * things need them and only one of them is the controller. The other is the
 * scene studio, which draws a peep mid-jump for a marketing shot - and a
 * marketing shot of a jump the game does not actually have is worse than no
 * shot, so both read the same numbers.
 *
 * `@/app/world/lounge/_sim/physics` re-exports all four, so nothing that already
 * imported them from there had to change.
 */

/** Blocks per second squared. Earth is ~9.8; this is heavier so falls feel short. */
export const GRAVITY = 26

/** Upward velocity on jump. Enough to clear exactly one block. */
export const JUMP_SPEED = 8.4

/**
 * Upward velocity on the mid-air second jump.
 *
 * A little short of the first, and deliberately so: a second jump as strong as
 * the first makes the ground jump the uninteresting half of the pair, because
 * the optimal way to go anywhere becomes hop-then-jump every time. Short enough
 * to read as a recovery - a save after a bad leap, a way over a wall you
 * misjudged - rather than as a second full storey.
 */
export const AIR_JUMP_SPEED = 7

/**
 * Jumps available between one landing and the next.
 *
 * Two: the one off the floor and one in the air. Counted rather than held as a
 * `canDoubleJump` flag because walking off a ledge has to spend one of them -
 * see `step`, where an airborne player who never jumped is charged for the jump
 * they did not use. Without that, stepping off a block would give you two full
 * jumps on the way down.
 */
export const MAX_JUMPS = 2

/** Seconds from leaving the floor to the top of a plain jump. */
const APEX = JUMP_SPEED / GRAVITY

/** How high that is, in blocks. */
const PEAK = (JUMP_SPEED * JUMP_SPEED) / (2 * GRAVITY)

/**
 * When the air jump fires, for a peep who takes one.
 *
 * At the apex of the first, which is both what a player does - you press again
 * when you feel yourself stop rising - and the only choice that needs no second
 * number in the document. Authoring the moment would be a slider whose whole
 * range from "too early to matter" to "too late to save you" is a tenth of a
 * second wide.
 */
const AIR_AT = APEX

/** Seconds from the air jump to landing, falling from `PEAK` with a boost. */
const AIR_FALL =
  (AIR_JUMP_SPEED + Math.sqrt(AIR_JUMP_SPEED * AIR_JUMP_SPEED + 2 * GRAVITY * PEAK)) / GRAVITY

/** How long a peep is off the floor, with and without the second jump. */
export const JUMP_AIRTIME = 2 * APEX
export const DOUBLE_JUMP_AIRTIME = AIR_AT + AIR_FALL

/** The top of each, in blocks. Useful for framing a camera on one. */
export const JUMP_PEAK = PEAK
export const DOUBLE_JUMP_PEAK = PEAK + (AIR_JUMP_SPEED * AIR_JUMP_SPEED) / (2 * GRAVITY)

/**
 * How fast a peep travels on the ground, in blocks a second.
 *
 * Here rather than in the scene that reads them, because they stopped being a
 * feel-of-the-controls number the moment anything *else* had to agree with
 * them. A course is the case in point: whether a gap is jumpable is decided by
 * these two numbers and the three above, and a course laid by eye is a course
 * with a hop in it that nobody can make - which is exactly the bug that sent
 * somebody to a yellow pad they could not reach.
 */
export const WALK_PACE = 7
export const SPRINT_PACE = 13

/**
 * How far a jump carries you, landing `rise` blocks higher than you left.
 *
 * The honest reach of a hop, from the same constants the controller steps: how
 * long you are above `rise` on the way through the arc, times how fast you were
 * going. A level jump gets the whole airtime; one that has to land a block up
 * gets only the part of the arc above that block, which is a little over half
 * of it.
 *
 * Returns 0 for a rise the jump cannot make at all, which is the useful answer
 * rather than an imaginary number: it makes "that pad is unreachable" a thing a
 * test can assert rather than a thing a player discovers.
 *
 * Deliberately ignores the second jump. A course anybody can run is one you can
 * run without knowing there is a second jump; the air jump is the save when you
 * misjudge, and building a route that requires it is building a route that
 * rejects everybody who has not found it yet.
 */
export function jumpReach(rise: number, pace: number = WALK_PACE): number {
  if (rise <= 0) return pace * JUMP_AIRTIME

  // The two moments the arc crosses `rise`. No crossing means the jump never
  // gets that high.
  const discriminant = JUMP_SPEED * JUMP_SPEED - 2 * GRAVITY * rise
  if (discriminant <= 0) return 0

  const root = Math.sqrt(discriminant)
  const landing = (JUMP_SPEED + root) / GRAVITY

  return pace * landing
}

/**
 * Height above the floor, `elapsed` seconds into a jump.
 *
 * Integrated rather than simulated. The controller steps the same motion frame
 * by frame because it has to stop against blocks on the way, but a shot has no
 * blocks to hit and does have to be samplable at an arbitrary instant - a
 * scrubber lands wherever the mouse is - so the closed form is the honest one.
 * They agree because they are the same constants and the same constant
 * acceleration.
 *
 * Returns zero before the jump and after the landing, so a peep who is not
 * jumping is a peep standing on the floor.
 */
export function jumpArc(elapsed: number, air: boolean): number {
  if (!(elapsed > 0)) return 0

  if (!air) {
    if (elapsed >= JUMP_AIRTIME) return 0
    return JUMP_SPEED * elapsed - 0.5 * GRAVITY * elapsed * elapsed
  }

  if (elapsed >= DOUBLE_JUMP_AIRTIME) return 0
  if (elapsed < AIR_AT) {
    return JUMP_SPEED * elapsed - 0.5 * GRAVITY * elapsed * elapsed
  }

  // Second leg: a fresh launch from wherever the first one topped out.
  const since = elapsed - AIR_AT
  return Math.max(0, PEAK + AIR_JUMP_SPEED * since - 0.5 * GRAVITY * since * since)
}
