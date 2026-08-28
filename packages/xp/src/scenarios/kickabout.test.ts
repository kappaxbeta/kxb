/**
 * Kickabout, played headlessly, with its script actually running.
 *
 * `./xps.test.ts` asks the questions that are the same for every level and the
 * ones about this level's *document* - that the flow holds together, that the
 * ball reaches the net. This is the half that needs a QuickJS context: what the
 * kick does, which is where the game is.
 *
 * Here rather than in that file for `peepz.test.ts`'s reason, which is the same
 * reason: a change that makes a kick do nothing should fail with the word kick
 * in it.
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
  stepReturns,
  type EntityWorld,
} from '../world/entities'
import { parseXp, type XpDocument } from '../document/format'
import { loadScripts, type ScriptEngine, type Scripts } from '../rules/script'
import { defaultsOf } from '../document/data'
import { pressOn } from '../world/aim'
import { stepBodies, velocityOf } from '../world/bodies'
import { buildSolids, type Solids } from '../world/solids'
import { fire, stepEmitted, stepTriggers, type Overlaps, type Said } from '../rules/triggers'

const FILE = path.join(
  import.meta.dir,
  '..',
  '..',
  '..',
  '..',
  'public',
  'xp',
  'xps',
  'kickabout.xp.json',
)

function kickabout(): XpDocument {
  const parsed = parseXp(JSON.parse(readFileSync(FILE, 'utf8')))
  if (!parsed.ok) throw new Error(parsed.problems.map((p) => `${p.at}: ${p.message}`).join('\n'))
  return parsed.document
}

let engine: ScriptEngine

beforeAll(async () => {
  engine = await loadScripts(variant)
})

const FRAME = 1 / 60

function open(): {
  xp: XpDocument
  scripts: Scripts
  world: EntityWorld
  solids: Solids
  data: Map<string, number>
} {
  const xp = kickabout()
  const opened = engine.open(xp)
  if (!opened.ok) throw new Error(opened.problems.map((p) => `${p.at}: ${p.message}`).join('\n'))
  const world = spawnEntities(xp)
  spawnPlayer(world, xp, { ...xp.spawn })
  live.push(opened.scripts)
  return {
    xp,
    scripts: opened.scripts,
    world,
    solids: buildSolids(xp.world),
    data: defaultsOf(xp.data ?? {}),
  }
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

/** A frame of the level: its scripts, then its bodies, in the runtime's order. */
function run(
  it: ReturnType<typeof open>,
  frames: number,
) {
  for (let i = 0; i < frames; i += 1) {
    it.world.tick += 1
    it.world.seconds += FRAME
    it.scripts.step(it.world, it.xp.blueprints, FRAME, it.data)
    stepBodies({
      world: it.world,
      blueprints: it.xp.blueprints,
      delta: FRAME,
      isSolid: it.solids.isSolid,
      topOf: it.solids.topOf,
    })
  }
}

function clean(scripts: Scripts) {
  expect(scripts.failures.map((f) => `${f.hook}: ${f.message}`)).toEqual([])
}

/** Stand next to the ball, a step away on its +z side, looking whichever way. */
function standBy(it: ReturnType<typeof open>, facing: number) {
  const ball = entityByName(it.world, 'ball')!
  const at = it.world.position.get(ball)!
  movePlayer(it.world, { x: at.x, y: at.y - 1, z: at.z + 1.2 }, facing)
}

