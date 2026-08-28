/**
 * Every recipe in docs/xp/user-manual/script-features.md, run.
 *
 * ./manual.test.ts checks that the reference still *names* the vocabulary,
 * because a reference nobody checks quietly becomes a plan. A tutorial goes
 * stale a different way: the names are all still there and the code no longer
 * works. Copying a snippet that throws is a worse first hour than finding no
 * snippet at all, so the snippets live here first and are pasted into the
 * document second.
 *
 * Three of them were wrong when they were written, and each one is a line in
 * that document now rather than a thing the next author rediscovers:
 *
 * - a trigger with an empty `do` does not parse, so a blueprint cannot declare
 *   `on: enter` purely to wake its script up;
 * - `world.time` is already one `dt` in by the first `onTick`, so a cooldown
 *   seeded at zero fires three times in three seconds and not four;
 * - `world.get`/`set`/`add`/`spend` are inert inside `onTrigger` — the level's
 *   data is only bound for the duration of `step`.
 *
 * The last one is a gap rather than a decision; there is a test below pinning
 * the behaviour as it stands so that fixing it fails loudly here.
 */
import { beforeAll, describe, expect, test } from 'bun:test'
import variant from '@jitl/quickjs-wasmfile-release-sync'
import { spawnEntities, spawnPlayer, PLAYER_ID, type EntityWorld } from '../world/entities'
import { parseXp, XP_FORMAT, type XpDocument } from '../document/format'
import { loadScripts, type ScriptEngine, type Scripts } from '../rules/script'
import { stepEmitted, type Said } from '../rules/triggers'

let engine: ScriptEngine

beforeAll(async () => {
  engine = await loadScripts(variant)
})

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

function open(document: XpDocument): { scripts: Scripts; world: EntityWorld } {
  const opened = engine.open(document)
  if (!opened.ok) throw new Error(opened.problems.map((p) => `${p.at}: ${p.message}`).join('\n'))
  return { scripts: opened.scripts, world: spawnEntities(document) }
}

function run(
  scripts: Scripts,
  world: EntityWorld,
  document: XpDocument,
  frames: number,
  dt = 1 / 60,
  data?: Map<string, number>,
) {
  const effects = []
  for (let i = 0; i < frames; i++) {
    world.tick += 1
    effects.push(...scripts.step(world, document.blueprints, dt, data))
  }
  return effects
}

/** Fail loudly rather than let a recipe "pass" while its script is dead. */
function clean(scripts: Scripts) {
  expect(scripts.failures.map((f) => `${f.hook}: ${f.message}`)).toEqual([])
}

describe('recipe: a platform that patrols', () => {
  test('turns round at both ends', () => {
    const document = doc({
      scripts: {
        patrol: `
          let going = 1

          function onTick(dt) {
            self.x += going * 3 * dt
            if (self.x > 3) going = -1
            if (self.x < -3) going = 1
          }
        `,
      },
      blueprints: { block: { model: 'proto/Primitive_Cube', script: 'patrol' } },
      entities: [{ blueprint: 'block', name: 'lift', x: 0, y: 1, z: 0 }],
    })
    const { scripts, world } = open(document)
    run(scripts, world, document, 40, 0.05)
    clean(scripts)
    const x = world.position.get(0)!.x
    expect(x).toBeLessThanOrEqual(3.2)
    expect(x).toBeGreaterThanOrEqual(-3.2)
    scripts.close()
  })
})

describe('recipe: two of a thing do not share a variable', () => {
  test('each entity has its own closure', () => {
    const document = doc({
      scripts: { count: `let n = 0\nfunction onTick() { n += 1; self.set('n', n) }` },
      blueprints: { pip: { model: 'proto/Box_A', script: 'count' } },
      entities: [
        { blueprint: 'pip', name: 'a', x: 0, y: 0, z: 0 },
        { blueprint: 'pip', name: 'b', x: 4, y: 0, z: 0 },
      ],
    })
    const { scripts, world } = open(document)
    run(scripts, world, document, 5)
    clean(scripts)
    expect(world.props.get(0)!.n).toBe(5)
    expect(world.props.get(1)!.n).toBe(5)
    scripts.close()
  })
})

