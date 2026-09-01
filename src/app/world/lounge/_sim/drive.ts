/**
 * How a vehicle goes, one frame at a time.
 *
 * In `_sim` for the reason everything here is: this is arithmetic that is just
 * as true written down on paper, and being wrong in it is invisible until
 * somebody is reversing into a wall at full speed. The character controller
 * calls it where it would otherwise work out a walk, and hands the result to
 * the same `stepPhysics` everything else moves through - so a car is stopped
 * by the walls that stop a person, steps the kerbs a person steps, and falls
 * off the ledges a person falls off.
 *
 * ---------------------------------------------------------------------------
 * Why this is not the XP engine's body
 * ---------------------------------------------------------------------------
 * A summoned ball is a body: it has bounce and drag and is pushed by whoever
 * runs into it. A driven vehicle is the opposite thing - it *is* the player
 * for as long as somebody is at the wheel, moving under their input on their
 * client, broadcast the way their body always was. Giving it a body of its own
 * would mean two simulations arguing over one position; this way there is one,
 * and it is the one every peer already interpolates.
 *
 * ---------------------------------------------------------------------------
 * The model, in three sentences
 * ---------------------------------------------------------------------------
 * Speed chases what the throttle asks for, at a rate that is quick to build,
 * quicker to brake, and slow to coast away. Steering is a *rate of turn*, not
 * a direction - scaled by how fast the vehicle is actually going, so a parked
 * car cannot spin on the spot and a fast one carves. Reversing flips the turn,
 * because that is what wheels at the front of a backwards car do.
 */

export interface DriveState {
  /** Cells per second along the heading. Negative is reverse. */
  speed: number
  /** Which way the nose points, in radians. Forward is `(sin h, 0, cos h)`. */
  heading: number
  /**
   * Where the front wheels point, -1..1, eased toward the stick.
   *
   * Kept on the state rather than recomputed because two readers want it and
   * only one of them is this function: the renderer yaws the steering wheels
   * by it, and a wheel that snapped hard over the instant D went down would
   * read as broken even though the turn underneath it is eased anyway.
   */
  steer: number
}

export interface DriveTuning {
  /** Top speed, cells per second. `VehicleSpec.speed`. */
  top: number
  /** Turn rate at full lock and full speed, radians per second. */
  turn: number
}

export interface DriveInput {
  /** -1..1. Forward is positive; negative brakes, then reverses. */
  throttle: number
  /** -1..1. Positive is a right turn. */
  steer: number
}

/**
 * Reverse is deliberately slower than forward.
 *
 * A third, which is enough to get out of the corner you drove into and not
 * enough to make driving backwards a strategy. Every kart game makes the same
 * choice and for the same reason.
 */
export const REVERSE_FRACTION = 1 / 3

/** Seconds from standstill to top speed, and back down. Braking is sharper. */
const ACCEL_SECONDS = 1.4
const BRAKE_SECONDS = 0.5
/** Seconds for a released throttle to roll to a stop. */
const COAST_SECONDS = 2.2

/** How fast the drawn steering runs to the stick, per second. */
const STEER_EASE = 8

/**
 * Below this fraction of top speed the wheel loses authority linearly.
 *
 * A quarter, so the turn is fully yours by city pace. Without it a stationary
 * vehicle would rotate in place, which nothing on wheels does, and the fix of
 * making turn proportional to *speed* alone makes slow manoeuvring treacle.
 */
const TURN_AUTHORITY_AT = 0.25

/** What one frame of driving does. Returns fresh state; mutates nothing. */
export function stepDrive(
  state: DriveState,
  input: DriveInput,
  tuning: DriveTuning,
  dt: number,
): DriveState & { moveX: number; moveZ: number } {
  const throttle = clamp(input.throttle)
  const wanted =
    throttle >= 0 ? throttle * tuning.top : throttle * tuning.top * REVERSE_FRACTION

  /**
   * Which rate applies is decided by what the change *is*: pressing toward a
   * higher speed in the direction you are already going is acceleration,
   * anything that reduces the magnitude - or fights the sign - is braking, and
   * a slack throttle is a coast. The sign fight matters: holding S at speed
   * should shed it at braking rate, not amble down at coasting rate.
   */
  const rate =
    throttle === 0
      ? tuning.top / COAST_SECONDS
      : Math.sign(wanted) === Math.sign(state.speed) && Math.abs(wanted) > Math.abs(state.speed)
        ? tuning.top / ACCEL_SECONDS
        : tuning.top / BRAKE_SECONDS

  const speed = approach(state.speed, wanted, rate * dt)

  const steer = approach(state.steer, clamp(input.steer), STEER_EASE * dt)

  /**
   * Turn authority: none at a standstill, all of it above a quarter of top.
   * The sign of the speed rides along, which is what flips the turn in
   * reverse - the same wheels, pointing the same way, tracing the other arc.
   */
  const authority = clamp(speed / (tuning.top * TURN_AUTHORITY_AT))
  // Right is a *decreasing* heading in this frame: forward is (sin h, cos h),
  // and the vector a quarter turn to its right is at h - pi/2.
  const heading = state.heading - steer * tuning.turn * authority * dt

  return {
    speed,
    heading,
    steer,
    moveX: Math.sin(heading) * speed * dt,
    moveZ: Math.cos(heading) * speed * dt,
  }
}

/**
 * What hitting something does to the momentum.
 *
 * Called by the controller when the physics moved the vehicle a fraction of
 * what was asked - which is what a wall looks like from in here. Nearly all of
 * the speed goes, but not quite all: a dead stop reads as the input dying,
 * and the sliver left is what lets a car scrape along a fence instead of
 * sticking to the first post.
 */
export function wallSlow(speed: number): number {
  return speed * 0.25
}

/**
 * How much of the asked-for move has to survive the physics before it counts
 * as driving rather than as hitting something. See `wallSlow`.
 */
export const BLOCKED_BELOW = 0.4

function approach(current: number, target: number, by: number): number {
  if (current < target) return Math.min(target, current + by)
  return Math.max(target, current - by)
}

function clamp(value: number): number {
  return Math.max(-1, Math.min(1, value))
}
