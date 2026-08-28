/**
 * Peepz Park, played headlessly.
 *
 * `./xps.test.ts` walks every level we ship and asks the questions that are the
 * same for all of them - it parses, its models exist, you land on the floor,
 * the walls stop you. This asks the questions that are only about this one, and
 * they are the reason the level exists: a kick that carries the kicker's speed,
 * a dash, apples that heal, and a strength bar that turns the dash into
 * something that takes a critter down in one.
 *
 * Here rather than in that file for the reason the mensch tests are where they
 * are: those are properties of *a* level, and these are the design of this one.
 * A change that makes a kick do nothing should fail with the word kick in it.
 */
import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import variant from '@jitl/quickjs-wasmfile-release-sync'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  entityByName,
  movePlayer,
  PLAYER_ID,
  spawnEntities,
  spawnPlayer,
  type EntityWorld,
} from '../world/entities'
import { parseXp, type XpDocument } from '../document/format'
import { loadScripts, type ScriptEngine, type Scripts } from '../rules/script'
import { defaultsOf } from '../document/data'
import { fire } from '../rules/triggers'
import { pressOn } from '../world/aim'
import { stepBodies } from '../world/bodies'
import { buildSolids, type Solids } from '../world/solids'

const FILE = path.join(
  import.meta.dir,
  '..',
  '..',
  '..',
  '..',
  'public',
  'xp',
  'xps',
  'peepz.xp.json',
)

function peepz(): XpDocument {
  const parsed = parseXp(JSON.parse(readFileSync(FILE, 'utf8')))
  if (!parsed.ok) throw new Error(parsed.problems.map((p) => `${p.at}: ${p.message}`).join('\n'))
  return parsed.document
}

let engine: ScriptEngine

beforeAll(async () => {
  engine = await loadScripts(variant)
})

/** The level, its scripts, and a player standing at the spawn. */
function open(): {
  xp: XpDocument
  scripts: Scripts
  world: EntityWorld
  data: Map<string, number>
} {
  const xp = peepz()
  const opened = engine.open(xp)
  if (!opened.ok) throw new Error(opened.problems.map((p) => `${p.at}: ${p.message}`).join('\n'))
  const world = spawnEntities(xp)
  spawnPlayer(world, xp, { ...xp.spawn })
  live.push(opened.scripts)
  return { xp, scripts: opened.scripts, world, data: defaultsOf(xp.data ?? {}) }
}

/**
 * The interpreters `open` has handed out, closed between tests.
 *
 * A test steps the scripts it was given, so the helper cannot close one before
 * returning it - and every runtime left open is a runtime and a context still
 * held in the one wasm module this file shares across all of its tests.
 */
const live: Scripts[] = []
afterEach(() => {
  for (const scripts of live) scripts.close()
  live.length = 0
})

const FRAME = 1 / 60

/**
 * A frame of the level: its scripts, and then its bodies.
 *
 * The bodies half arrived with the ball: the kick script used to integrate its
 * own velocity and move the ball itself, and now it only *pushes* - `@kxb/xp/bodies`
 * does the moving, from the `body` on the blueprint. So a harness that runs the
 * scripts alone is one where the ball is kicked and never goes anywhere, which
 * is precisely what three tests in here started reporting.
 *
 * In this order, and it is the runtime's order too (see `simulation.tsx`): a
 * kick is an input to the frame, so the shove a script applies on this tick is
 * part of what the ball does on this tick rather than something it waits a
 * frame for.
 */
function run(
  scripts: Scripts,
  world: EntityWorld,
  xp: XpDocument,
  frames: number,
  data: Map<string, number>,
  solids: Solids = buildSolids(xp.world),
) {
  for (let i = 0; i < frames; i += 1) {
    world.tick += 1
    world.seconds += FRAME
    scripts.step(world, xp.blueprints, FRAME, data)
    stepBodies({
      world,
      blueprints: xp.blueprints,
      delta: FRAME,
      isSolid: solids.isSolid,
      topOf: solids.topOf,
      ...(xp.world.ground ? { floorY: xp.world.floorY } : {}),
    })
  }
}

/**
 * Stand a step short of a thing, on its +z side, looking whichever way.
 *
 * Read off where the thing actually is rather than written as coordinates: the
 * ball has been moved once already while this level was being built, and a test
 * that hard-codes the pitch is a test that fails for the wrong reason the next
 * time somebody drags it.
 *
 * The facing arrived with the kick: it is the direction a kick goes now, so a
 * helper that only placed somebody was a helper that could not say which way
 * they meant it. 180 by default, which is back towards a ball on the -z side.
 */
