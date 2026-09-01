import { describe, expect, test } from 'bun:test'
import { unpaidSpaces } from '@/domain/billing/entitlement'
import { UNLIMITED } from '@/domain/billing/limits'

/**
 * The one sum that decides whether somebody may make another space.
 *
 * It is tested because it drifted. The arithmetic was written out twice - once
 * in `readEntitlement` for the summary a page renders its button from, once in
 * `createTenant` for the gate that button leads to - and only the first of them
 * subtracted a live grant. The two therefore disagreed by exactly one seat, in
 * the direction that offers a comped account a space and then refuses it.
 *
 * What a grant is *worth* is decided in `readLiveGrants` and deliberately not
 * here: this function is handed a number of spaces and does not care which
 * grant said so.
 */
describe('unpaidSpaces', () => {
  test('a fresh account with nothing owned owes nothing', () => {
    expect(unpaidSpaces({ owned: { total: 0, subscribed: 0 }, stripeSeats: 0, grantCovers: 0 }))
      .toBe(0)
  })

  test('a space with no plan behind it is the thing being counted', () => {
    expect(unpaidSpaces({ owned: { total: 1, subscribed: 0 }, stripeSeats: 0, grantCovers: 0 }))
      .toBe(1)
  })

  test('a subscribed space pays for itself', () => {
    expect(unpaidSpaces({ owned: { total: 2, subscribed: 2 }, stripeSeats: 0, grantCovers: 0 }))
      .toBe(0)
  })

  test('a legacy seat holds one space up', () => {
    expect(unpaidSpaces({ owned: { total: 2, subscribed: 0 }, stripeSeats: 1, grantCovers: 0 }))
      .toBe(1)
  })

  test('a grant holds up as many spaces as it covers', () => {
    const owned = { total: 3, subscribed: 0 }
    expect(unpaidSpaces({ owned, stripeSeats: 0, grantCovers: 0 })).toBe(3)
    expect(unpaidSpaces({ owned, stripeSeats: 0, grantCovers: 1 })).toBe(2)
    expect(unpaidSpaces({ owned, stripeSeats: 0, grantCovers: 2 })).toBe(1)
  })

  test('comped for every space means none of them is unpaid, however many there are', () => {
    expect(
      unpaidSpaces({ owned: { total: 40, subscribed: 0 }, stripeSeats: 0, grantCovers: UNLIMITED }),
    ).toBe(0)
  })

  test('they add up rather than competing, so nobody loses a space by holding both', () => {
    expect(unpaidSpaces({ owned: { total: 3, subscribed: 1 }, stripeSeats: 1, grantCovers: 1 }))
      .toBe(0)
  })

  test('never negative: more cover than spaces is generosity, not a credit', () => {
    expect(unpaidSpaces({ owned: { total: 1, subscribed: 1 }, stripeSeats: 4, grantCovers: 1 }))
      .toBe(0)
  })
})