describe('recipe: a door that opens when you are near', () => {
  test('reads the player by name and measures flat', () => {
    const document = doc({
      scripts: {
        proximity: `
          const OPEN = 3

          function onTick() {
            const player = getEntityByName('player')
            if (!player) return
            const near = self.flatDistanceTo(player) < 4
            self.y = near ? OPEN : 0
          }
        `,
      },
      blueprints: { door: { model: 'proto/Primitive_Wall', script: 'proximity' } },
      entities: [{ blueprint: 'door', name: 'door', x: 0, y: 0, z: 0 }],
    })
    const { scripts, world } = open(document)
    spawnPlayer(world, document, { x: 20, y: 0, z: 0 })
    run(scripts, world, document, 2)
    clean(scripts)
    expect(world.position.get(0)!.y).toBe(0)

    world.position.set(PLAYER_ID, { x: 1, y: 0, z: 1 })
    run(scripts, world, document, 2)
    clean(scripts)
    expect(world.position.get(0)!.y).toBe(3)
    scripts.close()
  })
})

describe('recipe: a cooldown, which is how a script waits', () => {
  test('fires on a world.time deadline rather than a timer', () => {
    const document = doc({
      scripts: {
        turret: `
          let ready = 0

          function onTick() {
            if (world.time < ready) return
            ready = world.time + 1
            self.add('shots', 1)
          }
        `,
      },
      blueprints: { turret: { model: 'proto/Box_A', script: 'turret' } },
      entities: [{ blueprint: 'turret', name: 't', x: 0, y: 0, z: 0 }],
    })
    const { scripts, world } = open(document)
    run(scripts, world, document, 60, 0.05) // three seconds
    clean(scripts)
    // t = 0.05, 1.05, 2.05 — `world.time` is already one dt in on the first tick
    expect(world.props.get(0)!.shots).toBe(3)
    scripts.close()
  })
})

describe('recipe: a pickup that knows who took it', () => {
  test('onTrigger enter is handed the player as an entity', () => {
    const document = doc({
      scripts: {
        coin: `
          function onTrigger(event, other) {
            if (event !== 'enter' || !other) return
            other.add('coins', 1)
            self.score(1)
            self.despawn()
          }
        `,
      },
      blueprints: {
        coin: {
          model: 'proto/Box_A',
          collider: 'none',
          script: 'coin',
          triggers: [{ on: 'enter', do: [{ op: 'emit', event: 'coin' }] }],
        },
      },
      entities: [{ blueprint: 'coin', name: 'coin', x: 0, y: 0, z: 0 }],
    })
    const { scripts, world } = open(document)
    spawnPlayer(world, document, { x: 0, y: 0, z: 0 })
    run(scripts, world, document, 1)
    const effects = scripts.trigger(world, document.blueprints, 0, 'enter', PLAYER_ID)
    clean(scripts)
    expect(world.props.get(PLAYER_ID)!.coins).toBe(1)
    expect(effects).toContainEqual({ kind: 'score', amount: 1, by: 0 })
    expect(world.alive.has(0)).toBe(false)
    scripts.close()
  })
})

