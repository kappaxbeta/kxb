import { beforeAll, describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import variant from '@jitl/quickjs-wasmfile-release-sync'
import {
  blockersOf,
  entityByName,
  PLAYER_ID,
  spawnEntities,
  spawnPlayer,
  type EntityWorld,
} from '../world/entities'
import { EYE_HEIGHT, step } from '../world/physics'
import { buildSolids } from '../world/solids'
import type { Box } from '../document/blueprints'
import { parseXp, XP_FORMAT, type XpDocument } from '../document/format'
import { loadScripts, type ScriptEngine, type ScriptOptions, type Scripts } from './script'

/**
 * The sandbox, driven headlessly.
 *
 * The whole reason for choosing an interpreter compiled to wasm over a Web
 * Worker is visible in the first line of this file: `bun test` runs the same
 * interpreter a player's browser runs, so everything below is a statement about
 * the real thing rather than about a stand-in. A worker sandbox could only be
 * tested in a browser, which is the one place this project cannot watch anything
 * (docs/xp/manual.md §10).
 *
 * Loading the wasm is asynchronous and everything after it is not - which is the
 * shape the host has too: load once when the app starts, open a document
 * synchronously every time somebody presses play.
 */

let engine: ScriptEngine

beforeAll(async () => {
  engine = await loadScripts(variant)
})

/** A document, or a thrown list of everything wrong with it. */
function doc(overrides: Record<string, unknown>): XpDocument {
  const parsed = parseXp({
    format: XP_FORMAT,
    id: 'x',
    name: 'X',
    packs: [{ id: 'proto' }],
    world: { floorY: 0, placements: [] },
    ...overrides,
  })
  if (!parsed.ok) throw new Error(parsed.problems.map((p) => `${p.at}: ${p.message}`).join('\n'))
  return parsed.document
}

/** Open a document's scripts, or throw whatever stopped them compiling. */
function open(document: XpDocument, options?: ScriptOptions): { scripts: Scripts; world: EntityWorld } {
  const opened = engine.open(document, options)
  if (!opened.ok) throw new Error(opened.problems.map((p) => `${p.at}: ${p.message}`).join('\n'))
  return { scripts: opened.scripts, world: spawnEntities(document) }
}

/** Run n frames of dt, and give back everything the host would have to do. */
function run(scripts: Scripts, world: EntityWorld, document: XpDocument, frames: number, dt = 1 / 60) {
  const effects = []
  for (let i = 0; i < frames; i++) {
    world.tick += 1
    effects.push(...scripts.step(world, document.blueprints, dt))
  }
  return effects
}

describe('a script moves things', () => {
  const document = doc({
    scripts: {
      riser: `
        function onTick(dt) { self.y += dt }
      `,
    },
    blueprints: {
      platform: { model: 'proto/Primitive_Floor', script: 'riser' },
    },
    entities: [{ blueprint: 'platform', name: 'lift', x: 0, y: 1, z: 0 }],
  })

  test('a position it writes is the position the world has', () => {
    const { scripts, world } = open(document)
    run(scripts, world, document, 10, 0.1)
    expect(world.position.get(0)!.y).toBeCloseTo(2, 5)
    scripts.close()
  })

  /**
   * The box is cached, because until scripts existed nothing moved.
   *
   * This is the test that would have caught it: a lift you can stand on where it
   * used to be reads as a rendering problem, and the arithmetic in `entityBox`
   * is right the whole time.
   */
  test('the box it collides with moves too', () => {
    const { scripts, world } = open(document)
    const before = world.box.get(0)!.minY
    run(scripts, world, document, 10, 0.1)
    expect(world.box.get(0)!.minY).toBeCloseTo(before + 1, 5)
    scripts.close()
  })

  test('moveTo and moveBy put it where they say', () => {
    const jumper = doc({
      scripts: {
        hop: `
          function onSpawn() { self.moveTo(3, 2, -1) }
          function onTick() { self.moveBy(1, 0, 0) }
        `,
      },
      blueprints: { box: { model: 'proto/Box_A', script: 'hop' } },
      entities: [{ blueprint: 'box', x: 0, y: 0, z: 0 }],
    })
    const { scripts, world } = open(jumper)
    run(scripts, world, jumper, 2)
    expect(world.position.get(0)).toEqual({ x: 5, y: 2, z: -1 })
    scripts.close()
  })

  /**
   * The one asymmetry in the API, and the reason for it.
   *
   * A rider sits half a metre behind a kart's origin. Asking where the rider is
   * has one useful answer - where it is drawn - and a script that moves it can
   * only move it within the kart, because the rest of its position belongs to
   * the kart. See the note at the top of ./script-api.
   */
  test('a passenger reads world coordinates and writes its own', () => {
    const kart = doc({
      scripts: {
        rider: `
          function onSpawn() { self.set('readX', self.x); self.set('readZ', self.z) }
          function onTick() { self.x = 1 }
        `,
      },
      blueprints: {
        kart: { model: 'proto/Box_A', sockets: { seat: { x: 0, y: 1, z: -0.5 } } },
        rider: { model: 'proto/Box_A', collider: 'none', script: 'rider' },
      },
      entities: [
        { blueprint: 'kart', name: 'kart-1', x: 10, y: 0, z: 4 },
        { blueprint: 'rider', parent: 'kart-1', socket: 'seat', x: 0, y: 0, z: 0 },
      ],
    })
    const { scripts, world } = open(kart)
    run(scripts, world, kart, 1)
    // Read: the seat's place in the world, kart included.
    expect(world.props.get(1)!.readX).toBe(10)
    expect(world.props.get(1)!.readZ).toBe(3.5)
    // Written: its own offset within the kart, which is all it owns.
    expect(world.position.get(1)!.x).toBe(1)
    scripts.close()
  })

  /**
   * The half of the asymmetry `moveBy` used to get wrong.
   *
   * Written in the sandbox it was `moveTo(this.x + 1, ...)`, and `this.x` on a
   * passenger is where it is *drawn* - so a rider nudged one cell along used to
   * land at the kart's position plus one rather than one along its own seat.
   * The kart is at x 10 and the seat is at the origin within it, so the wrong
   * answer here is 11 and the right one is 1.
   */
  test('a passenger nudged by one moves one, rather than to where the kart is plus one', () => {
    const kart = doc({
      scripts: { shuffle: `function onSpawn() { self.moveBy(1, 0, 0) }` },
      blueprints: {
        kart: { model: 'proto/Box_A', sockets: { seat: { x: 0, y: 1, z: -0.5 } } },
        rider: { model: 'proto/Box_A', collider: 'none' as const, script: 'shuffle' },
      },
      entities: [
        { blueprint: 'kart', name: 'kart-1', x: 10, y: 0, z: 4 },
        { blueprint: 'rider', parent: 'kart-1', socket: 'seat', x: 0, y: 0, z: 0 },
      ],
    })
    const { scripts, world } = open(kart)
    run(scripts, world, kart, 1)
    expect(world.position.get(1)!.x).toBe(1)
    scripts.close()
  })

  test('a scale of zero is refused, because a thing with no size looks like a bug in us', () => {
    const shrink = doc({
      scripts: { shrink: `function onTick() { self.scale = 0 }` },
      blueprints: { box: { model: 'proto/Box_A', script: 'shrink' } },
      entities: [{ blueprint: 'box', x: 0, y: 0, z: 0 }],
    })
    const { scripts, world } = open(shrink)
    run(scripts, world, shrink, 2)
    expect(world.scale.get(0)).toBe(1)
    scripts.close()
  })
})

describe('each entity gets its own run of the script', () => {
  /**
   * The reason a script is compiled as a factory rather than evaluated as a
   * module. Two turrets sharing one `count` is a bug that only appears when
   * somebody places a second turret, which is a week after the first one worked.
   */
  test('two entities of one blueprint do not share a variable', () => {
    const document = doc({
      scripts: {
        counter: `
          let count = 0
          function onTick() { count += 1; self.set('count', count) }
        `,
      },
      blueprints: { post: { model: 'proto/Box_A', script: 'counter' } },
      entities: [
        { blueprint: 'post', x: 0, y: 0, z: 0 },
        { blueprint: 'post', x: 4, y: 0, z: 0 },
      ],
    })
    const { scripts, world } = open(document)
    run(scripts, world, document, 5)
    expect(world.props.get(0)!.count).toBe(5)
    expect(world.props.get(1)!.count).toBe(5)
    scripts.close()
  })
})

describe('getEntityByName', () => {
  const document = doc({
    scripts: {
      chaser: `
        function onTick() {
          const target = getEntityByName('goal')
          self.set('found', target ? 1 : 0)
          if (target) self.set('range', Math.round(self.distanceTo(target)))
        }
      `,
    },
    blueprints: {
      seeker: { model: 'proto/Box_A', script: 'chaser' },
      goal: { model: 'proto/Box_A' },
    },
    entities: [
      { blueprint: 'seeker', x: 0, y: 0, z: 0 },
      { blueprint: 'goal', name: 'goal', x: 3, y: 4, z: 0 },
    ],
  })

  test('a name resolves to the entity that has it', () => {
    const { scripts, world } = open(document)
    run(scripts, world, document, 1)
    expect(world.props.get(0)!.found).toBe(1)
    expect(world.props.get(0)!.range).toBe(5)
    scripts.close()
  })

  test('a name nobody has is null, not a throw', () => {
    const missing = doc({
      scripts: { look: `function onTick() { self.set('found', getEntityByName('nobody') ? 1 : 0) }` },
      blueprints: { seeker: { model: 'proto/Box_A', script: 'look' } },
      entities: [{ blueprint: 'seeker', x: 0, y: 0, z: 0 }],
    })
    const { scripts, world } = open(missing)
    run(scripts, world, missing, 1)
    expect(world.props.get(0)!.found).toBe(0)
    expect(scripts.failures).toHaveLength(0)
    scripts.close()
  })

  /**
   * A name whose entity has died stops resolving on the frame it dies.
   *
   * The alternative - a handle that still answers about a corpse - is how a
   * script ends up moving something nobody can see.
   */
  test('a dead entity stops answering to its name', () => {
    const { scripts, world } = open(document)
    run(scripts, world, document, 1)
    world.alive.delete(1)
    run(scripts, world, document, 1)
    expect(world.props.get(0)!.found).toBe(0)
    scripts.close()
  })
})

describe('a script can do what a verb can', () => {
  test('damage goes through the same path, so the damaged rules still fire', () => {
    const document = doc({
      scripts: {
        hitter: `
          function onTick() {
            const crate = getEntityByName('crate')
            if (crate) crate.damage(4)
          }
        `,
      },
      blueprints: {
        gun: { model: 'proto/Box_A', script: 'hitter' },
        crate: {
          model: 'proto/Box_A',
          props: { hp: 10 },
          triggers: [
            { on: 'damaged', when: { prop: 'hp', is: '<=', value: 0 }, do: [{ op: 'score', amount: 7 }, { op: 'despawn' }] },
          ],
        },
      },
      entities: [
        { blueprint: 'gun', x: 0, y: 0, z: 0 },
        { blueprint: 'crate', name: 'crate', x: 4, y: 0, z: 0 },
      ],
    })
    const { scripts, world } = open(document)
    const effects = run(scripts, world, document, 3)
    expect(world.props.get(1)!.hp).toBe(0)
    expect(world.alive.has(1)).toBe(false)
    expect(effects).toContainEqual({ kind: 'score', amount: 7, by: null })
    scripts.close()
  })

  test('spawn hands back something the script can go on to use', () => {
    const document = doc({
      scripts: {
        thrower: `
          function onSpawn() {
            const bit = self.spawn('debris', 0, 2, 0)
            self.set('made', bit ? 1 : 0)
            if (bit) bit.set('marked', 1)
          }
        `,
      },
      blueprints: {
        box: { model: 'proto/Box_A', script: 'thrower' },
        debris: { model: 'proto/target_pieces_A', collider: 'none' },
      },
      entities: [{ blueprint: 'box', x: 0, y: 0, z: 0 }],
    })
    const { scripts, world } = open(document)
    const effects = run(scripts, world, document, 1)
    expect(world.props.get(0)!.made).toBe(1)
    const spawned = effects.find((effect) => effect.kind === 'spawned')
    expect(spawned).toBeDefined()
    expect(world.props.get(spawned!.kind === 'spawned' ? spawned!.id : -1)!.marked).toBe(1)
    scripts.close()
  })

  test('score and emit leave as effects, because only the host knows what they mean', () => {
    const document = doc({
      scripts: { shout: `function onSpawn() { self.score(3); self.emit('ready') }` },
      blueprints: { bell: { model: 'proto/Box_A', script: 'shout' } },
      entities: [{ blueprint: 'bell', x: 0, y: 0, z: 0 }],
    })
    const { scripts, world } = open(document)
    const effects = run(scripts, world, document, 1)
    expect(effects).toContainEqual({ kind: 'score', amount: 3, by: 0 })
    expect(effects).toContainEqual({ kind: 'emit', event: 'ready', from: 0, script: true })
    scripts.close()
  })
})

describe('the hooks', () => {
  const document = doc({
    scripts: {
      diary: `
        function onSpawn() { self.add('spawns', 1) }
        function onTick() { self.add('ticks', 1) }
        function onTrigger(event, other) {
          self.add('triggers', 1)
          self.set('lastOther', other ? other.id : -1)
        }
      `,
    },
    blueprints: { thing: { model: 'proto/Box_A', script: 'diary' }, plain: { model: 'proto/Box_A' } },
    entities: [
      { blueprint: 'thing', x: 0, y: 0, z: 0 },
      { blueprint: 'plain', x: 4, y: 0, z: 0 },
    ],
  })

  test('onSpawn fires once, however many frames go by', () => {
    const { scripts, world } = open(document)
    run(scripts, world, document, 20)
    expect(world.props.get(0)!.spawns).toBe(1)
    expect(world.props.get(0)!.ticks).toBe(20)
    scripts.close()
  })

  test('onTrigger is handed whoever set it off', () => {
    const { scripts, world } = open(document)
    run(scripts, world, document, 1)
    scripts.trigger(world, document.blueprints, 0, 'enter', 1)
    expect(world.props.get(0)!.triggers).toBe(1)
    expect(world.props.get(0)!.lastOther).toBe(1)
    scripts.close()
  })

  /**
   * A script that spawns something scripted.
   *
   * There is no `spawn` hook anywhere in the engine to keep in step with this -
   * the sandbox asks "does this live entity have an instance yet", so every path
   * that can create an entity arrives at the same place.
   */
  test('something spawned at runtime gets its script too', () => {
    const document = doc({
      scripts: {
        parent: `let done = false
          function onTick() { if (!done) { done = true; self.spawn('child', 2, 0, 0) } }`,
        child: `function onSpawn() { self.set('awake', 1) }`,
      },
      blueprints: {
        parent: { model: 'proto/Box_A', script: 'parent' },
        child: { model: 'proto/Box_A', script: 'child' },
      },
      entities: [{ blueprint: 'parent', x: 0, y: 0, z: 0 }],
    })
    const { scripts, world } = open(document)
    run(scripts, world, document, 3)
    const child = [...world.alive].find((id) => world.blueprint.get(id) === 'child')
    expect(child).toBeDefined()
    expect(world.props.get(child!)!.awake).toBe(1)
    scripts.close()
  })

  /**
   * The ordering rule that has to be written down somewhere.
   *
   * A script cannot call into the interpreter from inside a function the
   * interpreter is calling, so what it sets off is queued and delivered when the
   * hook returns - on the same frame, after the cause.
   */
  test("one script's damage reaches the other's onTrigger, on the same frame", () => {
    const document = doc({
      scripts: {
        hitter: `let done = false
          function onTick() { if (!done) { done = true; getEntityByName('target').damage(1) } }`,
        hurt: `function onTrigger(event) { if (event === 'damaged') self.set('felt', 1) }`,
      },
      blueprints: {
        gun: { model: 'proto/Box_A', script: 'hitter' },
        target: { model: 'proto/Box_A', props: { hp: 10 }, script: 'hurt' },
      },
      entities: [
        { blueprint: 'gun', x: 0, y: 0, z: 0 },
        { blueprint: 'target', name: 'target', x: 4, y: 0, z: 0 },
      ],
    })
    const { scripts, world } = open(document)
    run(scripts, world, document, 1)
    expect(world.props.get(1)!.felt).toBe(1)
    scripts.close()
  })
})

describe('world.time and world.tick', () => {
  const document = doc({
    scripts: {
      clock: `function onTick() { self.set('t', world.time); self.set('n', world.tick) }`,
    },
    blueprints: { clock: { model: 'proto/Box_A', script: 'clock' } },
    entities: [{ blueprint: 'clock', x: 0, y: 0, z: 0 }],
  })

  test('time is the sum of the deltas it was given, not a clock it read', () => {
    const { scripts, world } = open(document)
    run(scripts, world, document, 4, 0.25)
    expect(world.props.get(0)!.t).toBeCloseTo(1, 6)
    expect(world.props.get(0)!.n).toBe(4)
    scripts.close()
  })

  /**
   * Which is what makes a timer testable at all: a five-minute round is three
   * hundred added to a variable, not five minutes of waiting.
   */
  test('a whole minute of game time costs no time at all', () => {
    const { scripts, world } = open(document)
    const started = performance.now()
    run(scripts, world, document, 60, 1)
    expect(world.props.get(0)!.t).toBeCloseTo(60, 6)
    expect(performance.now() - started).toBeLessThan(1000)
    scripts.close()
  })
})

describe('what a script cannot reach', () => {
  function reaches(expression: string): string {
    const document = doc({
      scripts: { probe: `function onSpawn() { self.set('x', (${expression}) ? 1 : 0) }` },
      blueprints: { probe: { model: 'proto/Box_A', script: 'probe' } },
      entities: [{ blueprint: 'probe', x: 0, y: 0, z: 0 }],
    })
    const { scripts, world } = open(document)
    run(scripts, world, document, 1)
    const answer = scripts.failures.length > 0 ? `threw: ${scripts.failures[0].message}` : String(world.props.get(0)!.x)
    scripts.close()
    return answer
  }

  /**
   * The list a Web Worker would have made us subtract from, and get wrong.
   *
   * A fresh QuickJS context has the language and nothing else - no host objects
   * to remove, so nothing to forget to remove.
   */
  test.each([
    'typeof fetch',
    'typeof XMLHttpRequest',
    'typeof setTimeout',
    'typeof setInterval',
    'typeof require',
    'typeof process',
    'typeof WebSocket',
    'typeof importScripts',
  ])('%s is undefined', (expression) => {
    expect(reaches(`${expression} !== 'undefined'`)).toBe('0')
  })

  test('there is no globalThis.window, and no way back to the host through one', () => {
    expect(reaches(`typeof globalThis.window !== 'undefined'`)).toBe('0')
  })

  test('the raw bridge the API is built on is gone by the time a script runs', () => {
    expect(reaches(`typeof globalThis.$b !== 'undefined'`)).toBe('0')
    expect(reaches(`typeof globalThis.$xp !== 'undefined'`)).toBe('0')
  })

  /**
   * Both of these are the obvious thing to reach for, which is exactly why they
   * are taken away rather than discouraged: two clients running the same rules
   * have to agree, and a script that used either would look correct on the
   * machine it was written on.
   */
  test('Date is gone', () => {
    expect(reaches(`typeof Date !== 'undefined'`)).toBe('0')
  })

  test('Math.random throws, and says why', () => {
    const answer = reaches('Math.random() > 0.5')
    expect(answer).toStartWith('threw:')
    expect(answer).toContain('two clients would disagree')
    // The message has to name the replacement, or an author reads "not
    // available" and goes and writes a linear congruential generator by hand.
    expect(answer).toContain('world.random()')
  })
})

/**
 * The seeded shared stream - `docs/xp/server-authority.md` §5's one genuinely
 * new requirement for board games, which is what unblocks dice.
 *
 * Every test here is really the same claim from a different angle: two clients
 * that were told the same seed roll the same numbers, and a client that was
 * told nothing about the past can still roll this tick's.
 */
describe('random that everybody agrees about', () => {
  const document = doc({
    scripts: {
      roller: `
        function onTick() { self.set('roll', world.roll(6)) }
      `,
    },
    blueprints: { die: { model: 'proto/Box_A', script: 'roller' } },
    entities: [{ blueprint: 'die', x: 0, y: 0, z: 0 }],
  })

  test('two clients on the same seed roll the same dice', () => {
    const first = open(document, { seed: 4242 })
    const second = open(document, { seed: 4242 })
    for (let frame = 0; frame < 40; frame++) {
      first.world.tick += 1
      second.world.tick += 1
      first.scripts.step(first.world, document.blueprints, 1 / 60)
      second.scripts.step(second.world, document.blueprints, 1 / 60)
      expect(first.world.props.get(0)?.roll).toBe(second.world.props.get(0)!.roll!)
    }
    first.scripts.close()
    second.scripts.close()
  })

  /**
   * The one that makes it a *game* rather than a fixture: change the room's
   * number and the match plays differently. Compared over a run of frames
   * rather than one, because one roll of a six-sided die matches by chance
   * often enough to make a flaky test.
   */
  test('a different seed rolls a different game', () => {
    const first = open(document, { seed: 1 })
    const second = open(document, { seed: 2 })
    const a: number[] = []
    const b: number[] = []
    for (let frame = 0; frame < 20; frame++) {
      first.world.tick += 1
      second.world.tick += 1
      first.scripts.step(first.world, document.blueprints, 1 / 60)
      second.scripts.step(second.world, document.blueprints, 1 / 60)
      a.push(first.world.props.get(0)!.roll!)
      b.push(second.world.props.get(0)!.roll!)
    }
    expect(a).not.toEqual(b)
    first.scripts.close()
    second.scripts.close()
  })

  /**
   * No seed means the document's id, so a screenshot, a bench run and a level
   * opened alone in the editor are all reproducible without anybody passing
   * anything.
   */
  test('with no seed at all it is still the same every time', () => {
    const first = open(document)
    const second = open(document)
    for (let frame = 0; frame < 10; frame++) {
      first.world.tick += 1
      second.world.tick += 1
      first.scripts.step(first.world, document.blueprints, 1 / 60)
      second.scripts.step(second.world, document.blueprints, 1 / 60)
    }
    expect(first.world.props.get(0)?.roll).toBe(second.world.props.get(0)!.roll!)
    first.scripts.close()
    second.scripts.close()
  })

  test('the seed is readable, so an author can build their own stream on it', () => {
    const seen = doc({
      scripts: { peek: `function onTick() { self.set('seed', world.seed) }` },
      blueprints: { die: { model: 'proto/Box_A', script: 'peek' } },
      entities: [{ blueprint: 'die', x: 0, y: 0, z: 0 }],
    })
    const { scripts, world } = open(seen, { seed: 1234 })
    world.tick += 1
    scripts.step(world, seen.blueprints, 1 / 60)
    expect(world.props.get(0)?.seed).toBe(1234)
    scripts.close()
  })

  test('a die lands on every face and never off one', () => {
    const { scripts, world } = open(document, { seed: 9 })
    const faces = new Set<number>()
    for (let frame = 0; frame < 300; frame++) {
      world.tick += 1
      scripts.step(world, document.blueprints, 1 / 60)
      const roll = world.props.get(0)!.roll!
      expect(Number.isInteger(roll)).toBe(true)
      expect(roll).toBeGreaterThanOrEqual(1)
      expect(roll).toBeLessThanOrEqual(6)
      faces.add(roll)
    }
    expect(faces.size).toBe(6)
    scripts.close()
  })

  /**
   * Two calls in one frame must not return the same number - the index has to
   * advance within a tick and only reset at the boundary. Written as a test
   * because the wrong version of this looks entirely correct until somebody
   * rolls two dice.
   */
  test('two dice in one frame are two dice', () => {
    const pair = doc({
      scripts: {
        two: `
          function onTick() {
            self.set('a', world.roll(1000))
            self.set('b', world.roll(1000))
          }
        `,
      },
      blueprints: { die: { model: 'proto/Box_A', script: 'two' } },
      entities: [{ blueprint: 'die', x: 0, y: 0, z: 0 }],
    })
    const { scripts, world } = open(pair, { seed: 5 })
    let differed = 0
    for (let frame = 0; frame < 30; frame++) {
      world.tick += 1
      scripts.step(world, pair.blueprints, 1 / 60)
      if (world.props.get(0)!.a !== world.props.get(0)!.b) differed++
    }
    expect(differed).toBeGreaterThan(25)
    scripts.close()
  })

  test('randomInt is inclusive at both ends, and pick picks from the list', () => {
    const both = doc({
      scripts: {
        picky: `
          function onTick() {
            self.set('n', world.randomInt(1, 2))
            self.set('p', world.pick([10, 20, 30]))
            self.set('empty', world.pick([]) === undefined ? 1 : 0)
          }
        `,
      },
      blueprints: { die: { model: 'proto/Box_A', script: 'picky' } },
      entities: [{ blueprint: 'die', x: 0, y: 0, z: 0 }],
    })
    const { scripts, world } = open(both, { seed: 3 })
    const ends = new Set<number>()
    const picked = new Set<number>()
    for (let frame = 0; frame < 200; frame++) {
      world.tick += 1
      scripts.step(world, both.blueprints, 1 / 60)
      ends.add(world.props.get(0)!.n!)
      picked.add(world.props.get(0)!.p!)
      expect(world.props.get(0)!.empty).toBe(1)
    }
    expect([...ends].sort()).toEqual([1, 2])
    expect([...picked].sort((x, y) => x - y)).toEqual([10, 20, 30])
    scripts.close()
  })
})

describe('a script that misbehaves', () => {
  /**
   * The reason for QuickJS over `new Function`, in one test.
   *
   * There is no way to stop a runaway function in the page's own interpreter -
   * the tab is gone and the only remedy is closing it. Here the interrupt
   * handler cuts it off after a fixed number of operations and the very next
   * entity's hook runs normally.
   */
  test('an endless loop is cut off, and the level carries on', () => {
    const document = doc({
      scripts: {
        stuck: `function onTick() { while (true) {} }`,
        fine: `function onTick() { self.add('ticks', 1) }`,
      },
      blueprints: {
        stuck: { model: 'proto/Box_A', script: 'stuck' },
        fine: { model: 'proto/Box_A', script: 'fine' },
      },
      entities: [
        { blueprint: 'stuck', x: 0, y: 0, z: 0 },
        { blueprint: 'fine', x: 4, y: 0, z: 0 },
      ],
    })
    const { scripts, world } = open(document)
    run(scripts, world, document, 3)

    expect(scripts.failures).toHaveLength(1)
    expect(scripts.failures[0].script).toBe('stuck')
    expect(scripts.failures[0].message).toContain('interrupted')
    // The good one ran on every frame, including the one where its neighbour
    // was cut off.
    expect(world.props.get(1)!.ticks).toBe(3)
    scripts.close()
  })

  /**
   * One throw and that instance stops.
   *
   * The alternative is sixty identical failures a second, and the one that
   * mattered at the top of a list of three thousand.
   */
  test('a throw stops that entity and nothing else', () => {
    const document = doc({
      scripts: {
        bad: `function onTick() { null.x }`,
        good: `function onTick() { self.add('ticks', 1) }`,
      },
      blueprints: {
        bad: { model: 'proto/Box_A', script: 'bad' },
        good: { model: 'proto/Box_A', script: 'good' },
      },
      entities: [
        { blueprint: 'bad', x: 0, y: 0, z: 0 },
        { blueprint: 'bad', x: 2, y: 0, z: 0 },
        { blueprint: 'good', x: 4, y: 0, z: 0 },
      ],
    })
    const { scripts, world } = open(document)
    run(scripts, world, document, 10)

    // One per broken entity, not one per frame.
    expect(scripts.failures).toHaveLength(2)
    expect(scripts.failures.map((failure) => failure.entity).sort()).toEqual([0, 1])
    expect(world.props.get(2)!.ticks).toBe(10)
    scripts.close()
  })

  /**
   * The line number in a stack has the wrapper's line taken back out.
   *
   * A script is compiled as the body of a factory so each entity gets its own
   * closure, which shifts every line by one. Left alone it is the sort of thing
   * somebody spends twenty minutes on before noticing it is always off by one.
   */
  test('a stack points at the line the author wrote', () => {
    const document = doc({
      // `boom()` is on line 3 of the source as written below: line 1 is empty,
      // line 2 is the function, line 3 is the body.
      scripts: { boom: '\nfunction onTick() {\n  throw new Error("here")\n}\n' },
      blueprints: { boom: { model: 'proto/Box_A', script: 'boom' } },
      entities: [{ blueprint: 'boom', x: 0, y: 0, z: 0 }],
    })
    const { scripts, world } = open(document)
    run(scripts, world, document, 1)
    expect(scripts.failures[0].message).toBe('here')
    expect(scripts.failures[0].stack).toContain('boom.js:3')
    scripts.close()
  })

  test('a script that allocates without end is refused, not fatal', () => {
    const document = doc({
      scripts: { greedy: `function onSpawn() { const a = []; for (;;) a.push(new Array(10000).fill(1)) }` },
      blueprints: { greedy: { model: 'proto/Box_A', script: 'greedy' } },
      entities: [{ blueprint: 'greedy', x: 0, y: 0, z: 0 }],
    })
    const { scripts, world } = open(document)
    run(scripts, world, document, 1)
    expect(scripts.failures).toHaveLength(1)
    // Either limit is a correct answer - it runs out of operations or it runs
    // out of memory, depending on which comes first, and both are survivable.
    expect(scripts.failures[0].message).toMatch(/interrupted|memory/i)
    scripts.close()
  })

  test('a script that throws on its top line never gets an instance', () => {
    const document = doc({
      scripts: { broken: `throw new Error('nope')\nfunction onTick() {}` },
      blueprints: { broken: { model: 'proto/Box_A', script: 'broken' } },
      entities: [{ blueprint: 'broken', x: 0, y: 0, z: 0 }],
    })
    const { scripts, world } = open(document)
    run(scripts, world, document, 5)
    expect(scripts.failures).toHaveLength(1)
    expect(scripts.failures[0].hook).toBe('top level')
    scripts.close()
  })
})

describe('opening a document', () => {
  test('a script that does not compile is refused by name, with a line', () => {
    const document = doc({
      scripts: { wonky: 'function onTick() { this is not javascript }' },
      blueprints: { thing: { model: 'proto/Box_A', script: 'wonky' } },
      entities: [{ blueprint: 'thing', x: 0, y: 0, z: 0 }],
    })
    const opened = engine.open(document)
    expect(opened.ok).toBe(false)
    if (opened.ok) return
    expect(opened.problems[0].at).toBe('scripts.wonky')
    expect(opened.problems[0].message).toStartWith('SyntaxError:')
    // Line 1, because that is where the author put it - the factory wrapper's
    // line has been taken back out.
    expect(opened.problems[0].message).toContain('wonky.js:1:')
  })

  /**
   * Most levels have no scripts, and a context is half a millisecond and four
   * megabytes of address space. It also means the host mounts one thing and
   * calls `step` unconditionally, rather than a `scripts?.step` that will one
   * day be written the other way round.
   */
  test('a document with no scripts opens, costs nothing, and steps', () => {
    const document = doc({
      blueprints: { thing: { model: 'proto/Box_A' } },
      entities: [{ blueprint: 'thing', x: 0, y: 0, z: 0 }],
    })
    const { scripts, world } = open(document)
    expect(run(scripts, world, document, 5)).toEqual([])
    expect(scripts.failures).toEqual([])
    scripts.close()
  })
})

describe('the parser', () => {
  test('a blueprint naming a script nobody wrote is refused', () => {
    const parsed = parseXp({
      format: XP_FORMAT,
      id: 'x',
      name: 'X',
      packs: [{ id: 'proto' }],
      world: { floorY: 0, placements: [] },
      blueprints: { thing: { model: 'proto/Box_A', script: 'ghost' } },
    })
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.problems).toContainEqual({
      at: 'blueprints.thing.script',
      message: 'no script called "ghost"',
    })
  })

  test('an enormous script is refused with its address', () => {
    const parsed = parseXp({
      format: XP_FORMAT,
      id: 'x',
      name: 'X',
      packs: [{ id: 'proto' }],
      world: { floorY: 0, placements: [] },
      scripts: { huge: 'x'.repeat(70_000) },
      blueprints: { thing: { model: 'proto/Box_A', script: 'huge' } },
    })
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.problems[0].at).toBe('scripts.huge')
  })

  test('a script survives being written out and read back', () => {
    const source = `function onTick(dt) { self.y += dt /* keeps "quotes" and \\n */ }`
    const document = doc({
      scripts: { lift: source },
      blueprints: { thing: { model: 'proto/Box_A', script: 'lift' } },
      entities: [{ blueprint: 'thing', x: 0, y: 0, z: 0 }],
    })
    const again = parseXp(JSON.parse(JSON.stringify(document)))
    expect(again.ok).toBe(true)
    if (!again.ok) return
    expect(again.document.scripts?.lift).toBe(source)
  })
})

