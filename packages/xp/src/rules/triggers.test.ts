import { describe, expect, test } from 'bun:test'
import type { Blueprint } from '../document/blueprints'
import {
  activate,
  blockersOf,
  bodiesFor,
  deactivate,
  despawn,
  emptyWorld,
  entityByName,
  PLAYER_ID,
  spawnEntities,
  spawnPlayer,
  stepReturns,
} from '../world/entities'
import { parseXp, XP_FORMAT, type XpDocument } from '../document/format'
import {
  damage,
  fire,
  holds,
  isDataRef,
  releasedKeys,
  stepSpawned,
  stepTriggers,
  valueOf,
  type Overlaps,
} from './triggers'
import { applyVerb, applyVerbs, RUNTIME_ID_BASE } from './verbs'

/**
 * The rules, driven directly. Everything here runs without a browser, a canvas
 * or a clock - which is the whole reason the verbs change the world
 * synchronously and hand back effects instead of performing them.
 */

const CRATE: Blueprint = {
  model: 'proto/Box_A',
  collider: 'auto',
  tags: ['breakable'],
  props: { hp: 10 },
  sockets: {},
  triggers: [
    {
      on: 'damaged',
      when: { prop: 'hp', is: '<=', value: 0 },
      do: [
        { op: 'spawn', blueprint: 'debris', dx: 0, dy: 0.2, dz: 0 },
        { op: 'score', amount: 5 },
        { op: 'despawn', target: 'self' },
      ],
    },
  ],
}

const DEBRIS: Blueprint = {
  model: 'proto/target_pieces_A',
  collider: 'none',
  tags: [],
  props: {},
  sockets: {},
  triggers: [],
}

const COIN: Blueprint = {
  model: 'proto/Coin_A',
  collider: 'none',
  tags: ['pickup'],
  props: { value: 5 },
  sockets: {},
  triggers: [
    { on: 'enter', do: [{ op: 'score', amount: 5 }, { op: 'despawn', target: 'self' }] },
  ],
}

function doc(overrides: Record<string, unknown> = {}): XpDocument {
  const parsed = parseXp({
    format: XP_FORMAT,
    id: 'x',
    name: 'X',
    packs: [{ id: 'proto' }],
    world: { floorY: 0, placements: [], marks: [] },
    ...overrides,
  })
  if (!parsed.ok) throw new Error(parsed.problems.map((p) => `${p.at}: ${p.message}`).join('\n'))
  return parsed.document
}

const BLUEPRINTS = { crate: CRATE, debris: DEBRIS, coin: COIN }

describe('conditions', () => {
  const world = spawnEntities(
    doc({ blueprints: BLUEPRINTS, entities: [{ blueprint: 'crate', x: 0, y: 0, z: 0 }] }),
  )

  test('each comparison means what it says', () => {
    expect(holds(world, 0, { prop: 'hp', is: '==', value: 10 })).toBe(true)
    expect(holds(world, 0, { prop: 'hp', is: '!=', value: 10 })).toBe(false)
    expect(holds(world, 0, { prop: 'hp', is: '>', value: 9 })).toBe(true)
    expect(holds(world, 0, { prop: 'hp', is: '<=', value: 0 })).toBe(false)
  })

  test('no condition is always true', () => {
    expect(holds(world, 0, undefined)).toBe(true)
  })

  test('a missing property reads as zero, not as "skip"', () => {
    // A rule that never fires looks correct and silently does nothing, which is
    // the worse of the two failures.
    expect(holds(world, 0, { prop: 'ammo', is: '==', value: 0 })).toBe(true)
  })
})

/**
 * A condition about whoever set the rule off.
 *
 * The field capture the flag was blocked on: "the flag reached our base" is a
 * rule on the base asking about the thing that just walked into it, and until
 * `of` there was no way to ask.
 */
describe('a condition about the other one', () => {
  /** A base that scores when something carrying a flag walks into it. */
  const CAPTURE = () =>
      doc({
        blueprints: {
          ...BLUEPRINTS,
          base: {
            model: 'proto/Primitive_Floor',
            collider: 'none',
            tags: [],
            props: {},
            sockets: {},
            triggers: [
              {
                on: 'enter',
                when: { of: 'other', prop: 'flag', is: '==', value: 1 },
                do: [{ op: 'score', amount: 1 }],
              },
            ],
          },
        },
        entities: [
          { blueprint: 'base', x: 0, y: 0, z: 0 },
          { blueprint: 'crate', x: 4, y: 0, z: 0 },
        ],
      })

  const two = () => spawnEntities(CAPTURE())

  test('reads the other one’s properties rather than its own', () => {
    const world = two()
    // The base has no `flag` of its own; the crate is given one.
    world.props.set(1, { flag: 1 })
    expect(holds(world, 0, { of: 'other', prop: 'flag', is: '==', value: 1 }, 1)).toBe(true)
    expect(holds(world, 0, { prop: 'flag', is: '==', value: 1 }, 1)).toBe(false)
  })

  test('and a rule fires on it, which is the whole point', () => {
    const document = CAPTURE()
    const world = spawnEntities(document)
    const blueprints = bodiesFor(document)

    // Nobody is carrying anything yet: walking in scores nothing.
    expect(fire(world, blueprints, 0, 'enter', 1)).toEqual([])

    // Now the crate is carrying the flag, said the way the format already says
    // facts about a thing - a property on it, which a verb can write.
    world.props.set(1, { flag: 1 })
    expect(fire(world, blueprints, 0, 'enter', 1)).toEqual([
      { kind: 'score', amount: 1, by: 1 },
    ])
  })

  test('nobody set it off, so a condition about them is false', () => {
    // Not true-for-want-of-a-subject: a rule that fires because its subject is
    // missing is the failure worth refusing, and `spawned` and `finished` both
    // arrive with nobody behind them.
    const world = two()
    expect(holds(world, 0, { of: 'other', prop: 'flag', is: '==', value: 1 }, null)).toBe(false)
  })

  test('an explicit self is what it always was', () => {
    const world = two()
    world.props.set(0, { flag: 1 })
    expect(holds(world, 0, { of: 'self', prop: 'flag', is: '==', value: 1 }, 1)).toBe(true)
  })
})

describe('breaking a crate', () => {
  function fresh() {
    return spawnEntities(
      doc({ blueprints: BLUEPRINTS, entities: [{ blueprint: 'crate', x: 2, y: 1, z: 0 }] }),
    )
  }

  test('a hit that does not kill it changes nothing else', () => {
    const world = fresh()
    const effects = damage(world, BLUEPRINTS, 0, 4)
    expect(world.props.get(0)?.hp).toBe(6)
    expect(world.alive.has(0)).toBe(true)
    expect(effects).toEqual([])
  })

  test('the killing blow spawns debris, scores, and removes it', () => {
    const world = fresh()
    const effects = damage(world, BLUEPRINTS, 0, 10, 7)

    expect(world.alive.has(0)).toBe(false)
    expect(effects.map((e) => e.kind)).toEqual(['spawned', 'score', 'died'])
    // The score is credited to whoever landed it, not to the crate.
    expect(effects.find((e) => e.kind === 'score')).toMatchObject({ amount: 5, by: 7 })
  })

  test('the health changes before the rule reads it', () => {
    // The order is the whole reason `damage` is a function and not a verb: a
    // rule asking `hp <= 0` has to be asking about the hit that just landed.
    const world = fresh()
    damage(world, BLUEPRINTS, 0, 10)
    expect(world.props.get(0)?.hp).toBe(0)
  })

  test('health stops at zero rather than going negative', () => {
    const world = fresh()
    damage(world, BLUEPRINTS, 0, 999)
    expect(world.props.get(0)?.hp).toBe(0)
  })

  test('debris takes a runtime id, above anything the document authored', () => {
    const world = fresh()
    damage(world, BLUEPRINTS, 0, 10)
    const spawned = [...world.alive]
    expect(spawned).toHaveLength(1)
    expect(spawned[0]).toBeGreaterThanOrEqual(RUNTIME_ID_BASE)
  })

  test('a crate that broke stops blocking on the same tick', () => {
    const world = fresh()
    expect(blockersOf(world)).toHaveLength(1)
    damage(world, BLUEPRINTS, 0, 10)
    // Only the debris is left, and debris is walk-through.
    expect(blockersOf(world)).toHaveLength(0)
  })

  test('hitting something already broken does nothing', () => {
    const world = fresh()
    damage(world, BLUEPRINTS, 0, 10)
    expect(damage(world, BLUEPRINTS, 0, 10)).toEqual([])
  })

  test('a rule stops once its own entity is gone', () => {
    // Anything after a despawn would be writing onto a corpse, and "damage then
    // despawn then something" is the shape almost every rule takes.
    const world = fresh()
    const chatty: Blueprint = {
      ...CRATE,
      triggers: [
        {
          on: 'damaged',
          do: [{ op: 'despawn', target: 'self' }, { op: 'setProp', key: 'hp', value: 99, target: 'self' }],
        },
      ],
    }
    damage(world, { ...BLUEPRINTS, crate: chatty }, 0, 1)
    expect(world.props.get(0)?.hp).not.toBe(99)
  })
})

