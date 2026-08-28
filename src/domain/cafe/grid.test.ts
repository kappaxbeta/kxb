import { describe, expect, test } from 'bun:test'
import { wallsFor } from '@/domain/cafe/grid'
import {
  cellsOf,
  cellToTileAxis,
  findPath,
  parseTile,
  rectangleRoom,
  TILE,
  tileKey,
  tileToWorld,
  worldToTile,
  type Doorway,
  type Tile,
} from '@/domain/world/grid'

describe('tile and world coordinates', () => {
  test('tiles are centred on their coordinate, not cornered at it', () => {
    expect(tileToWorld({ x: 3, z: -1 })).toEqual({ x: 6, z: -2 })
  })

  test('a world point maps back to the tile it is standing on', () => {
    // Tile 3 covers world x from 5 to 7, so both ends land on 3.
    expect(worldToTile(5.1, 0).x).toBe(3)
    expect(worldToTile(6.9, 0).x).toBe(3)
    expect(worldToTile(7.1, 0).x).toBe(4)
  })

  test('round-trips through the origin and into negatives', () => {
    for (const tile of [
      { x: 0, z: 0 },
      { x: -2, z: 5 },
      { x: 7, z: -3 },
    ]) {
      const world = tileToWorld(tile)
      expect(worldToTile(world.x, world.z)).toEqual(tile)
    }
  })
})

describe('collision cells', () => {
  test('a tile covers exactly the two unit cells per axis that it spans', () => {
    // Tile 3 spans world x 5..7, which is cells 5 and 6.
    const cells = cellsOf({ x: 3, z: 0 })
    expect(cells.map((cell) => cell.x).sort()).toEqual([5, 5, 6, 6])
    expect(cells.map((cell) => cell.z).sort()).toEqual([-1, -1, 0, 0])
  })

  test('cellToTileAxis inverts cellsOf, including across zero', () => {
    for (let tile = -4; tile <= 4; tile++) {
      for (const cell of cellsOf({ x: tile, z: 0 })) {
        expect(cellToTileAxis(cell.x)).toBe(tile)
      }
    }
  })

  test('cells tile the plane without gaps or overlaps', () => {
    const seen = new Set<string>()
    for (let tile = -3; tile <= 3; tile++) {
      for (const cell of cellsOf({ x: tile, z: 0 })) {
        const key = `${cell.x},${cell.z}`
        expect(seen.has(key)).toBe(false)
        seen.add(key)
      }
    }
    // Seven tiles, four cells each.
    expect(seen.size).toBe(28)
  })
})

