/**
 * Where a straight line first meets something.
 *
 * One function, two callers that have nothing to do with each other: a shot,
 * which wants to know what it hit, and the third-person camera, which wants to
 * know how far back it can sit before it is inside a wall. They are the same
 * question - what is the first solid thing along this ray - and writing it twice
 * would be two answers that disagree about the corner of a cell.
 *
 * ---------------------------------------------------------------------------
 * Why hitscan and not a projectile
 * ---------------------------------------------------------------------------
 * A bullet that travels is a thing to simulate, to network, to interpolate and
 * to reconcile, and it is a different game: you lead your target. A hitscan shot
 * lands where the crosshair was on the frame the button went down, which is what
 * a prototype arena wants and what the rest of this engine can already reason
 * about - `damage` is a function that takes an entity, and this is the thing
 * that decides which one.
 *
 * The plan (docs/xp/creator.md §8.1) says "hitscan" for exactly this reason. A
 * travelling projectile is a blueprint that moves, which is a script's job, and
 * it can be built on top of this without changing it.
 *
 * ---------------------------------------------------------------------------
 * Two worlds, one ray
 * ---------------------------------------------------------------------------
 * Architecture is a cell grid and entities are boxes (docs/xp/manual.md §2), so
 * this is genuinely two traversals whose answers are compared:
 *
 * - the grid, walked cell by cell with the standard voxel DDA, which is exact
 *   and costs one step per cell crossed rather than a test per cell in range;
 * - the boxes, each tested with the slab method, which is a handful of
 *   divisions per entity and linear in the number of them.
 *
 * The nearer wins. That ordering is the whole point: a target standing against a
 * wall must be hittable, and a target *behind* one must not.
 */

import type { Box } from '../document/blueprints'
import { WEAPON_NAME, type EntityId, type EntityWorld } from './entities'
import { EYE_HEIGHT, PLAYER_RADIUS, type SolidTest, type Vec3 } from './physics'

/** What a ray ran into. */
export interface Hit {
  /** The entity, or null for architecture, for the ground, and for a person. */
  id: EntityId | null
  /**
   * Whose body it was, when it was somebody's.
   *
   * A separate field rather than a widened `id` because these are two different
   * kinds of thing all the way down: an entity id is a number this client
   * allocated and means nothing anywhere else, and a person is a string every
   * client agrees about. Overloading one field would put a value on the wire
   * that only the machine that made it can read.
   */
  who?: string
  /** Where it landed, in world units. */
  point: Vec3
  /** How far along the ray that was. */
  distance: number
}

/** A box that knows whose it is, so a hit can name something. */
export interface Target {
  id: EntityId
  box: Box
}

/** The same, for one of the other players. Ids are theirs, not ours. */
export interface PersonTarget {
  id: string
  box: Box
}

export interface CastOptions {
  /** The architecture. Absent means nothing is built. */
  isSolid?: SolidTest
  /** The entities worth hitting. */
  targets?: readonly Target[]
  /**
   * The other players, as boxes.
   *
   * Separate from `targets` and not merged into them, because *where* a peer is
   * comes from a different place with different guarantees: an entity is in this
   * client's own world and a peer is an interpolated sample from a quarter of a
   * second ago. They are compared against each other by distance like everything
   * else here, so a body behind a wall is still behind a wall.
   *
   * A hit on one of these is a **claim**, never an outcome. This client decided
   * it; the arbiter decides whether it counts. See docs/xp/server-authority.md.
   */
  people?: readonly PersonTarget[]
  /** How far the ray is allowed to reach. */
  range?: number
  /**
   * A solid plane at this height, if the world has one.
   *
   * `world.ground` in the document. Not part of the cell grid - it is not
   * rasterised, it is a rule in the character controller - so a ray that knew
   * only about cells would pass straight through the floor of an otherwise
   * empty level and report nothing.
   */
  ground?: number
  /**
   * Entities that cannot be hit.
   *
   * The shooter and whatever they are holding. Without it every shot lands on
   * the inside of your own gun, half a metre from the camera, and the game is
   * that you cannot shoot.
   */
  ignore?: ReadonlySet<EntityId>
}

