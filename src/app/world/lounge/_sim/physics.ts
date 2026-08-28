/**
 * Walking, falling and not going through walls.
 *
 * Deliberately a pure function over plain numbers rather than a system that
 * mutates the scene: the whole simulation is `step()`, and the only thing it
 * knows about the world is the `isSolid` predicate it is handed. That is what
 * makes it testable without a browser, a canvas or a WebGL context - which the
 * rest of the lounge is not.
 *
 * It is a voxel character controller, so it does the standard thing: resolve one
 * axis at a time. Moving diagonally into a corner then becomes two independent
 * one-dimensional problems, which is why you slide along a wall instead of
 * sticking to it.
 */

import { AIR_JUMP_SPEED, GRAVITY, JUMP_SPEED, MAX_JUMPS } from '@/domain/lounge/jump'

/**
 * The numbers that define a jump live in the domain, because the scene studio
 * draws one too and a marketing shot of a jump the game does not have is worse
 * than no shot. Re-exported here so this file stays the address everything else
 * already knows.
 */
export { AIR_JUMP_SPEED, GRAVITY, JUMP_SPEED, MAX_JUMPS }

/** Camera height above whatever you are standing on, in blocks. */
export const EYE_HEIGHT = 1.7

/**
 * How wide the player is, measured from the middle.
 *
 * Slightly under half a block, so a one-block gap is passable. At exactly 0.5 you
 * would catch on every seam between two blocks, because floating point puts you
 * a hair inside one of them.
 */
export const PLAYER_RADIUS = 0.3

/**
 * How high a lip you walk up rather than stop dead against.
 *
 * A shade over one block, so a single step, a kerb and the edge of a platform
 * are all things you walk onto - and two blocks is still a wall you have to
 * jump. The same number the XP engine uses, deliberately: a body that climbs a
 * step in a level and refuses the identical step in the lounge is a body that
 * behaves differently in two places that look the same.
 *
 * Its absence here is what "at some blocks standing between them i cant move
 * forward or backward" was. There was no step at all: every block edge was a
 * hard wall, and standing in any one-deep dip meant jumping to get out of it,
 * which reads as being stuck rather than as a rule.
 */
export const STEP_HEIGHT = 1.05

/** Terminal velocity, so a fall off the edge of the world stops accelerating. */
export const MAX_FALL_SPEED = 55

export interface Vec3 {
  x: number
  y: number
  z: number
}

/**
 * How close two people may stand. Twice the player radius, so two boxes touch
 * rather than overlap.
 */
export const PERSONAL_SPACE = PLAYER_RADIUS * 2

/**
 * How far apart two people have to be vertically before they stop being in each
 * other's way.
 *
 * A little under a body height, so somebody standing on your head is not shoved
 * sideways - the block you are both on is what holds them up, and pushing them
 * off it would make stacking on a ledge feel broken.
 */
const SHOULDER_HEIGHT = 1.5

/**
 * Push out of anybody you are standing inside.
 *
 * Resolved by moving *ourselves* rather than by moving them, and that is the
 * whole design: every client runs this against its own position, so two people
 * walking into each other each step half the distance and they separate without
 * either one being authoritative over the other. It is the same rule combat.ts
 * already keeps for health, applied to space.
 *
 * Horizontal only. Being pushed up out of somebody would let two players ladder
 * each other into the sky, and being pushed down would put you through the
 * floor.
 *
 * Pure and framework-free like the rest of this file - the awkward cases (two
 * people exactly on top of each other, somebody on your head) are far easier to
 * pin down in a test than in a running room.
 */
export function separate(
  position: Vec3,
  peers: readonly Vec3[],
  minDistance = PERSONAL_SPACE,
): Vec3 {
  let { x, z } = position

  for (const peer of peers) {
    if (Math.abs(peer.y - position.y) >= SHOULDER_HEIGHT) continue

    const dx = x - peer.x
    const dz = z - peer.z
    const distance = Math.hypot(dx, dz)

    if (distance >= minDistance) continue

    if (distance < 1e-6) {
      /**
       * Exactly on top of each other, so there is no direction to separate
       * along. Picking one arbitrarily beats leaving them fused: both clients
       * run this, and if both nudged the same way they would move together
       * forever. Deriving the direction from the *difference in identity* is
       * not available here, so a fixed axis plus the next frame's real
       * distance is what breaks the tie.
       */
      x += minDistance
      continue
    }

    // Move the whole remaining overlap. Both clients do it, so the pair
    // separates in one frame rather than easing apart over several.
    const push = (minDistance - distance) / distance
    x += dx * push
    z += dz * push
  }

  return { x, y: position.y, z }
}

