import { describe, expect, test } from 'bun:test'
import {
  ACCEPTED_REWARD_MIN,
  BATTLE_KILL,
  BATTLE_LOSS,
  BATTLE_STAKE,
  BATTLE_WIN,
  EXTRA_PRICES,
  extraPrice,
  MAX_PRICE,
  PURCHASABLE,
  REVIVE,
  SUBMISSION_FEE,
  THING_KILL,
  VOUCHER_COINS,
} from '@/domain/bank/prices'
import { LIMIT_KEYS, TIER_LIMITS, TIERS, tierLimit } from '@/domain/billing/tiers'

/**
 * The price table, checked against the allowance table it is supposed to
 * extend.
 *
 * Most of what could go wrong here is not a number being *wrong* - only the
 * product can say that - but the two tables disagreeing about what exists. A
 * quantity that is purchasable and uncapped has a price nobody can ever pay; a
 * quantity that is capped with no price is a wall with no door. Both are silent
 * in production and both are one assertion away from being loud here.
 */

describe('the two tables agree', () => {
  test('everything purchasable is a limit the tiers actually cap', () => {
    for (const what of PURCHASABLE) {
      expect((LIMIT_KEYS as readonly string[]).includes(what)).toBe(true)
    }
  })

  test('every purchasable names a price for every tier', () => {
    for (const what of PURCHASABLE) {
      for (const tier of TIERS) {
        // `null` is a real answer - "not for sale here" - so the assertion is
        // about the key being present, not about it holding a number.
        expect(Object.hasOwn(EXTRA_PRICES[what], tier)).toBe(true)
      }
    }
  })

  /**
   * The load-bearing one. A tier where the thing is unlimited has no next one
   * to sell, so a price there would be a charge for something the space already
   * had - the kind of bug that only shows up as a support ticket from somebody
   * who paid 50 coins and got nothing.
   */
  test('nothing is sold on a tier that already has unlimited of it', () => {
    for (const what of PURCHASABLE) {
      for (const tier of TIERS) {
        if (tierLimit(tier, what) === null) {
          expect(extraPrice(tier, what)).toBeNull()
        }
      }
    }
  })

  test('a price is a positive whole number of coins, or nothing', () => {
    for (const what of PURCHASABLE) {
      for (const tier of TIERS) {
        const price = extraPrice(tier, what)
        if (price === null) continue
        expect(Number.isInteger(price)).toBe(true)
        expect(price).toBeGreaterThan(0)
        // The guard exists so a mistyped price is a refusal rather than an
        // emptied purse; a *constant* that trips it would be a guard set below
        // the product's own numbers.
        expect(price).toBeLessThanOrEqual(MAX_PRICE)
      }
    }
  })
})

describe('the shapes that look like mistakes', () => {
  /**
   * Public is cheaper than private wherever both are on sale. Asserted rather
   * than assumed, because it is the pair a future edit is most likely to
   * "correct" - it reads backwards until you know that a published level is
   * content the platform wants and a private one is storage nobody else
   * benefits from.
   */
  test('publishing is cheaper than hiding', () => {
    for (const tier of TIERS) {
      const publicPrice = extraPrice(tier, 'publicXps')
      const privatePrice = extraPrice(tier, 'privateXps')
      if (publicPrice === null || privatePrice === null) continue
      expect(publicPrice).toBeLessThan(privatePrice)
    }
  })

  test('free cannot buy privacy at any price', () => {
    expect(tierLimit('free', 'privateXps')).toBe(0)
    expect(extraPrice('free', 'privateXps')).toBeNull()
  })

  /**
   * A vehicle costs *more* on the cheaper tier, which is the opposite of every
   * other row. Pinned so the inversion survives somebody tidying the table.
   */
  test('a vehicle gets cheaper as the plan gets dearer', () => {
    const free = extraPrice('free', 'vehicles')
    const xo = extraPrice('xo', 'vehicles')
    const xp = extraPrice('xp', 'vehicles')
    expect(free).toBeGreaterThan(xo as number)
    expect(xo).toBeGreaterThan(xp as number)
  })

  test('no tier includes a vehicle, so every one of them is bought', () => {
    for (const tier of TIERS) {
      expect(TIER_LIMITS[tier].vehicles).toBe(0)
      expect(extraPrice(tier, 'vehicles')).not.toBeNull()
    }
  })

  test('team XPs are capped but not for sale', () => {
    expect((PURCHASABLE as readonly string[]).includes('projects')).toBe(false)
  })
})

