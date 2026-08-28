/**
 * Walking, falling and not going through walls.
 *
 * ---------------------------------------------------------------------------
 * Provenance
 * ---------------------------------------------------------------------------
 * Copied from `src/app/world/lounge/physics.ts` (and the constants it re-exports
 * from `src/domain/lounge/jump.ts`) when the XP creator was started. It has a
 * sibling. A genuine bug - a corner you stick to, a seam you catch on - should
 * be fixed in both; a difference in *feel* should not, because being allowed to
 * diverge is the whole reason there are two files. See docs/xp/creator.md §1.2.
 *
 * The constants are inlined rather than imported for the same reason, and it is
 * not ceremony: an XP is meant to set its own gravity and its own pace one day,
 * at which point these become defaults a document overrides. Reaching into the
 * lounge's numbers would make that a change to the lounge.
 *
 * ---------------------------------------------------------------------------
 * What it is
 * ---------------------------------------------------------------------------
 * Deliberately a pure function over plain numbers rather than a system that
 * mutates the scene: the whole simulation is `step()`, and the only thing it
 * knows about the world is the `isSolid` predicate it is handed. That is what
 * makes it testable without a browser, a canvas or a WebGL context - which the
 * scene that calls it is not, and which matters more here than it did in the
 * lounge, because the Browser pane never fires `requestAnimationFrame` and a
 * game loop cannot be watched in it at all.
 *
 * It is a voxel character controller, so it does the standard thing: resolve one
 * axis at a time. Moving diagonally into a corner then becomes two independent
 * one-dimensional problems, which is why you slide along a wall instead of
 * sticking to it.
 */

/** Cells per second squared. Earth is ~9.8; this is heavier so falls feel short. */
export const GRAVITY = 26

/**
 * Upward velocity on jump.
 *
 * Raised from 8.4, which cleared 1.36 cells - "exactly one cell", as the old
 * comment had it, and that was rather the problem: a jump whose entire budget is
 * one cell has nothing spare, so every rise in a course has to be exactly one
 * and a platformer built from it is a staircase. 9.0 clears 1.56 - two tenths of
 * a cell of room to be wrong in.
 *
 * Deliberately a small change. The peak is `v² / 2g`, so this is not a free
 * parameter: the courses are laid out against it, and a *big* increase makes a
 * jump overshoot the platform it was aimed at, which turns a generous change
 * into a course you fall off the far side of. Tried at 9.9 first and `sidestep`
 * stopped being runnable, which is exactly the failure `pilot.test.ts` exists
 * to make loud.
 *
 * `xps.test.ts` simulates the budget rather than writing it down, so changing
 * this re-checks every gap and rise we ship instead of quietly invalidating
 * them.
 */
export const JUMP_SPEED = 9.0

/**
 * How far below the floor "out of the world" starts.
 *
 * Not zero, and the bug that proves it: with the catch *at* `floorY`, standing
 * still on the world's own floor restarts you on the first frame. Gravity is
 * applied before the floor clamp - it has to be, or you could never land - and
 * the restart check is deliberately tested before that clamp too, so for one
 * instant the feet are a fraction below the plane they are resting on. The
 * symptom is being sent back to the start at random while walking on flat
 * ground, which reads as the game being broken rather than as an off-by-one.
 *
 * Two cells, because it has to clear the deepest a body can sink inside one
 * frame at terminal velocity and still be unmistakably a fall. A pit floored at
 * `floorY` still catches somebody who drops into it - they carry on past this -
 * so the platformer behaviour this exists for is unchanged.
 */
export const OUT_OF_WORLD = 2

/**
 * How high a jump of a given speed actually gets you, and back again.
 *
 * Exposed because **an author thinks in cells, not in metres per second**. "How
 * many blocks can I clear" is the question a level is built around; `9.0` is an
 * answer to a different one, and a document asking for it in those units would
 * be a document whose author cannot check their own course by counting.
 *
 * The sum is the standard one - at the top of the arc all the upward speed has
 * been spent against gravity, so `h = v² / 2g` and `v = sqrt(2gh)`. The default
 * works out at 1.56 cells, which is why a one-cell step is comfortable and a
 * two-cell wall is not.
 *
 * A conversion rather than a table, so no number here can disagree with
 * `GRAVITY` - the two are the same fact stated once.
 *
 * `gravity` is the level's own, when it has one - `player.gravity`. It has to
 * come through here or a heavy world would quietly shrink every jump the
 * document asked for in cells, and "how many blocks can I clear" would stop
 * being a number the author can check by counting.
 */
export function jumpSpeedFor(cells: number, gravity: number = GRAVITY): number {
  return Math.sqrt(2 * gravity * cells)
}