function standBy(world: EntityWorld, id: number, gap = 1.4, facing = 180) {
  const at = world.position.get(id)!
  movePlayer(world, { x: at.x, y: at.y - 1, z: at.z + gap }, facing)
}

/** Nothing threw. A script that died would make every assertion below a lie. */
function clean(scripts: Scripts) {
  expect(scripts.failures.map((f) => `${f.hook}: ${f.message}`)).toEqual([])
}

describe('the kick', () => {
  /**
   * A kick is a **pass**, which is the property the park's ball did not have.
   *
   * It used to go along the line from the kicker to the ball, so the shot
   * depended on which side you happened to run up on rather than on where you
   * meant it to go - stand a step to the left and it goes right, and the only
   * way to aim was to walk around it. The same test the pitch has, because the
   * two levels are meant to have the same ball and having quietly stopped is
   * the whole of what was reported.
   */
  test('goes where you are looking, not away from where you are standing', () => {
    const cases: { facing: number; x: number; z: number }[] = [
      { facing: 0, x: 0, z: 1 },
      { facing: 90, x: 1, z: 0 },
      { facing: 180, x: 0, z: -1 },
      { facing: 270, x: -1, z: 0 },
    ]

    for (const one of cases) {
      const { xp, scripts, world, data } = open()
      const ball = entityByName(world, 'ball')!
      // Let it settle onto the grass first: it spawns above the floor, and a
      // ball still falling is a ball whose travel is not only the kick.
      run(scripts, world, xp, 30, data)
      standBy(world, ball, 1.4, one.facing)
      const from = { ...world.position.get(ball)! }

      pressOn(world, xp.blueprints, 'kick', PLAYER_ID, { data }, xp.world.marks)
      expect(world.props.get(ball)!.kicked).toBe(1)
      run(scripts, world, xp, 120, data)
      clean(scripts)

      const to = world.position.get(ball)!
      const moved = Math.hypot(to.x - from.x, to.z - from.z)
      expect(moved).toBeGreaterThan(3)
      // Along the way they were facing, whichever side of the ball they stood.
      expect((to.x - from.x) / moved).toBeCloseTo(one.x, 1)
      expect((to.z - from.z) / moved).toBeCloseTo(one.z, 1)
    }
  })

  /**
   * And it stays in the park.
   *
   * The complaint in the words it arrived in: *"you kick them not teleport kick
   * them"*. The old numbers were nine and 1.7, a sprinted kick of over thirty
   * cells a second on a park whose goals are twenty from the middle - so the
   * ball left the picture and turned up against a wall, which is what a teleport
   * looks like from where you are standing. This is the ceiling that was
   * missing; the floor above it is `moved > 3` in the test before this one.
   */
  test('and it stays somewhere you can see it, rather than crossing the park', () => {
    const { xp, scripts, world, data } = open()
    const ball = entityByName(world, 'ball')!
    run(scripts, world, xp, 30, data)
    // Run in at a sprint, so this is the hardest kick the level has in it.
    const start = { ...world.position.get(ball)! }
    for (let i = 0; i < 12; i += 1) {
      movePlayer(world, { x: start.x, y: start.y - 1, z: start.z + 5 - 13 * FRAME * i }, 180)
      world.tick += 1
      world.seconds += FRAME
      scripts.step(world, xp.blueprints, FRAME, data)
    }
    standBy(world, ball)

    pressOn(world, xp.blueprints, 'kick', PLAYER_ID, { data }, xp.world.marks)
    run(scripts, world, xp, 300, data)
    clean(scripts)

    const to = world.position.get(ball)!
    const moved = Math.hypot(to.x - start.x, to.z - start.z)
    expect(moved).toBeGreaterThan(4)
    // The goal is twenty cells out, so a shot is worth two touches rather than
    // one swing from wherever you happen to be standing.
    expect(moved).toBeLessThan(20)
  })

  test('and it goes further the faster you were running', () => {
    const far = (pace: number) => {
      const { xp, scripts, world, data } = open()
      const ball = entityByName(world, 'ball')!

      /**
       * Walked in rather than teleported, because the script measures speed by
       * where the player *was* - which is the only reading of it a level has.
       * A test that placed them would be a test of a kick from a standstill
       * however fast it claimed to be going.
       */
      const start = { ...world.position.get(ball)! }
      for (let i = 0; i < 12; i += 1) {
        world.position.set(PLAYER_ID, {
          x: start.x,
          y: start.y - 1,
          z: start.z + 5 - pace * FRAME * i,
        })
        world.tick += 1
        world.seconds += FRAME
        scripts.step(world, xp.blueprints, FRAME, data)
      }
      standBy(world, ball)
      pressOn(world, xp.blueprints, 'kick', PLAYER_ID, { data }, xp.world.marks)
      run(scripts, world, xp, 60, data)
      clean(scripts)
      return start.z - world.position.get(ball)!.z
    }

    const strolled = far(1)
    const sprinted = far(13)
    expect(sprinted).toBeGreaterThan(strolled * 1.2)
  })

  test('but not from across the park - a kick is arm’s length', () => {
    const { xp, scripts, world, data } = open()
    const ball = entityByName(world, 'ball')!
    const before = { ...world.position.get(ball)! }

    standBy(world, ball, 14)
    pressOn(world, xp.blueprints, 'kick', PLAYER_ID, { data }, xp.world.marks)
    // The rule's own `within` refused it, so the script never even hears about
    // it - which is the half of the split that is a sentence about the game.
    expect(world.props.get(ball)!.kicked).toBe(0)

    run(scripts, world, xp, 30, data)
    clean(scripts)
    // Sideways only. The ball is a body now, so left alone it still *falls* -
    // it spawns above the grass and settles onto it - and asserting the whole
    // position would be asserting that gravity does not apply to a ball nobody
    // kicked.
    const now = world.position.get(ball)!
    expect(now.x).toBeCloseTo(before.x, 5)
    expect(now.z).toBeCloseTo(before.z, 5)
  })

  /**
   * Flat, so it can be followed.
   *
   * The park lofted its ball at a third of the kick's power, to clear a critter.
   * A hop is the one part of a shot nobody can read - the ball leaves the ground,
   * its shadow separates from it, and where it comes down is a guess - and it is
   * half of why a kick here read as the ball jumping somewhere rather than being
   * struck. A critter is something to dribble round.
   */
  test('rolls along the ground rather than hopping', () => {
    const { xp, scripts, world, data } = open()
    const ball = entityByName(world, 'ball')!
    run(scripts, world, xp, 60, data)
    const resting = world.position.get(ball)!.y

    standBy(world, ball)
    pressOn(world, xp.blueprints, 'kick', PLAYER_ID, { data }, xp.world.marks)

    let highest = resting
    for (let i = 0; i < 120; i += 1) {
      run(scripts, world, xp, 1, data)
      highest = Math.max(highest, world.position.get(ball)!.y)
    }
    clean(scripts)
    expect(highest - resting).toBeLessThan(0.05)
  })

  /**
   * And nothing about the ball's *look* changes when it is hit.
   *
   * It used to turn to rainbow glass while it was going somewhere, as a beacon
   * that read across the park. The swap is a discontinuity: the frame you kick,
   * the ball you were looking at becomes a glass one the grass shows straight
   * through. On the pitch next door every report of the kick "jumping" survived
   * every fix to the physics, because the last thing jumping was the look.
   */
  test('and looks like itself the whole way, rather than turning to glass', () => {
    const { xp, scripts, world, data } = open()
    const ball = entityByName(world, 'ball')!
    run(scripts, world, xp, 30, data)
    standBy(world, ball)

    pressOn(world, xp.blueprints, 'kick', PLAYER_ID, { data }, xp.world.marks)
    for (let i = 0; i < 120; i += 1) {
      run(scripts, world, xp, 1, data)
      expect(world.material.has(ball)).toBe(false)
    }
    clean(scripts)
  })
})

