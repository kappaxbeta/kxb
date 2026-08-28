/**
 * Provenance: copied from src/app/world/lounge/physics.test.ts alongside the
 * module it covers, per the copy rule in docs/xp/creator.md §1.2 - a copied
 * module without its tests is a copy that silently rots.
 *
 * It is also most of a test suite on day one, which is the practical reason
 * copying is affordable at all: 35 cases about corners, seams, ceilings and the
 * jump budget, none of which anyone would enjoy rediscovering.
 */
import { describe, expect, test } from 'bun:test'
import {
  type BounceTest,
  EYE_HEIGHT,
  OUT_OF_WORLD,
  GRAVITY,
  JUMP_SPEED,
  jumpSpeedFor,
  MAX_FALL_SPEED,
  MAX_JUMPS,
  PERSONAL_SPACE,
  separate,
  type Blocker,
  type SolidTest,
  step,
  type StepInput,
  type SurfaceTest,
  underfoot,
  type Vec3,
  WALK_PACE,
} from './physics'

/** A frame at 60fps. */
const FRAME = 1 / 60

const EMPTY: SolidTest = () => false

/** One solid layer filling cell y=0, i.e. the volume from y=0 to y=1. */
const FLOOR_AT_0: SolidTest = (_x, y) => y === 0

/** The floor, plus a wall of blocks along x=2 (so cells [2,3) in x). */
const FLOOR_AND_WALL: SolidTest = (x, y) => y === 0 || (x === 2 && y >= 1 && y <= 3)

function eyeAt(x: number, feet: number, z: number): Vec3 {
  return { x, y: feet + EYE_HEIGHT, z }
}

function run(
  position: Vec3,
  overrides: Partial<Parameters<typeof step>[0]> = {},
) {
  return step({
    position,
    velocityY: 0,
    moveX: 0,
    moveZ: 0,
    jump: false,
    grounded: false,
    delta: FRAME,
    isSolid: EMPTY,
    ...overrides,
  })
}

describe('gravity', () => {
  test('an unsupported player falls', () => {
    const result = run(eyeAt(0, 10, 0), { floorY: -Infinity })
    expect(result.velocityY).toBeLessThan(0)
    expect(result.position.y).toBeLessThan(10 + EYE_HEIGHT)
    expect(result.grounded).toBe(false)
  })

  test('falling speed is capped', () => {
    const result = run(eyeAt(0, 500, 0), {
      velocityY: -MAX_FALL_SPEED,
      floorY: -Infinity,
    })
    expect(result.velocityY).toBe(-MAX_FALL_SPEED)
  })

  test('one frame of fall is about g*t, not a whole block', () => {
    const result = run(eyeAt(0, 10, 0), { floorY: -Infinity })
    expect(result.velocityY).toBeCloseTo(-GRAVITY * FRAME, 5)
  })

  test('a level with its own gravity falls at its own rate', () => {
    const result = run(eyeAt(0, 10, 0), { floorY: -Infinity, gravity: 13 })
    expect(result.velocityY).toBeCloseTo(-13 * FRAME, 5)
  })

  /**
   * The invariant `jumpSpeedFor`'s gravity parameter exists for: a jump asked
   * for in cells clears those cells on any world, because the speed is derived
   * through the same gravity the fall will use. Simulated on a light world and
   * a heavy one rather than asserted from the formula, like the one-block test
   * below.
   */
  test('a jump in cells clears the same cells whatever the gravity', () => {
    for (const gravity of [13, 52]) {
      let state = { position: eyeAt(0.5, 1, 0.5), velocityY: 0, grounded: true }
      let peak = 1
      for (let frame = 0; frame < 400; frame++) {
        const result = step({
          ...state,
          moveX: 0,
          moveZ: 0,
          jump: frame === 0,
          jumpSpeed: jumpSpeedFor(1.5, gravity),
          gravity,
          delta: FRAME,
          isSolid: FLOOR_AT_0,
        })
        state = result
        peak = Math.max(peak, result.position.y - EYE_HEIGHT)
        if (frame > 0 && result.grounded) break
      }
      // A frame's worth of integration error under the theoretical 2.5, never over.
      expect(peak).toBeGreaterThan(2.3)
      expect(peak).toBeLessThan(2.6)
    }
  })
})

describe('landing', () => {
  test('a player standing on the floor layer stays put and is grounded', () => {
    // Feet at y=1 is the top of the block filling cell 0.
    const result = run(eyeAt(0.5, 1, 0.5), { isSolid: FLOOR_AT_0, grounded: true })
    expect(result.position.y).toBeCloseTo(1 + EYE_HEIGHT, 6)
    expect(result.grounded).toBe(true)
    expect(result.velocityY).toBe(0)
  })

  test('a fast fall snaps to the block surface instead of stopping mid-air', () => {
    // Falling hard from just above the floor: one frame would carry the feet
    // well below y=1, and reverting would leave the player hovering.
    const result = run(eyeAt(0.5, 1.4, 0.5), {
      velocityY: -MAX_FALL_SPEED,
      isSolid: FLOOR_AT_0,
    })
    expect(result.position.y).toBeCloseTo(1 + EYE_HEIGHT, 6)
    expect(result.grounded).toBe(true)
    expect(result.velocityY).toBe(0)
  })

  test('the world floor catches a player in a world with no blocks', () => {
    const result = run(eyeAt(0, 0.2, 0), { velocityY: -20, isSolid: EMPTY })
    expect(result.position.y).toBeCloseTo(EYE_HEIGHT, 6)
    expect(result.grounded).toBe(true)
  })
})

