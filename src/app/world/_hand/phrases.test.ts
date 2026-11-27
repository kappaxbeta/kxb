import { describe, expect, test } from 'bun:test'

import { handFor, LETTERS } from './alphabet'
import { costOf } from './fingers'
import { PHRASES, phraseOf, spellingOf, wordingOf } from './phrases'
import { LOCALES } from '@/domain/i18n/locale'

describe('the phrasebook', () => {
  test('no two phrases are spelled the same', () => {
    const spellings = PHRASES.map((signed) => signed.letters.join(''))
    expect(new Set(spellings).size).toBe(PHRASES.length)
  })

  test('every phrase is worded in every language', () => {
    for (const { phrase } of PHRASES) {
      for (const locale of LOCALES) expect(wordingOf(phrase, locale).length).toBeGreaterThan(0)
    }
  })

  test('a phrase is only its whole run, never the tail of a longer one', () => {
    expect(phraseOf(['h', 'e'])).toBe('hello')
    // The letters of hello, with a word around them. See the note in phrases.ts.
    expect(phraseOf(['t', 'h', 'e'])).toBeNull()
  })

  test('spelling one is spelling letters this alphabet has', () => {
    for (const { letters } of PHRASES) {
      for (const letter of letters) expect(LETTERS).toContain(letter)
    }
  })

  test('the help hand is one somebody in trouble can make', () => {
    // The phrase most likely to be signed badly, quickly, by someone who has
    // just learned it. Both its hands stay on the cheap half of the ranking.
    for (const letter of spellingOf('help')) expect(costOf(handFor(letter))).toBeLessThan(4)
  })
})