/** Is the unit cell whose minimum corner is (x, y, z) filled? */
export type SolidTest = (x: number, y: number, z: number) => boolean

export interface StepInput {
  /** The eye. Feet are `EYE_HEIGHT` below it. */
  position: Vec3
  /** Vertical velocity, carried between frames. */
  velocityY: number
  /** Desired horizontal movement this frame, already scaled by speed and delta. */
  moveX: number
  moveZ: number
  /**
   * Jump held. A level, not an edge, so holding the key hops again the instant
   * you land - which only ever applies to the jump off the floor.
   */
  jump: boolean
  /**
   * Jump *pressed* this frame.
   *
   * The mid-air jump reads this one instead, because a held key must not spend
   * it: press and hold on the ground and the level above fires the first jump,
   * at which point a level-triggered second would go off on the very next frame
   * and the pair would read as one slightly bigger jump.
   */
  jumpPressed?: boolean
  grounded: boolean
  /** Jumps spent since the last landing. Carried between frames like velocity. */
  jumps?: number
  delta: number
  isSolid: SolidTest
  /**
   * A solid plane at this height with nothing below it, so an empty world is
   * still standable. The lounge draws one at y=0; without it a new member falls
   * out of a world that has no blocks in it yet.
   */
  floorY?: number
}

export interface StepResult {
  position: Vec3
  velocityY: number
  grounded: boolean
  /** Feed back in as `jumps` next frame. Zero whenever `grounded` is true. */
  jumps: number
}

/**
 * Does any cell directly beneath the player's feet pass `test`?
 *
 * Separate from the collision test above, which asks whether a position is
 * legal. This asks what you are standing *on*, which is a different question
 * with a different answer at the same coordinates - and the one lava needs,
 * because the block that burns you is the one you are not inside.
 *
 * The whole footprint, not just the centre: standing with half a boot over the
 * edge of a lava block still counts, which is what somebody looking at their
 * own feet would expect.
 */
export function underfoot(position: Vec3, test: SolidTest): boolean {
  // Nudged below the feet before flooring. A player resting on the block at
  // cell 0 has their feet at exactly 1.0, and `Math.floor(1.0)` is the empty
  // cell above the one holding them up.
  const cy = Math.floor(position.y - EYE_HEIGHT - 0.02)

  const minX = Math.floor(position.x - PLAYER_RADIUS)
  const maxX = Math.ceil(position.x + PLAYER_RADIUS) - 1
  const minZ = Math.floor(position.z - PLAYER_RADIUS)
  const maxZ = Math.ceil(position.z + PLAYER_RADIUS) - 1

  for (let cx = minX; cx <= maxX; cx++) {
    for (let cz = minZ; cz <= maxZ; cz++) {
      if (test(cx, cy, cz)) return true
    }
  }
  return false
}

/**
 * The top of the highest solid under this spot, within reach of a step.
 *
 * Cells are unit cubes, so the surface above cell `cy` is `cy + 1` - there is
 * no partial-height geometry in the lounge, which is why this is a search
 * rather than the surface *test* the XP engine needs.
 *
 * Searched downwards from the highest cell a step could reach, so the first hit
 * is the one you would actually stand on rather than the lowest one you would
 * pass through.
 */
function stepSurface(
  x: number,
  z: number,
  feet: number,
  isSolid: SolidTest,
): number | null {
  const minX = Math.floor(x - PLAYER_RADIUS)
  const maxX = Math.ceil(x + PLAYER_RADIUS) - 1
  const minZ = Math.floor(z - PLAYER_RADIUS)
  const maxZ = Math.ceil(z + PLAYER_RADIUS) - 1

  const highest = Math.floor(feet + STEP_HEIGHT)
  // A hair below the feet, so the block being stood on is not itself a step.
  const lowest = Math.floor(feet - 0.001)

  for (let cy = highest; cy >= lowest; cy--) {
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cz = minZ; cz <= maxZ; cz++) {
        if (isSolid(cx, cy, cz)) return cy + 1
      }
    }
  }
  return null
}