describe('walking into a pickup', () => {
  const document = doc({
    blueprints: BLUEPRINTS,
    entities: [{ blueprint: 'coin', x: 0, y: 1, z: 0 }],
  })

  const PLAYER = 500
  const boxAt = (x: number) => ({
    id: PLAYER,
    box: { minX: x - 0.3, minY: 1, minZ: -0.3, maxX: x + 0.3, maxY: 2.7, maxZ: 0.3 },
  })

  test('enter fires once, not every frame you stand there', () => {
    /**
     * The bug this shape exists to prevent: recomputing "am I inside" each tick
     * and firing on the answer means a pickup you stand on is collected sixty
     * times a second, and nobody notices until they count their coins.
     */
    const world = spawnEntities(document)
    const seen: Overlaps = new Map()

    const first = stepTriggers(world, BLUEPRINTS, [boxAt(0)], seen)
    expect(first.filter((e) => e.kind === 'score')).toHaveLength(1)

    // It despawned itself, so standing there again finds nothing.
    const second = stepTriggers(world, BLUEPRINTS, [boxAt(0)], seen)
    expect(second.filter((e) => e.kind === 'score')).toHaveLength(0)
  })

  test('a pickup with no collider still notices you', () => {
    // `collider: "none"` means it does not stop you, not that it cannot see
    // you - which is why enter/exit is its own pass rather than something the
    // collision reports.
    const world = spawnEntities(document)
    expect(world.box.has(0)).toBe(false)
    const effects = stepTriggers(world, BLUEPRINTS, [boxAt(0)], new Map())
    expect(effects.some((e) => e.kind === 'score')).toBe(true)
  })

  test('standing away from it does nothing', () => {
    const world = spawnEntities(document)
    const effects = stepTriggers(world, BLUEPRINTS, [boxAt(9)], new Map())
    expect(effects).toEqual([])
    expect(world.alive.has(0)).toBe(true)
  })

  test('exit fires on the way out, once', () => {
    const lingering: Blueprint = {
      ...COIN,
      triggers: [{ on: 'exit', do: [{ op: 'emit', event: 'left' }] }],
    }
    const blueprints = { ...BLUEPRINTS, coin: lingering }
    const world = spawnEntities(
      doc({ blueprints, entities: [{ blueprint: 'coin', x: 0, y: 1, z: 0 }] }),
    )
    const seen: Overlaps = new Map()

    expect(stepTriggers(world, blueprints, [boxAt(0)], seen)).toEqual([])
    const out = stepTriggers(world, blueprints, [boxAt(9)], seen)
    expect(out).toEqual([{ kind: 'emit', event: 'left', from: 0 }])
    expect(stepTriggers(world, blueprints, [boxAt(9)], seen)).toEqual([])
  })

  test('something that died does not also "exit"', () => {
    // It already announced itself with `died`; firing exit as well runs a
    // pickup's rules twice.
    const world = spawnEntities(document)
    const seen: Overlaps = new Map()
    stepTriggers(world, BLUEPRINTS, [boxAt(0)], seen)
    const after = stepTriggers(world, BLUEPRINTS, [boxAt(9)], seen)
    expect(after).toEqual([])
  })
})

describe('the parser refuses a rule it cannot run', () => {
  const problemsOf = (blueprints: Record<string, unknown>) => {
    const result = parseXp({
      format: XP_FORMAT,
      id: 'x',
      name: 'X',
      packs: [{ id: 'proto' }],
      world: { floorY: 0, placements: [], marks: [] },
      blueprints,
    })
    return result.ok ? [] : result.problems.map((p) => `${p.at}: ${p.message}`)
  }

  test('a verb that does not exist is named, not ignored', () => {
    // A typo that silently does nothing is the worst failure a rules system
    // can have, because the level looks finished.
    const problems = problemsOf({
      c: { model: 'proto/Box_A', triggers: [{ on: 'damaged', do: [{ op: 'explode' }] }] },
    })
    expect(problems).toContain('blueprints.c.triggers[0].do[0].op: not a verb: explode')
  })

  test('an event that does not exist is refused', () => {
    const problems = problemsOf({
      c: { model: 'proto/Box_A', triggers: [{ on: 'sat-on', do: [{ op: 'despawn' }] }] },
    })
    expect(problems.some((p) => p.includes('triggers[0].on'))).toBe(true)
  })

  test('a trigger with nothing to do is refused', () => {
    const problems = problemsOf({
      c: { model: 'proto/Box_A', triggers: [{ on: 'damaged', do: [] }] },
    })
    expect(problems).toContain('blueprints.c.triggers[0].do: needs at least one verb')
  })

  test('spawning a blueprint that does not exist is refused', () => {
    const problems = problemsOf({
      c: {
        model: 'proto/Box_A',
        triggers: [{ on: 'damaged', do: [{ op: 'spawn', blueprint: 'ghost' }] }],
      },
    })
    expect(problems).toContain(
      'blueprints.c.triggers[0].do[0].blueprint: no blueprint called "ghost"',
    )
  })

  test('a condition with a comparison nobody has heard of is refused', () => {
    const problems = problemsOf({
      c: {
        model: 'proto/Box_A',
        triggers: [
          { on: 'damaged', when: { prop: 'hp', is: 'roughly', value: 0 }, do: [{ op: 'despawn' }] },
        ],
      },
    })
    expect(problems.some((p) => p.includes('when'))).toBe(true)
  })
})

/**
 * Off for a while, rather than gone for good.
 *
 * Asked for in exactly these terms: `despawn` is the wrong verb for ammunition
 * that should come back. It is permanent, so a box that refills has to spawn a
 * replacement — which loses the original's name, its properties, and anything a
 * rule had written on it.
 *
 * Being off *is* being despawned, on purpose: the trigger pass, the draw list
 * and the blockers all walk `alive`, so something missing from it is invisible
 * and intangible with no new branch anywhere. The only thing added is a row
 * saying when to put it back.
 */
