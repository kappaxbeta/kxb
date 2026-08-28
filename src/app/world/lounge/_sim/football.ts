/**
 * The ball, and the two planes it has to go through.
 *
 * Pure functions over plain numbers, for the third time in this directory and
 * for the same reason `physics.ts` and `combat.ts` are: the parts worth getting
 * right - does this shot cross the line, does a charge send the ball further
 * than a walk, does it stop rolling eventually - are exactly the parts that are
 * miserable to check by hand with two browsers open and a ten-minute clock
 * running. Nothing here imports three.js.
 *
 * The one rule that shapes the rest: **the ball has a single author**. One
 * client on the channel steps it and tells everybody where it is, and - since it
 * already knows where every body in the room is standing - it also resolves every
 * contact, its own and everybody else's. So this file is written to be run by one
 * peer per frame, not by all of them, and the goal test is a question about a
 * swept segment rather than about where the ball is now.
 */

import { DASH_SPEED } from '@/app/world/lounge/_sim/combat'
import {
  EYE_HEIGHT,
  PLAYER_RADIUS,
  type SolidTest,
  type Vec3,
} from '@/app/world/lounge/_sim/physics'
import type { Goal, GoalTeam } from '@/domain/lounge/goal-events'

/**
 * What a goal *is* lives in @/domain/lounge/goal-events, because it is a durable
 * fact about a world that outlives any frame. Re-exported here so the scene, the
 * HUD and this file's own callers have one import for "the ball and the things
 * it goes through" rather than two.
 */
export type { Goal, GoalTeam }
export {
  DEFAULT_GOAL_HEIGHT,
  DEFAULT_GOAL_WIDTH,
  GOAL_TEAMS,
  MAX_GOAL_SIZE,
  MIN_GOAL_SIZE,
} from '@/domain/lounge/goal-events'

/**
 * How big the ball is, in blocks.
 *
 * Just under half a cell, so it fits through a one-block gap for the same reason
 * the player does - and so a goal one cell wide is a goal a ball can actually
 * pass through rather than a decoration.
 */
export const BALL_RADIUS = 0.4

/** Matches the player's gravity. A world with two gravities reads as a bug. */
export const BALL_GRAVITY = 26

/**
 * How much speed survives a bounce, per axis.
 *
 * Well under half. A livelier ball is more fun for about a minute and then
 * spends the rest of the match on the roof of the arena: the worlds people build
 * are small and walled, and every wall is a trampoline at high restitution.
 */
export const BALL_BOUNCE = 0.42

/**
 * Rolling drag, as a fraction of speed shed per second.
 *
 * Applied continuously rather than only while touching the ground. A ball that
 * kept its speed in the air would sail the length of the world off one dash, and
 * "the ball is somewhere behind the goal again" is the failure mode that ends
 * football matches early.
 */
export const BALL_DRAG = 1.9

/** Ceiling on ball speed, so a pile-up of impulses cannot fire it into orbit. */
export const BALL_MAX_SPEED = 34

/**
 * Below this, the ball is standing still.
 *
 * Without a rest threshold a grounded ball jitters forever on the last
 * fractional millimetre of bounce, which is visible as a permanent shiver and
 * costs a packet every frame because the position never stops changing.
 */
export const BALL_REST_SPEED = 0.35

/**
 * How much faster than your approach the ball leaves a contact.
 *
 * This one number is the difference between the old model and this one. A touch
 * used to *set* the ball to a fixed speed, so a creeping nudge and a sprint both
 * fired it off identically and dribbling felt like fouling a pinball. Now the
 * outgoing speed is your closing speed times this, so the ball moves how you
 * moved: walk into it and it rolls a stride ahead, sprint and it runs, dash and
 * it is simply gone - a dash covers 26 blocks a second, and 26 times this is
 * already past the ball's speed cap. The dash needs no special case, which is
 * why there is no longer a constant for it.
 *
 * Above 1 on purpose: the ball has to leave faster than you arrive or you run
 * straight over it and the same contact fires every frame.
 */
export const PUSH_TRANSFER = 1.7

/**
 * The slowest a real touch sends the ball, in blocks per second.
 *
 * A floor under the proportional rule, because feet-first realism has a bad
 * case: approach at a crawl and `crawl x 1.7` is a ball that trickles four
 * centimetres and stops, which reads as the touch not registering. Anything slow
 * enough to be under this floor still moves the ball a visible step.
 */
export const MIN_DRIBBLE_SPEED = 2.5

/**
 * Body speed below which a contact does not count as a kick at all.
 *
 * Standing next to the ball while the interpolation breathes a millimetre per
 * frame must not tap it across the pitch. Below this the contact still
 * *separates* - you cannot stand inside the ball - it just imparts nothing.
 */
export const MIN_APPROACH = 0.4

/**
 * How far the outgoing direction is bent toward the direction you are running.
 *
 * The raw contact normal points from your body to the ball, and for a moving
 * player that is frequently sideways or backwards - catch the ball off-centre at
 * a run and a pure normal squirts it out behind you, which is the single most
 * infuriating thing a dribble can do. Blending the normal toward your travel
 * heading, weighted by this, means a running touch carries the ball *ahead* of
 * you: the faster you move, the more the contact behaves like your momentum and
 * the less like billiards. Zero would be pure geometry; one would ignore where
 * on your body the ball actually touched.
 */
