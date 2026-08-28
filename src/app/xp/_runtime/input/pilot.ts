/**
 * Driving a course, to find out whether it can be run.
 *
 * `xps.test.ts` measures every gap against a simulated jump and every rise
 * against a simulated climb, which catches the mistake that shipped in the first
 * draft of `ladder-run` - a six-cell gap with a two-cell rise, which nothing
 * clears and which looked completely fine in a screenshot. What it cannot say is
 * that the course is *runnable*: a gap inside the budget can still be
 * unreachable for reasons arithmetic does not see, and a landing under an
 * overhang is inside every budget there is.
 *
 * So this drives the real controller over the real level, through the real
 * movement basis, and reports whether it arrived.
 *
 * ---------------------------------------------------------------------------
 * The jump has to commit to a take-off point
 * ---------------------------------------------------------------------------
 * task.md records the rough version deadlocking on its own jump key: it pressed
 * jump on every grounded frame where the target was above it, so it bounced on
 * the spot instead of moving. That is not a tuning problem, it is the absence of
 * a decision - a jump is a thing you commit to *somewhere*, and a pilot with no
 * take-off point has nowhere to commit.
 *
 * What this does instead is look ahead for the last solid ground before a gap,
 * and hold the key until it is standing on it. Everything else falls out of
 * that: no bouncing, because there is nothing to press until the edge; no early
 * jump, because the edge is where the budget was measured from; and a second
 * jump only while still short of a landing, which is what the double jump is for
 * rather than a thing to spend immediately.
 *
 * ---------------------------------------------------------------------------
 * Why it is here and not in the engine's tests
 * ---------------------------------------------------------------------------
 * Because it drives the course the way the *runtime* does, `movementBasis` and
 * all. `sidestep` is watched from the side, so its `D` is a world axis rather
 * than a look direction - and a pilot that walked it with the engine's own
 * conventions would be proving a course nobody plays.
 */

import { movementBasis } from '@/app/xp/_runtime/camera'
import type { XpCamera } from '@kxb/xp'
import {
  EYE_HEIGHT,
  SPRINT_PACE,
  step,
  type SolidTest,
  type Vec3,
} from '@kxb/xp/engine'

/** A frame, at the rate the runtime clamps to at worst. */
const FRAME = 1 / 60

/**
 * How far ahead the pilot looks for the edge of the ground.
 *
 * A little further than the longest jump it could be about to make, so the edge
 * is always found before it is reached. Looking less far is a pilot that walks
 * off cliffs; looking much further is a pilot that spots a gap two platforms
 * away and jumps at the wrong one.
 */
const LOOKAHEAD = 10

/** How far down counts as "there is ground here" rather than "there is a hole". */
const DROP = 4

export interface Course {
  isSolid: SolidTest
  /** Where the run starts, as feet. */
  from: Vec3
  /** Where it has to get to. Only the axis of travel is compared. */
  to: Vec3
  /** Nothing below this. A fall past it is a failed run rather than an endless one. */
  floorY: number
  /** The camera the level is played through, which decides which way is forward. */
  camera: XpCamera
}

export interface Run {
  arrived: boolean
  /**
   * The finish is not on the axis this pilot steers along, so it did not try.
   *
   * The most important field here, because without it this reports a confident
   * lie. `ladder-run` finishes at (48, -41) - an L - and a pilot comparing only
   * the axis it walks on declared "arrived" the moment it passed x=48, having
   * run one leg of two. A test that passes with the course half-run is worth
   * less than no test, because it is believed.
   */
  offAxis: boolean
  /** Simulated seconds spent. */
  seconds: number
  /** How far along the axis of travel it got, in cells. */
  reached: number
  /** It stopped making progress rather than falling or arriving. */
  stuck: boolean
  /** It fell past the floor. */
  fell: boolean
}

/** Is there ground under this spot, within a drop worth taking? */
function groundUnder(isSolid: SolidTest, x: number, feetY: number, z: number): boolean {
  for (let down = 0; down <= DROP; down++) {
    if (isSolid(Math.floor(x), Math.floor(feetY - down - 0.001), Math.floor(z))) return true
  }
  return false
}

/**
 * Drive the course, and say what happened.
 *
 * Sprints, because a course laid out against a sprint span is a course you have
 * to sprint. Walking it would fail every long gap and prove nothing except that
 * the pilot was slow.
 */
