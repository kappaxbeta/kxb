import { beforeAll, describe, expect, test } from 'bun:test'
import { MAX_LIGHT_ANGLE, MAX_LIGHT_INTENSITY, MAX_LIGHT_RANGE, parseXp } from '../document/format'
import { spawnEntities, entityByName } from '../world/entities'
import { loadScripts, type ScriptEngine } from '../rules/script'
import variant from '@jitl/quickjs-wasmfile-release-sync'

/**
 * A lamp a level can put down, and a script can dim.
 *
 * The engine half only. Whether a `pointLight` actually appears is
 * `_runtime/lights.tsx`'s and can only be seen by looking; what is provable
 * here is that the document says it, the entity carries it, and a script
 * writing a number changes it.
 */

const level = (light: unknown) => ({
  format: 'xp/1',
  id: 'lamp',
  name: 'Lamp',
  packs: [{ id: 'proto' }],
  world: { floorY: 0, ground: true, placements: [], marks: [] },
  blueprints: {
    torch: { model: 'proto/Primitive_Wall', ...(light === undefined ? {} : { light }) },
  },
  entities: [
    { blueprint: 'torch', name: 'one', x: 2, y: 1, z: 3 },
    { blueprint: 'torch', name: 'two', x: 8, y: 1, z: 3 },
  ],
})

const parsed = (light: unknown) => {
  const result = parseXp(level(light))
  if (!result.ok) throw new Error(JSON.stringify(result.problems))
  return result.document
}

describe('a blueprint that glows', () => {
  test('an empty block is a working lamp, because that is what somebody types first', () => {
    expect(parsed({}).blueprints.torch!.light).toEqual({
      colour: 0xffffff,
      intensity: 12,
      range: 14,
      kind: 'point',
      angle: 30,
    })
  })

  test('and every field can be said', () => {
    expect(
      parsed({ colour: 0xff8800, intensity: 30, range: 6, kind: 'spot', angle: 45 }).blueprints
        .torch!.light,
    ).toEqual({
      colour: 0xff8800,
      intensity: 30,
      range: 6,
      kind: 'spot',
      angle: 45,
    })
  })

  test('a blueprint with no block has no lamp at all', () => {
    expect(parsed(undefined).blueprints.torch!.light).toBeUndefined()
  })

  /**
   * Both ends, because both ends are typos rather than designs — and the person
   * who typed one will be looking at a white screen rather than at the field.
   */
  test('a number outside the bounds is refused rather than clamped', () => {
    for (const bad of [
      { intensity: -1 },
      { intensity: MAX_LIGHT_INTENSITY + 1 },
      { range: -1 },
      { range: MAX_LIGHT_RANGE + 1 },
      { intensity: Number.NaN },
      { angle: -1 },
      { angle: MAX_LIGHT_ANGLE + 1 },
    ]) {
      expect(parseXp(level(bad)).ok).toBe(false)
    }
  })

  test('and a colour has to be a whole one inside the cube', () => {
    for (const bad of [{ colour: -1 }, { colour: 0x1000000 }, { colour: 1.5 }, { colour: 'red' }]) {
      expect(parseXp(level(bad)).ok).toBe(false)
    }
  })

  test('the bounds are inclusive, so the brightest legal lamp parses', () => {
    expect(
      parsed({
        intensity: MAX_LIGHT_INTENSITY,
        range: MAX_LIGHT_RANGE,
        colour: 0xffffff,
        angle: MAX_LIGHT_ANGLE,
      }).blueprints.torch!.light,
    ).toEqual({
      colour: 0xffffff,
      intensity: MAX_LIGHT_INTENSITY,
      range: MAX_LIGHT_RANGE,
      kind: 'point',
      angle: MAX_LIGHT_ANGLE,
    })
  })

  /**
   * `kind` reuses the entity's own `rotation`/`pitch` for aiming rather than
   * inventing a second way to say which way something faces — see the note on
   * `Light` in ./blueprints. What is genuinely new here is the word itself.
   */
  test('a lamp can be a cone instead of a bulb', () => {
    expect(parsed({ kind: 'spot' }).blueprints.torch!.light!.kind).toBe('spot')
  })

  test('a kind that is not one of the two words is refused', () => {
    expect(parseXp(level({ kind: 'flood' })).ok).toBe(false)
  })

  /**
   * Absent means `'point'`, which is the whole compatibility argument: every
   * lamp already on disk was written before `kind` existed and has to keep
   * meaning exactly what it meant.
   */
  test('a document from before this field still means "point"', () => {
    expect(parsed({ colour: 0xff0000 }).blueprints.torch!.light!.kind).toBe('point')
  })
})

