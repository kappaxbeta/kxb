import { describe, expect, test } from 'bun:test'
import { spawnEntities } from '../world/entities'
import { parseXp, XP_FORMAT, type XpDocument } from '../document/format'
import { MAX_SIGNALS, stepEmitted, fire } from '../rules/triggers'

/**
 * The `emit` verb, and the reader it did not have.
 *
 * What is pinned here is the part an author meets: a name said by one thing
 * reaches every thing listening for that name and no others, the sender is
 * `other`, a chain works, and a loop stops rather than hanging the tab.
 */

function doc(o: Record<string, unknown>): XpDocument {
  const p = parseXp({
    format: XP_FORMAT, id: 'x', name: 'X', packs: [{ id: 'proto' }],
    world: { floorY: 0, placements: [] }, ...o,
  })
  if (!p.ok) throw new Error(p.problems.map((q) => `${q.at}: ${q.message}`).join('\n'))
  return p.document
}

function problems(o: Record<string, unknown>): string[] {
  const p = parseXp({
    format: XP_FORMAT, id: 'x', name: 'X', packs: [{ id: 'proto' }],
    world: { floorY: 0, placements: [] }, ...o,
  })
  return p.ok ? [] : p.problems.map((q) => `${q.at}: ${q.message}`)
}

describe('a name said reaches whoever listened for it', () => {
  const document = doc({
    blueprints: {
      bell: { model: 'proto/Box_A', triggers: [{ on: 'pressed', key: 'use', do: [{ op: 'emit', event: 'ring' }] }] },
      gate: { model: 'proto/Primitive_Wall', props: { open: 0 },
        triggers: [{ on: 'emitted', event: 'ring', do: [{ op: 'setProp', key: 'open', value: 1 }] }] },
      other: { model: 'proto/Primitive_Wall', props: { open: 0 },
        triggers: [{ on: 'emitted', event: 'something-else', do: [{ op: 'setProp', key: 'open', value: 1 }] }] },
    },
    entities: [
      { blueprint: 'bell', name: 'bell', x: 0, y: 0, z: 0 },
      { blueprint: 'gate', name: 'gate', x: 4, y: 0, z: 0 },
      { blueprint: 'other', name: 'other', x: 8, y: 0, z: 0 },
    ],
  })

  test('the listener fires and the one listening for another name does not', () => {
    const world = spawnEntities(document)
    stepEmitted(world, document.blueprints, [{ event: 'ring', from: 0 }])
    expect(world.props.get(1)!.open).toBe(1)
    expect(world.props.get(2)!.open).toBe(0)
  })

  test('a name nobody listens for is not an error', () => {
    const world = spawnEntities(document)
    const { effects } = stepEmitted(world, document.blueprints, [{ event: 'nobody-cares', from: 0 }])
    expect(effects).toEqual([])
  })

  test('the emitter is `other`, so a rule can ask about who said it', () => {
    const d = doc({
      blueprints: {
        caller: { model: 'proto/Box_A', props: { rank: 7 } },
        guard: { model: 'proto/Box_A', props: { saw: 0 },
          triggers: [{ on: 'emitted', event: 'alarm', when: { of: 'other', prop: 'rank', is: '>=', value: 5 },
            do: [{ op: 'setProp', key: 'saw', value: 1 }] }] },
      },
      entities: [
        { blueprint: 'caller', name: 'caller', x: 0, y: 0, z: 0 },
        { blueprint: 'guard', name: 'guard', x: 4, y: 0, z: 0 },
      ],
    })
    const world = spawnEntities(d)
    stepEmitted(world, d.blueprints, [{ event: 'alarm', from: 0 }])
    expect(world.props.get(1)!.saw).toBe(1)
  })
})