/** How far a ray goes when nobody says. Past the far side of any room. */
export const DEFAULT_RANGE = 100

/**
 * Everything in a world that a ray can land on.
 *
 * The entities with a box, which is deliberately the same set that stops you
 * walking. "You can shoot what you could bump into" is a rule a player works out
 * in one shot; the alternative - shooting things you can walk through - means a
 * coin absorbs a bullet, and there is no way to tell from looking which things
 * do that.
 *
 * A blueprint that wants to be shot and not walked into gives itself an explicit
 * box, which is the same field and one line.
 */
/**
 * What this body would fire, if it fired: the gun it is wearing, or the one it
 * picked up.
 *
 * ---------------------------------------------------------------------------
 * Why a gun on the floor had to become a gun
 * ---------------------------------------------------------------------------
 * `player.weapon` is a blueprint the host hangs off a socket at load, and until
 * this it was the *only* thing a shot could come out of - so a level where guns
 * lie around and you pick one up could be written (`carry` has always worked)
 * and the thing in your hand did nothing. What makes a blueprint a weapon is its
 * properties, says docs/xp/manual.md §5.5, and this is that sentence applied to
 * a hand rather than to a socket.
 *
 * **The worn one wins.** A level that issues everybody a pistol and also leaves
 * a shotgun on a crate is a level where the shotgun is the interesting half, but
 * the worn gun is the one the host draws in first person and the one the arbiter
 * was told about at join - so preferring the pickup would put the model, the
 * damage and the crosshair out of step with each other. A document that wants
 * the pickup to matter issues no weapon, which is one line.
 *
 * **`damage` is what counts as a gun**, not a tag and not a name: `range` has a
 * default and a thing that takes nothing off is not a weapon. Everything else a
 * hand can hold - a flag, a crate, a key - has no such property and is left
 * alone, so this can be asked of any body without knowing what the level is
 * about.
 */
export function armedWith(world: EntityWorld, holder: EntityId): EntityId | null {
  let carried: EntityId | null = null
  for (const [child, link] of world.parent) {
    if (link.id !== holder || !world.alive.has(child)) continue
    if (world.name.get(child) === WEAPON_NAME) return child
    // The lowest id of them, so a body somehow holding two answers the same on
    // every machine rather than however the map happened to be ordered.
    if (world.props.get(child)?.damage === undefined) continue
    if (carried === null || child < carried) carried = child
  }
  return carried
}

export function targetsOf(world: EntityWorld): Target[] {
  const targets: Target[] = []
  for (const id of world.alive) {
    const box = world.box.get(id)
    if (box) targets.push({ id, box })
  }
  return targets
}

/**
 * The first thing along a ray, or null.
 *
 * `direction` need not be normalised - it is normalised here, so a caller can
 * hand over a camera's own direction vector without thinking about it, and
 * `distance` is always in world units rather than in multiples of whatever the
 * caller happened to pass.
 */
export function castRay(
  origin: Vec3,
  direction: Vec3,
  { isSolid, targets, people, range = DEFAULT_RANGE, ground, ignore }: CastOptions = {},
): Hit | null {
  const length = Math.hypot(direction.x, direction.y, direction.z)
  // A zero-length direction is not a ray. Returning null beats dividing by it
  // and reporting a hit at NaN, which every caller would then compare against a
  // distance and get `false` from.
  if (length < 1e-9) return null

  const dx = direction.x / length
  const dy = direction.y / length
  const dz = direction.z / length

  const unit = { x: dx, y: dy, z: dz }

  /**
   * The nearest so far, kept as a number beside the hit.
   *
   * Rather than reading `best.distance` back, which is the shape that reads
   * better and does not compile: `best` starts as `null` and every assignment to
   * it is under a condition, so the type checker narrows it to `null` and the
   * comparison is against a property of nothing. A separate number is also one
   * less object to reach into per candidate.
   */
  let best: Hit | null = null
  let nearest = Infinity

  if (isSolid) {
    const hit = castCells(origin, unit, isSolid, range)
    if (hit && hit.distance < nearest) {
      best = hit
      nearest = hit.distance
    }
  }

  if (ground !== undefined) {
    const hit = castGround(origin, unit, ground, range)
    if (hit && hit.distance < nearest) {
      best = hit
      nearest = hit.distance
    }
  }

  for (const target of targets ?? []) {
    if (ignore?.has(target.id)) continue
    const distance = boxDistance(origin, unit, target.box, range)
    if (distance === null || distance >= nearest) continue
    nearest = distance
    best = {
      id: target.id,
      distance,
      point: {
        x: origin.x + dx * distance,
        y: origin.y + dy * distance,
        z: origin.z + dz * distance,
      },
    }
  }

  // Last, and it does not matter: everything here is compared by distance, so
  // the order the candidates are considered in cannot change the answer. Which
  // is the property to keep - a shot that lands on whichever list was checked
  // first is a shot that goes through walls when the level gets busy.
  for (const person of people ?? []) {
    const distance = boxDistance(origin, unit, person.box, range)
    if (distance === null || distance >= nearest) continue
    nearest = distance
    best = {
      id: null,
      who: person.id,
      distance,
      point: {
        x: origin.x + dx * distance,
        y: origin.y + dy * distance,
        z: origin.z + dz * distance,
      },
    }
  }

  return best
}

