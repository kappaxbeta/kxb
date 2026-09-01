import {
  BALL_REST_SPEED,
  stepBall,
  strike,
  type Ball,
  type Striker,
} from '@/app/world/lounge/_sim/football'
import type { SolidTest } from '@/app/world/lounge/_sim/physics'

/**
 * A thing you can knock about, rather than one you walk into.
 *
 * ---------------------------------------------------------------------------
 * Why this borrows the football rather than growing a second physics
 * ---------------------------------------------------------------------------
 * Somebody summoned a ball out of the thingiverse, walked into it, and nothing
 * happened - which is exactly right for what a thing was: a drawing anchored to
 * a cell, with gravity added later so a crate would find the floor. Furniture.
 *
 * The room already had a ball, though, with a tested simulation behind it: an
 * owner who steps it, a contact model priced by closing speed, drag, bounce and
 * a rest threshold, all in `_sim/football.ts` and all argued out there. Writing
 * a second, gentler physics for "a thing you can kick" would give the product
 * two answers to "how does a ball roll", and the one nobody tuned would be the
 * one people meet first.
 *
 * So a knockable thing *is* the football's ball, minus the match: no goals, no
 * kickoff, no host election. This file is the seam - it says which things are
 * loose, turns the room's bodies into strikers, and answers the one question a
 * renderer cannot: has it stopped, and is it worth writing down.
 *
 * ---------------------------------------------------------------------------
 * What is deliberately not here
 * ---------------------------------------------------------------------------
 * The ball's radius is the football's, not the thing's. A summoned barrel is
 * kicked as though it were 0.4 across, and against a wall it stops a few
 * centimetres early or late. Sizing the collision to each blueprint means a
 * sphere-versus-voxel solve per thing per frame, and the visible half of the
 * difference - where it stops, how it rolls - is already right.
 */

/** Which things are loose, and which are furniture. */
export function knockable(spec: {
  body: unknown | null
  blocking: boolean
}): boolean {
  /*
    Falls *and* is not solid, which is the pair somebody already sets when they
    mean "a ball": gravity on says it is not bolted down, and blocking off says
    you do not stop dead against it. A crate with both on is furniture in a
    doorway and stays furniture - the whole point of it is that it does not move
    when somebody leans on the door.
  */
  return spec.body !== null && spec.body !== undefined && !spec.blocking
}

/** How far it has to have travelled before its new place is worth an event. */
export const WORTH_WRITING = 0.25

/**
 * One frame of being knocked about.
 *
 * Every body in the room is offered the ball in turn rather than only the
 * nearest, because two people can reach it in the same frame and the one who
 * misses out would see their own touch ignored. `strike` returns null for
 * everybody out of reach, which makes this cheap in the ordinary case.
 */
export function knocked(input: {
  ball: Ball
  bodies: readonly Striker[]
  delta: number
  isSolid: SolidTest
  floorY?: number
}): { ball: Ball; moving: boolean; touched: boolean } {
  let next = input.ball
  let touched = false

  for (const body of input.bodies) {
    const hit = strike(next, body)
    if (!hit) continue
    next = hit
    touched = true
  }

  next = stepBall({
    ball: next,
    delta: input.delta,
    isSolid: input.isSolid,
    floorY: input.floorY,
  })

  return { ball: next, moving: awake(next), touched }
}

/**
 * Whether it is still going.
 *
 * `stepBall` zeroes the horizontal pair and the vertical one separately once
 * they are under the rest threshold, so "moving" is a question about what came
 * back rather than a second threshold to keep in step with that one.
 */
export function awake(ball: Ball): boolean {
  return ball.vx !== 0 || ball.vy !== 0 || ball.vz !== 0
}

/**
 * Whether where it has come to rest is far enough from where it is written
 * down to be worth saying so.
 *
 * A quarter of a cell, which is well over the tenth the log quantises to. The
 * gap between the two is the whole point: a ball nudged by three centimetres
 * would otherwise round to a different tenth, and every idle touch would be an
 * event on the world's log and a message to everybody in the room.
 */
export function drifted(
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
): boolean {
  return Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z) >= WORTH_WRITING
}

/** Below this it is asleep. Re-exported so a renderer needs one import. */
export { BALL_REST_SPEED }