/**
 * Every script we ship, actually run.
 *
 * The acceptance test for scripting, and the counterpart to `xps.test.ts`: that
 * one walks every shipped document to prove you can move around it, and this one
 * runs every shipped document's code to prove the level does what its blurb
 * says. A demo that quietly stopped working would otherwise be found by opening
 * it, in a browser, where the canvas cannot be watched at all.
 */
describe('the documents we ship', () => {
  const XPS = path.join(import.meta.dir, '..', '..', '..', '..', 'public', 'xp', 'xps')
  const files = readdirSync(XPS).filter((file) => file.endsWith('.xp.json'))

  test.each(files)('%s: its scripts compile and survive five seconds', (file) => {
    const parsed = parseXp(JSON.parse(readFileSync(path.join(XPS, file), 'utf8')))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const opened = engine.open(parsed.document)
    if (!opened.ok) {
      throw new Error(opened.problems.map((p) => `${p.at}: ${p.message}`).join('\n'))
    }
    const world = spawnEntities(parsed.document)
    for (let i = 0; i < 300; i++) {
      world.tick += 1
      opened.scripts.step(world, parsed.document.blueprints, 1 / 60)
    }
    // Named rather than counted, so a failure says which script and why instead
    // of "expected 0 to be 1".
    expect(opened.scripts.failures.map((f) => `${f.script}.${f.hook}: ${f.message}`)).toEqual([])
    opened.scripts.close()
  })

  /**
   * The demo's own claim, checked.
   *
   * `moving-parts` says a block patrols the gap in the wall and that you have to
   * time the run through it. Both halves are testable and both have already been
   * wrong once: an earlier version of this level claimed the block was a lift
   * that carried you up to a ledge, and it does not - the character controller
   * has no notion of a rider, so a box moving under somebody moves *through*
   * them. The claim was changed rather than the engine, and this is what stops
   * it drifting back.
   */
  /**
   * The claim this level makes, driven end to end.
   *
   * The first version of this document said a lift carried you to a ledge, and
   * it did not: a box moving under somebody moved through them. The blurb was
   * changed rather than the engine, and then the engine was changed, and this is
   * what says which of those is true today. It runs the script, the collision
   * and the controller together - a script moves the lift, the lift's box moves
   * with it, and the player standing on it goes up.
   */
  test('moving-parts: the lift carries a player to the ledge', () => {
    const parsed = parseXp(JSON.parse(readFileSync(path.join(XPS, 'moving-parts.xp.json'), 'utf8')))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const document = parsed.document
    const opened = engine.open(document)
    expect(opened.ok).toBe(true)
    if (!opened.ok) return

    const world = spawnEntities(document)
    const solids = buildSolids(document.world)
    const lift = entityByName(world, 'lift')!

    // Standing on the lift at its lowest: the box is 1 tall centred on the
    // entity, so its top is half a unit above where the entity is.
    const start = world.position.get(lift)!
    let position = { x: start.x, y: start.y + 0.5 + EYE_HEIGHT, z: start.z }
    let velocityY = 0
    let grounded = true
    let jumps = 0
    let highest = position.y

    const seen = new Map<number, Box>()
    for (let i = 0; i < 60 * 6; i++) {
      world.tick += 1
      opened.scripts.step(world, document.blueprints, 1 / 60)
      const result = step({
        position,
        velocityY,
        moveX: 0,
        moveZ: 0,
        jump: false,
        grounded,
        jumps,
        delta: 1 / 60,
        isSolid: solids.isSolid,
        blockers: blockersOf(world, seen),
        floorY: -50,
      })
      position = result.position
      velocityY = result.velocityY
      grounded = result.grounded
      jumps = result.jumps
      highest = Math.max(highest, position.y)
    }

    /**
     * Carried from 1 up to the ledge at 6.
     *
     * The lift tops out at 5 and its box is one deep centred on it, so the
     * surface a rider stands on reaches 5.5 - and the ledge beside it is at 6,
     * which is inside the step-up. So the rider goes up on the lift and walks
     * off onto the ledge without jumping, which is the whole claim.
     *
     * The upper bound is what stops this passing for the wrong reason: carried
     * is not launched, and an implementation that added the platform's delta to
     * the *velocity* rather than to the position would sail past here.
     */
    expect(highest - EYE_HEIGHT).toBeGreaterThanOrEqual(5.5)
    expect(highest - EYE_HEIGHT).toBeLessThan(6.5)
    expect(opened.scripts.failures).toEqual([])
    opened.scripts.close()
  })

  test('moving-parts: the block patrols, its box goes with it, and the plinth watches', () => {
    const parsed = parseXp(JSON.parse(readFileSync(path.join(XPS, 'moving-parts.xp.json'), 'utf8')))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const document = parsed.document
    const opened = engine.open(document)
    expect(opened.ok).toBe(true)
    if (!opened.ok) return

    const world = spawnEntities(document)
    const block = entityByName(world, 'block')!
    const plinth = entityByName(world, 'plinth')!
    expect(block).not.toBeNull()

    let least = Infinity
    let most = -Infinity
    const ranges = new Set<number>()

    for (let i = 0; i < 600; i++) {
      world.tick += 1
      opened.scripts.step(world, document.blueprints, 1 / 60)
      const x = world.position.get(block)!.x
      least = Math.min(least, x)
      most = Math.max(most, x)

      // The box the player walks into, not the position the script wrote. These
      // are two different numbers and only one of them stops anybody.
      const box = world.box.get(block)!
      expect(box.minX).toBeLessThan(x)
      expect(box.maxX).toBeGreaterThan(x)

      ranges.add(world.props.get(plinth)!.range)
    }

    // It swept the gap in the wall rather than sitting still or leaving the room.
    expect(least).toBeLessThan(-3)
    expect(most).toBeGreaterThan(3)

    /**
     * The plinth read a distance that changed, and read the right one.
     *
     * The count is deliberately loose - the plinth is eight metres from a sweep
     * under seven metres wide, so a range rounded to one decimal has only about
     * eight values it can take, and an earlier version of this test asserted
     * more than ten and failed on arithmetic rather than on behaviour.
     *
     * What is worth pinning is the last line: the number the script wrote is the
     * distance to where the block actually is. It could only have got that by
     * looking the block up by name, because nothing in this level touches
     * anything and no trigger ever fires.
     */
    expect(ranges.size).toBeGreaterThan(3)

    const seen = world.position.get(plinth)!
    const target = world.position.get(block)!
    const truth = Math.hypot(seen.x - target.x, seen.z - target.z)
    expect(world.props.get(plinth)!.range).toBeCloseTo(Math.round(truth * 10) / 10, 5)

    opened.scripts.close()
  })

  /**
   * The shooter's mines, which are the only thing in any level that comes for
   * the person playing.
   *
   * A script cannot fire - there is no ray in the sandbox - so the whole of
   * "something is shooting back" is a thing that closes the distance and takes
   * health off when it arrives. Both halves are asserted here because both have
   * a quiet failure: a mine that never finds `player` simply circles, which
   * reads as a level with pretty scenery in it, and one that stings without a
   * reload takes a hundred health off in under two seconds.
   */
  test('shooter: a mine comes for you and goes off in your face', () => {
    const parsed = parseXp(JSON.parse(readFileSync(path.join(XPS, 'shooter.xp.json'), 'utf8')))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const document = parsed.document
    const opened = engine.open(document)
    expect(opened.ok).toBe(true)
    if (!opened.ok) return

    const world = spawnEntities(document)
    const mine = entityByName(world, 'mine-1')!
    const at = world.position.get(mine)!
    // Standing four cells from it, which is inside the reach it hunts from and
    // outside the reach it goes off at.
    spawnPlayer(world, document, { x: at.x, y: 1, z: at.z + 4, facing: 0 })

    const away = () => {
      const now = world.position.get(mine)!
      const person = world.position.get(PLAYER_ID)!
      return Math.hypot(now.x - person.x, now.z - person.z)
    }
    expect(away()).toBeCloseTo(4, 1)

    let closest = away()
    for (let i = 0; i < 60 * 8; i++) {
      world.tick += 1
      opened.scripts.step(world, document.blueprints, 1 / 60)
      closest = Math.min(closest, away())
    }

    // It arrived, and what it cost is one hit rather than a grinder: the reload
    // is seven seconds, so eight of them is two stings at the very most.
    expect(closest).toBeLessThan(2)
    const hp = world.props.get(PLAYER_ID)!.hp
    expect(hp).toBeLessThan(100)
    expect(hp).toBeGreaterThanOrEqual(100 - 18 * 2)
    expect(opened.scripts.failures).toEqual([])
    opened.scripts.close()
  })

  /**
   * The runners, and the lane they are deliberately not placed in.
   *
   * There is a test next door that fires from the spawn straight down the
   * middle of the arena at `target-2`, so neither runner may be *standing* on
   * that line - and the whole point of a runner is that it crosses it. The two
   * facts are only compatible because where it is comes from the clock and a
   * property rather than from where the document put it, which is exactly the
   * thing that would break silently if somebody moved the sweep back on to the
   * start position.
   */
  test('shooter: the runners sweep across the lane they are parked off', () => {
    const parsed = parseXp(JSON.parse(readFileSync(path.join(XPS, 'shooter.xp.json'), 'utf8')))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const document = parsed.document
    const opened = engine.open(document)
    expect(opened.ok).toBe(true)
    if (!opened.ok) return

    const world = spawnEntities(document)
    const runner = entityByName(world, 'runner-1')!
    expect(Math.abs(world.position.get(runner)!.x)).toBeGreaterThan(6)

    let least = Infinity
    let most = -Infinity
    for (let i = 0; i < 60 * 20; i++) {
      world.tick += 1
      opened.scripts.step(world, document.blueprints, 1 / 60)
      const x = world.position.get(runner)!.x
      least = Math.min(least, x)
      most = Math.max(most, x)
    }

    // Over the middle and back, and no further than the gallery it is in.
    expect(least).toBeLessThan(-6)
    expect(most).toBeGreaterThan(6)
    expect(least).toBeGreaterThan(-12)
    expect(most).toBeLessThan(12)
    expect(opened.scripts.failures).toEqual([])
    opened.scripts.close()
  })
})