/**
 * Does the player's box overlap any solid cell, at this position?
 *
 * The half-open ranges matter. A block at cell 3 fills [3, 4), so a player whose
 * box ends at exactly 4.0 is *not* touching it - and `Math.floor` on the exact
 * boundary would otherwise say they are, which reads as an invisible wall one
 * block wide along every chunk seam.
 */
function collides(x: number, y: number, z: number, isSolid: SolidTest): boolean {
  const feet = y - EYE_HEIGHT
  const head = y

  const minX = Math.floor(x - PLAYER_RADIUS)
  const maxX = Math.ceil(x + PLAYER_RADIUS) - 1
  const minZ = Math.floor(z - PLAYER_RADIUS)
  const maxZ = Math.ceil(z + PLAYER_RADIUS) - 1
  const minY = Math.floor(feet)
  // The head is an open bound: standing with your eye at exactly 2.0 does not
  // put you inside the block that starts at 2.
  const maxY = Math.ceil(head) - 1

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
 * The nearest spot where the body is not inside anything.
 *
 * Called only when the body has *already* ended up inside solid geometry, which
 * is a state the movement rules cannot get out of on their own: every candidate
 * move is tested for collision, and from inside a block every candidate
 * collides, so the body is frozen for good. Reported as "on xo you get stuck
 * sometimes" and "lobby world player, sometimes you get stuck".
 *
 * Two ways in, and neither is exotic:
 *
 *  - **Somebody builds on you.** A block placed into the cell you are standing
 *    in leaves you inside it. A single block you now step out of (see
 *    `STEP_HEIGHT`), but one with a ceiling over it you do not.
 *  - **Somebody bumps you.** `separate` pushes two bodies apart knowing nothing
 *    about walls, so a shove in a corridor puts you a third of a block inside
 *    one. That is the lobby case: it needs a crowd, which is why it is
 *    "sometimes".
 *
 * Candidates are ordered by how far they move you, so the smallest correction
 * that works is the one taken - a nudge sideways out of a wall rather than a
 * hop onto its roof. Deliberately *not* "let the player walk out with collision
 * off": that turns being stuck into being able to walk through any thin wall,
 * and this way the resolution is ours and bounded rather than theirs and open.
 *
 * Null when nothing within reach is clear - buried in the middle of a solid
 * tower, say. The body stays where it is, which is what it did before this
 * existed, and the rail's own unstick control is the way out.
 */
function escapeFrom(
  x: number,
  y: number,
  z: number,
  isSolid: SolidTest,
): { x: number; y: number; z: number } | null {
  const sideways = [0.35, 0.7, 1.05]
  const upward = [1, 2, 3]

  const candidates: { x: number; y: number; z: number; cost: number }[] = []
  for (const d of sideways) {
    candidates.push({ x: x + d, y, z, cost: d })
    candidates.push({ x: x - d, y, z, cost: d })
    candidates.push({ x, y, z: z + d, cost: d })
    candidates.push({ x, y, z: z - d, cost: d })
  }
  // Up is worth more than sideways of the same size: being lifted onto a roof
  // is a bigger surprise than being nudged off a wall, so it loses every tie.
  for (const d of upward) candidates.push({ x, y: y + d, z, cost: d + 0.5 })

  candidates.sort((a, b) => a.cost - b.cost)
  for (const spot of candidates) {
    if (!collides(spot.x, spot.y, spot.z, isSolid)) {
      return { x: spot.x, y: spot.y, z: spot.z }
    }
  }
  return null
}

/**
 * Advance the player by one frame.
 *
 * Returns a new position rather than mutating the input, so a caller can run it
 * speculatively - which is what the remote-player interpolation would want if it
 * ever needs to predict.
 */
export function step(input: StepInput): StepResult {
  const { position, moveX, moveZ, jump, jumpPressed, delta, isSolid, floorY = 0 } = input

  let { x, y, z } = position
  let velocityY = input.velocityY
  let grounded = input.grounded
  let jumps = input.jumps ?? 0

  /**
   * Inside something? Out of it first, before anything else is decided.
   *
   * Ahead of the movement rules rather than folded into them, because it is not
   * a movement: nothing the player did this frame put them here, and the frame
   * they spend being freed is one they did not ask for either. See
   * `escapeFrom`.
   */
  if (collides(x, y, z, isSolid)) {
    const out = escapeFrom(x, y, z, isSolid)
    if (out) {
      x = out.x
      y = out.y
      z = out.z
      // A body that has just been lifted is falling, not standing, and any
      // downward speed it had belonged to the fall that buried it.
      velocityY = 0
      grounded = false
    }
  }

  // --- horizontal, one axis at a time so corners slide -----------------------
  /**
   * Walk into it, or step up onto it.
   *
   * Only from the ground: stepping up in mid-air would let somebody climb a
   * wall by holding a direction against it, which is the classic way this
   * feature turns into a bug. And only onto something genuinely *higher* -
   * without that check, walking into a flat wall finds the floor already
   * underfoot and reads as a successful step on every frame.
   */
  const tryMove = (nx: number, nz: number): void => {
    if (!collides(nx, y, nz, isSolid)) {
      x = nx
      z = nz
      return
    }
    if (!grounded) return

    // Headroom first: a step you cannot fit through is not a step.
    if (collides(nx, y + STEP_HEIGHT, nz, isSolid)) return

    const surface = stepSurface(nx, nz, y - EYE_HEIGHT, isSolid)
    if (surface === null) return

    const stepped = surface + EYE_HEIGHT
    if (stepped <= y + 1e-4) return
    if (collides(nx, stepped, nz, isSolid)) return

    x = nx
    z = nz
    y = stepped
  }

  if (moveX !== 0) tryMove(x + moveX, z)
  if (moveZ !== 0) tryMove(x, z + moveZ)

  // --- jump -----------------------------------------------------------------
  // Read before gravity, so a jump pressed on the frame you land still fires.
  if (jump && grounded) {
    velocityY = JUMP_SPEED
    grounded = false
    jumps = 1
  } else if (jumpPressed && !grounded && jumps < MAX_JUMPS) {
    /**
     * The second jump. Assigned rather than added, so it is worth the same
     * whether you spend it at the top of an arc or halfway down a long fall -
     * added, it would be a nudge on the way up and nothing at all on the way
     * down, which is precisely when somebody reaches for it.
     */
    velocityY = AIR_JUMP_SPEED
    jumps += 1
  }

  // --- vertical -------------------------------------------------------------
  velocityY = Math.max(velocityY - GRAVITY * delta, -MAX_FALL_SPEED)
  const targetY = y + velocityY * delta

  if (collides(x, targetY, z, isSolid)) {
    if (velocityY < 0) {
      /**
       * Landed. Snapped to the top of the block rather than simply refusing the
       * move: at terminal velocity a frame covers most of a block, so reverting
       * would leave you hovering wherever the frame boundary happened to fall,
       * and the gap would change with the frame rate.
       */
      const feet = targetY - EYE_HEIGHT
      y = Math.floor(feet) + 1 + EYE_HEIGHT
      grounded = true
    } else {
      // Hit a ceiling. Stop rising; do not snap, because being nudged down out
      // of a block you were already standing in is worse than a short jump.
      y = position.y
    }
    velocityY = 0
  } else {
    y = targetY
    // Standing still on a floor keeps `grounded` true through the probe below;
    // walking off an edge clears it here.
    grounded = false
  }

  // --- the world's floor ----------------------------------------------------
  if (y - EYE_HEIGHT < floorY) {
    y = floorY + EYE_HEIGHT
    velocityY = 0
    grounded = true
  }

  /**
   * Ground probe.
   *
   * Falling one frame's worth of nothing is not the same as being airborne, and
   * without this a player standing on blocks flickers between grounded and not -
   * which makes jumping fail roughly half the time. Checking a hair below the
   * feet answers "could I jump right now" directly.
   */
  if (!grounded && velocityY <= 0 && collides(x, y - 0.02, z, isSolid)) {
    grounded = true
  }

  /**
   * Settle the jump budget against where we actually ended up.
   *
   * Landing refills it. Being airborne without having jumped - walked off a
   * ledge, knocked off one - spends the ground jump, so what is left is the one
   * mid-air save and not a fresh pair. Done here rather than at the branch
   * above because only now is `grounded` the answer for *this* frame.
   */
  if (grounded) jumps = 0
  else if (jumps === 0) jumps = 1

  return { position: { x, y, z }, velocityY, grounded, jumps }
}
