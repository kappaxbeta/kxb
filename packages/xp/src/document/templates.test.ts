import { describe, expect, test } from 'bun:test'
import { TEMPLATES, templateById } from './templates'
import { parseXp } from './format'
import { buildSolids } from '../world/solids'
import { capabilityProblems } from './capabilities'
import { rulesProblems, rulesOf } from './rules'
import {
  bodiesFor,
  entityByName,
  spawnEntities,
  spawnPlayer,
  spawnWeapon,
  worldTransform,
  type EntityId,
  type EntityWorld,
} from '../world/entities'
import type { Blueprint } from './blueprints'
import { damage, fire, stepTriggers } from '../rules/triggers'
import { placeOf } from './format'

/**
 * Every template, built and walked.
 *
 * The whole point of a template is that it is finished - a skeleton with a TODO
 * in it means the first thing a new author sees is their own broken document.
 * So these assert the properties that make one usable rather than merely legal:
 * it parses, it has ground under the spawn, and the capabilities it claims are
 * ones the world actually backs up.
 */
describe.each(TEMPLATES.map((t) => [t.id, t] as const))('the %s template', (id, template) => {
  const built = () => template.build(`my-${id}`, 'Mine')

  test('parses', () => {
    // `build` throws on a document its own parser refuses, so reaching here is
    // most of the assertion - this pins it rather than relying on the throw.
    expect(() => built()).not.toThrow()
    const document = built()
    expect(parseXp(JSON.parse(JSON.stringify(document))).ok).toBe(true)
  })

  test('takes the id and name it is given', () => {
    const document = built()
    expect(document.id).toBe(`my-${id}`)
    expect(document.name).toBe('Mine')
  })

  test('has something to stand on, under the spawn', () => {
    const document = built()
    const solids = buildSolids(document.world)
    expect(solids.count).toBeGreaterThan(0)
    // Feet clear, head clear, ground below - the same three the shipped
    // documents are checked for.
    expect(solids.isSolid(document.spawn.x, document.spawn.y, document.spawn.z)).toBe(false)
    expect(solids.isSolid(document.spawn.x, document.spawn.y + 1, document.spawn.z)).toBe(false)
    expect(solids.isSolid(document.spawn.x, document.spawn.y - 1, document.spawn.z)).toBe(true)
  })

  /**
   * A capability is a claim that gets checked, and a template claiming one it
   * cannot back up would teach the wrong lesson on the first document somebody
   * opens.
   */
  test('every capability it claims is one the world backs up', () => {
    const document = built()
    for (const capability of document.capabilities) {
      expect(capabilityProblems(capability, document.world)).toEqual([])
    }
  })

  test('and its rules hold against those capabilities', () => {
    const document = built()
    expect(
      rulesProblems(rulesOf(document), document.capabilities, document.world.marks),
    ).toEqual([])
  })

  /**
   * And under the spawn of every *other* place it holds.
   *
   * The check above is the root's, which was the whole document until a
   * template could carry a second room. A back room you arrive in and fall out
   * of the bottom of is the same broken first impression as a front one, and it
   * is the one nobody would have looked at.
   */
  test('and under the spawn of every other room it holds', () => {
    const document = built()
    for (const [key, scene] of Object.entries(document.scenes ?? {})) {
      // A string is a door to another document, with no world of its own.
      if (typeof scene === 'string') continue
      const solids = buildSolids(scene.world)
      const at = scene.spawn
      expect({ [key]: solids.isSolid(at.x, at.y, at.z) }).toEqual({ [key]: false })
      expect({ [key]: solids.isSolid(at.x, at.y - 1, at.z) }).toEqual({ [key]: true })
    }
  })

  test('is small enough to read in one sitting', () => {
    // Not an arbitrary limit: a template is a thing you *move pieces of*, and a
    // level of four hundred placements is a level you edit rather than learn
    // from. If one needs to grow past this it has stopped being a template.
    expect(built().world.placements.length).toBeLessThan(120)
  })
})

/**
 * The two-rooms template, walked through both doorways.
 *
 * The generic checks above prove it parses and is standable; neither can see
 * whether the doors *work*, and a door that does not is the one failure a
 * template must never ship - an author would conclude that rooms are broken
 * rather than that this level is.
 *
 * Asked of the engine rather than of the document, because "a door you can walk
 * into" is not a shape a blueprint can be checked for: it is whether the trigger
 * volume the runtime builds reaches a body standing on the floor.
 */