describe('jumping', () => {
  test('a grounded player leaves the ground', () => {
    const result = run(eyeAt(0.5, 1, 0.5), {
      isSolid: FLOOR_AT_0,
      grounded: true,
      jump: true,
    })
    expect(result.velocityY).toBeGreaterThan(0)
    expect(result.position.y).toBeGreaterThan(1 + EYE_HEIGHT)
  })

  test('an airborne player cannot jump again', () => {
    const result = run(eyeAt(0.5, 4, 0.5), {
      isSolid: FLOOR_AT_0,
      grounded: false,
      jump: true,
      floorY: -Infinity,
    })
    expect(result.velocityY).toBeLessThan(0)
  })

  /**
   * The reason JUMP_SPEED is what it is. Simulated rather than asserted from the
   * formula, so a change to gravity that quietly breaks one-block hops fails here.
   */
  test('a jump clears exactly one block', () => {
    let state = {
      position: eyeAt(0.5, 1, 0.5),
      velocityY: 0,
      grounded: true,
    }
    let peak = 1

    for (let frame = 0; frame < 200; frame++) {
      const result = step({
        ...state,
        moveX: 0,
        moveZ: 0,
        jump: frame === 0,
        delta: FRAME,
        isSolid: FLOOR_AT_0,
      })
      state = result
      peak = Math.max(peak, result.position.y - EYE_HEIGHT)
      if (frame > 0 && result.grounded) break
    }

    // Clears a one-block step, but not a two-block wall.
    expect(peak).toBeGreaterThan(2)
    expect(peak).toBeLessThan(3)
    // And comes back down to the floor.
    expect(state.position.y).toBeCloseTo(1 + EYE_HEIGHT, 6)
  })
})

describe('the second jump', () => {
  test('a pressed jump in mid-air fires', () => {
    const result = run(eyeAt(0.5, 4, 0.5), {
      isSolid: FLOOR_AT_0,
      grounded: false,
      velocityY: -2,
      jump: true,
      jumpPressed: true,
      jumps: 1,
      floorY: -Infinity,
    })
    expect(result.velocityY).toBeGreaterThan(0)
    expect(result.jumps).toBe(2)
  })

  test('it is worth the same on the way down as at the top', () => {
    const atTheTop = run(eyeAt(0.5, 4, 0.5), {
      grounded: false,
      velocityY: 0,
      jumpPressed: true,
      jumps: 1,
      floorY: -Infinity,
    })
    const plummeting = run(eyeAt(0.5, 4, 0.5), {
      grounded: false,
      velocityY: -30,
      jumpPressed: true,
      jumps: 1,
      floorY: -Infinity,
    })
    expect(plummeting.velocityY).toBeCloseTo(atTheTop.velocityY, 6)
  })

  test('there is no third jump', () => {
    const result = run(eyeAt(0.5, 4, 0.5), {
      grounded: false,
      velocityY: -2,
      jumpPressed: true,
      jumps: MAX_JUMPS,
      floorY: -Infinity,
    })
    expect(result.velocityY).toBeLessThan(0)
    expect(result.jumps).toBe(MAX_JUMPS)
  })

  /**
   * The whole reason jumps are counted rather than flagged. Holding the key
   * through a jump must not spend the mid-air one on the very next frame.
   */
  test('holding the key does not spend the second jump', () => {
    const off = run(eyeAt(0.5, 1, 0.5), {
      isSolid: FLOOR_AT_0,
      grounded: true,
      jump: true,
      jumpPressed: true,
    })
    expect(off.jumps).toBe(1)

    const stillHolding = step({
      ...off,
      moveX: 0,
      moveZ: 0,
      jump: true,
      jumpPressed: false,
      delta: FRAME,
      isSolid: FLOOR_AT_0,
    })
    expect(stillHolding.jumps).toBe(1)
    // Still on the way up under gravity alone, not re-launched.
    expect(stillHolding.velocityY).toBeLessThan(off.velocityY)
  })

  test('walking off a ledge leaves one jump, not two', () => {
    const result = run(eyeAt(0.5, 4, 0.5), {
      grounded: false,
      velocityY: -1,
      jumps: 0,
      floorY: -Infinity,
    })
    expect(result.jumps).toBe(1)
  })

  test('landing refills both jumps', () => {
    // Close enough that one frame at this speed puts the feet through the top
    // of the block, which is what "landed" means to `step`.
    const result = run(eyeAt(0.5, 1.05, 0.5), {
      isSolid: FLOOR_AT_0,
      grounded: false,
      velocityY: -8,
      jumps: MAX_JUMPS,
    })
    expect(result.grounded).toBe(true)
    expect(result.jumps).toBe(0)
  })

  test('two jumps clear more than one does', () => {
    function peakOf(second: boolean): number {
      let state = {
        position: eyeAt(0.5, 1, 0.5),
        velocityY: 0,
        grounded: true,
        jumps: 0,
      }
      let peak = 1

      for (let frame = 0; frame < 300; frame++) {
        const result = step({
          ...state,
          moveX: 0,
          moveZ: 0,
          jump: frame === 0,
          // At the apex of the first jump, near enough.
          jumpPressed: second && frame === 25,
          delta: FRAME,
          isSolid: FLOOR_AT_0,
        })
        state = result
        peak = Math.max(peak, result.position.y - EYE_HEIGHT)
        if (frame > 0 && result.grounded) break
      }
      return peak
    }

    // Over a two-block wall, which one jump cannot do - see the test above.
    expect(peakOf(true)).toBeGreaterThan(3)
    expect(peakOf(true)).toBeGreaterThan(peakOf(false))
  })
})

