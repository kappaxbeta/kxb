/**
 * A thing that goes somewhere and comes back.
 *
 * ---------------------------------------------------------------------------
 * Why `bob` and `spin` were not this, and could not be
 * ---------------------------------------------------------------------------
 * The room has had two moving verbs since the thingiverse shipped, and both are
 * drawn by *each client off its own clock* (see `ThingModel`'s frame loop). That
 * is exactly right for what they are - a coin that turns, a pickup that rises
 * and falls - because nothing depends on where they are: you cannot stand on a
 * bob, and two people seeing a coin at two points of its turn have not
 * disagreed about anything.
 *
 * A lift is the opposite. Where it *is* decides whether you are standing on it,
 * whether the crusher caught you, and whether the door it is carrying is
 * blocked - so two clients drawing it half a second apart is two rooms. The
 * moment motion has consequences it stops being a drawing and becomes a fact
 * about the world, and every fact about the world in this feature belongs to
 * the driver (see `./live`: one client runs every machine and everybody else
 * applies what they are told).
 *
 * So motion is a phase on the driver's clock, published four times a second and
 * run forward locally between packets - the same treatment `Standing.since`
 * already gets, for the same reason: a bar that only moved when a packet landed
 * would tick, and so would a lift.
 *
 * ---------------------------------------------------------------------------
 * One shape, because a lift and a crusher differ only in their numbers
 * ---------------------------------------------------------------------------
 * The obvious design is a `kind` - `lift`, `crusher`, `platform` - and it was
 * rejected on the usual ground: three names for one arithmetic, and a fourth
 * thing somebody wants is a code change rather than a number. What every one of
 * them actually is: go there, wait, come back, wait, forever. A crusher is that
 * with a fast trip out and a slow one back; a lift is the same trip both ways
 * with a pause at each end for somebody to step on; a sliding platform is the
 * same again along X.
 *
 * The one thing this deliberately cannot express is a path with more than two
 * ends. A patrol round four corners is a route, a route wants an editor, and an
 * editor for routes is a level - which is what an XP is for.
 */

/** How far a thing may travel from where it was put, in cells. */
export const MAX_MOVE = 12

/** How long a leg of the trip may take, and the least it may take. */
export const MIN_MOVE_SECONDS = 0.05
export const MAX_MOVE_SECONDS = 60

/** How long it may wait at either end. Zero is "not at all". */
export const MAX_MOVE_WAIT = 60

export interface MotionSpec {
  /**
   * Where the far end is, relative to where the thing was put, in cells.
   *
   * In the *world's* frame rather than the thing's own, and that is a decision
   * rather than an oversight: a lift goes up, and up is up whichever way
   * somebody happened to turn the platform when they placed it. Turning a
   * blueprint that travels along X into one that travels along Z is two numbers
   * in a panel, and the alternative - motion that rotates with the thing -
   * makes "why is my lift going sideways" a question about `facing`.
   */
  by: { x: number; y: number; z: number }
  /** Seconds to get there. */
  out: number
  /** Seconds to come back. A crusher drops fast and rises slowly. */
  back: number
  /** Seconds it waits at the far end. */
  waitOut?: number
  /** And at home. */
  waitHome?: number
  /**
   * Whether it eases in and out of each leg, or travels at a constant speed.
   *
   * A lift eases: it is a machine with a motor and somebody standing on it.
   * A crusher does not: the whole of a crusher is that it arrives all at once,
   * and easing the last third of its drop is what makes a trap feel avoidable
   * when it is not.
   */
  ease?: boolean
}

/** A lift: four cells up, three seconds each way, a beat at each end. */
export function freshLift(): MotionSpec {
  return { by: { x: 0, y: 4, z: 0 }, out: 3, back: 3, waitOut: 1.5, waitHome: 1.5, ease: true }
}

/** A crusher: three cells up, dropped in a fifth of a second, back up slowly. */
export function freshCrusher(): MotionSpec {
  return { by: { x: 0, y: -3, z: 0 }, out: 0.2, back: 1.6, waitOut: 0.5, waitHome: 1.4 }
}

