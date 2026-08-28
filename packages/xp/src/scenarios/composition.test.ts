import { describe, expect, test } from 'bun:test'
import {
  blockersOf,
  bodiesFor,
  deactivate,
  drawList,
  entityByName,
  spawnEntities,
  spawnPlayer,
  spawnWeapon,
  WEAPON_NAME,
  worldTransform,
} from '../world/entities'
import { DEFAULT_REACH } from '../world/swinging'
import { fire } from '../rules/triggers'
import { applyVerbs, resolveScene } from '../rules/verbs'
import { describeProblems, enterOf, parseXp, placeOf, XP_FORMAT, type XpDocument } from '../document/format'
import { entityBox, partTransforms } from '../document/blueprints'

/**
 * Things attached to other things.
 *
 * The case that drove this: a racing XP where a person *is* a kart and their
 * avatar sits in it. A rider whose position is written relative to the kart
 * moves with the kart without either of them knowing the other exists - which
 * is the same mechanism that hangs a gun off a hand and a light off a post.
 */

function doc(overrides: Record<string, unknown> = {}): XpDocument {
  const parsed = parseXp({
    format: XP_FORMAT,
    id: 'x',
    name: 'X',
    packs: [{ id: 'proto', }, { id: 'dummy' }],
    world: { floorY: 0, placements: [], marks: [] },
    ...overrides,
  })
  if (!parsed.ok) throw new Error(parsed.problems.map((p) => `${p.at}: ${p.message}`).join('\n'))
  return parsed.document
}

const problemsOf = (overrides: Record<string, unknown>) => {
  const result = parseXp({
    format: XP_FORMAT,
    id: 'x',
    name: 'X',
    packs: [{ id: 'proto' }, { id: 'dummy' }],
    world: { floorY: 0, placements: [], marks: [] },
    ...overrides,
  })
  return result.ok ? [] : result.problems.map((p) => `${p.at}: ${p.message}`)
}

/** A kart with a seat a metre up and half a metre back. */
const KART = {
  model: 'proto/Cube_Prototype_Small',
  sockets: { seat: { x: 0, y: 1, z: -0.5 } },
  tags: ['vehicle'],
}
const RIDER = { model: 'dummy/Dummy', collider: 'none' }

describe('a rider in a kart', () => {
  const document = doc({
    blueprints: { kart: KART, rider: RIDER },
    entities: [
      { blueprint: 'kart', name: 'kart-1', x: 10, y: 1, z: 4 },
      { blueprint: 'rider', parent: 'kart-1', socket: 'seat', x: 0, y: 0, z: 0 },
    ],
  })

  test('the rider is where the seat is, not where the document says', () => {
    const world = spawnEntities(document)
    const placed = worldTransform(world, 1, document.blueprints)
    expect(placed.x).toBeCloseTo(10, 5)
    expect(placed.y).toBeCloseTo(2, 5)
    expect(placed.z).toBeCloseTo(3.5, 5)
  })

  test('turning the kart carries the seat round with it', () => {
    /**
     * The reason a parent's offset is *turned* before it is added rather than
     * simply summed: a seat behind the driver has to stay behind the driver
     * when the kart faces the other way.
     */
    const turned = doc({
      blueprints: { kart: KART, rider: RIDER },
      entities: [
        { blueprint: 'kart', name: 'kart-1', x: 10, y: 1, z: 4, rotation: 180 },
        { blueprint: 'rider', parent: 'kart-1', socket: 'seat', x: 0, y: 0, z: 0 },
      ],
    })
    const world = spawnEntities(turned)
    const placed = worldTransform(world, 1, turned.blueprints)
    // The seat was half a metre behind; turned about, it is half a metre ahead.
    expect(placed.z).toBeCloseTo(4.5, 5)
    expect(placed.rotation).toBe(180)
  })

  test('a scaled parent scales what it carries', () => {
    const big = doc({
      blueprints: { kart: KART, rider: RIDER },
      entities: [
        { blueprint: 'kart', name: 'kart-1', x: 0, y: 0, z: 0, scale: 2 },
        { blueprint: 'rider', parent: 'kart-1', socket: 'seat', x: 0, y: 0, z: 0 },
      ],
    })
    const world = spawnEntities(big)
    const placed = worldTransform(world, 1, big.blueprints)
    expect(placed.y).toBeCloseTo(2, 5)
    expect(placed.scale).toBe(2)
  })

  test('the renderer is given world coordinates, not the entity’s own', () => {
    const world = spawnEntities(document)
    const drawn = drawList(world, document.blueprints)
    const rider = drawn.find((entry) => entry.id === 1)!
    expect(rider.x).toBeCloseTo(10, 5)
    expect(rider.y).toBeCloseTo(2, 5)
  })

  test('a child that blocks does so where it actually is', () => {
    // The box is computed twice on spawn for exactly this: the first pass has
    // it in the parent's frame, and the collision grid works in the world's.
    const solid = doc({
      blueprints: { kart: KART, rider: { model: 'dummy/Dummy' } },
      entities: [
        { blueprint: 'kart', name: 'kart-1', x: 40, y: 0, z: 0 },
        { blueprint: 'rider', parent: 'kart-1', socket: 'seat', x: 0, y: 0, z: 0 },
      ],
    })
    const world = spawnEntities(solid)
    const boxes = blockersOf(world)
    expect(boxes).toHaveLength(2)
    // Both near x=40, rather than one of them at the origin.
    for (const box of boxes) expect(box.minX).toBeGreaterThan(35)
  })

  test('a chain composes all the way up', () => {
    const chain = doc({
      blueprints: {
        kart: KART,
        rider: { ...RIDER, sockets: { hand: { x: 0.5, y: 1, z: 0 } } },
        gun: { model: 'proto/Gun_Pistol', collider: 'none' },
      },
      entities: [
        { blueprint: 'kart', name: 'k', x: 10, y: 1, z: 0 },
        { blueprint: 'rider', name: 'r', parent: 'k', socket: 'seat', x: 0, y: 0, z: 0 },
        { blueprint: 'gun', parent: 'r', socket: 'hand', x: 0, y: 0, z: 0 },
      ],
    })
    const world = spawnEntities(chain)
    const placed = worldTransform(world, 2, chain.blueprints)
    expect(placed.x).toBeCloseTo(10.5, 5)
    expect(placed.y).toBeCloseTo(3, 5)
  })
})

describe('finding things by name', () => {
  const document = doc({
    blueprints: { kart: KART },
    entities: [
      { blueprint: 'kart', name: 'first', x: 0, y: 0, z: 0 },
      { blueprint: 'kart', x: 4, y: 0, z: 0 },
      { blueprint: 'kart', name: 'second', x: 8, y: 0, z: 0 },
    ],
  })

  test('a named entity is found, an unnamed one is not', () => {
    const world = spawnEntities(document)
    expect(entityByName(world, 'first')).toBe(0)
    expect(entityByName(world, 'second')).toBe(2)
    expect(entityByName(world, 'nobody')).toBeNull()
  })

  test('something that died is not found', () => {
    // A script holding a name across a frame should get null rather than an id
    // that no longer refers to anything.
    const world = spawnEntities(document)
    world.alive.delete(0)
    expect(entityByName(world, 'first')).toBeNull()
  })
})

describe('the parser refuses what cannot be composed', () => {
  test('two entities with one name', () => {
    expect(
      problemsOf({
        blueprints: { kart: KART },
        entities: [
          { blueprint: 'kart', name: 'twin', x: 0, y: 0, z: 0 },
          { blueprint: 'kart', name: 'twin', x: 4, y: 0, z: 0 },
        ],
      }),
    ).toContain('entities[1].name: "twin" is already the name of entities[0]')
  })

  test('a parent that does not exist', () => {
    expect(
      problemsOf({
        blueprints: { kart: KART },
        entities: [{ blueprint: 'kart', parent: 'ghost', x: 0, y: 0, z: 0 }],
      }),
    ).toContain('entities[0].parent: no entity called "ghost"')
  })

  test('a socket the parent does not have', () => {
    expect(
      problemsOf({
        blueprints: { kart: KART, rider: RIDER },
        entities: [
          { blueprint: 'kart', name: 'k', x: 0, y: 0, z: 0 },
          { blueprint: 'rider', parent: 'k', socket: 'roof', x: 0, y: 0, z: 0 },
        ],
      }),
    ).toContain('entities[1].socket: "kart" has no socket called "roof"')
  })

  test('a socket with nothing to hang from', () => {
    expect(
      problemsOf({
        blueprints: { kart: KART },
        entities: [{ blueprint: 'kart', socket: 'seat', x: 0, y: 0, z: 0 }],
      }),
    ).toContain('entities[0].socket: needs a parent to hang from')
  })

  test('a loop', () => {
    /**
     * Without this the first thing that asks where either of them is recurses
     * forever - on the frame the level loads, inside a renderer, with no
     * message.
     */
    const problems = problemsOf({
      blueprints: { kart: KART },
      entities: [
        { blueprint: 'kart', name: 'a', parent: 'b', x: 0, y: 0, z: 0 },
        { blueprint: 'kart', name: 'b', parent: 'a', x: 0, y: 0, z: 0 },
      ],
    })
    expect(problems.some((p) => p.includes('loop'))).toBe(true)
  })

  test('a child written above its parent is fine', () => {
    // Insisting on document order would make the order of a JSON array
    // meaningful, which nobody remembers and everybody trips over.
    expect(
      problemsOf({
        blueprints: { kart: KART, rider: RIDER },
        entities: [
          { blueprint: 'rider', parent: 'k', socket: 'seat', x: 0, y: 0, z: 0 },
          { blueprint: 'kart', name: 'k', x: 0, y: 0, z: 0 },
        ],
      }),
    ).toEqual([])
  })
})

describe('what a person arrives as', () => {
  test('a document that says nothing gets the built-in body', () => {
    // Most levels do not care. Requiring the field would make every
    // hand-written one open with a paragraph about what a person is.
    expect(doc().player).toEqual({})
  })

  test('a racing XP says it is a kart with a seat', () => {
    const racing = doc({
      blueprints: { kart: KART },
      player: { blueprint: 'kart', avatarSocket: 'seat' },
    })
    expect(racing.player).toEqual({ blueprint: 'kart', avatarSocket: 'seat' })
  })

  test('a body that does not exist is refused', () => {
    expect(problemsOf({ blueprints: { kart: KART }, player: { blueprint: 'hovercraft' } })).toContain(
      'player.blueprint: no blueprint called "hovercraft"',
    )
  })

  test('a socket the body does not have is refused', () => {
    expect(
      problemsOf({ blueprints: { kart: KART }, player: { blueprint: 'kart', avatarSocket: 'roof' } }),
    ).toContain('player.avatarSocket: "kart" has no socket called "roof"')
  })

  test('an avatar socket with no body has nothing to hang on', () => {
    expect(problemsOf({ player: { avatarSocket: 'seat' } })).toContain(
      'player.avatarSocket: needs a player.blueprint with that socket on it',
    )
  })
})

/**
 * A blueprint made of more than one model.
 *
 * The composition entities already had, moved inside a single kind of thing.
 * The alternative was two entities parented together for every turret in a
 * level - two names to invent, two rows in the tree, and a rule that has to
 * know which of them is "the turret".
 */