/**
 * Two clients, one level, the same answer.
 *
 * The single property the whole design of this file is arranged around - it is
 * why `Date` and `Math.random` are gone and why the fuel is counted in
 * operations rather than in milliseconds. Two separate sandboxes over the same
 * document and the same deltas must end up with identical worlds.
 */
describe('determinism', () => {
  test('the same document and the same frames give the same world twice', () => {
    const document = doc({
      scripts: {
        wander: `
          let phase = 0
          function onTick(dt) {
            phase += dt
            self.x = Math.sin(phase) * 4
            self.z = Math.cos(phase) * 4
            self.set('phase', phase)
          }
        `,
      },
      blueprints: { walker: { model: 'proto/Box_A', script: 'wander' } },
      entities: [
        { blueprint: 'walker', x: 0, y: 0, z: 0 },
        { blueprint: 'walker', x: 1, y: 0, z: 0 },
      ],
    })

    const first = open(document)
    const second = open(document)
    const deltas = [0.016, 0.021, 0.009, 0.033, 0.016]
    for (const dt of deltas) {
      first.world.tick += 1
      second.world.tick += 1
      first.scripts.step(first.world, document.blueprints, dt)
      second.scripts.step(second.world, document.blueprints, dt)
    }

    for (const id of [0, 1]) {
      expect(first.world.position.get(id)).toEqual(second.world.position.get(id)!)
      expect(first.world.props.get(id)).toEqual(second.world.props.get(id)!)
    }
    first.scripts.close()
    second.scripts.close()
  })
})