describe('a thing that goes away and comes back', () => {
  const world = () => {
    const xp = doc({
      blueprints: {
        ammo: {
          model: 'proto/Ammo_Box',
          collider: 'none',
          props: { rounds: 12 },
          triggers: [{ on: 'enter', do: [{ op: 'deactivate', target: 'self', seconds: 8 }] }],
        },
      },
      entities: [{ blueprint: 'ammo', name: 'ammo_1', x: 0, y: 0, z: 0 }],
    })
    const live = spawnEntities(xp)
    return { xp, live, id: entityByName(live, 'ammo_1')! }
  }

  test('walking into it takes it away', () => {
    const { xp, live, id } = world()
    fire(live, bodiesFor(xp), id, 'enter', PLAYER_ID, { now: 100 })
    expect(live.alive.has(id)).toBe(false)
  })

  /**
   * The whole point. A replacement spawned by `despawn` + `spawn` would be a
   * different entity with a different id and none of this.
   */
  test('and it keeps its name and its properties while it is gone', () => {
    const { xp, live, id } = world()
    fire(live, bodiesFor(xp), id, 'enter', PLAYER_ID, { now: 100 })
    expect(live.props.get(id)).toEqual({ rounds: 12 })
    expect(live.name.get(id)).toBe('ammo_1')
  })

  test('it is still gone a moment later', () => {
    const { xp, live, id } = world()
    fire(live, bodiesFor(xp), id, 'enter', PLAYER_ID, { now: 100 })
    expect(stepReturns(live, 104)).toEqual([])
    expect(live.alive.has(id)).toBe(false)
  })

  test('and back when its time is up, as the same entity', () => {
    const { xp, live, id } = world()
    fire(live, bodiesFor(xp), id, 'enter', PLAYER_ID, { now: 100 })
    expect(stepReturns(live, 108)).toEqual([id])
    expect(live.alive.has(id)).toBe(true)
    expect(live.props.get(id)).toEqual({ rounds: 12 })
  })

  test('coming back happens once, not every frame after', () => {
    const { xp, live, id } = world()
    fire(live, bodiesFor(xp), id, 'enter', PLAYER_ID, { now: 100 })
    expect(stepReturns(live, 108)).toEqual([id])
    expect(stepReturns(live, 109)).toEqual([])
  })

  /**
   * A host with no clock cannot promise to bring anything back, so it does not
   * pretend to. Treating "no clock" as "no delay" would make a timed pickup
   * reappear the instant it was taken, which looks like the verb not working.
   */
  test('with no clock it goes off and stays off, rather than returning at once', () => {
    const { xp, live, id } = world()
    fire(live, bodiesFor(xp), id, 'enter', PLAYER_ID)
    expect(live.alive.has(id)).toBe(false)
    expect(stepReturns(live, 1e9)).toEqual([])
  })

  test('something destroyed does not come back', () => {
    const { live, id } = world()
    deactivate(live, id, 5)
    despawn(live, id)
    expect(stepReturns(live, 100)).toEqual([])
    expect(live.alive.has(id)).toBe(false)
  })

  test('and it can be turned on early, without waiting', () => {
    const { live, id } = world()
    deactivate(live, id, 1000)
    activate(live, id)
    expect(live.alive.has(id)).toBe(true)
    // The pending return went with it, so it does not fire again later.
    expect(stepReturns(live, 2000)).toEqual([])
  })
})

/**
 * A pickup that comes back.
 *
 * Reported from the shooter demo as "clicking does not shoot". It did shoot -
 * the ammo boxes `despawn`ed, eleven of them, once each, and after that there
 * was nothing to fire. The fix in the document is `deactivate` with a `seconds`,
 * and it does not work without the fix below.
 *
 * `deactivate` reads the time out of its context and falls back to `Infinity`
 * when nobody supplies one - so a box told to come back in fifteen seconds
 * comes back never. `stepTriggers` was not passing a clock, which meant
 * `seconds` worked from a script and did not work from walking into something:
 * everywhere except the place a pickup is picked up.
 *
 * Nothing failed. The field parsed, the editor could set it, every test was
 * green, and the only symptom was a level that quietly ran out.
 */
describe('a pickup that comes back', () => {
  const RESPAWNING: Blueprint = {
    model: 'proto/Cube_Prototype_Small',
    collider: 'none',
    tags: ['pickup'],
    props: {},
    sockets: {},
    triggers: [
      {
        on: 'enter',
        do: [
          { op: 'score', amount: 1 },
          { op: 'deactivate', target: 'self', seconds: 15 },
        ],
      },
    ],
  }

  const PLAYER = 500
  const boxAt = (x: number) => ({
    id: PLAYER,
    box: { minX: x - 0.3, minY: 1, minZ: -0.3, maxX: x + 0.3, maxY: 2.7, maxZ: 0.3 },
  })

  const world = () =>
    spawnEntities(
      doc({
        blueprints: { ...BLUEPRINTS, pad: RESPAWNING },
        entities: [{ blueprint: 'pad', x: 0, y: 1, z: 0 }],
      }),
    )

  test('it goes away when you take it', () => {
    const live = world()
    stepTriggers(live, { ...BLUEPRINTS, pad: RESPAWNING }, [boxAt(0)], new Map(), undefined, {
      now: 0,
    })
    expect(live.alive.has(0)).toBe(false)
  })

  test('and comes back, which needs the clock stepTriggers was not passing', () => {
    /**
     * The assertion that fails against the old signature. Without a clock the
     * deadline is `Infinity`, `stepReturns` never reaches it, and the box is
     * gone for the rest of the match - which is a level that runs out of ammo
     * and looks like a gun that stopped working.
     */
    const live = world()
    const blueprints = { ...BLUEPRINTS, pad: RESPAWNING }
    stepTriggers(live, blueprints, [boxAt(0)], new Map(), undefined, { now: 100 })

    expect(stepReturns(live, 114)).toEqual([])
    expect(stepReturns(live, 115)).toEqual([0])
    expect(live.alive.has(0)).toBe(true)
  })

  test('with no clock at all it stays gone, which is why the clock is threaded', () => {
    /**
     * The old behaviour, kept as a test rather than deleted. It is the correct
     * answer to "come back at some unknown time" - the alternative would be a
     * host with no clock silently inventing one - and it is precisely why the
     * caller has to supply one.
     */
    const live = world()
    stepTriggers(live, { ...BLUEPRINTS, pad: RESPAWNING }, [boxAt(0)], new Map())
    expect(stepReturns(live, 1e9)).toEqual([])
  })

  test('taking it twice is not possible while it is away', () => {
    // The other half of `enter` firing once: a deactivated entity is not in
    // `alive`, so standing on the spot finds nothing to walk into.
    const live = world()
    const blueprints = { ...BLUEPRINTS, pad: RESPAWNING }
    const seen: Overlaps = new Map()
    const first = stepTriggers(live, blueprints, [boxAt(0)], seen, undefined, { now: 0 })
    const second = stepTriggers(live, blueprints, [boxAt(0)], seen, undefined, { now: 1 })
    expect(first.filter((e) => e.kind === 'score')).toHaveLength(1)
    expect(second.filter((e) => e.kind === 'score')).toHaveLength(0)
  })
})

/**
 * Two entities meeting, which nothing could notice before.
 *
 * `stepTriggers` is handed one prober - the player - so `enter` has always
 * meant "the person walked into me". A ball rolled into a goal, a crate carried
 * into a wall, a thrown thing meeting the floor: none of them set anything off,
 * whatever rules they carried.
 */
