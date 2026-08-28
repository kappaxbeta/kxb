#!/usr/bin/env bun
/**
 * How much can the engine actually hold?
 *
 *     bun run xp:bench
 *
 * The limits in the format were guesses - round numbers that sounded generous.
 * This replaces them with measurements, because a limit set too low turns a
 * legitimate level into an error and a limit set too high turns it into a
 * browser that stops responding, and neither is discoverable by reading.
 *
 * ---------------------------------------------------------------------------
 * What is measured, and what is not
 * ---------------------------------------------------------------------------
 * Everything here is the *simulation*: rasterising a world, stepping the
 * character controller against it, and running the triggers. That is the part
 * with a hard budget - it happens sixty times a second and it must fit in a
 * frame alongside the rendering.
 *
 * What it deliberately does not measure is the renderer, because that budget
 * belongs to the GPU and to how many distinct *models* a level uses rather than
 * how many pieces: the instancer draws one call per model per mesh, so four
 * thousand walls of one kind is cheaper than forty walls of a hundred kinds.
 * That number is measured separately below by counting draw calls rather than
 * by timing them, which is the honest thing to do without a GPU in the room.
 *
 * The budget to hold in mind: a frame at 60fps is 16.7ms and the renderer wants
 * most of it. A simulation step over 2ms is one that will show.
 */

import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { cpus, loadavg, platform } from 'node:os'
import path from 'node:path'
import {
  blockersOf,
  buildSolids,
  EYE_HEIGHT,
  spawnEntities,
  step,
  stepTriggers,
  WALK_PACE,
  type Overlaps,
} from '@kxb/xp/engine'
import { MAX_ENTITIES, parseXp, type Placement, type XpDocument } from '@kxb/xp'
import { loadScripts, SCRIPT_FUEL } from '@kxb/xp/script'
import scriptVariant from '@jitl/quickjs-wasmfile-release-sync'

const ROOT = path.join(import.meta.dir, '..')

/**
 * Median of several runs, after a warm-up.
 *
 * The warm-up is not politeness. The first version of this reported a thousand
 * placements as four times slower than ten thousand, which is JIT compilation
 * being measured instead of the code - and a limit set from that number would
 * have been set from noise.
 */
function timed(runs: number, body: () => void): number {
  for (let i = 0; i < 3; i++) body()

  const samples: number[] = []
  for (let i = 0; i < runs; i++) {
    const started = performance.now()
    body()
    samples.push(performance.now() - started)
  }
  samples.sort((a, b) => a - b)
  return samples[Math.floor(samples.length / 2)]
}

const ms = (v: number) => `${v.toFixed(2)}ms`.padStart(9)
const n = (v: number) => String(v).padStart(7)

/** A field of floor tiles, which is the cheapest way to make a big world. */
function field(tiles: number): Placement[] {
  const placements: Placement[] = []
  const side = Math.ceil(Math.sqrt(tiles))
  for (let i = 0; i < tiles; i++) {
    const x = (i % side) * 4 - 120
    const z = Math.floor(i / side) * 4 - 120
    placements.push({ model: 'proto/Primitive_Floor', x, y: 0, z, rotation: 0, scale: 1 })
  }
  return placements
}

/**
 * A world with a given number of entities in it - including more than the
 * parser will accept.
 *
 * The rows past `MAX_ENTITIES` are the whole point of the table: a limit is only
 * defensible if you can see what happens on the other side of it. So the
 * document is parsed at the limit and then topped up directly, which is
 * deliberately going round the check rather than an oversight.
 *
 * This is also why the bench stopped running: `MAX_ENTITIES` was lowered to
 * 1 000 *because* of the numbers below, and the script that produced them was
 * then refused by the limit it had just set.
 */
