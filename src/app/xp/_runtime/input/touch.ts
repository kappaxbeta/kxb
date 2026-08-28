/**
 * A thumb on glass, turned into the same input a keyboard produces.
 *
 * §8.1 asks for "a mobile layout that is not a walk stick", and the phrase is
 * doing real work: a stick that only walks is a stick that cannot sprint, and a
 * platformer where you cannot sprint is a platformer whose gaps you cannot
 * clear. `ladder-run` is laid out against a *sprint* span of 8.23 cells. On a
 * phone it would be unfinishable.
 *
 * ---------------------------------------------------------------------------
 * The one thing that is specific to this runtime
 * ---------------------------------------------------------------------------
 * The stick produces `inputX`/`inputZ` - the *same* two numbers the arrow keys
 * produce - and hands them to the same basis. That is the whole design, and it
 * is not laziness: `_runtime/camera.ts` exists because a side-on level's forward
 * is a world axis rather than a look direction, and a touch path that computed
 * its own movement would reintroduce exactly the bug that file was written to
 * kill, on the devices least able to work around it.
 *
 * So there is no "touch movement". There is one movement, and two things that
 * can ask for it.
 *
 * ---------------------------------------------------------------------------
 * Sprint is depth, not a button - but it is depth *past the ring*
 * ---------------------------------------------------------------------------
 * The lounge's own note, and it is right: there is no shift key on a thumb.
 * Pushing the stick further is what "faster" means on a stick, and a separate
 * sprint button would be a second thing to hold with a hand that is already
 * holding the phone.
 *
 * What was wrong was *where* further starts. Sprint used to read the same
 * clamped 0..1 the walk does, so full deflection was a sprint - and full
 * deflection on a 52px ring is what an ordinary firm push already is, with any
 * thumb that slides past the rim pinned there. Every phone player was running
 * at `SPRINT_PACE` almost all of the time, which is the report: *moving too
 * fast on mobile*, and *fine on desktop*, where Shift is a thing you decide to
 * hold. The lounge never had it because its stick reports no sprint at all.
 *
 * So the walk now spends the whole ring - full deflection is exactly the pace
 * `W` gives on a keyboard - and sprint lives in the room past it, which is room
 * only a touchscreen has (a gamepad axis stops at 1; see `pushFrom`'s
 * threshold argument). A deliberate stretch beyond the drawn rim, with the ring
 * lighting up to say so, rather than something you fall into by walking
 * briskly.
 */

/** Where the thumb is, relative to the stick's centre. -1..1, screen axes. */
export interface Stick {
  x: number
  /** Screen down is positive, which is the opposite of forward. */
  y: number
  /**
   * How far out the thumb is, in ring radii, **unclamped**.
   *
   * `x`/`y` stop at the rim because a stick that reported more than full
   * deflection would walk faster than walking; this does not, because the room
   * past the rim is the only room a touchscreen has left to say something else
   * with. `pushFrom` spends it on sprint - see `SPRINT_REACH`.
   */
  reach: number
}

/** What the controller is being asked for, in the keyboard's own terms. */
export interface Push {
  /** -1 left .. 1 right, exactly as `A`/`D` produce. */
  inputX: number
  /** -1 back .. 1 forward, exactly as `S`/`W` produce. */
  inputZ: number
  sprint: boolean
}

/**
 * How much of the stick's travel is ignored.
 *
 * The lounge's number, and its reasoning: a thumb resting on the glass is never
 * exactly centred, and without this the player drifts slowly in whatever
 * direction they happened to put it down. Copied rather than re-derived, because
 * it has been through contact with players and this has not.
 */
export const DEAD_ZONE = 0.14

/**
 * How far out a *physical* stick has to be before it is a sprint.
 *
 * The default threshold, and the one a gamepad wants: an axis that stops at 1
 * has no room past its rim, so sprint has to live inside the travel. Near the
 * rim rather than halfway, because the whole range below it stays usable for
 * walking - lining up a jump is a slow, precise thing.
 *
 * A touchscreen uses `SPRINT_REACH` instead. See the note at the top.
 */
export const SPRINT_AT = 0.85

/**
 * And how far past the ring a *thumb* has to reach.
 *
 * 1.4 ring radii, which on the HUD's 52px stick is 73px - just about exactly
 * the rim of the ring that is drawn around it (`.hud-stick` is 144px across).
 * That is not a coincidence to leave undocumented: the number was picked so
 * that the visible ring means something, and moving one without the other
 * makes the affordance a lie. Full walking pace is reached at 52px, well
 * inside it, so the whole of the drawn ring is the walk.
 */