describe('two things touching', () => {
  const GATE: Blueprint = {
    model: 'proto/Box_A',
    collider: 'auto',
    tags: [],
    props: {},
    sockets: {},
    // The case it was asked for: when they collide, send it somewhere.
    triggers: [{ on: 'collide', do: [{ op: 'teleport', target: 'other', to: 'away' }] }],
  }

  const BALL: Blueprint = {
    model: 'proto/Box_A',
    collider: 'auto',
    tags: [],
    props: {},
    sockets: {},
    triggers: [],
  }

  const PARTS = { gate: GATE, ball: BALL, away: BALL }

  /** A gate at the origin, a ball on top of it, and somewhere to send it. */
  const meeting = () =>
    spawnEntities(
      doc({
        blueprints: PARTS,
        entities: [
          { blueprint: 'gate', x: 0, y: 1, z: 0 },
          { blueprint: 'ball', x: 0, y: 1, z: 0 },
          { blueprint: 'away', name: 'away', x: 20, y: 1, z: 20 },
        ],
      }),
    )

  test('a collide fires, and the other thing is what touched it', () => {
    const world = meeting()
    const effects = stepTriggers(world, PARTS, [], new Map())
    const sent = effects.filter((effect) => effect.kind === 'teleport')
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ x: 20, z: 20 })
  })

  test('once, not every frame they are inside each other', () => {
    // The same rule `enter` follows, and the same bug if it did not: a ball
    // resting against a gate would be teleported sixty times a second.
    const world = meeting()
    const seen: Overlaps = new Map()
    expect(stepTriggers(world, PARTS, [], seen).filter((e) => e.kind === 'teleport')).toHaveLength(1)
    expect(stepTriggers(world, PARTS, [], seen).filter((e) => e.kind === 'teleport')).toHaveLength(0)
  })

  test('nothing collides with itself', () => {
    const world = spawnEntities(
      doc({ blueprints: PARTS, entities: [{ blueprint: 'gate', x: 0, y: 1, z: 0 }] }),
    )
    expect(stepTriggers(world, PARTS, [], new Map())).toEqual([])
  })

  test('and things far apart do not touch', () => {
    const world = spawnEntities(
      doc({
        blueprints: PARTS,
        entities: [
          { blueprint: 'gate', x: 0, y: 1, z: 0 },
          { blueprint: 'ball', x: 30, y: 1, z: 30 },
          { blueprint: 'away', name: 'away', x: 20, y: 1, z: 20 },
        ],
      }),
    )
    expect(stepTriggers(world, PARTS, [], new Map()).filter((e) => e.kind === 'teleport')).toEqual(
      [],
    )
  })

  test('a level with no collide rule pays nothing and fires nothing', () => {
    // The cost is askers x entities, and with no askers it is one walk of the
    // live set - which is every level written before this event existed.
    const world = spawnEntities(
      doc({
        blueprints: { ball: BALL },
        entities: [
          { blueprint: 'ball', x: 0, y: 1, z: 0 },
          { blueprint: 'ball', x: 0, y: 1, z: 0 },
        ],
      }),
    )
    expect(stepTriggers(world, { ball: BALL }, [], new Map())).toEqual([])
  })

  test('the player does not fire it, because that is what enter is', () => {
    /**
     * Firing both for a person walking into something would run one rule twice,
     * and an author who wrote one rule would watch it happen twice.
     */
    const world = spawnEntities(
      doc({ blueprints: PARTS, entities: [{ blueprint: 'gate', x: 0, y: 1, z: 0 }] }),
    )
    const prober = {
      id: PLAYER_ID,
      box: { minX: -0.3, minY: 1, minZ: -0.3, maxX: 0.3, maxY: 2.7, maxZ: 0.3 },
    }
    expect(stepTriggers(world, PARTS, [prober], new Map())).toEqual([])
  })
})

/**
 * `world` as a third noun — docs/xp/backlog.md §7c.
 *
 * Driven through `holds` and `applyVerb` directly rather than through `parseXp`,
 * because the format half has not landed: the parser does not yet accept
 * `target: 'world'` in a document. These are the semantics the parser will be
 * letting through, and they are worth pinning before it does.
 */
describe("the level's own data", () => {
  const world = spawnEntities(
    doc({ blueprints: BLUEPRINTS, entities: [{ blueprint: 'crate', x: 0, y: 0, z: 0 }] }),
  )
  const context = (data?: Map<string, number>) => ({ self: 0, other: null, ...(data ? { data } : {}) })

  test('a condition reads the map the host is keeping', () => {
    const data = new Map([['coins', 7]])
    expect(holds(world, 0, { prop: 'coins', of: 'world', is: '>=', value: 7 }, null, data)).toBe(true)
    expect(holds(world, 0, { prop: 'coins', of: 'world', is: '>', value: 7 }, null, data)).toBe(false)
  })

  test('a field nobody has written reads as zero, like a missing property', () => {
    // Not "skip the rule": a rule about a number nobody has written is a rule
    // about zero. A level that cannot work that way says `needs: persistence`.
    expect(holds(world, 0, { prop: 'coins', of: 'world', is: '==', value: 0 }, null, new Map())).toBe(true)
    expect(holds(world, 0, { prop: 'coins', of: 'world', is: '==', value: 0 })).toBe(true)
  })

  test('a condition about the world does not read the entity it is on', () => {
    // `hp` is 10 on the crate and absent from the data, and this asks the data.
    expect(holds(world, 0, { prop: 'hp', of: 'world', is: '==', value: 10 }, null, new Map())).toBe(false)
  })

  test('setProp writes the field and addProp adds to it', () => {
    const data = new Map([['coins', 2]])
    applyVerb(world, BLUEPRINTS, { op: 'addProp', key: 'coins', value: 3, target: 'world' }, context(data))
    expect(data.get('coins')).toBe(5)

    applyVerb(world, BLUEPRINTS, { op: 'setProp', key: 'coins', value: 0, target: 'world' }, context(data))
    expect(data.get('coins')).toBe(0)
  })

  test('adding to a field that is not there starts at zero', () => {
    const data = new Map<string, number>()
    applyVerb(world, BLUEPRINTS, { op: 'addProp', key: 'coins', value: 1, target: 'world' }, context(data))
    expect(data.get('coins')).toBe(1)
  })

  test('a host with no data does nothing rather than throwing', () => {
    // The state every host with no store is in, and the same honest failure as
    // a teleport to a mark that is not there.
    expect(() =>
      applyVerb(world, BLUEPRINTS, { op: 'setProp', key: 'coins', value: 9, target: 'world' }, context()),
    ).not.toThrow()
  })

  test('a verb aimed at the world does not touch whoever set it off', () => {
    /**
     * The bug this test exists for: `pick` was `target === 'self' ? self :
     * other`, so a third target answered `other` — and `damage target: 'world'`
     * would have hurt the player, silently, while typechecking.
     */
    const hp = () => world.props.get(0)?.hp
    const before = hp()
    applyVerb(world, BLUEPRINTS, { op: 'damage', amount: 5, target: 'world' }, { self: 0, other: 0 })
    expect(hp()).toBe(before)
  })

  test('a rule sees the write it just made', () => {
    // `applyVerbs` promises this within one rule for an entity's props, and the
    // data map is the same arrangement one layer up.
    const data = new Map([['coins', 9]])
    applyVerbs(
      world,
      BLUEPRINTS,
      [
        { op: 'addProp', key: 'coins', value: 1, target: 'world' },
        { op: 'setProp', key: 'ten', value: 1, target: 'world' },
      ],
      context(data),
    )
    expect(data.get('coins')).toBe(10)
    expect(holds(world, 0, { prop: 'coins', of: 'world', is: '>=', value: 10 }, null, data)).toBe(true)
  })
})