describe('what is underfoot', () => {
  test('the block holding you up counts', () => {
    expect(underfoot(eyeAt(0.5, 1, 0.5), FLOOR_AT_0)).toBe(true)
  })

  test('the block you are standing in front of does not', () => {
    // Feet on the floor at cell 0, wall at x=2. Nothing burning below us.
    expect(underfoot(eyeAt(1.4, 1, 0.5), (x, y) => x === 2 && y === 0)).toBe(false)
  })

  test('half a boot over the edge still counts', () => {
    // Standing at x=1.05 with a 0.3 radius overlaps cell 0 as well as cell 1.
    expect(underfoot(eyeAt(1.05, 1, 0.5), (x, y) => x === 0 && y === 0)).toBe(true)
  })

  test('a block one further down does not', () => {
    expect(underfoot(eyeAt(0.5, 1, 0.5), (_x, y) => y === -1)).toBe(false)
  })
})

describe('walls', () => {
  test('walking into a wall does not pass through it', () => {
    const result = run(eyeAt(1.4, 1, 0.5), {
      isSolid: FLOOR_AND_WALL,
      grounded: true,
      moveX: 0.5,
    })
    expect(result.position.x).toBeCloseTo(1.4, 6)
  })

  test('walking away from a wall is unobstructed', () => {
    const result = run(eyeAt(1.4, 1, 0.5), {
      isSolid: FLOOR_AND_WALL,
      grounded: true,
      moveX: -0.5,
    })
    expect(result.position.x).toBeCloseTo(0.9, 6)
  })

  /** The point of resolving axes separately. */
  test('moving diagonally into a wall slides along it', () => {
    const result = run(eyeAt(1.4, 1, 0.5), {
      isSolid: FLOOR_AND_WALL,
      grounded: true,
      moveX: 0.5,
      moveZ: 0.5,
    })
    expect(result.position.x).toBeCloseTo(1.4, 6)
    expect(result.position.z).toBeCloseTo(1.0, 6)
  })

  test('a ceiling stops a jump without shoving the player downward', () => {
    // Blocks filling cell y=3, with the player's head approaching from below.
    const ceiling: SolidTest = (_x, y) => y === 0 || y === 3
    const start = eyeAt(0.5, 1.2, 0.5)
    const result = run(start, {
      isSolid: ceiling,
      velocityY: JUMP_SPEED,
    })
    expect(result.velocityY).toBe(0)
    expect(result.position.y).toBeCloseTo(start.y, 6)
  })
})

describe('half-open cell bounds', () => {
  /**
   * Regression guard for the invisible-wall class of bug: a player flush against
   * the far face of a block must not count as inside it.
   */
  test('standing exactly on a block boundary is not a collision', () => {
    const single: SolidTest = (x, y, z) => x === 0 && y === 0 && z === 0
    // Feet at exactly y=1, the open top of the block filling cell 0.
    const result = run(eyeAt(0.5, 1, 0.5), { isSolid: single, grounded: true })
    expect(result.position.y).toBeCloseTo(1 + EYE_HEIGHT, 6)
  })

  test('a player just clear of a block in x can keep walking', () => {
    const single: SolidTest = (x, y, z) => x === 2 && y === 1 && z === 0
    // x = 1.69 puts the near edge at 1.39, comfortably clear of the block at 2.
    const result = run(eyeAt(1.69, 1, 0.5), {
      isSolid: single,
      grounded: true,
      moveX: -0.01,
    })
    expect(result.position.x).toBeCloseTo(1.68, 6)
  })
})

describe('standing in each other', () => {
  const HERE = { x: 0, y: EYE_HEIGHT, z: 0 }

  test('somebody far away is not in the way', () => {
    expect(separate(HERE, [{ x: 5, y: EYE_HEIGHT, z: 0 }])).toEqual(HERE)
  })

  test('somebody exactly a personal space away is not in the way', () => {
    const peer = { x: PERSONAL_SPACE, y: EYE_HEIGHT, z: 0 }
    expect(separate(HERE, [peer])).toEqual(HERE)
  })

  test('somebody closer pushes us out to exactly touching', () => {
    const peer = { x: 0.2, y: EYE_HEIGHT, z: 0 }
    const next = separate(HERE, [peer])

    expect(Math.hypot(next.x - peer.x, next.z - peer.z)).toBeCloseTo(PERSONAL_SPACE, 5)
  })

  test('we are pushed away from them, not toward them', () => {
    const peer = { x: 0.2, y: EYE_HEIGHT, z: 0 }
    // We are at x=0 and they are at x=0.2, so we go further negative.
    expect(separate(HERE, [peer]).x).toBeLessThan(0)
  })

  /** Being shoved up or down would ladder people into the sky or the floor. */
  test('separation is horizontal only', () => {
    const peer = { x: 0.1, y: EYE_HEIGHT, z: 0.1 }
    expect(separate(HERE, [peer]).y).toBe(HERE.y)
  })

  test('somebody standing on our head is not shoved sideways', () => {
    const peer = { x: 0, y: EYE_HEIGHT + 2, z: 0 }
    expect(separate(HERE, [peer])).toEqual(HERE)
  })

  test('exactly overlapping still separates rather than fusing', () => {
    const peer = { x: 0, y: EYE_HEIGHT, z: 0 }
    const next = separate(HERE, [peer])
    expect(Math.hypot(next.x - peer.x, next.z - peer.z)).toBeGreaterThan(0)
  })

  test('a crowd is resolved against everybody, not just the first', () => {
    const peers = [
      { x: 0.15, y: EYE_HEIGHT, z: 0 },
      { x: -0.15, y: EYE_HEIGHT, z: 0.1 },
    ]
    const next = separate(HERE, peers)

    for (const peer of peers) {
      expect(Math.hypot(next.x - peer.x, next.z - peer.z)).toBeGreaterThanOrEqual(
        PERSONAL_SPACE - 1e-9,
      )
    }
  })

  test('nobody around changes nothing', () => {
    expect(separate(HERE, [])).toEqual(HERE)
  })
})