describe('recipe: buying something', () => {
  test('the purse is only reachable from onTick, so onTrigger raises a flag', () => {
    const document = doc({
      data: { coins: { scope: 'player', value: 0 } },
      scripts: {
        shop: `
          let asked = false

          function onTrigger(event) {
            if (event === 'enter') asked = true
          }

          function onTick() {
            if (!asked) return
            asked = false
            if (world.spend('coins', 5)) self.spawn('prize', 0, 1, 0)
            else log('not enough coins')
          }
        `,
      },
      blueprints: {
        shop: {
          model: 'proto/Box_A',
          script: 'shop',
          triggers: [{ on: 'enter', do: [{ op: 'emit', event: 'shop' }] }],
        },
        prize: { model: 'proto/target_pieces_A', collider: 'none' },
      },
      entities: [{ blueprint: 'shop', name: 'shop', x: 0, y: 0, z: 0 }],
    })
    const { scripts, world } = open(document)
    const data = new Map<string, number>([['coins', 3]])

    run(scripts, world, document, 1, 1 / 60, data) // the frame that creates the instance
    scripts.trigger(world, document.blueprints, 0, 'enter', PLAYER_ID)
    run(scripts, world, document, 1, 1 / 60, data)
    clean(scripts)
    expect(data.get('coins')).toBe(3)
    expect(scripts.logs).toContain('not enough coins')

    data.set('coins', 12)
    scripts.trigger(world, document.blueprints, 0, 'enter', PLAYER_ID)
    run(scripts, world, document, 1, 1 / 60, data)
    clean(scripts)
    expect(data.get('coins')).toBe(7)
    scripts.close()
  })

  test('the gap this recipe works around: no purse inside onTrigger', () => {
    const document = doc({
      data: { coins: { scope: 'player', value: 0 } },
      scripts: {
        naive: `
          function onTrigger(event) {
            if (event !== 'enter') return
            self.set('sawCoins', world.get('coins'))
            world.add('coins', 1)
          }
        `,
      },
      blueprints: {
        till: {
          model: 'proto/Box_A',
          script: 'naive',
          triggers: [{ on: 'enter', do: [{ op: 'emit', event: 'till' }] }],
        },
      },
      entities: [{ blueprint: 'till', name: 'till', x: 0, y: 0, z: 0 }],
    })
    const { scripts, world } = open(document)
    const data = new Map<string, number>([['coins', 9]])
    run(scripts, world, document, 1, 1 / 60, data)
    scripts.trigger(world, document.blueprints, 0, 'enter', PLAYER_ID)
    clean(scripts)
    // Reads zero rather than nine, and the write does not land — silently.
    expect(world.props.get(0)!.sawCoins).toBe(0)
    expect(data.get('coins')).toBe(9)
    scripts.close()
  })
})

describe('recipe: chance everybody agrees about', () => {
  test('the same seed rolls the same game twice', () => {
    const document = doc({
      scripts: {
        die: `
          function onSpawn() {
            self.set('face', world.roll(6))
            self.set('side', world.pick([10, 20, 30]))
          }
        `,
      },
      blueprints: { die: { model: 'proto/Box_A', script: 'die' } },
      entities: [{ blueprint: 'die', name: 'd', x: 0, y: 0, z: 0 }],
    })
    const first = open(document)
    run(first.scripts, first.world, document, 1)
    clean(first.scripts)
    const second = open(document)
    run(second.scripts, second.world, document, 1)
    clean(second.scripts)

    const a = first.world.props.get(0)!
    const b = second.world.props.get(0)!
    expect(a.face).toBe(b.face)
    expect(a.face).toBeGreaterThanOrEqual(1)
    expect(a.face).toBeLessThanOrEqual(6)
    expect([10, 20, 30]).toContain(a.side)
    first.scripts.close()
    second.scripts.close()
  })
})

describe('recipe: waving while walking', () => {
  test('a layered clip lands on the entity', () => {
    const document = doc({
      scripts: {
        greeter: `
          let waved = false

          function onTick() {
            const player = getEntityByName('player')
            if (!player) return
            const near = self.flatDistanceTo(player) < 5
            if (near && !waved) { self.runAnimation('Wave', true, ['arms']); waved = true }
            if (!near && waved) { self.runAnimation(null); waved = false }
          }
        `,
      },
      blueprints: { guard: { model: 'proto/Box_A', script: 'greeter' } },
      entities: [{ blueprint: 'guard', name: 'guard', x: 0, y: 0, z: 0 }],
    })
    const { scripts, world } = open(document)
    spawnPlayer(world, document, { x: 1, y: 0, z: 0 })
    run(scripts, world, document, 2)
    clean(scripts)
    expect(world.clip.get(0)).toMatchObject({ name: 'Wave', loop: true, parts: ['arms'] })

    world.position.set(PLAYER_ID, { x: 40, y: 0, z: 0 })
    run(scripts, world, document, 2)
    clean(scripts)
    expect(world.clip.get(0)).toBeUndefined()
    scripts.close()
  })
})