describe('the dash', () => {
  test('an ordinary one is a shove forward and nothing else', () => {
    const { xp, world, data } = open()
    const effects = pressOn(world, xp.blueprints, 'dash', PLAYER_ID, { data }, xp.world.marks)

    expect(effects).toEqual([{ kind: 'dashed', id: PLAYER_ID, cells: 5 }])
    // Not mega, so a critter it runs into is shoved rather than flattened.
    expect(world.props.get(PLAYER_ID)!.mega).toBe(0)
  })

  test('a full bar makes it a longer one, and says so', () => {
    const { xp, world, data } = open()
    data.set('strength', 4)

    const effects = pressOn(world, xp.blueprints, 'dash', PLAYER_ID, { data }, xp.world.marks)

    expect(effects).toContainEqual({ kind: 'dashed', id: PLAYER_ID, cells: 11 })
    expect(effects).toContainEqual({ kind: 'emit', event: 'mega dash', from: PLAYER_ID })
    expect(world.props.get(PLAYER_ID)!.mega).toBe(1)
  })

  test('and the two are never both, whichever way the bar reads', () => {
    for (const [strength, cells] of [
      [0, 5],
      [3, 5],
      [4, 11],
      [9, 11],
    ] as const) {
      const { xp, world, data } = open()
      data.set('strength', strength)
      const dashes = pressOn(world, xp.blueprints, 'dash', PLAYER_ID, { data }, xp.world.marks)
        .filter((effect) => effect.kind === 'dashed')
      expect(dashes).toEqual([{ kind: 'dashed', id: PLAYER_ID, cells }])
    }
  })
})