export const DRIBBLE_STEER = 0.8

/**
 * A push lifts the ball a little as well as sending it along.
 *
 * A purely horizontal game of football is a game played entirely on the floor,
 * where every goal is a ground shot and the height of the goal never matters. A
 * small fraction of the push going upward is what makes the plane's height worth
 * setting. Capped, because the lift scales with the hit and an uncapped dash
 * would loft the ball clean over a default goal.
 */
export const PUSH_LIFT = 0.25
export const PUSH_LIFT_MAX = 5.5

/** Seconds between a goal and the restart, so people can get back in position. */
export const KICKOFF_PAUSE = 10

/** How high above the ground the ball is placed for a kickoff. */
export const KICKOFF_HEIGHT = 1.2

/**
 * How long the ball has to sit still before the room is offered it back.
 *
 * The one failure this simulation cannot resolve on its own: the ball ends up
 * somewhere nobody can reach it - walled in by something built mid-match, on a
 * roof, at the bottom of a pit, wedged in the seam between two blocks - and the
 * match is over without anybody saying so. No test can tell that apart from a
 * ball people are simply not chasing, and it does not have to: this only decides
 * whether to *offer* the button. Pressing it is somebody looking at the pitch
 * and confirming what the clock suspects.
 *
 * Seven seconds because a genuinely loose ball rarely goes that long untouched
 * with people playing, and because a button that appears every time play pauses
 * for a moment is a button people stop reading.
 */
export const BALL_STUCK_MS = 7000

/**
 * How far the ball may drift and still count as not having moved.
 *
 * Half a block, so a ball creeping down a shallow slope or shivering on the last
 * fraction of a bounce still reads as stuck - `BALL_REST_SPEED` puts most balls
 * properly to sleep, but a ball resting *inside* geometry is pushed a
 * millimetre a frame by the axis resolution and never sleeps at all.
 */
export const BALL_STUCK_DRIFT = 0.5

/**
 * The pause after somebody asks for the ball back.
 *
 * Much shorter than `KICKOFF_PAUSE`. That one follows a goal, when everybody has
 * scattered and has to walk back; this one follows a ball nobody could reach, so
 * the players are already standing around wondering what happened. Long enough
 * that whoever was next to the centre spot cannot tap it in before the others
 * have looked up, and no longer.
 */
export const STUCK_RESET_PAUSE = 3

export interface Ball {
  /** Centre of the ball, not its underside. */
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
}

/** A ball sitting still at a spot. */
export function ballAt(spot: { x: number; y: number; z: number }): Ball {
  return { x: spot.x, y: spot.y, z: spot.z, vx: 0, vy: 0, vz: 0 }
}

/**
 * What a client remembers about a ball that has stopped going anywhere.
 *
 * Where it was when it stopped and when that was, rather than a countdown to
 * tick down: the check runs on a frame loop whose step varies, and a position
 * plus a timestamp needs no accumulator to be right after a slow frame.
 */
export interface StuckWatch {
  /** Where the ball was when this watch started, or null when there is none. */
  at: Vec3 | null
  /** `performance.now()` when it got there. */
  since: number
  /** Whether it has been there long enough to be worth offering the button. */
  stuck: boolean
}

/** A watch that has seen nothing yet. */
export function noStuckWatch(): StuckWatch {
  return { at: null, since: 0, stuck: false }
}

/**
 * Has the ball gone anywhere?
 *
 * Run by *every* client, not only the one stepping the ball, and that is the
 * point: the owner and a spectator see the same published position, so they
 * reach the same answer, and the button is offered to whoever is looking at the
 * pitch rather than to whichever tab happened to win the election.
 *
 * Returns a new watch rather than mutating one, like `stepBall` above and for
 * the same reason - the interesting behaviour is a sequence of frames, and a
 * function that hands back the next state is one a test can drive by hand.
 *
 * `playing` is the whole of the "is this a stuck ball or a stopped match"
 * question: false before kickoff, during the pause after a goal and after the
 * final whistle, all of which are moments a still ball is exactly right.
 */
export function watchStuck(
  watch: StuckWatch,
  ball: Ball | null,
  playing: boolean,
  now: number,
): StuckWatch {
  if (!ball || !playing) return watch.at === null && !watch.stuck ? watch : noStuckWatch()

  const moved =
    watch.at === null ||
    Math.hypot(ball.x - watch.at.x, ball.y - watch.at.y, ball.z - watch.at.z) >
      BALL_STUCK_DRIFT

  if (moved) return { at: { x: ball.x, y: ball.y, z: ball.z }, since: now, stuck: false }

  const stuck = now - watch.since >= BALL_STUCK_MS
  // The same object back while nothing changes, so a frame loop that runs this
  // sixty times a second allocates nothing for the ninety-nine percent of
  // frames where the answer is the one it already had.
  return stuck === watch.stuck ? watch : { ...watch, stuck }
}

/**
 * Who gets the point for a ball that went through this goal.
 *
 * The football convention: a goal belongs to the side that *defends* it, so
 * putting the ball through the red goal is a point for blue. One function rather
 * than the rule being spelled out at the scoreboard, the reporter and the win
 * condition - if this should ever be the other way round, it is this line.
 */
