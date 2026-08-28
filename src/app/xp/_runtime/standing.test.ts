/**
 * Standing in one room of a document that has several.
 *
 * The runtime was written against a document with one world in it, and all of
 * it is still right - what it needs is to be handed the room rather than the
 * file. These are the four ways that can go wrong.
 */
import { describe, expect, test } from 'bun:test'
import { parseXp, XP_FORMAT, type XpDocument } from '@kxb/xp'
import { askedFor, standingIn } from '@/app/xp/_runtime/standing'
import { sceneTopic } from '@/lib/xp-rooms'

const PAD = { model: 'proto/Cube_Prototype_Small' }

const doc = (over: Record<string, unknown> = {}): XpDocument => {
  const parsed = parseXp({
    format: XP_FORMAT,
    id: 'night-arcade',
    name: 'Night arcade',
    packs: [{ id: 'proto' }],
    blueprints: { pad: PAD },
    entities: [{ blueprint: 'pad', name: 'lobby-pad', x: 0, y: 0, z: 0 }],
    world: { floorY: 0, placements: [{ model: 'proto/Cube_Prototype_Small', x: 1, y: 0, z: 0, rotation: 0 }] },
    spawn: { x: 0, y: 1, z: 2, facing: 180 },
    ...over,
  })
  if (!parsed.ok) throw new Error(parsed.problems.map((p) => `${p.at}: ${p.message}`).join('\n'))
  return parsed.document
}

const CELLAR = {
  name: 'The cellar',
  world: {
    floorY: 9,
    placements: [{ model: 'proto/Cube_Prototype_Small', x: 4, y: 9, z: 4, rotation: 0 }],
    marks: [{ kind: 'start', x: 2, y: 9, z: 2, facing: 0, width: 1, height: 1 }],
  },
  spawn: { x: 5, y: 10, z: 5, facing: 90 },
}

describe('which world is on screen', () => {
  test('`main` is the document itself, unchanged', () => {
    const xp = doc()
    expect(standingIn(xp, 'main')).toBe(xp)
  })

  test('a scene brings its own world and its own spawn', () => {
    const here = standingIn(doc({ scenes: { cellar: CELLAR } }), 'cellar')
    expect(here.world.floorY).toBe(9)
    expect(here.world.placements).toHaveLength(1)
    expect(here.world.placements[0]!.x).toBe(4)
    expect(here.spawn).toEqual({ x: 5, y: 10, z: 5, facing: 90 })
  })

  /**
   * The one that would be a bug rather than a gap. Inheriting the root's actors
   * would put the lobby's pad in the back room - every pickup, turret and door
   * in every room at once, all firing their rules on somebody standing nowhere
   * near them.
   */
  test('and none of the root’s actors come with it', () => {
    const xp = doc({ scenes: { cellar: CELLAR } })
    expect(xp.entities).toHaveLength(1)
    expect(standingIn(xp, 'cellar').entities).toEqual([])
  })

  /**
   * And the room's own do, which is the half of S1 the format was missing. An
   * empty back room was the honest reading of a format that could not say
   * otherwise; now the document says, and this hands over what it said.
   */
  test('the room’s own actors are the ones on screen', () => {
    const xp = doc({
      scenes: {
        cellar: { ...CELLAR, entities: [{ blueprint: 'pad', name: 'way-up', x: 1, y: 9, z: 1 }] },
      },
    })
    const here = standingIn(xp, 'cellar')
    expect(here.entities.map((entity) => entity.name)).toEqual(['way-up'])
    // The lobby's pad is not among them, and the cellar's is not in the lobby.
    expect(xp.entities.map((entity) => entity.name)).toEqual(['lobby-pad'])
  })

  test('what the game owns rather than the room stays', () => {
    const here = standingIn(doc({ scenes: { cellar: CELLAR } }), 'cellar')
    expect(here.blueprints.pad).toBeDefined()
    expect(here.id).toBe('night-arcade')
    expect(here.scenes?.cellar).toBeDefined()
  })

  /**
   * A name that is not a place leaves you where you were. The caller has
   * already been told - `planLoad` answers `closed` and the ticker says so -
   * and a level that goes black on top of that is a second failure for one
   * mistake.
   */
  test('a name that is not a place is not a black screen', () => {
    const xp = doc({ scenes: { cellar: CELLAR } })
    expect(standingIn(xp, 'attic')).toBe(xp)
    expect(standingIn(doc({ scenes: { away: 'deep-dark' } }), 'away').world.floorY).toBe(0)
  })
})

/**
 * The room a caller may ask a session to open in - the editor's Try, which
 * means "try *this* room" rather than "play the level from the top".
 */
describe('the room a caller asks for', () => {
  test('nobody asked, so the document decides', () => {
    expect(askedFor(doc({ scenes: { cellar: CELLAR } }), undefined)).toBeNull()
  })

  test('a room this level holds is the room you get', () => {
    expect(askedFor(doc({ scenes: { cellar: CELLAR } }), 'cellar')).toBe('cellar')
  })

  /**
   * `main` is a room you can ask for by name, and that is the point of the
   * whole function. The editor's own "nowhere in particular" is `undefined`,
   * so without a name for the root a level whose `enter` is a back room would
   * open there when somebody pressed Try standing in the front one.
   */
  test('and so is the level itself', () => {
    expect(askedFor(doc({ scenes: { cellar: CELLAR } }), 'main')).toBe('main')
    expect(askedFor(doc(), 'main')).toBe('main')
  })

  /**
   * A room that is gone sends the decision back to the document rather than
   * into an empty screen: the editor's preview is closed while a room is
   * removed, and a caller can simply have guessed.
   */
  test('a room this level does not hold is not a room', () => {
    expect(askedFor(doc({ scenes: { cellar: CELLAR } }), 'attic')).toBeNull()
    expect(askedFor(doc(), 'cellar')).toBeNull()
  })

  /** A door is somewhere else entirely, with no world to open in. */
  test('and neither is a door out of the level', () => {
    expect(askedFor(doc({ scenes: { away: 'deep-dark' } }), 'away')).toBeNull()
  })
})

describe('the topic', () => {
  /**
   * Uniform, including `main`. The special case - a bare `<room>` for the root
   * and a slash for everything else - is the trap it looks like it avoids: two
   * spellings for one place, so a client on `abc` and one on `abc/main` would
   * both believe they were in the lobby and neither would see the other.
   */
  test('always carries the scene', () => {
    expect(sceneTopic('abc123', 'main')).toBe('abc123/main')
    expect(sceneTopic('abc123', 'cellar')).toBe('abc123/cellar')
  })

  test('and the room is still the part before the slash', () => {
    expect(sceneTopic('abc123', 'cellar').split('/')[0]).toBe('abc123')
  })
})