describe('the strength bar', () => {
  /** One touch of a dashing player, which is what the collide rules read. */
  function shove(
    xp: XpDocument,
    world: EntityWorld,
    critter: number,
    data: Map<string, number>,
  ) {
    return fire(world, xp.blueprints, critter, 'collide', PLAYER_ID, { data })
  }

  test('a critter takes three shoves, and going down fills a quarter of the bar', () => {
    const { xp, world, data } = open()
    const critter = entityByName(world, 'critter-1')!

    shove(xp, world, critter, data)
    expect(world.props.get(critter)!.hp).toBe(20)
    expect(world.alive.has(critter)).toBe(true)
    expect(data.get('strength')).toBe(0)

    shove(xp, world, critter, data)
    shove(xp, world, critter, data)

    expect(world.alive.has(critter)).toBe(false)
    expect(data.get('strength')).toBe(1)
  })

  /**
   * The bug this level was written with, pinned.
   *
   * Death used to be on `damaged`, which a rule's `damage` verb does not wake -
   * only a shot and a script's own `damage()` do. So a critter went to zero
   * health and stood there. It is on the same event as the hit now, after it.
   */
  test('and it goes down on the hit itself rather than waiting for a damaged nobody sends', () => {
    const { xp, world, data } = open()
    const critter = entityByName(world, 'critter-1')!
    const events = xp.blueprints.critter!.triggers.map((trigger) => trigger.on)
    expect(events).not.toContain('damaged')

    for (let i = 0; i < 3; i += 1) shove(xp, world, critter, data)
    expect(world.alive.has(critter)).toBe(false)
  })

  test('a mega dash takes one down in a single touch', () => {
    const { xp, world, data } = open()
    const critter = entityByName(world, 'critter-2')!
    world.props.set(PLAYER_ID, { ...world.props.get(PLAYER_ID)!, mega: 1 })

    shove(xp, world, critter, data)

    expect(world.alive.has(critter)).toBe(false)
    expect(data.get('strength')).toBe(1)
  })

  test('a full bar is spent by using it, and the glow goes with it', () => {
    const { xp, scripts, world, data } = open()
    data.set('strength', 4)

    pressOn(world, xp.blueprints, 'dash', PLAYER_ID, { data }, xp.world.marks)
    run(scripts, world, xp, 2, data)
    expect(world.material.get(PLAYER_ID)).toBe('rainbow')

    // Past the mega window: the bar empties and the body goes back to itself.
    run(scripts, world, xp, 60, data)
    clean(scripts)
    expect(data.get('strength')).toBe(0)
    expect(world.props.get(PLAYER_ID)!.mega).toBe(0)
    expect(world.material.has(PLAYER_ID)).toBe(false)
  })
})

describe('the orchard', () => {
  test('a tree drops apples, and stops before it fills the park', () => {
    const { xp, scripts, world, data } = open()
    const apples = () =>
      [...world.alive].filter((id) => world.blueprint.get(id) === 'apple').length

    expect(apples()).toBe(0)
    // Long enough for every tree to have fruited more times than its own cap.
    run(scripts, world, xp, 60 * 60, data)
    clean(scripts)

    const grown = apples()
    expect(grown).toBeGreaterThan(0)
    // Four trees, three each. The ceiling is the assertion; the exact count is
    // a matter of when the run stopped.
    expect(grown).toBeLessThanOrEqual(12)
  })

  test('an apple falls to the ground rather than hanging in the air', () => {
    const { xp, scripts, world, data } = open()
    run(scripts, world, xp, 60 * 8, data)
    const apple = [...world.alive].find((id) => world.blueprint.get(id) === 'apple')
    expect(apple).toBeDefined()

    run(scripts, world, xp, 120, data)
    clean(scripts)
    // On the lawn, whose top is one cell up - not still in the air over it.
    expect(world.position.get(apple!)!.y).toBeCloseTo(1.2, 1)
  })

  test('and eating one heals you and counts', () => {
    const { xp, scripts, world, data } = open()
    run(scripts, world, xp, 60 * 8, data)
    const apple = [...world.alive].find((id) => world.blueprint.get(id) === 'apple')!

    world.props.set(PLAYER_ID, { ...world.props.get(PLAYER_ID)!, hp: 50 })
    fire(world, xp.blueprints, apple, 'enter', PLAYER_ID, { data })

    expect(world.props.get(PLAYER_ID)!.hp).toBe(65)
    expect(data.get('eaten')).toBe(1)
    expect(world.alive.has(apple)).toBe(false)
  })
})
