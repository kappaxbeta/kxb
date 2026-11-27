import { describe, expect, test } from 'bun:test'

import { EPOCH_MS } from './drift'
import { OPENING_COINS, OPENING_SPECKS, quoteBuy, quoteSell, settle } from './pool'
import { changeOver, floatAt, priceAt, seriesAt, type Market } from './price'

const BORN = 1_700_000_000_000

const market = (): Market => ({
  id: 'a-space',
  startedAt: BORN,
  reserves: { coins: OPENING_COINS, specks: OPENING_SPECKS },
})

describe('the price', () => {
  test('the world moves it while nobody trades', () => {
    /*
     * The reason `drift.ts` exists. A market that only moved on trades would
     * show the first player a flat line until a second one arrived, which is
     * the version of this feature nobody would open twice.
     */
    const m = market()
    const now = BORN
    const later = BORN + EPOCH_MS * 90
    expect(priceAt(m, later)).not.toBe(priceAt(m, now))
  })

  test('two clients an hour apart agree about the price at the same instant', () => {
    /*
     * The claim the closed form is for. Nothing is folded, nothing is cached,
     * and no client's history of when it happened to be open can change what it
     * computes - so this is really a test that no state crept in.
     */
    const at = BORN + EPOCH_MS * 4_321
    expect(priceAt(market(), at)).toBe(priceAt(market(), at))
    expect(floatAt(market(), at)).toBe(floatAt(market(), at))
  })

  test('the drift never touches the coin side', () => {
    /*
     * The load-bearing one. `docs/product/xoin.md` promises the market cannot
     * mint a coin, and the argument for it is that time changes only the float.
     * A future refactor that "seeded liquidity" over time would break the
     * promise silently and pass every other test in this folder.
     */
    const m = market()
    for (const epochs of [0, 1, 60, 3_000, 100_000]) {
      const at = BORN + EPOCH_MS * epochs
      expect(floatAt(m, at)).toBeGreaterThan(0)
      expect(m.reserves.coins).toBe(OPENING_COINS)
    }
  })

  test('a sale can never take out more coins than the pool holds, at any epoch', () => {
    /*
     * The pool's own invariant re-checked *through* the clock, because the
     * float a sale is priced against is the drifted one and not the stored one.
     * A rounding rule that was safe on paper could still be unsafe once the mood
     * multiplies the denominator.
     */
    const m = market()
    for (const epochs of [0, 7, 31, 173, 2_880, 12_000]) {
      const at = BORN + EPOCH_MS * epochs
      const float = floatAt(m, at)
      const quote = quoteSell(m.reserves, float, 10_000 * 1_000)
      if (!quote) continue
      expect(quote.coins + quote.fee).toBeLessThan(m.reserves.coins)
      expect(settle(m.reserves, quote).coins).toBeGreaterThanOrEqual(1)
    }
  })

  test('buying at one epoch is still worth something at the next', () => {
    const m = market()
    const at = BORN + EPOCH_MS * 10
    const buy = quoteBuy(m.reserves, floatAt(m, at), 50)!
    const after: Market = { ...m, reserves: settle(m.reserves, buy) }

    const back = quoteSell(after.reserves, floatAt(after, at + EPOCH_MS), buy.specks)
    expect(back).not.toBeNull()
    expect(back!.coins).toBeGreaterThan(0)
  })

  test('the chart has as many points as asked for, oldest first', () => {
    const ticks = seriesAt(market(), BORN + EPOCH_MS * 500, 60)
    expect(ticks).toHaveLength(60)
    expect(ticks[0].ago).toBe(59)
    expect(ticks[59].ago).toBe(0)
    expect(ticks.every((t) => t.price > 0)).toBe(true)
  })

  test('a stride draws a longer window with the same number of points', () => {
    const now = BORN + EPOCH_MS * 5_000
    const minutes = seriesAt(market(), now, 60)
    const hours = seriesAt(market(), now, 60, 60)
    expect(hours[0].ago).toBe(59 * 60)
    expect(hours[59].price).toBe(minutes[59].price)
  })

  test('the change over a window is signed and finite', () => {
    const now = BORN + EPOCH_MS * 900
    const change = changeOver(market(), now, 60)
    expect(Number.isFinite(change)).toBe(true)
    expect(Math.abs(change)).toBeLessThan(10)
  })
})