describe('walking up a step', () => {
  /** A floor, with a one-cell block filling cell x=2 sitting on it. */
  const STEP: SolidTest = (x, y) => y === 0 || (y === 1 && x >= 2)

  /** A floor, with a two-cell wall at x=2. */
  const LEDGE_TOO_HIGH: SolidTest = (x, y) => y === 0 || ((y === 1 || y === 2) && x >= 2)

  test('a one-cell step is walked up, not stopped at', () => {
    // The whole reason this exists: the prototype kit's stairs rise exactly one
    // cell a step, so without this they are a four-cell cube with a staircase
    // painted on it.
    const before = eyeAt(1.5, 1, 0)
    const after = run(before, { moveX: 0.3, grounded: true, isSolid: STEP })
    expect(after.position.x).toBeGreaterThan(before.x)
    expect(after.position.y - EYE_HEIGHT).toBeCloseTo(2, 5)
  })

  test('two cells is a wall, not a step', () => {
    const before = eyeAt(1.5, 1, 0)
    const after = run(before, { moveX: 0.3, grounded: true, isSolid: LEDGE_TOO_HIGH })
    expect(after.position.x).toBe(before.x)
  })

  test('you cannot climb a step by holding a direction in mid-air', () => {
    // Stepping up while airborne is how this feature turns into a ladder: hold
    // a direction against a wall and rise a cell a frame. Feet at 1, so the
    // block at cell 1 is genuinely in the way rather than under the player.
    const before = eyeAt(1.5, 1, 0)
    const airborne = run(before, { moveX: 0.3, grounded: false, velocityY: -1, isSolid: STEP })
    expect(airborne.position.x).toBe(before.x)

    // The same move from the ground does step up, which is what makes the
    // check above about *being airborne* rather than about the geometry.
    const walking = run(before, { moveX: 0.3, grounded: true, isSolid: STEP })
    expect(walking.position.x).toBeGreaterThan(before.x)
  })

  test('walking into a flat wall does not read as a step every frame', () => {
    // Without the "is it actually higher" check, the probe finds the floor the
    // player is already standing on and the wall becomes climbable.
    const before = eyeAt(1.5, 0, 0)
    const after = run(before, { moveX: 0.3, grounded: true, isSolid: FLOOR_AND_WALL })
    expect(after.position.x).toBe(before.x)
    expect(after.position.y).toBe(before.y)
  })

  test('a step with nothing on top of it is not stepped onto', () => {
    // A one-cell rim around a hole: stepping up has to find a surface, or it
    // would put somebody over the gap.
    const rim: SolidTest = (x, y, z) => y === 0 && !(x === 3 && z === 0)
    const before = eyeAt(2.5, 1, 0)
    const after = run(before, { moveX: 0.4, grounded: true, isSolid: rim })
    // Walks on normally - there is nothing to step onto, and nothing blocking.
    expect(after.position.x).toBeGreaterThan(before.x)
  })
})

/**
 * Riding a moving platform.
 *
 * The feature the scripting slice asked for and did not have: a script can move
 * anything, and until this the thing it moved went straight through whoever was
 * standing on it. A demo said "a lift that carries you to a ledge no jump
 * reaches", a test said otherwise, and the blurb was changed rather than the
 * engine - which is what this replaces.
 *
 * The delta is supplied rather than inferred, because the controller has no
 * memory between frames and the platform is the authority on where it went: a
 * script may have put it anywhere at all, including somewhere no velocity would
 * have predicted.
 */
describe('being carried', () => {
  const never: SolidTest = () => false

  /** A platform, and where it was a frame ago. */
  function platform(top: number, moved: { dx?: number; dy?: number; dz?: number }): Blocker {
    return {
      minX: -2,
      maxX: 2,
      minY: top - 1,
      maxY: top,
      minZ: -2,
      maxZ: 2,
      ...moved,
    }
  }

  test('a platform going up takes you with it', () => {
    const before = eyeAt(0, 2, 0)
    const after = step({
      position: before,
      velocityY: 0,
      moveX: 0,
      moveZ: 0,
      jump: false,
      grounded: true,
      delta: 1 / 60,
      isSolid: never,
      blockers: [platform(2.05, { dy: 0.05 })],
      floorY: -50,
    })
    // Lifted onto the new surface rather than left standing in the air where it
    // used to be.
    expect(after.position.y - EYE_HEIGHT).toBeCloseTo(2.05, 5)
    expect(after.grounded).toBe(true)
  })

  test('a platform going sideways takes you with it', () => {
    const before = eyeAt(0, 2, 0)
    const after = step({
      position: before,
      velocityY: 0,
      moveX: 0,
      moveZ: 0,
      jump: false,
      grounded: true,
      delta: 1 / 60,
      isSolid: never,
      blockers: [platform(2, { dx: 0.06 })],
      floorY: -50,
    })
    expect(after.position.x).toBeCloseTo(0.06, 5)
    expect(after.position.z).toBeCloseTo(0, 5)
  })

  /**
   * Your own movement is added to the ride, not replaced by it.
   *
   * Walking forward on a platform going the other way should very nearly stand
   * still, which is the case that catches an implementation that overwrites the
   * position instead of offsetting it.
   */
  test('you can walk about on a moving platform', () => {
    const after = step({
      position: eyeAt(0, 2, 0),
      velocityY: 0,
      moveX: -0.06,
      moveZ: 0,
      jump: false,
      grounded: true,
      delta: 1 / 60,
      isSolid: never,
      blockers: [platform(2, { dx: 0.06 })],
      floorY: -50,
    })
    expect(after.position.x).toBeCloseTo(0, 5)
  })

  test('a platform you are not standing on does not take you anywhere', () => {
    const after = step({
      position: eyeAt(0, 2, 0),
      velocityY: 0,
      moveX: 0,
      moveZ: 0,
      jump: false,
      grounded: true,
      delta: 1 / 60,
      isSolid: never,
      // Its top is a long way below the feet: it is passing underneath.
      blockers: [platform(0.5, { dx: 4 }), platform(2, {})],
      floorY: -50,
    })
    expect(after.position.x).toBeCloseTo(0, 5)
  })

  /**
   * Mid-air is not riding.
   *
   * A platform sliding past under a jump must not snatch the jumper sideways -
   * which is what makes this a check on `grounded` rather than on proximity.
   */
  test('a platform passing under a jump does not catch you', () => {
    const after = step({
      position: eyeAt(0, 2, 0),
      velocityY: 3,
      moveX: 0,
      moveZ: 0,
      jump: false,
      grounded: false,
      delta: 1 / 60,
      isSolid: never,
      blockers: [platform(2, { dx: 0.5 })],
      floorY: -50,
    })
    expect(after.position.x).toBeCloseTo(0, 5)
  })

  /**
   * A box that did not move is the overwhelming majority of them, and it must
   * not read as a ride of zero that costs anything - or, worse, as a ride at
   * all once floating point is involved.
   */
  test('standing on something still is standing still', () => {
    const after = step({
      position: eyeAt(0, 2, 0),
      velocityY: 0,
      moveX: 0,
      moveZ: 0,
      jump: false,
      grounded: true,
      delta: 1 / 60,
      isSolid: never,
      blockers: [platform(2, {})],
      floorY: -50,
    })
    expect(after.position.x).toBe(0)
    expect(after.position.z).toBe(0)
    expect(after.position.y - EYE_HEIGHT).toBeCloseTo(2, 5)
  })
})

