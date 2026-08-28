import { describe, expect, test } from 'bun:test'
import { attempt, isNetworkError, OFFLINE_NOTE } from '@/app/components/connection'

/**
 * The predicate decides which of two screens somebody is shown, and the two are
 * opposites: an apology for our bug, or a note that their connection went. A
 * miss in either direction is worse than the crash it replaced, so the browsers
 * are pinned down here by their exact wording rather than trusted to a regex
 * somebody will loosen one day.
 */
describe('isNetworkError', () => {
  test('WebKit, which is the one that started this', () => {
    expect(isNetworkError(new TypeError('network error'))).toBe(true)
  })

  test('Chromium', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true)
  })

  test('Firefox', () => {
    expect(
      isNetworkError(new TypeError('NetworkError when attempting to fetch resource.')),
    ).toBe(true)
  })

  test('Safari', () => {
    expect(isNetworkError(new TypeError('Load failed'))).toBe(true)
  })

  test("Next's router losing a navigation", () => {
    expect(isNetworkError(new Error('Failed to fetch RSC payload for /t/a/lounge'))).toBe(
      true,
    )
  })

  test('a real bug is not a network error', () => {
    expect(isNetworkError(new TypeError("Cannot read properties of undefined"))).toBe(
      false,
    )
  })

  test("the framework's control-flow throws are not network errors", () => {
    expect(isNetworkError(new Error('NEXT_REDIRECT;replace;/tenants;307'))).toBe(false)
  })

  test('nothing thrown is nothing to hold for', () => {
    expect(isNetworkError(null)).toBe(false)
    expect(isNetworkError(undefined)).toBe(false)
  })
})

describe('attempt', () => {
  test('hands back what the action answered', async () => {
    const result = await attempt(async () => ({ ok: true as const, id: 'g1' }))
    expect(result).toEqual({ ok: true, id: 'g1' })
  })

  test('a dropped connection becomes an ordinary refusal', async () => {
    const result = await attempt(async () => {
      throw new TypeError('network error')
    })
    expect(result).toEqual({ ok: false, error: OFFLINE_NOTE })
  })

  test('anything else is rethrown, so a real bug still reaches the boundary', async () => {
    const boom = new TypeError('x.map is not a function')
    expect(
      attempt(async () => {
        throw boom
      }),
    ).rejects.toThrow(boom)
  })
})
