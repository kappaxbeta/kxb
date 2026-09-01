import { describe, expect, test } from 'bun:test'
import {
  ARRIVAL_CELLS,
  arrivalCell,
  SPAWN_RADIUS,
  spawnPoint,
  startingOrder,
  standingSurface,
  surfaceAt,
} from '@/app/world/lounge/_sim/spawn'
import { ARRIVAL_STEP } from '@/app/world/lounge/_sim/spawn'
import { STARTERS } from '@/domain/builder/starters'
import { toBlocks } from '@/domain/worlds/blocks'

const ALICE = '11111111-1111-4111-8111-111111111111'
const BOB = '22222222-2222-4222-8222-222222222222'
const CAROL = '33333333-3333-4333-8333-333333333333'
const DAVE = '44444444-4444-4444-8444-444444444444'

describe('spawn points', () => {
  test('one fighter starts in the middle', () => {
    expect(spawnPoint({ index: 0, total: 1 })).toEqual({ x: 0, z: 0 })
  })

  test('an empty roster does not blow up', () => {
    expect(spawnPoint({ index: 0, total: 0 })).toEqual({ x: 0, z: 0 })
  })

  /** The bug this whole module exists for. */
  test('no two fighters start on the same square', () => {
    const total = 8
    const seen = new Set<string>()

    for (let index = 0; index < total; index++) {
      const point = spawnPoint({ index, total })
      seen.add(`${point.x},${point.z}`)
    }

    expect(seen.size).toBe(total)
  })

  test('everybody starts about a ring radius from the middle', () => {
    for (let index = 0; index < 6; index++) {
      const point = spawnPoint({ index, total: 6 })
      // Rounded to whole blocks, so allow a block of slack.
      expect(Math.hypot(point.x, point.z)).toBeCloseTo(SPAWN_RADIUS, 0)
    }
  })

  /** Nobody should open already within reach of somebody else. */
  test('two fighters start well apart', () => {
    const a = spawnPoint({ index: 0, total: 2 })
    const b = spawnPoint({ index: 1, total: 2 })
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(SPAWN_RADIUS)
  })

  test('the same slot always gives the same square', () => {
    expect(spawnPoint({ index: 3, total: 7 })).toEqual(spawnPoint({ index: 3, total: 7 }))
  })
})

describe('starting order', () => {
  test('is stable regardless of the order the roster arrived in', () => {
    const one = startingOrder([{ userId: BOB }, { userId: ALICE }])
    const two = startingOrder([{ userId: ALICE }, { userId: BOB }])
    expect(one).toEqual(two)
  })

  /**
   * A team spread around the ring with an opponent between each pair is not a
   * team match - so sides are kept together.
   */
  test('team-mates end up next to each other', () => {
    const order = startingOrder([
      { userId: ALICE, side: 'red' },
      { userId: BOB, side: 'blue' },
      { userId: CAROL, side: 'red' },
      { userId: DAVE, side: 'blue' },
    ])

    const reds = [ALICE, CAROL].map((id) => order.indexOf(id)).sort((a, b) => a - b)
    // Adjacent in the order, so adjacent on the ring.
    expect(reds[1]! - reds[0]!).toBe(1)
  })

  test('everybody appears exactly once', () => {
    const order = startingOrder([
      { userId: ALICE, side: 'red' },
      { userId: BOB, side: 'blue' },
      { userId: CAROL },
    ])
    expect(new Set(order).size).toBe(3)
  })

  test('a free-for-all with no sides still orders stably', () => {
    expect(startingOrder([{ userId: CAROL }, { userId: ALICE }, { userId: BOB }])).toEqual([
      ALICE,
      BOB,
      CAROL,
    ])
  })
})