export function scoringSide(goal: Goal): GoalTeam {
  return goal.kind === 'red' ? 'blue' : 'red'
}

/**
 * The goals, out of everything standing in this world.
 *
 * A world holds marks now, not only goals - a race's start and finish stand on
 * the same lattice and come out of the same query - and nothing in this file
 * should be asked whether the ball crossed a start line. Filtered once here and
 * handed on, rather than each of the callers below remembering to check.
 */
export function scoringGoals(goals: readonly Goal[]): Goal[] {
  return goals.filter((goal) => goal.kind === 'red' || goal.kind === 'blue')
}

/** Which axis the ball travels along to cross this goal. */
function normalAxis(goal: Goal): 'x' | 'z' {
  return goal.facing % 2 === 0 ? 'z' : 'x'
}

/** Where the rectangle sits, in world units. */
function goalBounds(goal: Goal) {
  const axis = normalAxis(goal)
  // The middle of the cell rather than its edge, so a goal placed on a cell
  // straddles that cell instead of sitting on the seam between two.
  const plane = (axis === 'z' ? goal.z : goal.x) + 0.5
  const acrossCentre = (axis === 'z' ? goal.x : goal.z) + 0.5

  return {
    axis,
    plane,
    minAcross: acrossCentre - goal.width / 2,
    maxAcross: acrossCentre + goal.width / 2,
    minY: goal.y,
    maxY: goal.y + goal.height,
  }
}

/** The middle of the mouth of the goal, for drawing and for aiming. */
export function goalCentre(goal: Goal): Vec3 {
  const { axis, plane, minAcross, maxAcross, minY, maxY } = goalBounds(goal)
  const across = (minAcross + maxAcross) / 2
  const y = (minY + maxY) / 2
  return axis === 'z' ? { x: across, y, z: plane } : { x: plane, y, z: across }
}

/**
 * Did the ball cross this goal on its way from `from` to `to`?
 *
 * Swept, for the same reason `dashConnects` is: the ball travels up to 34 blocks
 * a second, and on a frame that ran long - or on the 20fps floor the simulation
 * clamps to - that is more than a block in one step. A test that asked "is the
 * ball inside the goal right now" would miss every hard shot, and would miss it
 * more often the worse the frame rate got. A goal that did not count is the one
 * bug a football match cannot survive.
 *
 * The ball's *centre* has to cross, with no allowance for its radius. Widening
 * the rectangle by a radius would mean a ball that visibly clipped the post and
 * bounced away scored anyway, which is the wrong error to make: a shot that hit
 * the woodwork and stayed out is a thing people cheer, and one that hit the
 * woodwork and counted is a thing they file a bug about.
 *
 * Direction-agnostic. Walking the ball in from behind the plane still scores,
 * because the alternative is explaining to somebody why the goal they just
 * scored did not count.
 */
export function goalCrossed(from: Vec3, to: Vec3, goal: Goal): boolean {
  const { axis, plane, minAcross, maxAcross, minY, maxY } = goalBounds(goal)

  const a = axis === 'z' ? from.z : from.x
  const b = axis === 'z' ? to.z : to.x

  // Never approached the plane's depth this frame. Note a ball resting exactly
  // on the plane does not re-score every frame: with a === b there is no
  // crossing, which is what the strict inequality below buys.
  if (a === b) return false
  if ((a < plane && b < plane) || (a > plane && b > plane)) return false

  // Where along the frame's travel the plane was met.
  const t = (plane - a) / (b - a)
  if (t < 0 || t > 1) return false

  const across =
    axis === 'z' ? from.x + (to.x - from.x) * t : from.z + (to.z - from.z) * t
  const y = from.y + (to.y - from.y) * t

  return across >= minAcross && across <= maxAcross && y >= minY && y <= maxY
}

/**
 * Where the ball starts, and restarts.
 *
 * Halfway between the two goals, which is what makes a kickoff fair without
 * anybody having to place a centre spot: the arena's own geometry already says
 * where the middle is. Falls back to the origin when the world has no goals in
 * it yet, so a football match in an unprepared world still has a ball to look at
 * rather than crashing on an empty array.
 */
export function kickoffSpot(goals: readonly Goal[], floorY = 0): Vec3 {
  if (goals.length === 0) return { x: 0.5, y: floorY + KICKOFF_HEIGHT, z: 0.5 }

  let x = 0
  let z = 0
  for (const goal of goals) {
    const centre = goalCentre(goal)
    x += centre.x
    z += centre.z
  }

  return {
    x: x / goals.length,
    y: floorY + KICKOFF_HEIGHT,
    z: z / goals.length,
  }
}

/**
 * Are there two sides' worth of goal in this world?
 *
 * A match cannot be played into one goal, and the scene has to be able to say so
 * before the clock starts rather than after somebody has waited out a kickoff.
 */
export function goalsReady(goals: readonly Goal[]): boolean {
  return (
    goals.some((goal) => goal.kind === 'red') && goals.some((goal) => goal.kind === 'blue')
  )
}

