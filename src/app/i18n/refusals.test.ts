/**
 * The refusal table, and the promise it makes.
 *
 * The one thing that must hold is that nothing ever comes back worse than it
 * went in: a refusal nobody has translated reads as the English it has always
 * read as, and the half of a message that a database wrote is passed through
 * exactly, because it is the only part that says *what* failed.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import {
  REFUSAL_HEAD_KEYS,
  REFUSAL_KEYS,
  refusalIn,
  refusalTables,
} from '@/app/i18n/refusals'
import { DEFAULT_LOCALE, LOCALES } from '@/domain/i18n/locale'

describe('a refusal in German', () => {
  const de = refusalIn('de')

  test('one that is listed', () => {
    expect(de('Battle not found')).toBe('Match nicht gefunden')
  })

  test('one that is not comes back as it went in', () => {
    expect(de('Something nobody has written down yet')).toBe(
      'Something nobody has written down yet',
    )
  })

  /**
   * The half a database wrote. Translating the head and keeping the tail is the
   * whole point: "Es konnte nicht geschlossen werden: duplicate key value" says
   * both what we tried and what actually stopped it.
   */
  test('a head is translated and its tail is left alone', () => {
    expect(de('Could not close it: duplicate key value violates unique constraint')).toBe(
      'Es konnte nicht geschlossen werden: duplicate key value violates unique constraint',
    )
  })

  test('an unlisted head keeps the whole sentence', () => {
    expect(de('Could not something: because')).toBe('Could not something: because')
  })

  /** A colon inside a sentence is not a seam. */
  test('a sentence with a colon and no head is untouched', () => {
    expect(de('That is not a price.')).toBe('Das ist kein Preis.')
  })
})

describe('a refusal in English', () => {
  const en = refusalIn('en')

  test('is what the action already said', () => {
    expect(en('Battle not found')).toBe('Battle not found')
    expect(en('Could not close it: nope')).toBe('Could not close it: nope')
  })
})

/**
 * The table against the actions it translates.
 *
 * The sentence is the key, which means the key can go stale in a way no type
 * checker can see: somebody rewords a refusal in `src/domain/**`, the lookup
 * stops matching, and the translation quietly turns back into English. Nothing
 * breaks — which is exactly why it needs a test rather than a bug report.
 *
 * Reading the source is the only way to ask this. The alternative is importing
 * forty-six action modules, every one of which reaches for `next/headers` and a
 * database at import time.
 */
describe('the table and the actions agree', () => {
  const source = new Set<string>()

  /**
   * Every quoted sentence in the module, not only the ones sitting in an
   * `error:` position.
   *
   * The narrower sweep was the same question asked of one shape, and the shape
   * is not the point - a refusal reaches somebody's screen whether it is
   * written at the `return` or handed over by a helper. Five did: the mailer's
   * three come out of `mailRefusal`, and two more are zod messages, so the
   * table held five keys the sweep swore nobody said while all five were being
   * shown to people.
   *
   * The looser reading costs a false *negative* - a sentence that also appears
   * as a literal for some other reason would keep a stale key alive - and buys
   * the false positives back, which is the trade worth making: this test exists
   * to catch a reword, and a reword changes the literal wherever it lives.
   */
  const files = new Bun.Glob('src/domain/**/*.ts')
  for (const path of files.scanSync('.')) {
    if (path.endsWith('.test.ts')) continue
    const text = readFileSync(path, 'utf8')
    for (const [, said] of text.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)) {
      source.add(said.replaceAll("\\'", "'"))
    }
  }

  test('the sweep found the refusals at all', () => {
    // A guard on the guard: a regex that matches nothing would make every
    // assertion below vacuously true.
    expect(source.size).toBeGreaterThan(100)
  })

  for (const said of [...REFUSAL_KEYS].sort()) {
    test(`still said: ${said}`, () => {
      expect(source.has(said)).toBe(true)
    })
  }
})

/**
 * Every translated table says the same set of things.
 *
 * The keys are English sentences rather than symbols, so nothing stops one
 * language from carrying a row another does not - and the failure is invisible
 * in both directions. A missing key is a sentence that silently comes back in
 * English; an extra one is a translation of something no action says any more,
 * which the sweep above only checks for whichever table happens to be the
 * reference. Holding them to each other means that check covers all of them.
 */
describe('the tables carry the same keys', () => {
  const translated = LOCALES.filter((locale) => locale !== DEFAULT_LOCALE)

  for (const locale of translated) {
    const { whole, heads } = refusalTables(locale)

    test(`${locale} translates every refusal`, () => {
      const missing = REFUSAL_KEYS.filter((key) => !whole[key])
      expect(missing).toEqual([])
    })

    test(`${locale} translates nothing extra`, () => {
      const known = new Set(REFUSAL_KEYS)
      expect(Object.keys(whole).filter((key) => !known.has(key))).toEqual([])
    })

    test(`${locale} translates every head`, () => {
      const missing = REFUSAL_HEAD_KEYS.filter((key) => !heads[key])
      expect(missing).toEqual([])
    })

    test(`${locale} translates no head twice over`, () => {
      const known = new Set(REFUSAL_HEAD_KEYS)
      expect(Object.keys(heads).filter((key) => !known.has(key))).toEqual([])
    })
  }
})

/**
 * And the same promise the German half is held to, in Bulgarian: an unlisted
 * sentence comes back as it went in, and a head keeps its tail.
 */
describe('a refusal in Bulgarian', () => {
  const bg = refusalIn('bg')

  test('one that is listed', () => {
    expect(bg('Battle not found')).toBe('Мачът не е намерен')
  })

  test('one that is not comes back as it went in', () => {
    expect(bg('Something nobody has written down yet')).toBe(
      'Something nobody has written down yet',
    )
  })

  test('a head is translated and its tail is left alone', () => {
    expect(bg('Could not close it: duplicate key value violates unique constraint')).toBe(
      'Не можа да бъде затворено: duplicate key value violates unique constraint',
    )
  })

  test('an unlisted head keeps the whole sentence', () => {
    expect(bg('Could not something: because')).toBe('Could not something: because')
  })
})