describe('walking through the two-rooms template', () => {
  const built = () => templateById('two-rooms')!.build('mine', 'Mine')
  /** A person, as the box `stepTriggers` measures them by. */
  const standingAt = (x: number, z: number) => ({
    id: 500,
    box: { minX: x - 0.3, minY: 1, minZ: z - 0.3, maxX: x + 0.3, maxY: 2.7, maxZ: z + 0.3 },
  })
  /** The document as it is from inside one of its rooms - the runtime's view. */
  const inside = (document: ReturnType<typeof built>, room: string) => {
    const place = placeOf(document, room)
    if (!place) throw new Error(`no room ${room}`)
    return { ...document, ...place }
  }

  test('the pad in the lobby doorway takes you to the cellar', () => {
    const document = built()
    const world = spawnEntities(document)
    const door = document.entities[0]
    expect(
      stepTriggers(world, document.blueprints, [standingAt(door.x, door.z)], new Map()),
    ).toContainEqual({ kind: 'load', scene: 'cellar' })
  })

  test('and the one in the cellar brings you back', () => {
    const document = built()
    const cellar = inside(document, 'cellar')
    const world = spawnEntities(cellar)
    const door = cellar.entities[0]
    expect(
      stepTriggers(world, cellar.blueprints, [standingAt(door.x, door.z)], new Map()),
    ).toContainEqual({ kind: 'load', scene: 'main' })
  })

  /**
   * Arriving is not the same as arriving *on* the way back. A spawn inside the
   * door you came through is a level that bounces you between two rooms for as
   * long as you hold nothing down, and it is invisible in every other check.
   */
  test('and you do not arrive standing on either of them', () => {
    const document = built()
    for (const room of ['main', 'cellar']) {
      const here = inside(document, room)
      const world = spawnEntities(here)
      const at = here.spawn
      expect({
        [room]: stepTriggers(world, here.blueprints, [standingAt(at.x, at.z)], new Map()),
      }).toEqual({ [room]: [] })
    }
  })

  /**
   * The gap is what makes the pad findable, so it is worth pinning: a wall row
   * that quietly closed over would leave a door you can only find by walking
   * the whole perimeter.
   */
  test('the doorway is a gap you can walk through, not a wall you cannot', () => {
    const document = built()
    const solids = buildSolids(document.world)
    const door = document.entities[0]
    // Head and feet clear where the wall would have been.
    expect(solids.isSolid(door.x, 1, door.z + 2)).toBe(false)
    expect(solids.isSolid(door.x, 2, door.z + 2)).toBe(false)
    // And the wall is genuinely there on either side of the gap.
    expect(solids.isSolid(door.x + 4, 1, door.z + 2)).toBe(true)
  })
})