export interface BallStepInput {
  ball: Ball
  delta: number
  isSolid: SolidTest
  /** The plane the world stands on, as in `physics.ts`. */
  floorY?: number
}

/**
 * Does a ball centred here overlap a solid cell?
 *
 * Treated as a box rather than a sphere. At this radius the difference is a
 * corner case in the literal sense - a ball approaching the exact corner of a
 * block bounces a few centimetres earlier than a true sphere would - and nobody
 * watching a football match can see it, while sphere-versus-voxel needs a
 * nearest-point solve per cell and a normal to reflect about.
 *
 * The half-open ranges are the same trick `collides` in physics.ts uses, for the
 * same reason: a block at cell 3 fills [3, 4), so a ball whose box ends at
 * exactly 4.0 is not touching it, and `Math.floor` on the boundary would invent
 * a wall along every seam.
 */
function ballHits(x: number, y: number, z: number, isSolid: SolidTest): boolean {
  const minX = Math.floor(x - BALL_RADIUS)
  const maxX = Math.ceil(x + BALL_RADIUS) - 1
  const minY = Math.floor(y - BALL_RADIUS)
  const maxY = Math.ceil(y + BALL_RADIUS) - 1
  const minZ = Math.floor(z - BALL_RADIUS)
  const maxZ = Math.ceil(z + BALL_RADIUS) - 1

  for (let cx = minX; cx <= maxX; cx++) {
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cz = minZ; cz <= maxZ; cz++) {
        if (isSolid(cx, cy, cz)) return true
      }
    }
  }
  return false
}

/**
 * Advance the ball by one frame.
 *
 * One axis at a time, like the character controller, and for the same reason:
 * three independent one-dimensional problems have an obvious answer each, where
 * resolving a diagonal collision properly needs a contact normal this has no way
 * to compute. The visible consequence is the right one - a ball driven into a
 * corner reflects off whichever wall it actually reached first rather than
 * sticking.
 *
 * Returns a new ball rather than mutating, so the owner can step it
 * speculatively and, more to the point, so `goalCrossed` can be handed the
 * before and after of the same frame.
 */
export function stepBall(input: BallStepInput): Ball {
  const { ball, delta, isSolid, floorY = 0 } = input

  let { x, y, z, vx, vy, vz } = ball

  vy -= BALL_GRAVITY * delta

  // Drag as exponential decay rather than a subtraction, so it is
  // framerate-independent and can never push a slow ball backwards.
  const keep = Math.exp(-BALL_DRAG * delta)
  vx *= keep
  vz *= keep

  // --- horizontal, one axis at a time ---------------------------------------
  const nextX = x + vx * delta
  if (ballHits(nextX, y, z, isSolid)) vx = -vx * BALL_BOUNCE
  else x = nextX

  const nextZ = z + vz * delta
  if (ballHits(x, y, nextZ, isSolid)) vz = -vz * BALL_BOUNCE
  else z = nextZ

  // --- vertical -------------------------------------------------------------
  const nextY = y + vy * delta
  if (ballHits(x, nextY, z, isSolid)) {
    if (vy < 0) {
      /**
       * Landed. Snapped to the top of the block it came down on rather than
       * having the move refused, the same as the player's landing: at speed a
       * frame covers most of a cell, and reverting would leave the ball resting
       * wherever the frame boundary happened to fall - a gap that changes with
       * the frame rate.
       */
      y = Math.floor(nextY - BALL_RADIUS) + 1 + BALL_RADIUS
    }
    vy = -vy * BALL_BOUNCE
  } else {
    y = nextY
  }

  // --- the world's floor ----------------------------------------------------
  if (y - BALL_RADIUS < floorY) {
    y = floorY + BALL_RADIUS
    vy = -vy * BALL_BOUNCE
  }

  /**
   * Put a nearly-stopped ball properly to sleep.
   *
   * Vertical first and on its own: a ball rolling along the floor has a tiny
   * downward velocity every frame from gravity, and a combined speed test would
   * therefore never let a *moving* ball settle - it would keep the shiver in the
   * bounce forever while the roll looked fine.
   */
  if (Math.abs(vy) < BALL_REST_SPEED && y - BALL_RADIUS <= floorY + 1e-6) vy = 0
  if (Math.hypot(vx, vz) < BALL_REST_SPEED) {
    vx = 0
    vz = 0
  }

  return clampBall({ x, y, z, vx, vy, vz })
}

/** Hold the ball's speed under the ceiling, preserving its heading. */
function clampBall(ball: Ball): Ball {
  const speed = Math.hypot(ball.vx, ball.vy, ball.vz)
  if (speed <= BALL_MAX_SPEED) return ball

  const scale = BALL_MAX_SPEED / speed
  return {
    ...ball,
    vx: ball.vx * scale,
    vy: ball.vy * scale,
    vz: ball.vz * scale,
  }
}