/**
 * Landing on a box, at the height the box actually is.
 *
 * This was wrong from the first day entities had colliders and no test caught
 * it, because every test box was a whole number of cells tall. A measured
 * collider is not: `Box_A` is 0.46 high, so a crate on the floor has its top at
 * 1.46, and landing snapped the feet to 2 - leaving the player hovering half a
 * metre above the crate, `grounded` false, unable to jump.
 */
describe('landing on a box rather than on a cell', () => {
  const never: SolidTest = () => false

  test.each([1.5, 1.46, 2.37, 0.8])('a box whose top is %p is where you land', (top) => {
    let position = eyeAt(0, top + 3, 0)
    let velocityY = 0
    let grounded = false
    let jumps = 0

    for (let i = 0; i < 120; i++) {
      const result = step({
        position,
        velocityY,
        moveX: 0,
        moveZ: 0,
        jump: false,
        grounded,
        jumps,
        delta: 1 / 60,
        isSolid: never,
        blockers: [{ minX: -2, maxX: 2, minY: top - 1, maxY: top, minZ: -2, maxZ: 2 }],
        floorY: -50,
      })
      position = result.position
      velocityY = result.velocityY
      grounded = result.grounded
      jumps = result.jumps
    }

    expect(position.y - EYE_HEIGHT).toBeCloseTo(top, 5)
    // Grounded is the half that matters: a player who is not grounded cannot
    // jump, and the hover looked like a rendering problem rather than a
    // collision one.
    expect(grounded).toBe(true)
  })
})

/**
 * Falling as a failure, rather than as a walk back.
 *
 * The third answer to "what is under the world". The other two were already
 * here and neither is a platformer: solid ground means you cannot fall at all,
 * and a catch forty cells down means a fall costs you the walk. A platformer is
 * a game about missing, and a miss that costs nothing is not a miss.
 */
describe('falling out of the world', () => {
  const SPAWN = { x: 3, y: 10, z: -4 }
  const nothing = () => false

  /** One frame of falling, from a body already below the line. */
  const fell = (below: number, from: number) =>
    step({
      position: { x: 50, y: from + EYE_HEIGHT, z: 50 },
      velocityY: -20,
      moveX: 0,
      moveZ: 0,
      jump: false,
      grounded: false,
      jumps: 1,
      delta: 1 / 60,
      isSolid: nothing,
      restart: { below, to: SPAWN },
    })

  test('puts you back at the start, and says it did', () => {
    const result = fell(0, -1)
    expect(result.restarted).toBe(true)
    expect(result.position).toEqual({ x: SPAWN.x, y: SPAWN.y + EYE_HEIGHT, z: SPAWN.z })
  })

  test('and it is a fall that ends, not one that continues', () => {
    const result = fell(0, -1)
    // Arriving still falling at twenty a second would drop you straight back
    // through the line you just crossed.
    expect(result.velocityY).toBe(0)
  })

  /**
   * A full jump budget back.
   *
   * Arriving with a jump already spent punishes the fall twice, and the second
   * punishment lands on somebody who has just been put somewhere they did not
   * ask to be.
   */
  test('and you arrive with your jumps back', () => {
    expect(fell(0, -1).jumps).toBe(0)
  })

  test('above the line is an ordinary frame', () => {
    const result = fell(0, 5)
    expect(result.restarted).toBe(false)
    expect(result.position.x).toBe(50)
  })

  /**
   * The ordering that makes it work at all. `floorY` clamps a fall to a solid
   * plane, so a restart checked *after* it would never see a body below the
   * line - the clamp would have put it back on top first.
   */
  test('the restart beats the floor clamp to it', () => {
    const result = step({
      position: { x: 50, y: -1 + EYE_HEIGHT, z: 50 },
      velocityY: -20,
      moveX: 0,
      moveZ: 0,
      jump: false,
      grounded: false,
      delta: 1 / 60,
      isSolid: nothing,
      floorY: -2,
      restart: { below: 0, to: SPAWN },
    })
    expect(result.restarted).toBe(true)
    expect(result.position.x).toBe(SPAWN.x)
  })

  test('without it, a fall is caught the way it always was', () => {
    const result = step({
      // Started below the plane rather than just above it: one frame at twenty
      // a second is a third of a cell, so a body at -1 does not reach -2 and
      // the clamp has nothing to do yet.
      position: { x: 50, y: -3 + EYE_HEIGHT, z: 50 },
      velocityY: -20,
      moveX: 0,
      moveZ: 0,
      jump: false,
      grounded: false,
      delta: 1 / 60,
      isSolid: nothing,
      floorY: -2,
    })
    expect(result.restarted).toBe(false)
    expect(result.grounded).toBe(true)
    expect(result.position.y).toBeCloseTo(-2 + EYE_HEIGHT, 6)
  })
})