describe('a dice', () => {
  const world = spawnEntities(
    doc({ blueprints: BLUEPRINTS, entities: [{ blueprint: 'crate', x: 0, y: 0, z: 0 }] }),
  )

  test('rolling changes nothing here and asks the host instead', () => {
    // The whole verb: this package has no arbiter and no random it would be
    // honest to use, so the roll is an effect and the host decides the face.
    const data = new Map([['dice', 3]])
    const effects = applyVerb(
      world,
      BLUEPRINTS,
      { op: 'roll', key: 'dice', sides: 6 },
      { self: 0, other: null, data },
    )

    expect(effects).toEqual([{ kind: 'roll', key: 'dice', sides: 6 }])
    // Not zeroed while it waits: a rule reading `dice == 0` after a roll that
    // has not landed would behave as though the dice came up a face it has not
    // got.
    expect(data.get('dice')).toBe(3)
  })

  test('it carries the field it lands in, not the number', () => {
    const [effect] = applyVerb(
      world,
      BLUEPRINTS,
      { op: 'roll', key: 'steps', sides: 20 },
      { self: 0, other: null },
    )
    expect(effect).toEqual({ kind: 'roll', key: 'steps', sides: 20 })
  })
})

describe('a piece walking a track', () => {
  const BOARD = () =>
    doc({
      blueprints: { crate: { model: 'proto/Box_A', collider: 'auto', props: { track: 0 } } },
      entities: [{ blueprint: 'crate', name: 'meeple', x: 0, y: 0, z: 0 }],
      world: {
        floorY: 0,
        placements: [],
        marks: [
          { kind: 'spawn', name: 'track-0', x: 0, y: 0, z: 0, facing: 0 },
          { kind: 'spawn', name: 'track-1', x: 1, y: 0, z: 0, facing: 0 },
          { kind: 'spawn', name: 'track-2', x: 2, y: 0, z: 0, facing: 0 },
          { kind: 'spawn', name: 'track-3', x: 3, y: 0, z: 0, facing: 90 },
        ],
      },
    })

  const move = (steps: number | null) => {
    const document = BOARD()
    const world = spawnEntities(document)
    const data = steps === null ? new Map<string, number>() : new Map([['dice', steps]])
    const effects = applyVerb(
      world,
      document.blueprints,
      { op: 'advance', target: 'self', by: 'dice', along: 'track' },
      { self: 0, other: null, marks: document.world.marks, data },
    )
    return { world, document, data, effects }
  }

  test('it moves by what the level rolled, and remembers where it is', () => {
    const { world, effects } = move(2)
    // The track and the square ride along with the position now, so a host can
    // hand the move to the *other* clients as the move it was rather than as a
    // pair of coordinates - see the note on `advance`.
    expect(effects).toEqual([
      { kind: 'teleport', id: 0, x: 2, y: 0, z: 0, facing: 0, along: 'track', to: 2 },
    ])
    expect(world.props.get(0)?.track).toBe(2)
  })

  test('a second move carries on from where it stopped', () => {
    const { world, document } = move(2)
    applyVerb(
      world,
      document.blueprints,
      { op: 'advance', target: 'self', by: 'dice', along: 'track' },
      { self: 0, other: null, marks: document.world.marks, data: new Map([['dice', 1]]) },
    )
    expect(world.props.get(0)?.track).toBe(3)
    expect(world.position.get(0)).toEqual({ x: 3, y: 0, z: 0 })
  })

  test('running off the end is not a move at all', () => {
    // Mensch ärgere dich nicht's own rule: you need the exact roll to come home,
    // and a six when you need a two is a turn you sit out. Clamping to the last
    // field would pile everybody up on it.
    const { world, effects } = move(9)
    expect(effects).toEqual([])
    expect(world.props.get(0)?.track).toBe(0)
  })

  test('no dice, no move', () => {
    expect(move(null).effects).toEqual([])
    expect(move(0).effects).toEqual([])
    expect(move(null).world.props.get(0)?.track).toBe(0)
  })

  test('a host with no data at all is the same answer', () => {
    const document = BOARD()
    const world = spawnEntities(document)
    expect(
      applyVerb(
        world,
        document.blueprints,
        { op: 'advance', target: 'self', by: 'dice', along: 'track' },
        { self: 0, other: null, marks: document.world.marks },
      ),
    ).toEqual([])
  })
})

describe('calling a meeting', () => {
  const world = spawnEntities(
    doc({ blueprints: BLUEPRINTS, entities: [{ blueprint: 'crate', x: 0, y: 0, z: 0 }] }),
  )

  test('it asks the room and changes nothing here', () => {
    // The deadline is measured with `now()` on the server and the room is the
    // arbiter's; this package has neither, so the verb is only ever an effect.
    expect(applyVerb(world, BLUEPRINTS, { op: 'meet' }, { self: 0, other: null })).toEqual([
      { kind: 'meet' },
    ])
  })

  test('how long is carried when the level said', () => {
    expect(
      applyVerb(world, BLUEPRINTS, { op: 'meet', seconds: 45 }, { self: 0, other: null }),
    ).toEqual([{ kind: 'meet', seconds: 45 }])
  })
})

describe('one piece sending another home', () => {
  /**
   * The board game's namesake, and the reason it needed no new vocabulary.
   *
   * `collide` is the only event another *entity* can set off, and a condition
   * can read the props of whoever set it off — so "a green piece landed on me"
   * is `{ of: 'other', prop: 'is-green' }`. The marker prop is what makes that
   * work: a piece's track index is 0 on its first field, which is
   * indistinguishable from a piece of another colour that has no index at all.
   */
  const BOARD = () =>
    doc({
      blueprints: {
        'blue-piece': {
          model: 'proto/Box_A',
          collider: 'auto',
          props: { blue: 0, 'is-blue': 1 },
          triggers: [
            {
              on: 'collide',
              when: { of: 'other', prop: 'is-green', is: '==', value: 1 },
              do: [
                { op: 'teleport', target: 'other', to: 'green-0' },
                { op: 'setProp', key: 'green', value: 0, target: 'other' },
              ],
            },
          ],
        },
        'green-piece': {
          model: 'proto/Box_B',
          collider: 'auto',
          props: { green: 7, 'is-green': 1 },
        },
      },
      entities: [
        { blueprint: 'blue-piece', name: 'blue-1', x: 0, y: 0, z: 0 },
        { blueprint: 'green-piece', name: 'green-1', x: 0.1, y: 0, z: 0.1 },
      ],
      world: {
        floorY: 0,
        placements: [],
        marks: [{ kind: 'point', name: 'green-0', x: 9, y: 0, z: 9, facing: 0 }],
      },
    })

  test('the one that landed goes back to its own first field', () => {
    const document = BOARD()
    const world = spawnEntities(document)
    const effects = stepTriggers(
      world,
      document.blueprints,
      [],
      new Map() as Overlaps,
      undefined,
      { marks: document.world.marks },
    )

    expect(effects).toContainEqual({ kind: 'teleport', id: 1, x: 9, y: 0, z: 9, facing: 0 })
    expect(world.position.get(1)).toEqual({ x: 9, y: 0, z: 9 })
  })

  test('and its count goes back with it', () => {
    // A piece sent home still thinking it was on field 7 would walk off the end
    // of its track and never move again.
    const document = BOARD()
    const world = spawnEntities(document)
    stepTriggers(world, document.blueprints, [], new Map() as Overlaps, undefined, {
      marks: document.world.marks,
    })
    expect(world.props.get(1)?.green).toBe(0)
  })

  test('a piece of the same colour is not sent anywhere', () => {
    const document = BOARD()
    const world = spawnEntities(document)
    // The green piece has no rule of its own, so blue landing on green does
    // nothing — which is the same asymmetry the real game has: it is the piece
    // that *arrives* that does the sending, and here that is whoever has a rule.
    world.props.get(1)!['is-green'] = 0
    const effects = stepTriggers(world, document.blueprints, [], new Map() as Overlaps, undefined, {
      marks: document.world.marks,
    })
    expect(effects).toEqual([])
  })
})