/**
 * How far from the ball's centre a body has to be to be touching it.
 *
 * Both radii, since both are boxes standing next to each other, plus generous
 * slack - well past what the geometry strictly says. Two reasons, one technical
 * and one about feel. The technical one: every body but the owner's own is
 * played at an interpolated position up to a packet out of date, so a reach
 * tuned to the exact geometry would drop touches that visibly connected - the
 * same trade `DASH_HIT_RADIUS` already makes. The feel one: the animals are
 * drawn wider than their physics box, and a ball that slips past a visible paw
 * untouched reads as the game ignoring you. Reaching a little further than the
 * box is how the *drawn* body becomes the thing that plays.
 *
 * Note this is only where a touch *registers*. The hard can't-stand-inside-it
 * separation is `CONTACT_DISTANCE`, which stays at the true radii - widening
 * that one would hold the ball visibly at arm's length from everybody.
 */
export const PUSH_REACH = PLAYER_RADIUS + BALL_RADIUS + 0.6

/**
 * How far above and below the ball a body counts as being in contact.
 *
 * Measured from the ball's centre to the body's vertical span, so somebody
 * standing on a ledge above the ball cannot nudge it along the floor.
 */
export const PUSH_HEIGHT = 1.1

/**
 * The two bodies may not stand inside each other. Both radii, exactly - the
 * slack in `PUSH_REACH` is for *kicks* against stale positions, but resolving
 * overlap against the generous radius would hold the ball visibly at arm's
 * length from everybody.
 */
export const CONTACT_DISTANCE = PLAYER_RADIUS + BALL_RADIUS

/**
 * A body moving through the world, as the contact model sees it.
 *
 * `position` is an eye position, as everything that comes out of the scene and
 * off the wire is; feet are `EYE_HEIGHT` below it. The velocity is horizontal
 * only - a falling body does not stamp the ball into the ground - and it is what
 * the whole model turns on: this is a *body with momentum*, not a button that
 * fires the ball at a preset speed. There is deliberately no `dashing` flag any
 * more; a dash simply is a body moving at 26 blocks a second, and the
 * proportional rule below turns that into a shot without being told.
 */
export interface Striker {
  position: Vec3
  /** Blocks per second, horizontal. */
  vx: number
  vz: number
}

/**
 * Shortest frame that may be used as a divisor, in seconds.
 *
 * A guard against dividing by zero, not a clamp with any physical meaning: two
 * frames can carry the same timestamp, and 240fps is comfortably below anything
 * a browser will actually deliver.
 */
const MIN_STRIDE_DELTA = 1 / 240

/**
 * The velocity a body's movement implies.
 *
 * Nobody puts a velocity on the wire, and neither the local controller nor the
 * interpolated transform map stores one - so the ball's owner differences each
 * body's position against last frame's to get it. That needs no cooperation from
 * anybody, which is the point: a dashing peer shows up as a body doing
 * `DASH_SPEED` without having to announce it.
 *
 * Two things this must get right, both of which were bugs first:
 *
 *   * **`elapsed` is real time, never a clamped physics step.** The step is
 *     clamped so a long frame cannot tunnel the ball through a wall, but the
 *     displacement being differenced here accrued over the *actual* elapsed
 *     time. Dividing a long frame's travel by a short step invents speed nobody
 *     travelled at - a 200ms hitch turns a walking peer into a body doing 20
 *     blocks a second, which fires the ball off the pitch.
 *
 *   * **The result is capped at `DASH_SPEED`.** Past that, the number did not
 *     come from anybody running: it came from an interpolation snap after a
 *     hang. Capped rather than discarded, because a body that really was moving
 *     fast should still strike the ball - just not at an impossible speed.
 *
 * `from` being undefined is the first frame this body has been seen, which has
 * no stride to difference: it stands still for one frame rather than inheriting
 * a garbage velocity from the origin.
 */
export function bodyVelocity(
  from: { x: number; z: number } | undefined,
  to: { x: number; z: number },
  elapsed: number,
): { vx: number; vz: number } {
  if (!from) return { vx: 0, vz: 0 }

  const seconds = Math.max(elapsed, MIN_STRIDE_DELTA)
  const vx = (to.x - from.x) / seconds
  const vz = (to.z - from.z) / seconds

  const speed = Math.hypot(vx, vz)
  if (speed <= DASH_SPEED) return { vx, vz }

  const scale = DASH_SPEED / speed
  return { vx: vx * scale, vz: vz * scale }
}

/**
 * Resolve one body's contact with the ball, or null when nothing changed.
 *
 * This replaced a fixed-speed impulse, and the difference is the whole feel of
 * the game. Three rules, in the order they are applied:
 *
 *   1. **Speed in, speed out.** The ball leaves at your closing speed times
 *      `PUSH_TRANSFER` (floored at `MIN_DRIBBLE_SPEED`), along a direction bent
 *      toward your travel heading by `DRIBBLE_STEER` - so a running touch
 *      carries the ball ahead of you instead of squirting it out sideways or,
 *      worse, behind. Only the normal component of the ball's velocity is
 *      replaced; the tangent survives, so brushing a rolling ball deflects it
 *      rather than resetting it.
 *
 *   2. **Never against a retreating ball.** A push happens only while you are
 *      actually closing on the ball faster than it is escaping. Chasing your own
 *      shot cannot slow it down, and running away from the ball never drags it
 *      after you.
 *
 *   3. **No standing inside it.** Overlap inside `CONTACT_DISTANCE` is resolved
 *      positionally, push or no push - which is what makes slow dribbling work
 *      at all: the ball rides just ahead of your box off repeated gentle
 *      contacts instead of being kicked out of overlap by a fixed-speed impulse
 *      every few frames.
 *
 * A *velocity* is set rather than added, for the reason the old model already
 * had: the same contact resolved twice sends the ball at the same speed, not
 * twice as fast, and stale positions therefore cannot compound.
 */
