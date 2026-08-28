import { describe, expect, test } from 'bun:test'
import { parseXp } from '../document/format'
import {
  PLAYER_ID,
  blockersOf,
  emptyWorld,
  entityByName,
  spawnEntities,
  spawnPlayer,
  despawn,
  type EntityWorld,
} from '../world/entities'
import { applyVerbs } from '../rules/verbs'
import { holds, stepTriggers, type Overlaps } from '../rules/triggers'
import { applyShare } from '../net/sharing'

/**
 * An object knowing it is being carried.
 *
 * Asked for as two things that turned out to be one: *a trigger for an object
 * to know that it is held*, and *just state, so scripts or behaviour can look
 * and react*. The state is `world.parent` (or a peer's claim), the trigger is
 * the edge, and neither stores a second copy of the other.
 */

const level = (triggers: unknown) => {
  const parsed = parseXp({
    format: 'xp/1',
    id: 'hold',
    name: 'Hold',
    packs: [{ id: 'proto' }, { id: 'dummy' }],
    world: { floorY: 0, ground: true, placements: [], marks: [] },
    player: { blueprint: 'body' },
    blueprints: {
      body: { model: 'dummy/Dummy' },
      flag: { model: 'proto/Primitive_Cube_Small', collider: 'none', triggers },
    },
    entities: [{ blueprint: 'flag', name: 'flag', x: 0, y: 0, z: 0 }],
  })
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.problems))
  return parsed.document
}

const started = (triggers: unknown = []) => {
  const document = level(triggers)
  const world = spawnEntities(document)
  spawnPlayer(world, document, { x: 0, y: 1, z: 0 })
  return { document, world, flag: entityByName(world, 'flag')! }
}

/** One pass of the trigger step, with nothing overlapping anything. */
const step = (world: EntityWorld, document: ReturnType<typeof level>, seen: Overlaps) =>
  stepTriggers(world, document.blueprints, [], seen)

const pickUp = (world: EntityWorld, document: ReturnType<typeof level>, flag: number) =>
  applyVerbs(world, document.blueprints, [{ op: 'carry', target: 'self' }], {
    self: flag,
    other: PLAYER_ID,
  })

describe('the state, which is the world rather than a property', () => {
  test('a thing on the floor is not held', () => {
    const { world, flag } = started()
    expect(holds(world, flag, { prop: 'held', is: '==', value: 1 })).toBe(false)
    expect(holds(world, flag, { prop: 'held', is: '==', value: 0 })).toBe(true)
  })

  test('and one in your hands is', () => {
    const { world, document, flag } = started()
    pickUp(world, document, flag)
    expect(holds(world, flag, { prop: 'held', is: '==', value: 1 })).toBe(true)
  })

  /**
   * The reason it is derived rather than stored: there is only one copy, so
   * every way of letting go clears it without anything being told.
   */
  test('every way of putting it down reads as not held', () => {
    for (const verb of [
      { op: 'drop', target: 'self' },
      { op: 'unhand', target: 'other' },
    ] as const) {
      const { world, document, flag } = started()
      pickUp(world, document, flag)
      applyVerbs(world, document.blueprints, [verb], { self: flag, other: PLAYER_ID })
      expect(holds(world, flag, { prop: 'held', is: '==', value: 1 })).toBe(false)
    }
  })

  /**
   * "Also send it in the network." A peer's claim has to read the same as your
   * own hands, or a rule about a carried flag is true on one screen and false
   * on the other three.
   */
  test('a flag in a peer’s hands is held on this screen too', () => {
    const { world, flag } = started()
    applyShare(world, { off: [], hold: [flag] }, PLAYER_ID, 'peer-1')

    expect(world.heldBy.get(flag)).toBe('peer-1')
    expect(holds(world, flag, { prop: 'held', is: '==', value: 1 })).toBe(true)
  })

  test('and stops being held when they stop claiming it', () => {
    const { world, flag } = started()
    applyShare(world, { off: [], hold: [flag] }, PLAYER_ID, 'peer-1')
    applyShare(world, { off: [], hold: [] }, PLAYER_ID, 'peer-1')

    expect(world.heldBy.has(flag)).toBe(false)
    expect(holds(world, flag, { prop: 'held', is: '==', value: 1 })).toBe(false)
  })

  test('and another peer letting go of their own things leaves it alone', () => {
    const { world, flag } = started()
    applyShare(world, { off: [], hold: [flag] }, PLAYER_ID, 'peer-1')
    applyShare(world, { off: [], hold: [] }, PLAYER_ID, 'peer-2')

    expect(world.heldBy.get(flag)).toBe('peer-1')
  })

  test('a blueprint may not declare the name, because the world answers it', () => {
    const parsed = parseXp({
      format: 'xp/1',
      id: 'hold',
      name: 'Hold',
      packs: [{ id: 'proto' }],
      world: { floorY: 0, ground: true, placements: [], marks: [] },
      blueprints: { flag: { model: 'proto/Primitive_Cube_Small', props: { held: 1 } } },
      entities: [],
    })
    expect(parsed.ok).toBe(false)
  })
})

