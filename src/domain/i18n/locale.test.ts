import { describe, expect, test } from 'bun:test'
import { localeFromAcceptLanguage, localeFromPath } from '@/domain/i18n/locale'

/**
 * This header is the only thing standing between a German reader and an English
 * app on their first visit, and it is written by a browser rather than by us -
 * so the parsing has to survive whatever shape arrives.
 */
describe('localeFromAcceptLanguage', () => {
  test('a plain tag is its language', () => {
    expect(localeFromAcceptLanguage('de')).toBe('de')
  })

  test('a region is dropped, because we ship no regional copy', () => {
    expect(localeFromAcceptLanguage('de-AT')).toBe('de')
    expect(localeFromAcceptLanguage('de-CH,de;q=0.9')).toBe('de')
  })

  test('quality ranks, so order in the string does not decide', () => {
    expect(localeFromAcceptLanguage('en;q=0.8, de;q=0.9')).toBe('de')
    expect(localeFromAcceptLanguage('de;q=0.7, en;q=0.9')).toBe('en')
  })

  test('the first tag we speak wins over later ones we also speak', () => {
    expect(localeFromAcceptLanguage('fr, de, en')).toBe('de')
  })

  test('a language we do not have falls through to English', () => {
    expect(localeFromAcceptLanguage('fr-FR,fr;q=0.9')).toBe('en')
  })

  test('q=0 is a refusal, not a preference', () => {
    expect(localeFromAcceptLanguage('de;q=0')).toBe('en')
  })

  test('a wildcard states no preference', () => {
    expect(localeFromAcceptLanguage('*')).toBe('en')
  })

  test('nothing, junk and empty all land on the default rather than throwing', () => {
    expect(localeFromAcceptLanguage(null)).toBe('en')
    expect(localeFromAcceptLanguage('')).toBe('en')
    expect(localeFromAcceptLanguage(';;;,,,')).toBe('en')
    expect(localeFromAcceptLanguage('de;q=banana')).toBe('en')
  })
})

describe('localeFromPath', () => {
  test('a prefixed path carries its locale', () => {
    expect(localeFromPath('/de/events')).toBe('de')
  })

  test('an unprefixed path is English', () => {
    expect(localeFromPath('/events')).toBe('en')
    expect(localeFromPath('/')).toBe('en')
    expect(localeFromPath(null)).toBe('en')
  })
})