export function strike(ball: Ball, striker: Striker): Ball | null {
  const dx = ball.x - striker.position.x
  const dz = ball.z - striker.position.z
  const distance = Math.hypot(dx, dz)
  if (distance > PUSH_REACH) return null

  const feet = striker.position.y - EYE_HEIGHT
  // Contact anywhere along the body: the ball may be at the knees or overhead.
  if (ball.y < feet - PUSH_HEIGHT || ball.y > striker.position.y + PUSH_HEIGHT) {
    return null
  }

  /**
   * Standing exactly on top of it has no direction to push along.
   *
   * Popped straight up rather than along an arbitrary axis, which is both the
   * honest answer - the only unambiguous direction available - and the one that
   * resolves itself: the ball comes down somewhere marginally off-centre and
   * the next contact has a heading again.
   */
  if (distance < 1e-6) {
    return clampBall({ ...ball, vy: Math.max(ball.vy, MIN_DRIBBLE_SPEED) })
  }

  const nx = dx / distance
  const nz = dz / distance

  const bodySpeed = Math.hypot(striker.vx, striker.vz)
  /** How fast the body is closing along the contact normal. */
  const approach = striker.vx * nx + striker.vz * nz
  /** The ball's own speed along that same normal - its escape. */
  const escape = ball.vx * nx + ball.vz * nz

  let next = ball

  if (approach > MIN_APPROACH && approach > escape) {
    /**
     * The outgoing direction: the contact normal, bent toward where the body is
     * actually going.
     *
     * A pure normal is honest geometry and terrible dribbling - clip the ball
     * off-centre at a run and it exits through the side of your box, behind you
     * as often as not. The blend keeps glancing contacts glancing while making a
     * committed run mean "that way".
     */
    const tx = striker.vx / bodySpeed
    const tz = striker.vz / bodySpeed
    let ox = nx + tx * DRIBBLE_STEER
    let oz = nz + tz * DRIBBLE_STEER
    const outLength = Math.hypot(ox, oz)
    // Degenerate only if the steer exactly cancels the normal, which needs the
    // body to be running dead away - excluded above, but guarded all the same.
    if (outLength < 1e-6) {
      ox = nx
      oz = nz
    } else {
      ox /= outLength
      oz /= outLength
    }

    const out = Math.max(MIN_DRIBBLE_SPEED, approach * PUSH_TRANSFER)

    // Replace the normal component, keep the tangent - see rule 1.
    const tangentX = ball.vx - escape * nx
    const tangentZ = ball.vz - escape * nz

    next = {
      ...ball,
      vx: tangentX + ox * out,
      vz: tangentZ + oz * out,
      // Kept if the ball is already rising faster, so heading a dropping ball
      // cannot flatten a shot that was already climbing.
      vy: Math.max(ball.vy, Math.min(out * PUSH_LIFT, PUSH_LIFT_MAX)),
    }
  }

  /**
   * Separation, whether or not anything was kicked.
   *
   * Resolved by moving the *ball* rather than the body - the body belongs to a
   * player's own controller (or another client entirely), and the ball is the
   * one thing this simulation owns. The same asymmetry `separate()` in
   * physics.ts resolves the other way round, for the same reason.
   */
  if (distance < CONTACT_DISTANCE) {
    next = {
      ...next,
      x: striker.position.x + nx * CONTACT_DISTANCE,
      z: striker.position.z + nz * CONTACT_DISTANCE,
    }
  }

  if (next === ball) return null
  return clampBall(next)
}

/**
 * How much of the drawn ball's speed a packet has to be carrying, along the
 * direction the drawn ball is going, to count as describing the same journey.
 *
 * Half, which is loose on purpose. Two clients never arrive at one ball: the
 * owner resolves the same contact against its own interpolated copy of a body,
 * so its answer is the same kick from a slightly different spot, a fraction of a
 * second later and a little of it already shed to drag. Asking for agreement to
 * any better precision than "yes, the ball is going that way now" would be
 * asking the two of them to be one client.
 */
export const BALL_ACK_SHARE = 0.5

/**
 * Are the drawn ball and the ball on the wire on the same journey?
 *
 * The question that decides everything about how a difference between them is
 * resolved, because there are two completely different kinds of difference and
 * they want opposite treatment. Going the same way, the gap between them is
 * *phase*: the same roll, one of the two ahead of the other in time, which is
 * exactly what a prediction is - it is ahead. Going different ways, the gap is
 * disagreement, and no amount of easing will turn one into the other.
 *
 * False for a drawn ball that is barely moving. A prediction of a ball at rest
 * claims nothing about a journey, so a wire ball far away from it is not our lead
 * over the owner - it is the owner knowing something we do not.
 */
export function ballAgrees(drawn: Ball, wire: Ball): boolean {
  const speed = Math.hypot(drawn.vx, drawn.vz)
  if (speed < BALL_REST_SPEED) return false

  const along = (wire.vx * drawn.vx + wire.vz * drawn.vz) / speed
  return along >= speed * BALL_ACK_SHARE
}