describe('the kick', () => {
  /**
   * The property the whole thing was rewritten for: a kick is a **pass**.
   *
   * It used to send the ball directly away from the player - the line from them
   * to it - so the shot depended on which side of the ball you happened to
   * arrive at. Standing a step to its left sent it right, and the only way to
   * aim was to walk around it, which is not a thing anybody can do at pace and
   * is not a thing anybody else can read.
   *
   * Facing is the frame everything else in the format uses: `+z` at zero.
   */
  test('goes where you are looking, not away from where you are standing', () => {
    const cases: { facing: number; x: number; z: number }[] = [
      { facing: 0, x: 0, z: 1 },
      { facing: 90, x: 1, z: 0 },
      { facing: 180, x: 0, z: -1 },
      { facing: 270, x: -1, z: 0 },
    ]

    for (const one of cases) {
      const it = open()
      const ball = entityByName(it.world, 'ball')!
      run(it, 30)
      standBy(it, one.facing)
      run(it, 2)

      const from = { ...it.world.position.get(ball)! }
      pressOn(it.world, it.xp.blueprints, 'kick', PLAYER_ID, { data: it.data }, it.xp.world.marks)
      run(it, 120)
      clean(it.scripts)

      const to = it.world.position.get(ball)!
      const moved = Math.hypot(to.x - from.x, to.z - from.z)
      expect(moved).toBeGreaterThan(3)
      // Along the way they were facing, whichever side of the ball they stood.
      expect((to.x - from.x) / moved).toBeCloseTo(one.x, 1)
      expect((to.z - from.z) / moved).toBeCloseTo(one.z, 1)
    }
  })

  /**
   * Flat, so it can be followed.
   *
   * A hop is the one part of a shot nobody can read: the ball leaves the
   * ground, its shadow separates from it, and where it comes down is a guess.
   * It is also the only kind of shot this level is not built for - the goals
   * are a mouth on the floor and the walls exist to bring a bad shot back.
   */
  test('rolls along the ground rather than hopping', () => {
    const it = open()
    const ball = entityByName(it.world, 'ball')!
    run(it, 60)
    const resting = it.world.position.get(ball)!.y

    standBy(it, 180)
    pressOn(it.world, it.xp.blueprints, 'kick', PLAYER_ID, { data: it.data }, it.xp.world.marks)

    let highest = resting
    for (let i = 0; i < 120; i += 1) {
      run(it, 1)
      highest = Math.max(highest, it.world.position.get(ball)!.y)
    }
    clean(it.scripts)
    expect(highest - resting).toBeLessThan(0.05)
  })

  test('a kick from further off does nothing - it is arm’s length', () => {
    const it = open()
    const ball = entityByName(it.world, 'ball')!
    run(it, 60)
    const at = it.world.position.get(ball)!
    movePlayer(it.world, { x: at.x, y: at.y - 1, z: at.z + 14 }, 180)

    pressOn(it.world, it.xp.blueprints, 'kick', PLAYER_ID, { data: it.data }, it.xp.world.marks)
    run(it, 30)
    clean(it.scripts)
    expect(it.world.velocity.has(ball)).toBe(false)
  })

  /**
   * Slow enough to watch, and that is a property of the *level* rather than of
   * the engine - so it is asserted against the pitch it is played on.
   *
   * A standing kick used to be ten cells a second, which put the ball in the
   * net from the centre spot in under a second and then the reset took it away.
   */
  test('a standing kick does not reach the goal from the centre spot', () => {
    const it = open()
    const ball = entityByName(it.world, 'ball')!
    run(it, 60)
    standBy(it, 180)
    pressOn(it.world, it.xp.blueprints, 'kick', PLAYER_ID, { data: it.data }, it.xp.world.marks)
    run(it, 600)
    clean(it.scripts)
    // The goal line is 21 cells away. Getting there is a run, not one press.
    expect(Math.abs(it.world.position.get(ball)!.z)).toBeLessThan(18)
  })

  test('and it is still moving a second later, rather than arriving instantly', () => {
    const it = open()
    const ball = entityByName(it.world, 'ball')!
    run(it, 60)
    standBy(it, 180)
    pressOn(it.world, it.xp.blueprints, 'kick', PLAYER_ID, { data: it.data }, it.xp.world.marks)

    run(it, 60)
    const after = Math.hypot(velocityOf(it.world, ball).x, velocityOf(it.world, ball).z)
    clean(it.scripts)
    // Rolling, and slower than it left at - a force that gets less with time.
    expect(after).toBeGreaterThan(1)
    expect(after).toBeLessThan(5)
  })
})

