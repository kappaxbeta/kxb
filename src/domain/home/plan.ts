/**
 * The two places you own: a four-room house, and the garden it stands in.
 *
 * A plan is what a place was *built* as, not what it currently is. Squares can
 * be bought - see `extend` - and everything here that takes a room map takes it
 * as an argument for exactly that reason: the walls have to follow the house
 * that exists rather than the one that shipped.
 *
 * Walls are derived, not authored, exactly as in the café - see `wallsFor`. What
 * is authored is which square is which room, and that is all it takes: a square
 * of bathroom next to a square of bedroom produces a tiled wall on one side and
 * a papered one on the other without either room being told about the other.
 */

import { SHELLS, type Theme } from '@/domain/home/catalog'
import type { DecoratablePlace, PlaceId } from '@/domain/world/places'
import {
  DIRECTIONS,
  type Direction,
  parseTile,
  type Tile,
  TILE,
  tileKey,
  type TileKey,
} from '@/domain/world/grid'

/**
 * A way out, and where it goes.
 *
 * The trigger is a *square*, not an edge: standing on it offers the journey.
 * Tying it to the edge you crossed would mean a player who walked in sideways
 * and turned around never got the prompt, which is a bug you only find by
 * having somebody else play it.
 */
export interface Exit {
  tile: Tile
  /** The edge left open in the shell, so the way out is visibly a way out. */
  dir: Direction
  to: PlaceId
  label: string
}

/** An edge deliberately left as a doorway rather than a wall. */
export interface DoorEdge {
  tile: Tile
  dir: Direction
}

/**
 * Something big and fixed, like the house seen from the garden.
 *
 * Landmarks are drawn from a model and block the squares they list. They are
 * not props: you cannot sell your own house, and pretending you could would put
 * a bulldoze prompt on the only thing in the garden that matters.
 */
export interface Landmark {
  model: string
  /** Tile coordinates of the model's origin. Fractional, to sit between squares. */
  x: number
  z: number
  rotY?: number
  blocks: TileKey[]
}

export interface Plan {
  id: DecoratablePlace
  name: string
  /** Every square, and which room it belongs to. */
  rooms: Map<TileKey, Theme>
  doors: DoorEdge[]
  exits: Exit[]
  landmarks: Landmark[]
  /** Where you appear, in world units. */
  spawn: { x: number; z: number }
}

/** Fill a rectangle of squares with one theme. Inclusive of both corners. */
function room(
  rooms: Map<TileKey, Theme>,
  theme: Theme,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
): void {
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      rooms.set(tileKey(x, z), theme)
    }
  }
}

/**
 * The house: six squares by five, cut into four rooms.
 *
 * The living room takes half of it and starts empty. That is the point of the
 * layout - the rooms you need to live are furnished enough to be rooms, and the
 * big one is the thing a fortnight of lunch services is *for*.
 */
export function housePlan(): Plan {
  const rooms = new Map<TileKey, Theme>()
  room(rooms, 'bedroom', 0, 0, 2, 1)
  room(rooms, 'kitchen', 0, 2, 2, 3)
  room(rooms, 'bath', 0, 4, 2, 4)
  room(rooms, 'living', 3, 0, 5, 4)

  return {
    id: 'home',
    name: 'Home',
    rooms,
    doors: [
      // Every room opens onto the hall-that-is-the-living-room...
      { tile: { x: 2, z: 0 }, dir: 'east' },
      { tile: { x: 2, z: 2 }, dir: 'east' },
      { tile: { x: 2, z: 4 }, dir: 'east' },
      // ...and the two you use at both ends of a day connect directly, so
      // getting from bed to the kettle is not a lap of the house.
      { tile: { x: 1, z: 1 }, dir: 'south' },
      { tile: { x: 1, z: 3 }, dir: 'south' },
    ],
    exits: [
      {
        tile: { x: 4, z: 4 },
        dir: 'south',
        to: 'outdoor',
        label: 'Step outside',
      },
    ],
    landmarks: [],
    // Just inside the front door, facing into the house.
    spawn: { x: 4 * TILE, z: 3 * TILE },
  }
}

/**
 * The garden: grass, a hedge, and the house you just came out of.
 *
 * The house is a landmark rather than a room, because the inside is its own
 * place with its own floor plan. What stands here is the outside of it, three
 * squares of it, and the square in front of the door is the way back in.
 */
