import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { findModel } from '../assets/catalogue'
import { clipIsSquare } from '../document/clips'
import { teamsOf } from '../document/rules'
import { defaultsOf } from '../document/data'
import { describeProblems, parseXp, type Placement, type XpDocument } from '../document/format'
import { EYE_HEIGHT, PLAYER_RADIUS, SPRINT_PACE, step, WALK_PACE } from '../world/physics'
import { buildSolids, placementCells, type CellBox, type Solids } from '../world/solids'
import {
  blockersOf,
  bodiesFor,
  emptyWorld,
  entityByName,
  isDead,
  movePlayer,
  PLAYER_ID,
  spawnEntities,
  spawnPlayer,
  spawnWeapon,
  WEAPON_ID,
  withTag,
  worldTransform,
  type EntityWorld,
} from '../world/entities'
import { pressOn } from '../world/aim'
import { armedWith, castRay, targetsOf } from '../world/shooting'
import { holds, releasedKeys, stepTriggers, type Overlaps } from '../rules/triggers'
import { embedded, push, stepBodies } from '../world/bodies'
import { allowedIn, flowProblems } from '../document/flow'
import { capabilityProblems } from '../document/capabilities'
import { damage, fire } from '../rules/triggers'
import { applyVerb } from '../rules/verbs'

/**
 * Every XP we ship, walked through headlessly.
 *
 * This is the acceptance test for the runtime, and it exists in this shape for
 * a specific reason: the Browser pane never fires `requestAnimationFrame`,
 * because it is always `document.hidden`. A game loop cannot be watched in it
 * at all - a scene that looks frozen there is not a bug - so "can you walk
 * around in this" is a question a screenshot cannot answer and a test can.
 *
 * What it covers is the whole chain a player goes through: the document parses,
 * every model in it is one we ship, the geometry rasterises into cells, the
 * spawn is somewhere you can stand rather than inside a wall, gravity settles
 * you on the floor, and the walls stop you.
 */

const XPS = path.join(import.meta.dir, '..', '..', '..', '..', 'public', 'xp', 'xps')

const all = readdirSync(XPS).filter((f) => f.endsWith('.xp.json'))

/**
 * Cartridges are not walked, because there is nothing to walk in.
 *
 * Every test below drops a player into a world and checks that they land on
 * something and cannot leave it. A framed document has no world at all - it
 * names a game the host runs, see `../document/frame.ts` - so those assertions
 * are not failing, they are asking the wrong question. "You fell through the
 * floor" about a document with no floor is a true statement and a useless one.
 *
 * Filtered here rather than skipped inside each test, so a cartridge does not
 * appear in the output as a dozen quietly passing checks that never ran.
 * `parseXp` still has to accept it - that is `frame.test.ts` - and the store
 * and the battle wizard still list it.
 */
const cartridges = all.filter((file) => {
  const parsed = parseXp(JSON.parse(readFileSync(path.join(XPS, file), 'utf8')))
  return parsed.ok && parsed.document.frame !== undefined
})

const files = all.filter((file) => !cartridges.includes(file))

/** A frame at 60fps. */
const FRAME = 1 / 60

/**
 * Drop the player in and let them settle, then walk them a way.
 *
 * `floorY` is put well below the world rather than at 0, so a spawn that is
 * *not* over anything falls forever instead of being caught by a plane that
 * would hide the bug.
 */
function walk(
  xp: XpDocument,
  solids: Solids,
  { seconds, moveX = 0, moveZ = 0 }: { seconds: number; moveX?: number; moveZ?: number },
) {
  let position = { x: xp.spawn.x, y: xp.spawn.y + EYE_HEIGHT, z: xp.spawn.z }
  let velocityY = 0
  let grounded = false
  let jumps = 0
  let restarts = 0

  /**
   * The document's own answer to what is under the world.
   *
   * A document that says falling starts you over has to be walked *with* that
   * rule, or the helper is testing a different level from the one that ships -
   * and it would report every open course as one you fall out of.
   */
  const restart = xp.world.restart
    ? { below: xp.world.floorY, to: { x: xp.spawn.x, y: xp.spawn.y, z: xp.spawn.z } }
    : undefined

  /**
   * And the document's own answer to what is under *the edge of it*.
   *
   * This was `-100` for every level, which is not what any of them ships with:
   * `scene.tsx` gives the controller `world.floorY` when a document turns
   * `ground` on and forty cells below it when it does not. A level with a ground
   * plane and a small floor patch - which is what a document made of rooms is -
   * was therefore walked here with the plane switched off, so stepping off the
   * tiles fell a hundred cells and the level was reported as one you can walk
   * out of. `two-rooms` is the first document that is shaped that way; every
   * other one we ship is a box with walls, which is why the constant survived.
   *
   * The same expression as the runtime's rather than a second guess at it: a
   * helper that walks a different level from the one that ships is a test that
   * can only mislead, in whichever direction it happens to be wrong.
   */
  const floorY = xp.world.ground ? xp.world.floorY : xp.world.floorY - 40

  for (let i = 0; i < Math.round(seconds / FRAME); i++) {
    const result = step({
      position,
      velocityY,
      moveX: moveX * WALK_PACE * FRAME,
      moveZ: moveZ * WALK_PACE * FRAME,
      jump: false,
      grounded,
      jumps,
      delta: FRAME,
      isSolid: solids.isSolid,
      floorY,
      ...(restart ? { restart } : {}),
    })
    position = result.position
    velocityY = result.velocityY
    grounded = result.grounded
    jumps = result.jumps
    if (result.restarted) restarts += 1
  }

  return { position, grounded, restarts }
}

test('there is at least one XP to load', () => {
  expect(files.length).toBeGreaterThan(0)
})

/**
 * A cartridge is still a document, and still has to parse.
 *
 * The only thing this file asks of one - everything else here is about walking
 * around, which a cartridge has nowhere to do. Its own behaviour is tested by
 * the game that it names.
 */
describe.each(cartridges)('%s (a cartridge)', (file) => {
  test('parses, and names a game', () => {
    const parsed = parseXp(JSON.parse(readFileSync(path.join(XPS, file), 'utf8')))
    if (!parsed.ok) throw new Error(describeProblems(parsed.problems))
    expect(parsed.document.frame?.game.length).toBeGreaterThan(0)
  })
})

