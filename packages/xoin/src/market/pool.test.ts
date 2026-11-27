import { describe, expect, test } from 'bun:test'

import {
  FEE_BPS,
  MIN_TRADE,
  OPENING_COINS,
  OPENING_SPECKS,
  accepts,
  quoteBuy,
  quoteSell,
  settle,
  slippage,
  unsettle,
  spotPrice,
  type Reserves,
} from './pool'
import { SPECKS } from './units'

/**
 * The pool, and the one claim the whole feature rests on.
 *
 * `docs/product/xoin.md` promises that a xoin market cannot mint a coin. That
 * is not a policy anybody enforces at a call site - it is a property of the
 * arithmetic in `pool.ts`, and this file is the thing that will notice if
 * somebody changes the arithmetic without noticing they changed the promise.
 */

const opening = (): Reserves => ({ coins: OPENING_COINS, specks: OPENING_SPECKS })

describe('the constant-product pool', () => {
  test('a buy costs coins and yields specks, and both land in the pool', () => {
    const before = opening()
    const quote = quoteBuy(before, before.specks, 20)
    expect(quote).not.toBeNull()

    const after = settle(before, quote!)
    expect(after.coins).toBe(before.coins + (quote!.coins - quote!.fee))
    expect(after.specks).toBe(before.specks - quote!.specks)
    expect(quote!.specks).toBeGreaterThan(0)
  })

  test('buying pushes the price up, selling pushes it down', () => {
    const before = opening()
    const spot = spotPrice(before.coins, before.specks)

    const bought = settle(before, quoteBuy(before, before.specks, 40)!)
    expect(spotPrice(bought.coins, bought.specks)).toBeGreaterThan(spot)

    const sold = settle(before, quoteSell(before, before.specks, 40 * SPECKS)!)
    expect(spotPrice(sold.coins, sold.specks)).toBeLessThan(spot)
  })

  test('a round trip loses money, so there is no wash-trading loop', () => {
    const before = opening()
    const buy = quoteBuy(before, before.specks, 50)!
    const mid = settle(before, buy)
    const sell = quoteSell(mid, mid.specks, buy.specks)!

    expect(sell.coins).toBeLessThan(buy.coins)
  })

  test('the pool can never pay out coins it was not given', () => {
    /*
     * The invariant, hammered. A thousand trades of random size and side
     * against one pool: the coins in it may never go below one, and the total
     * paid out to players may never exceed the total paid in.
     *
     * Deterministic rather than seeded from the clock - a property test that
     * fails once a fortnight on a different machine teaches nobody anything.
     */
    let reserves = opening()
    let paidIn = 0
    let paidOut = 0
    let fees = 0
    let held = 0
    let rng = 12_345

    const next = () => {
      rng = (Math.imul(rng, 1_103_515_245) + 12_345) >>> 0
      return rng / 0x100000000
    }

    for (let i = 0; i < 1_000; i += 1) {
      const float = reserves.specks
      if (next() < 0.5) {
        const spend = MIN_TRADE + Math.floor(next() * 500)
        const quote = quoteBuy(reserves, float, spend)
        if (!quote) continue
        reserves = settle(reserves, quote)
        paidIn += quote.coins
        fees += quote.fee
        held += quote.specks
      } else {
        if (held <= 0) continue
        const size = 1 + Math.floor(next() * held)
        // A sale under the floor is simply refused; the loop moves on.
        const quote = quoteSell(reserves, float, size)
        if (!quote) continue
        reserves = settle(reserves, quote)
        paidOut += quote.coins
        fees += quote.fee
        held -= quote.specks
      }

      expect(reserves.coins).toBeGreaterThanOrEqual(1)
    }

    expect(paidOut + fees).toBeLessThanOrEqual(paidIn + OPENING_COINS)
    expect(reserves.coins).toBe(OPENING_COINS + paidIn - paidOut - fees)
  })

  test('unsettling a fill is exactly the pool it came from, both ways round', () => {
    /*
     * A reversal has to be the inverse and not the opposite. `settle` puts
     * `coins - fee` in on a buy and takes `coins + fee` out on a sale, so
     * undoing a buy by settling a sale removes two fees that were charged once
     * - a slow leak in the one number this package promises cannot leak.
     */
    const before = opening()

    const buy = quoteBuy(before, before.specks, 40)!
    expect(unsettle(settle(before, buy), buy)).toEqual(before)

    const sell = quoteSell(before, before.specks, 40 * SPECKS)!
    expect(unsettle(settle(before, sell), sell)).toEqual(before)
  })

  test('the fee is a percent of the coin side, both ways round', () => {
    const before = opening()
    const buy = quoteBuy(before, before.specks, 1_000)!
    expect(buy.fee).toBe(Math.ceil((1_000 * FEE_BPS) / 10_000))

    const sell = quoteSell(before, before.specks, 100 * SPECKS)!
    expect(sell.fee).toBe(Math.ceil(((sell.coins + sell.fee) * FEE_BPS) / 10_000))
  })

  test('a trade too small to be charged for is refused rather than pocketed', () => {
    const deep: Reserves = { coins: 1_000_000, specks: 1_000_000 * SPECKS }
    expect(quoteBuy(deep, deep.specks, 0)).toBeNull()
    expect(quoteBuy(deep, deep.specks, -5)).toBeNull()
    expect(quoteBuy(deep, deep.specks, MIN_TRADE - 1)).toBeNull()
    expect(quoteSell(deep, deep.specks, 0)).toBeNull()

    /*
     * A sale is floored on what comes *out*, not on what goes in, so a dust
     * position in a deep pool is refused however many specks it is nominally
     * worth. That is the same rule as the buy floor and it has to be stated in
     * the sell's own terms, because the two sides measure size differently.
     */
    expect(quoteSell(deep, deep.specks, SPECKS)).toBeNull()
  })

  test('slippage is the size, not the fee - the desk shows the fee separately', () => {
    /*
     * A real bug this file caught: `price` is all-in, so comparing it to spot
     * counted the fee as slippage while the desk was also printing the fee on
     * its own line. At the minimum trade the fee is a tenth of the trade, so a
     * player would have read roughly three times the impact they were paying.
     *
     * The check is arithmetic rather than a number: whatever the pool did to
     * the price, a fee that never entered the pool cannot be part of it.
     */
    const before = opening()
    const spot = spotPrice(before.coins, before.specks)
    const buy = quoteBuy(before, before.specks, MIN_TRADE)!

    expect(buy.fee).toBeGreaterThan(0)
    expect(slippage(buy, spot)).toBeLessThan(buy.price / spot - 1)

    const intoPool = ((buy.coins - buy.fee) * SPECKS) / buy.specks
    expect(slippage(buy, spot)).toBeCloseTo(intoPool / spot - 1, 10)
  })

  test('a shallow pool charges real slippage, and says so', () => {
    const before = opening()
    const spot = spotPrice(before.coins, before.specks)
    const big = quoteBuy(before, before.specks, 100)!

    expect(slippage(big, spot)).toBeGreaterThan(0.2)

    const small = quoteBuy(before, before.specks, MIN_TRADE)!
    expect(slippage(small, spot)).toBeLessThan(slippage(big, spot))
  })

  test('a quote fills when the price moved in favour of the player, and not when it moved against', () => {
    const before = opening()
    const agreed = quoteBuy(before, before.specks, 20)!

    const better = quoteBuy(before, before.specks * 1.2, 20)!
    expect(better.specks).toBeGreaterThan(agreed.specks)
    expect(accepts(better, { specks: agreed.specks })).toBe(true)

    const worse = quoteBuy(before, Math.round(before.specks * 0.8), 20)!
    expect(worse.specks).toBeLessThan(agreed.specks)
    expect(accepts(worse, { specks: agreed.specks })).toBe(false)
  })
})