/**
 * The box somebody else occupies, from the sample of where they are.
 *
 * The dimensions the character controller already uses - `PLAYER_RADIUS` wide
 * and `EYE_HEIGHT` tall - so what you can shoot is what you would bump into,
 * which is the same rule `targetsOf` keeps for entities.
 *
 * ---------------------------------------------------------------------------
 * Feet, not the eye
 * ---------------------------------------------------------------------------
 * **`at` is a pair of feet**, because that is what a `Sample` carries and what
 * `Crowd.at` gives back. The body is built *upwards* from it.
 *
 * This is the one conversion in the engine that has already been got wrong once
 * in the other direction, and ./presence documents the bruise: the controller
 * holds an *eye* - `feet + EYE_HEIGHT` - and for a while nothing converted
 * between the two, so every other person in the room stood a body-height in the
 * air. Building this box from an eye would put every hitbox a body-height into
 * the floor, which is worse, because nothing is drawn there and the only symptom
 * is that shooting people does not work.
 *
 * So a caller holding an eye - the local player, the camera - subtracts
 * `EYE_HEIGHT` itself, at a call site where it is obvious which one it has.
 */
export function personBox(feet: Vec3): Box {
  return {
    minX: feet.x - PLAYER_RADIUS,
    maxX: feet.x + PLAYER_RADIUS,
    minY: feet.y,
    maxY: feet.y + EYE_HEIGHT,
    minZ: feet.z - PLAYER_RADIUS,
    maxZ: feet.z + PLAYER_RADIUS,
  }
}

/**
 * Walk the cell grid until a filled cell is entered.
 *
 * Amanatides and Woo, which is the one everybody writes: keep the distance to
 * the next boundary on each axis, always step across the nearest, and the cells
 * come out in the order the ray actually visits them. The alternative - sampling
 * every few centimetres - misses a cell the ray clips the corner of, and misses
 * it differently depending on how fast the sampling is.
 *
 * The cell the ray *starts* in is tested first, and that is not an edge case: a
 * camera pulling back from inside a doorway starts inside a solid cell, and a
 * walk that only tested cells it entered would report nothing in the way.
 */
