import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { parseXp } from '../document/format'
import { applyVerbs } from '../rules/verbs'
import {
  SOUND_NAMES,
  SOUND_PACK,
  XP_SOUNDS,
  isSound,
  soundUrl,
} from './sounds'

/**
 * The check a generated catalogue would have given, kept as a test instead.
 *
 * `sounds.ts` is hand-written because grouping five takes of a punch into one
 * `hit` is judgement rather than a directory listing — see the note there. What
 * a listing *would* have guaranteed is that every name has a file behind it,
 * and that is the property worth keeping, because the failure mode is silence:
 * a rule that fires and plays nothing is indistinguishable from a rule that
 * never fired at all.
 *
 * This is the only test in the package that touches the filesystem, and
 * deliberately: the engine is pure and this is asserting a fact about the
 * *repository* rather than about the engine.
 */

const PUBLIC = path.join(import.meta.dir, '..', '..', '..', '..', 'public')

describe('every sound has its files', () => {
  test('and the pack is where it says it is', () => {
    expect(existsSync(path.join(PUBLIC, SOUND_PACK.path.slice(1)))).toBe(true)
  })

  test.each(Object.keys(XP_SOUNDS))('%s', (name) => {
    const sound = XP_SOUNDS[name]!
    expect(sound.takes.length).toBeGreaterThan(0)

    for (const take of sound.takes) {
      const file = path.join(PUBLIC, SOUND_PACK.path.slice(1), `${take}${SOUND_PACK.ext}`)
      expect({ name, take, exists: existsSync(file) }).toEqual({ name, take, exists: true })
    }
  })
})

describe('the alphabet', () => {
  test('is sorted, so a picker does not have to sort it', () => {
    expect([...SOUND_NAMES]).toEqual([...SOUND_NAMES].sort())
  })

  test('is exactly what the catalogue holds', () => {
    expect([...SOUND_NAMES].sort()).toEqual(Object.keys(XP_SOUNDS).sort())
  })

  test('names what happens, never what recorded it', () => {
    // The whole point of the mapping: an author types `hit`, not the filename
    // of the third take of a punch.
    for (const name of SOUND_NAMES) {
      expect(name).toMatch(/^[a-z][a-z0-9]*$/)
    }
  })
})

describe('isSound', () => {
  test('accepts every name in the pack', () => {
    for (const name of SOUND_NAMES) expect(isSound(name)).toBe(true)
  })

  /**
   * Closed rather than shape-checked, and the traversal case is why it is not
   * merely tidy: `soundUrl` puts this string into a path.
   */
  test('refuses anything else, including a name that walks out of the pack', () => {
    for (const value of [
      '',
      'HIT',
      'hit ',
      'nope',
      '../../../etc/passwd',
      'sfx/hit',
      'hit.ogg',
      42,
      null,
      undefined,
      {},
      ['hit'],
    ]) {
      expect(isSound(value)).toBe(false)
    }
  })

  test('and a key that is on every object is not a sound', () => {
    // `Object.hasOwn` rather than `in`, which would have said yes to these.
    expect(isSound('toString')).toBe(false)
    expect(isSound('constructor')).toBe(false)
    expect(isSound('__proto__')).toBe(false)
  })
})

describe('soundUrl', () => {
  test('lands inside the pack, with the extension on', () => {
    const url = soundUrl('hit', 0)
    expect(url).toBe('/xp/packs/sfx/impactPunch_medium_000.ogg')
  })

  test('walks the takes across the range of the pick', () => {
    const takes = new Set(
      [0, 0.2, 0.4, 0.6, 0.8, 0.99].map((pick) => soundUrl('hit', pick)),
    )
    // Five takes, six picks: every take reached, none out of range.
    expect(takes.size).toBe(5)
    for (const url of takes) expect(url).toMatch(/^\/xp\/packs\/sfx\/impactPunch_medium_00[0-4]\.ogg$/)
  })

  /**
   * A pick of exactly 1 is out of contract but arrives anyway — `Math.random()`
   * never returns it, a script might. The modulo is what stops it indexing off
   * the end and returning `undefined` into a URL.
   */
  test('a pick at or past the top wraps rather than falling off', () => {
    expect(soundUrl('hit', 1)).toBe('/xp/packs/sfx/impactPunch_medium_000.ogg')
    expect(soundUrl('hit', 2.5)).not.toBeNull()
  })

  test('a single-take sound is that take whatever the pick', () => {
    for (const pick of [0, 0.5, 0.99]) {
      expect(soundUrl('click', pick)).toBe('/xp/packs/sfx/click_002.ogg')
    }
  })

  test('an unknown name is null rather than a URL to nothing', () => {
    expect(soundUrl('nope', 0)).toBeNull()
    expect(soundUrl('__proto__', 0)).toBeNull()
  })
})

/**
 * Through the parser, which is where the closed list earns its keep.
 *
 * `sounds.test.ts` rather than `format.test.ts` on purpose: the whole story
 * about this alphabet — what the names are, that the files exist, and that a
 * document may only use one of them — reads in one file.
 */
describe('a document asking for a noise', () => {
  const level = (sound: unknown) => ({
    format: 'xp/1',
    id: 'snd',
    name: 'Sound',
    packs: [{ id: 'proto' }],
    world: { floorY: 0, ground: true, placements: [], marks: [] },
    blueprints: {
      bell: {
        model: 'proto/Primitive_Wall',
        triggers: [{ on: 'enter', do: [{ op: 'sound', sound }] }],
      },
    },
    entities: [{ blueprint: 'bell', name: 'bell', x: 0, y: 0, z: 0 }],
  })

  test('parses, and keeps the name rather than resolving it to a file', () => {
    const parsed = parseXp(level('fanfare'))
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.problems))
    // A name, not a URL: which of five takes is heard is the host's business,
    // and a document that stored a filename would freeze that decision.
    expect(parsed.document.blueprints.bell!.triggers![0]!.do[0]).toEqual({
      op: 'sound',
      sound: 'fanfare',
    })
  })

  test('and a name with no file behind it is refused where it is cheap', () => {
    for (const bad of ['nope', '../../../etc/passwd', '', 'HIT', 42]) {
      expect(parseXp(level(bad)).ok).toBe(false)
    }
  })

  test('the effect carries the name out to the host and changes nothing', () => {
    const world = { alive: new Set([1]), props: new Map(), position: new Map(),
      rotation: new Map(), scale: new Map(), blueprint: new Map(), name: new Map(),
      parent: new Map(), box: new Map(), returns: new Map(), pitch: new Map(),
      roll: new Map() } as never

    expect(
      applyVerbs(world, {}, [{ op: 'sound', sound: 'click' }], { self: 1, other: null }),
    ).toEqual([{ kind: 'sound', sound: 'click' }])
  })

  /**
   * The second door. `readVerb` refuses an unknown name, but a *script* builds
   * verbs at runtime out of whatever it likes — so the check is at both.
   */
  test('and a script inventing a name gets silence rather than a bad URL', () => {
    const world = { alive: new Set([1]), props: new Map(), position: new Map(),
      rotation: new Map(), scale: new Map(), blueprint: new Map(), name: new Map(),
      parent: new Map(), box: new Map(), returns: new Map(), pitch: new Map(),
      roll: new Map() } as never

    expect(
      applyVerbs(world, {}, [{ op: 'sound', sound: '../secret' }], { self: 1, other: null }),
    ).toEqual([])
  })
})