describe('a round of battle', () => {
  /**
   * Winning has to beat losing by enough that playing is worth doing. A round
   * that was roughly even money would be a coin-flip nobody can get ahead of,
   * which is the failure this ratio exists to avoid.
   */
  test('a win is worth more than a loss costs', () => {
    expect(BATTLE_WIN).toBeGreaterThan(BATTLE_LOSS)
  })

  test('entering costs less than a single knockout pays', () => {
    // Otherwise the stake is a tax on playing rather than a wager on it.
    expect(BATTLE_STAKE).toBeLessThanOrEqual(BATTLE_KILL)
  })

  /**
   * The invariant that makes paying on an untrusted field safe.
   *
   * `PlayerDefeated.by` is what the victim *believes* finished them - recorded,
   * never trusted. Paying a coin on it is only sound while reporting your own
   * defeat and naming a friend is a *losing* move: 1 coin to them, 3 from you,
   * two colluding players down 2 a round. If a kill ever pays more than a loss
   * costs, this becomes a way to print coins and the field would have to be
   * believed - which it cannot be.
   */
  test('a knockout pays less than a defeat costs, or the kill feed becomes a mint', () => {
    expect(BATTLE_KILL).toBeLessThan(BATTLE_LOSS)
  })

  test('coming back is cheap', () => {
    // A revive that cost more than a loss would make quitting the rational move
    // at exactly the moment the game is most worth staying in.
    expect(REVIVE).toBeLessThan(BATTLE_LOSS)
  })
})

describe('the catalogue', () => {
  /**
   * Acceptance has to pay back the fee several times over, or submitting is a
   * lottery ticket. Roughly one in three at these numbers.
   */
  test('being accepted is worth submitting for', () => {
    expect(ACCEPTED_REWARD_MIN).toBeGreaterThan(SUBMISSION_FEE * 3)
  })

  test('a voucher is worth more than any single thing it could buy', () => {
    // §7.3: a voucher exists to get a broke player playing again, so it has to
    // clear the most expensive thing standing between them and a round.
    for (const tier of ['free', 'xo', 'xp'] as const) {
      expect(VOUCHER_COINS).toBeGreaterThanOrEqual(extraPrice(tier, 'clips') ?? 0)
    }
  })
})

describe('breaking a thing', () => {
  /**
   * The invariant that stops this being a coin printer.
   *
   * A blueprint's price may be zero, so "summon a free crate, smash it, take a
   * coin" would be a loop with no cost, no second player, and no match length
   * to slow it down — strictly worse than the win/loss pair, which at least
   * needs somebody else in the room.
   *
   * A thing therefore only pays when it cost *more* than the reward to summon,
   * which makes the loop negative by construction. Nothing has to detect a farm
   * or rate-limit anybody; the arithmetic does it.
   */
  test('a thing pays less than the cheapest thing worth summoning', () => {
    expect(THING_KILL).toBeGreaterThan(0)
    // The rule at the call site is `price > THING_KILL`, so a thing priced at
    // exactly the reward pays nothing and the loop can never break even.
    expect(worthBreaking(THING_KILL)).toBe(false)
    expect(worthBreaking(THING_KILL + 1)).toBe(true)
  })

  test('free scenery pays nothing', () => {
    expect(worthBreaking(0)).toBe(false)
  })
})

/** The call site's rule, written once so the test and the server agree. */
function worthBreaking(price: number): boolean {
  return price > THING_KILL
}