/**
 * Has the owner acted on a touch we resolved for ourselves?
 *
 * The one question a predicted touch needs answered, because every packet that
 * arrives in the meantime describes a ball nobody has kicked yet - and a client
 * that believed them would take its own kick back for a round trip and then have
 * it handed to it again, which is the jitter people describe as the ball fighting
 * them. So a touch of our own is held for a moment, and this ends the holding:
 * the instant a packet agrees the ball is going the way we said, there is nothing
 * left to protect and the wire is better than we are.
 *
 * A drawn ball that has stopped is settled by definition - it is only a
 * *prediction* while it claims the ball is travelling and the owner does not.
 */
export function ballAcked(drawn: Ball, wire: Ball): boolean {
  return Math.hypot(drawn.vx, drawn.vz) < BALL_REST_SPEED || ballAgrees(drawn, wire)
}

/**
 * How fast a client that is not stepping the ball closes the gap between the
 * ball it is drawing and the ball it was last told about.
 *
 * The same exponential ease the bodies are interpolated with, at deliberately
 * the same rate: the centimetres an extrapolation is out by are gone within a
 * couple of frames, so a correction never has time to read as the ball being
 * dragged somewhere. Slower and the drawn ball trails the real one around the
 * pitch and arrives at every tackle late; faster and each packet lands as a
 * visible twitch, which is the staircase this exists to get rid of. What happens
 * to an error too big for that is `BALL_CATCHUP`'s business.
 */
export const BALL_RECONCILE = 11

/**
 * The most of that gap that may be paid back per second, in blocks.
 *
 * A ceiling on the ease above, and the difference between a correction and a
 * yank. The rate on its own is fine for the small errors an extrapolation makes,
 * and catastrophic for the big one a *predicted touch* makes: your own kick
 * happens a round trip before the owner's version of it, so for those few frames
 * the drawn ball is a couple of blocks ahead of the wire - and paying that back
 * at rate 11 is thirty blocks a second of correction, which draws the ball
 * hurling itself backwards out of your foot. Capped, the same error resolves as
 * the ball rolling a little slower than it should for a moment, which is not a
 * thing anybody can see.
 *
 * Six is a brisk walk: fast enough that an ordinary error is gone in a couple of
 * frames, slow enough that it can never overpower a ball that is genuinely
 * rolling.
 */
export const BALL_CATCHUP = 6

/**
 * How far wrong the drawn ball may be before it is simply moved.
 *
 * Three blocks, and only counted at all when the two are not on the same journey
 * - see `ballAgrees`, which is the other half of this rule. A ball that is
 * rolling the way the wire says it is rolling is never snapped however far ahead
 * it has got, because the gap is time rather than disagreement and drag closes it
 * on its own: both balls travel the same distance from the same touch, so they
 * come to rest in the same place.
 *
 * When they *do* disagree, past three blocks something happened that no
 * extrapolation was going to guess - a kickoff putting the ball back on the
 * centre spot, a bounce off something we do not have, a tab that stopped
 * rendering for a second - and sliding the ball across the pitch to catch up
 * would draw a journey it never made. A teleport looks better as a teleport.
 */
export const BALL_SNAP = 3

/**
 * The ball as seen by a client that is not the one stepping it.
 *
 * Single authorship says the owner's ball is the only real one; it does not say
 * everybody else has to *draw* it twelve times a second, which is what the
 * naive version did - the position stood still for 83ms and then jumped the best
 * part of a block, while the seam band spun merrily from a velocity the ball was
 * not currently using. A ball is the fastest thing on the pitch and the one
 * thing every eye in the room is on, so it is also the one place that staircase
 * is unmissable.
 *
 * So the ball is *dead reckoned* between packets: the same `stepBall` the owner
 * runs, from the last position and velocity we were told about. That prediction
 * is wrong, in the small way an extrapolation always is, and the wrongness is
 * kept here as an `error` rather than corrected by snapping - each frame a
 * fraction of it is paid back, so the drawn ball converges on the authoritative
 * path without anybody seeing the moment a packet landed.
 *
 * The wire ball is untouched by any of this. Nothing derived from the drawn ball
 * is ever reported: goals are judged by the owner alone, and the "is this ball
 * stuck" clock every client runs still reads the published position, so all of
 * us still agree about it.
 */
export interface DrawnBall {
  /** Where the ball is being drawn, and how fast it is going. */
  ball: Ball
  /** What is left of the gap between the drawn ball and the wire's own path. */
  error: Vec3
}

/** A drawn ball that agrees exactly with the wire, which is where each one starts. */
export function drawnBall(ball: Ball): DrawnBall {
  return { ball: { ...ball }, error: { x: 0, y: 0, z: 0 } }
}

/**
 * Fold a freshly arrived authoritative ball into the one we are drawing.
 *
 * The velocity is adopted outright, because it is the one number our prediction
 * cannot improve on: it is the owner's answer to every bounce and every boot,
 * and the drawn ball's job from here to the next packet is to roll the way the
 * owner's is rolling.
 *
 * The *position* is deliberately not adopted. Where we are drawing the ball is
 * where the room has just watched it be, and jumping it onto the packet's
 * position is the twitch. The difference is remembered instead and eased away by
 * `reckonBall` over the frames that follow.
 */