/**
 * Standing on a floor is not standing inside it.
 *
 * A player reported being unable to move at all on one platform of a course
 * they had walked the rest of, and guessed at an invisible collider above them.
 * It was the platform under their own feet.
 *
 * Heights here are derived, not stored: the controller writes `y = surface +
 * EYE_HEIGHT` on landing and every reader recovers the feet as `y -
 * EYE_HEIGHT`. That round trip is not lossless - at `EYE_HEIGHT` 1.7, a surface
 * at 8 comes back as 7.999999999999999 - so `Math.floor` put the feet a whole
 * cell low, inside the floor, and `collides` then reported the *current*
 * position as blocked. Every direction is refused when you are already stuck.
 *
 * The loop is over every surface rather than the two that were wrong, because
 * which two are wrong is a property of `EYE_HEIGHT` and would move the day
 * anybody tunes it.
 */
describe('landing on a surface leaves you free to walk off it', () => {
  const floorAt = (surface: number): SolidTest => (_x, y) => y === surface - 1

  test('every whole-cell surface, in every direction', () => {
    for (let surface = 0; surface <= 24; surface++) {
      const isSolid = floorAt(surface)
      // Exactly what the controller writes when it lands somebody.
      const position = { x: 0.3, y: surface + EYE_HEIGHT, z: 0.4 }

      for (const [moveX, moveZ] of [
        [0.2, 0],
        [-0.2, 0],
        [0, 0.2],
        [0, -0.2],
      ]) {
        const result = step({
          position,
          velocityY: 0,
          moveX,
          moveZ,
          jump: false,
          grounded: true,
          jumps: 0,
          delta: 1 / 60,
          isSolid,
          floorY: -100,
        })
        const moved = Math.hypot(result.position.x - position.x, result.position.z - position.z)
        // The whole move, not a fraction of it: there is nothing in the way.
        expect(`surface ${surface} moved ${moved.toFixed(2)}`).toBe(`surface ${surface} moved 0.20`)
      }
    }
  })

  /**
   * And the floor is still a floor. A nudge that let somebody through it would
   * trade a stuck player for a falling one, which is worse.
   */
  test('without walking down into it', () => {
    const isSolid = floorAt(8)
    const result = step({
      position: { x: 0.3, y: 8 + EYE_HEIGHT, z: 0.4 },
      velocityY: 0,
      moveX: 0.2,
      moveZ: 0,
      jump: false,
      grounded: true,
      jumps: 0,
      delta: 1 / 60,
      isSolid,
      floorY: -100,
    })
    expect(result.position.y).toBeCloseTo(8 + EYE_HEIGHT, 6)
    expect(result.grounded).toBe(true)
  })
})

/**
 * Standing on the ground is not falling out of the world.
 *
 * Reported from production as being reset at random while playing. The catch
 * was armed at `floorY` exactly, and gravity is applied before the floor clamp,
 * so a body resting on the world's own floor is a fraction below it for the
 * instant the restart check runs.
 */
describe('the fall-out-of-the-world catch', () => {
  const floorY = 0
  const stand = (below: number) =>
    step({
      position: { x: 0, y: floorY + EYE_HEIGHT, z: 0 },
      velocityY: 0,
      grounded: true,
      jumps: 0,
      moveX: 0,
      moveZ: 0,
      jump: false,
      jumpPressed: false,
      delta: 1 / 60,
      isSolid: () => false,
      blockers: [],
      floorY,
      restart: { below, to: { x: 99, y: 0, z: 99 } },
    })

  test('armed at the floor itself, standing still restarts you — the bug', () => {
    expect(stand(floorY).restarted).toBe(true)
  })

  test('armed where the host now arms it, standing still is standing still', () => {
    const result = stand(floorY - OUT_OF_WORLD)
    expect(result.restarted).toBe(false)
    expect(result.position.x).toBe(0)
  })

  test('and a real fall is still caught', () => {
    const fell = step({
      position: { x: 4, y: floorY - 40 + EYE_HEIGHT, z: 4 },
      velocityY: -20,
      grounded: false,
      jumps: 0,
      moveX: 0,
      moveZ: 0,
      jump: false,
      jumpPressed: false,
      delta: 1 / 60,
      // No floor to land on, which is what a hole is.
      isSolid: () => false,
      blockers: [],
      floorY: floorY - 100,
      restart: { below: floorY - OUT_OF_WORLD, to: { x: 99, y: 0, z: 99 } },
    })
    expect(fell.restarted).toBe(true)
    expect(fell.position.x).toBe(99)
  })
})

/**
 * Bouncy things.
 *
 * The suite is written around the one decision that is contestable - intensity
 * is a *launch height*, not a coefficient of restitution - because that is what
 * a future reader will want to change, and the second test below is the reason
 * not to.
 */