describe('the ground under a spawn', () => {
  test('an empty column falls back to the floor', () => {
    expect(surfaceAt([], 9, 0)).toBe(0)
  })

  test('stands on top of the highest block in that column', () => {
    const blocks = [
      { x: 9, y: 0, z: 0 },
      { x: 9, y: 1, z: 0 },
    ]
    expect(surfaceAt(blocks, 9, 0)).toBe(2)
  })

  /** Otherwise a tower somewhere else launches you into the sky. */
  test('ignores blocks in other columns', () => {
    const blocks = [{ x: 0, y: 40, z: 0 }]
    expect(surfaceAt(blocks, 9, 0)).toBe(0)
  })

  /**
   * The race's version of the question, which is a different one.
   *
   * A start line with something built over or around it - a wall, an arch, a
   * grandstand - has a column whose highest block is nowhere anybody should be
   * standing. Left uncapped, the grid put racers on the roof: outside the
   * course, above the field they were meant to line up on.
   */
  describe('with a ceiling, for a course somebody has built around', () => {
    const walled = [
      { x: 9, y: 0, z: 0 },
      // The wall, going up from the same floor.
      { x: 9, y: 1, z: 0 },
      { x: 9, y: 2, z: 0 },
    ]

    test('stands on the floor rather than on top of the wall', () => {
      expect(surfaceAt(walled, 9, 0, 0, 1)).toBe(1)
    })

    test('without one, the wall still wins - the old behaviour is untouched', () => {
      expect(surfaceAt(walled, 9, 0)).toBe(3)
    })

    test('a block whose top is level with the ceiling is still floor', () => {
      expect(surfaceAt([{ x: 9, y: 0, z: 0 }], 9, 0, 0, 1)).toBe(1)
    })

    test('a column with nothing low enough falls back to the world floor', () => {
      const overhead = [{ x: 9, y: 8, z: 0 }]
      expect(surfaceAt(overhead, 9, 0, 0, 1)).toBe(0)
    })

    test('a raised course stands on the raised ground, not the floor', () => {
      const platform = [
        { x: 9, y: 0, z: 0 },
        { x: 9, y: 1, z: 0 },
        // A roof over the platform, which must not be mistaken for it.
        { x: 9, y: 6, z: 0 },
      ]
      expect(surfaceAt(platform, 9, 0, 0, 2)).toBe(2)
    })
  })
})

/**
 * Arriving at a world's own spawn point, rather than at the origin.
 *
 * Different problem from the battle ring above: there the roster is known and
 * everybody is placed at once, and here people wander in one at a time knowing
 * nothing about each other.
 */
