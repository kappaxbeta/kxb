/**
 * What a summoned thing is doing this frame.
 *
 * The rule half of the blueprint's `actions`, in `_sim` rather than beside the
 * renderer for the same reason the seats are: it is arithmetic and a latch, it
 * would be just as true written on paper, and both of the ways it can be
 * subtly wrong - a `touch` that fires every frame, a `vanish` that flickers on
 * the boundary - are invisible in a screenshot and obvious in a test.
 */

import type { ThingAction } from '@/domain/thingiverse/blueprint'

/**
 * How near "near" is, and how near "touch" is, in cells.
 *
 * Two rings rather than one, because the two words mean different things and a
 * single radius would make them the same trigger: `near` is a lamp that lights
 * as you approach and wants a couple of metres, `touch` is a thing you have
 * walked *into* and should not fire from across the room.
 *
 * Both are measured from the thing's cell rather than from its drawn surface,
 * exactly as `USE_REACH` is and for the same reason - a radius that depended on
 * how big the model happens to be would make an identical rule behave
 * differently on a bench and on a coin.
 */
export const NEAR = 2.5
export const TOUCH = 1.1

/**
 * How fast `spin` turns, in radians a second, and how far `bob` travels.
 *
 * Deliberately gentle and deliberately not authorable. Every knob added here is
 * a field in a panel somebody has to fill in before the thing does the obvious
 * thing, and the obvious thing is what these verbs are for: `spin` is "this is
 * a pickup", not "rotate at 4.2 rad/s". A thing that needs its own numbers is a
 * script, and a script is an XP.
 */
export const SPIN_RATE = 1.2
export const BOB_HEIGHT = 0.12
export const BOB_RATE = 2

/**
 * Which of a thing's actions are firing this frame.
 *
 * Pure, so the rule is testable without a canvas: `always` is always on, `near`
 * and `touch` are the two rings, and the latch is what stops `touch` firing
 * sixty times a second while somebody stands in a doorway.
 *
 * The latch re-arms when you leave the *near* ring rather than the touch one,
 * which is the deliberate hysteresis: re-arming at the same radius means a
 * body wobbling on the boundary re-triggers every few frames, and `vanish`
 * flickering is the failure that makes.
 */
export function firing(
  actions: readonly ThingAction[],
  distance: number,
  latched: boolean,
): { active: Set<ThingAction['deed']>; latched: boolean } {
  const active = new Set<ThingAction['deed']>()
  const touching = distance <= TOUCH

  for (const action of actions) {
    if (action.when === 'always') active.add(action.deed)
    if (action.when === 'near' && distance <= NEAR) active.add(action.deed)
    if (action.when === 'touch' && touching && !latched) active.add(action.deed)
  }

  return {
    active,
    latched: touching ? true : distance > NEAR ? false : latched,
  }
}
