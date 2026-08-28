import { describe, expect, test } from 'bun:test'
import type { XpChoice } from '@/app/t/[slug]/battle/summon-wizard'
import { filtersFor, matchingXps } from '@/app/t/[slug]/battle/xp-picker'

/**
 * Which levels a tab and a search leave standing.
 *
 * The `yours` rule is the one nobody would guess from reading the tabs, and it
 * lived in a `useMemo` in the middle of a 934-line component: *everything this
 * space has a claim on* - its shelf, the levels we ship, and its own saved work
 * - with exactly one exclusion, a store level nobody has taken in.
 */

const xp = (over: Partial<XpChoice> & Pick<XpChoice, 'ref' | 'source'>): XpChoice => ({
  name: over.ref,
  blurb: null,
  cover: null,
  finish: null,
  hue: null,
  shelved: false,
  draft: false,
  preset: 'freestyle' as never,
  scoreLimit: null,
  timeLimit: null,
  players: { min: 1, max: 8 },
  capabilities: [],
  ...over,
})

const OURS = xp({ ref: 'kickabout', source: 'builtin', name: 'Kickabout' })
const MINE = xp({ ref: 'mine', source: 'space', name: 'My Level' })
const SHELVED = xp({ ref: 'taken', source: 'store', name: 'Taken In', shelved: true })
const IN_STORE = xp({ ref: 'onsale', source: 'store', name: 'On Sale' })
const ALL = [OURS, MINE, SHELVED, IN_STORE]

const refs = (list: readonly XpChoice[]) => list.map((x) => x.ref)

describe('the yours tab', () => {
  test('is everything the space has a claim on', () => {
    expect(refs(matchingXps(ALL, 'yours', ''))).toEqual(['kickabout', 'mine', 'taken'])
  })

  /** The one exclusion, and the whole reason the store is its own tab. */
  test('leaves out a store level nobody has taken in', () => {
    expect(refs(matchingXps(ALL, 'yours', ''))).not.toContain('onsale')
  })

  test('but keeps a store level once it is shelved', () => {
    expect(refs(matchingXps(ALL, 'yours', ''))).toContain('taken')
  })
})

describe('the other tabs', () => {
  test('magazine is the shelf, whatever a level came from', () => {
    expect(refs(matchingXps(ALL, 'magazine', ''))).toEqual(['taken'])
  })

  test('builtin, space and store each read their source', () => {
    expect(refs(matchingXps(ALL, 'builtin', ''))).toEqual(['kickabout'])
    expect(refs(matchingXps(ALL, 'space', ''))).toEqual(['mine'])
    expect(refs(matchingXps(ALL, 'store', ''))).toEqual(['taken', 'onsale'])
  })

  /** The store tab shows the whole store, shelved or not - that is its job. */
  test('and store does not hide what has already been taken in', () => {
    expect(refs(matchingXps(ALL, 'store', ''))).toContain('taken')
  })
})

describe('the search', () => {
  test('an empty search keeps the whole tab', () => {
    expect(matchingXps(ALL, 'yours', '').length).toBe(3)
    expect(matchingXps(ALL, 'yours', '   ').length).toBe(3)
  })

  test('matches a name, whatever the case', () => {
    expect(refs(matchingXps(ALL, 'yours', 'KICK'))).toEqual(['kickabout'])
    expect(refs(matchingXps(ALL, 'yours', 'my lev'))).toEqual(['mine'])
  })

  /** A level's own sentence is often the only place its subject is written. */
  test('and matches a blurb as well as a name', () => {
    const withBlurb = [xp({ ref: 'a', source: 'space', name: 'A', blurb: 'a race up a ladder' })]
    expect(refs(matchingXps(withBlurb, 'yours', 'ladder'))).toEqual(['a'])
  })

  test('a level with no blurb is not a crash', () => {
    expect(matchingXps([MINE], 'yours', 'nothing')).toEqual([])
  })

  test('the search applies within the tab, not across it', () => {
    // 'On Sale' matches the text, but is not in `yours`.
    expect(refs(matchingXps(ALL, 'yours', 'sale'))).toEqual([])
    expect(refs(matchingXps(ALL, 'store', 'sale'))).toEqual(['onsale'])
  })
})

describe('which tabs are offered', () => {
  test('yours is always there', () => {
    expect(filtersFor([])).toEqual(['yours'])
  })

  /**
   * A filter that can only ever return nothing is a control that teaches
   * somebody the picker is broken.
   */
  test('and the rest only when the space has one of that kind', () => {
    expect(filtersFor([MINE])).toEqual(['yours', 'space'])
    expect(filtersFor([OURS])).toEqual(['yours', 'builtin'])
    expect(filtersFor([IN_STORE])).toEqual(['yours', 'store'])
  })

  test('magazine appears as soon as anything is shelved', () => {
    expect(filtersFor([SHELVED])).toContain('magazine')
    expect(filtersFor([IN_STORE])).not.toContain('magazine')
  })

  test('the order is always the same', () => {
    expect(filtersFor(ALL)).toEqual(['yours', 'magazine', 'builtin', 'space', 'store'])
  })
})