describe('a signal a signal caused', () => {
  test('a chain runs to the end', () => {
    const d = doc({
      blueprints: {
        a: { model: 'proto/Box_A', triggers: [{ on: 'emitted', event: 'one', do: [{ op: 'emit', event: 'two' }] }] },
        b: { model: 'proto/Box_A', triggers: [{ on: 'emitted', event: 'two', do: [{ op: 'emit', event: 'three' }] }] },
        c: { model: 'proto/Box_A', props: { got: 0 },
          triggers: [{ on: 'emitted', event: 'three', do: [{ op: 'setProp', key: 'got', value: 1 }] }] },
      },
      entities: [
        { blueprint: 'a', name: 'a', x: 0, y: 0, z: 0 },
        { blueprint: 'b', name: 'b', x: 4, y: 0, z: 0 },
        { blueprint: 'c', name: 'c', x: 8, y: 0, z: 0 },
      ],
    })
    const world = spawnEntities(d)
    const { said } = stepEmitted(world, d.blueprints, [{ event: 'one', from: 0 }])
    expect(world.props.get(2)!.got).toBe(1)
    expect(said.map((s) => s.event)).toEqual(['one', 'two', 'three'])
  })

  test('a rule that emits what it listens for stops instead of hanging', () => {
    const d = doc({
      blueprints: {
        loop: { model: 'proto/Box_A', props: { n: 0 },
          triggers: [{ on: 'emitted', event: 'ping',
            do: [{ op: 'addProp', key: 'n', value: 1 }, { op: 'emit', event: 'ping' }] }] },
      },
      entities: [{ blueprint: 'loop', name: 'loop', x: 0, y: 0, z: 0 }],
    })
    const world = spawnEntities(d)
    const { effects } = stepEmitted(world, d.blueprints, [{ event: 'ping', from: 0 }])
    expect(world.props.get(0)!.n).toBeLessThanOrEqual(MAX_SIGNALS)
    expect(world.props.get(0)!.n).toBeGreaterThan(0)
    expect(effects.length).toBeGreaterThan(0)
  })
})

describe('the parser refuses what would silently do nothing', () => {
  const withTrigger = (t: unknown) => ({
    blueprints: { b: { model: 'proto/Box_A', triggers: [t] } },
    entities: [{ blueprint: 'b', x: 0, y: 0, z: 0 }],
  })

  test('an emitted trigger with no name', () => {
    expect(problems(withTrigger({ on: 'emitted', do: [{ op: 'score', amount: 1 }] })))
      .toContain('blueprints.b.triggers[0].event: an emitted trigger needs the name it listens for')
  })

  test('an emitted trigger with an empty name', () => {
    expect(problems(withTrigger({ on: 'emitted', event: '', do: [{ op: 'score', amount: 1 }] })))
      .toContain('blueprints.b.triggers[0].event: an emitted trigger needs the name it listens for')
  })

  test('some other event carrying an event name', () => {
    expect(problems(withTrigger({ on: 'enter', event: 'ring', do: [{ op: 'score', amount: 1 }] })))
      .toContain('blueprints.b.triggers[0].event: only an emitted trigger has an event name, not enter')
  })

  test('a good one parses and keeps its name', () => {
    const d = doc(withTrigger({ on: 'emitted', event: 'ring', do: [{ op: 'score', amount: 1 }] }))
    expect(d.blueprints.b!.triggers![0]).toMatchObject({ on: 'emitted', event: 'ring' })
  })
})

describe('the name is matched, not merely the event', () => {
  test('fire with no name offered reaches no emitted trigger', () => {
    const d = doc({
      blueprints: { b: { model: 'proto/Box_A', props: { n: 0 },
        triggers: [{ on: 'emitted', event: 'ring', do: [{ op: 'addProp', key: 'n', value: 1 }] }] } },
      entities: [{ blueprint: 'b', x: 0, y: 0, z: 0 }],
    })
    const world = spawnEntities(d)
    fire(world, d.blueprints, 0, 'emitted', null)
    expect(world.props.get(0)!.n).toBe(0)
  })
})