describe("the level's own script", () => {
  /**
   * The hub a level's rules had nowhere to live in — docs/xp/backlog.md §7c.
   * Attached to the document rather than to a blueprint, so it runs whether or
   * not anything in particular is on screen, and it has no `self`.
   */
  const HUB = () =>
    doc({
      scripts: {
        hub: `
          let ticks = 0
          function onSpawn() { log('the level is open') }
          function onTick(dt) { ticks += 1; if (ticks === 3) log('three frames') }
        `,
      },
      script: 'hub',
      blueprints: { crate: { model: 'proto/Box_A', collider: 'auto' } },
      entities: [{ blueprint: 'crate', x: 0, y: 0, z: 0 }],
    })

  test('it runs without anything in the level being scripted', () => {
    // The crate has no `script` of its own. Before this, a document like it had
    // nowhere at all to put a rule about the level.
    const document = HUB()
    const { scripts, world } = open(document)
    run(scripts, world, document, 3)

    expect(scripts.logs).toContain('the level is open')
    expect(scripts.logs).toContain('three frames')
    expect(scripts.failures).toEqual([])
  })

  test('it keeps ticking with nothing alive at all', () => {
    // An entity script stops when its entity dies. A level's does not: the
    // level is what it is about, and the level is still there.
    const document = doc({
      scripts: { hub: `let n = 0; function onTick() { n += 1; if (n === 2) log('still here') }` },
      script: 'hub',
    })
    const { scripts, world } = open(document)
    run(scripts, world, document, 2)

    // Nothing alive at all — this document has no entities and no player
    // blueprint. An entity script would have nothing to run on; the level's
    // does, because the level is what it is about.
    expect(world.alive.size).toBe(0)
    expect(scripts.logs).toContain('still here')
  })

  test('a document with no hub runs nothing extra', () => {
    const document = doc({
      scripts: { hub: `function onTick() { log('should not run') }` },
      blueprints: { crate: { model: 'proto/Box_A', collider: 'auto' } },
      entities: [{ blueprint: 'crate', x: 0, y: 0, z: 0 }],
    })
    const { scripts, world } = open(document)
    run(scripts, world, document, 3)

    expect(scripts.logs).toEqual([])
  })

  test('naming a script nobody wrote is refused at parse', () => {
    // The failure this format keeps meeting: a field that parses, that the
    // editor can set, and that nothing reads.
    expect(() => doc({ scripts: { hub: 'function onTick() {}' }, script: 'nope' })).toThrow(
      /script/,
    )
  })
})

