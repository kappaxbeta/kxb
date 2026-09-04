import { describe, expect, test } from 'bun:test'
import {
  type Deck,
  EYE_HEIGHT,
  GRAVITY,
  JUMP_SPEED,
  MAX_FALL_SPEED,
  MAX_JUMPS,
  PERSONAL_SPACE,
  PLAYER_RADIUS,
  separate,
  type SolidTest,
  step,
  underfoot,
  type Vec3,
} from '@/app/world/lounge/_sim/physics'

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

/**
 * Walking up a step, which the lounge could not do at all.
 *
 * The reported shape was "at some blocks standing between them i cant move
 * forward or backward": every block edge was a hard wall, so a one-deep dip was
 * somewhere you had to jump out of. The XP engine has always stepped; these
 * pin the lounge to the same behaviour.
 */
describe('stepping up', () => {
  /** The floor, plus one block of kerb filling cell x=2 at y=1. */
  const KERB: SolidTest = (x, y) => y === 0 || (x === 2 && y === 1)

  /** The floor, and a two-high wall at x=2 - still a wall, not a step. */
  const TWO_HIGH: SolidTest = (x, y) => y === 0 || (x === 2 && (y === 1 || y === 2))

  test('walks up a single block instead of stopping against it', () => {
    // Standing on the floor at x=1.5, walking towards the kerb at cell 2.
    const result = run(eyeAt(1.5, 1, 0.5), {
      isSolid: KERB,
      grounded: true,
      moveX: 0.4,
    })

    expect(result.position.x).toBeGreaterThan(1.5)
    // Up onto the kerb's top, which is the top of cell 1.
    expect(result.position.y - EYE_HEIGHT).toBeCloseTo(2, 5)
  })

  test('two blocks is still a wall', () => {
    const result = run(eyeAt(1.5, 1, 0.5), {
      isSolid: TWO_HIGH,
      grounded: true,
      moveX: 0.4,
    })

    expect(result.position.x).toBeCloseTo(1.5, 5)
  })

  test('does not step in mid-air, or a held direction climbs the wall', () => {
    const result = run(eyeAt(1.5, 1, 0.5), {
      isSolid: KERB,
      grounded: false,
      moveX: 0.4,
    })

    expect(result.position.x).toBeCloseTo(1.5, 5)
  })

  test('a step needs headroom to fit through', () => {
    // The kerb, with a ceiling directly over it.
    const roofed: SolidTest = (x, y) =>
      y === 0 || (x === 2 && (y === 1 || y === 2 || y === 3))

    const result = run(eyeAt(1.5, 1, 0.5), {
      isSolid: roofed,
      grounded: true,
      moveX: 0.4,
    })

    expect(result.position.x).toBeCloseTo(1.5, 5)
  })

  test('walking at a flat wall does not read as a step every frame', () => {
    // FLOOR_AND_WALL is three blocks tall at x=2: nothing to step onto, and the
    // floor already underfoot must not count as a surface.
    const result = run(eyeAt(1.5, 1, 0.5), {
      isSolid: FLOOR_AND_WALL,
      grounded: true,
      moveX: 0.4,
    })

    expect(result.position.x).toBeCloseTo(1.5, 5)
    expect(result.position.y - EYE_HEIGHT).toBeCloseTo(1, 5)
  })

  test('walks out of a one-deep dip it used to be stuck in', () => {
    // A trench: floor at y=0, with raised ground on both banks at cell y=1.
    // The far bank runs on rather than being one block wide - a single block
    // would be a step up followed immediately by a step off, and the fall on
    // the far side is not what this is measuring.
    const trench: SolidTest = (x, y) =>
      y === 0 || ((x <= 0 || x >= 2) && y === 1)

    let position = eyeAt(1.5, 1, 0.5)
    let grounded = true
    // Threaded, as the real controller does: a step lifts the body clear of the
    // ground for a frame, and dropping the velocity each time would leave it
    // permanently mid-fall instead of letting it land.
    let velocityY = 0
    // A few frames of holding "forward", as somebody would.
    for (let frame = 0; frame < 20; frame++) {
      const result = step({
        position,
        velocityY,
        moveX: 0.12,
        moveZ: 0,
        jump: false,
        grounded,
        delta: FRAME,
        isSolid: trench,
      })
      position = result.position
      grounded = result.grounded
      velocityY = result.velocityY
    }

    // Out of the trench and standing on the raised bank.
    expect(position.x).toBeGreaterThan(2)
    expect(position.y - EYE_HEIGHT).toBeCloseTo(2, 5)
  })
})

