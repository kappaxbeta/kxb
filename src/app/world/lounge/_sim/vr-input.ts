/**
 * Turning a pair of thumbsticks into the two numbers the room already uses.
 *
 * Here rather than inside the component for the reason everything else in this
 * folder is: it is arithmetic with a right answer, and the only machine that can
 * run the component is one with a headset on it. A latch that fires twice per
 * push, or a stick whose sign is inverted, is a bug you would find by putting a
 * Quest on and turning round - and then have to put the Quest back on to check
 * you had fixed. These are the parts that can be checked without one.
 *
 * What is *not* here is anything about poses, sessions or matrices. Those need a
 * live XRFrame to mean anything, so testing them would mean testing a mock of
 * WebXR rather than testing this - see ../_canvas/vr, which keeps them.
 */

/**
 * How far a stick has to move before it counts.
 *
 * Sticks do not return to exactly zero, and a resting hand should leave you
 * standing still rather than drifting slowly into a wall over a minute.
 */
export const STICK_DEAD_ZONE = 0.15

/**
 * How far a snap turn goes: thirty degrees.
 *
 * Smaller than the forty-five most headset games default to, because this room
 * is a room rather than a shooter - you turn to look at somebody, not to catch
 * someone behind you - and a smaller step leaves less of the world unaccounted
 * for between one frame and the next.
 */
export const TURN_STEP = Math.PI / 6

/**
 * Push past this to turn; come back inside this before you can turn again.
 *
 * Two thresholds rather than one, which is the whole of the latch below. With a
 * single line the stick would chatter across it and fire a turn every few frames
 * while held - which is smooth turning with a stutter, and smooth turning is the
 * reliable way to make somebody take a headset off.
 */
export const TURN_ON = 0.7
export const TURN_OFF = 0.3

/** A stick's reading, with the resting wobble taken out. */
export function pastDeadZone(axis: number | undefined): number {
  const value = axis ?? 0
  return Math.abs(value) < STICK_DEAD_ZONE ? 0 : value
}

/**
 * Whether the turn stick is still held over from the last snap.
 *
 * A mutable object rather than a returned pair, so the caller keeps one of these
 * in a ref and passes it in - the same shape the dash and kick runtimes next door
 * use, and for the same reason: this is state that belongs to a frame loop.
 */
export interface TurnLatch {
  held: boolean
}

export function createTurnLatch(): TurnLatch {
  return { held: false }
}

/**
 * How far to turn the room this frame, in radians. Zero on most of them.
 *
 * Pushing the stick right turns you right, which is a *negative* rotation about
 * Y - three.js measures yaw anticlockwise seen from above, so the sign here
 * looks wrong and is not.
 */
export function snapTurn(sideways: number, latch: TurnLatch): number {
  const push = Math.abs(sideways)

  if (push < TURN_OFF) {
    latch.held = false
    return 0
  }

  if (latch.held || push <= TURN_ON) return 0

  latch.held = true
  return sideways > 0 ? -TURN_STEP : TURN_STEP
}

/** What the walking stick is asking for, in the terms `moveRef` is written in. */
export interface Walk {
  forward: number
  strafe: number
}

/**
 * The walking stick, read into the scene's own axes.
 *
 * The y axis is the one worth a function: WebXR reports a stick pushed *away*
 * from you as -1, and every consumer in this scene treats forward as positive.
 * Inverting it at the edge means nothing downstream has to know that a headset
 * disagrees with the room about which way is forwards.
 */
export function walkFromStick(xAxis: number | undefined, yAxis: number | undefined): Walk {
  const away = pastDeadZone(yAxis)
  // Negating a zero gives a negative one, which behaves identically in every sum
  // it will ever be part of and is a different value to anything comparing them.
  // A stick at rest should read as the same nothing whichever way it was let go.
  return { forward: away === 0 ? 0 : -away, strafe: pastDeadZone(xAxis) }
}