export function drive(course: Course, limit = 60): Run {
  const basis = movementBasis(course.camera, { x: 0, z: -1 })
  /** Which way the finish is, along the axis the basis actually moves on. */
  const alongX = Math.abs(basis.rightX) > Math.abs(basis.rightZ)
  const heading = alongX
    ? Math.sign(course.to.x - course.from.x) || 1
    : Math.sign(course.to.z - course.from.z) || 1
  /** `D` in world units, and which sign of it walks towards the finish. */
  const push = alongX ? heading / (basis.rightX || 1) : heading / (basis.rightZ || 1)

  const at = (p: Vec3) => (alongX ? p.x : p.z)
  const across = (p: Vec3) => (alongX ? p.z : p.x)
  const target = at(course.to)

  /**
   * A course that turns a corner is not one this can drive.
   *
   * The steering model is one axis by construction - it holds `D` and jumps -
   * which is the right shape for a side-on platformer and the wrong shape for an
   * L. Refusing at the door rather than driving as far as the corner and
   * reporting a number: a partial run that looks like a finish is how a broken
   * course gets a passing test.
   *
   * The tolerance is a platform's width rather than zero, because a finish gate
   * is a few cells across and a course is allowed to wander inside its own
   * walkway.
   */
  if (Math.abs(across(course.to) - across(course.from)) > 4) {
    return {
      arrived: false,
      offAxis: true,
      seconds: 0,
      reached: at(course.from),
      stuck: false,
      fell: false,
    }
  }

  let position: Vec3 = { x: course.from.x, y: course.from.y + EYE_HEIGHT, z: course.from.z }
  let velocityY = 0
  let grounded = false
  let jumps = 0
  let jumpHeld = false

  let reached = at(position)
  /** Frames since the furthest point moved, which is how being stuck is noticed. */
  let idle = 0
  let seconds = 0

  for (let frame = 0; frame < limit / FRAME; frame++) {
    const feetY = position.y - EYE_HEIGHT
    const here = at(position)

    /**
     * Where the ground runs out ahead, if it does.
     *
     * Sampled at half a cell, because a cell-wide sample can step straight over
     * a one-cell hole - which is exactly the hole a course puts a jump over.
     */
    let edge: number | null = null
    for (let ahead = 0.5; ahead <= LOOKAHEAD; ahead += 0.5) {
      const x = alongX ? position.x + ahead * heading : position.x
      const z = alongX ? position.z : position.z + ahead * heading
      if (!groundUnder(course.isSolid, x, feetY, z)) {
        // The last sample that *did* have ground is the take-off point.
        edge = here + (ahead - 0.5) * heading
        break
      }
    }

    /**
     * Jump when standing on the edge, or when something is in the way.
     *
     * The second case is the step-up's limit: `step` walks up anything under
     * `STEP_HEIGHT` by itself, so a refusal to move means a wall taller than
     * that, and a course made of platforms has those as its rises.
     */
    const atEdge = edge !== null && Math.abs(here - edge) <= 0.35
    let wantJump = grounded && atEdge

    /**
     * And the second jump: falling, still over the hole.
     *
     * The first draft asked for *no* gap ahead, which is exactly backwards and
     * cost `sidestep` at its first real obstacle - a three-cell gap onto a
     * platform two cells higher. A single jump is 1.36 cells of climb and a
     * double is 2.17, so that landing is only reachable with both, and a pilot
     * that never spends the second one walks off the edge and falls. It reached
     * x=34.7 of 74 every time, which is exactly where that gap is.
     *
     * Falling rather than rising, because spending it on the way up gains
     * nothing - the double jump is height *after* the first has run out. And
     * only while there is still nothing underneath, which is what stops it being
     * spent a frame after take-off over ground it was never going to miss.
     */
    const overHole = !groundUnder(course.isSolid, position.x, feetY, position.z)
    if (!grounded && velocityY < 0 && jumps < 2 && overHole) wantJump = true

    const pace = SPRINT_PACE * FRAME
    const moveX = alongX ? basis.rightX * push * pace : 0
    const moveZ = alongX ? 0 : basis.rightZ * push * pace

    const result = step({
      position,
      velocityY,
      moveX,
      moveZ,
      jump: wantJump,
      // Pressed only on the frame it is wanted, never held: a held key is how
      // the rough version bounced, and `jumpPressed` is what the controller
      // actually reads for a take-off.
      jumpPressed: wantJump && !jumpHeld,
      grounded,
      jumps,
      delta: FRAME,
      isSolid: course.isSolid,
      floorY: course.floorY - 100,
    })

    jumpHeld = wantJump
    position = result.position
    velocityY = result.velocityY
    grounded = result.grounded
    jumps = result.jumps
    seconds += FRAME

    const now = at(position)
    if ((now - reached) * heading > 0.01) {
      reached = now
      idle = 0
    } else {
      idle += 1
    }

    if ((now - target) * heading >= 0) {
      return { arrived: true, offAxis: false, seconds, reached: now, stuck: false, fell: false }
    }
    if (position.y - EYE_HEIGHT < course.floorY - 2) {
      return { arrived: false, offAxis: false, seconds, reached, stuck: false, fell: true }
    }
    // Three seconds of not getting any further along. A pilot that is going to
    // arrive is always making progress; one that is not is against a wall.
    if (idle > 3 / FRAME) {
      return { arrived: false, offAxis: false, seconds, reached, stuck: true, fell: false }
    }
  }

  return { arrived: false, offAxis: false, seconds, reached, stuck: false, fell: false }
}