export function reconcileBall(drawn: DrawnBall, wire: Ball): DrawnBall {
  const x = drawn.ball.x - wire.x
  const y = drawn.ball.y - wire.y
  const z = drawn.ball.z - wire.z

  // A long way apart *and* not on the same journey, which is the only difference
  // worth moving the ball for - see `BALL_SNAP` and `ballAgrees`.
  if (Math.hypot(x, y, z) > BALL_SNAP && !ballAgrees(drawn.ball, wire)) {
    return drawnBall(wire)
  }

  return {
    ball: { ...drawn.ball, vx: wire.vx, vy: wire.vy, vz: wire.vz },
    error: { x, y, z },
  }
}

export interface DrawnBallStep {
  drawn: DrawnBall
  /** The clamped physics step, exactly as the owner steps its own ball with. */
  delta: number
  isSolid: SolidTest
  floorY?: number
}

/**
 * Advance a drawn ball by one frame, and pay back some of what it owes.
 *
 * Two things at once, and they are one operation on purpose: the ball is
 * predicted forward with the owner's own physics, then nudged by the fraction of
 * the outstanding error this frame is worth. Framerate-independent, like every
 * other ease in the room, so a client at 30fps corrects in the same wall-clock
 * time as one at 144.
 *
 * The error is decayed rather than the position being interpolated toward a
 * target, because there is no target to interpolate to: the authoritative ball
 * is moving too, and the only thing worth knowing about it between packets is
 * how far off we were when we last heard.
 *
 * Decayed at `BALL_RECONCILE` but never faster than `BALL_CATCHUP` blocks a
 * second, which is what keeps a large correction from reading as the ball being
 * thrown back the way it came.
 */
export function reckonBall({
  drawn,
  delta,
  isSolid,
  floorY = 0,
}: DrawnBallStep): DrawnBall {
  const stepped = stepBall({ ball: drawn.ball, delta, isSolid, floorY })

  const owed = Math.hypot(drawn.error.x, drawn.error.y, drawn.error.z)
  const paid = Math.min(
    owed * (1 - Math.exp(-BALL_RECONCILE * delta)),
    BALL_CATCHUP * delta,
  )
  // Nothing owed, so nothing to divide by and nothing to pay.
  const left = owed > 0 ? (owed - paid) / owed : 0
  const error = {
    x: drawn.error.x * left,
    y: drawn.error.y * left,
    z: drawn.error.z * left,
  }

  return {
    ball: {
      ...stepped,
      x: stepped.x - (drawn.error.x - error.x),
      z: stepped.z - (drawn.error.z - error.z),
      /**
       * Never into the grass. A ball that has landed is already resting on the
       * floor, so a downward correction has nowhere to put it but through the
       * world - and half a ball sunk into the pitch is more obviously wrong than
       * a ball a few centimetres too high.
       */
      y: Math.max(floorY + BALL_RADIUS, stepped.y - (drawn.error.y - error.y)),
    },
    error,
  }
}

/**
 * One person's one tab.
 *
 * A person is not a client, which is the whole reason this is a pair. Presence
 * is keyed by user id, so somebody with the lobby open twice is one entry in the
 * roster and two things running a frame loop - and each of those tabs filters
 * the other's broadcasts out as its own echo. Left as a bare id, both tabs of
 * the lowest-sorting player elect themselves, step divergent simulations,
 * broadcast over each other and judge goals twice.
 */
export interface BallClient {
  userId: string
  /**
   * This connection, minted per subscription rather than per person.
   *
   * Empty for a client that predates them, which is what `ballClientKey` is
   * for: mid-deploy those clients still identify themselves by user id on the
   * wire, and every client - old or new - has to agree about who is stepping
   * the ball, or there is no point in electing at all.
   */
  conn: string
}

/**
 * What a client is called on the wire, and in the election.
 *
 * The connection when there is one, the person when there is not.
 */
export function ballClientKey(client: BallClient): string {
  return client.conn || client.userId
}

/**
 * Which client on the channel is stepping the ball.
 *
 * The lowest user id present, sorted as a string, and their lowest connection
 * where they have more than one. Any total order would do; what matters is that
 * it is derived from the roster rather than negotiated, so every client picks
 * the same owner without a round of messages, and picks a *new* one the instant
 * the old owner's presence disappears.
 *
 * Ordered by person first and tab second, deliberately: it means a second tab
 * cannot take the ball off a room, only off the other tab of the same person,
 * so the answer is the same one the room would have given before tabs were part
 * of it.
 *
 * Ids and connections sort consistently everywhere because they are uuids, so
 * this needs no locale awareness.
 */
export function ballOwner(clients: readonly BallClient[]): string | null {
  let owner: BallClient | null = null
  for (const client of clients) {
    if (!client.userId) continue
    if (
      owner === null ||
      client.userId < owner.userId ||
      (client.userId === owner.userId && client.conn < owner.conn)
    ) {
      owner = client
    }
  }
  return owner ? ballClientKey(owner) : null
}
