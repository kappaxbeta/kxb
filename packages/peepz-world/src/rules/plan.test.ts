import { describe, expect, test } from 'bun:test'
import { SHELLS } from './catalog'
import {
  blockedEdges,
  edgeKey,
  exitAt,
  gardenPlan,
  housePlan,
  reachable,
  themeAt,
  wallsFor,
} from './plan'
import { TILE, tileKey } from '../world/grid'

describe('the house', () => {
  const plan = housePlan()

  test('every square belongs to exactly one room', () => {
    // Six by five, with no gaps and no square claimed twice - which the size
    // alone is enough to prove, since the four rooms are written as rectangles.
    expect(plan.rooms.size).toBe(6 * 5)
    expect(themeAt(plan, tileKey(0, 0))).toBe('bedroom')
    expect(themeAt(plan, tileKey(0, 2))).toBe('kitchen')
    expect(themeAt(plan, tileKey(0, 4))).toBe('bath')
    expect(themeAt(plan, tileKey(5, 4))).toBe('living')
    expect(themeAt(plan, tileKey(9, 9))).toBeUndefined()
  })

  test('the front door is where you arrive, so you can find your way out', () => {
    const exit = exitAt(plan, tileKey(4, 4))
    expect(exit?.to).toBe('outdoor')
    expect(exitAt(plan, tileKey(0, 0))).toBeUndefined()
  })
})

describe('deriving the shell', () => {
  const plan = housePlan()
  const walls = wallsFor(plan)

  /** Every wall sitting on one edge, whichever side produced it. */
  const at = (x: number, z: number) =>
    walls.filter(
      (wall) => Math.abs(wall.x - x) < 1e-6 && Math.abs(wall.z - z) < 1e-6,
    )

  test('an edge between two squares of the same room has no wall', () => {
    // Inside the living room, between (3,0) and (3,1).
    expect(at(3 * TILE, 0.5 * TILE)).toHaveLength(0)
  })

  test('an outside edge gets one wall, finished on both faces', () => {
    // The west face of the bedroom's (0,0).
    const found = at(-0.5 * TILE, 0)
    expect(found).toHaveLength(1)
    expect(found[0].kind === 'outer' || found[0].kind === 'window').toBe(true)
    expect(found[0].model).toContain('bedroom/')
  })

  test('an edge between two rooms gets one skin per room, facing inward', () => {
    // Between the bedroom's (0,1) and the kitchen's (0,2).
    const found = at(0, 1.5 * TILE)
    expect(found).toHaveLength(2)

    const models = found.map((wall) => wall.model).sort()
    expect(models).toEqual(
      [SHELLS.bedroom.innerWall, SHELLS.kitchen.innerWall].sort(),
    )

    // The two skins face opposite ways: one into each room.
    expect(Math.abs(found[0].rotY - found[1].rotY)).toBeCloseTo(Math.PI)
  })

  test('a doorway is a doorway from both sides', () => {
    // The bedroom-to-kitchen door, declared once on (1,1) facing south.
    const found = at(1 * TILE, 1.5 * TILE)
    expect(found).toHaveLength(2)
    expect(found.every((wall) => wall.kind === 'innerDoor')).toBe(true)
  })

  test('an exit is a hole, not a model standing in the gap', () => {
    // The front door, on the south face of the living room's (4,4).
    expect(at(4 * TILE, 4.5 * TILE)).toHaveLength(0)
  })

  test('windows only ever appear on outside walls', () => {
    for (const wall of walls) {
      if (wall.kind !== 'window') continue
      expect(wall.model).toBe(
        Object.values(SHELLS).find((shell) => shell.window === wall.model)!.window,
      )
    }
    // And there is at least one, or the house is a bunker.
    expect(walls.some((wall) => wall.kind === 'window')).toBe(true)
  })

  test('the shell is the same every time it is derived', () => {
    expect(wallsFor(housePlan())).toEqual(walls)
  })
})

describe('the garden', () => {
  const plan = gardenPlan()

  test('is one room, so it has no interior walls', () => {
    expect(wallsFor(plan).every((wall) => wall.kind !== 'inner')).toBe(true)
  })

  test('offers the way indoors and the way to work', () => {
    expect(exitAt(plan, tileKey(4, 2))?.to).toBe('home')
    expect(exitAt(plan, tileKey(1, 7))?.to).toBe('cafe')
  })

  test('the house stands on squares you cannot build on', () => {
    expect(plan.landmarks[0].blocks).toContain(tileKey(4, 0))
  })
})