describe('arrivals at a door', () => {
  const at = (cell: { x: number; z: number }) => `${cell.x},${cell.z}`

  test('the same person always lands in the same place', () => {
    const anchor = { x: 10, z: -4 }
    expect(arrivalCell(anchor, ALICE)).toEqual(arrivalCell(anchor, ALICE))
  })

  test('you arrive around the door, not somewhere else', () => {
    const anchor = { x: 30, z: 30 }
    for (const who of [ALICE, BOB, CAROL, DAVE]) {
      const cell = arrivalCell(anchor, who)
      expect(Math.abs(cell.x - anchor.x)).toBeLessThanOrEqual(4)
      expect(Math.abs(cell.z - anchor.z)).toBeLessThanOrEqual(4)
    }
  })

  /** The bug this half of the module exists for: a room filling up as one pile. */
  test('a roomful spreads out when the caller knows who is standing where', () => {
    const anchor = { x: 0, z: 0 }
    const taken = new Set<string>()

    for (let index = 0; index < 12; index++) {
      const cell = arrivalCell(anchor, `user-${index}`, taken)
      expect(taken.has(at(cell))).toBe(false)
      taken.add(at(cell))
    }

    expect(taken.size).toBe(12)
  })

  test('an occupied cell is stepped over', () => {
    const anchor = { x: 0, z: 0 }
    const mine = arrivalCell(anchor, ALICE)
    expect(arrivalCell(anchor, ALICE, new Set([at(mine)]))).not.toEqual(mine)
  })

  // Somebody has to stand somewhere: a join path cannot refuse to place you.
  test('a full doorway still places you', () => {
    const anchor = { x: 5, z: 5 }
    const everywhere = new Set(
      ARRIVAL_CELLS.map((cell) => at({ x: anchor.x + cell.x, z: anchor.z + cell.z })),
    )
    const cell = arrivalCell(anchor, ALICE, everywhere)

    expect(Number.isFinite(cell.x)).toBe(true)
    expect(Math.abs(cell.x - anchor.x)).toBeLessThanOrEqual(4)
  })

  test('one person stands in the doorway itself', () => {
    expect(ARRIVAL_CELLS[0]).toEqual({ x: 0, z: 0 })
  })

  /**
   * The island, which is where the door's remembered height was still not
   * enough on its own.
   *
   * The spread reaches four cells and the island is three wide, so the hash
   * sends most people over the edge - and a cell over the edge has no surface
   * at the door's height, so the arrival drops to the world floor. Honouring
   * the height and landing on the ground anyway is what "the height is ignored"
   * looks like from inside the room.
   */
  describe('and only onto ground beside the door', () => {
    const anchor = { x: 0, z: 0 }
    // A three-by-three island: the anchor and the eight cells touching it.
    const island = new Set(['-1,-1', '-1,0', '-1,1', '0,-1', '0,0', '0,1', '1,-1', '1,0', '1,1'])
    const onIsland = (cell: { x: number; z: number }) => island.has(`${cell.x},${cell.z}`)

    test('everybody lands on the island rather than under it', () => {
      for (const who of [ALICE, BOB, CAROL, DAVE, 'user-9', 'user-17']) {
        expect(onIsland(arrivalCell(anchor, who, undefined, onIsland))).toBe(true)
      }
    })

    test('it still spreads across what there is', () => {
      const taken = new Set<string>()
      for (let index = 0; index < 6; index++) {
        const cell = arrivalCell(anchor, `user-${index}`, taken, onIsland)
        taken.add(at(cell))
      }
      // Not everybody on the anchor: the test narrows the ring, it does not
      // collapse it.
      expect(taken.size).toBeGreaterThan(1)
    })

    test('a door on a single block puts you on that block', () => {
      const only = (cell: { x: number; z: number }) => cell.x === 0 && cell.z === 0
      expect(arrivalCell(anchor, ALICE, undefined, only)).toEqual({ x: 0, z: 0 })
    })

    /**
     * Nowhere works, including the door - the block it stood on was broken
     * while nobody was in the room. Somebody still has to be placed.
     */
    test('nowhere to stand still places you', () => {
      const cell = arrivalCell(anchor, ALICE, undefined, () => false)
      expect(Math.abs(cell.x - anchor.x)).toBeLessThanOrEqual(4)
      expect(Math.abs(cell.z - anchor.z)).toBeLessThanOrEqual(4)
    })

    // Open ground is the case the spread was written for, and it is untouched.
    test('without a test, the spread is the hash it always was', () => {
      for (const who of [ALICE, BOB, CAROL, DAVE]) {
        expect(arrivalCell(anchor, who, undefined, undefined)).toEqual(arrivalCell(anchor, who))
      }
    })
  })
})

/**
 * The door's version of the question.
 *
 * A race can cap the search at its start mark's own height, because a mark
 * records where it was placed. A door cannot - `world_spawns` deliberately
 * stores no height - so instead of being told where the ground is, this works it
 * out: the lowest surface in the column with room for a body above it.
 */