describe("a script reaching the level's own data", () => {
  /**
   * The question this was built for, asked in as many words: *how would I add
   * money when I use an object in the script?* A rule says it as `addProp
   * target: 'world'`, and a script that had to reach for a rule to add a coin
   * would be a script that cannot finish a sentence it started.
   */
  const SHOP = () =>
    doc({
      data: { money: { scope: 'player', value: 10 } },
      scripts: {
        till: `
          function onTick() {
            if (world.get('money') < 15) world.add('money', 5)
            if (world.get('money') >= 15) world.set('spent', 1)
          }
        `,
      },
      script: 'till',
    })

  test('it reads what the level declared and writes it back', () => {
    const document = SHOP()
    const { scripts, world } = open(document)
    const data = new Map([['money', 10]])

    scripts.step(world, document.blueprints, 1 / 60, data)
    expect(data.get('money')).toBe(15)
  })

  test('a field nobody declared is refused, and the script is told', () => {
    /**
     * `parseXp` refuses a *rule* naming an undeclared field and cannot do the
     * same here — a key in a script is a string that may be built at runtime.
     * So the check moves to the write, and it says so: silently accepting it
     * meant the value lived in the map, the scene wrote back only declared
     * fields, and somebody's coin count worked all session and was gone the
     * next morning with nothing anywhere saying why.
     */
    const document = SHOP()
    const { scripts, world } = open(document)
    const data = new Map([['money', 10]])

    scripts.step(world, document.blueprints, 1 / 60, data)
    scripts.step(world, document.blueprints, 1 / 60, data)

    expect(data.has('spent')).toBe(false)
    expect(scripts.logs.some((line) => line.includes('no field called "spent"'))).toBe(true)
  })

  test('a host that keeps nothing reads zero and writes nothing', () => {
    // The same answer a host with no store already gives, rather than a throw
    // in the middle of somebody's frame.
    const document = SHOP()
    const { scripts, world } = open(document)
    expect(() => scripts.step(world, document.blueprints, 1 / 60)).not.toThrow()
    expect(scripts.failures).toEqual([])
  })

  /**
   * The same store, from the other hook.
   *
   * `onTick` was handed the level's data and `onTrigger` was not, so a script
   * that scored on contact - which is what a goal *is* - read every field as
   * zero and wrote to nothing at all. Silently, because a write with no store
   * is deliberately a no-op rather than a throw: kickabout counted its goals
   * in `onTrigger`, the scoreboard sat at nil-nil all match, and the level, the
   * parser and the sandbox were all behaving exactly as written.
   *
   * The far end of that is worse than a wrong number. `world.get` reading zero
   * means a script that *checks* a score before acting takes the wrong branch,
   * and nothing anywhere says why.
   */
  const REFEREE = () =>
    doc({
      data: { goals: { scope: 'run', value: 0 } },
      scripts: {
        whistle: `
          function onTrigger(event) {
            if (event === 'collide') {
              world.add('goals', 1)
              log('goals now ' + world.get('goals'))
            }
          }
        `,
      },
      blueprints: { net: { model: 'proto/Box_A', script: 'whistle' } },
      entities: [{ blueprint: 'net', x: 0, y: 0, z: 0 }],
    })

  test('a script scoring on contact reaches the same store a tick does', () => {
    const document = REFEREE()
    const { scripts, world } = open(document)
    const data = new Map([['goals', 0]])

    scripts.step(world, document.blueprints, 1 / 60, data)
    scripts.trigger(world, document.blueprints, 0, 'collide', 1, data)

    expect(data.get('goals')).toBe(1)
    // And it read back what it had just written, rather than the zero a hook
    // with no store answers with.
    expect(scripts.logs).toContain('goals now 1')
  })

  test('a trigger with no store still writes nothing rather than throwing', () => {
    const document = REFEREE()
    const { scripts, world } = open(document)
    scripts.step(world, document.blueprints, 1 / 60)

    expect(() => scripts.trigger(world, document.blueprints, 0, 'collide', 1)).not.toThrow()
    expect(scripts.failures).toEqual([])
  })
})