describe('bouncing', () => {
  /** A 3-cell pad filling the floor layer. */
  const PAD: BounceTest = (_x, y) => (y === 0 ? 3 : 0)

  test('landing on a bouncy cell launches you to its height', () => {
    const result = run(eyeAt(0.5, 1.05, 0.5), {
      velocityY: -8,
      isSolid: FLOOR_AT_0,
      bounceOf: PAD,
    })
    expect(result.velocityY).toBeCloseTo(jumpSpeedFor(3), 6)
    // Left the ground on the frame it touched it, which `motion.ts` expects.
    expect(result.grounded).toBe(false)
  })

  /**
   * The whole argument for a height over a restitution, as a test.
   *
   * A trampoline gives back a fraction of what you arrived with, so these two
   * would differ by the ratio of the impact speeds. They must not: an author
   * counting cells has to get the same pad every time, whatever the approach.
   */
  test('the launch does not depend on how hard you hit it', () => {
    const gentle = run(eyeAt(0.5, 1.01, 0.5), {
      velocityY: -1,
      isSolid: FLOOR_AT_0,
      bounceOf: PAD,
    })
    const hard = run(eyeAt(0.5, 1.4, 0.5), {
      velocityY: -MAX_FALL_SPEED,
      isSolid: FLOOR_AT_0,
      bounceOf: PAD,
    })
    expect(hard.velocityY).toBeCloseTo(gentle.velocityY, 6)
    expect(hard.velocityY).toBeCloseTo(jumpSpeedFor(3), 6)
  })

  /**
   * The off-by-one that looks exactly like the feature not being wired up.
   *
   * `surfaceUnder` returns `cy + 1`, so the pad holding you up is the cell
   * *below* the surface. Asking at the surface asks the air you are standing in.
   * This test fails with a flat 0 - a silent no-bounce - rather than by throwing.
   */
  test('the pad is read from the cell holding you up, not the air above it', () => {
    const onlyCellZero: BounceTest = (_x, y) => (y === 0 ? 4 : 0)
    const result = run(eyeAt(0.5, 1.05, 0.5), {
      velocityY: -9,
      isSolid: FLOOR_AT_0,
      bounceOf: onlyCellZero,
    })
    expect(result.velocityY).toBeCloseTo(jumpSpeedFor(4), 6)
  })

  test('an entity box can be bouncy on its own', () => {
    const trampoline: Blocker = {
      minX: -1,
      minY: 0,
      minZ: -1,
      maxX: 1,
      maxY: 1,
      maxZ: 1,
      bounce: 2,
    }
    const result = run(eyeAt(0, 1.05, 0), {
      velocityY: -10,
      isSolid: EMPTY,
      blockers: [trampoline],
      floorY: -Infinity,
    })
    expect(result.velocityY).toBeCloseTo(jumpSpeedFor(2), 6)
    expect(result.grounded).toBe(false)
  })

  /**
   * Asked at the surface, which is why this works.
   *
   * A plain crate standing on a bouncy floor: you land on the crate, and the
   * pad under it is not something you are touching. A version that searched the
   * whole column instead would launch somebody off a crate that has no give in
   * it at all.
   */
  test('a dull crate over a bouncy floor does not bounce', () => {
    const crate: Blocker = { minX: -1, minY: 1, minZ: -1, maxX: 1, maxY: 2, maxZ: 1 }
    const result = run(eyeAt(0, 2.05, 0), {
      velocityY: -10,
      isSolid: FLOOR_AT_0,
      bounceOf: PAD,
      blockers: [crate],
    })
    expect(result.velocityY).toBe(0)
    expect(result.grounded).toBe(true)
    expect(result.position.y).toBeCloseTo(2 + EYE_HEIGHT, 6)
  })

  /**
   * The same claim for boxes, and the one that guards the surface test.
   *
   * The cell version above passes even without it, because a cell lookup a
   * storey off finds nothing either way. A bouncy *box* buried under a dull
   * crate is the case that only the `maxY === surface` check answers: drop the
   * check and you get launched off the top of a crate by a pad you are not
   * touching.
   */
  test('a bouncy box buried under a dull crate does not reach you', () => {
    const pad: Blocker = { minX: -1, minY: 0, minZ: -1, maxX: 1, maxY: 1, maxZ: 1, bounce: 5 }
    const crate: Blocker = { minX: -1, minY: 1, minZ: -1, maxX: 1, maxY: 2, maxZ: 1 }
    const result = run(eyeAt(0, 2.05, 0), {
      velocityY: -10,
      isSolid: EMPTY,
      blockers: [pad, crate],
      floorY: -Infinity,
    })
    expect(result.position.y).toBeCloseTo(2 + EYE_HEIGHT, 6)
    expect(result.velocityY).toBe(0)
    expect(result.grounded).toBe(true)
  })

  test('player.bounce is a floor under every landing, pads beat it', () => {
    const rubber = run(eyeAt(0.5, 1.05, 0.5), {
      velocityY: -10,
      isSolid: FLOOR_AT_0,
      bounce: 1,
    })
    expect(rubber.velocityY).toBeCloseTo(jumpSpeedFor(1), 6)

    // The pad is the more specific statement, so 3 wins over 1 rather than adding.
    const onAPad = run(eyeAt(0.5, 1.05, 0.5), {
      velocityY: -10,
      isSolid: FLOOR_AT_0,
      bounceOf: PAD,
      bounce: 1,
    })
    expect(onAPad.velocityY).toBeCloseTo(jumpSpeedFor(3), 6)
  })

  /**
   * The world's floor plane, which is a different branch from the landing above
   * and used to zero velocity unconditionally. A rubber world whose ground is
   * the one thing that does not give reads as the setting being broken.
   */
  test('the world floor bounces too', () => {
    const result = run(eyeAt(0, 0.2, 0), { velocityY: -20, isSolid: EMPTY, bounce: 2 })
    expect(result.position.y).toBeCloseTo(EYE_HEIGHT, 6)
    expect(result.velocityY).toBeCloseTo(jumpSpeedFor(2), 6)
    expect(result.grounded).toBe(false)
  })

  /**
   * Being launched is not the same as jumping.
   *
   * A bounce that refilled the budget would make every spring a free double
   * jump. The settle at the end of `step` charges an airborne body for the
   * ground jump it did not take, leaving the one mid-air save - which is the
   * right answer here and arrives without a special case.
   */
  test('a bounce leaves one mid-air jump, not a fresh pair', () => {
    const result = run(eyeAt(0.5, 1.05, 0.5), {
      velocityY: -10,
      isSolid: FLOOR_AT_0,
      bounceOf: PAD,
    })
    expect(result.jumps).toBe(MAX_JUMPS - 1)
  })

  test('a world with no pads in it lands exactly as it always did', () => {
    const result = run(eyeAt(0.5, 1.4, 0.5), {
      velocityY: -MAX_FALL_SPEED,
      isSolid: FLOOR_AT_0,
      bounceOf: () => 0,
    })
    expect(result.velocityY).toBe(0)
    expect(result.grounded).toBe(true)
  })

  /**
   * A guard on the restructure rather than on the feature: the ceiling case used
   * to share one `velocityY = 0` with the landing case, and splitting them is
   * how a rising player quietly keeps their upward speed against a ceiling.
   */
  test('a ceiling still stops a rising player', () => {
    const lid: SolidTest = (_x, y) => y === 0 || y === 4
    const result = run(eyeAt(0.5, 2.9, 0.5), {
      velocityY: JUMP_SPEED,
      isSolid: lid,
      bounce: 3,
    })
    expect(result.velocityY).toBe(0)
  })
})

