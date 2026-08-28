/**
 * The one-hand control scheme: the stick drives like a car, not like a map.
 *
 * Shared by both hosts - the lounge's controller and the XP runtime's player -
 * which is why it lives here rather than beside either of them. The copy rule
 * keeps their *components* apart; this is arithmetic with unit tests, and two
 * copies of it would be two chances to disagree about which way "left" turns.
 *
 * ---------------------------------------------------------------------------
 * The model, in one line
 * ---------------------------------------------------------------------------
 * **X turns you, Y moves you.** Push the stick left and the player and the
 * camera rotate left, on the spot; push it forward and you walk along whatever
 * heading you are now facing. There is no strafe in this mode, because there is
 * no axis left to spend on one - and that is the point rather than a shortfall:
 * a thumb that has to both aim and advance cannot do them on two axes at once.
 *
 * A keyboard gets the same deal, which is what makes it one mode rather than
 * two: A and D turn in place, W and S drive.
 *
 * ---------------------------------------------------------------------------
 * What this replaced, and why it had to go
 * ---------------------------------------------------------------------------
 * The first version latched a world direction when the stick left neutral and
 * eased the camera toward it - "where you point is where you go". It read well
 * on paper and badly in the hand, for two reasons that are worth keeping
 * written down:
 *
 * - **It fed back into itself.** The camera moved toward a target derived from
 *   a basis that the camera's own movement kept re-deriving, so the approach
 *   never quite settled and the whole view shimmered. Reported as *it jitters*.
 * - **It froze the body.** The walk direction was the latched vector rather
 *   than the live heading, so the figure faced wherever the push started and
 *   stopped turning. Reported as *the figure is not rotating*.
 *
 * A turn rate has neither problem: nothing is chasing anything, so there is
 * nothing to oscillate, and the heading it produces is the only heading there
 * is.
 */

/**
 * How fast a fully deflected stick turns, in radians per second.
 *
 * A little over a half-turn a second at the rim, which is quick enough to spin
 * and face a thing behind you without feeling like the room is being yanked.
 * Analogue below full deflection - see `steerTurn` - so lining a shot up is a
 * gentle push rather than a tap-tap-tap.
 */
export const STEER_TURN_RATE = 2.6

/**
 * And how fast a held key turns.
 *
 * Its own number because a key has no deflection to be analogue about: it is
 * always "all the way", and all the way at the stick's rim rate overshoots
 * every time you try to line something up. Slightly under, which in practice is
 * the difference between steering and swinging.
 */
export const STEER_KEY_TURN_RATE = 2.0

/**
 * The turn this frame, in radians, from the sideways axis.
 *
 * Negative for a rightward push: three's yaw grows anticlockwise, and pushing
 * right means turning clockwise. That sign is the single most re-derivable
 * thing in this file and the single easiest to get backwards, so it lives here
 * once and both hosts read it rather than each writing a minus of their own.
 *
 * `inputX` is the raw axis: ±1 from a key, anywhere in between from a stick.
 * The rate is applied to it directly, so half a push is half a turn - the
 * stick's own square curve (see `stickAt` in the XP runtime's ./touch) has
 * already made the middle of the throw the fine end.
 */
export function steerTurn(inputX: number, dt: number, rate = STEER_TURN_RATE): number {
  return -inputX * rate * dt
}

/** The shortest way round: any angle, wrapped into (-π, π]. Used by the tests. */
export function wrapAngle(angle: number): number {
  const wrapped = angle % (2 * Math.PI)
  if (wrapped > Math.PI) return wrapped - 2 * Math.PI
  if (wrapped <= -Math.PI) return wrapped + 2 * Math.PI
  return wrapped
}

/**
 * The yaw whose forward is this flat direction, in three's convention: a yaw
 * of zero looks down -z, and forward for yaw θ is `(-sin θ, 0, -cos θ)`.
 */
export function yawOfForward(x: number, z: number): number {
  return Math.atan2(-x, -z)
}