describe('reading and spending', () => {
  const TILL = (body: string) =>
    doc({
      data: { money: { scope: 'player', value: 10 } },
      scripts: { till: `function onTick() { ${body} }` },
      script: 'till',
    })

  test('reading is the same call, and a field nobody wrote reads zero', () => {
    const document = TILL(`log('have ' + world.get('money')); log('none ' + world.get('coins'))`)
    const { scripts, world } = open(document)
    scripts.step(world, document.blueprints, 1 / 60, new Map([['money', 42]]))

    expect(scripts.logs).toContain('have 42')
    // Not undefined, not a throw: the same answer a property and a condition
    // give for something nobody has set.
    expect(scripts.logs).toContain('none 0')
  })

  test('spending is adding a negative, and nothing floors it', () => {
    const document = TILL(`world.add('money', -15)`)
    const { scripts, world } = open(document)
    const data = new Map([['money', 10]])
    scripts.step(world, document.blueprints, 1 / 60, data)

    // Worth knowing rather than guessing: there is no floor anywhere. A level
    // that must not go into debt checks before it spends.
    expect(data.get('money')).toBe(-5)
  })
})

describe('spending what you have', () => {
  const TILL = (body: string) =>
    doc({
      data: { money: { scope: 'player', value: 10 } },
      scripts: { till: `function onTick() { ${body} }` },
      script: 'till',
    })

  test('it takes the money and says it did', () => {
    const document = TILL(`if (world.spend('money', 4)) log('bought')`)
    const { scripts, world } = open(document)
    const data = new Map([['money', 10]])
    scripts.step(world, document.blueprints, 1 / 60, data)

    expect(data.get('money')).toBe(6)
    expect(scripts.logs).toContain('bought')
  })

  test('short is a refusal, not a partial spend', () => {
    // Taking what there is and answering false would be the worst of both: the
    // caller reads "nothing happened" and the money is gone anyway.
    const document = TILL(`if (!world.spend('money', 40)) log('too dear')`)
    const { scripts, world } = open(document)
    const data = new Map([['money', 10]])
    scripts.step(world, document.blueprints, 1 / 60, data)

    expect(data.get('money')).toBe(10)
    expect(scripts.logs).toContain('too dear')
  })

  test('exactly enough goes through', () => {
    const document = TILL(`world.spend('money', 10)`)
    const { scripts, world } = open(document)
    const data = new Map([['money', 10]])
    scripts.step(world, document.blueprints, 1 / 60, data)
    expect(data.get('money')).toBe(0)
  })

  test('a field nobody declared is refused and said, like writing to one', () => {
    const document = TILL(`world.spend('coins', 1)`)
    const { scripts, world } = open(document)
    scripts.step(world, document.blueprints, 1 / 60, new Map([['money', 10]]))
    expect(scripts.logs.some((l) => l.includes('no field called "coins"'))).toBe(true)
  })
})