export const SPRINT_REACH = 1.4

/**
 * Where a sprint lets go again.
 *
 * Below the threshold it engaged at, so the two make a latch. Without the gap,
 * a thumb held at the rim crosses the line back and forth with every tremor and
 * the player flickers between 7 and 13 cells a second - which reads as the
 * frame rate stuttering rather than as a control doing what it was told.
 */
export const SPRINT_KEEP = 1.2

/** A stick nobody is touching. Its reach is zero, so it can never be a sprint. */
export const AT_REST: Stick = { x: 0, y: 0, reach: 0 }

/**
 * The stick, from a thumb's offset in pixels.
 *
 * Rescaled after the dead zone rather than merely clamped, so the dead zone
 * **costs no top speed** - it moves where the ramp starts, not where it ends. A
 * stick that lost its first 14% of travel would be a stick that never quite
 * reached a run.
 */
export function stickAt(dx: number, dy: number, radius: number): Stick {
  if (radius <= 0) return AT_REST

  const distance = Math.hypot(dx, dy)
  if (distance < 1e-6) return AT_REST

  /** Unclamped, and kept: it is the only thing that knows about past the rim. */
  const reach = distance / radius
  const pulled = Math.min(reach, 1)
  if (pulled <= DEAD_ZONE) return { x: 0, y: 0, reach }

  /**
   * Direction and magnitude, separately.
   *
   * The first draft scaled `dx / radius` by a ramp built from the *clamped*
   * distance - so a thumb dragged three ring-widths out reported 3 rather than
   * 1. The direction survived, because the controller normalises what it is
   * given; what did not survive was `sprint`, which reads the stick's depth and
   * would have latched on the moment a thumb left the ring and never let go.
   * A phone you cannot walk on, from a bug that a screenshot shows as a stick
   * sitting exactly where it should.
   */
  /**
   * Squared, so the first half of the throw is for aiming and the second is for
   * going somewhere.
   *
   * Linear was the first answer and it is the one that reads as twitchy: a
   * quarter of the way out is a quarter of full speed, which on a board game
   * means the smallest deliberate nudge already walks you off the square you
   * were lining up. The complaint - *the mobile control is a bit sensitive* -
   * is about the first few millimetres, not the top speed.
   *
   * A square curve keeps both ends honest. Full deflection is still exactly
   * full speed, so nothing is slower than it was; half a throw is a quarter of
   * it, so the room near the middle where a thumb actually lives is four times
   * finer. It is the curve every gamepad ships with, for the same reason.
   *
   * After the dead zone rather than before, or the curve would be applied to a
   * number that has already had a chunk taken out of its bottom and the flat
   * spot would come back as a soft one.
   */
  const magnitude = (pulled - DEAD_ZONE) / (1 - DEAD_ZONE)
  const eased = magnitude * magnitude
  return { x: (dx / distance) * eased, y: (dy / distance) * eased, reach }
}

/**
 * What the stick is asking the controller for.
 *
 * `inputZ` is negated because screen down is positive and forward is up - the
 * one axis flip in the whole path, and it lives here rather than in the
 * component so the component has nothing to get wrong.
 *
 * `sprintAt` is measured against the *reach*, so the caller says how far out
 * running is for its own hardware: a gamepad axis has nothing past 1 and keeps
 * `SPRINT_AT`, a thumb has the whole screen and is given `SPRINT_REACH` (and
 * `SPRINT_KEEP` while it is already running, which is what makes the pair a
 * latch rather than a line to jitter across).
 */
export function pushFrom(stick: Stick, sprintAt: number = SPRINT_AT): Push {
  return {
    inputX: stick.x,
    // `+ 0` normalises the negative zero `-0` that negating a centred stick
    // produces. It behaves identically in arithmetic and compares unequal to
    // `NO_PUSH`, which is the sort of thing that wastes an afternoon once.
    inputZ: -stick.y + 0,
    // The dead zone has the last word: a thumb resting an inch off centre is
    // reaching far enough to sprint and asking to go nowhere, and "sprinting on
    // the spot" is a state the walk cycle can be caught in.
    sprint: stick.reach >= sprintAt && (stick.x !== 0 || stick.y !== 0),
  }
}

/** Nothing held. What a released stick reports, and what a keyboard-only run uses. */
export const NO_PUSH: Push = { inputX: 0, inputZ: 0, sprint: false }