/** What a jump of the default speed clears, in cells. The inverse of the above. */
export function jumpHeightOf(speed: number, gravity: number = GRAVITY): number {
  return (speed * speed) / (2 * gravity)
}

/**
 * Upward velocity on the mid-air second jump.
 *
 * A little short of the first, deliberately: a second jump as strong as the
 * first makes the ground jump the uninteresting half of the pair, because the
 * optimal way anywhere becomes hop-then-jump every time. Short enough to read
 * as a recovery rather than as a second full storey.
 */
export const AIR_JUMP_SPEED = 7

/**
 * Jumps available between one landing and the next.
 *
 * Two: the one off the floor and one in the air. Counted rather than held as a
 * `canDoubleJump` flag because walking off a ledge has to spend one of them -
 * see `step`, where an airborne player who never jumped is charged for the jump
 * they did not use.
 */
export const MAX_JUMPS = 2

/** How fast you travel on the ground, in cells a second. */
export const WALK_PACE = 7
export const SPRINT_PACE = 13

/**
 * How long a `dash` takes, whatever distance it covers.
 *
 * A time and not a speed, because the verb is a *distance* - the level says how
 * far and this says how long, and the speed falls out of the two. Which is the
 * right way round: a level built around clearing a four-cell gap should clear
 * it at the same pace as one built around clearing eight, or the same button
 * would feel like a different move in the next room.
 *
 * A fifth of a second. Long enough that the eye follows the body across rather
 * than losing it, short enough that steering during one is not really a thing
 * you do - a dash is a commitment, and that is most of what makes it read as
 * one move rather than a burst of running.
 */
export const DASH_SECONDS = 0.2

/** Camera height above whatever you are standing on, in cells. */
export const EYE_HEIGHT = 1.7

/**
 * How far off a cell boundary counts as still on it.
 *
 * A hair, and it exists because heights in this engine are *derived* rather
 * than stored: the feet come back as `y - EYE_HEIGHT`, and that subtraction
 * does not always return the number that went in. See the note in `blocked`,
 * where getting this wrong froze the player solid at two particular heights.
 *
 * Far below anything a person or a level can express - a millionth of a metre -
 * so it can only ever absorb arithmetic noise, never real overlap.
 */
const BOUNDARY = 1e-6

/**
 * How wide the player is, measured from the middle.
 *
 * Slightly under half a cell, so a one-cell gap is passable. At exactly 0.5 you
 * would catch on every seam between two cells, because floating point puts you
 * a hair inside one of them.
 */
export const PLAYER_RADIUS = 0.3

/** Terminal velocity, so a fall off the edge of the world stops accelerating. */
export const MAX_FALL_SPEED = 55

/**
 * How high a step you walk up without jumping.
 *
 * ---------------------------------------------------------------------------
 * Why this and not a capsule
 * ---------------------------------------------------------------------------
 * The usual answer to "make stairs feel smooth" is a capsule collider, and it
 * is the wrong instrument here. A capsule does not climb a step: a rounded
 * bottom slides along a *slope*, but a one-metre riser is a vertical wall and a
 * capsule stops against it exactly as a box does. Engines that appear to solve
 * this with a capsule are running a separate step-offset pass underneath -
 * which is this.
 *
 * So the mechanism is: when a horizontal move is refused, try the same move
 * raised by a step, and if that is clear, take it and settle onto whatever is
 * underneath. Stairs become walkable, a one-cell ledge becomes something you
 * stroll onto, and a two-cell wall stays a wall.
 *
 * A hair over one cell, because the kit's stairs rise exactly one cell a step
 * and floating point does not care that they are meant to be equal. What it
 * must stay under is two, or a player walks up a wall.
 *
 * A capsule would still buy something later - rounder behaviour brushing past a
 * corner - and it is a much bigger change than this: the cell grid answers
 * "is this cell solid", and a capsule needs "how far is the nearest surface".
 */
export const STEP_HEIGHT = 1.05

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
 * other's way. A little under a body height, so somebody standing on your head
 * is not shoved sideways.
 */
const SHOULDER_HEIGHT = 1.5

/**
 * Push out of anybody you are standing inside.
 *
 * Resolved by moving *ourselves* rather than by moving them: every client runs
 * this against its own position, so two people walking into each other each
 * step half the distance and they separate without either one being
 * authoritative over the other.
 *
 * Horizontal only. Being pushed up out of somebody would let two players ladder
 * each other into the sky, and being pushed down would put you through the
 * floor.
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
      // Exactly on top of each other, so there is no direction to separate
      // along. A fixed axis plus the next frame's real distance breaks the tie.
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

/**
 * An axis-aligned box in world units, standing in the way.
 *
 * The other half of collision, and deliberately not expressed as cells. The
 * grid is exact for architecture drawn on whole metres and hopeless for a crate
 * 0.46 across: snapped to a lattice it is something you bump into a third of a
 * metre before you touch it. So structure is cells and things are boxes, and
 * each is doing what it is good at.
 *
 * A linear scan, which is the honest thing at this size - a level holds
 * hundreds of placements and tens of entities. It stays a linear scan until
 * something proves otherwise, at which point it becomes the same uniform hash
 * grid the cells already live on.
 */