/**
 * Telling a body what to do, which a script could not.
 *
 * `blueprint.pose` says what a body holds *at rest* and the host picks the rest
 * from how it is moving, so a script could walk a character across a room and
 * could not make it wave when it got there. Asked for directly.
 */
describe('runAnimation', () => {
  const level = (call: string) =>
    doc({
      scripts: { waver: `function onSpawn() { ${call} }` },
      blueprints: { guard: { model: 'proto/Box_A', script: 'waver' } },
      entities: [{ blueprint: 'guard', x: 0, y: 0, z: 0 }],
    })

  test('a name reaches the world, with the tick that identifies it', () => {
    const document = level(`self.runAnimation('Cheer')`)
    const { scripts, world } = open(document)
    run(scripts, world, document, 1)
    // Tick one, because `run` steps the world before the hook fires.
    expect(world.clip.get(0)).toEqual({ name: 'Cheer', loop: false, at: 1 })
    scripts.close()
  })

  test('loop is off unless asked for, because most of what anybody wants is a moment', () => {
    const document = level(`self.runAnimation('Wave', true)`)
    const { scripts, world } = open(document)
    run(scripts, world, document, 1)
    expect(world.clip.get(0)?.loop).toBe(true)
    scripts.close()
  })

  test('parts come across as an array, which is what makes it a layer', () => {
    /**
     * JSON over the bridge, because the bridge carries numbers and strings and
     * nothing else - but what a script *writes* is an array, and that is the
     * whole point of the encoding being in the prelude.
     */
    const document = level(`self.runAnimation('Wave', true, ['arms', 'torso'])`)
    const { scripts, world } = open(document)
    run(scripts, world, document, 1)
    expect(world.clip.get(0)?.parts).toEqual(['arms', 'torso'])
    scripts.close()
  })

  test('null clears it, which is how a loop is stopped', () => {
    const document = level(`self.runAnimation('Wave', true); self.runAnimation(null)`)
    const { scripts, world } = open(document)
    run(scripts, world, document, 1)
    expect(world.clip.has(0)).toBe(false)
    scripts.close()
  })

  test('a parts list that is not a list of names is the whole body, not a throw', () => {
    // A malformed list should be a clip that plays rather than a call that
    // throws inside somebody's `onTick`.
    const document = level(`self.runAnimation('Wave', false, 'arms')`)
    const { scripts, world } = open(document)
    run(scripts, world, document, 1)
    expect(world.clip.get(0)).toEqual({ name: 'Wave', loop: false, at: 1 })
    scripts.close()
  })
})

/**
 * `t`, and the promise that a missing translation is invisible.
 *
 * The interesting cases are all the ones where *nothing* is found: a level with
 * no block, a reader with no language, a phrase nobody translated. Every one of
 * them has to come back as the sentence the author typed, because the
 * alternative - the design where a key is an identifier - shows a player
 * `gate.locked` on the day somebody forgets a row.
 */
