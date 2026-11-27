import { EPOCH_MS, epochAt, mined, moodMultiplier, seedOf } from './drift'
import { FLOOR_SPECKS, spotPrice, type Reserves } from './pool'

/**
 * A market, and what its price is right now.
 *
 * This is the file that puts the clock together with the book. `pool.ts` knows
 * arithmetic and no time; `drift.ts` knows time and no book; a price needs
 * both, and the addition happens here exactly once so nothing downstream is
 * tempted to do it differently.
 */

export interface Market {
  /**
   * What makes this space's market its own story.
   *
   * Hashed into the phases of the mood waves, so two spaces that opened on the
   * same day and have never been traded in still show different charts. A
   * market id rather than a tenant id at this level, because the demo market
   * has no tenant behind it and still has to have a shape.
   */
  id: string
  /** When epoch 0 was, in wall-clock milliseconds. */
  startedAt: number
  reserves: Reserves
}

/**
 * The xoin side of the market at a moment: what trading left, plus what the
 * world has minted since, moved by the mood.
 *
 * The floor is a backstop and not an expectation. Reaching it means somebody
 * bought very nearly the entire float, which a constant-product pool prices at
 * approximately all of the coins in existence - so in practice this clamp is
 * dead code that exists because the alternative to dead code here is a
 * division by zero in front of a player.
 */
export function floatAt(market: Market, now: number): number {
  const e = epochAt(market.startedAt, now)
  const raw = (market.reserves.specks + mined(e)) * moodMultiplier(seedOf(market.id), e)
  return Math.max(FLOOR_SPECKS, Math.round(raw))
}

/** Coins per whole xoin, right now. */
export function priceAt(market: Market, now: number): number {
  return spotPrice(market.reserves.coins, floatAt(market, now))
}

/** One point on the chart. */
export interface Tick {
  /** Epochs before now. 0 is the current one. */
  ago: number
  price: number
}

/**
 * The line behind the number.
 *
 * ---------------------------------------------------------------------------
 * What this chart is honest about, and what it is not
 * ---------------------------------------------------------------------------
 * It re-prices *today's* book against the mood at each past epoch. So it is a
 * true picture of what the world did and a false one of what the room did: a
 * whale who bought an hour ago does not appear as a step, because their coins
 * are in the reserves used for every point including the ones before they
 * traded.
 *
 * That is the right trade for a chart drawn by a client with no history to
 * read, and it stops being necessary the moment a space installs the market
 * for real - there the trade log has the reserves at every version, and the
 * series is drawn from that instead. Demo mode has no log and never will, so
 * this stays.
 *
 * Stated here rather than discovered later, because a chart that quietly
 * disagrees with the trade you just made is worse than one that admits it.
 */
export function seriesAt(market: Market, now: number, points: number, stride = 1): Tick[] {
  const e = epochAt(market.startedAt, now)
  const seed = seedOf(market.id)
  const ticks: Tick[] = []
  for (let i = points - 1; i >= 0; i -= 1) {
    const at = Math.max(0, e - i * stride)
    const raw = (market.reserves.specks + mined(at)) * moodMultiplier(seed, at)
    ticks.push({
      ago: i * stride,
      price: spotPrice(market.reserves.coins, Math.max(FLOOR_SPECKS, Math.round(raw))),
    })
  }
  return ticks
}

/**
 * How much the price has moved over a window, as a fraction.
 *
 * The number under the ticker, and the only statistic this market computes.
 * Everything else a real exchange shows - volume, depth, a book - is either
 * meaningless at four players or already visible in the price.
 */
export function changeOver(market: Market, now: number, epochs: number): number {
  const then = priceAt(market, now - epochs * EPOCH_MS)
  if (then <= 0) return 0
  return priceAt(market, now) / then - 1
}