export interface Blocker {
  minX: number
  minY: number
  minZ: number
  maxX: number
  maxY: number
  maxZ: number
  /**
   * How far this box moved since the last frame, if it did.
   *
   * Supplied by the caller - `blockersOf` works it out - because the controller
   * has no memory between frames and should not grow one. It is what makes a
   * moving platform something you *ride* rather than something that slides out
   * from under you: without it, the box simply arrives somewhere else and the
   * person standing on it stays where they were, which reads as the platform
   * passing through them.
   *
   * Absent means it did not move, which is true of every wall and nearly every
   * crate, so the common case costs nothing.
   */
  dx?: number
  dy?: number
  dz?: number
  /**
   * How high landing on this box throws you, in cells. Absent is not bouncy.
   *
   * A height rather than a coefficient of restitution, which is the decision the
   * whole feature turns on: a real trampoline returns a fraction of your impact
   * speed, so the same pad reaches a different ledge depending on where you fell
   * from, and a course built around it cannot be proved. Cells are countable
   * against the level, which is the property `jumpSpeedFor` exists for.
   *
   * The cost, stated so nobody reports it: a fixed launch is *perpetual*. You
   * leave a 3-cell pad at 3 cells however you arrived, every time, until you
   * land on something else. That is what a spring is - one that got tired would
   * be the bug.
   */
  bounce?: number
}

/**
 * How bouncy the cell at these coordinates is, in cells of launch. 0 is not.
 *
 * Deliberately shaped like `SolidTest` and asked the same way, because it
 * answers a question about the same lattice: placements are rasterised into
 * cells once at load, so "is there a bouncy pad here" is a grid lookup and not
 * something the frame loop should be scanning instances for.
 */
export type BounceTest = (x: number, y: number, z: number) => number

/**
 * How high the geometry filling this cell actually reaches.
 *
 * `BounceTest`'s shape and `BounceTest`'s reason: one lookup on the same lattice,
 * answered once at load rather than searched per frame. What it is *for* is the
 * half-cell described on `Solids.topOf` - a floor tile 0.500 tall fills a whole
 * cell, and standing on the cell rather than on the tile is a body hanging in
 * the air over the floor it is standing on.
 *
 * Always within the cell it is asked about: at least `y`, at most `y + 1`.
 * Everywhere this is optional, leaving it out means `y + 1`, which is exactly
 * what the controller assumed before it existed.
 */
export type SurfaceTest = (x: number, y: number, z: number) => number

/**
 * How far the feet may be from a moving box's top and still count as riding it.
 *
 * A person standing still is snapped exactly onto the surface every frame, so
 * this would work at almost zero. It is this wide for the platform that is
 * going *down*: it leaves the feet behind by a frame's worth of travel before
 * gravity catches up, and at 9 m/s that is 0.15 - so anything tighter would
 * drop a rider off a fast descent and pick them up again a frame later, which
 * is a stutter you can feel.
 */
const CARRY_REACH = 0.15

/**
 * The moving box a player is standing on, or null.
 *
 * Tested against where each box *was* rather than where it is: the player is
 * standing on last frame's surface, because the box has already moved by the
 * time this is asked. Getting that backwards means a platform is only ever
 * ridden while it stands still.
 */
function carrier(
  x: number,
  y: number,
  z: number,
  blockers: readonly Blocker[],
): Blocker | null {
  const feet = y - EYE_HEIGHT
  let best: Blocker | null = null
  let bestTop = -Infinity

  for (const box of blockers) {
    const dx = box.dx ?? 0
    const dy = box.dy ?? 0
    const dz = box.dz ?? 0
    if (dx === 0 && dy === 0 && dz === 0) continue

    const wasTop = box.maxY - dy
    if (feet < wasTop - CARRY_REACH || feet > wasTop + CARRY_REACH) continue
    if (x - PLAYER_RADIUS >= box.maxX - dx || x + PLAYER_RADIUS <= box.minX - dx) continue
    if (z - PLAYER_RADIUS >= box.maxZ - dz || z + PLAYER_RADIUS <= box.minZ - dz) continue

    // The highest one, for the same reason `surfaceUnder` takes the highest:
    // two platforms crossing means you are on the upper.
    if (wasTop > bestTop) {
      best = box
      bestTop = wasTop
    }
  }

  return best
}