describe('putting the ball back', () => {
  test('the unstick event brings it to the centre spot', () => {
    const it = open()
    const ball = entityByName(it.world, 'ball')!
    run(it, 60)
    // Somewhere nobody can play it.
    it.world.position.set(ball, { x: 14, y: 1.5, z: -25 })

    const rules = it.xp.blueprints.ball!.triggers
    expect(rules.some((r) => r.on === 'emitted' && r.event === 'unstuck')).toBe(true)

    // The rule sets the flag; the script does the placing on the next tick.
    it.world.props.get(ball)!.reset = 1
    run(it, 2)
    // On the spot immediately, and dropped onto it rather than laid on it -
    // which is why it is still moving here and settles below.
    expect(Math.hypot(it.world.position.get(ball)!.x, it.world.position.get(ball)!.z)).toBeLessThan(0.5)

    run(it, 180)
    clean(it.scripts)
    const at = it.world.position.get(ball)!
    expect(Math.hypot(at.x, at.z)).toBeLessThan(0.5)
    expect(it.world.velocity.has(ball)).toBe(false)
  })

  /**
   * A whole match's worth of the loop, rather than the shape of one rule.
   *
   * The test below this one checks that the *document* says the right thing; it
   * passed all along, and the level still scored once and then stopped. What was
   * missing was anything that ran the loop the level actually plays: cross the
   * line, the ball goes away, it comes back, cross it again. Every piece of that
   * is a different subsystem - a script's `onTrigger`, an `emitted` rule, a
   * `deactivate` deadline, `stepReturns`, and the script's own reset - and each
   * one was fine on its own.
   *
   * `playFrame` is the runtime's order, from ../../../src/app/xp/_runtime/
   * simulation.tsx: returns first so a ball whose time is up is playable on the
   * frame it comes back, then the scripts, then the bodies, then the trigger
   * pass, then whatever anybody said.
   */
  function playFrame(it: ReturnType<typeof open>, overlaps: Overlaps) {
    it.world.tick += 1
    it.world.seconds += FRAME
    const clock = { now: it.world.seconds, marks: it.xp.world.marks, data: it.data }

    for (const back of stepReturns(it.world, it.world.seconds)) {
      fire(it.world, it.xp.blueprints, back, 'returned', null, clock)
    }

    const effects = [...it.scripts.step(it.world, it.xp.blueprints, FRAME, it.data)]
    stepBodies({
      world: it.world,
      blueprints: it.xp.blueprints,
      delta: FRAME,
      isSolid: it.solids.isSolid,
      topOf: it.solids.topOf,
    })

    const crossings: { id: number; event: 'collide'; by: number | null }[] = []
    effects.push(
      ...stepTriggers(
        it.world,
        it.xp.blueprints,
        [],
        overlaps,
        (id, event, by) => {
          if (event === 'collide') crossings.push({ id, event, by })
        },
        clock,
      ),
    )
    for (const crossing of crossings) {
      effects.push(
        ...it.scripts.trigger(
          it.world,
          it.xp.blueprints,
          crossing.id,
          crossing.event,
          crossing.by,
          it.data,
        ),
      )
    }

    const saying: Said[] = effects
      .filter((effect) => effect.kind === 'emit')
      .map((effect) => ({ event: effect.event, from: effect.from }))
    if (saying.length > 0) stepEmitted(it.world, it.xp.blueprints, saying, clock)
  }

  /** Put the ball in the blue net, moving, the way a shot arrives. */
  function shootIt(it: ReturnType<typeof open>, overlaps: Overlaps) {
    const ball = entityByName(it.world, 'ball')!
    it.world.position.set(ball, { x: 0, y: 1, z: -32 })
    it.world.velocity.set(ball, { x: 0, y: 0, z: -6 })
    for (let i = 0; i < 30; i += 1) playFrame(it, overlaps)
  }

  /**
   * The reported bug, end to end: *"the first goal scores and the ones after it
   * do not"*.
   *
   * Two goals rather than one, because one of anything is the case that already
   * worked. What it catches is every way the loop can jam after the first time
   * round - a latch that never releases, a ball that never comes back, a score
   * that is written to a store nobody handed over.
   */
  test('a second goal counts, the same as the first', () => {
    const it = open()
    const ball = entityByName(it.world, 'ball')!
    const overlaps: Overlaps = new Map()
    for (let i = 0; i < 30; i += 1) playFrame(it, overlaps)

    shootIt(it, overlaps)
    // Blue's net is `goal: 1`, and a goal is scored by the side that does not
    // defend the net it went into.
    expect(it.data.get('red')).toBe(1)
    expect(it.world.alive.has(ball)).toBe(false)

    // The `celebrate` phase is four seconds, and the ball is away for exactly
    // as long as nobody is allowed to play.
    for (let i = 0; i < 60 * 5; i += 1) playFrame(it, overlaps)
    expect(it.world.alive.has(ball)).toBe(true)
    // And back on the spot rather than still lying in the net, or the next kick
    // off starts with the ball behind the goal line.
    const at = it.world.position.get(ball)!
    expect(Math.hypot(at.x, at.z)).toBeLessThan(1)

    shootIt(it, overlaps)
    expect(it.data.get('red')).toBe(2)
    clean(it.scripts)
  })

  test('a goal takes the ball away rather than teleporting it', () => {
    // What a goal should look like: it crosses the line and that is the end of
    // it. `deactivate` with a deadline, because no entity can name another to
    // activate and a deactivated one cannot hear an emit to wake itself.
    const it = open()
    const goal = it.xp.blueprints.ball!.triggers.find(
      (r) => r.on === 'emitted' && r.event === 'goal',
    )
    expect(goal).toBeDefined()
    const off = goal!.do.find((verb) => verb.op === 'deactivate')
    expect(off).toBeDefined()
    // Exactly as long as nobody is allowed to play - the `celebrate` phase.
    const celebrate = it.xp.flow!.phases.celebrate!.next!.find((step) => step.after !== undefined)
    expect((off as { seconds?: number }).seconds).toBe(celebrate!.after)
  })
})