describe('recipe: a lamp that breathes', () => {
  test('writing intensity every frame moves the lamp', () => {
    const document = doc({
      scripts: {
        flicker: `
          function onTick() {
            self.intensity = 2 + Math.sin(world.time * 3)
          }
        `,
      },
      blueprints: {
        torch: { model: 'proto/Primitive_Wall', script: 'flicker', light: {} },
      },
      entities: [{ blueprint: 'torch', name: 'torch', x: 0, y: 1, z: 0 }],
    })
    const { scripts, world } = open(document)
    run(scripts, world, document, 1, 0.5)
    clean(scripts)
    const first = world.light.get(0)!.intensity
    run(scripts, world, document, 1, 0.5)
    clean(scripts)
    expect(world.light.get(0)!.intensity).not.toBe(first)
    scripts.close()
  })
})

describe("recipe: the level's own script", () => {
  test('runs with no entity, and keeps the level data', () => {
    const document = doc({
      data: { wave: { scope: 'player', value: 0 } },
      script: 'director',
      scripts: {
        director: `
          let next = 0

          function onTick() {
            if (world.time < next) return
            next = world.time + 2
            world.add('wave', 1)
            log('wave ' + world.get('wave'))
          }
        `,
      },
      blueprints: { rock: { model: 'proto/Box_A' } },
      entities: [{ blueprint: 'rock', name: 'rock', x: 0, y: 0, z: 0 }],
    })
    const { scripts, world } = open(document)
    const data = new Map<string, number>([['wave', 0]])
    run(scripts, world, document, 100, 0.05, data) // five seconds
    clean(scripts)
    expect(data.get('wave')).toBe(3) // t=0, 2, 4
    expect(scripts.logs).toContain('wave 1')
    scripts.close()
  })
})

