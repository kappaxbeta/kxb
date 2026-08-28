/**
 * The café's shell: where its walls end up, given which squares are floor.
 *
 * Walls are never stored. They are a function of the tile set: an edge gets a
 * wall exactly when the square on the other side is not floor. Storing them
 * would mean every purchase had to remember to delete the wall it just built
 * through, which is the kind of bookkeeping that is wrong once and then wrong
 * forever.
 *
 * This lives next to the café rather than in `domain/world` because it encodes
 * one pack's idea of where a wall model's origin sits, and the packs disagree.
 * The shell is Tiny Treats' panelled bakery set, which is the reason corners
 * exist here at all: that pack ships dedicated corner pieces, so a corner is a
 * *model* rather than two slabs left to intersect and hope.
 */

import {
  DIRECTIONS,
  type Direction,
  type Doorway,
  parseTile,
  type Tile,
  TILE,
  tileKey,
  type TileKey,
} from '@/domain/world/grid'

/**
 * Which model a segment wants.
 *
 * `straight` and `door` span one tile edge. A `corner` spans *two* - the pack's
 * corner pieces have a full-length arm in each direction - which is why
 * emitting one has to claim both edges rather than sit on top of them.
 */
export type WallKind = 'straight' | 'door' | 'corner_inner' | 'corner_outer'

export interface WallSegment {
  kind: WallKind
  /** World position of the model's origin. */
  x: number
  z: number
  /** Radians about Y. */
  rotY: number
  /** True for the one gap customers come in through. Implies `kind: 'door'`. */
  door: boolean
}

/**
 * A lattice point where four tiles meet, and the edges between them.
 *
 * Corner `(i, j)` is the north-west corner of tile `(i, j)`, at world
 * `(TILE * i - TILE / 2, TILE * j - TILE / 2)`. Naming edges by their starting
 * corner is what lets a corner piece and a straight argue over the same edge by
 * key rather than by comparing floats.
 */
type EdgeAxis = 'x' | 'z'
type EdgeKey = string

function edgeKey(axis: EdgeAxis, i: number, j: number): EdgeKey {
  return `${axis}:${i}:${j}`
}

/** The edge an outward-facing tile edge corresponds to, in corner coordinates. */
function edgeOf(tile: Tile, dir: Direction): EdgeKey {
  switch (dir) {
    case 'north':
      return edgeKey('x', tile.x, tile.z)
    case 'south':
      return edgeKey('x', tile.x, tile.z + 1)
    case 'west':
      return edgeKey('z', tile.x, tile.z)
    case 'east':
      return edgeKey('z', tile.x + 1, tile.z)
  }
}

/**
 * Where a straight panel sits for one edge.
 *
 * The pack's straight wall is centred on its origin and 2 wide, so it lands on
 * the middle of the edge with no half-width fudge - unlike the restaurant pack,
 * whose walls hang off one end. It is also one-sided: the panelled face is the
 * one at +Z locally, so the rotation is chosen to point that face into the room
 * rather than merely to make the slab lie the right way.
 */
function straightAt(
  axis: EdgeAxis,
  i: number,
  j: number,
  tiles: Set<TileKey>,
  kind: WallKind,
): WallSegment {
  const half = TILE / 2

  if (axis === 'x') {
    // Runs along X between corners (i, j) and (i + 1, j). The room is on the
    // +Z side exactly when the tile below the edge is floor.
    const inside = tiles.has(tileKey(i, j))
    return {
      kind,
      x: TILE * i,
      z: TILE * j - half,
      rotY: inside ? 0 : Math.PI,
      door: kind === 'door',
    }
  }

  // Runs along Z between corners (i, j) and (i, j + 1). The room is on the +X
  // side exactly when the tile east of the edge is floor.
  const inside = tiles.has(tileKey(i, j))
  return {
    kind,
    x: TILE * i - half,
    z: TILE * j,
    rotY: inside ? Math.PI / 2 : -Math.PI / 2,
    door: kind === 'door',
  }
}

/**
 * The four quadrants around a lattice point, in the order the corner model's
 * rotations run.
 *
 * A corner piece at rotation zero has arms along +X and +Z and brackets the
 * `+x +z` quadrant, so a quadrant is all it takes to pick both the rotation and
 * the pair of edges the piece covers.
 */
const QUADRANTS = [
  // +x +z: arms +X and +Z.
  { dx: 0, dz: 0, rotY: 0, edges: (i: number, j: number) => [edgeKey('x', i, j), edgeKey('z', i, j)] },
  // -x +z: arms +Z and -X.
  { dx: -1, dz: 0, rotY: -Math.PI / 2, edges: (i: number, j: number) => [edgeKey('z', i, j), edgeKey('x', i - 1, j)] },
  // -x -z: arms -X and -Z.
  { dx: -1, dz: -1, rotY: Math.PI, edges: (i: number, j: number) => [edgeKey('x', i - 1, j), edgeKey('z', i, j - 1)] },
  // +x -z: arms -Z and +X.
  { dx: 0, dz: -1, rotY: Math.PI / 2, edges: (i: number, j: number) => [edgeKey('z', i, j - 1), edgeKey('x', i, j)] },
] as const

