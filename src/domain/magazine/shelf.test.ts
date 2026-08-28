import { describe, expect, test } from 'bun:test'
import type { MagazineEntry } from '@/domain/magazine/queries'
import { splitShelf } from '@/domain/magazine/shelf'
import type { PlayableXp } from '@/domain/xps/playable'

/**
 * The join between "what did this space take in" and "what may it play".
 *
 * The bug this exists to pin: a project reference carries its version, so the
 * reference on the shelf stops matching the one a place would play the moment
 * somebody saves. Matched on the string, a shelf full of levels somebody was
 * working on would all read as gone - and each of them would then appear a
 * second time in the catalogue half, ready to be taken in again under its new
 * version, which the decider would happily allow because it is a different
 * reference.
 */

const UUID = '9c9d5f5d-9b3e-4f4a-9e6a-9d0e4f2b1a77'

const xp = (over: Partial<PlayableXp> = {}): PlayableXp => ({
  ref: 'sidestep',
  name: 'Sidestep',
  blurb: null,
  cover: null,
  finish: null,
  hue: null,
  source: 'builtin',
  draft: false,
  copiedFrom: null,
  preset: 'freestyle',
  sides: null,
  scoreLimit: null,
  timeLimit: null,
  players: { min: 1, max: 8 },
  capabilities: [],
  framed: false,
  ...over,
})

const entry = (xpRef: string, name = 'Whatever it was called'): MagazineEntry => ({
  xpRef,
  name,
  addedBy: null,
  addedAt: new Date(0).toISOString(),
})

describe('the shelf half', () => {
  test('a builtin resolves to what it is', () => {
    const { inMagazine, catalogue } = splitShelf(
      [entry('sidestep', 'Sidestep')],
      [xp()],
      new Map(),
    )

    expect(inMagazine).toHaveLength(1)
    expect(inMagazine[0]?.xp?.name).toBe('Sidestep')
    expect(inMagazine[0]?.shelvedAs).toBe('sidestep')
    // And it is not offered a second time.
    expect(catalogue).toHaveLength(0)
  })

  /**
   * The fix. `p-<uuid>-v3` was shelved; the space is on v4 now.
   */
  test('a project saved since it was taken in is still on the shelf', () => {
    const { inMagazine, catalogue } = splitShelf(
      [entry(`p-${UUID}-v3`, 'Tower')],
      [xp({ ref: `p-${UUID}-v4`, name: 'Tower', source: 'space' })],
      new Map(),
    )

    expect(inMagazine).toHaveLength(1)
    expect(inMagazine[0]?.xp).not.toBeNull()
    // What a place should be given is the version this space would play now…
    expect(inMagazine[0]?.ref).toBe(`p-${UUID}-v4`)
    // …and what putting it back has to name is the one the magazine holds.
    expect(inMagazine[0]?.shelvedAs).toBe(`p-${UUID}-v3`)
    // The catalogue half must not offer it again under its new version.
    expect(catalogue).toHaveLength(0)
  })

  test('the live name wins over the one that was shelved', () => {
    const { inMagazine } = splitShelf(
      [entry(`p-${UUID}-v1`, 'Untitled')],
      [xp({ ref: `p-${UUID}-v1`, name: 'Minigolf', source: 'space' })],
      new Map(),
    )

    expect(inMagazine[0]?.name).toBe('Minigolf')
  })

  /**
   * The denormalised column earning its place: the project is gone, so there is
   * no live name to fall back to and the shelved one is the only word left.
   */
  test('an entry nothing answers to keeps its name and says it is gone', () => {
    const { inMagazine } = splitShelf([entry(`p-${UUID}-v2`, 'Tower')], [], new Map())

    expect(inMagazine[0]?.name).toBe('Tower')
    expect(inMagazine[0]?.xp).toBeNull()
    expect(inMagazine[0]?.ref).toBe(`p-${UUID}-v2`)
  })

  test('the magazine keeps its own order, newest first', () => {
    const { inMagazine } = splitShelf(
      [entry('later'), entry('earlier')],
      [xp({ ref: 'earlier' }), xp({ ref: 'later' })],
      new Map(),
    )

    expect(inMagazine.map((row) => row.ref)).toEqual(['later', 'earlier'])
  })
})

describe('the catalogue half', () => {
  test('is everything not on the shelf, in the order it arrived', () => {
    const { catalogue } = splitShelf(
      [entry('sidestep')],
      [xp({ ref: 'sidestep' }), xp({ ref: 'football-pitch' }), xp({ ref: 'minigolf' })],
      new Map(),
    )

    expect(catalogue.map((row) => row.ref)).toEqual(['football-pitch', 'minigolf'])
    expect(catalogue.every((row) => row.shelvedAs === null)).toBe(true)
  })

  /**
   * Only a builtin has these - they are read off the file, and the summary a
   * project gets is two JSON paths that do not include them. A row carrying
   * them is what lets the browse mount refuse to put out a level that would
   * open and then say "Not here" to everybody who walked in.
   */
  test('carries what the document refuses to open without', () => {
    const { catalogue } = splitShelf(
      [],
      [xp({ ref: 'steal-a-plant' })],
      new Map([['steal-a-plant', ['persistence' as const]]]),
    )

    expect(catalogue[0]?.needs).toEqual(['persistence'])
  })
})