describe('recipe: one thing telling another', () => {
  test("a script's emit reaches a rule listening for that name", () => {
    const document = doc({
      scripts: { bell: `function onTrigger(event) { if (event === 'enter') self.emit('ring') }` },
      blueprints: {
        bell: {
          model: 'proto/Box_A',
          script: 'bell',
          triggers: [{ on: 'enter', do: [{ op: 'emit', event: 'bell' }] }],
        },
        gate: {
          model: 'proto/Primitive_Wall',
          props: { open: 0 },
          triggers: [
            { on: 'emitted', event: 'ring', do: [{ op: 'setProp', key: 'open', value: 1 }] },
          ],
        },
        unrelated: {
          model: 'proto/Primitive_Wall',
          props: { open: 0 },
          triggers: [
            { on: 'emitted', event: 'other-name', do: [{ op: 'setProp', key: 'open', value: 1 }] },
          ],
        },
      },
      entities: [
        { blueprint: 'bell', name: 'bell', x: 0, y: 0, z: 0 },
        { blueprint: 'gate', name: 'gate', x: 4, y: 0, z: 0 },
        { blueprint: 'unrelated', name: 'other', x: 8, y: 0, z: 0 },
      ],
    })
    const { scripts, world } = open(document)
    run(scripts, world, document, 1) // the frame that creates the instance

    // What the host does with the frame's effects: collect the emits, deliver
    // them. `script: true` is what keeps this one off the wire.
    const effects = scripts.trigger(world, document.blueprints, 0, 'enter', PLAYER_ID)
    clean(scripts)
    const said: Said[] = effects
      .filter((e) => e.kind === 'emit')
      .map((e) => ({ event: e.event, from: e.from }))
    expect(said).toEqual([{ event: 'ring', from: 0 }])
    expect(effects.every((e) => e.kind !== 'emit' || e.script === true)).toBe(true)

    stepEmitted(world, document.blueprints, said)
    expect(world.props.get(1)!.open).toBe(1)
    expect(world.props.get(2)!.open).toBe(0)
    scripts.close()
  })

  test('a script watches a property to react to it, because onTrigger never sees emitted', () => {
    const document = doc({
      scripts: {
        watcher: `
          let was = 0

          function onTick() {
            const gate = getEntityByName('gate')
            if (!gate) return
            const now = gate.get('open')
            if (now === was) return
            was = now
            self.add('sawChange', 1)
          }
        `,
      },
      blueprints: {
        watcher: { model: 'proto/Box_A', script: 'watcher' },
        gate: {
          model: 'proto/Primitive_Wall',
          props: { open: 0 },
          triggers: [
            { on: 'emitted', event: 'ring', do: [{ op: 'setProp', key: 'open', value: 1 }] },
          ],
        },
      },
      entities: [
        { blueprint: 'watcher', name: 'watcher', x: 0, y: 0, z: 0 },
        { blueprint: 'gate', name: 'gate', x: 4, y: 0, z: 0 },
      ],
    })
    const { scripts, world } = open(document)
    run(scripts, world, document, 3)
    clean(scripts)
    expect(world.props.get(0)!.sawChange ?? 0).toBe(0)

    stepEmitted(world, document.blueprints, [{ event: 'ring', from: 1 }])
    run(scripts, world, document, 3)
    clean(scripts)
    // Once for the change, and not again for the three frames it stayed open.
    expect(world.props.get(0)!.sawChange).toBe(1)
    scripts.close()
  })
})

describe('recipe: something that glows when it is touched', () => {
  test('a script writes the look and can put it back', () => {
    const document = doc({
      scripts: {
        flash: `
          function onTick() {
            self.material = self.get('hot') ? 'rainbow' : 'own'
          }
        `,
      },
      blueprints: { orb: { model: 'proto/Box_A', script: 'flash', props: { hot: 0 } } },
      entities: [{ blueprint: 'orb', name: 'orb', x: 0, y: 0, z: 0 }],
    })
    const { scripts, world } = open(document)

    run(scripts, world, document, 1)
    clean(scripts)
    expect(world.material.has(0)).toBe(false)

    world.props.set(0, { hot: 1 })
    run(scripts, world, document, 1)
    clean(scripts)
    expect(world.material.get(0)).toBe('rainbow')

    world.props.set(0, { hot: 0 })
    run(scripts, world, document, 1)
    clean(scripts)
    // `own` is absence, so putting it back is a row that goes away - the same
    // fact the `material` verb writes, because it is the same verb underneath.
    expect(world.material.has(0)).toBe(false)
    scripts.close()
  })

  test('a look nobody has heard of throws, in the author’s own script', () => {
    const document = doc({
      scripts: { bad: `function onTick() { self.material = 'glitter' }` },
      blueprints: { orb: { model: 'proto/Box_A', script: 'bad' } },
      entities: [{ blueprint: 'orb', name: 'orb', x: 0, y: 0, z: 0 }],
    })
    const { scripts, world } = open(document)
    run(scripts, world, document, 1)
    // Deliberately not `clean`: the failure *is* the assertion here, and it
    // carries the hook it happened in and the list of names that would work.
    expect(scripts.failures.map((failure) => `${failure.hook}: ${failure.message}`)).toEqual([
      "onTick: 'glitter' is not a material: it is one of own, rainbow",
    ])
    scripts.close()
  })
})