describe('walls you cannot walk through', () => {
  const plan = housePlan()
  const blocked = blockedEdges(plan)

  test('the edge between two rooms is closed', () => {
    // Between the bedroom's (0,1) and the kitchen's (0,2).
    expect(blocked.has(edgeKey({ x: 0, z: 1 }, 'south'))).toBe(true)
  })

  test('and closed under its other name, from the other side', () => {
    // The same wall, described by the kitchen. One string, or you can walk
    // through it in one direction and not the other.
    expect(edgeKey({ x: 0, z: 2 }, 'north')).toBe(edgeKey({ x: 0, z: 1 }, 'south'))
  })

  test('a declared doorway is open', () => {
    expect(blocked.has(edgeKey({ x: 1, z: 1 }, 'south'))).toBe(false)
    expect(blocked.has(edgeKey({ x: 2, z: 0 }, 'east'))).toBe(false)
  })

  test('an edge inside one room is open', () => {
    expect(blocked.has(edgeKey({ x: 3, z: 0 }, 'south'))).toBe(false)
  })

  test('the outside is left to the cell rule, not doubled up here', () => {
    // Nothing is beyond (0,0)'s west edge, and "not floor is solid" already
    // covers it - listing it again would be a second thing to keep in step.
    expect(blocked.has(edgeKey({ x: 0, z: 0 }, 'west'))).toBe(false)
  })

  test('every closed edge has a wall model standing on it', () => {
    const walls = wallsFor(plan)
    for (const edge of blocked) {
      const [axis, a, b] = edge.split(':').map((part, index) =>
        index === 0 ? part : Number(part),
      ) as [string, number, number]

      // The edge's midpoint in world units, which is where the model sits.
      const x = axis === 'v' ? (a + 0.5) * TILE : a * TILE
      const z = axis === 'v' ? b * TILE : (b + 0.5) * TILE

      const here = walls.filter(
        (wall) => Math.abs(wall.x - x) < 1e-6 && Math.abs(wall.z - z) < 1e-6,
      )
      expect(here.length).toBeGreaterThan(0)
      expect(here.every((wall) => wall.kind !== 'innerDoor')).toBe(true)
    }
  })

  test('a square bought onto the side of a room takes its walls with it', () => {
    const rooms = new Map(plan.rooms)
    rooms.set(tileKey(-1, 0), 'bedroom')
    const grown = blockedEdges(plan, rooms)

    // The old outside wall between (-1,0) and (0,0) is now inside one room, so
    // it is gone - which is what makes extending feel like a room getting bigger
    // rather than a cupboard being bolted on.
    expect(grown.has(edgeKey({ x: -1, z: 0 }, 'east'))).toBe(false)
    expect(wallsFor(plan, rooms).some((wall) => Math.abs(wall.x + TILE) < 1e-6)).toBe(
      true,
    )
  })
})

/**
 * Which ways out a plan keeps, for the caller that cannot make all of them.
 *
 * The house cartridge holds the house and the garden and nothing else, so the
 * gap in the hedge that leads to the café has to stop being a gap rather than
 * merely stop being pressable - a doorway you can stand in the middle of with
 * a wall behind it is worse than no doorway. See `reachable`.
 */
describe('a plan with somewhere it cannot go', () => {
  test('drops the exits that lead there, and keeps the ones that do not', () => {
    const garden = gardenPlan()
    // As authored: back inside, and out to the café.
    expect(garden.exits.map((exit) => exit.to).sort()).toEqual(['cafe', 'home'])

    const kept = reachable(garden, ['home', 'outdoor'])
    expect(kept.exits.map((exit) => exit.to)).toEqual(['home'])
  })

  test('a dropped exit is no longer a hole in the shell', () => {
    /*
     * The half that would be easy to leave out. An exit is an edge `wallsFor`
     * skips, so taking one off the plan has to put the hedge back - otherwise
     * the garden has a gap in it with the café on the other side of nothing.
     */
    const garden = gardenPlan()
    const kept = reachable(garden, ['home', 'outdoor'])

    expect(wallsFor(kept, kept.rooms)).toHaveLength(
      wallsFor(garden, garden.rooms).length + 1,
    )
  })

  test('and standing on it offers nothing', () => {
    const kept = reachable(gardenPlan(), ['home', 'outdoor'])
    expect(exitAt(kept, tileKey(1, 7))).toBeUndefined()
  })

  test('the plan itself comes back when nothing was removed', () => {
    // Identity rather than equality, so the common case adds no object and
    // invalidates nothing memoised on it.
    const house = housePlan()
    expect(reachable(house, ['home', 'outdoor', 'cafe'])).toBe(house)
  })
})