/**
 * Getting out of somewhere you should never have been.
 *
 * Reported as "on xo you get stuck sometimes" and "lobby world player,
 * sometimes you get stuck". Every candidate move is collision-tested, so from
 * *inside* a block every candidate fails and the body is frozen for good. These
 * pin the escape hatch that resolves it - see `escapeFrom`.
 */
describe('being stuck inside something', () => {
  test('walled in on both body cells, and freed', () => {
    // Floor, plus blocks filling both the cells a standing body occupies.
    const boxed: SolidTest = (_x, y) => y === 0 || y === 1 || y === 2

    const result = run(eyeAt(0.5, 1, 0.5), { isSolid: boxed, grounded: true })

    // Somewhere other than inside the blocks. Before the escape this stayed
    // exactly where it was, forever.
    const moved =
      Math.abs(result.position.x - 0.5) > 1e-6 ||
      Math.abs(result.position.z - 0.5) > 1e-6 ||
      result.position.y - EYE_HEIGHT > 1
    expect(moved).toBe(true)
  })

  test('shoved into a wall by another body, and freed', () => {
    // A wall filling every cell from x=1 outwards.
    const wall: SolidTest = (x, y) => y === 0 || (x >= 1 && y >= 1 && y <= 3)

    // `separate` knows nothing about walls, so a bump puts the body a third of
    // a block inside this one - the lobby case, which needs a crowd and is
    // therefore "sometimes".
    const shoved = separate({ x: 0.6, y: 1 + EYE_HEIGHT, z: 0.5 }, [
      { x: 0.35, y: 1 + EYE_HEIGHT, z: 0.5 },
    ])
    expect(shoved.x + PLAYER_RADIUS).toBeGreaterThan(1)

    const result = run(eyeAt(shoved.x, 1, 0.5), { isSolid: wall, grounded: true })

    // Back out of the wall rather than on top of it: the smallest correction
    // that works is the one taken.
    expect(result.position.x + PLAYER_RADIUS).toBeLessThanOrEqual(1)
    expect(result.position.y - EYE_HEIGHT).toBeLessThan(2)
  })

  test('a body standing in the open is not moved by any of this', () => {
    const result = run(eyeAt(0.5, 1, 0.5), { isSolid: FLOOR_AT_0, grounded: true })

    expect(result.position.x).toBeCloseTo(0.5, 10)
    expect(result.position.z).toBeCloseTo(0.5, 10)
    expect(result.position.y - EYE_HEIGHT).toBeCloseTo(1, 10)
  })

  test('buried with nothing in reach, it stays put rather than teleporting', () => {
    // Solid everywhere: there is no honest answer, and inventing one would move
    // somebody across the world. The rail's unstick control is the way out.
    const solid: SolidTest = () => true

    const result = run(eyeAt(0.5, 1, 0.5), { isSolid: solid, grounded: true })

    expect(result.position.x).toBeCloseTo(0.5, 10)
    expect(result.position.z).toBeCloseTo(0.5, 10)
  })
})

