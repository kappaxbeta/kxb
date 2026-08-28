import { describe, expect, test } from 'bun:test'
import { boxesOverlap, entityBox, type Blueprint } from '../document/blueprints'
import { findModel } from '../assets/catalogue'
import { AVATARS } from '../../../../src/domain/lounge/avatars'
import {
  bodyScaleFor,
  BUILT_IN_BODY,
  BUILT_IN_BODY_SCALE,
  blockersOf,
  despawn,
  drawList,
  emptyWorld,
  entityByName,
  isDead,
  movePlayer,
  PLAYER_ID,
  revivePlayer,
  spawnEntities,
  spawnPlayer,
  spawnWeapon,
  WEAPON_ID,
  WEAPON_NAME,
  withTag,
  worldTransform,
} from './entities'
import { bodiesFor } from './entities'
import { damage } from '../rules/triggers'
import { describeProblems, parseXp, XP_FORMAT, type XpDocument } from '../document/format'
import { EYE_HEIGHT, step, WALK_PACE } from './physics'
import { buildSolids } from './solids'

/**
 * Entities are the half of the world that is *things* rather than architecture,
 * and the half that does not live on the cell grid. Most of what is worth
 * testing is that difference: a crate stops you where it is drawn rather than
 * at the nearest metre, and a pickup does not stop you at all.
 */

