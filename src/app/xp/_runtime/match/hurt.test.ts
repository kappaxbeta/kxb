import { describe, expect, test } from 'bun:test'
import { hurtIn } from '@/app/xp/_runtime/match/hurt'
import { parseXp, XP_FORMAT, type XpDocument } from '@kxb/xp'
import { spawnEntities } from '@kxb/xp/engine'

/**
 * Which things get a bar over them.
 *
 * The whole feature exists because hitting something gave no feedback: the
 * number went down and nothing on screen said so. So the interesting cases are
 * all about *not* drawing one — an untouched level, a thing that opted out, a
 * thing with no health at all — because a bar over everything is decoration and
 * a bar over the wrong thing is worse than none.
 */

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

const LEVEL = (extra: Record<string, unknown> = {}) =>
  doc({
    blueprints: {
      crate: { model: 'proto/Box_A', collider: 'auto', props: { hp: 40 } },
      rock: { model: 'proto/Barrel_A', collider: 'auto' },
      ...extra,
    },
    entities: [
      { blueprint: 'crate', name: 'one', x: 0, y: 0, z: 0 },
      { blueprint: 'crate', name: 'two', x: 2, y: 0, z: 0 },
      { blueprint: 'rock', name: 'stone', x: 4, y: 0, z: 0 },
    ],
  })

describe('what is hurt', () => {
  test('an untouched level draws nothing', () => {
    // The property that makes this feedback rather than a health inspection.
    const document = LEVEL()
    expect(hurtIn(spawnEntities(document), document.blueprints)).toEqual([])
  })

  test('a hit one is a fraction of its own blueprint', () => {
    const document = LEVEL()
    const world = spawnEntities(document)
    world.props.get(0)!.hp = 10

    expect(hurtIn(world, document.blueprints)).toEqual([{ id: 0, left: 0.25 }])
  })

  test('a thing with no health has nothing to draw', () => {
    const document = LEVEL()
    const world = spawnEntities(document)
    // The rock's blueprint declares no `hp`, so there is no ceiling to be a
    // fraction of — and inventing one would put a bar over scenery.
    expect(hurtIn(world, document.blueprints).some((one) => one.id === 2)).toBe(false)
  })

  test('a blueprint can turn it off', () => {
    const document = LEVEL({
      lock: { model: 'proto/Door_A', collider: 'auto', props: { hp: 20 }, bar: false },
    })
    const world = spawnEntities(
      doc({
        blueprints: document.blueprints,
        entities: [{ blueprint: 'lock', name: 'door', x: 0, y: 0, z: 0 }],
      }),
    )
    world.props.get(0)!.hp = 5

    expect(hurtIn(world, document.blueprints)).toEqual([])
  })

  test('something on zero is drawn empty for the frame before it goes', () => {
    // The frame that reads as "that did it".
    const document = LEVEL()
    const world = spawnEntities(document)
    world.props.get(0)!.hp = 0
    expect(hurtIn(world, document.blueprints)).toEqual([{ id: 0, left: 0 }])
  })

  test('below zero is empty rather than inside out', () => {
    const document = LEVEL()
    const world = spawnEntities(document)
    world.props.get(0)!.hp = -12
    expect(hurtIn(world, document.blueprints)[0]?.left).toBe(0)
  })

  test('something already gone is not drawn', () => {
    const document = LEVEL()
    const world = spawnEntities(document)
    world.props.get(0)!.hp = 5
    world.alive.delete(0)
    expect(hurtIn(world, document.blueprints)).toEqual([])
  })

  test('two hurt things come back in a stable order', () => {
    // Nothing on screen depends on it — every bar is placed by the thing it
    // belongs to — but a stable order means React keeps one mesh per thing.
    const document = LEVEL()
    const world = spawnEntities(document)
    world.props.get(1)!.hp = 20
    world.props.get(0)!.hp = 30

    expect(hurtIn(world, document.blueprints).map((one) => one.id)).toEqual([0, 1])
  })
})