describe('a blueprint with parts', () => {
  const built = (parts: unknown[], collider: unknown = 'auto'): XpDocument => {
    const parsed = parseXp({
      format: XP_FORMAT,
      id: 'p',
      name: 'P',
      packs: [{ id: 'proto' }],
      blueprints: { turret: { model: 'proto/Box_A', collider, parts } },
      entities: [{ blueprint: 'turret', name: 'turret_1', x: 0, y: 0, z: 0 }],
      world: { floorY: 0, placements: [], marks: [] },
    })
    if (!parsed.ok) throw new Error(describeProblems(parsed.problems))
    return parsed.document
  }

  test('a part sits where it was put', () => {
    const xp = built([{ model: 'proto/Box_A', x: 2, y: 1, z: 0 }])
    const [placed] = partTransforms(xp.blueprints.turret)
    expect({ x: placed.x, y: placed.y, z: placed.z }).toEqual({ x: 2, y: 1, z: 0 })
  })

  /**
   * The reason parts have parents at all. A barrel that elevates has to take
   * whatever is on the end of it along, and a list of offsets from the
   * blueprint's origin cannot say that.
   */
  test('a part hangs from another, and inherits its turn', () => {
    const xp = built([
      { model: 'proto/Box_A', name: 'barrel', x: 0, y: 1, z: 0, rotation: 90 },
      { model: 'proto/Box_A', parent: 'barrel', x: 0, y: 0, z: 2 },
    ])
    const placed = partTransforms(xp.blueprints.turret)
    const tip = placed[1]
    // A quarter turn sends +z to +x, the convention every transform here keeps.
    expect(tip.x).toBeCloseTo(2, 6)
    expect(tip.z).toBeCloseTo(0, 6)
    expect(tip.y).toBeCloseTo(1, 6)
    expect(tip.rotation).toBe(90)
  })

  test('and through a socket on that part rather than its origin', () => {
    const xp = built([
      {
        model: 'proto/Box_A',
        name: 'barrel',
        x: 0,
        y: 1,
        z: 0,
        sockets: { muzzle: { x: 0, y: 0, z: 3 } },
      },
      { model: 'proto/Box_A', parent: 'barrel', socket: 'muzzle', x: 0, y: 0, z: 0 },
    ])
    const tip = partTransforms(xp.blueprints.turret)[1]
    expect(tip.z).toBeCloseTo(3, 6)
    expect(tip.y).toBeCloseTo(1, 6)
  })

  /**
   * A part may be written above the thing it hangs from. Insisting on document
   * order would make the order of a JSON array meaningful, which is the sort of
   * rule nobody remembers and everybody trips over.
   */
  test('order in the file does not matter', () => {
    const xp = built([
      { model: 'proto/Box_A', parent: 'base', x: 0, y: 2, z: 0 },
      { model: 'proto/Box_A', name: 'base', x: 5, y: 0, z: 0 },
    ])
    const hung = partTransforms(xp.blueprints.turret)[0]
    expect(hung.x).toBeCloseTo(5, 6)
    expect(hung.y).toBeCloseTo(2, 6)
  })

  test('measured collision covers the parts, not just the root', () => {
    const alone = built([])
    const withArm = built([{ model: 'proto/Box_A', x: 4, y: 0, z: 0 }])

    const one = entityBox(alone.blueprints.turret, { x: 0, y: 0, z: 0 }, 0)!
    const two = entityBox(withArm.blueprints.turret, { x: 0, y: 0, z: 0 }, 0)!
    expect(one).not.toBeNull()
    // A box that only knew about `model` would be a turret you walk through the
    // arm of - and worse, an arm that looks solid.
    expect(two.maxX).toBeGreaterThan(one.maxX + 3)
  })

  test('but a collider typed by hand is left exactly as typed', () => {
    const xp = built([{ model: 'proto/Box_A', x: 40, y: 0, z: 0 }], { w: 1, h: 1, d: 1 })
    const box = entityBox(xp.blueprints.turret, { x: 0, y: 0, z: 0 }, 0)!
    expect(box.maxX - box.minX).toBeCloseTo(1, 6)
  })

  const refused = (parts: unknown[]) =>
    parseXp({
      format: XP_FORMAT,
      id: 'p',
      name: 'P',
      packs: [{ id: 'proto' }],
      blueprints: { turret: { model: 'proto/Box_A', parts } },
      world: { floorY: 0, placements: [], marks: [] },
    })

  test('a part naming a model we do not ship is refused', () => {
    expect(refused([{ model: 'proto/Nope' }]).ok).toBe(false)
  })

  test('a parent that does not resolve is refused, by name', () => {
    const result = refused([{ model: 'proto/Box_A', parent: 'nothing' }])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(describeProblems(result.problems)).toContain('no part called "nothing"')
  })

  /**
   * A cycle resolves only because of a depth guard, which means it produces a
   * number rather than an error - the worst shape for a mistake to have.
   */
  test('and a part that hangs from itself is refused rather than guarded against', () => {
    const result = refused([
      { model: 'proto/Box_A', name: 'a', parent: 'b' },
      { model: 'proto/Box_A', name: 'b', parent: 'a' },
    ])
    expect(result.ok).toBe(false)
  })

  test('two parts with one name are refused', () => {
    const result = refused([
      { model: 'proto/Box_A', name: 'arm' },
      { model: 'proto/Box_A', name: 'arm' },
    ])
    expect(result.ok).toBe(false)
  })

  test('a blueprint of one model still has no parts block at all', () => {
    const parsed = parseXp({
      format: XP_FORMAT,
      id: 'p',
      name: 'P',
      packs: [{ id: 'proto' }],
      blueprints: { crate: { model: 'proto/Box_A' } },
      world: { floorY: 0, placements: [], marks: [] },
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.document.blueprints.crate.parts).toBeUndefined()
  })
})

/**
 * Carrying something, which is parenting with a different name.
 *
 * Asked for as "pick things up easy would be cool". The mechanism was already
 * here — `parent` and `socket` are how a rider sits in a kart and how a gun
 * hangs off a hand — so this is two verbs over machinery that already worked,
 * rather than a new idea about attachment.
 */
describe('picking something up', () => {
  const world = () => {
    const parsed = parseXp({
      format: XP_FORMAT,
      id: 'c',
      name: 'C',
      packs: [{ id: 'proto' }],
      blueprints: {
        body: { model: 'proto/Box_A', collider: 'none', sockets: { hand: { x: 0.4, y: 1, z: 0 } } },
        lamp: {
          model: 'proto/Box_A',
          collider: 'none',
          triggers: [{ on: 'enter', do: [{ op: 'carry', target: 'self', socket: 'hand' }] }],
        },
      },
      entities: [
        { blueprint: 'body', name: 'carrier', x: 0, y: 0, z: 0 },
        { blueprint: 'lamp', name: 'lamp_1', x: 9, y: 0, z: 4 },
      ],
      world: { floorY: 0, placements: [], marks: [] },
    })
    if (!parsed.ok) throw new Error(describeProblems(parsed.problems))
    const live = spawnEntities(parsed.document)
    return {
      xp: parsed.document,
      live,
      lamp: entityByName(live, 'lamp_1')!,
      carrier: entityByName(live, 'carrier')!,
    }
  }

  test('walking into it attaches it to whoever did', () => {
    const { xp, live, lamp, carrier } = world()
    fire(live, bodiesFor(xp), lamp, 'enter', carrier)
    expect(live.parent.get(lamp)?.id).toBe(carrier)
    expect(live.parent.get(lamp)?.socket).toBe('hand')
  })

  /**
   * Its position becomes an offset from its carrier, so keeping the world
   * position it had would place a lamp picked up across the room that same
   * distance from the person now holding it. Zero is "at the socket".
   */
  test('and it comes to the socket rather than staying where it lay', () => {
    const { xp, live, lamp, carrier } = world()
    fire(live, bodiesFor(xp), lamp, 'enter', carrier)
    const at = worldTransform(live, lamp, xp.blueprints)
    expect(at.x).toBeCloseTo(0.4, 6)
    expect(at.y).toBeCloseTo(1, 6)
  })

  test('it moves with the carrier without either knowing about the other', () => {
    const { xp, live, lamp, carrier } = world()
    fire(live, bodiesFor(xp), lamp, 'enter', carrier)
    live.position.set(carrier, { x: 20, y: 0, z: -6 })
    const at = worldTransform(live, lamp, xp.blueprints)
    expect(at.x).toBeCloseTo(20.4, 6)
    expect(at.z).toBeCloseTo(-6, 6)
  })

  /**
   * The half that is easy to get wrong. A carried thing's stored position is
   * relative, so clearing the parent before reading the composed transform
   * would drop it at the origin of the level rather than out of your hand.
   */
  test('dropping it leaves it where it actually was', () => {
    const { xp, live, lamp, carrier } = world()
    fire(live, bodiesFor(xp), lamp, 'enter', carrier)
    live.position.set(carrier, { x: 20, y: 0, z: -6 })

    applyVerbs(live, xp.blueprints, [{ op: 'drop', target: 'self' }], { self: lamp, other: null })

    expect(live.parent.has(lamp)).toBe(false)
    const at = live.position.get(lamp)!
    expect(at.x).toBeCloseTo(20.4, 6)
    expect(at.z).toBeCloseTo(-6, 6)
  })

  /**
   * The verb capture the flag needed and `drop` could not be.
   *
   * A rule addresses the entity it is on and whoever set it off. "Being hit
   * makes you let go" is a rule on the *body*, and the thing to let go of is
   * neither of those - so `drop`, which names the carried thing, cannot say it.
   */
  test('unhand lets go of everything, addressed at the carrier', () => {
    const { xp, live, lamp, carrier } = world()
    fire(live, bodiesFor(xp), lamp, 'enter', carrier)
    live.position.set(carrier, { x: 20, y: 0, z: -6 })

    applyVerbs(live, xp.blueprints, [{ op: 'unhand', target: 'self' }], {
      self: carrier,
      other: null,
    })

    expect(live.parent.has(lamp)).toBe(false)
    // Where it actually was, not the origin: the same arithmetic `drop` does.
    const at = live.position.get(lamp)!
    expect(at.x).toBeCloseTo(20.4, 6)
    expect(at.z).toBeCloseTo(-6, 6)
  })

  test('and it lets go of all of them, not the first one it finds', () => {
    const { xp, live, lamp, carrier } = world()
    fire(live, bodiesFor(xp), lamp, 'enter', carrier)
    // A second thing in the same hand, made the way a level makes one. Both are
    // collected before any link is cut, or walking the map while mutating it
    // leaves one of the two stuck to the carrier.
    applyVerbs(live, xp.blueprints, [{ op: 'spawn', blueprint: 'lamp', dx: 0, dy: 0, dz: 0 }], {
      self: carrier,
      other: null,
    })
    const second = [...live.alive].at(-1)!
    applyVerbs(live, xp.blueprints, [{ op: 'carry', target: 'self' }], {
      self: second,
      other: carrier,
    })
    expect(live.parent.has(second)).toBe(true)

    applyVerbs(live, xp.blueprints, [{ op: 'unhand', target: 'self' }], {
      self: carrier,
      other: null,
    })
    expect(live.parent.has(lamp)).toBe(false)
    expect(live.parent.has(second)).toBe(false)
  })

  test('unhanding somebody holding nothing is nothing', () => {
    const { xp, live, carrier } = world()
    expect(
      applyVerbs(live, xp.blueprints, [{ op: 'unhand', target: 'self' }], {
        self: carrier,
        other: null,
      }),
    ).toEqual([])
  })

  test('nothing picks itself up, and nothing is carried by nobody', () => {
    const { xp, live, lamp } = world()
    applyVerbs(live, xp.blueprints, [{ op: 'carry', target: 'self' }], { self: lamp, other: null })
    expect(live.parent.has(lamp)).toBe(false)

    applyVerbs(live, xp.blueprints, [{ op: 'carry', target: 'self' }], { self: lamp, other: lamp })
    expect(live.parent.has(lamp)).toBe(false)
  })

  test('dropping something nobody is holding does nothing', () => {
    const { xp, live, lamp } = world()
    const before = live.position.get(lamp)!
    applyVerbs(live, xp.blueprints, [{ op: 'drop', target: 'self' }], { self: lamp, other: null })
    expect(live.position.get(lamp)).toEqual(before)
  })

  test('and a document using either still parses', () => {
    const { xp } = world()
    expect(parseXp(JSON.parse(JSON.stringify(xp))).ok).toBe(true)
  })
})

/**
 * The gun going away, and coming back.
 *
 * `player.weapon` is a document-level fact: the host hangs one entity off the
 * hand at load and nothing ever turned it off, so no rule could make carrying
 * something *cost* anything. These two verbs are `deactivate` and `activate`
 * aimed at a thing a rule has no way to name - `self` and `other` are the only
 * nouns it has, and neither of them is the gun in somebody's hand.
 */
describe('putting the gun away', () => {
  const world = () => {
    const parsed = parseXp({
      format: XP_FORMAT,
      id: 'w',
      name: 'W',
      packs: [{ id: 'proto' }, { id: 'dummy' }],
      player: { blueprint: 'body', weapon: { blueprint: 'pistol', socket: 'hand' } },
      blueprints: {
        body: {
          model: 'dummy/Dummy',
          collider: 'none',
          props: { hp: 100 },
          sockets: { hand: { x: 0.4, y: 1, z: 0 } },
        },
        pistol: { model: 'proto/Gun_Pistol', collider: 'none', props: { damage: 25 } },
        crate: { model: 'proto/Box_A', collider: 'none' },
      },
      entities: [{ blueprint: 'crate', name: 'crate_1', x: 1, y: 0, z: 0 }],
      world: { floorY: 0, placements: [], marks: [] },
    })
    if (!parsed.ok) throw new Error(describeProblems(parsed.problems))
    const live = spawnEntities(parsed.document)
    const holder = spawnPlayer(live, parsed.document, { x: 0, y: 0, z: 0, facing: 0 })
    const gun = spawnWeapon(live, parsed.document)!
    return { xp: parsed.document, live, holder, gun, crate: entityByName(live, 'crate_1')! }
  }

  test('disarm takes the weapon off whoever it names', () => {
    const { xp, live, holder, gun } = world()
    applyVerbs(live, xp.blueprints, [{ op: 'disarm', target: 'self' }], {
      self: holder,
      other: null,
    })
    expect(live.alive.has(gun)).toBe(false)
  })

  /**
   * Away, not gone. `deactivate` leaves every component row in place - the
   * parent link included - which is the whole reason `arm` can be the reverse
   * of this rather than a second `spawnWeapon`.
   */
  test('and it is still in the hand it was in, so arm is the reverse', () => {
    const { xp, live, holder, gun } = world()
    applyVerbs(live, xp.blueprints, [{ op: 'disarm', target: 'self' }], {
      self: holder,
      other: null,
    })
    expect(live.parent.get(gun)?.id).toBe(holder)

    applyVerbs(live, xp.blueprints, [{ op: 'arm', target: 'self' }], { self: holder, other: null })
    expect(live.alive.has(gun)).toBe(true)
    expect(live.parent.get(gun)?.socket).toBe('hand')
  })

  test('and it names the holder, not the gun - so a rule can disarm whoever set it off', () => {
    const { xp, live, holder, gun } = world()
    applyVerbs(live, xp.blueprints, [{ op: 'disarm', target: 'other' }], {
      self: 999,
      other: holder,
    })
    expect(live.alive.has(gun)).toBe(false)
  })

  test('disarming somebody with no gun is nothing', () => {
    const { xp, live, crate } = world()
    expect(
      applyVerbs(live, xp.blueprints, [{ op: 'disarm', target: 'self' }], {
        self: crate,
        other: null,
      }),
    ).toEqual([])
  })

  /**
   * The exception `unhand` had to grow with these.
   *
   * A weapon hangs off the hand because the host put it there, not because a
   * rule carried it, and "let go of everything you are holding" is a sentence
   * about the things you picked up. Without this, being hit while carrying the
   * flag would leave your gun on the floor too - and the `arm` in the same rule
   * would hand back a weapon attached to nobody.
   */
  test('unhand lets go of what you picked up and not of what you are wearing', () => {
    const { xp, live, holder, gun, crate } = world()
    applyVerbs(live, xp.blueprints, [{ op: 'carry', target: 'self' }], {
      self: crate,
      other: holder,
    })
    expect(live.parent.get(crate)?.id).toBe(holder)

    applyVerbs(live, xp.blueprints, [{ op: 'unhand', target: 'self' }], {
      self: holder,
      other: null,
    })
    expect(live.parent.has(crate)).toBe(false)
    expect(live.parent.get(gun)?.id).toBe(holder)
  })
})

/**
 * Rooted to the spot for a moment.
 *
 * The one verb that changes nothing here on purpose. `deactivate` cannot do a
 * player - the host's controller writes the position every frame whatever this
 * world says - so being unable to move is state that lives beside the
 * controller, and all this can do is say so.
 */
describe('a stun', () => {
  const document = doc({
    blueprints: { rider: RIDER },
    entities: [{ blueprint: 'rider', name: 'runner', x: 0, y: 0, z: 0 }],
  })

  test('is reported rather than applied, because the controller owns it', () => {
    const live = spawnEntities(document)
    const runner = entityByName(live, 'runner')!
    const before = live.position.get(runner)!

    const effects = applyVerbs(
      live,
      document.blueprints,
      [{ op: 'stun', target: 'self', seconds: 1.5 }],
      { self: runner, other: null },
    )

    expect(effects).toEqual([{ kind: 'stunned', id: runner, seconds: 1.5 }])
    // Still alive, still drawn, still exactly where it was: a stunned body
    // stands there, where a deactivated one stops being drawn and walks on.
    expect(live.alive.has(runner)).toBe(true)
    expect(live.position.get(runner)).toEqual(before)
  })

  test('and stunning nothing says nothing', () => {
    const live = spawnEntities(document)
    expect(
      applyVerbs(live, document.blueprints, [{ op: 'stun', target: 'other', seconds: 1 }], {
        self: entityByName(live, 'runner')!,
        other: null,
      }),
    ).toEqual([])
  })

  /**
   * Required and positive where a `deactivate`'s is optional: something can
   * turn an entity back on, and nothing can turn a player back on, so "off
   * until told" is not a meaning this one has.
   */
  test('a document asking for a stun of no time at all is refused', () => {
    const problems = problemsOf({
      blueprints: {
        rider: {
          ...RIDER,
          triggers: [{ on: 'damaged', do: [{ op: 'stun', target: 'self', seconds: 0 }] }],
        },
      },
    })
    expect(problems.some((problem) => problem.includes('positive number of seconds'))).toBe(true)
  })

  test('and one with a real number of seconds on it parses', () => {
    expect(
      problemsOf({
        blueprints: {
          rider: {
            ...RIDER,
            triggers: [{ on: 'damaged', do: [{ op: 'stun', target: 'self', seconds: 1 }] }],
          },
        },
      }),
    ).toEqual([])
  })
})

/**
 * What a thing is made of.
 *
 * The one verb whose whole effect is a row the renderer reads - no effect out,
 * nothing to hand a host. Which is the difference from `dash` and `stun` below
 * and above: a look is a fact about the world, and the world is where it goes.
 */
describe('a material', () => {
  const document = doc({
    blueprints: { rider: RIDER, glowing: { ...RIDER, material: 'rainbow' } },
    entities: [
      { blueprint: 'rider', name: 'plain', x: 0, y: 0, z: 0 },
      { blueprint: 'glowing', name: 'lit', x: 2, y: 0, z: 0 },
    ],
  })

  test('a blueprint that says so arrives wearing it, and one that does not is absent', () => {
    const live = spawnEntities(document)
    expect(live.material.get(entityByName(live, 'lit')!)).toBe('rainbow')
    // Absent rather than `own`: the two are one statement, so there is one row
    // shape for the renderer to ask about.
    expect(live.material.has(entityByName(live, 'plain')!)).toBe(false)
  })

  test('a rule puts it on and takes it off again', () => {
    const live = spawnEntities(document)
    const plain = entityByName(live, 'plain')!

    expect(
      applyVerbs(live, document.blueprints, [{ op: 'material', target: 'self', material: 'rainbow' }], {
        self: plain,
        other: null,
      }),
    ).toEqual([])
    expect(live.material.get(plain)).toBe('rainbow')

    applyVerbs(live, document.blueprints, [{ op: 'material', target: 'self', material: 'own' }], {
      self: plain,
      other: null,
    })
    // Cleared, not written: `own` and absence have to leave the same world, or
    // the renderer has two questions to ask where there is one fact.
    expect(live.material.has(plain)).toBe(false)
  })

  test('a look nobody has heard of is refused at the door', () => {
    const problems = problemsOf({
      blueprints: {
        rider: {
          ...RIDER,
          triggers: [{ on: 'damaged', do: [{ op: 'material', target: 'self', material: 'glitter' }] }],
        },
      },
    })
    expect(problems.some((problem) => problem.includes('must be one of own, rainbow'))).toBe(true)
  })

  test('and a blueprint wearing one nobody has heard of is too', () => {
    expect(
      problemsOf({ blueprints: { rider: { ...RIDER, material: 'glitter' } } }).some((problem) =>
        problem.includes('must be one of own, rainbow'),
      ),
    ).toBe(true)
  })
})

/**
 * A shove forward, which is the stun's twin.
 *
 * The same shape and for a sharper version of the same reason: a stun cannot be
 * written here because *not moving* is the controller's business, and a dash
 * cannot be written here because the **direction** is not in this world at all.
 * Which way a body points is a component; which way somebody is going is a
 * camera and a thumbstick, and neither is.
 */
describe('a dash', () => {
  const document = doc({
    blueprints: { rider: RIDER },
    entities: [{ blueprint: 'rider', name: 'runner', x: 0, y: 0, z: 0, rotation: 90 }],
  })

  test('is reported rather than applied, direction and all', () => {
    const live = spawnEntities(document)
    const runner = entityByName(live, 'runner')!
    const before = live.position.get(runner)!

    const effects = applyVerbs(live, document.blueprints, [{ op: 'dash', target: 'self', cells: 4 }], {
      self: runner,
      other: null,
    })

    expect(effects).toEqual([{ kind: 'dashed', id: runner, cells: 4 }])
    // Nowhere new. The host slides them; this world is not where that is said,
    // which is the one property that makes the verb work for a player at all.
    expect(live.position.get(runner)).toEqual(before)
  })

  test('backwards is the same move measured the other way', () => {
    const live = spawnEntities(document)
    const runner = entityByName(live, 'runner')!
    expect(
      applyVerbs(live, document.blueprints, [{ op: 'dash', target: 'self', cells: -2 }], {
        self: runner,
        other: null,
      }),
    ).toEqual([{ kind: 'dashed', id: runner, cells: -2 }])
  })

  test('and dashing nothing says nothing', () => {
    const live = spawnEntities(document)
    expect(
      applyVerbs(live, document.blueprints, [{ op: 'dash', target: 'other', cells: 4 }], {
        self: entityByName(live, 'runner')!,
        other: null,
      }),
    ).toEqual([])
  })

  /**
   * Zero is refused for the reason a stun of no seconds is: a row that reads as
   * an action and does nothing is a row somebody has half written, and the
   * whole point of naming an unknown verb is to never let one through silently.
   */
  test('a document asking for a dash of no distance is refused', () => {
    const problems = problemsOf({
      blueprints: {
        rider: {
          ...RIDER,
          triggers: [{ on: 'damaged', do: [{ op: 'dash', target: 'self', cells: 0 }] }],
        },
      },
    })
    expect(problems.some((problem) => problem.includes('a distance, forwards or back'))).toBe(true)
  })

  test('and one with a distance on it parses, in either direction', () => {
    for (const cells of [4, -4]) {
      expect(
        problemsOf({
          blueprints: {
            rider: {
              ...RIDER,
              triggers: [{ on: 'damaged', do: [{ op: 'dash', target: 'self', cells }] }],
            },
          },
        }),
      ).toEqual([])
    }
  })
})

/**
 * A swing, which is the third of the family and the one with a rule of its own.
 *
 * Nothing is written here for `dash`'s reason and a sharper one: what is in
 * front of a body includes other *players*, who are not entities in this world
 * at all, and whose health belongs to the arbiter. What the verb decides is the
 * one thing it can - whether this body is in a position to swing.
 */
describe('a swing', () => {
  const document = doc({
    blueprints: { rider: RIDER, flag: { model: 'proto/Primitive_Cube', collider: 'none' } },
    entities: [
      { blueprint: 'rider', name: 'runner', x: 0, y: 0, z: 0, rotation: 90 },
      { blueprint: 'flag', name: 'prize', x: 4, y: 0, z: 0 },
    ],
  })

  test('is reported rather than applied, with the arm the author wrote', () => {
    const live = spawnEntities(document)
    const runner = entityByName(live, 'runner')!
    expect(
      applyVerbs(live, document.blueprints, [{ op: 'swing', target: 'self', reach: 3 }], {
        self: runner,
        other: null,
      }),
    ).toEqual([{ kind: 'swung', id: runner, reach: 3 }])
  })

  test('and an arm of the usual length when they wrote none', () => {
    const live = spawnEntities(document)
    const runner = entityByName(live, 'runner')!
    expect(
      applyVerbs(live, document.blueprints, [{ op: 'swing', target: 'self' }], {
        self: runner,
        other: null,
      }),
    ).toEqual([{ kind: 'swung', id: runner, reach: DEFAULT_REACH }])
  })

  test('nobody swings with their hands full', () => {
    /**
     * The whole rule of this verb, and the reason it is here rather than in
     * whichever document needed it first: a level that hands you a flag has
     * taken your fists away by doing so, and every way of saying that in a
     * document is a place to forget one half of it.
     */
    const live = spawnEntities(document)
    const runner = entityByName(live, 'runner')!
    const prize = entityByName(live, 'prize')!
    live.parent.set(prize, { id: runner, socket: 'hand' })

    expect(
      applyVerbs(live, document.blueprints, [{ op: 'swing', target: 'self' }], {
        self: runner,
        other: null,
      }),
    ).toEqual([])
  })

  test('but a worn gun is not carrying something', () => {
    // It hangs off the hand because the host put it there at load, which is the
    // same distinction `unhand` makes - so a level where everybody has a gun is
    // not a level where nobody can swing.
    const live = spawnEntities(document)
    const runner = entityByName(live, 'runner')!
    const prize = entityByName(live, 'prize')!
    live.parent.set(prize, { id: runner, socket: 'hand' })
    live.name.set(prize, WEAPON_NAME)

    expect(
      applyVerbs(live, document.blueprints, [{ op: 'swing', target: 'self' }], {
        self: runner,
        other: null,
      }),
    ).toEqual([{ kind: 'swung', id: runner, reach: DEFAULT_REACH }])
  })

  test('and swinging nobody says nothing', () => {
    const live = spawnEntities(document)
    expect(
      applyVerbs(live, document.blueprints, [{ op: 'swing', target: 'other' }], {
        self: entityByName(live, 'runner')!,
        other: null,
      }),
    ).toEqual([])
  })

  test('an arm longer than a room is refused', () => {
    // `reach: 40` is not a longer swing - it is a silent hitscan weapon that
    // needs no gun and reads in the document as a punch.
    const problems = problemsOf({
      blueprints: {
        rider: {
          ...RIDER,
          triggers: [{ on: 'damaged', do: [{ op: 'swing', target: 'self', reach: 40 }] }],
        },
      },
    })
    expect(problems.some((problem) => problem.includes("must be an arm's length"))).toBe(true)
  })

  test('and so is one of no length at all, while none is an arm', () => {
    expect(
      problemsOf({
        blueprints: {
          rider: {
            ...RIDER,
            triggers: [{ on: 'damaged', do: [{ op: 'swing', target: 'self', reach: 0 }] }],
          },
        },
      }).some((problem) => problem.includes("must be an arm's length")),
    ).toBe(true)

    expect(
      problemsOf({
        blueprints: {
          rider: { ...RIDER, triggers: [{ on: 'damaged', do: [{ op: 'swing', target: 'self' }] }] },
        },
      }),
    ).toEqual([])
  })
})

/**
 * A thing that is only a place.
 *
 * The teleport destination, the patrol waypoint, the point a turret aims at.
 * It is an entity in every respect except that it never reaches a renderer,
 * which is what makes it worth having as a blueprint flag rather than as a
 * sixth kind of mark or a list of its own - see the note on `Blueprint.draw`.
 */
describe('empty nodes', () => {
  /** The model is what the *editor* draws to let you grab it, nothing more. */
  const NODE = { model: 'proto/Cube_Prototype_Small', draw: false, collider: 'none' }

  const document = doc({
    blueprints: { node: NODE, rider: RIDER },
    entities: [
      { blueprint: 'node', name: 'exit', x: 20, y: 1, z: -6 },
      { blueprint: 'rider', x: 0, y: 0, z: 0 },
    ],
  })

  test('is never drawn, while the entity beside it is', () => {
    const drawn = drawList(spawnEntities(document), document.blueprints)
    expect(drawn.map((entry) => entry.id)).toEqual([1])
  })

  test('is still findable by name, which is the whole point of it', () => {
    // If this were a `world.nodes` list it would need its own lookup. It is an
    // entity, so the lookup a script and a verb already use finds it.
    expect(entityByName(spawnEntities(document), 'exit')).toBe(0)
  })

  test('can carry something, so a node is a place things hang from', () => {
    const hung = doc({
      blueprints: { node: NODE, rider: RIDER },
      entities: [
        { blueprint: 'node', name: 'exit', x: 20, y: 1, z: -6 },
        { blueprint: 'rider', parent: 'exit', x: 0, y: 0, z: 0 },
      ],
    })
    const placed = worldTransform(spawnEntities(hung), 1, hung.blueprints)
    expect(placed.x).toBeCloseTo(20, 5)
    expect(placed.y).toBeCloseTo(1, 5)
  })

  describe('and what it does to collision', () => {
    /**
     * The bug this is here to prevent, and it has been filed against this
     * creator once already: something invisible blocking the way, reported as
     * "I can't move and I can't see why".
     */
    test('an auto collider on something invisible is nothing, not a hidden wall', () => {
      const auto = doc({
        blueprints: { node: { model: 'proto/Cube_Prototype_Small', draw: false } },
        entities: [{ blueprint: 'node', name: 'exit', x: 0, y: 0, z: 0 }],
      })
      expect(entityBox(auto.blueprints.node, { x: 0, y: 0, z: 0 }, 0)).toBe(null)
    })

    test('an explicit box still blocks, because that is asking for it on purpose', () => {
      const wall = doc({
        blueprints: {
          node: { model: 'proto/Cube_Prototype_Small', draw: false, collider: { w: 4, h: 3, d: 1 } },
        },
        entities: [{ blueprint: 'node', name: 'gate', x: 0, y: 0, z: 0 }],
      })
      const box = entityBox(wall.blueprints.node, { x: 0, y: 0, z: 0 }, 0)
      expect(box).not.toBe(null)
      expect(box!.maxY - box!.minY).toBeCloseTo(3, 5)
    })
  })

  describe('in the format', () => {
    test('"draw": true is dropped, so saying the default round-trips as silence', () => {
      const said = doc({
        blueprints: { thing: { model: 'proto/Cube_Prototype_Small', draw: true } },
      })
      expect('draw' in said.blueprints.thing).toBe(false)
    })

    test('"draw": false survives the round trip', () => {
      expect(document.blueprints.node.draw).toBe(false)
    })

    test('anything that is not a boolean is refused', () => {
      expect(
        problemsOf({ blueprints: { thing: { model: 'proto/Cube_Prototype_Small', draw: 'no' } } }),
      ).toContain('blueprints.thing.draw: must be true or false')
    })
  })
})

/**
 * Being sent somewhere.
 *
 * The destination is an entity by name rather than a coordinate, so an author
 * can move the exit without editing every pad that points at it - and so the
 * exit can itself be carried, parented to a lift, or turned off.
 */
describe('teleport', () => {
  const NODE = { model: 'proto/Cube_Prototype_Small', draw: false, collider: 'none' }
  const PAD = { model: 'proto/Cube_Prototype_Small', collider: 'none' }

  const xp = doc({
    blueprints: { node: NODE, pad: PAD, lamp: PAD },
    entities: [
      { blueprint: 'node', name: 'exit', x: 20, y: 3, z: -6, rotation: 90 },
      { blueprint: 'pad', name: 'pad', x: 0, y: 0, z: 0 },
      { blueprint: 'lamp', name: 'lamp', x: 1, y: 0, z: 1 },
    ],
  })
  const [EXIT, PADDED, LAMP] = [0, 1, 2]

  test('puts the thing where the named entity is, facing the way it faces', () => {
    const live = spawnEntities(xp)
    applyVerbs(live, xp.blueprints, [{ op: 'teleport', target: 'other', to: 'exit' }], {
      self: PADDED,
      other: LAMP,
    })
    const at = live.position.get(LAMP)!
    expect([at.x, at.y, at.z]).toEqual([20, 3, -6])
    expect(live.rotation.get(LAMP)).toBe(90)
  })

  test('tells the host, because for the player the world write does not stick', () => {
    const live = spawnEntities(xp)
    const effects = applyVerbs(live, xp.blueprints, [{ op: 'teleport', target: 'other', to: 'exit' }], {
      self: PADDED,
      other: LAMP,
    })
    expect(effects).toEqual([{ kind: 'teleport', id: LAMP, x: 20, y: 3, z: -6, facing: 90 }])
  })

  test('whatever was holding it lets go', () => {
    // Otherwise the position written here is an *offset* from the carrier, and
    // the thing lands that far from somebody who is still holding it - the trap
    // `drop` documents from the other side.
    const live = spawnEntities(xp)
    applyVerbs(live, xp.blueprints, [{ op: 'carry', target: 'self' }], { self: LAMP, other: PADDED })
    expect(live.parent.has(LAMP)).toBe(true)

    applyVerbs(live, xp.blueprints, [{ op: 'teleport', target: 'self', to: 'exit' }], {
      self: LAMP,
      other: null,
    })
    expect(live.parent.has(LAMP)).toBe(false)
    expect(live.position.get(LAMP)!.x).toBeCloseTo(20, 6)
  })

  test('a destination that moved is resolved where it is now, not where it was written', () => {
    const moving = doc({
      blueprints: { node: NODE, lift: PAD, lamp: PAD },
      entities: [
        { blueprint: 'lift', name: 'lift', x: 0, y: 0, z: 0 },
        { blueprint: 'node', name: 'exit', parent: 'lift', x: 0, y: 2, z: 0 },
        { blueprint: 'lamp', name: 'lamp', x: 9, y: 0, z: 9 },
      ],
    })
    const live = spawnEntities(moving)
    live.position.set(0, { x: 0, y: 10, z: 0 })

    applyVerbs(live, moving.blueprints, [{ op: 'teleport', target: 'self', to: 'exit' }], {
      self: 2,
      other: null,
    })
    // The lift went up ten, so the node hanging two above it is at twelve.
    expect(live.position.get(2)!.y).toBeCloseTo(12, 6)
  })

  describe('a mark as the destination', () => {
    const START = { kind: 'start' as const, x: 7, y: 0, z: 3, facing: 90, width: 4, height: 4 }

    test('sends the body to the mark, by its kind', () => {
      // The ask this closes: "send them back to the start" used to mean placing
      // an empty node on top of the start and naming that.
      const live = spawnEntities(xp)
      const effects = applyVerbs(
        live,
        xp.blueprints,
        [{ op: 'teleport', target: 'self', to: 'start' }],
        { self: LAMP, other: null, marks: [START] },
      )

      expect(effects).toEqual([
        { kind: 'teleport', id: LAMP, x: 7, y: 0, z: 3, facing: 90 },
      ])
      expect(live.position.get(LAMP)).toEqual({ x: 7, y: 0, z: 3 })
    })

    test('an entity with that name still wins, so nothing already written moves', () => {
      // Order is compatibility rather than precedence: the parser refuses a
      // mark that takes an entity's name, so the two can never both answer.
      const live = spawnEntities(xp)
      applyVerbs(live, xp.blueprints, [{ op: 'teleport', target: 'self', to: 'exit' }], {
        self: LAMP,
        other: null,
        marks: [{ ...START, name: 'exit' }],
      })

      expect(live.position.get(LAMP)!.x).not.toBe(7)
    })

    test('a host that hands over no marks teleports nobody', () => {
      // The same honest failure as a despawned destination, rather than a
      // silent trip to the origin of the level.
      const live = spawnEntities(xp)
      const effects = applyVerbs(
        live,
        xp.blueprints,
        [{ op: 'teleport', target: 'self', to: 'start' }],
        { self: LAMP, other: null },
      )
      expect(effects).toEqual([])
    })
  })

  describe('and the ways it does nothing', () => {
    test('a name nothing answers to', () => {
      // Soft on purpose: an author may name the exit before placing it. A typo
      // is a pad that does nothing, which shows the first time it is walked on.
      const live = spawnEntities(xp)
      const effects = applyVerbs(live, xp.blueprints, [{ op: 'teleport', target: 'self', to: 'nowhere' }], {
        self: LAMP,
        other: null,
      })
      expect(effects).toEqual([])
      expect(live.position.get(LAMP)!.x).toBe(1)
    })

    test('a destination that has been turned off is not a destination', () => {
      const live = spawnEntities(xp)
      deactivate(live, EXIT)
      const effects = applyVerbs(live, xp.blueprints, [{ op: 'teleport', target: 'self', to: 'exit' }], {
        self: LAMP,
        other: null,
      })
      expect(effects).toEqual([])
    })

    test('sending something to itself', () => {
      const live = spawnEntities(xp)
      expect(
        applyVerbs(live, xp.blueprints, [{ op: 'teleport', target: 'self', to: 'exit' }], {
          self: EXIT,
          other: null,
        }),
      ).toEqual([])
    })
  })

  test('survives a save, and an empty destination is refused', () => {
    const saved = doc({
      blueprints: {
        pad: { ...PAD, triggers: [{ on: 'enter', do: [{ op: 'teleport', target: 'other', to: 'exit' }] }] },
      },
    })
    expect(saved.blueprints.pad.triggers[0].do[0]).toEqual({
      op: 'teleport',
      target: 'other',
      to: 'exit',
    })
    expect(
      problemsOf({
        blueprints: { pad: { ...PAD, triggers: [{ on: 'enter', do: [{ op: 'teleport', to: '' }] }] } },
      }),
    ).toContain('blueprints.pad.triggers[0].do[0].to: needs the name of somewhere to go')
  })
})

/**
 * A door to another XP.
 *
 * "A trigger to load another XP like a link - the room stays the same." The
 * room is a Realtime topic keyed on the space rather than on the document, so
 * the transport does not care which level is loaded; what changes is the scene,
 * with everybody in the room coming along.
 */
describe('load', () => {
  const PAD = { model: 'proto/Cube_Prototype_Small', collider: 'none' }
  const xp = doc({
    blueprints: { pad: PAD },
    entities: [{ blueprint: 'pad', name: 'door', x: 0, y: 0, z: 0 }],
  })

  test('asks the host, and changes nothing here', () => {
    const live = spawnEntities(xp)
    const before = { ...live.position.get(0)! }

    const effects = applyVerbs(live, xp.blueprints, [{ op: 'load', xp: 'ladder-run' }], {
      self: 0,
      other: null,
    })

    expect(effects).toEqual([{ kind: 'load', xp: 'ladder-run' }])
    // The world this would write to is the one about to be discarded, so
    // half-applying a level swap is a change nobody can observe.
    expect(live.position.get(0)).toEqual(before)
    expect(live.alive.has(0)).toBe(true)
  })

  /**
   * The id reaches the path of a fetch, so this is the one verb whose argument
   * is a safety question rather than a spelling one.
   */
  describe('refuses an id that could walk out of the directory', () => {
    for (const bad of ['../secrets', 'a/b', 'Ladder-Run', '', '-leading', 'has space']) {
      test(JSON.stringify(bad), () => {
        expect(
          problemsOf({
            blueprints: {
              pad: { ...PAD, triggers: [{ on: 'enter', do: [{ op: 'load', xp: bad }] }] },
            },
          }).some((problem) => problem.includes('needs the id of an XP')),
        ).toBe(true)
      })
    }

    test('and a script that builds one at runtime is refused too', () => {
      // `readVerb` never saw this one - a script makes verbs out of whatever it
      // likes, so the check is in `applyVerb` as well and not only at parse.
      const live = spawnEntities(xp)
      expect(
        applyVerbs(live, xp.blueprints, [{ op: 'load', xp: '../../etc/passwd' }], {
          self: 0,
          other: null,
        }),
      ).toEqual([])
    })
  })

  test('a good id survives a save', () => {
    const saved = doc({
      blueprints: {
        pad: { ...PAD, triggers: [{ on: 'enter', do: [{ op: 'load', xp: 'first-room' }] }] },
      },
    })
    expect(saved.blueprints.pad.triggers[0].do[0]).toEqual({ op: 'load', xp: 'first-room' })
  })

  /**
   * The other kind of door: a room in this document, and nothing fetched.
   *
   * `xp:` has reached a scene since the topic change, because the host consults
   * the `scenes` table before it treats a name as a document. Saying `scene:`
   * is what makes that permanent - and it is the only spelling that can name
   * `main`, which is the way *back* and the hole `two-rooms.xp.json` shipped
   * with.
   */
  describe('a door to a room in this level', () => {
    const door = (over: Record<string, unknown>) =>
      problemsOf({
        blueprints: {
          pad: { ...PAD, triggers: [{ on: 'enter', do: [{ op: 'load', ...over }] }] },
        },
      })

    test('names a place rather than a document, and asks the host for it', () => {
      const live = spawnEntities(xp)
      expect(
        applyVerbs(live, xp.blueprints, [{ op: 'load', scene: 'cellar' }], { self: 0, other: null }),
      ).toEqual([{ kind: 'load', scene: 'cellar' }])
    })

    test('`main` is a scene and is the one thing `xp` could never say', () => {
      const live = spawnEntities(xp)
      expect(
        applyVerbs(live, xp.blueprints, [{ op: 'load', scene: 'main' }], { self: 0, other: null }),
      ).toEqual([{ kind: 'load', scene: 'main' }])
      expect(door({ scene: 'main' })).toEqual([])
    })

    /**
     * Not checked against the `scenes` table, unlike `enter`. An author may name
     * a room before building it - `resolveScene` is explicit that a door which
     * resolves to nothing is one that does not open yet, and `enter` is checked
     * only because a game that begins nowhere is broken on frame zero.
     */
    test('a room nobody has built yet is a door, not a problem', () => {
      expect(door({ scene: 'attic' })).toEqual([])
    })

    test('the same alphabet an id uses, because a scene is half of a topic', () => {
      for (const bad of ['../secrets', 'a/b', 'The Cellar', '']) {
        expect(door({ scene: bad })).toContain(
          'blueprints.pad.triggers[0].do[0].scene: needs the name of a scene - lowercase letters, digits and dashes',
        )
      }
      // And a script that builds one at runtime is refused too, for the reason
      // `xp` is: `applyVerbs` is called by scripts, which make verbs out of
      // whatever they like.
      const live = spawnEntities(xp)
      expect(
        applyVerbs(live, xp.blueprints, [{ op: 'load', scene: '../../etc' }], { self: 0, other: null }),
      ).toEqual([])
    })

    test('and it may not be both kinds of door at once', () => {
      // Somebody edited one into the other and stopped half way. Picking a
      // winner would be the parser deciding which half of a contradiction was
      // meant.
      expect(door({ scene: 'cellar', xp: 'deep-dark' })).toContain(
        'blueprints.pad.triggers[0].do[0]: a load names a scene in this document or an xp to fetch, not both',
      )
    })

    describe('who comes with you', () => {
      test('everybody, and a document that never says so does not grow the field', () => {
        const saved = doc({
          blueprints: {
            pad: { ...PAD, triggers: [{ on: 'enter', do: [{ op: 'load', scene: 'cellar' }] }] },
          },
        })
        expect(saved.blueprints.pad.triggers[0].do[0]).toEqual({ op: 'load', scene: 'cellar' })
      })

      test('and one that does keeps the note its author left', () => {
        // The opposite of `enter`, which normalises an explicit `main` away -
        // because that field is filled in for documents whose authors never
        // heard of scenes, and this one only ever appears where somebody typed
        // it.
        const saved = doc({
          blueprints: {
            pad: {
              ...PAD,
              triggers: [{ on: 'enter', do: [{ op: 'load', scene: 'cellar', who: 'room' }] }],
            },
          },
        })
        expect(saved.blueprints.pad.triggers[0].do[0]).toEqual({
          op: 'load',
          scene: 'cellar',
          who: 'room',
        })
      })

      /**
       * The two names docs/xp/scenes.md §1.5 offers and this does not have yet.
       * Refused by name rather than by shape, because the failure without it is
       * a door meant for one person taking the whole room through it - a level
       * that is subtly wrong rather than one that said what it could not do.
       */
      test('a party or one person is refused in words, not silently obeyed', () => {
        expect(door({ scene: 'cellar', who: 'self' })).toContain(
          'blueprints.pad.triggers[0].do[0].who: "self" is not built yet - a load takes the whole room with it',
        )
        expect(door({ scene: 'cellar', who: '@team' })).toContain(
          'blueprints.pad.triggers[0].do[0].who: "@team" is not built yet - a load takes the whole room with it',
        )
      })

      test('and a word that is not one of the three is merely wrong', () => {
        expect(door({ scene: 'cellar', who: 'everyone' })).toContain(
          'blueprints.pad.triggers[0].do[0].who: must be "room" - the only one there is so far',
        )
      })
    })
  })
})

/**
 * Save points, numbered, highest wins.
 *
 * The number lives in the pad's own properties rather than on the verb, so
 * every save point placed in a level carries its own - which is what makes
 * "the highest one you have reached" a thing the engine can decide.
 */
describe('checkpoint', () => {
  const PAD = { model: 'proto/Cube_Prototype_Small', collider: 'none', props: { order: 1 } }
  const RUNNER = { model: 'dummy/Dummy', collider: 'none' }

  const xp = doc({
    blueprints: { pad: PAD, runner: RUNNER },
    entities: [
      { blueprint: 'pad', name: 'first', x: 4, y: 1, z: 0, rotation: 90, props: { order: 1 } },
      { blueprint: 'pad', name: 'second', x: 20, y: 1, z: 0, props: { order: 2 } },
      { blueprint: 'runner', name: 'me', x: 0, y: 0, z: 0 },
    ],
  })
  const [FIRST, SECOND, ME] = [0, 1, 2]

  const take = (world: ReturnType<typeof spawnEntities>, pad: number) =>
    applyVerbs(world, xp.blueprints, [{ op: 'checkpoint', target: 'other' }], {
      self: pad,
      other: ME,
    })

  test('taking one reports where to reappear, and remembers the number', () => {
    const live = spawnEntities(xp)
    expect(take(live, FIRST)).toEqual([
      { kind: 'checkpoint', id: ME, x: 4, y: 1, z: 0, facing: 90, order: 1 },
    ])
    expect(live.props.get(ME)?.checkpoint).toBe(1)
  })

  test('a higher one takes over', () => {
    const live = spawnEntities(xp)
    take(live, FIRST)
    const effects = take(live, SECOND)
    expect(effects).toHaveLength(1)
    expect(live.props.get(ME)?.checkpoint).toBe(2)
  })

  /**
   * The rule this exists for. A course that doubles back would otherwise undo
   * progress silently: crossing the first pad again on a loop would send the
   * next death to the beginning, with nothing on screen saying why.
   */
  test('crossing an earlier one again changes nothing and announces nothing', () => {
    const live = spawnEntities(xp)
    take(live, SECOND)
    expect(take(live, FIRST)).toEqual([])
    expect(live.props.get(ME)?.checkpoint).toBe(2)
  })

  test('standing on the same one twice only counts once', () => {
    const live = spawnEntities(xp)
    expect(take(live, FIRST)).toHaveLength(1)
    expect(take(live, FIRST)).toEqual([])
  })

  test('a pad that has been turned off is not a save point', () => {
    const live = spawnEntities(xp)
    deactivate(live, FIRST)
    expect(take(live, FIRST)).toEqual([])
  })

  test('an unnumbered pad is never taken, because zero is where the count starts', () => {
    const bare = doc({
      blueprints: { pad: { model: 'proto/Cube_Prototype_Small', collider: 'none' }, runner: RUNNER },
      entities: [
        { blueprint: 'pad', name: 'nowhere', x: 4, y: 1, z: 0 },
        { blueprint: 'runner', name: 'me', x: 0, y: 0, z: 0 },
      ],
    })
    const live = spawnEntities(bare)
    expect(
      applyVerbs(live, bare.blueprints, [{ op: 'checkpoint', target: 'other' }], {
        self: 0,
        other: 1,
      }),
    ).toEqual([])
  })

  test('a moving save point reports where it is now', () => {
    // A pad on a lift is a strange level and a legal one; the reported place
    // has to be the composed transform, not what the document said.
    const live = spawnEntities(xp)
    live.position.set(FIRST, { x: 9, y: 5, z: -2 })
    expect(take(live, FIRST)[0]).toMatchObject({ x: 9, y: 5, z: -2 })
  })

  test('survives a save', () => {
    const saved = doc({
      blueprints: {
        pad: { ...PAD, triggers: [{ on: 'enter', do: [{ op: 'checkpoint', target: 'other' }] }] },
      },
    })
    expect(saved.blueprints.pad.triggers[0].do[0]).toEqual({ op: 'checkpoint', target: 'other' })
  })
})

/**
 * Keys a level binds.
 *
 * Jump and dance are always there and are deliberately not slots - they are
 * what a body can do rather than what a level decided it can do. These five are
 * the level's own, and every one of them emits its name for the rules to read.
 */
describe('player keys', () => {
  const withKeys = (keys: unknown) => problemsOf({ player: { keys } })

  test('a bound key survives a save, name and all', () => {
    const xp = doc({
      player: { keys: [{ key: 'KeyE', does: 'use' }, { key: 'KeyQ', does: 'throw a rope' }] },
    })
    expect(xp.player.keys).toEqual([
      { key: 'KeyE', does: 'use' },
      { key: 'KeyQ', does: 'throw a rope' },
    ])
  })

  test('an invented name is as good as a familiar one', () => {
    // The whole design: `does` is a name, not a vocabulary. A closed list would
    // ship `use` and `attack` doing nothing and one escape hatch better than
    // both.
    expect(withKeys([{ key: 'KeyR', does: 'open the hatch' }])).toEqual([])
  })

  test('no keys at all is the normal document, and round-trips as absence', () => {
    expect('keys' in doc({}).player).toBe(false)
    expect('keys' in doc({ player: { keys: [] } }).player).toBe(false)
  })

  describe('what it refuses', () => {
    test('more than five', () => {
      const six = ['KeyE', 'KeyQ', 'KeyR', 'KeyF', 'KeyC', 'KeyX'].map((key) => ({ key, does: 'x' }))
      expect(withKeys(six)).toContain('player.keys: at most 5, and this has 6')
    })

    test('a key the body already answers to', () => {
      // The sharp one: rebinding KeyW is a level you cannot walk in, and the
      // author finds out by playing rather than by reading.
      expect(withKeys([{ key: 'KeyW', does: 'shoot' }])).toContain(
        'player.keys[0].key: "KeyW" is how a body already moves, jumps or dances',
      )
      // KeyG is dance, and it is G because the lounge has bound G to dance
      // since it had one - two answers to "how do I dance" is one too many.
      for (const reserved of ['Space', 'KeyG', 'ShiftLeft', 'ArrowUp']) {
        expect(withKeys([{ key: reserved, does: 'x' }]).length).toBe(1)
      }
    })

    test('a key the chrome already answers to, in its own words', () => {
      /*
       * The second half of the list, and it was missing while the first half
       * existed: `V`, `H`, `B`, `Z` and `Enter` all open something, and binding
       * one did not replace the panel - both fired on the one press, which
       * reads as the level being broken.
       *
       * The message differs from the body keys' on purpose. A body key is never
       * coming back; a chrome key is a panel the author may not have known was
       * there, and being told which is the difference between a rule and a
       * mystery.
       */
      expect(withKeys([{ key: 'KeyZ', does: 'wave' }])).toContain(
        'player.keys[0].key: "KeyZ" is how a player already reaches the game\'s own panels',
      )
      for (const reserved of ['KeyV', 'KeyH', 'KeyB', 'Enter', 'NumpadEnter']) {
        expect(withKeys([{ key: reserved, does: 'x' }]).length).toBe(1)
      }
    })

    test('and Escape is deliberately still bindable, because it never arrives', () => {
      // The browser hands it to pointer lock before the page sees it, so
      // reserving it would be refusing a binding nobody could have used anyway.
      expect(withKeys([{ key: 'Escape', does: 'x' }])).toEqual([])
    })

    test('the same key twice', () => {
      expect(
        withKeys([{ key: 'KeyE', does: 'use' }, { key: 'KeyE', does: 'shoot' }]),
      ).toContain('player.keys[1].key: "KeyE" is bound twice')
    })

    test('a character instead of a key code, and a nameless action', () => {
      expect(withKeys([{ key: 'e', does: 'use' }]).length).toBe(1)
      expect(withKeys([{ key: 'KeyE', does: '' }])).toContain(
        'player.keys[0].does: needs a name to emit',
      )
    })
  })
})

/**
 * Doors out of the level, by a name the level invents.
 *
 * A link is written once: four doors to the same place is one entry to change
 * when it moves. It also keeps the *verb* free of the local/remote distinction
 * - every door reads `load cellar`, and what that means is settled in one place
 * where it can be looked at.
 */
describe('scenes', () => {
  const scened = (scenes: unknown) => problemsOf({ scenes })

  test('a name can point at one of ours or at somebody else', () => {
    const xp = doc({
      scenes: { cellar: 'deep-dark', roof: 'https://someone.example/roof.xp.json' },
    })
    expect(xp.scenes).toEqual({
      cellar: 'deep-dark',
      roof: 'https://someone.example/roof.xp.json',
    })
  })

  test('no scenes at all round-trips as absence', () => {
    expect('scenes' in doc({})).toBe(false)
    expect('scenes' in doc({ scenes: {} })).toBe(false)
  })

  describe('what it refuses', () => {
    test('cleartext, outright rather than by asking', () => {
      // There is no version of "are you sure" that makes a plain-http fetch on
      // somebody else's network into a reasonable thing to offer.
      expect(scened({ roof: 'http://someone.example/roof.xp.json' })).toContain(
        'scenes.roof: must be https:// to be somewhere else, not http://',
      )
    })

    test('a target that is neither an id nor a URL', () => {
      expect(scened({ roof: '../../etc/passwd' }).length).toBe(1)
      expect(scened({ roof: 'Deep-Dark' }).length).toBe(1)
    })

    test('a name a load verb could not carry', () => {
      expect(scened({ 'the cellar': 'deep-dark' })).toContain(
        'scenes.the cellar: a scene name is lowercase letters, digits and dashes',
      )
    })
  })

  /**
   * A place in this document, in the same table as a door out of it.
   *
   * docs/xp/scenes.md S0. The two collided on one word with nothing on disk
   * using it, and one table won because the argument the table was built for
   * gets stronger: a verb reads `load cellar` without caring which kind the
   * cellar is.
   */
  describe('a scene of its own', () => {
    const place = { world: { floorY: 0, placements: [], marks: [] } }

    test('a place and a door live in one table', () => {
      const xp = doc({ scenes: { cellar: place, roof: 'https://someone.example/roof.xp.json' } })
      expect(xp.scenes).toEqual({
        cellar: {
          world: { floorY: 0, ground: false, restart: false, fatal: false, placements: [], marks: [] },
          spawn: { x: 0, y: 0, z: 0, facing: 0 },
          // Normalised on the way out, the way the `spawn` above it is: a place
          // has the four things a place has, and a scene has never been written
          // back exactly as it was typed.
          entities: [] },
        roof: 'https://someone.example/roof.xp.json',
      })
    })

    test('a scene is read by the same code the root is', () => {
      // The point of lifting `readWorld` out rather than writing a second one:
      // a scene that disagreed with the root about what a world is would be two
      // parsers, and the second one always the weaker.
      expect(scened({ cellar: { world: { floorY: 0, placements: [], ground: true, restart: true } } }))
        .toContain(
          'scenes.cellar.world.restart: nothing can fall past solid ground - turn scenes.cellar.world.ground off, or restart off',
        )
    })

    test('and the advice names the room it is about', () => {
      // This said "turn world.ground off" inside a scene, which is a field in a
      // different room from the one that is wrong.
      const root = problemsOf({ world: { floorY: 0, placements: [], ground: true, restart: true } })
      expect(root).toContain(
        'world.restart: nothing can fall past solid ground - turn world.ground off, or restart off',
      )
    })

    test('a problem names the room it is in', () => {
      // Without the `at` parameter this said `world.placements[0]`, which is an
      // author sent to look at the wrong room.
      expect(scened({ cellar: { world: { floorY: 0, placements: ['not a placement'] } } })[0])
        .toStartWith('scenes.cellar.world.placements[0]')
    })

    describe('what it refuses', () => {
      test('redefining the root', () => {
        expect(scened({ main: place })).toContain(
          'scenes.main: "main" is this document\'s own world - name the other one',
        )
      })

      test('a scene naming a blueprint nobody wrote, the way the root is refused', () => {
        // S0 refused `entities` here in words, and the message it printed was
        // the specification of what S1 had to build. What replaced the refusal
        // is the same check the root gets, which is the point of one parser.
        expect(scened({ cellar: { ...place, entities: [{ blueprint: 'ghost', x: 0, y: 0, z: 0 }] } }))
          .toContain('scenes.cellar.entities[0].blueprint: no blueprint called "ghost"')
      })
    })

    /**
     * Who is in the room, which is the half of S1 the format was missing.
     *
     * S0 shipped a scene as a place with no actors in it and said so in words,
     * because every entity check was written against a document that had one of
     * everything. The fix was not to weaken them but to hand each one a *place*
     * - so these are the same rules the root has always had, asked about a room.
     */
    describe('and who is in it', () => {
      const PAD = { model: 'proto/Cube_Prototype_Small', collider: 'none' }
      const pad = (over: Record<string, unknown> = {}) => ({
        blueprint: 'pad',
        x: 0,
        y: 0,
        z: 0,
        ...over,
      })
      /** The same two helpers above, with a blueprint for a room to hold. */
      const furnished = (over: Record<string, unknown>) =>
        problemsOf({ blueprints: { pad: PAD }, ...over })
      const roomed = (scenes: unknown) => furnished({ scenes })

      test('a scene carries its own actors, drawn from the document’s blueprints', () => {
        const xp = doc({
          blueprints: { pad: PAD },
          entities: [pad({ name: 'lobby-pad' })],
          scenes: { cellar: { ...place, entities: [pad({ name: 'way-up' })] } },
        })
        const cellar = placeOf(xp, 'cellar')
        expect(cellar?.entities).toHaveLength(1)
        expect(cellar?.entities[0]!.name).toBe('way-up')
        // And the root keeps its own, which is the whole reason a scene has a
        // list rather than the runtime filtering one.
        expect(placeOf(xp, 'main')?.entities.map((e) => e.name)).toEqual(['lobby-pad'])
      })

      test('two rooms may each have a door, because you stand in one at a time', () => {
        // The same sentence the marks test above makes, and the reason the
        // checks moved per place rather than growing a room parameter.
        expect(
          roomed({
            cellar: { ...place, entities: [pad({ name: 'door' })] },
            attic: { ...place, entities: [pad({ name: 'door' })] },
          }),
        ).toEqual([])
      })

      test('and a room may reuse a name the lobby has, for the same reason', () => {
        expect(
          furnished({
            entities: [pad({ name: 'door' })],
            scenes: { cellar: { ...place, entities: [pad({ name: 'door' })] } },
          }),
        ).toEqual([])
      })

      test('but two in one room may not', () => {
        expect(roomed({ cellar: { ...place, entities: [pad({ name: 'door' }), pad({ name: 'door' })] } }))
          .toContain(
            'scenes.cellar.entities[1].name: "door" is already the name of scenes.cellar.entities[0]',
          )
      })

      test('nor a mark and an actor in the same room', () => {
        // `teleport` resolves entities first and marks second, so a collision
        // here is a mark that silently never wins rather than a coin toss.
        expect(
          roomed({
            cellar: {
              world: { floorY: 0, placements: [], marks: [{ kind: 'start', x: 0, y: 0, z: 0, name: 'door' }] },
              entities: [pad({ name: 'door' })],
            },
          }),
        ).toContain(
          'scenes.cellar.world.marks[0].name: "door" is already the name of scenes.cellar.entities[0]',
        )
      })

      /**
       * A room away is as absent as never written, and it has to be: the runtime
       * is handed one place, so a parent in another room is a parent that is not
       * there on the frame the child is built.
       */
      test('and nothing may hang from something in another room', () => {
        expect(
          furnished({
            entities: [pad({ name: 'lobby-pad' })],
            scenes: { cellar: { ...place, entities: [pad({ parent: 'lobby-pad' })] } },
          }),
        ).toContain('scenes.cellar.entities[0].parent: no entity called "lobby-pad"')
      })

      test('the actor budget is the document’s as well as the room’s', () => {
        // The per-room cap is the frame's - `MAX_ENTITIES` prices the step and
        // the trigger pass - and this one is the file's, which is paid before
        // anybody is standing anywhere.
        const half = Array.from({ length: 501 }, () => pad())
        const problems = furnished({
          entities: half,
          scenes: { cellar: { ...place, entities: half } },
        })
        expect(problems.length).toBe(1)
        expect(problems[0]).toStartWith('scenes: 1002 entities across the whole document')
        expect(problems[0]).toContain('main 501, cellar 501')
      })
    })

    describe('where a player arrives', () => {
      test('main, for every document that never heard of scenes', () => {
        expect(enterOf(doc({}))).toBe('main')
        expect(enterOf(doc({ scenes: { cellar: place } }))).toBe('main')
      })

      test('a scene, when the document says so', () => {
        expect(enterOf(doc({ scenes: { cellar: place }, enter: 'cellar' }))).toBe('cellar')
      })

      test('main round-trips as absence, so a saved level does not grow the field', () => {
        // Caught on a real file: first-room.xp.json came back from the parser
        // with an `enter` its author never wrote, and the editor writes the
        // parsed document straight back out.
        expect('enter' in doc({})).toBe(false)
        expect('enter' in doc({ enter: 'main' })).toBe(false)
        expect('enter' in doc({ scenes: { cellar: place }, enter: 'cellar' })).toBe(true)
      })

      test('the root is still the root, and is not overwritten by the entry scene', () => {
        // The data-loss trap: the editor writes a parsed document straight back
        // out, so projecting the entry scene onto `world` would save it over the
        // root's and lose it.
        const xp = doc({
          world: { floorY: 3, placements: [], marks: [] },
          scenes: { cellar: { world: { floorY: -9, placements: [], marks: [] } } },
          enter: 'cellar',
        })
        expect(xp.world.floorY).toBe(3)
        expect(placeOf(xp, 'cellar')?.world.floorY).toBe(-9)
        expect(placeOf(xp, 'main')?.world.floorY).toBe(3)
      })

      test('a door is not somewhere a game can begin', () => {
        expect(problemsOf({ scenes: { roof: 'deep-dark' }, enter: 'roof' })).toContain(
          'enter: "roof" is a door to somewhere else; a game starts in a scene of its own',
        )
      })

      test('a name nothing declares', () => {
        expect(problemsOf({ enter: 'cellar' })).toContain('enter: no scene called "cellar"')
      })

      test('but not a second complaint about a scene that is merely broken', () => {
        // The scene was written and failed to parse, so it is missing from the
        // table for a reason the author already has an error about. Saying "no
        // scene called cellar" under it sends them hunting for a typo in the
        // one name on the page that is spelled right.
        const problems = problemsOf({
          scenes: { cellar: { world: { floorY: 0, placements: [], ground: true, restart: true } } },
          enter: 'cellar',
        })
        expect(problems).not.toContain('enter: no scene called "cellar"')
        expect(problems.length).toBe(1)
      })
    })

    /**
     * The checks a second world was quietly walking past.
     *
     * All three were found by asking what the *document-wide* rules do now that
     * there is more than one world in a document, which is the question the
     * first review pass did not ask.
     */
    describe('the rules that are about the whole document', () => {
      const at = (model: string) => ({ model, x: 0, y: 0, z: 0, rotation: 0 })

      test('a scene may not use art the document never declared', () => {
        // Not a lint: `packs` is where an export reads the author and licence
        // from, so art with no pack behind it ships with no CREDITS.txt line.
        expect(scened({ cellar: { world: { floorY: 0, placements: [at('platformer-neutral/ball')] } } }))
          .toContain('packs: world uses "platformer-neutral" but the document does not list it')
      })

      test('and it is happy when the pack is declared', () => {
        const xp = doc({
          packs: [{ id: 'proto' }, { id: 'dummy' }, { id: 'platformer-neutral' }],
          scenes: { cellar: { world: { floorY: 0, placements: [at('platformer-neutral/ball')] } } },
        })
        expect(xp.packs.map((p) => p.id)).toContain('platformer-neutral')
      })

      test('two marks in one scene may not share a name', () => {
        const marks = [
          { kind: 'start', x: 0, y: 0, z: 0, name: 'gate' },
          { kind: 'finish', x: 1, y: 0, z: 0, name: 'gate' },
        ]
        expect(scened({ cellar: { world: { floorY: 0, placements: [], marks } } })).toContain(
          'scenes.cellar.world.marks[1].name: "gate" is already the name of scenes.cellar.world.marks[0]',
        )
      })

      test('but two rooms may each have a gate, because you stand in one at a time', () => {
        const gate = (kind: string) => [{ kind, x: 0, y: 0, z: 0, name: 'gate' }]
        expect(
          scened({
            cellar: { world: { floorY: 0, placements: [], marks: gate('start') } },
            attic: { world: { floorY: 0, placements: [], marks: gate('finish') } },
          }),
        ).toEqual([])
      })

      test('the placement budget belongs to the document, not to each room', () => {
        // Without this the cap was 8000 *per scene*, so a document's real total
        // was however many rooms somebody felt like writing.
        const half = Array.from({ length: 4001 }, () => at('proto/Wall'))
        const problems = problemsOf({
          world: { floorY: 0, placements: half, marks: [] },
          scenes: { cellar: { world: { floorY: 0, placements: half } } },
        })
        expect(problems.length).toBe(1)
        expect(problems[0]).toStartWith('scenes: 8002 placements across the whole document')
        // And it names the rooms, because "too many" in a document with nine of
        // them is not a sentence anybody can act on.
        expect(problems[0]).toContain('main 4001, cellar 4001')
      })

      test('a document that fits is left alone', () => {
        const some = Array.from({ length: 10 }, () => at('proto/Wall'))
        expect(
          problemsOf({
            world: { floorY: 0, placements: some, marks: [] },
            scenes: { cellar: { world: { floorY: 0, placements: some } } },
          }),
        ).toEqual([])
      })
    })

    test('a load cannot fetch a room in this document', () => {
      // Falling through to the bare-id branch would turn `load cellar` into a
      // fetch for the *document* `cellar`, which is the wrong file or no file.
      expect(resolveScene('cellar', { cellar: place })).toBe(null)
      expect(resolveScene('roof', { roof: 'deep-dark' })).toEqual({
        target: 'deep-dark',
        external: false,
      })
    })
  })

  describe('resolving one', () => {
    const scenes = { cellar: 'deep-dark', roof: 'https://someone.example/roof.xp.json' }

    test('the table wins, and says whether to ask first', () => {
      expect(resolveScene('cellar', scenes)).toEqual({ target: 'deep-dark', external: false })
      expect(resolveScene('roof', scenes)).toEqual({
        target: 'https://someone.example/roof.xp.json',
        external: true,
      })
    })

    test('a bare id still works, so every document written before this keeps its doors', () => {
      expect(resolveScene('ladder-run', scenes)).toEqual({
        target: 'ladder-run',
        external: false,
      })
      expect(resolveScene('ladder-run', undefined)).toEqual({
        target: 'ladder-run',
        external: false,
      })
    })

    test('a name that resolves to nothing is a door that does not open', () => {
      // Not an error: an author may name a scene before writing it.
      expect(resolveScene('nowhere at all', scenes)).toBe(null)
    })

    test('the table shadows an id of the same name, like a hosts file over DNS', () => {
      expect(resolveScene('cellar', { cellar: 'https://elsewhere.example/x.xp.json' })).toEqual({
        target: 'https://elsewhere.example/x.xp.json',
        external: true,
      })
    })
  })
})

/**
 * A key the level invented, and the rule that listens for it.
 *
 * `player.keys` was a format with no reader: a document could bind five keys,
 * the editor could bind them by pressing them, and nothing anywhere turned a
 * press into anything. Five buttons that do nothing is a worse state than no
 * buttons, because an author sets one, believes it, and finds out from a player.
 *
 * These check the two halves that would otherwise fail silently - a rule that
 * listens for nothing, and a rule that listens for everything.
 */
describe('pressing a key the document bound', () => {
  const HATCH = {
    model: 'proto/Cube_Prototype_Small',
    props: { open: 0 },
    triggers: [
      {
        on: 'pressed',
        key: 'open the hatch',
        do: [{ op: 'setProp', key: 'open', value: 1, target: 'self' }],
      },
    ],
  }

  test('the rule fires for its own key', () => {
    const document = doc({
      blueprints: { hatch: HATCH },
      entities: [{ blueprint: 'hatch', x: 0, y: 0, z: 0 }],
      player: { keys: [{ key: 'KeyE', does: 'open the hatch' }] },
    })
    const world = spawnEntities(document)
    const id = [...world.alive][0]

    fire(world, document.blueprints, id, 'pressed', null, { key: 'open the hatch' })
    expect(world.props.get(id)?.open).toBe(1)
  })

  test('and not for a different one', () => {
    /**
     * The whole reason `key` exists. Without it every binding is the same
     * binding, and an author who bound "grab" and "drop" has one action - which
     * is most of the point of being allowed five.
     */
    const document = doc({
      blueprints: { hatch: HATCH },
      entities: [{ blueprint: 'hatch', x: 0, y: 0, z: 0 }],
    })
    const world = spawnEntities(document)
    const id = [...world.alive][0]

    fire(world, document.blueprints, id, 'pressed', null, { key: 'something else' })
    fire(world, document.blueprints, id, 'pressed', null, {})
    expect(world.props.get(id)?.open).toBe(0)
  })

  test('a pressed rule that names no key is refused', () => {
    // It would fire on nothing at all, which is the silent no-op this format
    // keeps having to be talked out of.
    expect(
      problemsOf({
        blueprints: {
          hatch: {
            model: 'proto/Cube_Prototype_Small',
            triggers: [{ on: 'pressed', do: [{ op: 'score', amount: 1 }] }],
          },
        },
      }).join('\n'),
    ).toContain('needs the key it listens for')
  })

  test('and any other rule carrying one is refused rather than ignored', () => {
    /**
     * `cameraProblems` refusing side-only fields on a follow camera is the
     * precedent. An `enter` with a `key` reads as though the key mattered; the
     * author would find out it did not from somebody playing.
     */
    expect(
      problemsOf({
        blueprints: {
          hatch: {
            model: 'proto/Cube_Prototype_Small',
            triggers: [{ on: 'enter', key: 'grab', do: [{ op: 'score', amount: 1 }] }],
          },
        },
      }).join('\n'),
    ).toContain('only a pressed or released trigger has a key')
  })

  /**
   * The reach, which is what turns a press into a place.
   *
   * A press is offered to every live entity, and that is right for a hatch you
   * are standing in front of and wrong for two flags on one field: without a
   * distance, pressing "grab" anywhere on the map takes whichever flag the
   * iteration order reached first, which is a game of chance rather than a game.
   */
  const FLAG = {
    model: 'proto/Cube_Prototype_Small',
    props: { taken: 0 },
    triggers: [
      {
        on: 'pressed',
        key: 'grab',
        within: 2,
        do: [{ op: 'setProp', key: 'taken', value: 1, target: 'self' }],
      },
    ],
  }

  const pressAt = (flagAt: { x: number; y: number; z: number }, standing: { x: number; y: number; z: number }) => {
    const document = doc({
      blueprints: { flag: FLAG },
      entities: [{ blueprint: 'flag', ...flagAt }],
      player: { keys: [{ key: 'KeyE', does: 'grab' }] },
    })
    const world = spawnEntities(document)
    const id = [...world.alive][0]
    const presser = spawnPlayer(world, document, standing)

    fire(world, document.blueprints, id, 'pressed', presser, { key: 'grab' })
    return world.props.get(id)?.taken
  }

  test('a press within reach fires', () => {
    expect(pressAt({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 1 })).toBe(1)
  })

  test('and the same press from across the level does not', () => {
    expect(pressAt({ x: 0, y: 0, z: 0 }, { x: 12, y: 0, z: 0 })).toBe(0)
  })

  test('the reach is a sphere, so height counts', () => {
    /**
     * Three cells straight up is out of reach even though it is directly
     * overhead. Measuring on the floor plane would put a thing on the balcony
     * in reach of a press made underneath it, which reads as grabbing through a
     * ceiling - and the first person to meet that bug is a player, not an author.
     */
    expect(pressAt({ x: 0, y: 3, z: 0 }, { x: 0, y: 0, z: 0 })).toBe(0)
  })

  test('a reach with nobody behind the press is refused rather than granted', () => {
    /**
     * The same answer `when.of: 'other'` gives when there is no other: a rule
     * that fires for want of a subject is the failure mode worth refusing, and
     * "no presser" firing every reach rule in the level at once is exactly that.
     */
    const document = doc({
      blueprints: { flag: FLAG },
      entities: [{ blueprint: 'flag', x: 0, y: 0, z: 0 }],
      player: { keys: [{ key: 'KeyE', does: 'grab' }] },
    })
    const world = spawnEntities(document)
    const id = [...world.alive][0]

    fire(world, document.blueprints, id, 'pressed', null, { key: 'grab' })
    expect(world.props.get(id)?.taken).toBe(0)
  })

  test('a rule with no reach still fires from anywhere, which is every rule written before this one', () => {
    const document = doc({
      blueprints: { hatch: HATCH },
      entities: [{ blueprint: 'hatch', x: 0, y: 0, z: 0 }],
      player: { keys: [{ key: 'KeyE', does: 'open the hatch' }] },
    })
    const world = spawnEntities(document)
    const id = [...world.alive][0]
    const presser = spawnPlayer(world, document, { x: 40, y: 0, z: 40 })

    fire(world, document.blueprints, id, 'pressed', presser, { key: 'open the hatch' })
    expect(world.props.get(id)?.open).toBe(1)
  })

  test('a reach on anything but a press is refused rather than ignored', () => {
    expect(
      problemsOf({
        blueprints: {
          hatch: {
            model: 'proto/Cube_Prototype_Small',
            triggers: [{ on: 'enter', within: 2, do: [{ op: 'score', amount: 1 }] }],
          },
        },
      }).join('\n'),
    ).toContain('only a pressed trigger has a reach')
  })

  test('and a reach of zero is refused, because that rule can never fire', () => {
    expect(
      problemsOf({
        blueprints: {
          flag: {
            model: 'proto/Cube_Prototype_Small',
            triggers: [{ on: 'pressed', key: 'grab', within: 0, do: [{ op: 'score', amount: 1 }] }],
          },
        },
      }).join('\n'),
    ).toContain('positive number of cells')
  })

  test('the reach survives a round trip, which is not a given', () => {
    // `key` was dropped on the way out of `readTrigger` in its first draft, and
    // `rules.respawn` had the identical bug. Every optional field this format
    // grows gets this test now.
    const document = doc({ blueprints: { flag: FLAG } })
    expect(document.blueprints.flag.triggers[0].within).toBe(2)
  })

  test('the key survives a round trip, which is not a given', () => {
    /**
     * Asserted because this exact field was dropped on the way out of
     * `readTrigger` in the first draft - parsed, validated, and then not
     * returned. `rules.respawn` had the identical bug and it took a `git diff
     * --stat` to notice, because a suite full of green tests says nothing about
     * a field nobody wrote a test for.
     */
    const document = doc({
      blueprints: { hatch: HATCH },
    })
    expect(document.blueprints.hatch.triggers[0].key).toBe('open the hatch')
  })
})

/**
 * A parent that is not level, and a child that has to come out right.
 *
 * The whole reason `composeTurn` multiplies rotations instead of adding their
 * axes. Adding is exact while everything turns about Y and *wrong* the moment
 * two axes are non-zero at once - and wrong in the way that costs most, because
 * a rider at 90/90/0 looks plausible in a panel and is somewhere else in the
 * world.
 */
describe('a rider in a kart that is climbing', () => {
  test('a kart pitched a quarter turn puts the seat where its own frame does', () => {
    // Tipped a quarter turn about +x: the seat that was a metre above and half
    // a metre back is now half a metre up and a metre *behind* - the kart's own
    // +y has become the world's +z, which is what a right-handed turn about x
    // does and is the convention three uses.
    const climbing = doc({
      blueprints: { kart: KART, rider: RIDER },
      entities: [
        { blueprint: 'kart', name: 'kart-1', x: 0, y: 0, z: 0, pitch: 90 },
        { blueprint: 'rider', parent: 'kart-1', socket: 'seat', x: 0, y: 0, z: 0 },
      ],
    })
    const world = spawnEntities(climbing)
    const placed = worldTransform(world, 1, climbing.blueprints)
    expect(placed.x).toBeCloseTo(0, 5)
    expect(placed.y).toBeCloseTo(0.5, 5)
    expect(placed.z).toBeCloseTo(1, 5)
  })

  test('the child inherits the tilt, not just the turn', () => {
    const climbing = doc({
      blueprints: { kart: KART, rider: RIDER },
      entities: [
        { blueprint: 'kart', name: 'kart-1', x: 0, y: 0, z: 0, pitch: 30 },
        { blueprint: 'rider', parent: 'kart-1', socket: 'seat', x: 0, y: 0, z: 0 },
      ],
    })
    const world = spawnEntities(climbing)
    expect(worldTransform(world, 1, climbing.blueprints).pitch).toBeCloseTo(30, 5)
  })

  /**
   * The case axis-wise addition gets wrong. A parent pitched a quarter turn
   * with a child yawed a quarter turn is not a thing at 90/90/0 - the two turns
   * do not commute, and the product has a roll in it that neither of them said.
   */
  test('a yawed child inside a pitched parent is not the sum of their axes', () => {
    const stacked = doc({
      blueprints: { kart: KART, rider: RIDER },
      entities: [
        { blueprint: 'kart', name: 'kart-1', x: 0, y: 0, z: 0, pitch: 90 },
        { blueprint: 'rider', parent: 'kart-1', x: 0, y: 0, z: 0, rotation: 90 },
      ],
    })
    const world = spawnEntities(stacked)
    const placed = worldTransform(world, 1, stacked.blueprints)
    expect(placed.roll).toBeGreaterThan(0)
    expect({ rotation: placed.rotation, pitch: placed.pitch, roll: placed.roll }).not.toEqual({
      rotation: 90,
      pitch: 90,
      roll: 0,
    })
  })

  test('a level chain is untouched, to the last decimal place', () => {
    // The promise the fast path in `composeTurn` exists for: a document that
    // never tilts anything composes through the arithmetic it always did, so no
    // level ever built moves by a floating-point hair.
    const before = doc({
      blueprints: { kart: KART, rider: RIDER },
      entities: [
        { blueprint: 'kart', name: 'kart-1', x: 10, y: 1, z: 4, rotation: 45 },
        { blueprint: 'rider', parent: 'kart-1', socket: 'seat', x: 0, y: 0, z: 0 },
      ],
    })
    const world = spawnEntities(before)
    const placed = worldTransform(world, 1, before.blueprints)
    expect(placed.rotation).toBe(45)
    expect(placed.pitch).toBe(0)
    expect(placed.roll).toBe(0)
  })

  /**
   * A child rotated inside a non-uniformly stretched parent is a *shear*, and a
   * shear is not a position, a rotation and three multipliers - there is
   * nothing to return. So the parent stretches where the child is, and the
   * child keeps the shape it always had. Stated here rather than discovered.
   */
  test('a stretched parent moves its child without reshaping it', () => {
    const wide = doc({
      blueprints: { kart: KART, rider: RIDER },
      entities: [
        { blueprint: 'kart', name: 'kart-1', x: 0, y: 0, z: 0, stretch: { y: 3 } },
        { blueprint: 'rider', parent: 'kart-1', socket: 'seat', x: 0, y: 0, z: 0 },
      ],
    })
    const world = spawnEntities(wide)
    const placed = worldTransform(world, 1, wide.blueprints)
    // The seat was a metre up on a kart three times as tall, so it is three up.
    expect(placed.y).toBeCloseTo(3, 5)
    expect(placed.stretch).toBeUndefined()
  })

  test('a tilted entity collides as the box around the tilt, never smaller', () => {
    const level = entityBox(
      { ...KART, collider: 'auto', props: {}, triggers: [], sockets: KART.sockets },
      { x: 0, y: 0, z: 0 },
      0,
      1,
    )!
    const tipped = entityBox(
      { ...KART, collider: 'auto', props: {}, triggers: [], sockets: KART.sockets },
      { x: 0, y: 0, z: 0 },
      0,
      1,
      { pitch: 40 },
    )!
    expect(tipped.minY).toBeLessThanOrEqual(level.minY)
    expect(tipped.maxY).toBeGreaterThanOrEqual(level.maxY)
    expect(tipped.maxZ - tipped.minZ).toBeGreaterThan(level.maxZ - level.minZ)
  })
})