function docWith(placements: Placement[], entities: number, walkThrough = false): XpDocument {
  const authored = Math.min(entities, MAX_ENTITIES)
  const parsed = parseXp({
    format: 'xp/1',
    id: 'bench',
    name: 'Bench',
    packs: [{ id: 'proto' }],
    blueprints: {
      thing: {
        model: 'proto/Box_A',
        collider: walkThrough ? 'none' : 'auto',
        tags: ['breakable'],
        props: { hp: 10 },
        triggers: [{ on: 'enter', do: [{ op: 'score', amount: 1 }] }],
      },
    },
    entities: Array.from({ length: authored }, (_, i) => at(i)),
    world: { floorY: 0, placements, marks: [] },
  })
  if (!parsed.ok) throw new Error(parsed.problems.map((p) => `${p.at}: ${p.message}`).join('\n'))
  for (let i = authored; i < entities; i++) {
    parsed.document.entities.push({ ...at(i), rotation: 0, scale: 1, props: {} })
  }
  return parsed.document
}

/** Where the nth bench entity stands. A grid, out of the player's way. */
const at = (i: number) => ({
  blueprint: 'thing',
  x: (i % 40) * 2 - 40,
  y: 1,
  z: Math.floor(i / 40) * 2 - 40,
})

/**
 * What else the machine was doing, printed before anything is timed.
 *
 * Not decoration. A run of this taken at load 160 on eight cores reported the
 * cost of a script hook with no `onTick` at sixty-six times its real figure,
 * and nothing in the table said so - the numbers looked like numbers. A busy
 * machine is the one way this script lies, so it says out loud how busy it was
 * and refuses to be read quietly when it should not be trusted.
 *
 * The threshold is the core count: below it there is a core free for a
 * single-threaded benchmark, and above it there is not.
 */
function machine(): void {
  const cores = cpus().length
  const one = load()
  const busy = one >= cores
  console.log(
    `\n${cores} cores, load average ${one.toFixed(2)}` +
      (busy
        ? ' - TOO BUSY. Every number below is inflated by however much else is' +
          ' running; close things and run it again.'
        : ''),
  )
}

/**
 * The one-minute load average.
 *
 * Not `os.loadavg()` on a Mac, because **Bun's returns zero** - 2.7e-10 on a
 * machine Node reported at 4.54 on the same second. Written against it, the
 * warning above would have said "quiet" through the exact run it exists to
 * catch, which is worse than not having it. So the number comes from the
 * kernel, and `os.loadavg` is left for the platforms where it works.
 */
function load(): number {
  if (platform() !== 'darwin') return loadavg()[0]
  try {
    // `{ 4.54 4.67 5.36 }` - the first of the three is the one minute.
    const answer = execFileSync('sysctl', ['-n', 'vm.loadavg'], { encoding: 'utf8' })
    return Number.parseFloat(answer.replace('{', '').trim())
  } catch {
    return loadavg()[0]
  }
}

machine()

console.log('\n--- rasterising a world ------------------------------------------')
console.log('placements     cells      build')
for (const tiles of [100, 500, 1000, 2000, 5000, 10000]) {
  const placements = field(tiles)
  const world = { floorY: 0, ground: false, restart: false,
      fatal: false, placements, marks: [] }
  let cells = 0
  const took = timed(7, () => {
    cells = buildSolids(world).count
  })
  console.log(`${n(tiles)} ${n(cells)} ${ms(took)}`)
}

console.log('\n--- one simulation step, against entity boxes --------------------')
console.log('a frame is 16.7ms and the renderer wants most of it')
console.log('entities       step x1     x60 (one second)')
for (const count of [0, 50, 200, 500, 1000, 2000]) {
  const document = docWith(field(200), count)
  const solids = buildSolids(document.world)
  const world = spawnEntities(document)
  const blockers = blockersOf(world)

  let position = { x: 0, y: 1 + EYE_HEIGHT, z: 0 }
  const one = timed(9, () => {
    for (let i = 0; i < 60; i++) {
      position = step({
        position,
        velocityY: 0,
        moveX: WALK_PACE / 60,
        moveZ: 0,
        jump: false,
        grounded: true,
        delta: 1 / 60,
        isSolid: solids.isSolid,
        blockers,
        floorY: -100,
      }).position
    }
  })
  console.log(`${n(count)} ${ms(one / 60)} ${ms(one)}`)
}

