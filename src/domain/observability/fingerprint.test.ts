import { describe, expect, test } from 'bun:test'
import {
  fingerprintOf,
  isControlFlow,
  normaliseMessage,
} from '@/domain/observability/fingerprint'

describe('isControlFlow', () => {
  test('recognises a redirect, detail and all', () => {
    expect(isControlFlow('NEXT_REDIRECT;replace;/tenants;307')).toBe(true)
  })

  test('recognises the 404 fallback', () => {
    expect(isControlFlow('NEXT_HTTP_ERROR_FALLBACK;404')).toBe(true)
  })

  test('leaves a real digest alone', () => {
    expect(isControlFlow('3271819274')).toBe(false)
  })

  test('a missing digest is not control flow', () => {
    expect(isControlFlow(null)).toBe(false)
  })
})

describe('normaliseMessage', () => {
  test('rubs out the id that differs between two of the same failure', () => {
    const one = normaliseMessage(
      'Failed to load space: 1b4e28ba-2fa1-11d2-883f-0016d3cca427',
    )
    const two = normaliseMessage(
      'Failed to load space: c9bf9e57-1685-4c89-bafb-ff5af830be8a',
    )
    expect(one).toBe(two)
    expect(one).toBe('Failed to load space: <id>')
  })

  test('rubs out timestamps and counters', () => {
    expect(normaliseMessage('gave up at 2026-08-01T18:25:32.529Z after 3 tries')).toBe(
      'gave up at <time> after <n> tries',
    )
  })

  test('does not shred a hex token into digits', () => {
    // The bare-hex rule has to run before the digit rule, or two occurrences
    // of one bug stop matching for a reason that has nothing to do with them.
    expect(normaliseMessage('token 8f3a1c9b expired')).toBe('token <hash> expired')
  })

  test('keeps the part of the message that names the bug', () => {
    expect(normaliseMessage('Failed to check membership: permission denied')).toBe(
      'Failed to check membership: permission denied',
    )
  })
})

describe('fingerprintOf', () => {
  test('a digest is the key when there is one', () => {
    const key = fingerprintOf({
      source: 'server',
      digest: '3271819274',
      route: '/t/[slug]',
      message: 'An error occurred in the Server Components render',
    })
    expect(key).toBe('d:3271819274')
  })

  test('the same digest from the browser and the server is one group', () => {
    const server = fingerprintOf({
      source: 'server',
      digest: '3271819274',
      route: '/t/[slug]',
      message: 'Failed to load space',
    })
    const client = fingerprintOf({
      source: 'client',
      digest: '3271819274',
      path: '/t/acme',
      message: 'An error occurred in the Server Components render',
    })
    expect(client).toBe(server)
  })

  test('a control-flow digest never becomes the key', () => {
    const key = fingerprintOf({
      source: 'server',
      digest: 'NEXT_REDIRECT;replace;/welcome;307',
      route: '/login',
      message: 'redirect',
    })
    expect(key.startsWith('h:')).toBe(true)
  })

  test('two visits to one broken route group together', () => {
    const first = fingerprintOf({
      source: 'server',
      route: '/t/[slug]/lounge',
      path: '/t/acme/lounge',
      message: 'Failed to load space: 1b4e28ba-2fa1-11d2-883f-0016d3cca427',
    })
    const second = fingerprintOf({
      source: 'server',
      route: '/t/[slug]/lounge',
      path: '/t/other/lounge',
      message: 'Failed to load space: c9bf9e57-1685-4c89-bafb-ff5af830be8a',
    })
    expect(second).toBe(first)
  })

  test('the same message on two routes stays two groups', () => {
    const lounge = fingerprintOf({
      source: 'server',
      route: '/t/[slug]/lounge',
      message: 'Failed to check membership: permission denied',
    })
    const members = fingerprintOf({
      source: 'server',
      route: '/t/[slug]/members',
      message: 'Failed to check membership: permission denied',
    })
    expect(members).not.toBe(lounge)
  })

  test('the path stands in when there is no route', () => {
    const key = fingerprintOf({
      source: 'not-found',
      path: '/t/gone',
      message: 'Not found',
    })
    expect(key.startsWith('h:')).toBe(true)
    expect(key).not.toBe(
      fingerprintOf({ source: 'not-found', path: '/t/other', message: 'Not found' }),
    )
  })
})