describe.each(files)('%s', (file) => {
  const raw = JSON.parse(readFileSync(path.join(XPS, file), 'utf8'))
  const parsed = parseXp(raw)

  test('parses', () => {
    if (!parsed.ok) {
      // Printed rather than just failed: the whole point of collecting problems
      // is that a document with six typos reports six typos.
      throw new Error(`${file} was refused:\n${describeProblems(parsed.problems)}`)
    }
    expect(parsed.ok).toBe(true)
  })

  if (!parsed.ok) return

  const xp = parsed.document
  const solids = buildSolids(xp.world)

  test('every model in it rasterises - none were skipped', () => {
    expect(solids.skipped).toEqual([])
  })

  /**
   * A floor of some kind - and there are two kinds.
   *
   * This asked for rasterised cells, which was every document until one of them
   * was a board: `mensch` is a table drawn entirely in flat pieces on `world.ground`,
   * so once its decals stopped being solid it had exactly zero filled cells and
   * failed a check about falling through the world while standing on a plane.
   *
   * The plane counts, because it is the same promise. The walk below is the one
   * that actually proves it either way; this is the cheap version that says
   * which of the two a document meant.
   */
  test('it has something to stand on', () => {
    expect(xp.world.ground || solids.count > 0).toBe(true)
  })

  test('the spawn is not inside a wall', () => {
    // Feet and head both clear. A document that spawns you inside geometry is
    // one where the player starts stuck, which is hard to diagnose in a browser
    // and trivial here.
    expect(solids.isSolid(xp.spawn.x, xp.spawn.y, xp.spawn.z)).toBe(false)
    expect(solids.isSolid(xp.spawn.x, xp.spawn.y + 1, xp.spawn.z)).toBe(false)
  })

  /**
   * And the same for the marks, which is where everybody *else* arrives.
   *
   * `xp.spawn` is one place and a level with sides has one mark per side, and
   * only the first of those was ever checked - so a team spawn could sit inside
   * a pillar and the level would look perfectly fine to whoever built it,
   * because they arrive at the document's own spawn every time they open it.
   * The shooter had exactly that for the length of one commit: its blue mark
   * landed on a pillar that went in with the second floor.
   */
  test('every spawn mark is somewhere you can stand', () => {
    for (const mark of xp.world.marks) {
      if (mark.kind !== 'spawn') continue
      const where = `${mark.team ?? 'nobody'}'s spawn at ${mark.x},${mark.y},${mark.z}`
      expect(`${where}: feet ${solids.isSolid(mark.x, mark.y, mark.z)}`).toBe(`${where}: feet false`)
      expect(`${where}: head ${solids.isSolid(mark.x, mark.y + 1, mark.z)}`).toBe(
        `${where}: head false`,
      )
    }
  })

  test('you land on the floor rather than falling through it', () => {
    const { position, grounded } = walk(xp, solids, { seconds: 2 })
    expect(grounded).toBe(true)
    expect(position.y).toBeGreaterThan(-1)
    // Settled at the spawn's own height, not somewhere below it.
    expect(position.y).toBeCloseTo(xp.spawn.y + EYE_HEIGHT, 1)
  })

  test('you cannot walk out of the level, in any direction', () => {
    /**
     * Against the level's own extent rather than a fixed distance.
     *
     * This asserted `travelled < 30`, with the note that five seconds of walking
     * is further than any of these rooms is wide. That was true of every
     * document here until one of them stopped being a room: `ladder-run` is a
     * race course roughly fifty cells end to end, and walking its length is the
     * thing it is *for*.
     *
     * So the invariant is the one that was always meant - you end up somewhere
     * the level actually is - and it holds for a room and a course without
     * either needing to know about the other. A room stops you at its wall well
     * inside this; a course lets you run its length and no further.
     */
    const bounds = xp.world.placements.reduce(
      (box, placement) => ({
        minX: Math.min(box.minX, placement.x),
        maxX: Math.max(box.maxX, placement.x),
        minZ: Math.min(box.minZ, placement.z),
        maxZ: Math.max(box.maxZ, placement.z),
      }),
      { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
    )
    // A slab is centred on its footprint and the widest in any kit here is six
    // across, so three cells covers the half-width of the outermost piece.
    const margin = 3

    for (const [moveX, moveZ] of [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ]) {
      const { position, grounded } = walk(xp, solids, { seconds: 5, moveX, moveZ })

      // Never lost out of the bottom, whatever the document says is down there.
      expect(position.y).toBeGreaterThan(-1)

      /**
       * In bounds *when standing*, which is the honest form of it.
       *
       * A course you fall off legitimately has the player outside the level for
       * the half-second of the fall - walking off the west edge of `ladder-run`
       * carries you a couple of cells past the last slab before `restart` sends
       * you back, and asserting on that moment would be asserting that a
       * platformer does not let you miss. What must never happen is *ending up*
       * somewhere the level is not, which is what standing there means.
       */
      if (!grounded) continue

      /**
       * And only where the document has an edge to be outside of.
       *
       * `world.ground` is an infinite plane at `floorY` - it is how a level says
       * *there is floor everywhere*, and `canStandIn` reads it as exactly that.
       * A level that turns it on and lays a small patch of tiles has no bounds
       * for this to be measured against: walking off the tiles is walking on the
       * ground the document asked for, not walking out of the level.
       *
       * So for a grounded world the invariant is the one above, which is the one
       * that matters and which does not depend on anybody having built walls:
       * you do not fall out of it. `two-rooms` is the first document shaped that
       * way; every other one we ship is a box, and for those nothing changes.
       */
      if (xp.world.ground) continue
      expect(position.x).toBeGreaterThanOrEqual(bounds.minX - margin)
      expect(position.x).toBeLessThanOrEqual(bounds.maxX + margin)
      expect(position.z).toBeGreaterThanOrEqual(bounds.minZ - margin)
      expect(position.z).toBeLessThanOrEqual(bounds.maxZ + margin)
    }
  })
})

/**
 * Stairs you can walk up.
 *
 * This is here because somebody walked into a staircase and it was a wall, and
 * nothing in the suite noticed. Three separate things had to be right for it to
 * work and each was wrong in turn: the model needed a shape rather than a box,
 * the voxeliser was counting a step's top face into the cell above it (making
 * every step a cell too tall), and the controller had no step-up at all.
 *
 * A profile test would have caught the first two. Only walking catches the
 * third, which is why this drives the actual controller over the actual level.
 */
test('the example room has a route you can climb', () => {
  const raw = JSON.parse(readFileSync(path.join(XPS, 'first-room.xp.json'), 'utf8'))
  const parsed = parseXp(raw)
  expect(parsed.ok).toBe(true)
  if (!parsed.ok) return

  const solids = buildSolids(parsed.document.world)

  // Straight east from the middle of the room, into the half-stairs.
  let position = { x: 0, y: 1 + EYE_HEIGHT, z: 0 }
  let velocityY = 0
  let grounded = true
  let jumps = 0
  let highest = 1

  for (let i = 0; i < 4 * 60; i++) {
    const result = step({
      position,
      velocityY,
      moveX: WALK_PACE * FRAME,
      moveZ: 0,
      jump: false,
      grounded,
      jumps,
      delta: FRAME,
      isSolid: solids.isSolid,
      floorY: -100,
    })
    position = result.position
    velocityY = result.velocityY
    grounded = result.grounded
    jumps = result.jumps
    highest = Math.max(highest, position.y - EYE_HEIGHT)
  }

  // Climbed at least two cells without jumping, and never left the room.
  expect(highest).toBeGreaterThanOrEqual(3)
  expect(position.y).toBeGreaterThan(-1)
})

/**
 * Nothing is buried in anything else.
 *
 * Two of these shipped and a person found both by looking: a workbench sunk
 * halfway into a wall, and a weapon rack inside a stack of crates. Neither
 * breaks a rule the parser knows about - every placement was legal, in bounds,
 * and a model we ship - so nothing complained.
 *
 * The rule that catches it: a *prop* may touch structure but not occupy the
 * same cells as anything else. Structure is exempt from itself, because walls
 * meeting at a corner share a cell by design and always will.
 *
 * **And paint is exempt from everything.** A model with no measured height is a
 * mark lying on a surface, and lying on a surface is the entire job: an arrow
 * on the field it is about shares that field's cell on purpose, and there is no
 * volume for either of them to be buried in. The rule this test is really
 * making is about *solids* overlapping, and a decal is not one.
 */
const STRUCTURAL = /^proto\/Primitive_(Floor|Wall)/

/** The floor `extent` clamps to, which is what "measured no height at all" reads as. */
const PAINT = 0.01

test('no prop is buried inside another placement', () => {
  for (const file of files) {
    const parsed = parseXp(JSON.parse(readFileSync(path.join(XPS, file), 'utf8')))
    if (!parsed.ok) continue

    const boxes = parsed.document.world.placements
      .filter((placement) => (findModel(placement.model)?.size.h ?? 1) > PAINT)
      .map((placement) => ({ placement, box: placementCells(placement) }))
      .filter((entry): entry is { placement: Placement; box: CellBox } => entry.box !== null)

    const buried: string[] = []
    for (let a = 0; a < boxes.length; a++) {
      for (let b = a + 1; b < boxes.length; b++) {
        const structural =
          STRUCTURAL.test(boxes[a].placement.model) && STRUCTURAL.test(boxes[b].placement.model)
        if (structural) continue

        const A = boxes[a].box
        const B = boxes[b].box
        const overlaps =
          A.minX <= B.maxX &&
          A.maxX >= B.minX &&
          A.minY <= B.maxY &&
          A.maxY >= B.minY &&
          A.minZ <= B.maxZ &&
          A.maxZ >= B.minZ
        if (overlaps) {
          buried.push(`${boxes[a].placement.model} inside ${boxes[b].placement.model}`)
        }
      }
    }

    expect(buried).toEqual([])
  }
})


/**
 * The two rooms are actually joined.
 *
 * `moving-parts` claims a corridor between an arena and a pitch, and a corridor
 * is the one thing in a level that is easy to build wrong and impossible to see
 * wrong from above: leave one wall piece in and it is a cupboard, and the
 * screenshot looks identical either way.
 *
 * So this walks it. From the arena's spawn, south, for long enough to cross
 * both rooms - and the assertion is that the player ends up past the dividing
 * wall, which they can only do by going through the gap.
 */
test('moving-parts: you can walk from the arena into the pitch', () => {
  const parsed = parseXp(JSON.parse(readFileSync(path.join(XPS, 'moving-parts.xp.json'), 'utf8')))
  expect(parsed.ok).toBe(true)
  if (!parsed.ok) return

  const xp = parsed.document
  const solids = buildSolids(xp.world)

  // Down the middle of the corridor mouth, which is the gap at x = 2.
  let position = { x: 2, y: 1 + EYE_HEIGHT, z: 8 }
  let velocityY = 0
  let grounded = true
  let jumps = 0

  for (let i = 0; i < 6 * 60; i++) {
    const result = step({
      position,
      velocityY,
      moveX: 0,
      moveZ: WALK_PACE * FRAME,
      jump: false,
      grounded,
      jumps,
      delta: FRAME,
      isSolid: solids.isSolid,
      floorY: -100,
    })
    position = result.position
    velocityY = result.velocityY
    grounded = result.grounded
    jumps = result.jumps
  }

  // Past z = 20, which is the wall between the two rooms: anywhere beyond it is
  // the pitch, and there is no way there except the corridor.
  expect(position.z).toBeGreaterThan(20)
  // Still on the floor rather than having fallen out through a gap left by the
  // corridor's own walls.
  expect(position.y - EYE_HEIGHT).toBeCloseTo(1, 1)
})

/**
 * The shooter, fired headlessly.
 *
 * The acceptance test for §8.1, and it exists for the same reason the walk above
 * does: a canvas in the Browser pane never gets a frame, so "can you actually
 * hit that target" is a question a screenshot cannot answer. What it covers is
 * the whole chain a shot goes through - the weapon is in a hand, the ray leaves
 * the eye, it stops at whatever is in front, the health comes off, and the rule
 * the *document* declares is what breaks the thing and leaves pieces behind.
 */
describe('the shooter demo', () => {
  const shooter = (): XpDocument => {
    const parsed = parseXp(JSON.parse(readFileSync(path.join(XPS, 'shooter.xp.json'), 'utf8')))
    if (!parsed.ok) throw new Error(describeProblems(parsed.problems))
    return parsed.document
  }

  /** The world, with the player standing at the spawn holding their gun. */
  const armed = (xp: XpDocument) => {
    const world = spawnEntities(xp)
    spawnPlayer(world, xp, { ...xp.spawn, facing: xp.spawn.facing })
    spawnWeapon(world, xp)
    return world
  }

  test('the pistol is in the marksman’s hand, and turns with them', () => {
    const xp = shooter()
    const world = armed(xp)
    expect(world.alive.has(WEAPON_ID)).toBe(true)

    const at = worldTransform(world, WEAPON_ID, xp.blueprints)
    const body = world.position.get(PLAYER_ID)!
    // Held out in front and to one side rather than standing at the body's own
    // origin, which is what a socket is for.
    expect(Math.hypot(at.x - body.x, at.z - body.z)).toBeGreaterThan(0.3)
    expect(at.y).toBeGreaterThan(body.y + 1)
  })

  /**
   * The check worth having, and the one this level was laid out twice to pass.
   *
   * Architecture rasterises into the cells it *mostly* covers (docs/xp/manual.md
   * §4), so a target mounted flush against its own stand ends up inside a solid
   * cell: it is drawn perfectly, it is standing where you put it, and every shot
   * lands on the post in front of it. Nothing about the level looks wrong.
   *
   * The ray starts four metres out, along the line from the spawn - close enough
   * that only the thing's own surroundings can be in the way, which is exactly
   * what is being asked about. Whether a *particular* corner of the arena has a
   * clean line to it is level design, and the test below is the one that cares.
   */
  test('nothing you can shoot is buried in the thing holding it up', () => {
    const xp = shooter()
    const world = armed(xp)
    const solids = buildSolids(xp.world)
    const spawn = { x: xp.spawn.x, y: xp.spawn.y + EYE_HEIGHT, z: xp.spawn.z }

    for (const name of ['target-1', 'target-2', 'target-3', 'cover-left', 'cover-right']) {
      const id = entityByName(world, name)!
      const box = world.box.get(id)!
      const middle = {
        x: (box.minX + box.maxX) / 2,
        y: (box.minY + box.maxY) / 2,
        z: (box.minZ + box.maxZ) / 2,
      }
      const away = {
        x: spawn.x - middle.x,
        y: spawn.y - middle.y,
        z: spawn.z - middle.z,
      }
      const length = Math.hypot(away.x, away.y, away.z)
      const from = {
        x: middle.x + (away.x / length) * 4,
        y: middle.y + (away.y / length) * 4,
        z: middle.z + (away.z / length) * 4,
      }

      const hit = castRay(
        from,
        { x: middle.x - from.x, y: middle.y - from.y, z: middle.z - from.z },
        {
          isSolid: solids.isSolid,
          targets: targetsOf(world),
          range: 60,
          ignore: new Set([PLAYER_ID, WEAPON_ID]),
        },
      )
      expect(hit?.id).toBe(id)
    }
  })

  test('there is something to shoot from where you arrive', () => {
    const xp = shooter()
    const world = armed(xp)
    const solids = buildSolids(xp.world)
    const eye = { x: xp.spawn.x, y: xp.spawn.y + EYE_HEIGHT, z: xp.spawn.z }
    const id = entityByName(world, 'target-2')!
    const box = world.box.get(id)!
    const middle = {
      x: (box.minX + box.maxX) / 2,
      y: (box.minY + box.maxY) / 2,
      z: (box.minZ + box.maxZ) / 2,
    }

    // Straight down the middle of the arena. The other two are behind cover from
    // here, which is the level doing its job rather than a fault.
    const hit = castRay(
      eye,
      { x: middle.x - eye.x, y: middle.y - eye.y, z: middle.z - eye.z },
      {
        isSolid: solids.isSolid,
        targets: targetsOf(world),
        range: 60,
        ignore: new Set([PLAYER_ID, WEAPON_ID]),
      },
    )
    expect(hit?.id).toBe(id)
  })

  /**
   * The gantry, walked on to from both ends.
   *
   * The level has an upper floor now, and a floor nobody can reach is scenery
   * that took a hundred cells to draw. Two routes go up - stairs off the deck
   * you arrive on and a ramp out of the middle of the pit - and both are a
   * *rasterised* staircase rather than a model of one: what decides whether
   * they work is the cell each step lands in and the controller's 1.05 step-up,
   * neither of which is visible in a screenshot. Getting one of them a cell
   * wrong is a ramp you walk into rather than up.
   */
  test('there is a way up on to the gantry, from both ends of it', () => {
    const xp = shooter()
    const solids = buildSolids(xp.world)

    /** Walk from a standing start, and give back where the feet ended up. */
    const climb = (from: { x: number; z: number }, moveZ: number, seconds: number) => {
      let position = { x: from.x, y: 1 + EYE_HEIGHT, z: from.z }
      let velocityY = 0
      let grounded = true
      let jumps = 0
      for (let i = 0; i < Math.round(seconds / FRAME); i++) {
        const result = step({
          position,
          velocityY,
          moveX: 0,
          moveZ: moveZ * WALK_PACE * FRAME,
          jump: false,
          grounded,
          jumps,
          delta: FRAME,
          isSolid: solids.isSolid,
          floorY: xp.world.floorY - 40,
        })
        position = result.position
        velocityY = result.velocityY
        grounded = result.grounded
        jumps = result.jumps
      }
      return { feet: position.y - EYE_HEIGHT, grounded }
    }

    // North up the stairs in the south-east corner, and north up the ramp that
    // comes out of the pit. The deck is four cells up, so anything short of
    // that is somebody standing at the bottom of a wall.
    expect(climb({ x: 18, z: 18 }, -1, 6)).toEqual({ feet: 5, grounded: true })
    expect(climb({ x: 14, z: -2 }, -1, 6)).toEqual({ feet: 5, grounded: true })
  })

  /**
   * The window in the bunker is a window.
   *
   * `Primitive_Window` is one of the few models whose *hole* survives
   * rasterisation - it straddles two whole cells, where a doorway's 1.6 m
   * opening does not (docs/xp/manual.md §4) - and the bullseye inside the
   * bunker is lined up with it on purpose. If the mask ever stopped being read,
   * the level would look exactly the same and the shot would land on a wall.
   */
  test('the bullseye in the bunker can be shot through the window', () => {
    const xp = shooter()
    const world = armed(xp)
    const solids = buildSolids(xp.world)
    const inside = [...world.alive].find(
      (id) => world.blueprint.get(id) === 'bullseye' && (world.position.get(id)?.x ?? 0) < -18,
    )!
    const box = world.box.get(inside)!
    const middle = {
      x: (box.minX + box.maxX) / 2,
      y: (box.minY + box.maxY) / 2,
      z: (box.minZ + box.maxZ) / 2,
    }

    // From outside the bunker, at eye height, square on to the opening.
    const eye = { x: -8, y: 1 + EYE_HEIGHT, z: middle.z }
    const hit = castRay(
      eye,
      { x: middle.x - eye.x, y: middle.y - eye.y, z: middle.z - eye.z },
      {
        isSolid: solids.isSolid,
        targets: targetsOf(world),
        range: 60,
        ignore: new Set([PLAYER_ID, WEAPON_ID]),
      },
    )
    expect(hit?.id).toBe(inside)
  })

  test('four rounds break a target, and it leaves pieces', () => {
    const xp = shooter()
    const world = armed(xp)
    const blueprints = bodiesFor(xp)
    const id = entityByName(world, 'target-2')!

    const damageOf = world.props.get(WEAPON_ID)!.damage
    const before = world.alive.size

    // Three of them, and it is still standing - the rule asks `hp <= 0` and 75
    // is not 100.
    damage(world, blueprints, id, damageOf, PLAYER_ID)
    damage(world, blueprints, id, damageOf, PLAYER_ID)
    const effects = damage(world, blueprints, id, damageOf, PLAYER_ID)
    expect(world.alive.has(id)).toBe(true)
    expect(effects).toEqual([])

    const last = damage(world, blueprints, id, damageOf, PLAYER_ID)
    expect(world.alive.has(id)).toBe(false)
    expect(last.filter((effect) => effect.kind === 'spawned')).toHaveLength(2)
    expect(last.some((effect) => effect.kind === 'score')).toBe(true)
    // Two pieces in, one target out.
    expect(world.alive.size).toBe(before + 1)
  })

  test('a barrel takes whoever shot it with it', () => {
    const xp = shooter()
    const world = armed(xp)
    const blueprints = bodiesFor(xp)
    const barrel = withTag(world, blueprints, 'breakable').find(
      (id) => world.blueprint.get(id) === 'barrel',
    )!

    damage(world, blueprints, barrel, 25, PLAYER_ID)
    expect(world.alive.has(barrel)).toBe(false)
    // `target: "other"` is the shooter, which is the whole point of the field.
    expect(world.props.get(PLAYER_ID)!.hp).toBe(80)
  })

  /**
   * The ammo boxes are scattered, and scattered is the thing that can go wrong.
   *
   * They were four, in the four corners, and are now eleven rolled once and
   * written into the file - which is what "random" has to mean in a document two
   * clients load and then agree about. What a roll can produce that a hand-placed
   * corner cannot is a box inside a pillar: still collectable, because a pickup
   * has no collider and the trigger pass only asks where you are, but standing
   * somewhere you cannot get to.
   */
  test('every ammo box is somewhere you can stand', () => {
    const xp = shooter()
    const solids = buildSolids(xp.world)
    const boxes = xp.entities.filter((entity) => entity.blueprint === 'ammo')
    expect(boxes.length).toBeGreaterThan(4)

    for (const box of boxes) {
      const x = Math.floor(box.x)
      const y = Math.floor(box.y)
      const z = Math.floor(box.z)
      // Room for a person: the cell it is in and the one above are empty, and
      // there is a floor under it.
      expect(solids.isSolid(x, y, z)).toBe(false)
      expect(solids.isSolid(x, y + 1, z)).toBe(false)
      expect(solids.isSolid(x, y - 1, z)).toBe(true)
    }

    // Spread out rather than clustered, which is the other half of the point:
    // running out should mean crossing the arena, not turning round.
    for (const box of boxes) {
      const others = boxes.filter((other) => other !== box)
      const nearest = Math.min(...others.map((o) => Math.hypot(o.x - box.x, o.z - box.z)))
      expect(nearest).toBeGreaterThan(2)
    }
  })

  test('an ammo box refills the person who walked in, not the box', () => {
    const xp = shooter()
    const world = armed(xp)
    const blueprints = bodiesFor(xp)
    const box = [...world.alive].find((id) => world.blueprint.get(id) === 'ammo')!

    const started = world.props.get(PLAYER_ID)!.ammo
    fire(world, blueprints, box, 'enter', PLAYER_ID)
    expect(world.props.get(PLAYER_ID)!.ammo).toBe(started + 12)
    expect(world.alive.has(box)).toBe(false)
  })
})

/**
 * The platformer race, measured against what a body can actually do.
 *
 * A course is a pile of arithmetic: every gap has to be inside the jump and
 * every rise inside the climb, and one wrong number out of sixty makes a race
 * nobody can finish. The first draft of `ladder-run` had exactly that - a final
 * jump of six cells *and* a two-cell rise, which nothing clears - and it looked
 * completely fine in a screenshot.
 *
 * The budget is simulated here rather than written down, so that the day
 * somebody tunes `JUMP_SPEED` or `GRAVITY` this fails instead of quietly
 * becoming a lie.
 *
 * What this is not: proof that the course can be run. A gap inside the budget
 * can still be unreachable for reasons geometry does not see - a landing under
 * an overhang, a rail in the way. Driving the controller round the whole course
 * is the stronger test and it wants a steering model that does not deadlock on
 * its own jump key; see task.md.
 */
describe('the platformer race', () => {
  const race = (): XpDocument => {
    const raw = JSON.parse(readFileSync(path.join(XPS, 'ladder-run.xp.json'), 'utf8'))
    const parsed = parseXp(raw)
    if (!parsed.ok) throw new Error(describeProblems(parsed.problems))
    return parsed.document
  }

  /** Straight up from flat ground, double-jumping at the apex. */
  const highestJump = () => {
    let position = { x: 0, y: EYE_HEIGHT, z: 0 }
    let velocityY = 0
    let grounded = true
    let jumps = 0
    let peak = 0
    let spent = false
    for (let i = 0; i < 200; i++) {
      const apex = !spent && i > 2 && Math.abs(velocityY) < 0.2
      if (apex) spent = true
      const r = step({
        position,
        velocityY,
        moveX: 0,
        moveZ: 0,
        jump: true,
        jumpPressed: i === 0 || apex,
        grounded,
        jumps,
        delta: FRAME,
        isSolid: () => false,
        floorY: 0,
      })
      position = r.position
      velocityY = r.velocityY
      grounded = r.grounded
      jumps = r.jumps
      peak = Math.max(peak, position.y - EYE_HEIGHT)
    }
    return peak
  }

  /** How far a jump carries at a given pace, from take-off to back down. */
  const jumpSpan = (pace: number) => {
    let position = { x: 0, y: EYE_HEIGHT, z: 0 }
    let velocityY = 0
    let grounded = true
    let jumps = 0
    for (let i = 0; i < 200; i++) {
      const r = step({
        position,
        velocityY,
        moveX: pace * FRAME,
        moveZ: 0,
        jump: true,
        jumpPressed: i === 0,
        grounded,
        jumps,
        delta: FRAME,
        isSolid: () => false,
        floorY: 0,
      })
      position = r.position
      velocityY = r.velocityY
      grounded = r.grounded
      jumps = r.jumps
      if (i > 3 && position.y - EYE_HEIGHT <= 1e-3) break
    }
    return position.x
  }

  /** The slabs, in the order they were laid, which is the order they are run. */
  const legs = (xp: XpDocument) =>
    xp.world.placements
      .filter((placement) => placement.model.includes('/platform_'))
      .map((placement) => {
        const named = /platform_(\d+)x(\d+)x(\d+)/.exec(placement.model)
        if (!named) throw new Error(`not a slab: ${placement.model}`)
        return {
          w: Number(named[1]),
          d: Number(named[2]),
          x: placement.x,
          z: placement.z,
          /** Standing height: the slab's own top. */
          top: placement.y + 1,
        }
      })

  test('it declares competition, and has the marks that claim needs', () => {
    const xp = race()
    expect(xp.capabilities).toContain('competition')
    expect(xp.world.marks.filter((mark) => mark.kind === 'start')).toHaveLength(1)
    expect(xp.world.marks.filter((mark) => mark.kind === 'finish')).toHaveLength(1)
  })

  test('every gap is inside a jump and every rise inside a climb', () => {
    const xp = race()
    const course = legs(xp)
    expect(course.length).toBeGreaterThan(8)

    const climb = highestJump()
    const reach = jumpSpan(SPRINT_PACE)

    for (let i = 1; i < course.length; i++) {
      const from = course[i - 1]
      const to = course[i]
      // Edge to edge, not centre to centre: the kit's slabs are centred on
      // their footprint, so "six apart" is a different jump for a 4-wide slab
      // than for a 6-wide one.
      const gapX = Math.max(0, Math.abs(to.x - from.x) - (from.w + to.w) / 2)
      const gapZ = Math.max(0, Math.abs(to.z - from.z) - (from.d + to.d) / 2)
      const gap = Math.hypot(gapX, gapZ)
      const rise = to.top - from.top

      expect(gap).toBeLessThan(reach)
      expect(rise).toBeLessThan(climb)

      /**
       * And never both at once.
       *
       * The two budgets are measured separately - a jump that goes 8.23 cells
       * goes nowhere near that far if it also has to end two cells up, because
       * the height is bought out of the same arc. So a long gap is flat and a
       * rise is a short gap, which is a rule about the course rather than about
       * the controller.
       */
      if (gap > jumpSpan(WALK_PACE)) expect(rise).toBeLessThanOrEqual(0)
    }
  })

  test('you arrive on the course rather than beside it', () => {
    const xp = race()
    const solids = buildSolids(xp.world)
    // Something under the spawn, and headroom above it.
    expect(solids.isSolid(xp.spawn.x, xp.spawn.y - 1, xp.spawn.z)).toBe(true)
    expect(solids.isSolid(xp.spawn.x, xp.spawn.y, xp.spawn.z)).toBe(false)
    expect(solids.isSolid(xp.spawn.x, xp.spawn.y + 1, xp.spawn.z)).toBe(false)
  })

  /**
   * The rule that makes it a platformer rather than a stroll.
   *
   * Walking off the side used to cost the climb - there was a floor down there
   * and `world.ground` on, because nothing could move the player. Now the
   * bottom of the world is where a run ends, and this is the test that says so:
   * step off the first slab and you are back at the start, not standing on
   * something forty cells down.
   */
  test('walking off the edge starts you over', () => {
    const xp = race()
    expect(xp.world.restart).toBe(true)
    expect(xp.world.ground).toBe(false)

    const solids = buildSolids(xp.world)
    const { restarts, position } = walk(xp, solids, { seconds: 5, moveZ: 1 })
    expect(restarts).toBeGreaterThan(0)
    // And back at the start rather than wherever the fall was heading.
    expect(Math.hypot(position.x - xp.spawn.x, position.z - xp.spawn.z)).toBeLessThan(12)
  })

  /**
   * You can walk up the stairs without dying on them.
   *
   * Reported from the game as "walking up the stairs teleports me to the
   * spawn", and it was a hazard placed in the only route: a 4x4 spike patch on
   * a 4x4 step covers the whole step, so the staircase killed anybody who used
   * it. A hazard that blocks the only way through is not a hazard, it is a wall
   * that lies about what it is.
   *
   * Geometry could not catch this - every gap and rise was still inside the
   * budget, and the course still *looked* right. Only walking it does.
   */
  /**
   * Walking the course, with the hazards live.
   *
   * Two runs of one harness, because the pair is the claim: a hazard has to be
   * lethal *and* avoidable. Either alone is a bug with a different name -
   * lethal-and-unavoidable is a wall that lies about what it is, and
   * avoidable-but-harmless is scenery.
   *
   * Both came from the game rather than from an idea. "Walking up the stairs
   * teleports me to the spawn" was a spike patch sitting in the only route; and
   * the first fix for it was a solid collider half a cell tall, which the
   * controller cheerfully steps you up onto - so the spikes became a doorstep
   * and nothing died on them at all.
   */
  const runEast = (z: number, seconds: number) => {
    const xp = race()
    const solids = buildSolids(xp.world)
    const world = spawnEntities(xp)
    spawnPlayer(world, xp, xp.spawn)
    const blueprints = bodiesFor(xp)

    let position = { x: xp.spawn.x, y: xp.spawn.y + EYE_HEIGHT, z }
    let velocityY = 0
    let grounded = true
    let jumps = 0
    let highest = xp.spawn.y
    const overlaps: Overlaps = new Map()

    for (let i = 0; i < seconds * 60; i++) {
      const result = step({
        position,
        velocityY,
        moveX: WALK_PACE * FRAME,
        moveZ: 0,
        jump: false,
        grounded,
        jumps,
        delta: FRAME,
        isSolid: solids.isSolid,
        blockers: blockersOf(world, new Map()),
        floorY: xp.world.floorY - 40,
      })
      position = result.position
      velocityY = result.velocityY
      grounded = result.grounded
      jumps = result.jumps

      /**
       * The trigger pass, which is what a hazard actually kills through.
       * Walking alone proves the stairs are climbable and says nothing about
       * whether something on them is lethal.
       */
      const feet = position.y - EYE_HEIGHT
      movePlayer(world, { x: position.x, y: feet, z: position.z }, 90)
      stepTriggers(
        world,
        blueprints,
        [
          {
            id: PLAYER_ID,
            box: {
              minX: position.x - PLAYER_RADIUS,
              minY: feet,
              minZ: position.z - PLAYER_RADIUS,
              maxX: position.x + PLAYER_RADIUS,
              maxY: position.y,
              maxZ: position.z + PLAYER_RADIUS,
            },
          },
        ],
        overlaps,
      )
      highest = Math.max(highest, feet)
      if (isDead(world, PLAYER_ID)) break
    }

    return { dead: isDead(world, PLAYER_ID), x: position.x, highest }
  }

  test('the spikes kill somebody who runs straight into them', () => {
    // Down the middle of the run-up, which is where the patch is.
    const run = runEast(0, 3)
    expect(run.dead).toBe(true)
  })

  test('and there is a way past them, up the stairs, alive', () => {
    // A cell and a half off centre: still on the six-wide slab, clear of a
    // two-wide patch. Walked rather than jumped, because the stairs are
    // one-cell rises and `STEP_HEIGHT` is meant to take them.
    const run = runEast(1.5, 3)
    expect(run.dead).toBe(false)
    expect(run.highest).toBeGreaterThanOrEqual(4)
    expect(run.x).toBeGreaterThan(18)
  })

  test('the finish is somewhere you can stand', () => {
    const xp = race()
    const solids = buildSolids(xp.world)
    const finish = xp.world.marks.find((mark) => mark.kind === 'finish')!
    expect(solids.isSolid(finish.x, finish.y - 1, finish.z)).toBe(true)
    expect(solids.isSolid(finish.x, finish.y, finish.z)).toBe(false)
  })
})

/**
 * The board game, from the seat somebody actually sits in.
 *
 * `mensch` is the first document whose whole loop runs through the arbiter -
 * roll, advance, pass - and none of that is reachable in a screenshot or in the
 * Browser pane. What *is* checkable here is the half a browser kept failing to
 * demonstrate: whether a press at the spawn reaches a piece at all.
 *
 * The reach is the interesting number. `within` measures in three dimensions
 * from the player's **body**, which the runtime places at the eye minus
 * `EYE_HEIGHT` - so a test that puts the player at the spawn is asking the same
 * question the running level asks.
 *
 * ---------------------------------------------------------------------------
 * What changed when the body became a ring
 * ---------------------------------------------------------------------------
 * Both numbers this rested on moved, and they moved for the same reason: the
 * player is no longer a two-metre figure standing *beside* a piece, it is a
 * one-cell ring parked *on* one. So `within` came down from 2 to 0.9 - at two
 * metres a ring on a field could reach the two fields either side of it, and a
 * press would have moved whichever piece the engine asked about first - and the
 * spawn moved from the middle of the blue yard onto a piece in it, because the
 * middle of the yard is the one spot in it with nothing selected.
 *
 * And a press is now a *second* act rather than the only one: it does nothing
 * until a roll has landed. That is the choosing step this whole document was
 * missing, so both halves of it are asserted below.
 */
describe('mensch ärgere dich nicht, from the seat', () => {
  const mensch = (): XpDocument => {
    const parsed = parseXp(JSON.parse(readFileSync(path.join(XPS, 'mensch.xp.json'), 'utf8')))
    if (!parsed.ok) throw new Error(describeProblems(parsed.problems))
    return parsed.document
  }

  /**
   * Everything `use` sets off, from where a player arrives.
   *
   * `roll` is what the table's data says the die landed on - the number a rule
   * reads through `of: 'world'`, which is how the piece knows whether there is
   * anything to move by.
   */
  /**
   * A table, set up and playable.
   *
   * `data` is the level's own block rather than a fixture, so a rule reading
   * `of: 'world'` reads what the document declared - and the same map is what
   * `setProp target: 'world'` writes into, which is the mechanism three of the
   * rules below depend on.
   */
  /**
   * Where a seated player actually arrives, which is their own colour's mark.
   *
   * Not `xp.spawn`: that is the fallback for somebody with no side, and under
   * `assign: 'claim'` it is the middle of the board - the same distance from all
   * four corners, so choosing a colour is a walk in the direction you want. A test
   * spawning there is a test standing nowhere near a piece.
   */
  const at = (xp: XpDocument, team: string) => {
    const mark = xp.world.marks.find((one) => one.kind === 'spawn' && one.team === team)
    if (!mark) throw new Error(`no spawn for ${team}`)
    return { x: mark.x, y: mark.y, z: mark.z, facing: mark.facing }
  }

  const table = (xp: XpDocument, seat = 'blue') => {
    const world = spawnEntities(xp)
    // The seat is handed to `spawnPlayer` rather than written on afterwards,
    // because a respawn re-seeds the body's properties from its blueprint - see
    // `PlayerFacts`. It is what `by: 'team:blue'` reads.
    spawnPlayer(world, xp, at(xp, seat), { team: seat })
    return { world, blueprints: bodiesFor(xp), data: defaultsOf(xp.data ?? {}) }
  }

  const press = (xp: XpDocument, key: string, roll = 0, seat = 'blue') => {
    const { world, blueprints, data } = table(xp, seat)
    data.set('dice', roll)
    const effects = [...world.alive].flatMap((id) =>
      fire(world, blueprints, id, 'pressed', PLAYER_ID, { key, data, marks: xp.world.marks }),
    )
    return { world, blueprints, data, effects }
  }

  /** What this player has in hand, which is the whole of what a press changes. */
  const inHand = (world: ReturnType<typeof table>['world']) =>
    [...world.alive].filter((id) => world.parent.get(id)?.id === PLAYER_ID)

  const said = (effects: ReturnType<typeof press>['effects']) =>
    effects.flatMap((effect) => (effect.kind === 'emit' ? [effect.event] : []))

  test('a press near a piece picks it up', () => {
    // The spawn puts the ring on one of its own pieces, so the reach in the
    // document is being asked the same question the running level asks.
    expect(inHand(press(mensch(), 'use').world)).toHaveLength(1)
  })

  test('and letting go of it puts it down', () => {
    /**
     * A press and a release, which is what a hand does - and what replaced a
     * pair of `pressed` rules that could not be written.
     *
     * *Pick up when held is 0, put down when held is 1* is one rule that undoes
     * itself: `fire` walks a blueprint's triggers in order against a world each
     * of them is changing, so the press carried the piece and the very next
     * trigger in the same walk put it straight back down. A latch fixed that and
     * could not fix the other half - four pieces are four entities with four
     * copies of the same correct rule, so putting one down picked its neighbour
     * up. Two different *events* cannot collide at all.
     */
    const xp = mensch()
    const { world, blueprints, data } = press(xp, 'use')
    expect(inHand(world)).toHaveLength(1)

    for (const id of [...world.alive]) {
      fire(world, blueprints, id, 'released', PLAYER_ID, { key: 'use', data, marks: xp.world.marks })
    }
    expect(inHand(world)).toHaveLength(0)
  })

  test('and a release with nothing in hand is a key coming up, not a move', () => {
    const xp = mensch()
    const { world, blueprints, data } = table(xp)
    const effects = [...world.alive].flatMap((id) =>
      fire(world, blueprints, id, 'released', PLAYER_ID, { key: 'use', data, marks: xp.world.marks }),
    )
    expect(effects).toEqual([])
  })

  test('and holding it through several presses still holds one piece', () => {
    // The press is narrowed to the aimed entity by `pressOn`, and `carry` refuses
    // a hand that is already full - so leaning on the key does not collect the
    // yard.
    const xp = mensch()
    const { world, blueprints, data } = press(xp, 'use')
    for (const round of [0, 1]) {
      void round
      for (const id of [...world.alive]) {
        fire(world, blueprints, id, 'pressed', PLAYER_ID, { key: 'use', data, marks: xp.world.marks })
      }
    }
    expect(inHand(world)).toHaveLength(1)
  })

  test('a piece comes up with no roll at all, because the roll is advice', () => {
    /**
     * The rule that used to be here was the opposite one - a press did nothing
     * until the die had landed - and it went with `advance`. Nothing computes a
     * move now, so nothing can check one: you throw, you read the number, and
     * you move a piece by it or you do not, in front of people who can see you.
     */
    expect(inHand(press(mensch(), 'use', 0).world)).toHaveLength(1)
  })

  test('and anybody may pick up anybody else\'s piece, which is how a knockout happens', () => {
    /**
     * The `by: team:<colour>` gate went when the automatic knockout did. Landing
     * on somebody used to send their piece home by itself; now you carry it back
     * to their yard yourself, and you cannot do that through a gate that says
     * the piece is not yours.
     */
    const { world } = press(mensch(), 'use', 0, 'red')
    expect(inHand(world)).toHaveLength(1)
  })

  test('a turn ends because somebody says it does, and not because a piece moved', () => {
    /**
     * The thing only a person can know. A turn is now picking a piece up,
     * carrying it somewhere and putting it down - possibly twice, possibly
     * changing your mind halfway - so there is no move for the level to notice
     * and no moment it could call the end of a go.
     */
    const { effects } = press(mensch(), 'done', 4)
    expect(effects.some((effect) => effect.kind === 'pass')).toBe(true)
    expect(said(effects)).toContain('done')
  })

  test('and ending it clears the die, so the next player throws their own', () => {
    const { data } = press(mensch(), 'done', 4)
    expect(data.get('dice')).toBe(0)
  })

  test('a turn can be ended with nothing in hand, and with something in it', () => {
    // Both are real: a player with no move worth making still has to hand the
    // turn on, and a player who is still holding a piece when they say they are
    // done has left it where they left it.
    for (const key of [['use', 'done'], ['done']]) {
      const xp = mensch()
      const { world, blueprints, data } = table(xp)
      data.set('dice', 4)
      const effects = key.flatMap((one) =>
        [...world.alive].flatMap((id) =>
          fire(world, blueprints, id, 'pressed', PLAYER_ID, {
            key: one,
            data,
            marks: xp.world.marks,
          }),
        ),
      )
      expect(effects.some((effect) => effect.kind === 'pass')).toBe(true)
    }
  })

  test('the turn is a round the document describes, and its arrows are its own rules', () => {
    /**
     * The flow does not replace the trigger ordering that makes "a six, go
     * again" work - it says the thing the ordering never could: which key is
     * live. Asserted against the document rather than the runtime, because what
     * is worth pinning here is that the two halves agree: every event a step
     * waits for is an event a rule in this document actually emits.
     */
    const xp = mensch()
    const flow = xp.flow!
    /**
     * A run opens on the roll, because by then you are already sitting down.
     *
     * There was a `seats` phase, and walking to a corner to claim a colour is
     * what killed it: *"there is no way to know to press Q."* `assign: 'order'`
     * deals a chair when the room agrees on an order and the runtime carries
     * you to it - so the first thing you see is your own four pieces with your
     * own die beside them, and there is nothing to be told.
     */
    expect(flow.start).toBe('roll')
    /**
     * Four ends rather than one, because "the game is over" is not the sentence
     * anybody wants at the end of a game.
     *
     * The colour is known - it is the counter that reached four, and the arrow
     * that took the flow here asked about that exact field - so a single `over`
     * phase was throwing away the one fact the screen should be showing. There
     * is no way to put a name into a `says`, and four phases is the honest
     * price of saying who won: *"there no winner said when all 4"*.
     */
    expect(Object.keys(flow.phases)).toEqual([
      'roll',
      'move',
      'over-blue',
      'over-green',
      'over-red',
      'over-yellow',
    ])
    expect(flow.phases.roll.allow).toEqual(['roll'])
    expect(flow.phases.move.allow).toEqual(['use', 'done'])

    const emitted = new Set(
      Object.values(xp.blueprints).flatMap((blueprint) =>
        (blueprint.triggers ?? []).flatMap((trigger) =>
          trigger.do.flatMap((verb) => (verb.op === 'emit' ? [verb.event] : [])),
        ),
      ),
    )
    for (const phase of Object.values(flow.phases)) {
      for (const step of phase.next ?? []) {
        // The silent-forever failure this block is shaped to avoid: a phase
        // waiting on a word nothing says can never be left. A `when` step is
        // waiting on a *number* instead, and the data block is what declares
        // those - so each kind is checked against the thing that can supply it.
        if (step.on !== undefined) expect(emitted.has(step.on)).toBe(true)
        // A `when` is waiting on a *number*, and there are two places one can
        // live: the level's own data, or a property on the body. Both are
        // checked against the thing that can supply them - a `team:<colour>` is
        // written by the runtime when a seat lands, so what is checkable here is
        // that it names a side this document actually has.
        else if (step.when?.of === 'world') {
          expect(Object.keys(xp.data ?? {})).toContain(step.when.prop)
        } else {
          /**
           * A `when` with no `of` is about **this** player's own body, which is
           * the difference between a phase and a broadcast.
           *
           * Two things can supply one: a `team:<colour>` the runtime writes when
           * a seat lands, and a property the player's blueprint declares - which
           * a rule can then write with `setProp target: 'other'`, because the
           * presser *is* the body a phase is asked about.
           *
           * The second is what the roll arrow needs, and finding that out cost a
           * game: it read `of: 'world'` on `dice`, and the arbiter mirrors a roll
           * into **every** client's data so the table can see it. So the moment
           * anybody threw, everybody's flow left `roll` - *"when i on the desktop
           * roll and press f the enemy on mobile skip the roll phase"*. A shared
           * number cannot answer a question about one person.
           */
          const prop = step.when?.prop ?? ''
          const body = xp.player.blueprint ? xp.blueprints[xp.player.blueprint] : undefined
          if (prop.startsWith('team:')) {
            expect(teamsOf(xp.world.marks)).toContain(prop.slice('team:'.length))
          } else {
            expect({ prop, declared: Object.keys(body?.props ?? {}) }).toEqual({
              prop,
              declared: expect.arrayContaining([prop]),
            })
          }
        }
      }
    }
  })

  test('a fourth piece coming home ends the game rather than announcing it', () => {
    /**
     * The difference between a board you can play and a game you can win. It
     * used to fire a fanfare and a line of text at a table that carried on
     * playing; now the flow reaches a phase where nothing is live.
     *
     * Checked from *both* live phases, and that is not belt and braces: the
     * counter is written a frame after the move, when the flag notices the
     * piece, and by then the flow has already taken `moved` back to `roll`. On
     * `move` alone the check would be one frame too late, forever.
     */
    const flow = mensch().flow!
    for (const colour of ['blue', 'green', 'red', 'yellow']) {
      const over = flow.phases[`over-${colour}`]
      expect(over.allow).toEqual([])
      // No way out of it, which `flowProblems` allows and this is what one is for.
      expect(over.next ?? []).toEqual([])
      // And it says whose game it was, which one shared `over` could not.
      expect(over.says?.toLowerCase()).toContain(`${colour} wins`)
    }

    for (const name of ['roll', 'move']) {
      const wins = (flow.phases[name].next ?? []).filter((step) => step.go.startsWith('over-'))
      expect(wins).toHaveLength(4)
      // First, so a win ends the game rather than handing the turn on.
      expect(flow.phases[name].next?.[0].go).toBe('over-blue')
      for (const step of wins) expect(step.when?.value).toBe(4)
      // And each arrow lands on the colour it was asking about, or the board
      // congratulates the wrong player - which is the one mistake four phases
      // can make that one could not.
      for (const step of wins) {
        expect(step.go).toBe(`over-${(step.when?.prop ?? '').replace('-home', '')}`)
      }
    }
  })

  test('and not one of those arrows is a timer', () => {
    // docs/xp/xp-flow.md: a document whose transitions are all `when` and `on`
    // is sequenced by its own rules, so it needs no clock everybody agrees on -
    // and a table is the shape that never wanted one.
    for (const phase of Object.values(mensch().flow!.phases)) {
      for (const step of phase.next ?? []) expect(step.after).toBeUndefined()
    }
  })

  test('the hand is the only key you can let go of, which is what makes the die tap', () => {
    /**
     * *"The mobile button for roll seems not to work right."*
     *
     * The runtime's press buffer gives one key both gestures - tap to pick up
     * and tap again to place, or hold and carry - by withholding a quick tap's
     * release and owing it to the next tap. `use` is what that is for. `roll`
     * and `done` have only a press, so the debt was never collected and every
     * second tap of the die went nowhere. Invisible on a keyboard, where a key
     * held past the threshold releases honestly; unmissable on a phone, where a
     * tap is the only gesture there is.
     *
     * This is the document half of the fix: the buffer asks the level which
     * actions it can hear a release of, and for this one the answer is the hand
     * and nothing else.
     */
    expect(releasedKeys(mensch())).toEqual(new Set(['use']))
    // And all three are still bound, so this is a fact about the rules rather
    // than about a key having gone missing.
    expect((mensch().player.keys ?? []).map((one) => one.does)).toEqual(['use', 'roll', 'done'])
  })

  test('the key that picks a piece up does not also throw the die', () => {
    // Three keys, three things, and none of them is a mode: `use` is your hand,
    // `roll` is the die, `done` is your go.
    expect(press(mensch(), 'use', 0).effects.some((one) => one.kind === 'roll')).toBe(false)
  })

  test('somebody else throwing does not take you out of the roll phase', () => {
    /**
     * *"When I on the desktop roll and press F, the enemy on mobile skips the
     * roll phase."*
     *
     * The arrow out of `roll` read `of: 'world'` on `dice`, and `dice` is the
     * one number the whole table shares - the arbiter throws it and the poll
     * mirrors it into **every** client so everybody can see what was rolled.
     * Which is right for a readout and fatal for a phase: the moment anybody
     * threw, every board on every screen left `roll` for `move`. Whoever was
     * next then arrived at their own turn already past the only phase that lets
     * them pick up the die, and could do nothing but end it again.
     *
     * A phase is a question about **one player**, so the arrow is about one
     * player now: the die writes `threw` onto whoever pressed it, and a `when`
     * with no `of` reads the body of whoever is asking. Pressing F clears it.
     *
     * **Clearing the die on F does not fix it, and F already does.** `setProp
     * dice 0` is the first thing the done rule runs - but it writes into *this*
     * client's map, and nothing can clear the roll the arbiter recorded, so the
     * other boards keep their copy until the next throw overwrites it. And the
     * window is the wrong way round anyway: the other client left `roll` the
     * moment the throw was polled in, which is before F was pressed. Clearing
     * afterwards would bounce it between phases while somebody else plays.
     *
     * Both halves are asserted from the same world, because the bug was that
     * they were the same fact and should never have been.
     */
    const xp = mensch()
    const { world, blueprints, data } = table(xp)
    const marks = xp.world.marks
    const step = xp.flow!.phases.roll.next!.find((one) => one.go === 'move')!
    const own = () => world.props.get(PLAYER_ID)!

    // Somebody across the table threw a six, and the poll wrote it here.
    data.set('dice', 6)
    expect(holds(world, PLAYER_ID, step.when!, null, data)).toBe(false)
    expect(own().threw ?? 0).toBe(0)

    // Now this player throws their own.
    pressOn(world, blueprints, 'roll', PLAYER_ID, { data, marks, key: 'roll' }, marks)
    expect(own().threw).toBe(1)
    expect(holds(world, PLAYER_ID, step.when!, null, data)).toBe(true)

    // And ending the go puts them back where the next round starts.
    pressOn(world, blueprints, 'done', PLAYER_ID, { data, marks, key: 'done' }, marks)
    expect(own().threw).toBe(0)
    expect(holds(world, PLAYER_ID, step.when!, null, data)).toBe(false)
  })

  test('your die answers you from anywhere on the table', () => {
    /**
     * *"I stand near the dice, it still does not work with pressing roll."*
     *
     * It had `within: 3`, so a die was a thing you walked up to and threw. That
     * is a lovely idea for a level where you stand still and a disaster for this
     * one: a turn *is* carrying a piece across the board, so the reach was
     * satisfied exactly once - on the first roll, from the chair you spawned in
     * - and from the second round on the button did nothing, silently, because a
     * press narrowed by `aimOf` that finds nothing is a press that fires no rule
     * at all.
     *
     * `by: 'team:<colour>'` is the gate that was doing the real work anyway:
     * your die is yours because it is yours, not because you are standing next
     * to it. And a rule with no `within` is not aimed at anything, so nothing
     * lights up across the board either.
     */
    const anywhere: [string, number, number][] = [
      ['own chair', 0, 12.8],
      ['own entry field', 0, 11],
      ['the far side of the middle', 0, 0],
      ['standing in the home column', 0, 4.2],
      ['behind somebody else s yard', -13, -13],
    ]
    for (const [where, x, z] of anywhere) {
      const { world, blueprints, data } = table(mensch())
      world.position.set(PLAYER_ID, { x, y: 1, z })
      world.box.delete(PLAYER_ID)
      const effects = pressOn(
        world,
        blueprints,
        'roll',
        PLAYER_ID,
        { data, marks: mensch().world.marks },
        mensch().world.marks,
      )
      expect({ where, rolls: effects.filter((one) => one.kind === 'roll').length }).toEqual({
        where,
        rolls: 1,
      })
    }
  })

  test('and only your own, however many dice are on the table', () => {
    // Five dice are five entities and a press reaches all of them. `by` is what
    // makes exactly one answer - without it a roll would be four rolls, and the
    // last one to land would be the number everybody read.
    const { world, blueprints, data } = table(mensch(), 'green')
    const effects = pressOn(
      world,
      blueprints,
      'roll',
      PLAYER_ID,
      { data, marks: mensch().world.marks },
      mensch().world.marks,
    )
    expect(effects.filter((one) => one.kind === 'roll')).toHaveLength(1)
  })

  test('and one press of done hands the turn on once, not once per die', () => {
    /**
     * The other thing five dice cost, and this one was worse than noisy.
     *
     * Every die carried its own copy of *clear the roll, pass, say done*, and a
     * press with no `within` reaches all of them - so one tap of F was five
     * `pass` effects, five round trips, and a turn handed on five times. Alone
     * at a table that wraps back to you and looks fine; at a table of three it
     * skips two players every go.
     *
     * Ending a turn is not a thing about a physical object, so it lives on the
     * table's own die, once.
     */
    const { effects } = press(mensch(), 'done', 4)
    expect(effects.filter((one) => one.kind === 'pass')).toHaveLength(1)
    expect(said(effects).filter((one) => one === 'done')).toHaveLength(1)
  })

  /**
   * The endgame, driven through the collision pass rather than through a press.
   *
   * `advance` teleports, and a teleport is not an event a level can hang a rule
   * on - so "a piece is home" is a post standing on a home field and a `collide`
   * against it. That means `stepTriggers`, which is the same function the
   * runtime calls once a frame, and it is edge-triggered per pair: a piece that
   * has landed and stayed does not count itself twice.
   *
   * `fields` is which of the four home squares each piece is put on, because
   * *that* is what the whole bug was about - see the test below it.
   */
  const arrive = (xp: XpDocument, count: number, fields = [43, 43, 43, 43]) => {
    const { world, blueprints, data } = table(xp)
    const overlaps: Overlaps = new Map()
    const emitted: string[] = []
    const settled: number[] = []

    const land = (piece: number, field: number) => {
      const home = xp.world.marks.find((mark) => mark.name === `blue-${field}`)!
      world.props.get(piece)!.blue = field
      world.position.set(piece, { x: home.x, y: home.y, z: home.z })
      // The box is cached per entity and the runtime clears it on a move for
      // this exact reason - see `settle` in ../../../src/app/xp/_runtime.
      world.box.delete(piece)
      // No probers: the player's own box has nothing to do with a piece
      // arriving, and this is the entity-against-entity half of the pass.
      for (const effect of stepTriggers(world, blueprints, [], overlaps, undefined, { data })) {
        if (effect.kind === 'emit') emitted.push(effect.event)
      }
    }

    for (let n = 0; n < count; n++) {
      const piece = [...world.alive].find(
        (id) =>
          world.blueprint.get(id) === 'blue-piece' &&
          world.props.get(id)?.blue === -6 &&
          !settled.includes(id),
      )!
      settled.push(piece)
      land(piece, fields[n] ?? 43)
    }
    return { emitted, home: data.get('blue-home'), world, blueprints, data, overlaps, settled, land }
  }

  test('nothing solid stands where a player arrives', () => {
    /**
     * The bug that read as the level being frozen, and it was live for as long
     * as this document has existed.
     *
     * Every model defaults to `collider: 'auto'`, so the die had a metre-wide
     * box in the middle of the board - and the arrival is the middle of the
     * board. A body standing inside a box is one the controller pushes out of in
     * no particular direction, which comes out as *nothing happens*: keys down,
     * position unchanged, nothing in any console. Before the arrival moved it
     * was worse, because it was on a piece: the first thing every player has
     * ever done here was stand inside a meeple.
     *
     * Asserted for the seats as well as the document's own spawn, because those
     * are where everybody ends up the moment they sit down.
     */
    const xp = mensch()
    const world = spawnEntities(xp)
    const spots = [
      xp.spawn,
      ...xp.world.marks.filter((mark) => mark.kind === 'spawn'),
    ]
    for (const spot of spots) {
      const here = blockersOf(world).filter(
        (box) =>
          box.minX <= spot.x + PLAYER_RADIUS &&
          box.maxX >= spot.x - PLAYER_RADIUS &&
          box.minZ <= spot.z + PLAYER_RADIUS &&
          box.maxZ >= spot.z - PLAYER_RADIUS,
      )
      expect({ at: `${spot.x},${spot.z}`, here: here.length }).toEqual({
        at: `${spot.x},${spot.z}`,
        here: 0,
      })
    }
  })

  /**
   * And nothing solid stands anywhere on the board either, which is a different
   * question with the same symptom.
   *
   * The test above asks about *entities* - the die, a meeple - and passed
   * throughout, because the thing in the way was the **board**. Every square of
   * it is a flat piece a centimetre thick laid on the floor at `y: 0.98`, and
   * the rasteriser rounds to the nearest cell rather than flooring: 0.98 rounds
   * to 1, which is the cell you walk in, so every disc, arrow and yard frame was
   * a metre-tall invisible block. Reported as *"when you step out with the
   * player on every start there is something blocking to move"*, and the two
   * blue yard frames either side of the blue chair are why it was every start.
   *
   * The whole table is decals on `world.ground`, so the honest count is zero and
   * this can say so outright. `collider: 'none'` is what says it - the field
   * exists for exactly this, and a piece you walk through is read, understood
   * and filling nothing on purpose.
   */
  test('and the board is something you walk on rather than into', () => {
    expect(buildSolids(mensch().world).count).toBe(0)
  })

  /**
   * Every chair stares at the middle of the table.
   *
   * A `fixed` camera with no angles watches the player, and this one did:
   * seventeen cells up and four behind the chair, which is a **forty-five
   * degree** turn of the whole board for a three-cell sidestep and a half turn
   * for walking to your own die, which is past the lens. Reported as *"when you
   * go on the edge of the gamefield the controls rotate you"*. It framed the
   * game badly too, for a reason nothing about the swing explains: centring on
   * the player centres on somebody standing at the *edge* of the board, so half
   * the screen was the floor behind them.
   *
   * `camera.at` is both answers at once - one spot every seat looks at, which is
   * what a table is and what a single `yaw` cannot say, since blue's chair and
   * green's need different angles to name the same middle.
   *
   * The document's half is here; that a shot aimed this way cannot move is a
   * property of `fixedCamera` and is asserted where that lives.
   */
  test('every chair is a whole seat, and they all look at the middle of the table', () => {
    const xp = mensch()
    const camera = xp.camera!

    expect(camera.at).toEqual({ x: 0, y: 1, z: 0 })
    // Not a direction, and the parser refuses the pair - said here because the
    // reason `at` exists is that four chairs cannot share one yaw.
    expect(camera.yaw).toBeUndefined()

    for (const team of teamsOf(xp.world.marks)) {
      expect({ team, seat: camera.seats?.[team] !== undefined }).toEqual({ team, seat: true })
    }
  })

  test('the cursor is not a piece, so driving it over a flag counts nothing', () => {
    /**
     * The bug this is here for was found by playing.
     *
     * The flag counted a piece home on a `collide` **with no condition at all**,
     * so anything touching one scored - and the first thing anybody does is
     * drive the ring across the board, through all four of them. "blue came
     * home. blue came home."
     */
    const xp = mensch()
    const { world, blueprints, data } = table(xp)
    const flag = [...world.alive].find((id) => world.blueprint.get(id) === 'blue-home')!
    const spot = world.position.get(flag)!

    world.position.set(PLAYER_ID, { ...spot })
    world.box.delete(PLAYER_ID)

    const effects = stepTriggers(world, blueprints, [], new Map(), undefined, { data })
    expect(effects.filter((one) => one.kind === 'emit')).toEqual([])
    expect(data.get('blue-home')).toBe(0)
  })

  test('a piece landing on the last home field is counted, once', () => {
    const one = arrive(mensch(), 1)
    expect(one.home).toBe(1)
    expect(one.emitted).toContain('a blue piece is home')
  })

  test('and four of them is a win the table is told about', () => {
    const all = arrive(mensch(), 4)
    expect(all.home).toBe(4)
    expect(all.emitted).toContain('blue has all four home - blue wins')
  })

  test('three is not', () => {
    expect(arrive(mensch(), 3).emitted).not.toContain('blue has all four home - blue wins')
  })

  test('and the four of them stand on the four home fields, which is how it is played', () => {
    /**
     * The bug, and it was the whole endgame: *"i put one in the 4 and the
     * counter increment, but 2 doesnt and 3 not and 4 not."*
     *
     * There was one post, on the last home field, and the rule underneath it
     * was that all four pieces stack on that one square. Nobody plays it that
     * way - a home column has four squares and you fill them - so the first
     * piece counted, the other three sat on 40, 41 and 42 in front of a post
     * that could not see them, and the game had no end. It was invisible from
     * here because `arrive` put every piece on the same field, which is the one
     * arrangement that worked.
     *
     * Four posts now, one per home field, which is also what the board draws.
     */
    const all = arrive(mensch(), 4, [43, 42, 41, 40])
    expect(all.home).toBe(4)
    expect(all.emitted).toContain('blue has all four home - blue wins')
  })

  test('the thing that counts a piece home is the dot the board already draws', () => {
    /**
     * *"Is it also without the things on the blue dots, it looks weird."*
     *
     * The four posts were four flags on poles standing in each home column, and
     * a home column with four flagpoles in it does not read as a home column.
     * So the counter is the *dot* - same model, same size, same place as the
     * scenery it replaces - and what you see is the board the shot always drew.
     *
     * `collider: 'none'` for the same reason every other pickup in this engine
     * has it: it is a thing to notice, not a thing to bump into. A rule with no
     * box is asked against `triggerBox`, half a metre either way, which is what
     * makes the gap below the number that matters.
     */
    const xp = mensch()
    for (const colour of ['blue', 'green', 'red', 'yellow']) {
      const post = xp.blueprints[`${colour}-home`]
      expect(post.model).toBe(`shapes/disc_${colour}`)
      expect(post.collider).toBe('none')
      // And the scenery it stands in for is gone, or the two would z-fight.
      const drawn = xp.world.placements.filter(
        (one) => one.model === `shapes/disc_${colour}` && one.z !== undefined,
      )
      for (let n = 40; n <= 43; n++) {
        const mark = xp.world.marks.find((one) => one.name === `${colour}-${n}`)!
        expect(drawn.some((one) => one.x === mark.x && one.z === mark.z)).toBe(false)
      }
    }
  })

  test('and no other square is near enough to one to be counted from', () => {
    /**
     * The invariant the invisible version rests on, asserted because nothing
     * else can see it.
     *
     * A post with no collider is asked against `triggerBox` - half a metre
     * either way - and so is a piece that has settled onto a square. Two of
     * those overlap when their squares are less than a metre apart on both
     * axes, and the failure that would cause is the quiet kind: a piece parked
     * on the last field of the track counting itself home without moving.
     *
     * The board's own spacing is 1.6, so there is 0.6 of room. A board redrawn
     * tighter than that breaks the endgame, and this is where it says so.
     */
    const xp = mensch()
    const close: string[] = []
    for (const colour of ['blue', 'green', 'red', 'yellow']) {
      for (let n = 40; n <= 43; n++) {
        const home = xp.world.marks.find((one) => one.name === `${colour}-${n}`)!
        for (const mark of xp.world.marks) {
          if (mark.kind !== 'point' || !mark.name || mark.name === home.name) continue
          if (Math.abs(mark.x - home.x) < 1 && Math.abs(mark.z - home.z) < 1) {
            close.push(`${home.name} would count ${mark.name}`)
          }
        }
      }
    }
    expect(close).toEqual([])
  })

  test('a piece shuffled from one home field to the next is still one piece home', () => {
    /**
     * The cost of the fix above, paid for here. Four posts means four things
     * that can count the same piece, and moving a piece up its own column - a
     * perfectly ordinary tidy-up - would otherwise have won the game with one
     * meeple and three nudges.
     *
     * The latch is `blue-out`, a property on the piece meaning *still out on
     * the board*. The post that counts it clears it, and no post counts a piece
     * that is already home. It doubles as the colour test the condition needs:
     * a green piece has no `blue-out`, which reads as zero.
     */
    const one = arrive(mensch(), 1, [40])
    expect(one.home).toBe(1)
    for (const field of [41, 42, 43]) one.land(one.settled[0], field)
    // `data`, not `one.home`: that is the number as `arrive` left it, and the
    // point of this test is the number after three more landings.
    expect(one.data.get('blue-home')).toBe(1)
    expect(one.emitted).not.toContain('blue has all four home - blue wins')
  })

  test('and picking a piece back up off its home field gives the count back', () => {
    /**
     * The other half of the latch, and the reason it is a latch rather than a
     * one-way flag: a counter that only goes up is a counter you cannot correct.
     * Drop a piece on a home field by mistake and it would be home forever,
     * with the game one accident closer to ending itself.
     *
     * `held` is the event, which fires wherever the piece is lifted from -
     * including out of a peer's hands over the wire, since `stepHolding` reads
     * both.
     */
    const one = arrive(mensch(), 1, [43])
    expect(one.home).toBe(1)

    const piece = one.settled[0]
    one.world.parent.set(piece, { id: PLAYER_ID })
    for (const effect of stepTriggers(
      one.world,
      one.blueprints,
      [],
      one.overlaps,
      undefined,
      { data: one.data },
    )) {
      if (effect.kind === 'emit') one.emitted.push(effect.event)
    }
    expect(one.data.get('blue-home')).toBe(0)
    expect(one.emitted).toContain('a blue piece leaves home')
  })

  /**
   * The *ärgern*, which is now a thing a person does.
   *
   * It was a `collide` on the piece: two on one field and the one standing went
   * home by itself. That rule is gone, with the `by` gate that had to sit beside
   * it, because a knockout nobody performs is the one move on this board that
   * happened to a piece nobody touched - and a filmed game showed what that
   * costs. You pick their piece up and you walk it back to their yard.
   */
  test('a piece of a colour you are not sitting in still comes up in your hand', () => {
    const { world } = press(mensch(), 'use', 0, 'green')
    expect(inHand(world)).toHaveLength(1)
  })

  test('and two pieces sharing a field do nothing to each other', () => {
    const xp = mensch()
    const { world, blueprints, data } = table(xp)
    const field = xp.world.marks.find((mark) => mark.name === 'blue-7')!
    const blue = [...world.alive].find((id) => world.blueprint.get(id) === 'blue-piece')!
    const green = [...world.alive].find((id) => world.blueprint.get(id) === 'green-piece')!
    for (const id of [blue, green]) {
      world.position.set(id, { x: field.x, y: field.y, z: field.z })
      world.box.delete(id)
    }

    const effects = stepTriggers(world, blueprints, [], new Map(), undefined, {
      data,
      marks: xp.world.marks,
    })
    expect(effects.filter((one) => one.kind === 'teleport')).toEqual([])
    // And nobody was sent anywhere, which is the whole of the rule being gone.
    expect(world.props.get(green)?.green).toBe(-6)
  })

  test('a player on no side at all can move nothing', () => {
    // Right refusal, and the reason `assign` is `spread` here: the hash puts a
    // lone player on a colour on the first frame, so this is the editor's case
    // rather than a player's.
    const xp = mensch()
    const world = spawnEntities(xp)
    spawnPlayer(world, xp, { ...xp.spawn, facing: xp.spawn.facing })
    const data = defaultsOf(xp.data ?? {})
    data.set('dice', 6)
    const effects = [...world.alive].flatMap((id) =>
      fire(world, bodiesFor(xp), id, 'pressed', PLAYER_ID, {
        key: 'use',
        data,
        marks: xp.world.marks,
      }),
    )
    expect(effects.filter((one) => one.kind === 'teleport')).toHaveLength(0)
  })

  test('landing on your own leaves it alone, because the entry field is shared', () => {
    /**
     * A correction, and a filmed game is what corrected it.
     *
     * "Two on one field, the one standing goes back" was built for your own
     * colour too, and every blue piece *enters the board on `blue-0`* - so the
     * second one out knocked the first one home, the third knocked the second,
     * and four pieces spent four hundred turns shuttling between the yard and
     * one square with nothing ever getting home. Every rule behaved exactly as
     * written; the game could not be finished.
     *
     * Real mensch forbids the move instead, and *refusing* one is not something
     * a trigger can do - `advance` has already moved by the time anything could
     * object. So two of your own may share a field, which is the house rule that
     * lets a game end.
     */
    const xp = mensch()
    const { world, blueprints, data } = table(xp)
    const field = xp.world.marks.find((mark) => mark.name === 'blue-7')!

    const [standing, mover] = [...world.alive].filter(
      (id) => world.blueprint.get(id) === 'blue-piece',
    )
    for (const id of [standing, mover]) {
      // Both *on the board*, which is the case in question - a piece starts at
      // -6 in the yard, so asserting against that would prove nothing.
      world.props.get(id)!.blue = 7
      world.position.set(id, { x: field.x, y: field.y, z: field.z })
      world.box.delete(id)
    }

    const effects = stepTriggers(world, blueprints, [], new Map(), undefined, {
      data,
      marks: xp.world.marks,
    })
    expect(effects.filter((one) => one.kind === 'teleport')).toHaveLength(0)
    // Still on its field rather than back six squares before its entry.
    expect(world.props.get(standing)?.blue).toBe(7)
  })

  test('and a piece nobody landed on is left alone', () => {
    // The mark is what the rule reads, so a piece that simply shares a colour
    // with a mover somewhere else on the board must not react to it.
    const xp = mensch()
    const { world, blueprints, data } = table(xp)
    const [one, two] = [...world.alive].filter((id) => world.blueprint.get(id) === 'blue-piece')
    const field = xp.world.marks.find((mark) => mark.name === 'blue-7')!
    for (const id of [one, two]) {
      world.position.set(id, { x: field.x, y: field.y, z: field.z })
      world.box.delete(id)
    }
    const effects = stepTriggers(world, blueprints, [], new Map(), undefined, {
      data,
      marks: xp.world.marks,
    })
    expect(effects.filter((effect) => effect.kind === 'teleport')).toHaveLength(0)
  })

})

/**
 * The two levels the physics was built for, played headlessly.
 *
 * The point of these is not that the documents parse - the block at the top of
 * this file already asks that of every file in the directory - but that they
 * are *playable*: that a ball kicked at a goal reaches it, that the goal
 * notices, and that the toys in the playground behave differently from each
 * other in the way their blueprints claim. None of that can be seen in the
 * Browser pane, which never fires a frame, and all of it is a few hundred
 * `stepBodies` calls here.
 */
describe('a ball with weight in it', () => {
  const load = (file: string): XpDocument => {
    const parsed = parseXp(JSON.parse(readFileSync(path.join(XPS, file), 'utf8')))
    if (!parsed.ok) throw new Error(describeProblems(parsed.problems))
    return parsed.document
  }

  /** A world, its solids, and a way to run the bodies in it for a while. */
  const pitch = (file: string) => {
    const xp = load(file)
    const world = spawnEntities(xp)
    spawnPlayer(world, xp, { ...xp.spawn })
    const solids = buildSolids(xp.world)
    const run = (frames: number) => {
      for (let i = 0; i < frames; i += 1) {
        stepBodies({
          world,
          blueprints: xp.blueprints,
          delta: FRAME,
          isSolid: solids.isSolid,
          topOf: solids.topOf,
        })
      }
    }
    return { xp, world, solids, run }
  }

  describe('kickabout', () => {
    test('it claims football and has the goals that claim needs', () => {
      const xp = load('kickabout.xp.json')
      expect(xp.capabilities).toContain('football')
      // The check that would otherwise land at kickoff in front of everybody.
      // Per capability, which is the shape it is checked in - the football one
      // is the only claim on this level with a geometric requirement behind it.
      expect(capabilityProblems('football', xp.world)).toEqual([])
    })

    test('its own kick clip is square, and on the rig the body actually is', () => {
      /**
       * The worked example `docs/xp/pose-manual.md` points at, asserted rather
       * than described - because every way a hand-authored clip goes wrong is
       * silent. A track a sample short binds fine and plays a frame out against
       * every other bone; a clip authored on the dummy binds to twenty-three
       * names a fox does not have and the animal stands perfectly still. Neither
       * throws anywhere.
       */
      const xp = load('kickabout.xp.json')
      const clip = xp.clips?.['kick-swing']
      expect(clip).toBeDefined()
      if (!clip) return

      expect(clipIsSquare(clip)).toBe(true)
      // The rig the player's own blueprint is drawn on. A mismatch here is the
      // failure that looks like nothing happening at all.
      expect(clip.rig).toBe('peepz')
      expect(clip.duration).toBeCloseTo(clip.times[clip.times.length - 1]!, 6)
      // The root goes out and comes back, which is the whole gesture - and it
      // ends where it started, or a kick would walk the body up the pitch.
      const z = (i: number) => clip.root![i * 3 + 2]!
      expect(z(0)).toBe(0)
      expect(z(clip.times.length - 1)).toBe(0)
      expect(Math.max(...clip.times.map((_, i) => z(i)))).toBeCloseTo(0.3, 6)
      // And a bone moves with it: a root-only clip is refused by the parser, so
      // this is the line that keeps the example one the format accepts.
      expect(Object.keys(clip.bones).length).toBeGreaterThan(0)
    })

    test('the ball starts on the centre spot and settles onto the pitch', () => {
      const { world, run } = pitch('kickabout.xp.json')
      const ball = entityByName(world, 'ball')!
      run(180)
      const at = world.position.get(ball)!
      expect(Math.hypot(at.x, at.z)).toBeLessThan(0.5)
      // Landed, rather than still falling or through the floor.
      expect(at.y).toBeGreaterThan(0.5)
      expect(at.y).toBeLessThan(2)
      expect(world.velocity.has(ball)).toBe(false)
    })

    /**
     * The one that matters, and the one the level was laid out three times to
     * pass.
     *
     * A shot has to *reach* the net - the first attempt died twenty cells short
     * because the ball's friction was set for a park rather than a pitch - and
     * the net has to notice it, which the second attempt could not do because
     * the goal was drawn as a solid volume and the ball bounced back out of it.
     * Neither is visible in a document that parses.
     *
     * The crossing is what is asserted rather than the score, because the score
     * is the ball's own script counting once for three sensors, and running a
     * script means a QuickJS context. What the engine owes is that the ball
     * arrives and the sensor sees it.
     */
    test('a ball kicked at the goal reaches the net, and the net sees it', () => {
      const { xp, world, solids, run } = pitch('kickabout.xp.json')
      const ball = entityByName(world, 'ball')!
      run(180)

      // The shot the kick script sends: hard, down the middle, slightly lifted.
      push(world, xp.blueprints, ball, 0, 4, -26)

      const overlaps: Overlaps = new Map()
      const seen: string[] = []
      for (let i = 0; i < 400 && seen.length === 0; i += 1) {
        stepBodies({
          world,
          blueprints: xp.blueprints,
          delta: FRAME,
          isSolid: solids.isSolid,
          topOf: solids.topOf,
        })
        stepTriggers(world, xp.blueprints, [], overlaps, (id, event, by) => {
          if (event !== 'collide' || by === null) return
          const name = world.name.get(by)
          if (id === ball && name?.startsWith('blue-mouth')) seen.push(name)
        })
      }
      expect(seen.length).toBeGreaterThan(0)
    })

    test('a shot that misses comes back off the wall instead of leaving', () => {
      const { xp, world, run } = pitch('kickabout.xp.json')
      const ball = entityByName(world, 'ball')!
      run(120)
      push(world, xp.blueprints, ball, 40, 0, 0)
      run(400)
      const at = world.position.get(ball)!
      // Inside the touchline, wherever it ended up. A pitch you can lose the
      // ball off is a pitch where the game is mostly fetching.
      expect(at.x).toBeLessThan(16)
      expect(at.x).toBeGreaterThan(-16)
    })
  })

    /**
     * The match itself, as a state machine.
     *
     * There is no exported stepper - the flow is advanced inside the runtime's
     * frame loop - so the eight lines of it are mirrored here, in the order the
     * runtime uses them: the first step whose `on`, `after` or `when` holds is
     * the one taken. That is a copy, and it is the right kind: what is being
     * tested is the *document*, and a document whose phases are wired wrong is
     * wrong however it is stepped. `flowProblems` covers the wiring the parser
     * can see; this covers the sequence, which it cannot.
     */
    describe('the flow', () => {
      const flow = () => {
        const xp = load('kickabout.xp.json')
        if (!xp.flow) throw new Error('kickabout has no flow')
        return xp.flow
      }

      /** One frame: age the phase, take the first step that holds. */
      const step = (
        at: string,
        age: number,
        heard: readonly string[],
        data: Map<string, number>,
        world: EntityWorld,
      ): string => {
        const here = flow().phases[at]
        for (const one of here?.next ?? []) {
          const taken =
            (one.on !== undefined && heard.includes(one.on)) ||
            (one.after !== undefined && age >= one.after) ||
            (one.when !== undefined && holds(world, PLAYER_ID, one.when, null, data))
          if (taken) return one.go
        }
        return at
      }

      test('it holds together - no dead end, nothing unreachable', () => {
        expect(flowProblems(flow())).toEqual([])
      })

      test('you cannot kick at kick off, and you can once it is under way', () => {
        const xp = load('kickabout.xp.json')
        const bound = (xp.player?.keys ?? []).map((key) => key.does)
        expect(bound).toContain('kick')

        // The whole reason the phase exists: three seconds where the ball is on
        // the spot and nobody can hit it. Dash stays live, or a kickoff is a
        // loading screen rather than a race to the ball.
        expect(allowedIn(flow().phases.kickoff, bound)).not.toContain('kick')
        expect(allowedIn(flow().phases.kickoff, bound)).toContain('dash')
        // Absent `allow` is all of them, which is what `playing` wants.
        expect(allowedIn(flow().phases.playing, bound).sort()).toEqual(bound.slice().sort())
        expect(allowedIn(flow().phases.celebrate, bound)).not.toContain('kick')
      })

      test('kick off, goal, back to the middle, and round again', () => {
        const { world } = pitch('kickabout.xp.json')
        const data = new Map<string, number>([['blue', 0], ['red', 0]])

        expect(flow().start).toBe('kickoff')
        // Three seconds of it, and not two.
        expect(step('kickoff', 2.9, [], data, world)).toBe('kickoff')
        expect(step('kickoff', 3, [], data, world)).toBe('playing')

        // Nothing moves it on but the ball. A phase that timed out of `playing`
        // would be a match with a shot clock nobody asked for.
        expect(step('playing', 600, [], data, world)).toBe('playing')
        expect(step('playing', 0, ['goal'], data, world)).toBe('celebrate')

        expect(step('celebrate', 3.9, [], data, world)).toBe('celebrate')
        expect(step('celebrate', 4, [], data, world)).toBe('kickoff')
      })

      test('the third goal wins it rather than restarting the game', () => {
        const { world } = pitch('kickabout.xp.json')
        const data = new Map<string, number>([['blue', 3], ['red', 1]])

        // The ordering that matters, and the only reason the win steps are
        // written above the goal step: both hold on the frame the third goes
        // in, and taking the goal first would put the ball back on the centre
        // spot for a match that is already over.
        expect(step('playing', 0, ['goal'], data, world)).toBe('blue-win')

        data.set('blue', 1)
        data.set('red', 3)
        expect(step('playing', 0, ['goal'], data, world)).toBe('red-win')
      })

      test('a won match stays won - neither ending leads anywhere', () => {
        expect(flow().phases['blue-win']?.next ?? []).toEqual([])
        expect(flow().phases['red-win']?.next ?? []).toEqual([])
      })

      test('the goals it counts are the ones the document declares', () => {
        const xp = load('kickabout.xp.json')
        // The flow's conditions read `world.blue` and `world.red`, and a `when`
        // naming a field the `data` block never declared reads as zero forever -
        // which is a match that can never be won and nothing to say why.
        expect(Object.keys(xp.data ?? {}).sort()).toEqual(['blue', 'red'])
      })
    })

  describe('the playground', () => {
    test('everything loose falls onto something and stops', () => {
      const { world, run } = pitch('playground.xp.json')
      // Where they start, before anything has had a chance to move. Asserting
      // only that they end up above the floor would pass on a yard full of
      // things that never fell at all, which is exactly the failure mode this
      // level hit - see `no body starts inside the level`.
      const from = new Map<number, number>()
      for (const id of world.alive) {
        const name = world.name.get(id)
        if (name?.startsWith('loose-')) from.set(id, world.position.get(id)!.y)
      }
      expect(from.size).toBeGreaterThan(4)

      run(400)
      for (const [id, was] of from) {
        const at = world.position.get(id)!
        expect(at.y).toBeLessThan(was)
        expect(at.y).toBeGreaterThan(0)
        // Settled: the row is deleted when a body comes to rest.
        expect(world.velocity.has(id)).toBe(false)
      }
    })

    test('a floater does not fall, which is the whole of what it is', () => {
      const { world, run } = pitch('playground.xp.json')
      const floater = entityByName(world, 'floater-1')!
      const was = { ...world.position.get(floater)! }
      run(300)
      expect(world.position.get(floater)!.y).toBeCloseTo(was.y, 3)
    })

    test('the same kick moves a skittle a long way and the boulder barely at all', () => {
      const { xp, world, run } = pitch('playground.xp.json')
      run(200)

      const skittle = entityByName(world, 'skittle-3-0')!
      const boulder = entityByName(world, 'boulder')!
      const before = {
        skittle: { ...world.position.get(skittle)! },
        boulder: { ...world.position.get(boulder)! },
      }

      push(world, xp.blueprints, skittle, 12, 0, 0)
      push(world, xp.blueprints, boulder, 12, 0, 0)
      run(300)

      const moved = (id: number, from: { x: number; z: number }) => {
        const at = world.position.get(id)!
        return Math.hypot(at.x - from.x, at.z - from.z)
      }
      // Mass 0.35 against mass 30, which is the whole point of the pair being
      // ten feet apart in the level.
      expect(moved(skittle, before.skittle)).toBeGreaterThan(
        moved(boulder, before.boulder) * 10,
      )
    })

    test('a ball put through a hoop scores', () => {
      const { xp, world } = pitch('playground.xp.json')
      const hoop = entityByName(world, 'blue-hoop')!
      const ball = entityByName(world, 'loose-1')!
      const at = world.position.get(hoop)!

      // Placed rather than kicked: this is about the hoop noticing, and aiming
      // a shot through a 2.4-cell hole from across the yard is a different test
      // that would fail for reasons that are not about the hoop.
      world.position.set(ball, { ...at })
      const overlaps: Overlaps = new Map()
      const effects = stepTriggers(world, xp.blueprints, [], overlaps)
      expect(effects.some((effect) => effect.kind === 'score')).toBe(true)
    })
  })
})

/**
 * Nothing that is meant to fall is standing inside the floor.
 *
 * The silent failure `embedded` exists for, asked of everything we ship. A body
 * overlapping a solid cell cannot move at all - it is drawn where the author
 * put it, the document parses, every model is one we ship, and the ball simply
 * never falls. Both levels written for this feature hit it on the first run.
 *
 * The half-cell that causes it: a blueprint with `collider: "none"` has no box,
 * so the collision footprint is a half-metre cube around the entity's *middle*.
 * A thing placed at `y: 1.4` on a surface at 1.0 has its bottom at 0.9.
 */
test('no body starts inside the level', () => {
  for (const file of files) {
    const parsed = parseXp(JSON.parse(readFileSync(path.join(XPS, file), 'utf8')))
    if (!parsed.ok) continue
    const xp = parsed.document
    const world = spawnEntities(xp)
    const solids = buildSolids(xp.world)
    const input = {
      world,
      blueprints: xp.blueprints,
      delta: 1 / 60,
      isSolid: solids.isSolid,
      topOf: solids.topOf,
      ...(xp.world.ground ? { floorY: xp.world.floorY } : {}),
    }
    const stuck: string[] = []
    for (const id of world.alive) {
      if (embedded(input, id)) stuck.push(`${file}: ${world.name.get(id) ?? id}`)
    }
    expect(stuck).toEqual([])
  }
})

/**
 * Capture the flag, which is the level the whole melee exists for.
 *
 * "Instead of a baseball bat you can hit the other, then the flag drops, and you
 * can drop it anywhere" - four rules that touch every part of the chain: a key
 * that swings rather than a weapon that shoots, a hit that reaches the arbiter,
 * a `damaged` rule on the far side of it, and a flag that stays where it lands.
 *
 * None of it can be watched. The Browser pane fires no frames and the
 * interesting half needs two of them anyway, so this is the test that says
 * whether the level is a game.
 */
describe('capture the flag', () => {
  const ctf = (): XpDocument => {
    const parsed = parseXp(
      JSON.parse(readFileSync(path.join(XPS, 'capture-the-flag.xp.json'), 'utf8')),
    )
    if (!parsed.ok) throw new Error(describeProblems(parsed.problems))
    return parsed.document
  }

  /** A player of one side, standing wherever the caller says. */
  const standing = (xp: XpDocument, team: string, at: { x: number; y: number; z: number }) => {
    const world = spawnEntities(xp)
    spawnPlayer(world, xp, { ...at, facing: 90 }, { team })
    return { world, blueprints: bodiesFor(xp) }
  }

  /** Where a named entity is, which is the whole question a drop asks. */
  const positionOf = (world: EntityWorld, name: string) =>
    world.position.get(entityByName(world, name)!)!

  /** Standing at the blue flag as a red player, which is the raid. */
  const raider = (xp: XpDocument) => {
    const flag = xp.entities.find((one) => one.name === 'blue-flag')!
    return standing(xp, 'red', { x: flag.x - 1, y: flag.y, z: flag.z })
  }

  const press = (
    world: EntityWorld,
    blueprints: Record<string, ReturnType<typeof bodiesFor>[string]>,
    marks: XpDocument['world']['marks'],
  ) => pressOn(world, blueprints, 'attack', PLAYER_ID, { key: 'attack', marks }, marks)

  // Picking something up is its own key now, so a swing and a pickup no longer
  // fight over one press - see the two keys the document binds.
  const take = (
    world: EntityWorld,
    blueprints: Record<string, ReturnType<typeof bodiesFor>[string]>,
    marks: XpDocument['world']['marks'],
  ) => pressOn(world, blueprints, 'take', PLAYER_ID, { key: 'take', marks }, marks)

  /** And the third binding, which is how you get rid of what you are holding. */
  const put = (
    world: EntityWorld,
    blueprints: Record<string, ReturnType<typeof bodiesFor>[string]>,
    marks: XpDocument['world']['marks'],
  ) => pressOn(world, blueprints, 'drop', PLAYER_ID, { key: 'drop', marks }, marks)

  const inHand = (world: EntityWorld) =>
    [...world.alive].filter((id) => world.parent.get(id)?.id === PLAYER_ID)

  test('the level issues no weapon at all', () => {
    // The whole of "remove the weapon": clicking does nothing until you have
    // picked something up, and `spawnWeapon` has nothing to hang.
    const xp = ctf()
    expect(xp.player.weapon).toBeUndefined()
    const world = spawnEntities(xp)
    spawnPlayer(world, xp, { ...xp.spawn })
    expect(spawnWeapon(world, xp)).toBeNull()
  })

  test('three keys: one swings, one picks up, and one puts down', () => {
    const xp = ctf()
    /**
     * Swing and take are separate bindings on purpose: `pressOn` narrows a press
     * to a single nearest target, so a swing and a pickup sharing one key took
     * turns eating each other. `attack` only ever swings now.
     *
     * And **drop is a third key rather than the take key again**, which is the
     * one thing about this level that cannot be arranged any other way. A rule
     * fires against a world the rules before it have already changed: put both
     * on `take` and one press picks the flag up and puts it straight back down -
     * or drops it and takes it again, depending which rule the engine reaches
     * first. Refusing the second half needs a condition saying *and you are not
     * already carrying one*, and a trigger has one `when`, which the team test
     * is using. So: F takes, Q puts down.
     */
    expect((xp.player.keys ?? []).map((one) => one.does)).toEqual(['attack', 'take', 'drop'])

    const { world, blueprints } = standing(xp, 'red', { x: 0, y: 1, z: -8 })
    const effects = press(world, blueprints, xp.world.marks)
    expect(effects).toContainEqual({ kind: 'swung', id: PLAYER_ID, reach: 2.4 })
  })

  test('the swing key does not pick up the flag standing under it', () => {
    // The bug the second key exists to kill: a press meant to swing must not
    // walk off with a flag that happens to be in reach.
    const xp = ctf()
    const flag = xp.entities.find((one) => one.name === 'blue-flag')!
    const { world, blueprints } = standing(xp, 'red', { x: flag.x - 1, y: flag.y, z: flag.z })
    press(world, blueprints, xp.world.marks)
    expect(inHand(world)).toEqual([])
  })

  test('a gun off the floor is a gun, and shoots', () => {
    const xp = ctf()
    const gun = xp.entities.find((one) => one.name === 'gun-1')!
    const { world, blueprints } = standing(xp, 'red', { x: gun.x - 1, y: gun.y, z: gun.z })

    take(world, blueprints, xp.world.marks)
    const held = entityByName(world, 'gun-1')!
    expect(inHand(world)).toEqual([held])
    // The half that used to be missing: it hung off the hand and `shoot` never
    // looked there, so the thing was scenery you could carry.
    expect(armedWith(world, PLAYER_ID)).toBe(held)
    expect(world.props.get(held)?.damage).toBe(25)
  })

  test('taking the flag costs you the gun, and it lands where you stood', () => {
    const xp = ctf()
    const { world, blueprints } = raider(xp)
    const gun = entityByName(world, 'gun-1')!
    world.parent.set(gun, { id: PLAYER_ID, socket: 'hand' })

    take(world, blueprints, xp.world.marks)

    const flag = entityByName(world, 'blue-flag')!
    expect(inHand(world)).toEqual([flag])
    expect(world.props.get(PLAYER_ID)?.['flag:blue']).toBe(1)
    // One hand, one thing: the gun is on the ground at the raider's feet rather
    // than in a pocket, which is what makes taking the flag a decision.
    const dropped = world.position.get(gun)!
    const me = world.position.get(PLAYER_ID)!
    expect(Math.hypot(dropped.x - me.x, dropped.z - me.z)).toBeLessThan(1)
  })

  test('and nobody swings with a flag in their hands', () => {
    const xp = ctf()
    const { world, blueprints } = raider(xp)
    take(world, blueprints, xp.world.marks)
    expect(inHand(world).length).toBe(1)

    // Now the swing key, with the flag theirs: this is the swing that must not
    // happen. Asked of the effects rather than of a prop, because "you cannot
    // hit while carrying" is a rule about hands and lives in the verb.
    const again = press(world, blueprints, xp.world.marks)
    expect(again.some((effect) => effect.kind === 'swung')).toBe(false)
  })

  test('being hit drops it where you are standing, not at a post', () => {
    const xp = ctf()
    const { world, blueprints } = raider(xp)
    take(world, blueprints, xp.world.marks)
    const flag = entityByName(world, 'blue-flag')!

    // Walked away with it first, so "where they stood" is somewhere that is not
    // where they picked it up and is nowhere near either base.
    world.position.set(PLAYER_ID, { x: 4, y: 1, z: 6 })
    const effects = damage(world, blueprints, PLAYER_ID, 25, null, { now: 1 })

    expect(world.parent.has(flag)).toBe(false)
    expect(world.props.get(PLAYER_ID)?.['flag:blue']).toBe(0)
    const at = world.position.get(flag)!
    expect(Math.hypot(at.x - 4, at.z - 6)).toBeLessThan(1)
    // And three seconds of not moving, which is what makes a hit worth taking and
    // gives the field time to reach the flag on the ground.
    expect(effects).toContainEqual({ kind: 'stunned', id: PLAYER_ID, seconds: 3 })
  })

  test('there is no point mark left to snap a dropped thing back to', () => {
    /**
     * The other half of "you can drop it anywhere", and the one that is invisible
     * in the rules: the runtime settles anything let go of during a press onto
     * the nearest **point** mark, at any distance, because that is what a board
     * game's pieces want. The two posts this level teleported flags to were
     * exactly such marks, so a flag dropped mid-field would have gone home
     * without a single rule saying so.
     */
    expect(ctf().world.marks.filter((mark) => mark.kind === 'point')).toEqual([])
  })

  test('carrying it home is still the point', () => {
    const xp = ctf()
    const { world, blueprints } = raider(xp)
    take(world, blueprints, xp.world.marks)

    const base = entityByName(world, 'red-base')!
    const effects = fire(world, blueprints, base, 'enter', PLAYER_ID, { now: 1 })
    expect(effects).toContainEqual({ kind: 'score', amount: 1, by: PLAYER_ID })
    expect(world.props.get(PLAYER_ID)?.['flag:blue']).toBe(0)
    expect(inHand(world)).toEqual([])
  })

  /**
   * Reported from play: *you cannot put the flag down.*
   *
   * Being hit was the only way to let go of one, which makes a run a thing you
   * are committed to until somebody stops you - you cannot hand it off at a
   * chokepoint, cannot free your hands to shoot, and cannot give up. Its own
   * binding rather than the take key again, for the reason the key test above
   * gives at length.
   */
  test('the drop key puts down what you are carrying, where you are standing', () => {
    const xp = ctf()
    const { world, blueprints } = raider(xp)
    take(world, blueprints, xp.world.marks)
    const flag = entityByName(world, 'blue-flag')!
    expect(inHand(world)).toEqual([flag])

    world.position.set(PLAYER_ID, { x: -2, y: 1, z: 9 })
    put(world, blueprints, xp.world.marks)

    expect(world.parent.has(flag)).toBe(false)
    const at = world.position.get(flag)!
    expect(Math.hypot(at.x + 2, at.z - 9)).toBeLessThan(1)
    // And the mark goes with it, exactly as being hit clears it: a base reads the
    // property, so a carrier who put the flag down and still counted as carrying
    // it would score from an empty hand.
    expect(world.props.get(PLAYER_ID)?.['flag:blue']).toBe(0)
  })

  /**
   * Reported from the same match: *as red you cannot pick the red flag up.*
   *
   * The flags only ever answered to the other side, so a red flag left in the
   * middle of the field after a fight stayed there - the side it belongs to
   * could stand on top of it and press until the round ended. Which is the half
   * of capture the flag that keeps a stalemate from lasting: you get your own
   * flag back by fetching it.
   *
   * A different property, and that is the whole of why this is safe. `flag:red`
   * is what a *blue* runner carries and it is what the blue base pays for;
   * `home:red` is red bringing their own back, and no base scores for it.
   */
  test('your own side picks their flag up to bring it home', () => {
    const xp = ctf()
    const flag = xp.entities.find((one) => one.name === 'red-flag')!
    const { world, blueprints } = standing(xp, 'red', { x: flag.x + 1, y: flag.y, z: flag.z })

    take(world, blueprints, xp.world.marks)

    expect(inHand(world)).toEqual([entityByName(world, 'red-flag')!])
    expect(world.props.get(PLAYER_ID)?.['home:red']).toBe(1)
    // Not the scoring property. A red player who walked their own flag into the
    // blue base would otherwise hand blue's side a point for red's flag.
    expect(world.props.get(PLAYER_ID)?.['flag:red'] ?? 0).toBe(0)
  })

  test('and it is worth nothing at the other end of the field', () => {
    const xp = ctf()
    const flag = xp.entities.find((one) => one.name === 'red-flag')!
    const { world, blueprints } = standing(xp, 'red', { x: flag.x + 1, y: flag.y, z: flag.z })
    take(world, blueprints, xp.world.marks)

    const theirs = entityByName(world, 'blue-base')!
    const effects = fire(world, blueprints, theirs, 'enter', PLAYER_ID, { now: 1 })
    expect(effects.some((effect) => effect.kind === 'score')).toBe(false)
    expect(inHand(world).length).toBe(1)
  })

  test('and setting it down at your own base is a return rather than a point', () => {
    const xp = ctf()
    const flag = xp.entities.find((one) => one.name === 'red-flag')!
    const { world, blueprints } = standing(xp, 'red', { x: flag.x + 1, y: flag.y, z: flag.z })
    take(world, blueprints, xp.world.marks)

    const ours = entityByName(world, 'red-base')!
    const effects = fire(world, blueprints, ours, 'enter', PLAYER_ID, { now: 1 })
    expect(effects.some((effect) => effect.kind === 'score')).toBe(false)
    expect(inHand(world)).toEqual([])
    expect(world.props.get(PLAYER_ID)?.['home:red']).toBe(0)
  })

  /**
   * The hole the second pickup rule made reachable, closed in the rules.
   *
   * A pickup empties your hands first - one hand, one thing - and it used to
   * leave the *mark* of whatever it dropped. So a blue runner carrying the red
   * flag who pressed take beside their own flag walked away holding one flag and
   * counting as carrying two, and the base paid for the one lying in the field.
   *
   * Every pickup now clears all four carrying marks before setting its own,
   * which is the same sentence `unhand` makes about hands, said about props.
   */
  test('picking a flag up clears the mark of whatever it made you drop', () => {
    const xp = ctf()
    const { world, blueprints } = raider(xp)
    take(world, blueprints, xp.world.marks)
    expect(world.props.get(PLAYER_ID)?.['flag:blue']).toBe(1)

    // Now their own flag, which is at the other end. Standing on it with the
    // enemy's in hand is the press that used to leave both marks set.
    const ours = xp.entities.find((one) => one.name === 'red-flag')!
    world.position.set(PLAYER_ID, { x: ours.x + 1, y: ours.y, z: ours.z })
    take(world, blueprints, xp.world.marks)

    expect(inHand(world)).toEqual([entityByName(world, 'red-flag')!])
    expect(world.props.get(PLAYER_ID)?.['home:red']).toBe(1)
    expect(world.props.get(PLAYER_ID)?.['flag:blue']).toBe(0)

    // And the base says nothing, because they are carrying their own flag.
    const base = entityByName(world, 'red-base')!
    const effects = fire(world, blueprints, base, 'enter', PLAYER_ID, { now: 1 })
    expect(effects.some((effect) => effect.kind === 'score')).toBe(false)
  })

  test('a hit drops the flag you were bringing home too', () => {
    // The same clearing the two carrying properties get, and it has to be here
    // rather than assumed: a returner who was hit and still counted as carrying
    // would set their own base off by walking over it empty-handed.
    const xp = ctf()
    const flag = xp.entities.find((one) => one.name === 'red-flag')!
    const { world, blueprints } = standing(xp, 'red', { x: flag.x + 1, y: flag.y, z: flag.z })
    take(world, blueprints, xp.world.marks)

    damage(world, blueprints, PLAYER_ID, 25, null, { now: 1 })
    expect(inHand(world)).toEqual([])
    expect(world.props.get(PLAYER_ID)?.['home:red']).toBe(0)
  })

  test('and the flag is somewhere a person can walk to, wherever it lands', () => {
    // Both flags start out in the open: a level where the thing you have to
    // reach is inside its own arch is a level nobody can finish, and the
    // decoration around each base is one careless placement away from it.
    const xp = ctf()
    const solids = buildSolids(xp.world)
    for (const name of ['red-flag', 'blue-flag']) {
      const flag = xp.entities.find((one) => one.name === name)!
      expect(solids.isSolid(Math.floor(flag.x), Math.floor(flag.y), Math.floor(flag.z))).toBe(false)
    }
  })
})
