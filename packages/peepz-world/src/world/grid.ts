/**
 * Squares, and getting from one to another.
 *
 * Every place in this world - the café, the house, the garden - is a *set of
 * tiles* rather than a width and a height. That is what lets a room be extended
 * one square at a time, and it is why an L-shaped café and a four-room house can
 * share this file without either knowing the other exists.
 *
 * Nothing here knows what a wall is or what a prop costs. Each place derives its
 * own shell from its own tiles, because the packs disagree about where a wall
 * model's origin sits and that disagreement is not this file's problem.
 */

/**
 * World units per grid square.
 *
 * Two, because both model packs are authored that way - a floor tile is exactly
 * 2x2 and a wall is 2 wide and 4 tall in the restaurant set and in Tiny Treats
 * alike. Fighting that would mean rescaling several hundred models to save one
 * multiplication.
 */
export const TILE = 2

export interface Tile {
  x: number
  z: number
}

export type TileKey = string

export function tileKey(x: number, z: number): TileKey {
  return `${x},${z}`
}

export function parseTile(key: TileKey): Tile {
  const [x, z] = key.split(',')
  return { x: Number(x), z: Number(z) }
}

/** Centre of a tile in world units. Tile (0,0) is the origin. */
export function tileToWorld(tile: Tile): { x: number; z: number } {
  return { x: tile.x * TILE, z: tile.z * TILE }
}

/**
 * Which tile a world position is standing on.
 *
 * `round`, not `floor`, because tiles are centred on their coordinate rather
 * than starting at it - tile 3 covers world x from 5 to 7, not 6 to 8.
 */
export function worldToTile(x: number, z: number): Tile {
  return { x: Math.round(x / TILE), z: Math.round(z / TILE) }
}

/** The four orthogonal neighbours, in a fixed order so pathing is deterministic. */
export const DIRECTIONS = [
  { dx: 0, dz: -1, name: 'north' },
  { dx: 1, dz: 0, name: 'east' },
  { dx: 0, dz: 1, name: 'south' },
  { dx: -1, dz: 0, name: 'west' },
] as const

export type Direction = (typeof DIRECTIONS)[number]['name']

export function neighbours(tile: Tile): Tile[] {
  return DIRECTIONS.map((dir) => ({ x: tile.x + dir.dx, z: tile.z + dir.dz }))
}

export function isAdjacent(a: Tile, b: Tile): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z) === 1
}

/**
 * A rectangle of floor, for a café that has not been extended yet.
 *
 * Five by four is the smallest room that fits a kitchen down one side and two
 * covers down the other while still leaving somewhere to walk - which makes the
 * first "buy a square" purchase feel like relief rather than decoration.
 */
export function rectangleRoom(width: number, depth: number): Set<TileKey> {
  const tiles = new Set<TileKey>()
  for (let x = 0; x < width; x++) {
    for (let z = 0; z < depth; z++) {
      tiles.add(tileKey(x, z))
    }
  }
  return tiles
}

export interface Doorway {
  tile: Tile
  dir: Direction
}

/**
 * Ceiling on how many squares one search may visit.
 *
 * Generous next to any café a player will build - a room of this many squares
 * would not fit on the screen - so it never truncates a real route. It exists
 * purely to turn a runaway search into a returned `null`.
 */
export const MAX_SEARCH = 4096

/**
 * Where a customer appears before walking in.
 *
 * One tile beyond the doorway, so they are visibly *arriving* rather than
 * materialising at a table. Nothing outside the room is simulated - they walk a
 * straight line to the doorway tile and only then join the grid.
 */
export function spawnPoint(door: Doorway): { x: number; z: number } {
  const dir = DIRECTIONS.find((entry) => entry.name === door.dir)
  if (!dir) throw new Error(`unknown direction ${door.dir}`)
  return {
    x: (door.tile.x + dir.dx * 1.6) * TILE,
    z: (door.tile.z + dir.dz * 1.6) * TILE,
  }
}

/**
 * Breadth-first path between two tiles, over squares a body can occupy.
 *
 * BFS rather than A*: the rooms here are tens of squares, not thousands, and an
 * unweighted grid makes BFS optimal anyway. The heuristic would cost more to
 * read than it saves to run.
 *
 * Returns the tiles to walk *through* including the destination but excluding
 * the start, or null when the destination is walled off - which happens the
 * moment a player decorates across a doorway, and the caller needs to be able to
 * say so rather than have a customer walk through a fridge.
 */
export function findPath(
  from: Tile,
  to: Tile,
  walkable: (tile: Tile) => boolean,
  limit = MAX_SEARCH,
): Tile[] | null {
  if (from.x === to.x && from.z === to.z) return []

  const start = tileKey(from.x, from.z)
  const goal = tileKey(to.x, to.z)

  const cameFrom = new Map<TileKey, TileKey | null>([[start, null]])
  const queue: Tile[] = [from]

  while (queue.length > 0) {
    const current = queue.shift()!
    const currentKey = tileKey(current.x, current.z)

    if (currentKey === goal) {
      const path: Tile[] = []
      let step: TileKey | null = currentKey
      while (step && step !== start) {
        path.push(parseTile(step))
        step = cameFrom.get(step) ?? null
      }
      return path.reverse()
    }

    /**
     * The grid is infinite, and `walkable` is a predicate rather than a set.
     *
     * That combination means a predicate which is true over an unbounded region
     * - a bug, or simply "anywhere outside the room is fine" - sends this
     * searching outwards forever. Inside a sixty-times-a-second frame loop that
     * is not a slow answer, it is a locked tab, so the search is capped and an
     * over-large one is reported as no route.
     */
    if (cameFrom.size > limit) return null

    for (const next of neighbours(current)) {
      const nextKey = tileKey(next.x, next.z)
      if (cameFrom.has(nextKey)) continue
      // The goal is allowed to be unwalkable in general - a chair square is
      // walkable, but this also lets a caller path *to* something it could not
      // path *through*, without a second flag.
      if (nextKey !== goal && !walkable(next)) continue
      cameFrom.set(nextKey, currentKey)
      queue.push(next)
    }
  }

  return null
}

/**
 * The 1-unit collision cells a tile covers.
 *
 * The character controller borrowed from the lounge thinks in unit voxels, and
 * the café thinks in 2-unit squares. Rather than reimplement collision, each
 * solid square is expanded into the four cells it actually fills. Tile 3 covers
 * world x from 5 to 7, which is cells 5 and 6 - hence `2t - 1` and `2t`.
 */
export function cellsOf(tile: Tile): { x: number; z: number }[] {
  const x0 = tile.x * 2 - 1
  const z0 = tile.z * 2 - 1
  return [
    { x: x0, z: z0 },
    { x: x0 + 1, z: z0 },
    { x: x0, z: z0 + 1 },
    { x: x0 + 1, z: z0 + 1 },
  ]
}

/** Inverse of `cellsOf` for a single axis: which tile owns this collision cell. */
export function cellToTileAxis(cell: number): number {
  return Math.floor((cell + 1) / 2)
}