/**
 * Standing on a floor thinner than its cell.
 *
 * The controller half of `Solids.topOf`. Reported three times as a body hanging
 * in the air over the floor it is standing on, and correctly diagnosed by the
 * reporter: a tile 0.500 tall fills the cell from 0 to 1, and standing on the
 * cell puts the feet half a metre above the art.
 *
 * The second test is the one that matters more. Once the feet are at 0.5 they
 * are *inside* the cell that carries the tile, so a `blocked` that only knows
 * cells reports the body as buried and refuses every move it tries - which is a
 * player who cannot walk, a worse bug than the one being fixed.
 */
describe('a floor thinner than its cell', () => {
  /** One tile, 0.5 tall, filling the cell from 0 to 1 across a wide field. */
  const isSolid: SolidTest = (x, y, z) => y === 0 && x >= -8 && x <= 8 && z >= -8 && z <= 8
  const topOf: SurfaceTest = (_x, y) => (y === 0 ? 0.5 : y + 1)

  const settle = (over: Partial<StepInput> = {}) => {
    let position = { x: 0, y: 4 + EYE_HEIGHT, z: 0 }
    let velocityY = 0
    let grounded = false
    let jumps = 0
    for (let i = 0; i < 120; i++) {
      const result = step({
        position,
        velocityY,
        moveX: 0,
        moveZ: 0,
        jump: false,
        grounded,
        jumps,
        delta: 1 / 60,
        isSolid,
        floorY: -100,
        ...over,
      })
      position = result.position
      velocityY = result.velocityY
      grounded = result.grounded
      jumps = result.jumps
    }
    return { position, grounded }
  }

  test('you land on the tile rather than on the cell holding it', () => {
    const { position, grounded } = settle({ topOf })
    expect(grounded).toBe(true)
    expect(position.y - EYE_HEIGHT).toBeCloseTo(0.5, 4)
  })

  test('and without a surface it is the cell, exactly as it always was', () => {
    // Every caller written before this - and every test above - keeps the
    // behaviour it had. Which is also the shape of the bug, stated once.
    const { position } = settle()
    expect(position.y - EYE_HEIGHT).toBeCloseTo(1, 4)
  })

  test('standing on it, you can still walk: the feet are not buried', () => {
    /**
     * The failure that would have been worse than the float. The feet at 0.5 sit
     * inside the solid cell, so a `blocked` that only knows cells says the body
     * is inside geometry and refuses every direction - the "locked in place at
     * two specific heights" bug, back by a different route.
     */
    const settled = settle({ topOf })
    let position = settled.position
    for (let i = 0; i < 30; i++) {
      const result = step({
        position,
        velocityY: 0,
        moveX: (WALK_PACE * 1) / 60,
        moveZ: 0,
        jump: false,
        grounded: true,
        jumps: 0,
        delta: 1 / 60,
        isSolid,
        topOf,
        floorY: -100,
      })
      position = result.position
    }
    expect(position.x).toBeGreaterThan(2)
    expect(position.y - EYE_HEIGHT).toBeCloseTo(0.5, 4)
  })

  test('and a thin tile is not a step you have to climb', () => {
    /**
     * Walking from a full-height cell onto a half-height one used to be a step
     * *down* of half a cell that the grid could not see at all. It is now an
     * ordinary descent, and the point of the test is that it is not refused as a
     * wall on the way.
     */
    const mixed: SolidTest = (x, y) => (x < 0 ? y === 0 : y === 0)
    const tops: SurfaceTest = (x, y) => (y === 0 ? (x < 0 ? 1 : 0.5) : y + 1)
    let position = { x: -2, y: 1 + EYE_HEIGHT, z: 0 }
    let velocityY = 0
    let grounded = true
    for (let i = 0; i < 60; i++) {
      const result = step({
        position,
        velocityY,
        moveX: (WALK_PACE * 1) / 60,
        moveZ: 0,
        jump: false,
        grounded,
        jumps: 0,
        delta: 1 / 60,
        isSolid: mixed,
        topOf: tops,
        floorY: -100,
      })
      position = result.position
      velocityY = result.velocityY
      grounded = result.grounded
    }
    expect(position.x).toBeGreaterThan(1)
    expect(position.y - EYE_HEIGHT).toBeCloseTo(0.5, 4)
  })
})