describe('riding a moving deck', () => {
  /**
   * A lift: three cells across, one thick, top face at `top`.
   *
   * Solid and deck reported the way `lounge-things.tsx` reports them - the
   * cells stop at the last whole one *beneath* the surface, and the surface
   * itself is the deck. Getting these two out of step is the bug this suite
   * exists to hold shut: cells that claim the top slab put the rider inside
   * solid geometry, and the shove out of it is what "i get lifted but i am not
   * on the object" was.
   */
  function lift(top: number) {
    const bottom = top - 1
    const solid: SolidTest = (x, y, z) =>
      x >= -2 && x <= 1 && z >= -2 && z <= 1 && y >= Math.floor(bottom) && y < Math.floor(top)
    const deck = (
      x: number,
      z: number,
      radius: number,
      lowest: number,
      highest: number,
    ): Deck | null => {
      if (top < lowest || top > highest) return null
      if (x + radius <= -1.5 || x - radius >= 1.5) return null
      if (z + radius <= -1.5 || z - radius >= 1.5) return null
      return { id: 'lift', top, minX: -1.5, minZ: -1.5 }
    }
    return { isSolid: solid, deckUnder: deck }
  }

  test('a rider stands on the deck, not on the cell below it', () => {
    const result = run(eyeAt(0, 1.3, 0), { ...lift(1.3), grounded: true })

    // Exactly the drawn surface. The old cell path answered 1.
    expect(result.position.y - EYE_HEIGHT).toBeCloseTo(1.3, 10)
    expect(result.grounded).toBe(true)
    expect(result.riding).toBe(true)
  })

  test('a rising lift carries the body instead of shoving it', () => {
    let body = { position: eyeAt(0, 1, 0), velocityY: 0, grounded: true, jumps: 0 }
    let worst = 0

    // Four cells over three seconds, the shape `freshLift` describes, at the
    // constant speed that makes the arithmetic checkable.
    for (let i = 1; i <= 180; i++) {
      const top = 1 + (4 * i) / 180
      body = step({
        ...body,
        moveX: 0,
        moveZ: 0,
        jump: false,
        delta: FRAME,
        ...lift(top),
      })
      worst = Math.max(worst, Math.abs(body.position.y - EYE_HEIGHT - top))
      // Never pushed off the platform, which is what `escapeFrom` used to do
      // to anybody on a lift narrow enough for sideways to be the cheap way out.
      expect(body.position.x).toBeCloseTo(0, 10)
      expect(body.position.z).toBeCloseTo(0, 10)
    }

    // On the deck every single frame. Before decks the gap swung ±0.5 and the
    // body climbed in whole-cell steps.
    expect(worst).toBeLessThan(1e-9)
    expect(body.grounded).toBe(true)
  })

  test('a descending lift is followed down rather than fallen off', () => {
    let body = { position: eyeAt(0, 5, 0), velocityY: 0, grounded: true, jumps: 0 }

    for (let i = 1; i <= 180; i++) {
      const top = 5 - (4 * i) / 180
      body = step({ ...body, moveX: 0, moveZ: 0, jump: false, delta: FRAME, ...lift(top) })
      expect(body.position.y - EYE_HEIGHT).toBeCloseTo(top, 10)
    }

    // And it arrives home with the rider on it, rather than a cell above it -
    // which is where the cell path parked everybody for good.
    expect(body.position.y - EYE_HEIGHT).toBeCloseTo(1, 10)
  })

  test('a rider can still jump off', () => {
    const jumped = run(eyeAt(0, 1.3, 0), { ...lift(1.3), grounded: true, jump: true })
    expect(jumped.velocityY).toBeGreaterThan(0)
    expect(jumped.grounded).toBe(false)

    // And is not snapped straight back down onto it on the way up.
    const rising = run(eyeAt(0, 1.4, 0), { ...lift(1.3), velocityY: JUMP_SPEED, grounded: false })
    expect(rising.position.y - EYE_HEIGHT).toBeGreaterThan(1.4)
    expect(rising.riding).toBeFalsy()
  })

  test('a deck out of reach is not stood on', () => {
    // Well above: a crusher on its way up must not fish somebody off the floor.
    const high = run(eyeAt(0, 0, 0), { ...lift(3), grounded: true, floorY: 0 })
    expect(high.position.y - EYE_HEIGHT).toBeCloseTo(0, 10)
    expect(high.riding).toBeFalsy()

    // And well below: a lift that has dropped away leaves you falling.
    const low = run(eyeAt(0, 5, 0), { ...lift(1), grounded: true, floorY: -50 })
    expect(low.position.y - EYE_HEIGHT).toBeLessThan(5)
    expect(low.riding).toBeFalsy()
  })

  test('a room with nothing moving in it behaves exactly as before', () => {
    const withDeck = run(eyeAt(0.5, 1, 0.5), {
      isSolid: FLOOR_AT_0,
      grounded: true,
      deckUnder: () => null,
    })
    const without = run(eyeAt(0.5, 1, 0.5), { isSolid: FLOOR_AT_0, grounded: true })

    expect(withDeck.position.y).toBeCloseTo(without.position.y, 10)
    expect(withDeck.grounded).toBe(without.grounded)
    expect(withDeck.riding).toBeFalsy()
  })
})