describe('handing the turn on', () => {
  const world = spawnEntities(
    doc({ blueprints: BLUEPRINTS, entities: [{ blueprint: 'crate', x: 0, y: 0, z: 0 }] }),
  )

  test('it asks the table and carries nothing', () => {
    // Whose turn it is and who is next are both the arbiter's. A field here
    // would be a client naming somebody else's turn.
    expect(applyVerb(world, BLUEPRINTS, { op: 'pass' }, { self: 0, other: null })).toEqual([
      { kind: 'pass' },
    ])
  })

  /**
   * And the same shape for a raid, where "carries nothing" is load-bearing
   * rather than tidy: docs/xp/server-authority.md §4.3. A verb that could name
   * whose world to take from is a verb a player uses on the same person every
   * time, so the field does not exist and the arbiter picks.
   */
  test('and a raid carries nothing either, including who', () => {
    expect(applyVerb(world, BLUEPRINTS, { op: 'raid' }, { self: 0, other: null })).toEqual([
      { kind: 'raid' },
    ])
  })
})

/**
 * A punching bag, which is the level this whole group came out of.
 *
 * Reported as a game: *"when I hit the dummy he loses 10-20 hp, disappears at
 * zero, and comes back after 3 seconds"*. Three separate things were missing
 * and each of them failed silently, which is why they are tested together as
 * the sentence somebody actually asked for rather than only one at a time.
 */
describe('a thing you can hit twice', () => {
  const DUMMY: Blueprint = {
    model: 'proto/Dummy_Base',
    collider: 'auto',
    tags: ['breakable'],
    props: { hp: 100 },
    sockets: {},
    triggers: [
      {
        on: 'pressed',
        key: 'attack',
        within: 2,
        do: [{ op: 'damage', target: 'self', amount: 10, upTo: 20 }],
      },
      {
        on: 'damaged',
        when: { prop: 'hp', is: '<=', value: 0 },
        do: [{ op: 'deactivate', target: 'self', seconds: 3 }],
      },
      { on: 'returned', do: [{ op: 'heal', target: 'self', amount: 999 }] },
    ],
  }

  const blueprints = { ...BLUEPRINTS, dummy: DUMMY }
  /**
   * The dummy, and somebody standing next to it.
   *
   * The player is spawned rather than assumed, and it is not ceremony: an id
   * the world has never heard of reads as standing at the origin, so a test
   * that put the dummy there too would pass its `within` for the wrong reason
   * and go on passing if the reach stopped working entirely. Away from the
   * origin, and with a body actually in the world, is the only arrangement
   * where a failing reach fails the test.
   */
  const AT = { x: -0.8, y: 0.5, z: 8.4 }
  const world = () => {
    const document = doc({ blueprints, entities: [{ blueprint: 'dummy', ...AT }] })
    const live = spawnEntities(document)
    spawnPlayer(live, document, { ...AT, x: AT.x + 1 })
    return live
  }

  /** A stream that hands back exactly what a test wants to have been rolled. */
  const stream = (...draws: number[]) => {
    let at = 0
    return () => draws[at++ % draws.length]!
  }

  test('a swing takes off somewhere between the two, both ends reachable', () => {
    const live = world()
    // Bottom of the stream is the floor and the top of it is the ceiling: a
    // half-open draw must not be able to produce 21, and 0 must not produce 9.
    fire(live, blueprints, 0, 'pressed', PLAYER_ID, { key: 'attack', random: stream(0) })
    expect(live.props.get(0)!.hp).toBe(90)
    fire(live, blueprints, 0, 'pressed', PLAYER_ID, { key: 'attack', random: stream(0.999999) })
    expect(live.props.get(0)!.hp).toBe(70)
  })

  test('and the numbers in between are whole', () => {
    const seen = new Set<number>()
    for (let draw = 0; draw < 1; draw += 0.01) {
      const live = world()
      fire(live, blueprints, 0, 'pressed', PLAYER_ID, { key: 'attack', random: stream(draw) })
      seen.add(100 - live.props.get(0)!.hp)
    }
    expect([...seen].every((off) => Number.isInteger(off))).toBe(true)
    expect([...seen].sort((a, b) => a - b)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20])
  })

  test('and a swing from across the room is not a swing', () => {
    /**
     * The assertion the arrangement above exists for. Without a body in the
     * world the reach compares against the origin, which is a test that passes
     * whether or not `within` does anything at all.
     */
    const document = doc({ blueprints, entities: [{ blueprint: 'dummy', ...AT }] })
    const live = spawnEntities(document)
    spawnPlayer(live, document, { ...AT, x: AT.x + 9 })
    fire(live, blueprints, 0, 'pressed', PLAYER_ID, { key: 'attack', random: stream(0) })
    expect(live.props.get(0)!.hp).toBe(100)
  })

  test('with no stream it is the low end, so a test is a test', () => {
    const live = world()
    fire(live, blueprints, 0, 'pressed', PLAYER_ID, { key: 'attack' })
    expect(live.props.get(0)!.hp).toBe(90)
  })

  test('at zero it goes away, and the clock has to come through `damage`', () => {
    /**
     * The assertion that fails against the old signature. `damage()` was the
     * one entry point into the rules that passed no clock at all, so the most
     * natural rule anybody writes on `damaged` - go away for three seconds -
     * scheduled a return for `Infinity` and the dummy never came back.
     */
    const live = world()
    damage(live, blueprints, 0, 100, PLAYER_ID, { now: 10 })
    expect(live.alive.has(0)).toBe(false)
    expect(stepReturns(live, 12.9)).toEqual([])
    expect(stepReturns(live, 13)).toEqual([0])
  })

  test('and comes back whole, which is what `returned` is for', () => {
    const live = world()
    damage(live, blueprints, 0, 100, PLAYER_ID, { now: 0 })
    expect(live.props.get(0)!.hp).toBe(0)

    for (const back of stepReturns(live, 3)) {
      fire(live, blueprints, back, 'returned', null, { now: 3 })
    }
    // Not 999: `heal` stops at the blueprint's own ceiling, which is the only
    // way a rule can say "full" without hard-coding the number twice.
    expect(live.props.get(0)!.hp).toBe(100)
  })

  test('a heal cannot push anything past what its blueprint started it at', () => {
    const live = world()
    applyVerb(live, blueprints, { op: 'heal', target: 'self', amount: 50 }, { self: 0, other: null })
    expect(live.props.get(0)!.hp).toBe(100)
  })

  test('and a thing spawned above its ceiling keeps what it was given', () => {
    // Clamping *down* on a heal would be a verb that takes health away, which
    // is a worse surprise than a bar drawn full.
    const live = world()
    live.props.get(0)!.hp = 150
    applyVerb(live, blueprints, { op: 'heal', target: 'self', amount: 10 }, { self: 0, other: null })
    expect(live.props.get(0)!.hp).toBe(150)
  })

  test('the damage *verb* does not wake `damaged`, which is why the death check is a second rule', () => {
    /**
     * The trap this level fell into, pinned so it stays a decision.
     *
     * `damage()` the function is the entry point *into* the rules from outside
     * them - a shot lands, a script swings - and it fires `damaged` afterwards.
     * The `damage` **verb** is already inside them and only changes the number:
     * a verb that fired rules would recurse, which is the same refusal `carry`
     * makes about `held`.
     *
     * So a blueprint that hurts itself on `pressed` and reacts on `damaged` is
     * a blueprint whose second rule never runs, and nothing anywhere says so.
     * What works is two rules on the same event, in order, the second asking
     * about what the first did - which `fire` supports because it walks the
     * list once and evaluates each `when` at its turn.
     */
    const NAIVE: Blueprint = {
      ...DUMMY,
      triggers: [
        { on: 'pressed', key: 'attack', do: [{ op: 'damage', target: 'self', amount: 100 }] },
        {
          on: 'damaged',
          when: { prop: 'hp', is: '<=', value: 0 },
          do: [{ op: 'deactivate', target: 'self', seconds: 3 }],
        },
      ],
    }
    const naive = spawnEntities(doc({ blueprints: { ...blueprints, naive: NAIVE }, entities: [{ blueprint: 'naive', ...AT }] }))
    fire(naive, { ...blueprints, naive: NAIVE }, 0, 'pressed', PLAYER_ID, { key: 'attack', now: 0 })
    expect(naive.props.get(0)!.hp).toBe(0)
    expect(naive.alive.has(0)).toBe(true)

    const WORKS: Blueprint = {
      ...DUMMY,
      triggers: [
        { on: 'pressed', key: 'attack', do: [{ op: 'damage', target: 'self', amount: 100 }] },
        {
          on: 'pressed',
          key: 'attack',
          when: { prop: 'hp', is: '<=', value: 0 },
          do: [{ op: 'deactivate', target: 'self', seconds: 3 }],
        },
      ],
    }
    const works = spawnEntities(doc({ blueprints: { ...blueprints, works: WORKS }, entities: [{ blueprint: 'works', ...AT }] }))
    fire(works, { ...blueprints, works: WORKS }, 0, 'pressed', PLAYER_ID, { key: 'attack', now: 0 })
    expect(works.alive.has(0)).toBe(false)
    expect(stepReturns(works, 3)).toEqual([0])
  })

  test('a return is not a spawn, so set-up rules do not run again', () => {
    /**
     * The reason `returned` is its own event. A blueprint whose `spawned` rule
     * hands out a coin would hand out one more every time a pickup refilled.
     */
    const COUNTER: Blueprint = {
      ...DUMMY,
      triggers: [{ on: 'spawned', do: [{ op: 'addProp', target: 'self', key: 'setup', value: 1 }] }],
    }
    const live = spawnEntities(
      doc({
        blueprints: { ...blueprints, counter: COUNTER },
        entities: [{ blueprint: 'counter', x: 0, y: 0, z: 0 }],
      }),
    )
    const all = { ...blueprints, counter: COUNTER }
    deactivate(live, 0, 1)
    for (const back of stepReturns(live, 2)) {
      fire(live, all, back, 'returned', null, { now: 2 })
    }
    expect(live.props.get(0)!.setup).toBeUndefined()
  })
})

