/**
 * What a swing at arm's length lands on.
 *
 * ---------------------------------------------------------------------------
 * Why this is not a very short shot
 * ---------------------------------------------------------------------------
 * The obvious implementation is `castRay` with `range: 2`, and it is wrong in
 * the one way that matters: a ray is a line, and a fist is not aimed the way a
 * barrel is. Standing on somebody's toes with the crosshair over their shoulder
 * is a miss to a ray and a hit to everybody watching - and at two metres the
 * crosshair covers a hand's width of them, so that is most of the swings taken
 * while both people are moving. A melee that lands only when you are *pointing*
 * at somebody is a melee people stop pressing.
 *
 * So this is a **reach and an arc**: the nearest thing in front of you, inside
 * an arm's length, where "in front" is generous. What it keeps from the shot is
 * the part that has to agree with one - the wall test. A swing through a pillar
 * would be the same complaint as a bullet through one, and would be reported as
 * cheating rather than as a bug.
 *
 * ---------------------------------------------------------------------------
 * Distance to a box, not to its middle
 * ---------------------------------------------------------------------------
 * A person is a box a metre and a half tall, and their centre is at chest
 * height. Measuring to the centre makes a swing at somebody standing on a step
 * miss for being half a metre too far, when the two of you are touching. So the
 * distance is to the **nearest point of the box**, which is what "at arm's
 * length" means in the only sense a player can see.
 *
 * The arc is measured on the horizontal only, and that is deliberate: looking
 * at your own feet while somebody stands on them must not be a miss, and
 * nothing in this engine lets you stand *above* somebody close enough to reach
 * them anyway.
 */

import type { Box } from '../document/blueprints'
import type { EntityId } from './entities'
import type { SolidTest, Vec3 } from './physics'
import { castRay, type PersonTarget, type Target } from './shooting'

/**
 * How wide "in front of me" is, as the cosine of the half-angle.
 *
 * 0.35 is about seventy degrees either side - a swing that lands on anybody in
 * the front half of you, and refuses somebody behind your back. Written as a
 * cosine rather than as degrees because that is what the comparison needs and
 * converting per swing would be arithmetic in a hot path for no reader's
 * benefit; the degrees are in this sentence, which is where they help.
 */
export const SWING_COSINE = 0.35

/** How far an arm reaches when a document does not say. Two paces. */
export const DEFAULT_REACH = 2.4

/** What a swing connected with. One of the two fields is always null. */
export interface Swung {
  /** The entity, when it was one of ours. */
  id: EntityId | null
  /** Whose body it was, when it was somebody else's. Their id, not ours. */
  who?: string
  /** How far away it was, so a caller can prefer the nearer of two answers. */
  distance: number
}

export interface SwingOptions {
  /** The architecture, so a swing does not go through a wall. */
  isSolid?: SolidTest
  /** The entities worth hitting - `targetsOf`, the same set a shot uses. */
  targets?: readonly Target[]
  /** The other players, as boxes. A hit on one of these is a claim. */
  people?: readonly PersonTarget[]
  /** How far the arm reaches. */
  reach?: number
  /** Yourself and whatever you are holding. */
  ignore?: ReadonlySet<EntityId>
}

/**
 * The nearest thing within reach and roughly in front, or null.
 *
 * `from` is an **eye** and `facing` is where it is looking - the same pair a
 * shot is given, so a caller never has to hold two ideas of where a player is.
 * `facing` need not be normalised and its vertical component is ignored; see
 * the note at the top about looking at your feet.
 */
export function swungAt(
  from: Vec3,
  facing: Vec3,
  { isSolid, targets, people, reach = DEFAULT_REACH, ignore }: SwingOptions = {},
): Swung | null {
  const length = Math.hypot(facing.x, facing.z)
  // Straight up or straight down is not a direction to swing in. Returning
  // null beats dividing by it and calling everything in the room "in front".
  if (length < 1e-9) return null
  const ax = facing.x / length
  const az = facing.z / length

  let best: Swung | null = null
  let nearest = Infinity

  const consider = (box: Box, found: (distance: number) => Swung) => {
    const distance = boxReach(from, box)
    if (distance > reach || distance >= nearest) return
    if (!inFront(from, box, ax, az)) return
    if (blocked(from, box, distance, isSolid)) return
    nearest = distance
    best = found(distance)
  }

  for (const target of targets ?? []) {
    if (ignore?.has(target.id)) continue
    consider(target.box, (distance) => ({ id: target.id, distance }))
  }

  /**
   * People last, and it does not matter which order they are in: everything
   * here is compared by distance, so the answer cannot depend on which list was
   * walked first. The same property `castRay` keeps, and for the same reason.
   */
  for (const person of people ?? []) {
    consider(person.box, (distance) => ({ id: null, who: person.id, distance }))
  }

  return best
}

/**
 * How far the nearest point of a box is from a point.
 *
 * Zero when the point is inside it, which is a person you are standing in and
 * is a hit at any reach.
 */
export function boxReach(from: Vec3, box: Box): number {
  const dx = Math.max(box.minX - from.x, 0, from.x - box.maxX)
  const dy = Math.max(box.minY - from.y, 0, from.y - box.maxY)
  const dz = Math.max(box.minZ - from.z, 0, from.z - box.maxZ)
  return Math.hypot(dx, dy, dz)
}

/**
 * Is the middle of this box in the arc?
 *
 * The *middle* rather than the nearest point, and the difference is the whole
 * of what the arc is for: the nearest point of a box you are standing beside is
 * at your shoulder whichever way you turn, so measuring the angle to it would
 * make every close swing land regardless of where you were looking. Where the
 * thing *is* is its centre.
 */
function inFront(from: Vec3, box: Box, ax: number, az: number): boolean {
  const dx = (box.minX + box.maxX) / 2 - from.x
  const dz = (box.minZ + box.maxZ) / 2 - from.z
  const span = Math.hypot(dx, dz)
  // Standing inside it, horizontally. There is no direction to compare and
  // "behind me" is not a thing a body you are inside can be.
  if (span < 1e-6) return true
  return (dx / span) * ax + (dz / span) * az >= SWING_COSINE
}

/**
 * Is there a wall in the way?
 *
 * Asked with the same cast a shot uses, aimed at the middle of the box and cut
 * off at how far away it is, so the answer agrees with the one a bullet would
 * get. Only the architecture is handed over: entities and people are what we
 * are choosing *between* here, and a candidate that shielded another would make
 * the nearest-wins loop depend on the order it walked them in.
 */
function blocked(from: Vec3, box: Box, distance: number, isSolid?: SolidTest): boolean {
  if (!isSolid) return false
  const to = {
    x: (box.minX + box.maxX) / 2 - from.x,
    y: (box.minY + box.maxY) / 2 - from.y,
    z: (box.minZ + box.maxZ) / 2 - from.z,
  }
  const wall = castRay(from, to, { isSolid, range: distance })
  return wall !== null
}