export function gardenPlan(): Plan {
  const rooms = new Map<TileKey, Theme>()
  room(rooms, 'garden', 0, 0, 8, 7)

  /** The squares the building itself stands on. Grass, but not walkable. */
  const footprint = [
    tileKey(3, 0),
    tileKey(4, 0),
    tileKey(5, 0),
    tileKey(3, 1),
    tileKey(4, 1),
    tileKey(5, 1),
  ]

  return {
    id: 'outdoor',
    name: 'Outdoors',
    rooms,
    doors: [],
    exits: [
      {
        // Directly in front of the house's door.
        tile: { x: 4, z: 2 },
        dir: 'north',
        to: 'home',
        label: 'Go inside',
      },
      {
        // A gap in the hedge at the bottom of the garden.
        tile: { x: 1, z: 7 },
        dir: 'south',
        to: 'cafe',
        label: 'Head to the café',
      },
    ],
    landmarks: [
      {
        model: 'house/house',
        // Centred on the middle of its three squares, pushed back so the porch
        // lands on the square the exit sits in front of rather than on it.
        x: 4,
        z: 0.6,
        blocks: footprint,
      },
    ],
    spawn: { x: 4 * TILE, z: 3 * TILE },
  }
}

export function planFor(id: DecoratablePlace): Plan {
  return id === 'home' ? housePlan() : gardenPlan()
}

export function themeAt(plan: Plan, key: TileKey): Theme | undefined {
  return plan.rooms.get(key)
}

/** Squares that are floor but cannot be walked on or built on. */
export function blockedTiles(plan: Plan): Set<TileKey> {
  const blocked = new Set<TileKey>()
  for (const landmark of plan.landmarks) {
    for (const key of landmark.blocks) blocked.add(key)
  }
  return blocked
}

// --- the shell --------------------------------------------------------------

export type WallKind = 'outer' | 'inner' | 'outerDoor' | 'innerDoor' | 'window'

export interface HomeWall {
  /** World position of the edge's midpoint. These models are centred on x. */
  x: number
  z: number
  /** Radians about Y, oriented so the model's +z face looks into the room. */
  rotY: number
  model: string
  kind: WallKind
}

/**
 * Which way to turn a wall so its finished face looks into a given square.
 *
 * The models front onto +z, so a wall on a square's north edge is unrotated and
 * the other three are quarter turns from it. Getting this wrong is not subtle -
 * the room ends up papered on the outside and bare on the inside.
 */
const FACING: Record<Direction, number> = {
  north: 0,
  east: -Math.PI / 2,
  south: Math.PI,
  west: Math.PI / 2,
}

/**
 * Which outside walls get a window.
 *
 * Deterministic rather than random, because the shell is rebuilt on every render
 * and a random choice would reshuffle the windows every time React felt like it.
 * Every other segment, by position, so a long outside wall alternates instead of
 * being either blank or all glass.
 */
function wantsWindow(tile: Tile, dir: Direction): boolean {
  // North and west walls only: the house's south side is where the front door
  // is, and glazing the wall you walk through looks like a mistake.
  if (dir === 'south' || dir === 'east') return false
  return (tile.x + tile.z) % 2 === 0
}

/**
 * A wall's edge, named the same way from both sides.
 *
 * The bedroom's south edge and the kitchen's north edge are one wall, and
 * collision has to agree about that or you can walk through it in one direction
 * and not the other. Naming an edge by the lower of the two squares it divides
 * is what makes the two descriptions the same string.
 */
export function edgeKey(tile: Tile, dir: Direction): string {
  switch (dir) {
    case 'north':
      return `h:${tile.x}:${tile.z - 1}`
    case 'south':
      return `h:${tile.x}:${tile.z}`
    case 'west':
      return `v:${tile.x - 1}:${tile.z}`
    case 'east':
      return `v:${tile.x}:${tile.z}`
  }
}

/** Both descriptions of one declared doorway, so either side finds it. */
function doorEdges(edges: DoorEdge[]): Set<string> {
  return new Set(edges.map((door) => edgeKey(door.tile, door.dir)))
}

/**
 * Every wall this floor plan implies.
 *
 * An edge produces a wall when the square across it is a different room, or is
 * not part of the place at all. Two rooms either side of an interior edge each
 * produce their own inner skin - see `Shell` - which is why this returns two
 * entries for one wall and that is correct rather than a duplicate.
 *
 * `rooms` is passed in rather than read off the plan because squares can be
 * bought: the plan is what the house was built as, and the room map is what it
 * has become. Everything downstream only ever sees the latter.
 */