/**
 * Telling a body to do something, from a rule rather than from a script.
 *
 * `runAnimation` has been a script call since scripts could reach entities and
 * a *rule* could not do it at all, which made "the door opens and the guard
 * salutes" a level that needed a script for the second half of a sentence whose
 * first half was one verb.
 */
describe('a rule that plays a clip', () => {
  const GUARD: Blueprint = {
    model: 'dummy/Dummy',
    collider: 'auto',
    tags: [],
    props: {},
    sockets: {},
    triggers: [
      { on: 'enter', do: [{ op: 'animate', target: 'self', clip: 'Cheer' }] },
      { on: 'exit', do: [{ op: 'animate', target: 'self', clip: 'Walking_A', loop: true, parts: ['arms'] }] },
    ],
  }
  const all = { ...BLUEPRINTS, guard: GUARD }
  const live = () =>
    spawnEntities(
      doc({
        // The body is from the `dummy` pack, which the document has to list -
        // the same check that catches a level shipping a model it never
        // credited.
        packs: [{ id: 'proto' }, { id: 'dummy' }],
        blueprints: all,
        entities: [{ blueprint: 'guard', x: 0, y: 0, z: 0 }],
      }),
    )

  test('it lands on the entity, with the tick that identifies it', () => {
    const world = live()
    world.tick = 42
    fire(world, all, 0, 'enter', PLAYER_ID)
    expect(world.clip.get(0)).toEqual({ name: 'Cheer', loop: false, at: 42 })
  })

  test('the same clip twice is two events, because the tick moved', () => {
    /**
     * The field that makes this work at all. A renderer comparing only names
     * would see `Cheer` both times and leave the first one running, so a rule
     * firing once a second would animate once and then stand still.
     */
    const world = live()
    world.tick = 1
    fire(world, all, 0, 'enter', PLAYER_ID)
    world.tick = 2
    fire(world, all, 0, 'enter', PLAYER_ID)
    expect(world.clip.get(0)?.at).toBe(2)
  })

  test('parts come through, which is what makes it a layer', () => {
    // No parts replaces the body; parts lay the clip over whatever it is doing.
    const world = live()
    fire(world, all, 0, 'exit', PLAYER_ID)
    expect(world.clip.get(0)).toEqual({ name: 'Walking_A', loop: true, at: 0, parts: ['arms'] })
  })

  test('and a despawn takes the instruction with it', () => {
    /**
     * Every other component map is kept on a corpse on purpose - a rule that
     * fires *because* something died wants to know where it was - and this one
     * is not data about the corpse. It is an instruction, and a leftover one
     * would be obeyed by whatever reuses the id.
     */
    const world = live()
    fire(world, all, 0, 'enter', PLAYER_ID)
    applyVerb(world, all, { op: 'despawn', target: 'self' }, { self: 0, other: null })
    expect(world.clip.has(0)).toBe(false)
  })
})

describe('whose rule this is', () => {
  const world = () => {
    const w = emptyWorld()
    w.alive.add(1)
    w.blueprint.set(1, 'gate')
    w.position.set(1, { x: 0, y: 0, z: 0 })
    w.props.set(1, {})
    w.alive.add(2)
    w.blueprint.set(2, 'body')
    w.position.set(2, { x: 0, y: 0, z: 0 })
    w.props.set(2, { 'team:blue': 1 })
    w.alive.add(3)
    w.blueprint.set(3, 'body')
    w.position.set(3, { x: 0, y: 0, z: 0 })
    w.props.set(3, { 'team:red': 1 })
    return w
  }

  const blueprints = {
    gate: {
      model: 'proto/Primitive_Floor',
      collider: 'none' as const,
      tags: [],
      props: {},
      sockets: {},
      triggers: [
        {
          on: 'pressed' as const,
          key: 'use',
          by: 'team:blue',
          do: [{ op: 'emit' as const, event: 'opened' }],
        },
      ],
    },
    body: {
      model: 'proto/Primitive_Floor',
      collider: 'none' as const,
      tags: [],
      props: {},
      sockets: {},
      triggers: [],
    },
  }

  const press = (by: number | null) =>
    fire(world(), blueprints, 1, 'pressed', by, { key: 'use' })

  test('the one carrying the property sets it off', () => {
    expect(press(2)).toHaveLength(1)
  })

  test('and somebody carrying a different one does not', () => {
    expect(press(3)).toEqual([])
  })

  test('a rule with an owner and nobody to own it is false, not true', () => {
    // The same answer `within` gives with no `other`, and for the same reason:
    // a rule that fires for want of a subject is the failure worth refusing.
    expect(press(null)).toEqual([])
  })

  test('a property written as zero is not carrying it', () => {
    // Zero is what an unwritten property already reads as, so "on the side you
    // are not" and "before the sides are known" have to answer the same way.
    const w = world()
    w.props.set(2, { 'team:blue': 0 })
    expect(fire(w, blueprints, 1, 'pressed', 2, { key: 'use' })).toEqual([])
  })
})

/**
 * A comparison against a number the level is keeping, rather than one the
 * document typed — docs/xp/xp-flow.md §4's one indirection.
 *
 * The tests worth having are about *where* it can appear and what a missing
 * field means, because both are the whole of keeping it shallow.
 */