export interface StepInput {
  /** The eye. Feet are `EYE_HEIGHT` below it. */
  position: Vec3
  /** Vertical velocity, carried between frames. */
  velocityY: number
  /**
   * How hard the first jump pushes, when the document has an opinion.
   *
   * Absent is `JUMP_SPEED`, which is every level that has not said otherwise.
   * A speed rather than a height *here* because this is the frame loop and the
   * conversion is not its job - `jumpSpeedFor` does it once, where the document
   * is read, rather than sixty times a second.
   *
   * Only the first jump. The mid-air second one stays at `AIR_JUMP_SPEED`,
   * because it is deliberately weaker than the first and scaling both would
   * lose that relationship at exactly the setting an author is fiddling with.
   */
  jumpSpeed?: number
  /**
   * How hard the world pulls down, in cells a second squared.
   *
   * Absent is `GRAVITY`, which is every level that has not said otherwise -
   * `player.gravity`, read once where the document is. The bounce launch below
   * converts through the same number, so a pad that says four cells clears four
   * cells on the moon too.
   */
  gravity?: number
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
   * Where each cell's geometry stops, when the caller has rasterised one.
   *
   * `buildSolids().topOf`. Absent means every cell is full to its own ceiling,
   * which is what this controller assumed for its whole life and is still the
   * right answer for a caller testing against a hand-written predicate.
   *
   * With it, a body stands on the *floor tile* rather than on the cell holding
   * it - see `Solids.topOf` for the half-cell that came from, and for why every
   * level built out of the platformer kit had somebody hovering over it.
   */
  topOf?: SurfaceTest
  /** Free-standing boxes - entities - that also stop you. */
  blockers?: readonly Blocker[]
  /**
   * How bouncy each *cell* is, for level geometry. Absent is a world with no
   * springs in it, which is every document written before this one.
   */
  bounceOf?: BounceTest
  /**
   * A floor under every landing, in cells - the rubber world.
   *
   * `player.bounce`, and the one place this feature is a foot-gun: it applies to
   * the ground as well as to pads, and a fixed launch is perpetual, so an author
   * who sets it can never stand still again. That may be exactly the level they
   * meant - a moon, a jelly - but it is not something to discover from a slider,
   * which is why the editor is asked to describe it rather than offer one.
   *
   * A floor rather than an override: standing on a 4-cell pad in a 1-cell world
   * gives 4. The pad is the more specific statement.
   */
  bounce?: number
  /**
   * A solid plane at this height with nothing below it, so an empty world is
   * still standable. Without it, an XP whose author has not laid a floor yet
   * drops the player out of the bottom of their own level.
   */
  floorY?: number
  /**
   * Where a fall ends, when falling is meant to *cost* something.
   *
   * The third answer to "what is under the world", and the one a platformer
   * needs. The other two are already here: a solid plane at `floorY`, which
   * means you cannot fall at all, and a catch well below it, which means a fall
   * is a walk back. Neither is a platformer, where missing a jump is the
   * failure the whole level is made of.
   *
   * It is in the controller rather than in the component that calls it because
   * the controller is the only thing that knows where the player *is*. A script
   * cannot move them - the component overwrites the position from its own ref
   * every frame - so a respawn written anywhere else is a respawn that gets
   * undone on the next tick.
   *
   * Checked before the floor clamp, or the clamp would catch the fall first and
   * this would never fire.
   */
  restart?: { below: number; to: Vec3 }
}

export interface StepResult {
  position: Vec3
  velocityY: number
  grounded: boolean
  /** Feed back in as `jumps` next frame. Zero whenever `grounded` is true. */
  jumps: number
  /**
   * True on the frame a fall was sent back to the start.
   *
   * So a caller can count it, say so, or reset a clock. Nothing here does any
   * of that - the position is already back where it belongs - but a run that
   * silently teleports you is a run where "what just happened" has no answer.
   */
  restarted: boolean
}

/**
 * Does any cell directly beneath the player's feet pass `test`?
 *
 * Separate from the collision test below, which asks whether a position is
 * legal. This asks what you are standing *on*, which is a different question
 * with a different answer at the same coordinates - and the one a damage floor
 * or a pressure plate needs, because the cell that triggers is the one you are
 * not inside.
 *
 * The whole footprint, not just the centre: standing with half a boot over the
 * edge still counts, which is what somebody looking at their own feet expects.
 */
