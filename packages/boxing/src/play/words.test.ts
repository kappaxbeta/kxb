import { describe, expect, test } from 'bun:test'

import { BOXING_BG, BOXING_DE, BOXING_EN, say, wordsFor, type BoxingWords } from './words'

/**
 * What can actually go wrong with a dictionary, tested and nothing else.
 *
 * Not whether the German is good German - no test can tell you that. These are
 * the three failures that are mechanical, that a reviewer reading two hundred
 * lines of translation will miss, and that each produce a screen somebody has to
 * report from play:
 *
 *   - a key that exists in one language and not another, which is a blank
 *   - a slot dropped in translation, which is a fighter with no name in the
 *     sentence announcing they won
 *   - a slot *invented* in translation, which prints `{name}` at somebody
 */

const LANGUAGES: readonly (readonly [string, BoxingWords])[] = [
  ['de', BOXING_DE],
  ['bg', BOXING_BG],
]

/** Every leaf, as `a.b.c` -> the string. Arrays are leaves indexed by position. */
function flatten(value: unknown, path = ''): Record<string, string> {
  if (typeof value === 'string') return { [path]: value }
  const out: Record<string, string> = {}
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    Object.assign(out, flatten(child, path ? `${path}.${key}` : key))
  }
  return out
}

const slotsOf = (phrase: string) =>
  [...phrase.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!).sort()

describe('every language says everything', () => {
  const english = flatten(BOXING_EN)

  for (const [name, dict] of LANGUAGES) {
    test(`${name} has exactly the phrases English has`, () => {
      expect(Object.keys(flatten(dict)).sort()).toEqual(Object.keys(english).sort())
    })

    test(`${name} has no blank phrases`, () => {
      for (const [key, phrase] of Object.entries(flatten(dict))) {
        expect(phrase.trim(), key).not.toBe('')
      }
    })

    test(`${name} keeps every slot, and invents none`, () => {
      const translated = flatten(dict)
      for (const [key, source] of Object.entries(english)) {
        expect(slotsOf(translated[key]!), key).toEqual(slotsOf(source))
      }
    })
  }
})

describe('picking a language', () => {
  test('the three we ship', () => {
    expect(wordsFor('en')).toBe(BOXING_EN)
    expect(wordsFor('de')).toBe(BOXING_DE)
    expect(wordsFor('bg')).toBe(BOXING_BG)
  })

  test('a region is still the language', () => {
    // `de-AT` is German. We ship no regional copy, and refusing a Swiss reader
    // their language over a suffix is a bug they cannot do anything about.
    expect(wordsFor('de-CH')).toBe(BOXING_DE)
    expect(wordsFor('BG-bg')).toBe(BOXING_BG)
  })

  test('a language we do not have is English, not a crash', () => {
    // The locale comes from a host this package has never met. A game that threw
    // on `fr` would be a game a correct host can break by being ahead of it.
    expect(wordsFor('fr')).toBe(BOXING_EN)
    expect(wordsFor('')).toBe(BOXING_EN)
    expect(wordsFor(null)).toBe(BOXING_EN)
    expect(wordsFor(undefined)).toBe(BOXING_EN)
  })
})

describe('filling a phrase', () => {
  test('names and numbers go in', () => {
    expect(say(BOXING_EN.callout.wins, { name: 'Ali' })).toBe('Ali wins')
    expect(say(BOXING_DE.callout.round, { n: 2 })).toBe('Runde 2')
    expect(say(BOXING_BG.callout.round, { n: 3 })).toBe('Рунд 3')
  })

  test('a slot with nothing for it is left alone rather than blanked', () => {
    // Visible in play and greppable, where an empty string is a sentence with a
    // hole in it that nobody can report precisely.
    expect(say('{name} wins', {})).toBe('{name} wins')
  })

  test('a value that is not asked for changes nothing', () => {
    expect(say('Fight', { name: 'Ali' })).toBe('Fight')
  })
})
