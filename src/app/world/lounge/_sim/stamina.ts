'use client'

/**
 * How long you can keep running.
 *
 * Off by default and switched on by whoever runs the space - see the `stamina`
 * capability. Off is what every world has always been: hold shift and go, for
 * as long as you like. On makes distance cost something, which is what turns a
 * course into a course and a chase into a chase.
 *
 * ---------------------------------------------------------------------------
 * Why it is a number and not a cooldown
 * ---------------------------------------------------------------------------
 * A cooldown says "you may sprint again in four seconds" and is unreadable in
 * the moment: you cannot spend it carefully, and the only way to learn it is to
 * be refused. A bar that drains and refills is the same rule made *legible* -
 * you can see a half a bar and decide to walk the next stretch, which is the
 * whole of what makes it a mechanic rather than an interruption.
 *
 * ---------------------------------------------------------------------------
 * The floor, which is the part that stops it being annoying
 * ---------------------------------------------------------------------------
 * Empty does not mean "cannot move". It means "cannot *sprint*", and walking is
 * untouched at every level - a world where running out of breath stopped you
 * dead would be a world where the switch is a punishment. And once empty, the
 * sprint stays locked until the bar has come back past `READY`, so it cannot be
 * feathered a tenth of a second at a time: an exhausted player takes a breath
 * rather than stuttering.
 */

/** A full bar, in seconds of sprinting. */
export const STAMINA_FULL = 6

/** How much a second of sprinting costs. One, by construction of the unit. */
export const STAMINA_DRAIN = 1

/**
 * How fast it comes back while you are not sprinting.
 *
 * Slower than it drains, so a chase has a shape: six seconds of running costs
 * about eight of walking. Faster than that and the bar is decoration; much
 * slower and the world is a walking simulator with a bar on it.
 */
export const STAMINA_REGEN = 0.75

/** How much has to be back before an exhausted player may sprint again. */
export const STAMINA_READY = 1.5

/**
 * Close enough to nothing to *be* nothing.
 *
 * Sixty subtractions of a sixtieth do not land on zero - they land on 4.6e-15,
 * which is a bar that is empty on screen, empty to anybody watching, and still
 * `> 0` to the check that decides whether you are winded. So the last hair is
 * snapped off, and "empty" becomes a state the arithmetic can actually reach.
 */
const NOTHING = 1e-6

export interface StaminaState {
  /** Seconds of sprint left, 0..`STAMINA_FULL`. */
  left: number
  /** Whether the sprint is locked out until `READY`. See the note above. */
  winded: boolean
}

export const FRESH: StaminaState = { left: STAMINA_FULL, winded: false }

/**
 * One frame of breathing.
 *
 * `wants` is whether the sprint is being *asked for* - the key held and moving
 * - rather than whether it is being granted, because a player leaning on shift
 * while stood still is not running and should not be paying for it.
 *
 * Returns the new state and whether the sprint is allowed this frame, so the
 * caller has one answer to act on rather than a number to interpret.
 */
export function stepStamina(
  state: StaminaState,
  wants: boolean,
  delta: number,
): { state: StaminaState; sprinting: boolean } {
  const sprinting = wants && !state.winded && state.left > 0

  const spent = sprinting
    ? Math.max(0, state.left - STAMINA_DRAIN * delta)
    : Math.min(STAMINA_FULL, state.left + STAMINA_REGEN * delta)
  const left = spent < NOTHING ? 0 : spent

  // Winded the moment it hits nothing, and only unwound once there is enough
  // back to be worth spending - which is what stops it being feathered.
  const winded = left <= 0 ? true : state.winded && left < STAMINA_READY

  return { state: { left, winded }, sprinting }
}