/**
 * Every wall the current floor plan implies.
 *
 * Two passes. The first walks tiles and looks outward, so an interior edge
 * between two floor squares produces nothing at all and buying a square that
 * plugs a nook removes three walls without anything having to know that is what
 * happened. The second replaces perpendicular pairs with a corner piece.
 *
 * Corners are claimed greedily, and a claimed edge is gone. That matters for a
 * single square, where all four corners are candidates but only two can be
 * built - which is correct, and is what an L of two pieces around a 2x2 hut
 * actually looks like.
 */
export function wallsFor(tiles: Set<TileKey>, door: Doorway): WallSegment[] {
  const edges = new Map<EdgeKey, { axis: EdgeAxis; i: number; j: number; door: boolean }>()

  for (const key of tiles) {
    const tile = parseTile(key)
    for (const dir of DIRECTIONS) {
      if (tiles.has(tileKey(tile.x + dir.dx, tile.z + dir.dz))) continue
      const isDoor =
        door.tile.x === tile.x && door.tile.z === tile.z && door.dir === dir.name
      const id = edgeOf(tile, dir.name)
      const [axis, i, j] = id.split(':')
      edges.set(id, {
        axis: axis as EdgeAxis,
        i: Number(i),
        j: Number(j),
        door: isDoor,
      })
    }
  }

  const walls: WallSegment[] = []
  const claimed = new Set<EdgeKey>()

  for (const point of cornerPoints(edges)) {
    for (const quadrant of QUADRANTS) {
      const [a, b] = quadrant.edges(point.i, point.j)
      const first = edges.get(a)
      const second = edges.get(b)
      if (!first || !second) continue
      if (claimed.has(a) || claimed.has(b)) continue
      /**
       * The doorway is never swallowed by a corner.
       *
       * A corner piece is solid, so absorbing the door edge would seal the café
       * shut - and the customers would queue outside a wall forever, which
       * looks like a pathfinding bug rather than a geometry one.
       */
      if (first.door || second.door) continue

      const filled = countFilled(tiles, point.i, point.j)
      // One floor quadrant is an ordinary 90-degree room corner; three is the
      // 270-degree corner an L-shaped room turns on. Two is a straight run or a
      // pinch point, and neither wants a corner model.
      if (filled !== 1 && filled !== 3) continue

      const inside = tiles.has(
        tileKey(point.i + quadrant.dx, point.j + quadrant.dz),
      )
      // Inner brackets the floor quadrant, outer brackets the empty one.
      if (filled === 1 ? !inside : inside) continue

      claimed.add(a)
      claimed.add(b)
      walls.push({
        kind: filled === 1 ? 'corner_inner' : 'corner_outer',
        x: TILE * point.i - TILE / 2,
        z: TILE * point.j - TILE / 2,
        rotY: quadrant.rotY,
        door: false,
      })
      break
    }
  }

  for (const [id, edge] of edges) {
    if (claimed.has(id)) continue
    walls.push(
      straightAt(edge.axis, edge.i, edge.j, tiles, edge.door ? 'door' : 'straight'),
    )
  }

  return walls
}

/** How many of the four tiles meeting at a lattice point are floor. */
function countFilled(tiles: Set<TileKey>, i: number, j: number): number {
  let filled = 0
  for (const quadrant of QUADRANTS) {
    if (tiles.has(tileKey(i + quadrant.dx, j + quadrant.dz))) filled++
  }
  return filled
}

/**
 * Lattice points that at least two wall edges touch.
 *
 * Sorted so that the greedy claim above is a function of the floor plan rather
 * than of `Set` iteration order - otherwise the same room could come back with
 * its corners in different places between two loads of the same save.
 */
function cornerPoints(
  edges: Map<EdgeKey, { axis: EdgeAxis; i: number; j: number }>,
): { i: number; j: number }[] {
  const points = new Map<string, { i: number; j: number }>()

  for (const edge of edges.values()) {
    const ends =
      edge.axis === 'x'
        ? [
            { i: edge.i, j: edge.j },
            { i: edge.i + 1, j: edge.j },
          ]
        : [
            { i: edge.i, j: edge.j },
            { i: edge.i, j: edge.j + 1 },
          ]
    for (const end of ends) points.set(`${end.i}:${end.j}`, end)
  }

  return [...points.values()].sort((a, b) => a.j - b.j || a.i - b.i)
}
