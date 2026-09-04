import { describe, expect, test } from 'bun:test'
import { backTo } from './route'

/**
 * Where the language switch puts you down.
 *
 * Half of these are about not losing somebody's place, and half are about the
 * fact that this builds a redirect out of a request header. The second half is
 * the reason the function exists rather than the redirect being inline: an
 * open redirect is a phishing primitive, and "it takes the Referer" is exactly
 * the shape of code that should have to prove it rejects things.
 */

const ORIGIN = 'https://kxb.team'
const ORIGINS = [ORIGIN]

describe('returning to the page you were on', () => {
  test('a page with no locale in its path comes back as itself', () => {
    expect(backTo(`${ORIGIN}/xo-universe`, ORIGINS, 'en')).toBe('/xo-universe')
  })

  test('switching to German prefixes a page that has a German route', () => {
    expect(backTo(`${ORIGIN}/events`, ORIGINS, 'de')).toBe('/de/events')
  })

  test('and leaves alone a page that does not', () => {
    // The bug: `/de/xo-universe` does not exist, so this used to 404 somebody
    // for choosing their own language. The page reads the cookie this handler
    // just wrote, so staying put *is* the German channel.
    expect(backTo(`${ORIGIN}/xo-universe`, ORIGINS, 'de')).toBe('/xo-universe')
  })

  test('a nested path under a translated root is prefixed too', () => {
    expect(backTo(`${ORIGIN}/community/de-de`, ORIGINS, 'de')).toBe('/de/community/de-de')
  })

  test('switching to English strips the prefix the page was carrying', () => {
    expect(backTo(`${ORIGIN}/de/events`, ORIGINS, 'en')).toBe('/events')
  })

  test('the front page stays the front page in its own language', () => {
    expect(backTo(`${ORIGIN}/de`, ORIGINS, 'bg')).toBe('/bg')
  })

  test('Bulgarian keeps a below-the-fold path unprefixed, because it has no routes there', () => {
    // `PublicLocale` is en|de: `/bg/xo-universe` does not exist, and inventing
    // it here would 404 somebody for choosing their own language.
    expect(backTo(`${ORIGIN}/xo-universe`, ORIGINS, 'bg')).toBe('/xo-universe')
  })

  test('a query string survives the round trip', () => {
    expect(backTo(`${ORIGIN}/browse?q=cafe`, ORIGINS, 'en')).toBe('/browse?q=cafe')
  })
})

describe('every origin this app answers on', () => {
  test('the request\'s own origin counts, not just the configured one', () => {
    // The bug: in development the configured URL is 127.0.0.1 and the browser
    // is on localhost, so every switch fell back to the landing page. Behind a
    // tunnel or on a LAN address it would have done the same.
    expect(backTo('http://localhost:3000/xo-universe', [ORIGIN, 'http://localhost:3000'], 'en')).toBe(
      '/xo-universe',
    )
  })

  test('and an origin on neither list is still refused', () => {
    expect(backTo('http://localhost:3000/x', [ORIGIN, 'http://127.0.0.1:3000'], 'en')).toBe('/')
  })
})

describe('what it refuses', () => {
  test('no Referer at all falls back to the landing page', () => {
    expect(backTo(null, ORIGINS, 'de')).toBe('/de')
  })

  test('another origin cannot choose where we send somebody', () => {
    expect(backTo('https://evil.example/pay', ORIGINS, 'en')).toBe('/')
  })

  test('a protocol-relative Referer is a host, not a path on ours', () => {
    expect(backTo('//evil.example/pay', ORIGINS, 'en')).toBe('/')
  })

  test('a doubled slash cannot become a host on the way out', () => {
    // The one that was actually exploitable: this passes the origin check,
    // because `new URL` reads it as our host with a `//evil.example` path -
    // and `new URL('//evil.example', origin)` resolves to *their* origin.
    expect(backTo(`${ORIGIN}//evil.example`, ORIGINS, 'en')).toBe('/')
  })

  test('a backslash stays on our own origin, however odd the path looks', () => {
    // Not a redirect off-site: the parser keeps our host, so the worst case is
    // a 404 on a path of ours. Pinned so a future change cannot quietly turn
    // it into something that leaves.
    expect(backTo('https://kxb.team\\@evil.example/', ORIGINS, 'en')).toBe('/@evil.example/')
  })

  test('junk that is not a URL falls back rather than throwing', () => {
    expect(backTo('not a url', ORIGINS, 'en')).toBe('/')
  })

  test('it never sends you back to itself, which would bounce', () => {
    expect(backTo(`${ORIGIN}/lang/de`, ORIGINS, 'bg')).toBe('/bg')
  })
})