describe('wall derivation', () => {
  const door: Doorway = { tile: { x: 2, z: 3 }, dir: 'south' }

  /**
   * The midpoints of the tile edges a set of segments actually walls off.
   *
   * Counting segments stopped meaning anything once corners arrived: a corner
   * piece has a full-length arm each way, so it is one segment covering two
   * edges, and a room's segment count now depends on how many of its corners
   * could be claimed. What has to stay true is the *coverage* - every exposed
   * edge walled exactly once, none walled twice, nothing walled that is not an
   * edge - so that is what these assert. It also catches a corner emitted at the
   * wrong rotation, which a count never would.
   */
  function covered(walls: ReturnType<typeof wallsFor>): string[] {
    const points: string[] = []
    for (const wall of walls) {
      if (wall.kind === 'corner_inner' || wall.kind === 'corner_outer') {
        const cos = Math.cos(wall.rotY)
        const sin = Math.sin(wall.rotY)
        // Arms run one full tile along the rotated +X and +Z axes; their
        // midpoints are one half-tile out along each.
        points.push(point(wall.x + cos * (TILE / 2), wall.z - sin * (TILE / 2)))
        points.push(point(wall.x + sin * (TILE / 2), wall.z + cos * (TILE / 2)))
      } else {
        points.push(point(wall.x, wall.z))
      }
    }
    return points
  }

  function point(x: number, z: number): string {
    // Rotations bring in floating point, and an edge midpoint is always a whole
    // or half tile, so rounding to three places is exact for real answers and
    // still separates two genuinely different edges.
    return `${x.toFixed(3)},${z.toFixed(3)}`
  }

  /** The midpoint of every edge of the room that faces something not-floor. */
  function perimeter(tiles: Set<string>): string[] {
    const points: string[] = []
    for (const key of tiles) {
      const tile = parseTile(key)
      const world = tileToWorld(tile)
      const edges = [
        { dx: 0, dz: -1 },
        { dx: 0, dz: 1 },
        { dx: -1, dz: 0 },
        { dx: 1, dz: 0 },
      ]
      for (const edge of edges) {
        if (tiles.has(tileKey(tile.x + edge.dx, tile.z + edge.dz))) continue
        points.push(
          point(
            world.x + (edge.dx * TILE) / 2,
            world.z + (edge.dz * TILE) / 2,
          ),
        )
      }
    }
    return points
  }

  function expectCoversExactly(tiles: Set<string>) {
    const walls = wallsFor(tiles, door)
    const got = covered(walls).sort()
    expect(got).toEqual(perimeter(tiles).sort())
    // Sorting hides duplicates from `toEqual` only if both sides have them, and
    // the perimeter never does - but a corner claiming an edge a straight also
    // claimed would show up here rather than as a flickering double wall.
    expect(new Set(got).size).toBe(got.length)
  }

  test('a rectangle is walled exactly once along its perimeter', () => {
    expectCoversExactly(rectangleRoom(5, 4))
  })

  test('interior edges between two floor tiles produce nothing', () => {
    expectCoversExactly(rectangleRoom(2, 1))
  })

  test('a single square is fully enclosed', () => {
    expectCoversExactly(new Set([tileKey(0, 0)]))
  })

  test('an L-shaped room is walled exactly once, corners and all', () => {
    // The re-entrant corner here is the one that needs `corner_outer`; a room
    // that is only ever a rectangle would never exercise it.
    const room = rectangleRoom(3, 3)
    room.delete(tileKey(2, 2))
    expectCoversExactly(room)
  })

  test('extending into a nook removes the walls it plugs', () => {
    const room = rectangleRoom(3, 3)
    room.add(tileKey(1, 3))
    expectCoversExactly(room)
  })

  test('exactly one segment is the doorway', () => {
    const walls = wallsFor(rectangleRoom(5, 4), door)
    expect(walls.filter((wall) => wall.door).length).toBe(1)
    expect(walls.filter((wall) => wall.kind === 'door').length).toBe(1)
  })

  test('a corner never swallows the doorway', () => {
    /**
     * The door is on the corner tile of a single-square room, so every corner
     * piece that could be built wants the edge it is on. Losing that fight would
     * seal the café, and the customers would queue against a wall.
     */
    const corner: Doorway = { tile: { x: 0, z: 0 }, dir: 'north' }
    const walls = wallsFor(new Set([tileKey(0, 0)]), corner)

    expect(walls.filter((wall) => wall.kind === 'door').length).toBe(1)
    expectCoversExactly(new Set([tileKey(0, 0)]))
  })

  test('a lone square is nothing but corners', () => {
    /**
     * Four edges, four candidate corners, and each corner claims two edges - so
     * two pieces take the lot and no straight is left. Worth pinning down: it is
     * the shape that would most obviously look wrong if the greedy claim ever
     * started double-booking edges.
     */
    const walls = wallsFor(new Set([tileKey(0, 0)]), door)
    expect(walls.length).toBe(2)
    expect(walls.every((wall) => wall.kind === 'corner_inner')).toBe(true)
  })

  test('a straight segment sits centred on its tile boundary', () => {
    // Three wide, so the middle of each long side is a straight run rather than
    // part of a corner.
    const walls = wallsFor(rectangleRoom(3, 3), door)
    const straight = walls.find((wall) => wall.kind === 'straight')

    expect(straight).toBeDefined()
    // The pack's walls are centred on their origin, so a segment's position is
    // the middle of the edge rather than one end of it. Every edge midpoint has
    // one coordinate on a tile boundary and the other on a tile centre.
    const onBoundary = (value: number) => Math.abs(value % TILE) === TILE / 2
    expect(onBoundary(straight!.x) !== onBoundary(straight!.z)).toBe(true)
  })

  test('the panelled face turns to look into the room', () => {
    /**
     * The wall on the north edge of the middle-top tile has the room to its
     * south, so its panelled face points +Z and it is unrotated; the one on the
     * south edge is the same slab turned around. Getting this backwards shows
     * the plain outside face to the player and the panelled one to nobody, which
     * is the sort of thing that reads as "the walls look wrong" without ever
     * looking like a bug.
     */
    const walls = wallsFor(rectangleRoom(3, 3), door)
    const at = (x: number, z: number) =>
      walls.find(
        (wall) =>
          wall.kind === 'straight' &&
          Math.abs(wall.x - x) < 1e-6 &&
          Math.abs(wall.z - z) < 1e-6,
      )

    const north = at(TILE, -TILE / 2)
    const south = at(TILE, TILE * 3 - TILE / 2)

    expect(north).toBeDefined()
    expect(south).toBeDefined()
    expect(north!.rotY).toBeCloseTo(0)
    expect(Math.abs(south!.rotY)).toBeCloseTo(Math.PI)
  })
})