console.log('\n--- triggers, one prober against every entity --------------------')
console.log('entities    stepTriggers x1     x60')
for (const count of [50, 200, 500, 1000, 2000]) {
  const document = docWith(field(200), count, true)
  const world = spawnEntities(document)
  const seen: Overlaps = new Map()
  const prober = {
    id: 999_999,
    box: { minX: -0.3, minY: 1, minZ: -0.3, maxX: 0.3, maxY: 2.7, maxZ: 0.3 },
  }
  const one = timed(9, () => {
    for (let i = 0; i < 60; i++) stepTriggers(world, document.blueprints, [prober], seen)
  })
  console.log(`${n(count)} ${ms(one / 60)} ${ms(one)}`)
}

/**
 * Scripts.
 *
 * The one section here that measures something with a *sandbox* in the middle,
 * so it measures two different things and both matter:
 *
 *  - what a hook call costs, which is what bounds how many scripted entities a
 *    level can hold;
 *  - how much work the interrupt handler lets one call do before cutting it
 *    off, which is where `SCRIPT_FUEL` comes from. That is a count of bytecode
 *    operations rather than a time, deliberately - see the note on the constant
 *    - so what is measured here is how many operations one unit of fuel buys.
 */
console.log('\n--- scripts, in the sandbox --------------------------------------')
{
  const engine = await loadScripts(scriptVariant)

  function scripted(count: number, body: string): { document: XpDocument } {
    const parsed = parseXp({
      format: 'xp/1',
      id: 'bench',
      name: 'Bench',
      packs: [{ id: 'proto' }],
      scripts: { bench: body },
      blueprints: { thing: { model: 'proto/Box_A', props: { hp: 10 }, script: 'bench' } },
      entities: Array.from({ length: count }, (_, i) => ({
        blueprint: 'thing',
        name: `e${i}`,
        x: (i % 40) * 2 - 40,
        y: 1,
        z: Math.floor(i / 40) * 2 - 40,
      })),
      world: { floorY: 0, placements: field(200), marks: [] },
    })
    if (!parsed.ok) throw new Error(parsed.problems.map((p) => `${p.at}: ${p.message}`).join('\n'))
    return { document: parsed.document }
  }

  // Shapes of hook, because "what does a script cost" has one answer and it is
  // *how many times it crosses the wasm boundary*. Nothing else in this table
  // moves the number much: a crossing is about 1.1us, and the work on either
  // side of one is a rounding error next to it.
  //
  // So the rows are arranged to be subtracted from each other. `empty` is what
  // a script costs when the host skips it entirely; `arithmetic only` adds the
  // dispatch, one call in per entity per frame; `one bare crossing` adds a
  // single trip and nothing else, which prices the trip. Everything below is
  // some number of trips, and the way to read any of them is: subtract
  // `arithmetic only`, divide by the entity count, divide by the crossings.
  //
  // The last two are what ordinary scripts look like. `moves itself` is one
  // crossing because `moveBy` lives in the host; spelled in the sandbox as
  // `moveTo(self.x + dt, ...)` it is four, and measured 3.17ms against 1.21ms
  // at five hundred entities.
  const shapes = [
    ['empty (no onTick)', `function onSpawn() {}`],
    ['arithmetic only', `let n = 0\nfunction onTick(dt) { n += dt }`],
    // The three rows below take the boundary apart. `world.tick` is the
    // cheapest call there is - a handle in, a number out, no lookup behind it -
    // so it prices one crossing on its own. `self.y` prices the same crossing
    // plus composing the parents; `self.y =` prices it plus rebuilding the box.
    // Subtract `arithmetic only` from any of them and divide by the entity
    // count, and what is left is what one trip over the boundary costs.
    ['one bare crossing', `let n = 0\nfunction onTick() { n = world.tick }`],
    ['one read of self.y', `let n = 0\nfunction onTick() { n = self.y }`],
    ['one write of self.y', `function onTick(dt) { self.y = 1 + dt }`],
    // The same one crossing again, with a *string* going over it instead of a
    // number. The gap between this row and the bare one is what it costs to
    // marshal a key, and it is the whole argument for interning them.
    ['one prop read', `let n = 0\nfunction onTick() { n = self.get('hp') }`],
    ['reads and writes self', `function onTick(dt) { self.y += dt * 0.1; self.add('n', 1) }`],
    // A thing that walks. One crossing since `moveBy` moved to the host, and
    // four before it - three reads of a position to add three numbers to it.
    ['moves itself', `function onTick(dt) { self.moveBy(dt, 0, 0) }`],
    [
      'looks another entity up',
      `function onTick() { const other = getEntityByName('e0'); if (other) self.set('d', self.distanceTo(other)) }`,
    ],
  ] as const

  console.log('entities   hook                         step x1     x60 (one second)')
  for (const count of [100, 500, 1000]) {
    for (const [label, body] of shapes) {
      const { document } = scripted(count, body)
      const opened = engine.open(document)
      if (!opened.ok) throw new Error(opened.problems.map((p) => `${p.at}: ${p.message}`).join('\n'))
      const world = spawnEntities(document)
      // One step first, so the instances exist and `onSpawn` is out of the way
      // - otherwise the first sample is measuring construction.
      opened.scripts.step(world, document.blueprints, 1 / 60)
      const one = timed(9, () => {
        for (let i = 0; i < 60; i++) opened.scripts.step(world, document.blueprints, 1 / 60)
      })
      console.log(`${n(count)}   ${label.padEnd(26)} ${ms(one / 60)} ${ms(one)}`)
      opened.scripts.close()
    }
  }

  /**
   * What one unit of fuel buys.
   *
   * `SCRIPT_FUEL` is a number of interrupt callbacks, and QuickJS decides how
   * often to make one. This is the only way to find out what that number means
   * in operations, and therefore whether the budget is generous or mean.
   */
  const { document } = scripted(1, `function onTick() { let n = 0; for (let i = 0; i < 1e9; i++) n += i }`)
  const opened = engine.open(document)
  if (!opened.ok) throw new Error('the fuel probe did not compile')
  const world = spawnEntities(document)
  const started = performance.now()
  opened.scripts.step(world, document.blueprints, 1 / 60)
  const cutoff = performance.now() - started
  const failed = opened.scripts.failures[0]
  console.log(
    `\na hook that never returns is cut off after ${ms(cutoff)} ` +
      `(${SCRIPT_FUEL} fuel), and reports "${failed?.message ?? 'nothing, which is a bug'}"`,
  )
  opened.scripts.close()
}

console.log('\n--- what the renderer is asked to do -----------------------------')
console.log('one draw call per mesh per distinct model, whatever the count')
{
  const file = path.join(ROOT, 'public', 'xp', 'xps', 'first-room.xp.json')
  const parsed = parseXp(JSON.parse(readFileSync(file, 'utf8')))
  if (parsed.ok) {
    const models = new Set(parsed.document.world.placements.map((p) => p.model))
    const entityModels = new Set(
      parsed.document.entities.map((e) => parsed.document.blueprints[e.blueprint]?.model),
    )
    console.log(
      `first-room: ${parsed.document.world.placements.length} placements over ` +
        `${models.size} models, ${parsed.document.entities.length} entities over ` +
        `${entityModels.size} models`,
    )
    console.log(
      `  so roughly ${models.size + entityModels.size} instanced meshes, not ` +
        `${parsed.document.world.placements.length + parsed.document.entities.length} objects`,
    )
  }
}

// Again on the way out: a run that started quiet and did not stay that way is
// otherwise indistinguishable from one that was quiet throughout.
machine()

console.log('')
