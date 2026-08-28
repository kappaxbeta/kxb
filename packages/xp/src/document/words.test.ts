/**
 * The words a level says, in more than one language.
 *
 * The claim under test is the one the whole design rests on: a missing anything
 * - block, language, phrase - reads back as the key, which is the sentence the
 * author wrote. There is no state in which a player sees an identifier.
 */
import { describe, expect, test } from 'bun:test'
import {
  baseOf,
  canonicalLocale,
  isEmptyWords,
  isLocaleCode,
  phrasesIn,
  translator,
} from './words'

const WORDS = {
  de: { 'the gate is locked': 'das Tor ist verschlossen' },
  'de-CH': { 'the gate is locked': 'S Tor isch zue' },
}

describe('what a reader gets', () => {
  test('their own language, when the level wrote it', () => {
    expect(translator(WORDS, 'de')('the gate is locked')).toBe('das Tor ist verschlossen')
  })

  test('a region before the language', () => {
    expect(translator(WORDS, 'de-CH')('the gate is locked')).toBe('S Tor isch zue')
  })

  test('the language when the region has nothing', () => {
    const words = { de: { hello: 'hallo' } }
    expect(translator(words, 'de-AT')('hello')).toBe('hallo')
  })

  /**
   * The key, and never anything else. This is the test the format exists to
   * make pass - see the note at the top of ./words.
   */
  test('the sentence itself when the level has no block at all', () => {
    expect(translator(undefined, 'de')('the gate is locked')).toBe('the gate is locked')
  })

  test('the sentence itself when the level has no such language', () => {
    expect(translator(WORDS, 'fr')('the gate is locked')).toBe('the gate is locked')
  })

  test('the sentence itself when the language has no such phrase', () => {
    expect(translator(WORDS, 'de')('the gate is open')).toBe('the gate is open')
  })

  /** Reached from a sandbox, where anything at all can be passed. */
  test('something that is not a string comes back as one', () => {
    expect(translator(WORDS, 'de')(3 as unknown as string)).toBe('3')
  })
})

describe('a language code', () => {
  test('two or three letters, with or without a region', () => {
    expect(isLocaleCode('de')).toBe(true)
    expect(isLocaleCode('pt-BR')).toBe(true)
    expect(isLocaleCode('gsw')).toBe(true)
  })

  test('not a sentence, a path, or an empty string', () => {
    expect(isLocaleCode('')).toBe(false)
    expect(isLocaleCode('German')).toBe(false)
    expect(isLocaleCode('../etc')).toBe(false)
  })

  test('the base is what a region falls back to', () => {
    expect(baseOf('de-CH')).toBe('de')
    expect(baseOf('de')).toBe('de')
  })
})

describe('an empty block', () => {
  test('nothing at all', () => {
    expect(isEmptyWords({})).toBe(true)
  })

  /** A language somebody added and then emptied is still nothing. */
  test('a language with no phrases in it', () => {
    expect(isEmptyWords({ de: {} })).toBe(true)
  })

  test('one phrase is not nothing', () => {
    expect(isEmptyWords({ de: { a: 'b' } })).toBe(false)
  })
})

/**
 * The list an editor offers.
 *
 * A regex over source, and the tests say so: what it finds is a *suggestion*,
 * and the one thing it must never do is drop a phrase somebody already
 * translated by hand.
 */
describe('the phrases a level looks likely to say', () => {
  const level = (over: Record<string, unknown> = {}) => ({
    name: 'The Gate',
    scripts: { gate: `function onTick() { if (self.y > 2) log(t('the gate is locked')) }` },
    ...over,
  })

  test('the title leads, because it is the first thing anybody reads', () => {
    expect(phrasesIn(level())[0]).toBe('The Gate')
  })

  test('the description, when there is one', () => {
    expect(phrasesIn(level({ blurb: 'A door and a problem.' }))).toContain('A door and a problem.')
  })

  test("every t('…') in a script", () => {
    expect(phrasesIn(level())).toContain('the gate is locked')
  })

  test('double quotes and backticks too', () => {
    const both = level({
      scripts: { a: 'log(t("one"))', b: 'log(t(`two`))' },
    })
    expect(phrasesIn(both)).toContain('one')
    expect(phrasesIn(both)).toContain('two')
  })

  /** A method called `t` on somebody's own object is not a phrase. */
  test('not a t that belongs to something else', () => {
    expect(phrasesIn(level({ scripts: { a: `log(thing.t('nope'))` } }))).not.toContain('nope')
  })

  /**
   * A key built at runtime cannot be seen, which is the honest limit of a
   * regex. It is also why nothing here removes anything.
   */
  test('a key the script builds is invisible, and that is the limit', () => {
    expect(phrasesIn(level({ scripts: { a: "log(t('door ' + n))" } }))).not.toContain('door ')
  })

  test('a phrase already in the block survives, even when nothing uses it', () => {
    const hand = level({ words: { de: { 'typed in by hand': 'von Hand eingetippt' } } })
    expect(phrasesIn(hand)).toContain('typed in by hand')
  })

  test('no duplicates, and the order does not move between saves', () => {
    const twice = level({ scripts: { a: `log(t('once')); log(t('once'))` } })
    expect(phrasesIn(twice).filter((p) => p === 'once')).toHaveLength(1)
  })
})

/**
 * The shape a code is written in.
 *
 * Not cosmetic: the lookup is an exact match against what a browser reports,
 * and browsers report `pt-BR`. A panel that lowercased what an author typed
 * would build a table nothing ever matches - which is what the first version of
 * the editor's panel did, and it took using it to see.
 */
describe('a code in the shape everybody writes it in', () => {
  test('the language lowercase, a region uppercase', () => {
    expect(canonicalLocale('PT-br')).toBe('pt-BR')
  })

  test('a script subtag Titlecase, which is BCP-47 rather than an invention', () => {
    expect(canonicalLocale('zh-hant')).toBe('zh-Hant')
  })

  test('a plain language is left alone', () => {
    expect(canonicalLocale('de')).toBe('de')
  })

  /** A document is a file somebody may have written by hand. */
  test('a table written `pt-br` still answers a pt-BR reader', () => {
    expect(translator({ 'pt-br': { hello: 'olá' } }, 'pt-BR')('hello')).toBe('olá')
  })

  test('and the other way round', () => {
    expect(translator({ 'pt-BR': { hello: 'olá' } }, 'pt-br')('hello')).toBe('olá')
  })
})