export function wallsFor(
  plan: Plan,
  rooms: Map<TileKey, Theme> = plan.rooms,
): HomeWall[] {
  const walls: HomeWall[] = []
  const doors = doorEdges(plan.doors)
  const exits = doorEdges(plan.exits)

  for (const [key, theme] of rooms) {
    const tile = parseTile(key)
    const shell = SHELLS[theme]

    for (const dir of DIRECTIONS) {
      const beyond = tileKey(tile.x + dir.dx, tile.z + dir.dz)
      const neighbour = rooms.get(beyond)
      if (neighbour === theme) continue

      const edge = edgeKey(tile, dir.name)
      // An exit is a hole with nothing behind it - the model would be standing
      // in the doorway you are meant to walk through.
      if (exits.has(edge)) continue

      const inside = neighbour !== undefined
      const door = doors.has(edge)

      const kind: WallKind = door
        ? inside
          ? 'innerDoor'
          : 'outerDoor'
        : inside
          ? 'inner'
          : wantsWindow(tile, dir.name)
            ? 'window'
            : 'outer'

      walls.push({
        x: (tile.x + dir.dx / 2) * TILE,
        z: (tile.z + dir.dz / 2) * TILE,
        rotY: FACING[dir.name],
        model: shell[
          kind === 'outer'
            ? 'outerWall'
            : kind === 'inner'
              ? 'innerWall'
              : kind === 'outerDoor'
                ? 'outerDoor'
                : kind === 'innerDoor'
                  ? 'innerDoor'
                  : 'window'
        ],
        kind,
      })
    }
  }

  return walls
}

/**
 * The edges a body cannot cross.
 *
 * This exists because an interior wall is *between* collision cells rather than
 * in one. The character controller borrowed from the lounge thinks in unit
 * voxels: a square covers cells 2t-1 and 2t, so the wall dividing two squares
 * falls exactly on the seam and there is no cell to mark solid. The café never
 * noticed - all of its walls face the outside, where "not floor" already means
 * "solid" - but a four-room house is mostly interior walls, and without this you
 * walk from the bedroom into the bathroom straight through the tiling.
 *
 * Doorways and exits are left out, because those are the holes.
 */
export function blockedEdges(
  plan: Plan,
  rooms: Map<TileKey, Theme> = plan.rooms,
): Set<string> {
  const blocked = new Set<string>()
  const open = doorEdges([...plan.doors, ...plan.exits])

  for (const [key, theme] of rooms) {
    const tile = parseTile(key)
    for (const dir of DIRECTIONS) {
      const beyond = rooms.get(tileKey(tile.x + dir.dx, tile.z + dir.dz))
      // Only interior edges. The outside is handled by the cell rule, which
      // already treats anything that is not part of the plan as solid.
      if (beyond === undefined || beyond === theme) continue

      const edge = edgeKey(tile, dir.name)
      if (!open.has(edge)) blocked.add(edge)
    }
  }

  return blocked
}

/** Whether standing here offers a journey, and which one. */
export function exitAt(plan: Plan, key: TileKey | null): Exit | undefined {
  if (!key) return undefined
  return plan.exits.find((exit) => tileKey(exit.tile.x, exit.tile.z) === key)
}

/**
 * The same plan with the ways out that lead nowhere taken off it.
 *
 * ---------------------------------------------------------------------------
 * Why a plan and not a filter at the prompt
 * ---------------------------------------------------------------------------
 * An exit is three things at once: a square that offers a journey, a phrase on
 * the action button, and a **hole in the shell** - `shellFor` reads `exits`
 * alongside `doors` to decide which edges are left open, and `blockedEdges`
 * reads the same list to decide which ones you can walk through. Suppressing
 * only the prompt would leave a gap in the hedge you can stand in the middle of
 * with nothing on the other side.
 *
 * So the destination list is applied to the plan, once, and the wall, the
 * collision and the prompt all follow from it without being told.
 *
 * The caller with a reason to do this is the house cartridge: it holds the
 * house *and* the garden, so the door between them is a view change it handles
 * itself, and the gap in the hedge that leads to the café is a journey it
 * cannot make - the café is a different cartridge. See
 * `src/app/xp/_runtime/games/peepz-world.tsx`.
 *
 * Returns the plan itself when nothing was removed, so the common case adds no
 * object and no invalidation to anything memoised on it.
 */
export function reachable(plan: Plan, places: readonly PlaceId[]): Plan {
  const exits = plan.exits.filter((exit) => places.includes(exit.to))
  return exits.length === plan.exits.length ? plan : { ...plan, exits }
}