describe('where a person can actually stand', () => {
  const FLOOR = { x: 4, y: 0, z: 4 }

  test('open ground is the ground', () => {
    expect(standingSurface([FLOOR], 4, 4)).toBe(1)
  })

  test('an empty column is the world floor', () => {
    expect(standingSurface([], 4, 4)).toBe(0)
  })

  /** The bug: a roof over the door used to be the surface people arrived on. */
  test('a roof overhead does not become the floor', () => {
    const roofed = [FLOOR, { x: 4, y: 5, z: 4 }]
    expect(standingSurface(roofed, 4, 4)).toBe(1)
  })

  test('and the old rule would have put them on it', () => {
    const roofed = [FLOOR, { x: 4, y: 5, z: 4 }]
    expect(surfaceAt(roofed, 4, 4)).toBe(6)
  })

  /**
   * The case the old rule existed for, which must keep working: a solid tower
   * has no gap inside it, so every surface but the top fails the headroom check.
   */
  test('a solid tower is still climbed to the top', () => {
    const tower = [0, 1, 2, 3].map((y) => ({ x: 4, y, z: 4 }))
    expect(standingSurface(tower, 4, 4)).toBe(4)
  })

  test('a ceiling one cell above the floor is not standing room', () => {
    // Floor at 1, and a slab at 2 - a body needs two clear cells, so this
    // column's only real surface is the top of the slab.
    const squashed = [FLOOR, { x: 4, y: 2, z: 4 }]
    expect(standingSurface(squashed, 4, 4)).toBe(3)
  })

  test('the lowest room wins, not the highest', () => {
    // A floor, a ceiling, and another floor above it. Both are standable; the
    // one somebody meant when they marked the door below is the lower.
    const twoStorey = [
      FLOOR,
      { x: 4, y: 4, z: 4 },
      { x: 4, y: 5, z: 4 },
    ]
    expect(standingSurface(twoStorey, 4, 4)).toBe(1)
  })

  test('ignores other columns, like every other reading of the ground', () => {
    expect(standingSurface([{ x: 0, y: 40, z: 0 }], 4, 4)).toBe(0)
  })
})

/**
 * A door on a floating island.
 *
 * The reported shape was "if you on the floating island try to set it somewhere
 * on the island its go to the floor". A spawn used to be a floor tile with no
 * height, and `standingSurface` answers with the *lowest* clear surface in the
 * column - which under anything floating is the world floor, however far below
 * the thing you were standing on it is.
 */
describe('a remembered height', () => {
  /** The world floor at y=0, and an island filling y=20 in the same column. */
  const ISLAND = [
    { x: 4, y: 0, z: 4 },
    { x: 4, y: 20, z: 4 },
  ]

  test('without one, the arrival is the ground under the island', () => {
    expect(standingSurface(ISLAND, 4, 4)).toBe(1)
  })

  test('with one, the arrival is the island it was set on', () => {
    // Standing on the island means feet at 21 - the top of the block at 20.
    expect(standingSurface(ISLAND, 4, 4, undefined, undefined, 21)).toBe(21)
  })

  test('a door set on the ground still arrives on the ground', () => {
    expect(standingSurface(ISLAND, 4, 4, undefined, undefined, 1)).toBe(1)
  })

  test('the nearest surface, when the block it was set on has gone', () => {
    // The island was broken since; 21 no longer exists, so the ground is what
    // is left rather than an arrival inside nothing.
    expect(standingSurface([{ x: 4, y: 0, z: 4 }], 4, 4, undefined, undefined, 21)).toBe(1)
  })

  test('never picks a surface without headroom, and stays near', () => {
    // A slab laid on the island's top: 21 is no longer somewhere a body fits,
    // so the preference falls through to the nearest surface that is - which is
    // the top of the slab at 22, one block from where the door was set.
    //
    // Emphatically not the ground: dropping somebody twenty-one blocks because
    // a single block was laid where they were standing is the bug this whole
    // change exists to stop, and "nearest" has to mean nearest in both
    // directions for that to hold.
    const roofed = [
      { x: 4, y: 0, z: 4 },
      { x: 4, y: 20, z: 4 },
      { x: 4, y: 21, z: 4 },
    ]
    expect(standingSurface(roofed, 4, 4, undefined, undefined, 21)).toBe(22)
  })

  test('a tie goes to the higher surface, not the ground', () => {
    // Surfaces at 1 and 3; a door remembered at 2 is equidistant. It was set on
    // something built, so the thing built wins.
    const step = [
      { x: 4, y: 0, z: 4 },
      { x: 4, y: 2, z: 4 },
    ]
    expect(standingSurface(step, 4, 4, undefined, undefined, 2)).toBe(3)
  })
})