describe('the set', () => {
  test('every id is unique, because it is what a picker passes back', () => {
    const ids = TEMPLATES.map((template) => template.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('every one has a name and a blurb worth showing', () => {
    for (const template of TEMPLATES) {
      expect(template.name.length).toBeGreaterThan(0)
      expect(template.blurb.length).toBeGreaterThan(20)
    }
  })

  test('lookup finds them, and does not invent one', () => {
    expect(templateById('race')?.name).toBe('A race')
    expect(templateById('nothing')).toBeNull()
  })

  /**
   * Built fresh each time, so a caller that edits what it was handed cannot
   * change what the next caller gets. A shared object here would be a template
   * that slowly becomes somebody's half-finished level.
   */
  test('two builds do not share anything', () => {
    const one = TEMPLATES[0].build('a', 'A')
    const two = TEMPLATES[0].build('b', 'B')
    expect(one.world.placements).not.toBe(two.world.placements)
    one.world.placements.pop()
    expect(two.world.placements.length).toBeGreaterThan(one.world.placements.length)
  })
})

/**
 * The capture template, played rather than parsed.
 *
 * Every other test here asks whether a template is *legal*. This one asks
 * whether the one thing it exists to demonstrate actually happens, because a
 * capture-the-flag whose scoring silently never fires is exactly what this
 * template was held back from being until a condition could ask about somebody
 * else.
 */
describe('taking a flag home', () => {
  /**
   * The level, with somebody standing in it.
   *
   * `spawnPlayer` rather than an invented id, and the difference is not
   * cosmetic: the verbs refuse to write onto an entity that is not alive or has
   * no properties, so a made-up carrier would make every rule here a silent
   * no-op and the test would be asserting against the wrong thing entirely.
   */
  const open = () => {
    const document = templateById('capture')!.build('ctf', 'CTF')
    const world = spawnEntities(document)
    const runner = spawnPlayer(world, document, document.spawn)
    // And the gun in their hand, because half of what this template now
    // demonstrates is taking it away. `spawnWeapon` is the host's own call, so
    // a test that skipped it would be a level where `disarm` had nothing to
    // find and every assertion about it would pass by doing nothing.
    const gun = spawnWeapon(world, document)!
    return { document, world, runner, gun, blueprints: bodiesFor(document) }
  }

  /**
   * Walk up to it and press, which is what the pickup now is.
   *
   * The two halves are one call because a test that only pressed would pass in a
   * level where the reach did nothing: the flag stands at the far base, so the
   * press is only a pickup once the runner has been moved to it.
   */
  const take = (
    world: EntityWorld,
    blueprints: Record<string, Blueprint>,
    flag: EntityId,
    runner: EntityId,
  ) => {
    const at = world.position.get(flag)!
    world.position.set(runner, { x: at.x, y: at.y, z: at.z })
    return fire(world, blueprints, flag, 'pressed', runner, { key: 'take the flag' })
  }

  test('walking up to a flag and pressing hands it over and marks the carrier', () => {
    const { world, blueprints, runner } = open()
    const flag = entityByName(world, 'blue-flag')!

    take(world, blueprints, flag, runner)

    expect(world.parent.get(flag)?.id).toBe(runner)
    expect(world.props.get(runner)?.flag).toBe(1)
  })

  test('and the same press from across the field does nothing', () => {
    /**
     * The reason the reach is on the rule at all. Without it a press is offered
     * to every live entity, so one key would take both flags from either base -
     * which is the mode being won by whoever presses first rather than by
     * whoever crosses.
     */
    const { world, blueprints, runner } = open()
    const flag = entityByName(world, 'blue-flag')!

    // Standing at their own spawn, twenty-four cells away.
    fire(world, blueprints, flag, 'pressed', runner, { key: 'take the flag' })

    expect(world.parent.has(flag)).toBe(false)
    expect(world.props.get(runner)?.flag ?? 0).toBe(0)
  })

  test('and carrying it onto a base is the point', () => {
    const { world, blueprints, runner } = open()
    const flag = entityByName(world, 'blue-flag')!
    const base = entityByName(world, 'red-base')!

    // Empty-handed, the base says nothing at all.
    expect(fire(world, blueprints, base, 'enter', runner)).toEqual([])

    take(world, blueprints, flag, runner)
    expect(fire(world, blueprints, base, 'enter', runner)).toEqual([
      { kind: 'score', amount: 1, by: runner },
    ])
  })

  test('being hit lets go of it, where you fell', () => {
    // The rule that makes it a game rather than a footrace. Without it nobody
    // can stop a run and the fastest player wins every round unopposed.
    const { document, world, blueprints, runner } = open()
    const flag = entityByName(world, 'blue-flag')!

    take(world, blueprints, flag, runner)
    world.position.set(runner, { x: 3, y: 0, z: -2 })
    expect(world.parent.get(flag)?.id).toBe(runner)

    damage(world, blueprints, runner, 1, null)

    expect(world.parent.has(flag)).toBe(false)
    expect(world.props.get(runner)?.flag).toBe(0)
    // Where they fell, not the origin: it is there to be picked up again by
    // either side, which is the shape of a contested flag.
    const at = worldTransform(world, flag, document.blueprints)
    expect(at.x).toBeCloseTo(3, 6)
    expect(at.z).toBeCloseTo(-2, 6)
  })

  test('and a base will not score for somebody who dropped it', () => {
    const { world, blueprints, runner } = open()
    const flag = entityByName(world, 'blue-flag')!
    const base = entityByName(world, 'red-base')!

    take(world, blueprints, flag, runner)
    damage(world, blueprints, runner, 1, null)
    expect(fire(world, blueprints, base, 'enter', runner)).toEqual([])
  })

  /**
   * The half that makes a run cost something.
   *
   * Carrying the flag with a gun in your hand is a run nobody can stop, and
   * being stopped for nothing is a hit worth trading every time. So these two
   * are one pair: the gun goes when you take it, and being hit gives it back
   * and roots you where the flag landed.
   */
  test('taking it takes your gun', () => {
    const { world, blueprints, runner, gun } = open()
    const flag = entityByName(world, 'blue-flag')!
    expect(world.alive.has(gun)).toBe(true)

    take(world, blueprints, flag, runner)

    expect(world.alive.has(gun)).toBe(false)
    // Away rather than gone: it keeps the hand it hangs off, which is what lets
    // `arm` be the reverse of this rather than a second `spawnWeapon`.
    expect(world.parent.get(gun)?.id).toBe(runner)
  })

  test('and being hit hands it back and roots you for a second', () => {
    const { world, blueprints, runner, gun } = open()
    const flag = entityByName(world, 'blue-flag')!

    take(world, blueprints, flag, runner)
    const effects = damage(world, blueprints, runner, 25, null)

    expect(world.alive.has(gun)).toBe(true)
    expect(effects).toContainEqual({ kind: 'stunned', id: runner, seconds: 1 })
  })

  test('and the gun does not fall on the floor with the flag', () => {
    /**
     * `unhand` lets go of everything you are holding, and the gun is worn
     * rather than picked up. Without the exception it would land where you fell
     * beside the flag, and the `arm` in the same rule would hand back a weapon
     * that is no longer attached to anybody.
     */
    const { world, blueprints, runner, gun } = open()
    const flag = entityByName(world, 'blue-flag')!

    take(world, blueprints, flag, runner)
    damage(world, blueprints, runner, 25, null)

    expect(world.parent.has(flag)).toBe(false)
    expect(world.parent.get(gun)?.id).toBe(runner)
  })

  test('and getting it home gives it back too', () => {
    // Otherwise scoring is the move that ends your round: the only other way
    // out of the disarm is being shot.
    const { world, blueprints, runner, gun } = open()
    const flag = entityByName(world, 'blue-flag')!
    const base = entityByName(world, 'red-base')!

    take(world, blueprints, flag, runner)
    expect(world.alive.has(gun)).toBe(false)

    fire(world, blueprints, base, 'enter', runner)
    expect(world.alive.has(gun)).toBe(true)
  })

  test('and standing on it afterwards does not score again', () => {
    // The rule that only scored would have scored once a frame, which looks
    // like the mode working until somebody stands still.
    const { world, blueprints, runner } = open()
    const flag = entityByName(world, 'blue-flag')!
    const base = entityByName(world, 'red-base')!

    take(world, blueprints, flag, runner)
    fire(world, blueprints, base, 'enter', runner)
    expect(fire(world, blueprints, base, 'enter', runner)).toEqual([])
  })

  test('and you can put it down without being hit for it', () => {
    /**
     * The other way to stop carrying one, and until it existed there was only
     * the one: a run was a thing you were committed to until somebody stopped
     * you. The gun comes back, the mark goes, and nobody is rooted - the stun on
     * the hit is the punishment, and this is the choice.
     */
    const { world, blueprints, runner, gun } = open()
    const flag = entityByName(world, 'blue-flag')!

    take(world, blueprints, flag, runner)
    world.position.set(runner, { x: 3, y: 0, z: -2 })

    const effects = fire(world, blueprints, runner, 'pressed', runner, { key: 'drop the flag' })

    expect(world.parent.has(flag)).toBe(false)
    expect(world.props.get(runner)?.flag).toBe(0)
    expect(world.alive.has(gun)).toBe(true)
    // Where they were standing, like the hit: a flag that went home when it was
    // let go of would make dropping it the safe move.
    const at = world.position.get(flag)!
    expect(Math.hypot(at.x - 3, at.z + 2)).toBeLessThan(1)
    expect(effects.some((effect) => effect.kind === 'stunned')).toBe(false)
  })
})

/**
 * The shipped copy of a template, kept honest.
 *
 * `A shot` exists twice: as a starter in this file, and as a file under
 * `public/xp/xps/` so it appears on a space's shelf rather than only in the
 * picker. Two copies of one level is exactly the shape this codebase keeps
 * getting caught by - somebody fixes the crate's height in one of them and the
 * demo on the shelf goes on standing in the floor.
 *
 * So they are the same document, and this says so. If it fails, regenerate:
 *
 *     bun -e "…templateById('a-shot').build('a-shot','A shot')…" > the file
 */
describe('the shipped example', () => {
  test('is byte for byte what the template builds', async () => {
    const file = await Bun.file('public/xp/xps/a-shot.xp.json').text()
    const built = parseXp(
      JSON.parse(JSON.stringify(templateById('a-shot')!.build('a-shot', 'A shot'))),
    )
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(file).toBe(`${JSON.stringify(built.document, null, 2)}\n`)
  })
})