describe('what a level says, in the reader’s language', () => {
  const speaking = (words?: Record<string, Record<string, string>>) =>
    doc({
      scripts: { greet: `function onSpawn() { log(t('the gate is locked')) }` },
      blueprints: { post: { model: 'proto/Primitive_Floor', script: 'greet' } },
      entities: [{ blueprint: 'post', x: 0, y: 0, z: 0 }],
      ...(words ? { words } : {}),
    })

  const german = { de: { 'the gate is locked': 'das Tor ist verschlossen' } }

  const firstLine = (document: XpDocument, options?: ScriptOptions) => {
    const { scripts, world } = open(document, options)
    run(scripts, world, document, 1, 0.1)
    const line = scripts.logs[0]
    scripts.close()
    return line
  }

  test('the translation, when the level has one for that reader', () => {
    expect(firstLine(speaking(german), { locale: 'de' })).toBe('das Tor ist verschlossen')
  })

  test('the sentence itself, when the level has no block', () => {
    expect(firstLine(speaking(), { locale: 'de' })).toBe('the gate is locked')
  })

  test('the sentence itself, when the reader has no language listed', () => {
    expect(firstLine(speaking(german), { locale: 'fr' })).toBe('the gate is locked')
  })

  test('the sentence itself, when the host says nothing about a language', () => {
    expect(firstLine(speaking(german))).toBe('the gate is locked')
  })

  /** A phrase the author wrapped and never got round to translating. */
  test('the sentence itself, when that one phrase is missing', () => {
    const partial = doc({
      scripts: { greet: `function onSpawn() { log(t('the gate is open')) }` },
      blueprints: { post: { model: 'proto/Primitive_Floor', script: 'greet' } },
      entities: [{ blueprint: 'post', x: 0, y: 0, z: 0 }],
      words: german,
    })
    expect(firstLine(partial, { locale: 'de' })).toBe('the gate is open')
  })

  /**
   * Handed in rather than read off a global, like the other four. A script that
   * declares its own `t` breaks only itself.
   */
  test('it arrives as a parameter, so a script may shadow it', () => {
    const shadowing = doc({
      scripts: { greet: `function onSpawn() { var t = function () { return 'mine' }; log(t()) }` },
      blueprints: { post: { model: 'proto/Primitive_Floor', script: 'greet' } },
      entities: [{ blueprint: 'post', x: 0, y: 0, z: 0 }],
      words: german,
    })
    expect(firstLine(shadowing, { locale: 'de' })).toBe('mine')
  })
})

/**
 * The three things a script asks for that the host now answers in one crossing
 * rather than several. Each of these used to be spelled out in the sandbox out
 * of the primitives beside it; what is checked here is that moving the work has
 * not moved the answer. See the numbers in `bun run xp:bench`.
 */
describe('what the host answers in one go', () => {
  test('speed is how fast it is going, whichever way', () => {
    const ball = doc({
      scripts: { probe: `function onTick() { self.set('fast', self.speed) }` },
      blueprints: {
        ball: { model: 'proto/Box_A', script: 'probe', body: { gravity: 0 } },
      },
      entities: [{ blueprint: 'ball', x: 0, y: 1, z: 0 }],
    })
    const { scripts, world } = open(ball)
    world.velocity.set(0, { x: 3, y: 0, z: 4 })
    run(scripts, world, ball, 1)
    expect(world.props.get(0)!.fast).toBeCloseTo(5, 5)
    scripts.close()
  })

  test('and zero on a thing the document never made a body', () => {
    const crate = doc({
      scripts: { probe: `function onTick() { self.set('fast', self.speed) }` },
      blueprints: { crate: { model: 'proto/Box_A', script: 'probe' } },
      entities: [{ blueprint: 'crate', x: 0, y: 1, z: 0 }],
    })
    const { scripts, world } = open(crate)
    run(scripts, world, crate, 1)
    expect(world.props.get(0)!.fast).toBe(0)
    scripts.close()
  })

  test('add starts a property nobody has set at zero', () => {
    const counter = doc({
      scripts: { count: `function onTick() { self.add('seen', 2) }` },
      blueprints: { box: { model: 'proto/Box_A', script: 'count' } },
      entities: [{ blueprint: 'box', x: 0, y: 0, z: 0 }],
    })
    const { scripts, world } = open(counter)
    run(scripts, world, counter, 3)
    expect(world.props.get(0)!.seen).toBe(6)
    scripts.close()
  })

  test('world.add adds to the level’s own field', () => {
    const purse = doc({
      data: { money: { scope: 'player' as const, value: 4 } },
      scripts: { earn: `function onTick() { world.add('money', 3) }` },
      blueprints: { box: { model: 'proto/Box_A', script: 'earn' } },
      entities: [{ blueprint: 'box', x: 0, y: 0, z: 0 }],
    })
    const data = new Map<string, number>([['money', 4]])
    const { scripts, world } = open(purse)
    scripts.step(world, purse.blueprints, 1 / 60, data)
    scripts.step(world, purse.blueprints, 1 / 60, data)
    expect(data.get('money')).toBe(10)
    scripts.close()
  })

  test('and still refuses a field the document never declared, out loud', () => {
    const purse = doc({
      data: { money: { scope: 'player' as const, value: 0 } },
      scripts: { earn: `function onTick() { world.add('rubies', 1) }` },
      blueprints: { box: { model: 'proto/Box_A', script: 'earn' } },
      entities: [{ blueprint: 'box', x: 0, y: 0, z: 0 }],
    })
    const data = new Map<string, number>([['money', 0]])
    const { scripts, world } = open(purse)
    scripts.step(world, purse.blueprints, 1 / 60, data)
    expect(data.has('rubies')).toBe(false)
    expect(scripts.logs.join(' ')).toContain('there is no field called "rubies"')
    scripts.close()
  })
})

/**
 * What kind of thing a script is running inside.
 *
 * Three questions a level could not ask before, and each of them is one an
 * author was otherwise going to answer by guessing. Two are the document's own
 * axes - `mode` is *what this is*, `style` is *what you do in it* - and the
 * third is the room's.
 */
describe('a script asking what it is running in', () => {
  const asking = (rules: Record<string, unknown> | undefined) =>
    doc({
      ...(rules ? { rules } : {}),
      scripts: {
        watch: `
          function onTick() {
            self.set('lobby', world.mode === 'lobby' ? 1 : 0)
            self.set('battle', world.mode === 'battle' ? 1 : 0)
            self.set('shooting', world.style === 'shooter' ? 1 : 0)
            self.set('live', world.live ? 1 : 0)
          }
        `,
      },
      blueprints: {
        eye: { model: 'proto/Box_A', script: 'watch', props: { lobby: 0, battle: 0, shooting: 0, live: 0 } },
      },
      entities: [{ blueprint: 'eye', name: 'eye', x: 0, y: 0, z: 0 }],
    })

  const read = (rules: Record<string, unknown> | undefined, live?: boolean) => {
    const document = asking(rules)
    const { scripts, world } = open(document)
    if (live !== undefined) scripts.setLive(live)
    run(scripts, world, document, 2)
    const eye = [...world.alive].find((id) => world.name.get(id) === 'eye')!
    const props = world.props.get(eye)!
    scripts.close()
    return props
  }

  test('a document that says nothing is a space, in freestyle, on its own', () => {
    // The three answers every level on disk gives, because none of them has a
    // `mode` and this is what its absence means.
    expect(read(undefined)).toMatchObject({ lobby: 0, battle: 0, shooting: 0, live: 0 })
  })

  test('and one that says it is a lobby says so', () => {
    expect(read({ preset: 'freestyle', mode: 'lobby' })).toMatchObject({ lobby: 1, battle: 0 })
  })

  test('the two axes are separate, which is the whole reason there are two', () => {
    // A shooting game that is a lobby rather than a round: the pair `preset`
    // alone could not express, and the reason it stopped trying.
    expect(read({ preset: 'shooter', mode: 'lobby' })).toMatchObject({
      lobby: 1,
      battle: 0,
      shooting: 1,
    })
  })

  test('nobody else is here until the host says otherwise', () => {
    // Never called is `false`, which is what a test, a shot and a level opened
    // alone in the editor all are.
    expect(read({ preset: 'deathmatch', mode: 'battle' })).toMatchObject({ battle: 1, live: 0 })
  })

  test('and the host can say otherwise', () => {
    expect(read({ preset: 'deathmatch', mode: 'battle' }, true)).toMatchObject({ live: 1 })
  })

  test('a level with no scripts still takes the answer, rather than needing a branch', () => {
    // `NO_SCRIPTS` is a real object a host calls unconditionally. A host that
    // had to ask whether this level has code in it is a host with a branch that
    // will one day be written the other way round.
    const opened = engine.open(doc({ rules: { preset: 'freestyle', mode: 'battle' } }))
    if (!opened.ok) throw new Error('did not open')
    expect(() => opened.scripts.setLive(true)).not.toThrow()
    opened.scripts.close()
  })
})