describe('comparing against something the level is keeping', () => {
  test('a reference is recognised and a bare string is not', () => {
    expect(isDataRef('@world.wanted')).toBe(true)
    expect(isDataRef('wanted')).toBe(false)
    expect(isDataRef(7)).toBe(false)
  })

  test('one level, and no deeper — which is the whole of the design', () => {
    // `@world.a.b` and `@self.hp` are refused by shape, so nothing downstream
    // has to decide what they would have meant.
    expect(isDataRef('@world.a.b')).toBe(false)
    expect(isDataRef('@self.hp')).toBe(false)
    expect(isDataRef('@world.')).toBe(false)
  })

  test('a literal reads as itself', () => {
    expect(valueOf(4)).toBe(4)
  })

  test('and a reference reads the field', () => {
    expect(valueOf('@world.wanted', new Map([['wanted', 3]]))).toBe(3)
  })

  test('a field nobody has written is zero, exactly as a missing property is', () => {
    // Not "skip this rule" — the failure this file refuses everywhere else.
    expect(valueOf('@world.wanted', new Map())).toBe(0)
    expect(valueOf('@world.wanted')).toBe(0)
  })

  test('a condition compares against it', () => {
    const world = emptyWorld()
    world.alive.add(1)
    world.props.set(1, { number: 3 })
    const data = new Map([['wanted', 3]])
    expect(holds(world, 1, { prop: 'number', is: '==', value: '@world.wanted' }, null, data)).toBe(
      true,
    )
    data.set('wanted', 4)
    expect(holds(world, 1, { prop: 'number', is: '==', value: '@world.wanted' }, null, data)).toBe(
      false,
    )
  })

  test('and both sides may come out of the data at once', () => {
    const world = emptyWorld()
    const data = new Map([
      ['caught', 2],
      ['needed', 2],
    ])
    expect(
      holds(world, 1, { of: 'world', prop: 'caught', is: '>=', value: '@world.needed' }, null, data),
    ).toBe(true)
  })
})

describe('which actions a document can hear letting go of', () => {
  /**
   * The question a press buffer has to ask before it decides what a tap meant.
   *
   * A quick tap withholds its release and owes it to the next tap, which is how
   * one key gives both *tap to pick up, tap to place* and *hold and carry*. An
   * action with no `released` rule anywhere has nobody to owe it to, so it spent
   * every second tap paying off a debt nothing collected - the roll fired, then
   * did nothing, then fired. Worst on a phone, where a tap is the only gesture
   * there is.
   */
  const doc = (triggers: Record<string, { on: string; key?: string }[]>) => ({
    blueprints: Object.fromEntries(
      Object.entries(triggers).map(([name, list]) => [name, { triggers: list }]),
    ),
  })

  test('the ones a rule listens for, by the name the level gave them', () => {
    expect(
      releasedKeys(
        doc({
          piece: [
            { on: 'pressed', key: 'use' },
            { on: 'released', key: 'use' },
          ],
          die: [{ on: 'pressed', key: 'roll' }],
        }),
      ),
    ).toEqual(new Set(['use']))
  })

  test('across every blueprint, because one of them is enough', () => {
    // The rule that hears the release does not have to be on the thing you were
    // pointing at when you pressed - you will have walked somewhere by then.
    expect(
      releasedKeys(
        doc({ hand: [{ on: 'pressed', key: 'grab' }], bin: [{ on: 'released', key: 'grab' }] }),
      ),
    ).toEqual(new Set(['grab']))
  })

  test('a document that never listens for one is an empty answer, not a missing one', () => {
    expect(releasedKeys(doc({ die: [{ on: 'pressed', key: 'roll' }] }))).toEqual(new Set())
    expect(releasedKeys({ blueprints: {} })).toEqual(new Set())
  })

  test('and a release rule that names no key is not an action', () => {
    // `fire` compares `trigger.key` against the press, so a `released` with no
    // key can never match one - counting it would latch every action in the
    // level on behalf of a rule that fires for none of them.
    expect(releasedKeys(doc({ odd: [{ on: 'released' }] }))).toEqual(new Set())
  })
})

/**
 * A tile you walk over rather than into.
 *
 * A floor mark - the thing a level uses to say *stand here and something
 * happens* - has to be `collider: none`, because a tile that fills its cell is
 * a kerb you bump against and the `enter` never comes. That leaves a fair
 * question, and one a demo of mine got stuck on: with no collider, is there
 * anything left to enter?
 *
 * There is. `triggerBox` gives every entity a metre of reach whether or not it
 * has a body, so solidity and triggerability are genuinely separate - and this
 * says so out loud, because the next person to ship a floor mark will wonder
 * the same thing.
 */
describe('a trigger with no collider', () => {
  const level = doc({
    blueprints: {
      mark: {
        model: 'proto/Primitive_Floor',
        collider: 'none',
        triggers: [{ on: 'enter', do: [{ op: 'emit', event: 'stood' }] }],
      },
    },
    entities: [{ blueprint: 'mark', x: 0, y: 1, z: 5 }],
  })
  const world = spawnEntities(level)
  const walker = (z: number) => ({
    id: 99,
    box: { minX: -0.3, minY: 1, minZ: z - 0.3, maxX: 0.3, maxY: 2.7, maxZ: z + 0.3 },
  })

  test('still fires when you step on it', () => {
    const seen = new Map<number, Set<number>>()
    expect(stepTriggers(world, level.blueprints, [walker(7)], seen)).toHaveLength(0)
    const on = stepTriggers(world, level.blueprints, [walker(5)], seen)
    expect(on.map((one) => one.kind)).toContain('emit')
  })

  test('and a metre away is not standing on it', () => {
    /*
     * The reach is half a metre either side, which is what made a demo look
     * broken: the walk went past at an angle and missed a one-metre mark, and
     * "the trigger does not work" and "I did not step on it" look identical
     * from the outside.
     */
    const seen = new Map<number, Set<number>>()
    expect(stepTriggers(world, level.blueprints, [walker(3)], seen)).toHaveLength(0)
  })
})

/**
 * The event that had no way of happening.
 *
 * See `stepSpawned`: `spawned` parsed, the editor offered it, and nothing fired
 * it - so a rule written against it was a rule that never ran, in a level that
 * looked perfectly well authored.
 */
describe('spawning', () => {
  const level = doc({
    blueprints: {
      lamp: {
        model: 'proto/Primitive_Floor',
        triggers: [{ on: 'spawned', do: [{ op: 'emit', event: 'here' }] }],
      },
    },
    entities: [{ blueprint: 'lamp', x: 0, y: 1, z: 0 }],
  })

  test('fires for what is already there when the level starts', () => {
    const world = spawnEntities(level)
    const seen = new Set<number>()
    expect(stepSpawned(world, level.blueprints, seen).map((one) => one.kind)).toContain('emit')
  })

  test('and once, not every frame it goes on existing', () => {
    const world = spawnEntities(level)
    const seen = new Set<number>()
    stepSpawned(world, level.blueprints, seen)
    expect(stepSpawned(world, level.blueprints, seen)).toHaveLength(0)
    expect(stepSpawned(world, level.blueprints, seen)).toHaveLength(0)
  })

  test('something that goes away and comes back has spawned again', () => {
    // A pickup returning is the same id rejoining the live set, and coming back
    // *is* appearing - see the note on pruning `seen`.
    const world = spawnEntities(level)
    const seen = new Set<number>()
    stepSpawned(world, level.blueprints, seen)

    world.alive.delete(0)
    expect(stepSpawned(world, level.blueprints, seen)).toHaveLength(0)

    world.alive.add(0)
    expect(stepSpawned(world, level.blueprints, seen).map((one) => one.kind)).toContain('emit')
  })
})