describe('recipe: a punching bag that comes back whole', () => {
  test('damage from a script wakes the damaged hook', () => {
    const document = doc({
      scripts: {
        hitter: `function onSpawn() { const bag = getEntityByName('bag'); if (bag) bag.damage(3) }`,
        bag: `
          function onTrigger(event) {
            if (event === 'damaged') self.add('hits', 1)
          }
        `,
      },
      blueprints: {
        fist: { model: 'proto/Box_A', script: 'hitter' },
        bag: { model: 'proto/Box_A', props: { hp: 20 }, script: 'bag' },
      },
      entities: [
        { blueprint: 'fist', x: 0, y: 0, z: 0 },
        { blueprint: 'bag', name: 'bag', x: 4, y: 0, z: 0 },
      ],
    })
    const { scripts, world } = open(document)
    run(scripts, world, document, 2)
    clean(scripts)
    expect(world.props.get(1)!.hp).toBe(17)
    expect(world.props.get(1)!.hits).toBe(1)
    scripts.close()
  })
})

describe('recipe: saying something', () => {
  test('emit leaves as an effect the host decides about', () => {
    const document = doc({
      scripts: { horn: `function onSpawn() { self.emit('the gate is open') }` },
      blueprints: { gate: { model: 'proto/Box_A', script: 'horn' } },
      entities: [{ blueprint: 'gate', name: 'gate', x: 0, y: 0, z: 0 }],
    })
    const { scripts, world } = open(document)
    const effects = run(scripts, world, document, 1)
    clean(scripts)
    expect(effects).toContainEqual({ kind: 'emit', event: 'the gate is open', from: 0, script: true })
    scripts.close()
  })
})

describe('the things the doc says you cannot do', () => {
  test('Math.random throws with the replacement named', () => {
    const document = doc({
      scripts: { bad: `function onTick() { self.x = Math.random() }` },
      blueprints: { b: { model: 'proto/Box_A', script: 'bad' } },
      entities: [{ blueprint: 'b', x: 0, y: 0, z: 0 }],
    })
    const { scripts, world } = open(document)
    run(scripts, world, document, 3)
    expect(scripts.failures).toHaveLength(1)
    expect(scripts.failures[0]!.message).toContain('world.random()')
    scripts.close()
  })

  test('Date is gone', () => {
    const document = doc({
      scripts: { bad: `function onTick() { self.x = Date.now() }` },
      blueprints: { b: { model: 'proto/Box_A', script: 'bad' } },
      entities: [{ blueprint: 'b', x: 0, y: 0, z: 0 }],
    })
    const { scripts, world } = open(document)
    run(scripts, world, document, 3)
    expect(scripts.failures).toHaveLength(1)
    scripts.close()
  })

  test('one throw stops that entity and leaves the rest running', () => {
    const document = doc({
      scripts: {
        bad: `function onTick() { null.x = 1 }`,
        good: `function onTick() { self.add('n', 1) }`,
      },
      blueprints: {
        b: { model: 'proto/Box_A', script: 'bad' },
        g: { model: 'proto/Box_A', script: 'good' },
      },
      entities: [
        { blueprint: 'b', x: 0, y: 0, z: 0 },
        { blueprint: 'g', name: 'g', x: 4, y: 0, z: 0 },
      ],
    })
    const { scripts, world } = open(document)
    run(scripts, world, document, 5)
    expect(scripts.failures).toHaveLength(1)
    expect(world.props.get(1)!.n).toBe(5)
    scripts.close()
  })

  test('a field nobody declared does not stick', () => {
    const document = doc({
      scripts: { greedy: `function onSpawn() { world.set('gold', 99) }` },
      blueprints: { b: { model: 'proto/Box_A', script: 'greedy' } },
      entities: [{ blueprint: 'b', x: 0, y: 0, z: 0 }],
    })
    const { scripts, world } = open(document)
    const data = new Map<string, number>()
    run(scripts, world, document, 1, 1 / 60, data)
    expect(data.get('gold')).toBeUndefined()
    expect(scripts.logs.join('\n')).toContain('there is no field called "gold"')
    scripts.close()
  })
})
