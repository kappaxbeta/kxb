import type * as THREE from 'three'
import { EYE_HEIGHT } from '@/app/world/lounge/_sim/physics'
import { POSTURE, type Roamable, type Roam } from '@/domain/world/autonomy'

/**
 * Letting go of the controls.
 *
 * The same schedule the creatures follow, pointed at the player's own body -
 * which is the whole reason `autonomy.ts` takes a seed rather than owning one.
 * Nothing here is a second implementation of wandering; it is the first one,
 * driving a different position vector.
 *
 * Kept out of `roamers.tsx` because that file is a react-three-fiber component
 * and this is a function called from inside somebody else's frame loop. The
 * order it runs in matters - after the sitting-on-furniture handling, before the
 * camera is placed - and a component could not promise that.
 */

/**
 * How fast the body catches up to where the schedule says it is.
 *
 * Eased rather than assigned, and that is doing two jobs. Switching autopilot on
 * would otherwise teleport you to wherever the schedule had got to without you -
 * the schedule is a function of the clock, so it has been running all along -
 * and instead you walk there. And because `roamAt` is continuous, once the gap
 * has closed the easing tracks it near-exactly, so the rest of the time this
 * costs nothing.
 *
 * It also means the avatar's own gait works out for free: `Resident` picks its
 * clip from how far the body actually moved, so an eased catch-up walks and a
 * settled body stands still.
 */
export const CATCH_UP = 4

/** Which way a drifting body faces, and how far it has slumped. */
export interface Drift {
  yaw: number
  lean: number
}

/**
 * Move the player one frame along their own schedule.
 *
 * Mutates `player` and `out` in place, because it runs sixty times a second and
 * the frame loop must not make garbage - the same rule the rest of the world
 * folder plays by.
 *
 * No physics step and no collision test, deliberately. The route was already
 * pathed around the furniture and every perch is a square the room said was
 * free, so running it through the character controller as well would only add a
 * way for the two to disagree - and the way they disagree is a body wedged in a
 * doorway that the schedule insists is somewhere else.
 */
export function drift(
  roamer: { at: (now: number, room?: Roamable) => Roam },
  room: Roamable,
  player: THREE.Vector3,
  delta: number,
  out: Drift,
): void {
  /**
   * Epoch milliseconds, not `performance.now()`. Same clock as the creatures,
   * and the same reason: this position goes out over presence, so a visitor
   * watching you wander has to be able to agree about where you are.
   */
  const pose = roamer.at(Date.now(), room)
  const posture = POSTURE[pose.activity]

  const k = 1 - Math.exp(-CATCH_UP * delta)

  player.x += (pose.x - player.x) * k
  player.z += (pose.z - player.z) * k
  // The eye drops with the posture, so sitting down lowers the camera too
  // rather than leaving it floating where the head used to be.
  player.y += (EYE_HEIGHT - posture.drop - player.y) * k

  out.yaw = pose.yaw
  out.lean = posture.lean
}