export function underfoot(position: Vec3, test: SolidTest): boolean {
  // Nudged below the feet before flooring. A player resting on the cell at 0
  // has their feet at exactly 1.0, and `Math.floor(1.0)` is the empty cell
  // above the one holding them up.
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
 * Does the player's box overlap any solid cell, at this position?
 *
 * The half-open ranges matter. A cell at 3 fills [3, 4), so a player whose box
 * ends at exactly 4.0 is *not* touching it - and `Math.floor` on the exact
 * boundary would otherwise say they are, which reads as an invisible wall one
 * cell wide along every seam.
 *
 * ---------------------------------------------------------------------------
 * Exported, because deciding *where to put somebody* is the same question
 * ---------------------------------------------------------------------------
 * It was private while the only caller was the step below, and the cost of that
 * showed up as a level where a third of the spawn slots were inside a wall: the
 * arrival grid could only ask "is there floor under this spot", because that was
 * the only question anything outside this file could form. A spot with floor
 * under it and a wall through it passed, and the body arrived wedged.
 *
 * `y` is the **eye**, not the feet, exactly as it is everywhere else in this
 * module - `feet` is recovered by subtracting `EYE_HEIGHT`. A caller holding a
 * standing position has to add it, which is what `player.tsx` already does when
 * it turns an arrival into a position.
 */
export function blocked(
  x: number,
  y: number,
  z: number,
  isSolid: SolidTest,
  blockers?: readonly Blocker[],
  /**
   * Where each cell's geometry really stops. See `Solids.topOf`.
   *
   * The other half of standing on a half-height tile, and the half that is easy
   * to miss: once the feet are at 0.5 they are *inside* the cell that fills
   * 0 to 1, so without this the body reports itself as buried and every move it
   * tries is refused. Which is a player who cannot walk - a worse bug than the
   * one being fixed, and the reason the surface has to be known here as well as
   * where somebody lands.
   *
   * Absent means every cell fills its own, which is what this assumed before.
   */
  topOf?: SurfaceTest,
): boolean {
  const feet = y - EYE_HEIGHT
  const head = y

  if (blockers) {
    for (const box of blockers) {
      // Touching does not count, the same half-open convention the cells keep -
      // otherwise standing exactly against a crate reads as standing inside it.
      if (
        x - PLAYER_RADIUS < box.maxX &&
        x + PLAYER_RADIUS > box.minX &&
        feet < box.maxY &&
        head > box.minY &&
        z - PLAYER_RADIUS < box.maxZ &&
        z + PLAYER_RADIUS > box.minZ
      ) {
        return true
      }
    }
  }

  const minX = Math.floor(x - PLAYER_RADIUS)
  const maxX = Math.ceil(x + PLAYER_RADIUS) - 1
  const minZ = Math.floor(z - PLAYER_RADIUS)
  const maxZ = Math.ceil(z + PLAYER_RADIUS) - 1
  /**
   * The feet, nudged up off the boundary before flooring.
   *
   * This read `Math.floor(feet)` and locked the player in place at two specific
   * heights, which is the kind of bug that looks like magic from inside the
   * game: you walk a course fine, step onto one platform, and cannot move in
   * any direction.
   *
   * The cause is one ULP. Landing sets `y = surface + EYE_HEIGHT` exactly, so
   * the feet are recovered as `y - EYE_HEIGHT` - and with `EYE_HEIGHT` at 1.7,
   * `8 + 1.7 - 1.7` is `7.999999999999999`, not 8. `Math.floor` then puts the
   * feet a whole cell low, inside the very platform they are standing on, so
   * `blocked` reports the *current* position as solid and every attempted
   * move is refused. Surfaces 7 and 8 are the two that land wrong for 1.7;
   * change the eye height and it will be a different pair, which is why the
   * fix cannot be a special case.
   *
   * The nudge is the same half-open convention the head already keeps at the
   * other end: a boundary belongs to the cell above it. It is small enough that
   * no real penetration is ever nudged away - a body genuinely a micron inside
   * a floor is a body standing on it.
   */
  const minY = Math.floor(feet + BOUNDARY)
  // The head is an open bound: standing with your eye at exactly 2.0 does not
  // put you inside the cell that starts at 2.
  const maxY = Math.ceil(head) - 1

  for (let cx = minX; cx <= maxX; cx++) {
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cz = minZ; cz <= maxZ; cz++) {
        if (!isSolid(cx, cy, cz)) continue
        /**
         * A cell whose geometry stops at or below the feet is a floor, not a wall.
         *
         * Only ever true of the cell the feet are *in* - every cell above them
         * ends above them by construction - so this is the one case it is for:
         * standing on a half-height tile, where the feet are inside the cell
         * that carries it. The same `BOUNDARY` nudge the feet already get, for
         * the same floating-point reason: a surface and the body resting exactly
         * on it must compare as touching rather than as overlapping.
         */
        if (topOf && topOf(cx, cy, cz) <= feet + BOUNDARY) continue
        return true
      }
    }
  }
  return false
}