function castCells(origin: Vec3, dir: Vec3, isSolid: SolidTest, range: number): Hit | null {
  let cx = Math.floor(origin.x)
  let cy = Math.floor(origin.y)
  let cz = Math.floor(origin.z)

  if (isSolid(cx, cy, cz)) return { id: null, point: { ...origin }, distance: 0 }

  const stepX = dir.x > 0 ? 1 : dir.x < 0 ? -1 : 0
  const stepY = dir.y > 0 ? 1 : dir.y < 0 ? -1 : 0
  const stepZ = dir.z > 0 ? 1 : dir.z < 0 ? -1 : 0

  /** Distance along the ray to the next boundary on one axis. Infinite if parallel. */
  const first = (position: number, cell: number, step: number, d: number) => {
    if (step === 0) return Infinity
    const boundary = step > 0 ? cell + 1 : cell
    return (boundary - position) / d
  }

  let tx = first(origin.x, cx, stepX, dir.x)
  let ty = first(origin.y, cy, stepY, dir.y)
  let tz = first(origin.z, cz, stepZ, dir.z)

  const deltaX = stepX === 0 ? Infinity : Math.abs(1 / dir.x)
  const deltaY = stepY === 0 ? Infinity : Math.abs(1 / dir.y)
  const deltaZ = stepZ === 0 ? Infinity : Math.abs(1 / dir.z)

  /**
   * A bound on the walk as well as on the distance.
   *
   * `range` alone is enough in every honest case. The step count is the guard
   * against a direction so nearly axis-aligned that the arithmetic stops
   * advancing - which is a frozen tab rather than a wrong answer, and therefore
   * worth a cheap counter.
   */
  const limit = Math.ceil(range) * 3 + 8

  for (let steps = 0; steps < limit; steps++) {
    const distance = Math.min(tx, ty, tz)
    if (distance > range) return null

    if (tx <= ty && tx <= tz) {
      cx += stepX
      tx += deltaX
    } else if (ty <= tz) {
      cy += stepY
      ty += deltaY
    } else {
      cz += stepZ
      tz += deltaZ
    }

    if (isSolid(cx, cy, cz)) {
      return {
        id: null,
        distance,
        point: {
          x: origin.x + dir.x * distance,
          y: origin.y + dir.y * distance,
          z: origin.z + dir.z * distance,
        },
      }
    }
  }

  return null
}

/** Where a ray crosses the ground plane, if it is going down and reaches it. */
function castGround(origin: Vec3, dir: Vec3, ground: number, range: number): Hit | null {
  if (dir.y >= 0) return null
  const distance = (ground - origin.y) / dir.y
  if (distance < 0 || distance > range) return null
  return {
    id: null,
    distance,
    point: { x: origin.x + dir.x * distance, y: ground, z: origin.z + dir.z * distance },
  }
}

/**
 * How far along a ray a box is, or null if it is not.
 *
 * The slab method: each axis gives the interval of the ray that is inside the
 * box's span on that axis, and the three intervals either overlap or the box is
 * missed. `Infinity` falls out of the divisions for a ray parallel to an axis
 * and is exactly right - the interval is the whole line or none of it, and
 * comparing infinities gets that without a special case.
 *
 * A ray that starts *inside* the box reports zero rather than the far wall,
 * which is what "how far to the first thing" has to mean for a camera already
 * clipping into something.
 */
function boxDistance(origin: Vec3, dir: Vec3, box: Box, range: number): number | null {
  let near = 0
  let far = range

  const axis = (from: number, d: number, min: number, max: number): boolean => {
    if (Math.abs(d) < 1e-9) return from >= min && from <= max
    const t1 = (min - from) / d
    const t2 = (max - from) / d
    near = Math.max(near, Math.min(t1, t2))
    far = Math.min(far, Math.max(t1, t2))
    return near <= far
  }

  if (!axis(origin.x, dir.x, box.minX, box.maxX)) return null
  if (!axis(origin.y, dir.y, box.minY, box.maxY)) return null
  if (!axis(origin.z, dir.z, box.minZ, box.maxZ)) return null

  return near
}

/**
 * How far back a chase camera may sit before it is inside something.
 *
 * The third-person half of this file, and the reason the ray cast is shared. A
 * camera at a fixed distance behind the player is a camera that spends half of a
 * corridor inside the wall behind it, showing the level from the other side -
 * and the fix is not a shorter arm, it is asking.
 *
 * `clearance` is how far short of the surface to stop. Sitting exactly on it
 * puts the near plane through it, which reads as the wall flickering rather than
 * as the camera being close to it.
 */
export function chaseDistance(
  eye: Vec3,
  back: Vec3,
  want: number,
  options: CastOptions & { clearance?: number } = {},
): number {
  const { clearance = 0.3, ...cast } = options
  const hit = castRay(eye, back, { ...cast, range: want })
  if (!hit) return want
  // Never negative: a camera that has been pushed in front of the player is
  // worse than one sitting on their nose.
  return Math.max(0, hit.distance - clearance)
}