const CRATE: Blueprint = {
  model: 'proto/Box_A',
  collider: 'auto',
  tags: ['breakable'],
  props: { hp: 10 },
  sockets: {},
  triggers: [],
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

describe('a blueprint becomes a box where the model is', () => {
  test('a measured collider matches the model, not the cell it is near', () => {
    // The whole reason entities are off the grid: Box_A is 0.46 across, and on
    // a one-metre lattice it would stop you a third of a metre before you touch
    // it.
    const box = entityBox(CRATE, { x: 2.4, y: 1, z: 4.2 }, 0)!
    expect(box.maxX - box.minX).toBeCloseTo(0.46, 1)
    expect(box.minX).toBeGreaterThan(2)
    expect(box.maxX).toBeLessThan(2.8)
  })

  test('a walk-through blueprint has no box at all', () => {
    const coin: Blueprint = { ...CRATE, collider: 'none' }
    expect(entityBox(coin, { x: 0, y: 0, z: 0 }, 0)).toBeNull()
  })

  test('an explicit box is centred on the entity', () => {
    const wide: Blueprint = { ...CRATE, collider: { w: 2, h: 3, d: 4 } }
    const box = entityBox(wide, { x: 10, y: 5, z: -2 }, 0)!
    expect(box.minX).toBeCloseTo(9, 5)
    expect(box.maxX).toBeCloseTo(11, 5)
    expect(box.maxZ - box.minZ).toBeCloseTo(4, 5)
  })

  test('a quarter turn swaps the box, and a half turn does not move a centred one', () => {
    const wide: Blueprint = { ...CRATE, collider: { w: 4, h: 1, d: 1 } }
    const straight = entityBox(wide, { x: 0, y: 0, z: 0 }, 0)!
    const turned = entityBox(wide, { x: 0, y: 0, z: 0 }, 90)!
    expect(straight.maxX - straight.minX).toBeCloseTo(4, 5)
    expect(turned.maxZ - turned.minZ).toBeCloseTo(4, 5)

    const half = entityBox(wide, { x: 3, y: 0, z: 7 }, 180)!
    expect(entityBox(wide, { x: 3, y: 0, z: 7 }, 0)).toEqual(half)
  })

  test('a centred model is raised so it stands, the same as on the grid', () => {
    // A barrel is drawn round its own middle, so placed on a floor at y=1 it
    // would sink to its waist. Same number the cell grid uses, from the same
    // place, so the thing you see and the thing you bump into agree.
    const barrel: Blueprint = { ...CRATE, model: 'proto/Barrel_A' }
    const box = entityBox(barrel, { x: 0, y: 1, z: 0 }, 0)!
    expect(box.minY).toBeCloseTo(1, 5)
  })

  test('boxes that only touch do not overlap', () => {
    const a = { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 }
    const b = { minX: 1, minY: 0, minZ: 0, maxX: 2, maxY: 1, maxZ: 1 }
    expect(boxesOverlap(a, b)).toBe(false)
    expect(boxesOverlap(a, { ...b, minX: 0.9 })).toBe(true)
  })
})

describe('the world at tick zero', () => {
  const document = doc({
    blueprints: { crate: CRATE, coin: { model: 'proto/Coin_A', collider: 'none', tags: ['pickup'] } },
    entities: [
      { blueprint: 'crate', x: 1, y: 0, z: 1 },
      { blueprint: 'crate', x: 3, y: 0, z: 1, props: { hp: 99 } },
      { blueprint: 'coin', x: 5, y: 1, z: 1 },
    ],
  })

  test('every entity in the document exists', () => {
    const world = spawnEntities(document)
    expect(world.alive.size).toBe(3)
    expect(world.tick).toBe(0)
  })

  test('an entity overrides its blueprint rather than replacing it', () => {
    // "A crate, but this one has twice the health" should not mean repeating
    // the model, the tags and everything else.
    const world = spawnEntities(document)
    expect(world.props.get(0)).toEqual({ hp: 10 })
    expect(world.props.get(1)).toEqual({ hp: 99 })
  })

  test('only the things with a collider become blockers', () => {
    const world = spawnEntities(document)
    expect(blockersOf(world)).toHaveLength(2)
  })

  test('despawning stops it blocking on the same tick', () => {
    // A crate you broke has to stop being in the way immediately - a stale
    // array is exactly how it does not.
    const world = spawnEntities(document)
    despawn(world, 0)
    expect(blockersOf(world)).toHaveLength(1)
    expect(world.alive.has(0)).toBe(false)
  })

  test('despawning keeps the data, because a rule fires after the death', () => {
    // Something that scores, spawns debris or sends a message wants to know
    // where the thing was and what it was.
    const world = spawnEntities(document)
    despawn(world, 0)
    expect(world.position.get(0)).toEqual({ x: 1, y: 0, z: 1 })
    expect(world.blueprint.get(0)).toBe('crate')
  })

  test('tags find the things a rule cares about', () => {
    const world = spawnEntities(document)
    expect(withTag(world, document.blueprints, 'breakable')).toEqual([0, 1])
    expect(withTag(world, document.blueprints, 'pickup')).toEqual([2])
    expect(withTag(world, document.blueprints, 'nonsense')).toEqual([])
  })

  test('the draw list is only what is alive', () => {
    const world = spawnEntities(document)
    despawn(world, 1)
    expect(drawList(world, document.blueprints).map((e) => e.id)).toEqual([0, 2])
  })
})

describe('what a sign carries into the world', () => {
  const document = doc({
    blueprints: { post: { model: 'proto/Primitive_Wall' }, crate: CRATE },
    entities: [
      { blueprint: 'post', x: 0, y: 0, z: 0, text: 'mind the gap', colour: 0xff0000, background: 0x000000 },
      { blueprint: 'crate', x: 1, y: 0, z: 1 },
    ],
  })

  test('the row exists for the sign and nowhere else', () => {
    const world = spawnEntities(document)
    expect(world.text.get(0)).toBe('mind the gap')
    expect(world.colour.get(0)).toBe(0xff0000)
    expect(world.background.get(0)).toBe(0x000000)
    // Sparse, the way `light` and `pitch` are - a crate that says nothing
    // does not get a blank row.
    expect(world.text.has(1)).toBe(false)
    expect(world.colour.has(1)).toBe(false)
    expect(world.background.has(1)).toBe(false)
  })
})

describe('walking into things', () => {
  /** A floor tile, and a crate standing on it. */
  const document = doc({
    blueprints: {
      crate: CRATE,
      // Chest height, so it is a thing you go round rather than over.
      locker: { model: 'proto/Locker', collider: { w: 1, h: 2, d: 1 }, tags: [] },
      coin: { model: 'proto/Coin_A', collider: 'none', tags: [] },
    },
    entities: [
      { blueprint: 'locker', x: 2, y: 1, z: 0 },
      { blueprint: 'coin', x: -2, y: 1.4, z: 0 },
      { blueprint: 'crate', x: 0, y: 1, z: -3 },
    ],
    world: {
      floorY: 0,
      marks: [],
      placements: [
        { model: 'proto/Primitive_Floor', x: 0, y: 0, z: 0 },
        { model: 'proto/Primitive_Floor', x: 4, y: 0, z: 0 },
        { model: 'proto/Primitive_Floor', x: -4, y: 0, z: 0 },
      ],
    },
  })

  const solids = buildSolids(document.world)

  function walk(from: number, direction: number, seconds: number) {
    const world = spawnEntities(document)
    const blockers = blockersOf(world)
    let position = { x: from, y: 1 + EYE_HEIGHT, z: 0 }
    let velocityY = 0
    let grounded = true
    let jumps = 0

    for (let i = 0; i < seconds * 60; i++) {
      const result = step({
        position,
        velocityY,
        moveX: (direction * WALK_PACE) / 60,
        moveZ: 0,
        jump: false,
        grounded,
        jumps,
        delta: 1 / 60,
        isSolid: solids.isSolid,
        blockers,
        floorY: -100,
      })
      position = result.position
      velocityY = result.velocityY
      grounded = result.grounded
      jumps = result.jumps
    }
    return position
  }

  test('something chest-high stops you', () => {
    const end = walk(0, 1, 1)
    // Stopped short of it rather than standing inside it.
    expect(end.x).toBeLessThan(2)
    expect(end.x).toBeGreaterThan(1)
  })

  test('something knee-high is stepped onto, not walked into', () => {
    /**
     * A crate is half a metre tall, which is under the step height - so walking
     * into one puts you on top of it, and that is right. The first version of
     * this file asserted the opposite and failed, which was the test being
     * wrong about the game rather than the other way round: a level built out
     * of low crates is a level you climb.
     */
    const world = spawnEntities(document)
    const blockers = blockersOf(world)
    let position = { x: 0, y: 1 + EYE_HEIGHT, z: -3 }
    let velocityY = 0
    let grounded = true
    let jumps = 0
    let highest = 1
    for (let i = 0; i < 40; i++) {
      const result = step({
        position,
        velocityY,
        moveX: 0,
        moveZ: -WALK_PACE / 60 / 4,
        jump: false,
        grounded,
        jumps,
        delta: 1 / 60,
        isSolid: solids.isSolid,
        blockers,
        floorY: -100,
      })
      position = result.position
      velocityY = result.velocityY
      grounded = result.grounded
      jumps = result.jumps
      highest = Math.max(highest, position.y - EYE_HEIGHT)
    }
    expect(highest).toBeGreaterThan(1.4)
  })

  test('a pickup does not', () => {
    const end = walk(0, -1, 1)
    expect(end.x).toBeLessThan(-3)
  })

  test('a crate you break stops stopping you', () => {
    const world = spawnEntities(document)
    despawn(world, 0)
    const blockers = blockersOf(world)

    let position = { x: 0, y: 1 + EYE_HEIGHT, z: 0 }
    let velocityY = 0
    let grounded = true
    let jumps = 0
    for (let i = 0; i < 60; i++) {
      const result = step({
        position,
        velocityY,
        moveX: WALK_PACE / 60,
        moveZ: 0,
        jump: false,
        grounded,
        jumps,
        delta: 1 / 60,
        isSolid: solids.isSolid,
        blockers,
        floorY: -100,
      })
      position = result.position
      velocityY = result.velocityY
      grounded = result.grounded
      jumps = result.jumps
    }
    expect(position.x).toBeGreaterThan(3)
  })
})

/**
 * The player, and what they are carrying.
 *
 * Both are entities, which is the decision worth pinning: the body is drawn by
 * the same instancer as the crates, a script can find either by name, and the
 * gun turns with the body because it hangs off a socket rather than because
 * anything follows anything.
 */
describe('the player’s body', () => {
  const armed = () =>
    doc({
      packs: [{ id: 'proto' }, { id: 'dummy' }],
      blueprints: {
        marksman: {
          model: 'dummy/Dummy',
          collider: 'none',
          props: { hp: 100, ammo: 24 },
          sockets: { hand: { x: 0.4, y: 1.2, z: 0.3 } },
        },
        pistol: { model: 'proto/Gun_Pistol', collider: 'none', props: { damage: 5, range: 60 } },
      },
      player: { blueprint: 'marksman', weapon: { blueprint: 'pistol', socket: 'hand' } },
    })

  /**
   * This read `{}`, which made `props` the one part of a blueprint that did not
   * apply to the player - so a document declaring a body with `hp: 100` produced
   * a player with no health, and every rule about it read zero. The symptom is a
   * shooter where everybody is already dead and nothing says so.
   */
  test('starts with its blueprint’s properties', () => {
    const world = emptyWorld()
    spawnPlayer(world, armed(), { x: 0, y: 1, z: 0 })
    expect(world.props.get(PLAYER_ID)).toEqual({ hp: 100, ammo: 24 })
  })

  test('the built-in dummy still has none', () => {
    const world = emptyWorld()
    spawnPlayer(world, doc(), { x: 0, y: 1, z: 0 })
    expect(world.props.get(PLAYER_ID)).toEqual({})
  })

  /**
   * The two facts the host knows and the document does not.
   *
   * `Mark.team` has been in the format since the format existed and nothing in a
   * document could ever ask about it: a level could paint a red spawn and a blue
   * one and then not write a single rule that knew which one you came out of.
   */
  test('the side somebody is on is a property on their body', () => {
    const world = emptyWorld()
    spawnPlayer(world, doc(), { x: 0, y: 1, z: 0 }, { team: 'red' })
    expect(world.props.get(PLAYER_ID)).toEqual({ 'team:red': 1 })
    // And nothing at all for the side they are not, which reads as zero - so
    // "everybody not on red" is true before the sides are known as well as after.
    expect(world.props.get(PLAYER_ID)?.['team:blue']).toBeUndefined()
  })

  test('and so is what they were dealt', () => {
    const world = emptyWorld()
    spawnPlayer(world, armed(), { x: 0, y: 1, z: 0 }, { team: 'blue', role: 'bug' })
    expect(world.props.get(PLAYER_ID)).toEqual({ hp: 100, ammo: 24, 'team:blue': 1, bug: 1 })
  })

  /**
   * The bug this parameter exists for, and it was live.
   *
   * `revivePlayer` re-seeds the properties from the blueprint, which is what
   * makes coming back indistinguishable from arriving - and it was therefore
   * also un-dealing whoever came back. A player dealt `bug` stopped being the bug
   * the first time they died, and no rule that had read it could say why.
   */
  test('both survive dying, because coming back re-seeds the properties', () => {
    const world = emptyWorld()
    const document = armed()
    const who = { team: 'red', role: 'bug' }
    spawnPlayer(world, document, { x: 0, y: 1, z: 0 }, who)

    world.props.get(PLAYER_ID)!.hp = 0
    revivePlayer(world, document, { x: 0, y: 1, z: 0 }, who)

    expect(world.props.get(PLAYER_ID)).toEqual({ hp: 100, ammo: 24, 'team:red': 1, bug: 1 })
  })

  test('a blueprint that guesses at a side is overruled by the room', () => {
    // The room decides which side somebody is on. An author who wrote it into
    // their body's properties was guessing, and guessing at this is worse than
    // silence: it would put everybody on the same side.
    const world = emptyWorld()
    const document = armed()
    document.blueprints.marksman!.props = { hp: 100, 'team:blue': 1 }
    spawnPlayer(world, document, { x: 0, y: 1, z: 0 }, { team: 'red' })
    expect(world.props.get(PLAYER_ID)).toEqual({ hp: 100, 'team:blue': 1, 'team:red': 1 })
  })

  test('the weapon hangs off the socket and turns with the body', () => {
    const world = emptyWorld()
    const document = armed()
    spawnPlayer(world, document, { x: 10, y: 1, z: 4, facing: 0 })
    const weapon = spawnWeapon(world, document)!

    const forward = worldTransform(world, weapon, document.blueprints)
    expect(forward.x).toBeCloseTo(10.4, 5)
    expect(forward.y).toBeCloseTo(2.2, 5)
    expect(forward.z).toBeCloseTo(4.3, 5)

    // Turned round: the offset turns with the parent rather than being added to
    // it, which is the whole reason a socket is not a sum of positions.
    movePlayer(world, { x: 10, y: 1, z: 4 }, 180)
    const behind = worldTransform(world, weapon, document.blueprints)
    expect(behind.x).toBeCloseTo(9.6, 5)
    expect(behind.z).toBeCloseTo(3.7, 5)
  })

  test('a document with no weapon gets none', () => {
    const world = emptyWorld()
    const document = doc()
    spawnPlayer(world, document, { x: 0, y: 1, z: 0 })
    expect(spawnWeapon(world, document)).toBeNull()
    expect(world.alive.has(WEAPON_ID)).toBe(false)
  })

  test('the gun is a thing a script can find, and it is not a thing you bump into', () => {
    const world = emptyWorld()
    const document = armed()
    spawnPlayer(world, document, { x: 0, y: 1, z: 0 })
    spawnWeapon(world, document)
    expect(entityByName(world, WEAPON_NAME)).toBe(WEAPON_ID)
    // No box, so it is not in the blockers and not something a shot lands on.
    expect(world.box.has(WEAPON_ID)).toBe(false)
  })
})

/**
 * Dying, and coming back.
 *
 * The gap this closes: `damage` clamped health at zero and fired the `damaged`
 * triggers, and nothing anywhere read the zero. So a document could describe
 * spikes that hurt and a saw that cuts, and standing in either did nothing at
 * all - which is indistinguishable from a level whose rules are broken.
 */
describe('running out of health', () => {
  const doc = (props: Record<string, number>): XpDocument => {
    const parsed = parseXp({
      format: XP_FORMAT,
      id: 'd',
      name: 'D',
      packs: [{ id: 'proto' }],
      blueprints: { body: { model: 'proto/Box_A', props } },
      player: { blueprint: 'body' },
      world: { floorY: 0, placements: [], marks: [] },
    })
    if (!parsed.ok) throw new Error(describeProblems(parsed.problems))
    return parsed.document
  }

  test('a body at zero is dead', () => {
    const xp = doc({ hp: 3 })
    const world = emptyWorld()
    spawnPlayer(world, xp, { x: 0, y: 0, z: 0 })
    expect(isDead(world, PLAYER_ID)).toBe(false)

    damage(world, bodiesFor(xp), PLAYER_ID, 3)
    expect(isDead(world, PLAYER_ID)).toBe(true)
  })

  /**
   * The half that is easy to get wrong. A missing property reads as zero
   * everywhere else in this engine, so a thing with no health at all would
   * otherwise be born dead - and most of a level is scenery with no health.
   */
  test('but a body with no health at all is not', () => {
    const xp = doc({})
    const world = emptyWorld()
    spawnPlayer(world, xp, { x: 0, y: 0, z: 0 })
    expect(isDead(world, PLAYER_ID)).toBe(false)
  })

  test('reviving puts them back, with what they started with', () => {
    const xp = doc({ hp: 3, ammo: 7 })
    const world = emptyWorld()
    spawnPlayer(world, xp, { x: 12, y: 4, z: -6 })

    damage(world, bodiesFor(xp), PLAYER_ID, 3)
    world.props.get(PLAYER_ID)!.ammo = 0
    expect(isDead(world, PLAYER_ID)).toBe(true)

    revivePlayer(world, xp, { x: 1, y: 2, z: 3, facing: 90 })

    expect(isDead(world, PLAYER_ID)).toBe(false)
    expect(world.props.get(PLAYER_ID)).toEqual({ hp: 3, ammo: 7 })
    expect(world.position.get(PLAYER_ID)).toEqual({ x: 1, y: 2, z: 3 })
    expect(world.rotation.get(PLAYER_ID)).toBe(90)
    expect(world.alive.has(PLAYER_ID)).toBe(true)
  })

  /**
   * Coming back is arriving. Anything that made the two differ would be a
   * second seeding routine to keep in step with the first.
   */
  test('and coming back is indistinguishable from arriving', () => {
    const xp = doc({ hp: 3 })

    const arrived = emptyWorld()
    spawnPlayer(arrived, xp, { x: 1, y: 2, z: 3, facing: 45 })

    const returned = emptyWorld()
    spawnPlayer(returned, xp, { x: 9, y: 9, z: 9 })
    damage(returned, bodiesFor(xp), PLAYER_ID, 99)
    revivePlayer(returned, xp, { x: 1, y: 2, z: 3, facing: 45 })

    expect(returned.props.get(PLAYER_ID)).toEqual(arrived.props.get(PLAYER_ID)!)
    expect(returned.position.get(PLAYER_ID)).toEqual(arrived.position.get(PLAYER_ID)!)
    expect(returned.rotation.get(PLAYER_ID)).toBe(arrived.rotation.get(PLAYER_ID)!)
  })
})

/**
 * A bouncy entity, which is a crate with a number in its prop bag.
 *
 * The prop bag is the deliberate choice here - see the note in `blockersOf` -
 * so these are about the two things that choice costs: the number has to be
 * carried onto the blocker at all, and it has to be checked, because `props` is
 * the one field a *script* can write and the format never saw.
 */
describe('a bouncy entity', () => {
  function padWorld(bounce: unknown) {
    const world = emptyWorld()
    const id = 1
    world.alive.add(id)
    world.box.set(id, { minX: -1, minY: 0, minZ: -1, maxX: 1, maxY: 1, maxZ: 1 })
    world.props.set(id, { bounce } as Record<string, number>)
    return world
  }

  test('its springiness reaches the controller as a blocker', () => {
    const [box] = blockersOf(padWorld(4))
    expect(box.bounce).toBe(4)
  })

  test('a crate with nothing to say carries no bounce field at all', () => {
    const world = emptyWorld()
    world.alive.add(1)
    world.box.set(1, { minX: -1, minY: 0, minZ: -1, maxX: 1, maxY: 1, maxZ: 1 })
    const [box] = blockersOf(world)
    expect(box.bounce).toBeUndefined()
  })

  /**
   * The one that matters. `jumpSpeedFor` is a `Math.sqrt`, so a negative here
   * is a `NaN` velocity, a `NaN` position, and a body that leaves the world with
   * nothing logged. A script can write `props` directly, so the format's own
   * refusal never sees this value.
   */
  test('a script that writes nonsense into props cannot produce a NaN body', () => {
    for (const nonsense of [-3, 0, Number.NaN, Infinity, 'high']) {
      const [box] = blockersOf(padWorld(nonsense))
      expect(box.bounce).toBeUndefined()
    }
  })

  test('and it actually launches a player who lands on it', () => {
    const landed = step({
      position: { x: 0, y: 1.05 + EYE_HEIGHT, z: 0 },
      velocityY: -10,
      moveX: 0,
      moveZ: 0,
      jump: false,
      grounded: false,
      delta: 1 / 60,
      isSolid: () => false,
      blockers: blockersOf(padWorld(5)),
      floorY: -Infinity,
    })
    expect(landed.velocityY).toBeGreaterThan(0)
    expect(landed.grounded).toBe(false)
  })
})

describe('the body a document did not bring', () => {
  const bare = (): XpDocument => {
    const parsed = parseXp({
      format: 'xp/1', id: 'bare', name: 'Bare',
      packs: [{ id: 'proto' }], spawn: { x: 0, y: 1, z: 0, facing: 0 },
      blueprints: {}, entities: [],
      world: { floorY: 0, ground: true, placements: [], marks: [] },
    })
    if (!parsed.ok) throw new Error(describeProblems(parsed.problems))
    return parsed.document
  }

  test('is the dummy when nobody has chosen an animal', () => {
    expect(bodiesFor(bare())[BUILT_IN_BODY]?.model).toBe('dummy/Dummy')
    expect(bodyScaleFor(bare())).toBe(BUILT_IN_BODY_SCALE)
  })

  test('is still the dummy when the level has not asked for animals', () => {
    // The creator's choice, not the player's: a level that says nothing wants
    // a person in it, whatever anybody has picked for themselves elsewhere.
    expect(bodiesFor(bare(), 'fox')[BUILT_IN_BODY]?.model).toBe('dummy/Dummy')
  })

  /**
   * A named body keeps its behaviour and changes its face.
   *
   * The first version refused this pair outright, on the argument that a level
   * naming its own body had decided. That conflated two things: a blueprint is
   * a model *and* its triggers, and Peepz Park names a `peep` so that a key is
   * a dash - which has no opinion about which animal is doing it.
   */
  test('a named body wears your animal and keeps its rules', () => {
    const parsed = parseXp({
      format: 'xp/1', id: 'named', name: 'Named',
      packs: [{ id: 'peepz' }], spawn: { x: 0, y: 1, z: 0, facing: 0 },
      player: { blueprint: 'peep', wears: 'profile' },
      blueprints: {
        peep: {
          model: 'peepz/fox',
          collider: 'none',
          tags: ['player'],
          props: { hp: 100 },
          triggers: [{ on: 'pressed', key: 'dash', do: [{ op: 'dash', target: 'self', cells: 5 }] }],
        },
      },
      entities: [],
      world: { floorY: 0, ground: true, placements: [], marks: [] },
    })
    if (!parsed.ok) throw new Error(describeProblems(parsed.problems))

    const worn = bodiesFor(parsed.document, 'penguin')
    expect(worn.peep?.model).toBe('peepz/penguin')
    // Everything the level actually wrote is untouched.
    expect(worn.peep?.triggers).toHaveLength(1)
    expect(worn.peep?.props.hp).toBe(100)
    expect(worn.peep?.tags).toEqual(['player'])
  })

  test('is your own animal when the level asked for profiles', () => {
    const level = wearing('profile')
    expect(bodiesFor(level, 'fox')[BUILT_IN_BODY]?.model).toBe('peepz/fox')
    // Already a person's height, so it is not shrunk the way the dummy is.
    expect(bodyScaleFor(level, 'fox')).toBe(1)
  })

  test('and a random one for somebody who has never chosen', () => {
    // Not a mannequin among animals, which reads as broken rather than unset.
    const model = bodiesFor(wearing('profile'), null, 'somebody')[BUILT_IN_BODY]?.model
    expect(model?.startsWith('peepz/')).toBe(true)
  })

  test('random is the same animal on every screen and every day', () => {
    // A function of who they are, so nobody has to send it and it does not
    // change at a reload. Same argument `ownerOf` makes about the election.
    const one = bodiesFor(wearing('random'), 'fox', 'abc')[BUILT_IN_BODY]?.model
    const two = bodiesFor(wearing('random'), 'penguin', 'abc')[BUILT_IN_BODY]?.model
    expect(one).toBe(two)
    expect(one).not.toBe(bodiesFor(wearing('random'), null, 'xyz')[BUILT_IN_BODY]?.model)
  })

  test('an animal the pack does not have falls back rather than 404s', () => {
    // Falls through to a random one, which is still an animal - the level asked
    // for animals.
    const model = bodiesFor(wearing('profile'), 'dragon', 'who')[BUILT_IN_BODY]?.model
    expect(model?.startsWith('peepz/')).toBe(true)
    expect(bodiesFor(bare(), null)[BUILT_IN_BODY]?.model).toBe('dummy/Dummy')
  })

  const wearing = (look: 'profile' | 'random'): XpDocument => ({
    ...bare(),
    player: { ...bare().player, wears: look },
  })

  test('every avatar the profile offers is a model the peepz pack ships', () => {
    // The one thing keeping the hard-coded list honest. The lounge and the
    // creator draw from two different asset sets that happen to hold the same
    // twenty-four animals, and a name in one and not the other is a body that
    // silently does not load.
    for (const animal of AVATARS) {
      expect(bodiesFor(wearing('profile'), animal)[BUILT_IN_BODY]?.model).toBe(`peepz/${animal}`)
      expect(findModel(`peepz/${animal}`)).toBeTruthy()
    }
  })
})