describe('pathfinding', () => {
  const open = () => true

  test('walks a straight line and excludes the starting tile', () => {
    const path = findPath({ x: 0, z: 0 }, { x: 3, z: 0 }, open)
    expect(path).toEqual([
      { x: 1, z: 0 },
      { x: 2, z: 0 },
      { x: 3, z: 0 },
    ])
  })

  test('standing on the destination is an empty path, not a null one', () => {
    expect(findPath({ x: 1, z: 1 }, { x: 1, z: 1 }, open)).toEqual([])
  })

  test('routes around a blocked square', () => {
    const blocked = (tile: Tile) => !(tile.x === 1 && tile.z === 0)
    const path = findPath({ x: 0, z: 0 }, { x: 2, z: 0 }, blocked)

    expect(path).not.toBeNull()
    expect(path!.some((tile) => tile.x === 1 && tile.z === 0)).toBe(false)
    expect(path![path!.length - 1]).toEqual({ x: 2, z: 0 })
  })

  test('finds the shortest route, not merely a route', () => {
    const room = rectangleRoom(4, 4)
    const walkable = (tile: Tile) => room.has(tileKey(tile.x, tile.z))
    const path = findPath({ x: 0, z: 0 }, { x: 3, z: 3 }, walkable)

    expect(path!.length).toBe(6)
  })

  test('a walled-off destination is null rather than a wrong answer', () => {
    // A sealed room with the goal outside it.
    const room = rectangleRoom(3, 3)
    const walkable = (tile: Tile) => room.has(tileKey(tile.x, tile.z))
    expect(findPath({ x: 0, z: 0 }, { x: 9, z: 9 }, walkable)).toBeNull()
  })

  test('an unbounded walkable region gives up instead of searching forever', () => {
    /**
     * The half-plane here is walkable over infinitely many squares, which is
     * exactly the shape that used to hang the whole process - and would hang a
     * browser tab, since this runs inside the frame loop.
     */
    const walkable = (tile: Tile) => tile.x < 2
    expect(findPath({ x: 0, z: 0 }, { x: 5, z: 0 }, walkable, 500)).toBeNull()
  })

  test('the destination itself may be unwalkable', () => {
    // This is what lets a customer path *to* a chair square that a body is
    // allowed to stand on but a route may not cut through.
    const walkable = (tile: Tile) => !(tile.x === 2 && tile.z === 0)
    const path = findPath({ x: 0, z: 0 }, { x: 2, z: 0 }, walkable)

    expect(path).not.toBeNull()
    expect(path![path!.length - 1]).toEqual({ x: 2, z: 0 })
  })
})