/**
 * The top of the highest solid surface under the player, within `maxDrop`.
 *
 * Cell by cell downwards rather than by sampling: the answer is always a cell
 * boundary, so anything finer would be looking for precision that is not there.
 * Null means nothing underneath, which is what makes a step-up onto a ledge
 * with a hole behind it fail rather than teleport somebody over the hole.
 */
function surfaceUnder(
  x: number,
  y: number,
  z: number,
  isSolid: SolidTest,
  maxDrop: number,
  blockers?: readonly Blocker[],
  /**
   * Where the cell's geometry actually stops. Absent is the cell's own top,
   * which is what this returned for every caller before it existed.
   */
  topOf?: SurfaceTest,
): number | null {
  /**
   * A box's top counts as ground too.
   *
   * Without this, stepping up onto a crate finds no surface and is refused, so
   * a crate is something you walk into rather than something you climb - which
   * is the difference between scenery and level design.
   */
  let best: number | null = null
  if (blockers) {
    const feet = y - EYE_HEIGHT
    for (const box of blockers) {
      if (x - PLAYER_RADIUS >= box.maxX || x + PLAYER_RADIUS <= box.minX) continue
      if (z - PLAYER_RADIUS >= box.maxZ || z + PLAYER_RADIUS <= box.minZ) continue
      if (box.maxY > feet + 1e-4 || box.maxY < feet - maxDrop) continue
      if (best === null || box.maxY > best) best = box.maxY
    }
  }
  const feet = y - EYE_HEIGHT
  const minX = Math.floor(x - PLAYER_RADIUS)
  const maxX = Math.ceil(x + PLAYER_RADIUS) - 1
  const minZ = Math.floor(z - PLAYER_RADIUS)
  const maxZ = Math.ceil(z + PLAYER_RADIUS) - 1

  // Nudged down before flooring, so feet resting exactly on a boundary look at
  // the cell holding them up rather than the empty one they are standing in.
  const from = Math.floor(feet - 1e-4)
  const to = Math.floor(feet - maxDrop)

  for (let cy = from; cy >= to; cy--) {
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cz = minZ; cz <= maxZ; cz++) {
        if (isSolid(cx, cy, cz)) {
          /**
           * The surface, which is not always the cell.
           *
           * See `Solids.topOf`: a floor tile half a cell thick fills a whole
           * cell, and standing on the cell rather than on the tile is the body
           * hanging in the air that was reported three times.
           *
           * Still never *below* the feet's own drop: a surface found under a
           * body is a surface it is falling onto, and one clamped up to the
           * cell top - which is what a masked cell returns - is the answer this
           * always gave.
           */
          const cell = topOf ? topOf(cx, cy, cz) : cy + 1
          return best !== null && best > cell ? best : cell
        }
      }
    }
  }
  return best
}

/**
 * How bouncy the thing you just landed on is, in cells of launch.
 *
 * Asked *at the surface `surfaceUnder` already found* rather than searching
 * again, and that is the point: the landing branch has just decided which of a
 * cell top and a box top it snapped the feet to, and re-deriving it here is how
 * the two answers get to disagree. A player standing on a crate over a bouncy
 * floor should bounce off the crate, and does, because only the crate's top is
 * at the surface.
 *
 * The highest wins where several boxes meet, matching `surfaceUnder`'s own tie
 * break - a seam between two pads is not a dead spot.
 */
function bounceUnder(
  x: number,
  z: number,
  surface: number,
  bounceOf?: BounceTest,
  blockers?: readonly Blocker[],
): number {
  let best = 0
  if (blockers) {
    for (const box of blockers) {
      if (box.bounce === undefined || box.bounce <= 0) continue
      if (x - PLAYER_RADIUS >= box.maxX || x + PLAYER_RADIUS <= box.minX) continue
      if (z - PLAYER_RADIUS >= box.maxZ || z + PLAYER_RADIUS <= box.minZ) continue
      // The same epsilon the collision code uses. A box top and a cell top can
      // be the same surface to within floating point and mean it.
      if (Math.abs(box.maxY - surface) > 1e-4) continue
      if (box.bounce > best) best = box.bounce
    }
  }
  if (bounceOf) {
    /**
     * The cell *beneath* the surface, which is the one holding you up.
     *
     * `surfaceUnder` returns `cy + 1` for a solid cell at `cy`, so the pad is at
     * `surface - 1`. Reading the cell at `surface` asks the empty air you are
     * standing in how bouncy it is, and gets 0 every time - a bug that looks
     * exactly like the feature not being wired up.
     */
    const cy = Math.round(surface) - 1
    const minX = Math.floor(x - PLAYER_RADIUS)
    const maxX = Math.ceil(x + PLAYER_RADIUS) - 1
    const minZ = Math.floor(z - PLAYER_RADIUS)
    const maxZ = Math.ceil(z + PLAYER_RADIUS) - 1
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cz = minZ; cz <= maxZ; cz++) {
        const cell = bounceOf(cx, cy, cz)
        if (cell > best) best = cell
      }
    }
  }
  return best
}