/** How long one full there-and-back takes, in seconds. Never zero. */
export function cycleOf(motion: MotionSpec): number {
  return (
    Math.max(MIN_MOVE_SECONDS, motion.out) +
    Math.max(MIN_MOVE_SECONDS, motion.back) +
    Math.max(0, motion.waitOut ?? 0) +
    Math.max(0, motion.waitHome ?? 0)
  )
}

/**
 * How far along the trip it is, 0 at home and 1 at the far end.
 *
 * Split out from `offsetAt` because it is the whole of the rule and it is worth
 * being able to test it as a number rather than as three of them. Phase is
 * seconds since the cycle began, and it wraps - a thing that has been running
 * for an hour is at the same point as one that started a moment ago, which is
 * what makes a watcher's drifting clock catch up rather than diverge.
 */
export function travelOf(motion: MotionSpec, phase: number): number {
  const out = Math.max(MIN_MOVE_SECONDS, motion.out)
  const back = Math.max(MIN_MOVE_SECONDS, motion.back)
  const holdOut = Math.max(0, motion.waitOut ?? 0)
  const holdHome = Math.max(0, motion.waitHome ?? 0)
  const cycle = out + holdOut + back + holdHome

  // A negative or non-finite phase is a clock nobody set. Home is the honest
  // answer: it is where the thing was put, and it is where a thing that has
  // never been told anything should be drawn.
  if (!Number.isFinite(phase) || cycle <= 0) return 0
  const at = ((phase % cycle) + cycle) % cycle

  if (at < out) return ramp(at / out, motion.ease)
  if (at < out + holdOut) return 1
  if (at < out + holdOut + back) return ramp(1 - (at - out - holdOut) / back, motion.ease)
  return 0
}

/**
 * Where it is right now, relative to where it was put, in cells.
 *
 * The one function every client calls: the driver to decide what the thing is
 * standing on top of, and everybody else to draw it. Both are given the same
 * phase and both do the same arithmetic, which is what makes a lift the same
 * lift on two screens.
 */
export function offsetAt(
  motion: MotionSpec,
  phase: number,
): { x: number; y: number; z: number } {
  const travel = travelOf(motion, phase)
  return { x: motion.by.x * travel, y: motion.by.y * travel, z: motion.by.z * travel }
}

/**
 * Smooth, or not.
 *
 * Smoothstep rather than a sine or a cubic bezier: it is three operations, it
 * is exactly flat at both ends - so a lift arrives without a bounce - and it is
 * the same curve the rest of this app eases with.
 */
function ramp(t: number, ease: boolean | undefined): number {
  const clamped = Math.min(1, Math.max(0, t))
  return ease ? clamped * clamped * (3 - 2 * clamped) : clamped
}

/** Whether this thing goes anywhere at all. */
export function moves(spec: { motion?: MotionSpec }): boolean {
  if (!spec.motion) return false
  const { x, y, z } = spec.motion.by
  return x !== 0 || y !== 0 || z !== 0
}

/**
 * Whatever is wrong with a motion block, said in words.
 *
 * Its own function for the reason every other `*Problems` here is one: the
 * composer draws this as one panel and marks that panel, rather than telling
 * somebody adjusting a lift about the recipe they have not written.
 */
export function motionProblems(motion: MotionSpec): string[] {
  const problems: string[] = []

  for (const axis of ['x', 'y', 'z'] as const) {
    const value = motion.by[axis]
    if (!Number.isFinite(value) || Math.abs(value) > MAX_MOVE) {
      problems.push(`a thing travels at most ${MAX_MOVE} cells from where it was put`)
    }
  }

  for (const [field, value] of [
    ['out', motion.out],
    ['back', motion.back],
  ] as const) {
    if (!Number.isFinite(value) || value < MIN_MOVE_SECONDS || value > MAX_MOVE_SECONDS) {
      problems.push(`${field} is ${MIN_MOVE_SECONDS}-${MAX_MOVE_SECONDS} seconds`)
    }
  }

  for (const [field, value] of [
    ['the wait there', motion.waitOut],
    ['the wait home', motion.waitHome],
  ] as const) {
    if (value === undefined) continue
    if (!Number.isFinite(value) || value < 0 || value > MAX_MOVE_WAIT) {
      problems.push(`${field} is 0-${MAX_MOVE_WAIT} seconds`)
    }
  }

  return problems
}
