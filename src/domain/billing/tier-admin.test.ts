import { describe, expect, test } from 'bun:test'
import { readStoredLimits } from '@/domain/billing/tier-admin'
import { mergeLimits, TIER_LIMITS } from '@/domain/billing/tiers'

/**
 * Reading a `limits` column back out for editing.
 *
 * The rule being tested is one sentence long and the whole page depends on it:
 * *what the editor shows must be what the reader honours.* `mergeLimits` drops
 * anything that is not a whole non-negative integer or an explicit null, so a
 * `"12"` sitting in the column is already inherit as far as the product is
 * concerned - and an editor that drew it as twelve would tell an operator a cap
 * is in force that never was.
 *
 * So these two functions have to agree about every value, and the last test is
 * the one that says so directly.
 */

describe('a stored row keeps the difference between absent and null', () => {
  test('absent stays absent, so it can be shown as inherit', () => {
    const limits = readStoredLimits({ seats: 6 })

    expect(Object.hasOwn(limits, 'seats')).toBe(true)
    // Not `undefined` under the key - *no key*. The editor asks with
    // `Object.hasOwn`, and a present key holding undefined would read as a
    // stated value on its way back to the database.
    expect(Object.hasOwn(limits, 'guests')).toBe(false)
  })

  test('null survives, because unlimited is a value somebody chose', () => {
    const limits = readStoredLimits({ projects: null })

    expect(Object.hasOwn(limits, 'projects')).toBe(true)
    expect(limits.projects).toBeNull()
  })

  test('zero is a limit, not an absence', () => {
    expect(readStoredLimits({ pictures: 0 }).pictures).toBe(0)
  })
})

describe('anything the reader would drop is not shown either', () => {
  test('a number that arrived as a string is dropped', () => {
    // The failure this page could introduce and the constants never could:
    // somebody types into a field and a string quietly becomes a cap.
    expect(Object.hasOwn(readStoredLimits({ seats: '12' }), 'seats')).toBe(false)
  })

  test('fractions and negatives are dropped', () => {
    expect(Object.hasOwn(readStoredLimits({ seats: 2.5 }), 'seats')).toBe(false)
    expect(Object.hasOwn(readStoredLimits({ seats: -1 }), 'seats')).toBe(false)
  })

  test('a key that is not a limit is ignored', () => {
    expect(readStoredLimits({ seats: 6, sneats: 99 })).toEqual({ seats: 6 })
  })

  test('a column that is not an object at all reads as stating nothing', () => {
    expect(readStoredLimits(null)).toEqual({})
    expect(readStoredLimits([1, 2])).toEqual({})
    expect(readStoredLimits('{}')).toEqual({})
  })
})

describe('the editor and the reader agree', () => {
  test('reading a column and merging it give the same answer', () => {
    // Every shape the column can be in, including the ones an operator can
    // only produce by hand.
    const column = {
      seats: 12,
      guests: null,
      projects: '3',
      matches: -4,
      pages: 0,
      unrelated: true,
    }

    const merged = mergeLimits(TIER_LIMITS.free, column)
    const shown = readStoredLimits(column)

    // What the editor draws as stated is exactly what the merge honoured, and
    // what it draws as inherited is exactly what the merge left alone.
    expect(merged.seats).toBe(12)
    expect(shown.seats).toBe(12)

    expect(merged.guests).toBeNull()
    expect(shown.guests).toBeNull()

    expect(merged.pages).toBe(0)
    expect(shown.pages).toBe(0)

    expect(merged.projects).toBe(TIER_LIMITS.free.projects)
    expect(Object.hasOwn(shown, 'projects')).toBe(false)

    expect(merged.matches).toBe(TIER_LIMITS.free.matches)
    expect(Object.hasOwn(shown, 'matches')).toBe(false)
  })

  test('saving what was read back changes nothing', () => {
    // The round trip an operator makes by opening the page and pressing Save
    // without touching a field. It has to be a no-op, or every visit to this
    // page rewrites the rows.
    const column = { seats: 6, projects: null, matches: 15 }
    const shown = readStoredLimits(column)

    expect(mergeLimits(TIER_LIMITS.free, shown)).toEqual(
      mergeLimits(TIER_LIMITS.free, column),
    )
  })
})