describe('the entity carries its own copy', () => {
  test('seeded from the blueprint at spawn', () => {
    const world = spawnEntities(
      parsed({ colour: 0xff0000, intensity: 5, range: 9, kind: 'spot', angle: 20 }),
    )

    const one = entityByName(world, 'one')!
    expect(world.light.get(one)).toEqual({
      colour: 0xff0000,
      intensity: 5,
      range: 9,
      kind: 'spot',
      angle: 20,
    })
  })

  /**
   * The whole reason the row is per entity: two torches of the same kind are
   * two lamps, and turning one down must not reach the other.
   */
  test('and two of a kind are not the same lamp', () => {
    const world = spawnEntities(parsed({ intensity: 5 }))

    const one = entityByName(world, 'one')!
    const two = entityByName(world, 'two')!
    world.light.get(one)!.intensity = 0

    expect(world.light.get(one)!.intensity).toBe(0)
    expect(world.light.get(two)!.intensity).toBe(5)
  })

  test('a blueprint with no block puts nothing in the map', () => {
    expect(spawnEntities(parsed(undefined)).light.size).toBe(0)
  })
})

/**
 * "Animatable in scripts", which was the point of putting the numbers on the
 * entity rather than leaving them on the blueprint.
 */
describe('a script working a lamp', () => {
  let engine: ScriptEngine
  beforeAll(async () => {
    engine = await loadScripts(variant)
  })

  /**
   * "No light block at all", as something other than `undefined`.
   *
   * A default parameter fires *on* `undefined`, so `run(src, undefined)` was
   * quietly asking for the default lamp rather than for no lamp — which is why
   * the two tests below passed a torch that was lit and read 5 out of it.
   */
  const NONE = Symbol('no light')

  /**
   * Open a document whose torch runs `source`, step one frame, hand it back.
   *
   * Closed before returning. The world is plain JS the bridge has already
   * written into, so it outlives the interpreter that filled it - and leaving
   * the runtime open instead leaks a QuickJS runtime and context per call into
   * the one wasm module the whole file shares, which is a wall the last test in
   * the file walks into rather than the one that leaked.
   */
  const run = (
    source: string,
    light: unknown = { intensity: 5, range: 9, colour: 0x112233 },
  ) => {
    const base = parsed(light === NONE ? undefined : light)
    const document = {
      ...base,
      scripts: { dim: source },
      blueprints: { torch: { ...base.blueprints.torch!, script: 'dim' } },
    }

    const opened = engine.open(document)
    if (!opened.ok) throw new Error(JSON.stringify(opened.problems))

    const world = spawnEntities(document)
    world.tick += 1
    opened.scripts.step(world, document.blueprints, 1 / 60)
    opened.scripts.close()
    return { world, id: entityByName(world, 'one')! }
  }

  test('reads what the document set', () => {
    const { world, id } = run('function onTick() { self.set("saw", self.intensity) }')
    expect(world.props.get(id)!.saw).toBe(5)
  })

  test('and writes it, which is a lamp going out', () => {
    const { world, id } = run('function onTick() { self.intensity = 0 }')
    expect(world.light.get(id)!.intensity).toBe(0)
  })

  test('range and colour too', () => {
    const { world, id } = run('function onTick() { self.range = 3; self.colour = 0xff0000 }')
    expect(world.light.get(id)!.range).toBe(3)
    expect(world.light.get(id)!.colour).toBe(0xff0000)
  })

  /**
   * Readable and writable whichever `kind` the blueprint chose, same as the
   * other three - `kind` itself is the one field a script cannot touch, so
   * a spot cannot be turned into a bulb mid-level and a script narrowing the
   * cone never has to check which shape it is aiming.
   */
  test('and the cone too', () => {
    const { world, id } = run(
      'function onTick() { self.angle = 5 }',
      { intensity: 5, range: 9, colour: 0x112233, kind: 'spot', angle: 45 },
    )
    expect(world.light.get(id)!.angle).toBe(5)
  })

  /**
   * Clamped rather than refused, unlike the parser: a fade is a loop writing a
   * number every frame, and the step that overshoots by a thousandth should
   * land dark rather than be thrown away.
   */
  test('a curve that overshoots lands on the bound instead of being dropped', () => {
    const { world, id } = run('function onTick() { self.intensity = -0.001 }')
    expect(world.light.get(id)!.intensity).toBe(0)

    const bright = run(`function onTick() { self.intensity = ${MAX_LIGHT_INTENSITY * 10} }`)
    expect(bright.world.light.get(bright.id)!.intensity).toBe(MAX_LIGHT_INTENSITY)

    const wide = run(`function onTick() { self.angle = ${MAX_LIGHT_ANGLE * 10} }`)
    expect(wide.world.light.get(wide.id)!.angle).toBe(MAX_LIGHT_ANGLE)
  })

  test('a fractional colour is rounded rather than left for the renderer to truncate', () => {
    const { world, id } = run('function onTick() { self.colour = 100.6 }')
    expect(world.light.get(id)!.colour).toBe(101)
  })

  /**
   * A script may work a lamp; it may not invent one. Otherwise a level would
   * have lights in it that nothing in the file mentions, and the count is the
   * thing the cap exists to keep visible.
   */
  test('and cannot light something the document never said was a lamp', () => {
    const { world, id } = run('function onTick() { self.intensity = 40 }', NONE)
    expect(world.light.has(id)).toBe(false)
  })

  test('reading a lamp that is not there is zero rather than a throw', () => {
    const { world, id } = run('function onTick() { self.set("saw", self.intensity) }', NONE)
    expect(world.props.get(id)!.saw).toBe(0)
  })
})