describe('the trigger, which is the edge', () => {
  const RULES = [
    { on: 'held', do: [{ op: 'setProp', target: 'self', key: 'lit', value: 1 }] },
    { on: 'dropped', do: [{ op: 'setProp', target: 'self', key: 'lit', value: 0 }] },
  ]

  test('fires the frame it is picked up, and not again after', () => {
    const { world, document, flag } = started(RULES)
    const seen: Overlaps = new Map()

    step(world, document, seen)
    expect(world.props.get(flag)!.lit).toBeUndefined()

    pickUp(world, document, flag)
    step(world, document, seen)
    expect(world.props.get(flag)!.lit).toBe(1)

    // Held is not an event. A rule that fired every frame while carried would
    // be a rule nobody could use for "the moment it was taken".
    world.props.get(flag)!.lit = 5
    step(world, document, seen)
    expect(world.props.get(flag)!.lit).toBe(5)
  })

  test('and again when it is put down', () => {
    const { world, document, flag } = started(RULES)
    const seen: Overlaps = new Map()

    pickUp(world, document, flag)
    step(world, document, seen)
    applyVerbs(world, document.blueprints, [{ op: 'drop', target: 'self' }], {
      self: flag,
      other: PLAYER_ID,
    })
    step(world, document, seen)

    expect(world.props.get(flag)!.lit).toBe(0)
  })

  /**
   * The same rule `exit` follows: `despawn` already said so, and firing this as
   * well would run a rule twice on one event.
   */
  test('a thing that stopped existing was not put down', () => {
    const { world, document, flag } = started(RULES)
    const seen: Overlaps = new Map()

    pickUp(world, document, flag)
    step(world, document, seen)
    world.props.get(flag)!.lit = 5

    despawn(world, flag)
    step(world, document, seen)

    expect(world.props.get(flag)!.lit).toBe(5)
  })

  test('the carrier arrives as `other`, so a rule can act on whoever took it', () => {
    const { world, document, flag } = started([
      { on: 'held', do: [{ op: 'setProp', target: 'other', key: 'carrying', value: 1 }] },
    ])
    const seen: Overlaps = new Map()

    pickUp(world, document, flag)
    step(world, document, seen)

    expect(world.props.get(PLAYER_ID)!.carrying).toBe(1)
  })

  /**
   * The other half of "send it in the network": a flag that should glow when
   * carried has to glow on all four screens, not only the carrier's.
   */
  test('a peer picking it up fires it here as well', () => {
    const { world, document, flag } = started(RULES)
    const seen: Overlaps = new Map()

    step(world, document, seen)
    applyShare(world, { off: [], hold: [flag] }, PLAYER_ID, 'peer-1')
    step(world, document, seen)

    expect(world.props.get(flag)!.lit).toBe(1)
  })

  test('and their letting go fires the other one', () => {
    const { world, document, flag } = started(RULES)
    const seen: Overlaps = new Map()

    applyShare(world, { off: [], hold: [flag] }, PLAYER_ID, 'peer-1')
    step(world, document, seen)
    applyShare(world, { off: [], hold: [] }, PLAYER_ID, 'peer-1')
    step(world, document, seen)

    expect(world.props.get(flag)!.lit).toBe(0)
  })

  test('a level where nothing is ever carried pays nothing and fires nothing', () => {
    const { world, document } = started(RULES)
    const seen: Overlaps = new Map()
    expect(step(world, document, seen)).toEqual([])
    expect(step(world, document, seen)).toEqual([])
  })
})

describe('and a thing in your hands is not a wall', () => {
  /**
   * The bug a board game found, and it looked like the level was frozen.
   *
   * A carried entity sits at its carrier's socket and travels with them, so its
   * box is always exactly where the carrier is. The character controller stops
   * you at boxes - so the moment somebody picked a piece up they were pressed
   * against a wall they were carrying, in every direction, and could not walk.
   * Nothing errored and nothing in the document was wrong.
   */
  const world = (): EntityWorld => {
    const one = emptyWorld()
    for (const id of [1, 2]) {
      one.alive.add(id)
      one.blueprint.set(id, 'crate')
      one.position.set(id, { x: id, y: 0, z: 0 })
      one.box.set(id, { minX: id - 0.5, maxX: id + 0.5, minY: 0, maxY: 1, minZ: -0.5, maxZ: 0.5 })
    }
    return one
  }

  test('a loose one blocks, which is what a crate is for', () => {
    expect(blockersOf(world())).toHaveLength(2)
  })

  test('and one you are carrying does not', () => {
    const one = world()
    one.parent.set(1, { id: PLAYER_ID })
    expect(blockersOf(one).map((box) => box.minX)).toEqual([1.5])
  })

  test('but a rider somebody drew into a kart still does', () => {
    // Authored composition uses the same row, and that child is a thing
    // somebody put there rather than a thing anybody picked up.
    const one = world()
    one.parent.set(1, { id: 2 })
    expect(blockersOf(one)).toHaveLength(2)
  })

  test('nor one in a peer s hands, so it is not a wall on one screen only', () => {
    const one = world()
    one.heldBy.set(1, 'somebody')
    expect(blockersOf(one)).toHaveLength(1)
  })

  test('but its box is still there, so a rule about touching it still fires', () => {
    // The distinction this rests on: `collide` reads `world.box` directly, so a
    // flag carried across its own home field still counts itself home.
    const one = world()
    one.parent.set(1, { id: 99 })
    expect(one.box.has(1)).toBe(true)
  })
})