/**
 * A door over open air.
 *
 * The other half of the island, and the one a published world actually hits: a
 * `BuilderWorld` stores two numbers for its door and no height at all, so a
 * world copied into a space arrives with no remembered height to lean on. Three
 * of the catalogue's own worlds - the island, the parkour tower and the parkour
 * race - put their door on something raised, and the lowest-clear-surface rule
 * sent every visitor to y=0, which in those columns is open air below the thing
 * they were meant to be standing on. Reported as the arrival being on 0.
 */
describe('a floor with nothing under it', () => {
  /** An island filling y=20..23, and nothing at all beneath it. */
  const ISLAND = [20, 21, 22, 23].map((y) => ({ x: 4, y, z: 4 }))

  test('is not where somebody arrives when the column has a top', () => {
    expect(standingSurface(ISLAND, 4, 4)).toBe(24)
  })

  test('a column with nothing in it is still the world floor', () => {
    // Off the island's edge, and the only surface there is. This is what the
    // spread's `standable` test is measured against - see `arrivalCell`.
    expect(standingSurface(ISLAND, 9, 9)).toBe(0)
  })

  /**
   * And the tower, which is why this is "the lowest block-top" and not "the
   * top". The parkour's door column is a low platform with the tower's own
   * landings far above it; the door was set on the platform.
   */
  test('the lowest thing built, not the highest', () => {
    const platformUnderALanding = [
      { x: 4, y: 3, z: 4 },
      { x: 4, y: 4, z: 4 },
      { x: 4, y: 31, z: 4 },
      { x: 4, y: 32, z: 4 },
    ]
    expect(standingSurface(platformUnderALanding, 4, 4)).toBe(5)
  })

  /** The roof rule, restated over a hole: a real floor still beats a real roof. */
  test('a roofed room whose floor is a real floor is unchanged', () => {
    const roofed = [
      { x: 4, y: 0, z: 4 },
      { x: 4, y: 5, z: 4 },
    ]
    expect(standingSurface(roofed, 4, 4)).toBe(1)
  })
})

/**
 * The catalogue, which is where this was reported from.
 *
 * A starter's door is two numbers in a document and the world around it is
 * generated by code, so the pair can drift without anybody noticing: raise the
 * island a block, move the parkour's first platform, and the door is over open
 * air with nothing to say so. Three of them were, and the whole of the symptom
 * was people arriving at y=0 under a world they could see above them.
 *
 * Written over the real starters rather than a fixture, because a fixture
 * cannot go wrong the way the shipped worlds actually went wrong.
 */
describe('every door in the catalogue has ground under it', () => {
  for (const starter of STARTERS) {
    const world = starter.build()
    const door = world.spawn
    if (!door) continue

    test(`${starter.id} arrives on the world rather than under it`, () => {
      // The blocks a space would actually get, lifted the way the copy lifts
      // them - the arrival reads those and not the document.
      const { blocks } = toBlocks(world)
      const column = blocks
        .filter((block) => block.x === door.x && block.z === door.z)
        .map((block) => block.y)

      // A door over a hole is an authoring mistake in the starter itself.
      expect(column.length).toBeGreaterThan(0)

      // And you land on the top of one of those blocks, never on the world
      // floor below them.
      const surface = standingSurface(blocks, door.x, door.z)
      expect(column).toContain(surface - 1)
    })

    test(`${starter.id} spreads its arrivals onto the same ground`, () => {
      const { blocks } = toBlocks(world)
      const ground = (x: number, z: number) => standingSurface(blocks, x, z)
      const at = ground(door.x, door.z)

      // The spread is a hash of who is arriving, so this is every cell it can
      // reach rather than a sample: nobody in the ring may be dropped off the
      // edge of what the door stands on.
      for (const offset of ARRIVAL_CELLS) {
        const cell = arrivalCell(door, `whoever-${offset.x},${offset.z}`, undefined, (candidate) =>
          Math.abs(ground(candidate.x, candidate.z) - at) <= ARRIVAL_STEP,
        )
        expect(Math.abs(ground(cell.x, cell.z) - at)).toBeLessThanOrEqual(ARRIVAL_STEP)
      }
    })
  }
})