/**
 * Advance the player by one frame.
 *
 * Returns a new position rather than mutating the input, so a caller can run it
 * speculatively - which is what remote-player interpolation wants if it ever
 * needs to predict.
 */
export function step(input: StepInput): StepResult {
  const {
    position,
    moveX,
    moveZ,
    jump,
    jumpPressed,
    jumpSpeed,
    gravity = GRAVITY,
    delta,
    isSolid,
    topOf,
    blockers,
    bounceOf,
    bounce,
    floorY = 0,
  } = input

  let { x, y, z } = position
  let velocityY = input.velocityY
  let grounded = input.grounded
  let jumps = input.jumps ?? 0

  /**
   * Carried by whatever you are standing on.
   *
   * Before anything else in the frame, so the rest of the step - your own
   * movement, gravity, the collision that keeps you on the surface - all happen
   * from where the platform has taken you. Applied after it moved rather than
   * predicted, which is why `Blocker` carries a delta rather than a velocity:
   * the platform is authoritative about where it went, and a script may have
   * moved it anywhere at all.
   *
   * Only while grounded. A platform passing under somebody mid-jump does not
   * catch them, which is right - the alternative is being yanked sideways by a
   * thing you are in the air above.
   */
  if (grounded && blockers) {
    const ride = carrier(x, y, z, blockers)
    if (ride) {
      x += ride.dx ?? 0
      y += ride.dy ?? 0
      z += ride.dz ?? 0
    }
  }

  // --- horizontal, one axis at a time so corners slide -----------------------
  /**
   * Walk into it, or step up onto it.
   *
   * Only from the ground: stepping up in mid-air would let somebody climb a
   * wall by holding a direction against it, which is the classic way this
   * feature turns into a bug. And only when the surface found is genuinely
   * *higher* - without that check, walking into a flat wall would find the
   * floor it is already standing on and read as a successful step every frame.
   */
  const tryMove = (nx: number, nz: number): boolean => {
    if (!blocked(nx, y, nz, isSolid, blockers, topOf)) {
      x = nx
      z = nz
      return true
    }
    if (!grounded) return false

    const raised = y + STEP_HEIGHT
    // Headroom first: a step you cannot fit through is not a step.
    if (blocked(nx, raised, nz, isSolid, blockers, topOf)) return false

    const surface = surfaceUnder(nx, raised, nz, isSolid, STEP_HEIGHT + 0.05, blockers, topOf)
    if (surface === null) return false

    const stepped = surface + EYE_HEIGHT
    if (stepped <= y + 1e-4) return false
    if (blocked(nx, stepped, nz, isSolid, blockers, topOf)) return false

    x = nx
    z = nz
    y = stepped
    return true
  }

  if (moveX !== 0) tryMove(x + moveX, z)
  if (moveZ !== 0) tryMove(x, z + moveZ)

  // --- jump -----------------------------------------------------------------
  // Read before gravity, so a jump pressed on the frame you land still fires.
  if (jump && grounded) {
    velocityY = jumpSpeed ?? JUMP_SPEED
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
  /**
   * Where the eye was when the fall started, which is not where it began the
   * frame: the step-up above may already have lifted it a whole cell, and a
   * carried rider may have been moved. Measuring the drop from `position.y`
   * instead looks right and searches from below the step you just climbed, so
   * landing puts you back at the bottom of it.
   */
  const beforeFall = y
  velocityY = Math.max(velocityY - gravity * delta, -MAX_FALL_SPEED)
  const targetY = y + velocityY * delta

  if (blocked(x, targetY, z, isSolid, blockers, topOf)) {
    if (velocityY < 0) {
      /**
       * Landed. Snapped to the surface rather than simply refusing the move: at
       * terminal velocity a frame covers most of a cell, so reverting would
       * leave you hovering wherever the frame boundary happened to fall, and
       * the gap would change with the frame rate.
       *
       * **The surface, not the cell boundary.** This used to be
       * `Math.floor(feet) + 1`, which is right for the voxel grid and wrong for
       * everything else - a box is a box, and an `auto` collider's height comes
       * from measured geometry, so its top is at 1.46 rather than at 2. Landing
       * on a crate therefore snapped the feet to the cell *above* its top and
       * left the player hovering there with `grounded` false: unable to jump,
       * standing on nothing, half a metre in the air. Every entity you can
       * stand on was affected and none of the tests noticed, because they all
       * used boxes a whole number tall.
       *
       * `surfaceUnder` already answers this for cells and boxes together and
       * takes the higher, so it is the same answer the step-up uses - which is
       * the property that matters: you climb onto a crate and you land on a
       * crate at exactly the same height.
       */
      const feet = targetY - EYE_HEIGHT
      const fell = Math.max(beforeFall - EYE_HEIGHT - feet, 0) + 1e-3
      const surface = surfaceUnder(x, beforeFall, z, isSolid, fell, blockers, topOf)
      const top = surface ?? Math.floor(feet) + 1
      y = top + EYE_HEIGHT

      /**
       * Bounced instead of landed.
       *
       * `grounded` is deliberately left false, and `motion.ts` already expects
       * that in as many words - "a body that leaves the ground on the frame it
       * touched it". Reporting grounded here would play the landing animation on
       * every arc and let the jump budget refill, so a spring would also be a
       * free double jump.
       *
       * `jumps` is not touched: the settle at the bottom of this function charges
       * an airborne body that did not jump for its ground jump, which leaves the
       * one mid-air save. That is the right answer for being launched by
       * something else, and it is the answer we get for free.
       */
      const launch = Math.max(bounce ?? 0, bounceUnder(x, z, top, bounceOf, blockers))
      if (launch > 0) {
        velocityY = jumpSpeedFor(launch, gravity)
      } else {
        velocityY = 0
        grounded = true
      }
    } else {
      // Hit a ceiling. Stop rising; do not snap, because being nudged down out
      // of a cell you were already standing in is worse than a short jump.
      y = position.y
      velocityY = 0
    }
  } else {
    y = targetY
    // Standing still on a floor keeps `grounded` true through the probe below;
    // walking off an edge clears it here.
    grounded = false
  }

  // --- out of the world -----------------------------------------------------
  /**
   * Before the floor clamp, because the clamp would catch the fall first.
   *
   * Returns rather than falling through the rest of the frame: the ground probe
   * and the jump-budget settle below both reason about where you *were* going,
   * and neither means anything about a body that is no longer there. Landing
   * ungrounded is deliberate - the spawn is a place in the world like any other,
   * so the next frame's probe decides whether it is standing on something, the
   * same way it would for a step off a ledge.
   */
  const restart = input.restart
  if (restart && y - EYE_HEIGHT < restart.below) {
    return {
      position: { x: restart.to.x, y: restart.to.y + EYE_HEIGHT, z: restart.to.z },
      velocityY: 0,
      grounded: false,
      // A full budget back. Arriving with a jump already spent would punish a
      // fall twice, and the second one lands on somebody who has just been put
      // somewhere they did not ask to be.
      jumps: 0,
      restarted: true,
    }
  }

  // --- the world's floor ----------------------------------------------------
  if (y - EYE_HEIGHT < floorY) {
    y = floorY + EYE_HEIGHT
    /**
     * The world's floor bounces too, or `player.bounce` works everywhere except
     * the ground most levels stand on.
     *
     * This clamp is not the landing branch above - it is the synthetic plane
     * that keeps an author who has not laid a floor yet from dropping out of
     * their own level - and it zeroed velocity unconditionally. A rubber world
     * whose floor is the one thing that does not give is the kind of gap that
     * reads as the setting being broken.
     *
     * Only `bounce`: a plane has no cell under it and no box at its top, so
     * there is nothing for `bounceUnder` to find that the collision branch above
     * would not have caught first.
     */
    if ((bounce ?? 0) > 0) {
      velocityY = jumpSpeedFor(bounce as number)
    } else {
      velocityY = 0
      grounded = true
    }
  }

  /**
   * Ground probe.
   *
   * Falling one frame's worth of nothing is not the same as being airborne, and
   * without this a player standing on a floor flickers between grounded and not
   * - which makes jumping fail roughly half the time. Checking a hair below the
   * feet answers "could I jump right now" directly.
   */
  if (!grounded && velocityY <= 0 && blocked(x, y - 0.02, z, isSolid, blockers, topOf)) {
    grounded = true
  }

  /**
   * Settle the jump budget against where we actually ended up.
   *
   * Landing refills it. Being airborne without having jumped - walked off a
   * ledge, knocked off one - spends the ground jump, so what is left is the one
   * mid-air save and not a fresh pair.
   */
  if (grounded) jumps = 0
  else if (jumps === 0) jumps = 1

  return { position: { x, y, z }, velocityY, grounded, jumps, restarted: false }
}
