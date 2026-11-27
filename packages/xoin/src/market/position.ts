import { SPECKS } from './units'
import type { Quote } from './pool'

/**
 * What one player is holding, and whether they are up or down on it.
 *
 * ---------------------------------------------------------------------------
 * Why a fold rather than two numbers
 * ---------------------------------------------------------------------------
 * A balance and a holding are enough to draw a screen and not enough to answer
 * the only question anybody actually has, which is "am I winning". That needs
 * what was paid, and what was paid is not recoverable from a balance after the
 * fact - a player on 40 coins and 60 xoin could have got there from anywhere.
 *
 * So every trade is folded in as it happens and the two running totals are
 * kept. They are the same shape a purse keeps in `docs/product/economy.md` §5
 * and for the same reason: an amount explains nothing, a history explains
 * everything, and nobody can reconstruct the history later.
 *
 * ---------------------------------------------------------------------------
 * `coins` here is not always a purse
 * ---------------------------------------------------------------------------
 * In `demo` it is a made-up stake that lives as long as the tab. In `asset` and
 * `currency` it is a mirror of the real purse, and the real one is the one that
 * decides - this is what the screen draws between round trips, never what a
 * trade is checked against. `rulesOf` is where the difference is written down;
 * the arithmetic below is identical either way, which is the point of it.
 */
export interface Position {
  coins: number
  specks: number
  /** Coins handed over across every buy, fees included. */
  spent: number
  /** Coins taken home across every sale, fees already deducted. */
  returned: number
}

/** What a demo player starts with: the economy's own opening balance. */
export const DEMO_STAKE = 100

export function openPosition(coins = DEMO_STAKE): Position {
  return { coins, specks: 0, spent: 0, returned: 0 }
}

/**
 * A filled trade, applied.
 *
 * Refuses to spend coins that are not there rather than clamping, because a
 * clamp is a trade the player did not ask for. The caller has already quoted
 * against a size it offered, so a `null` here means a real disagreement -
 * two windows on the same demo, or a purse that moved underneath - and it
 * should be shown, not smoothed over.
 */
export function applyFill(position: Position, quote: Quote): Position | null {
  if (quote.side === 'buy') {
    if (quote.coins > position.coins) return null
    return {
      coins: position.coins - quote.coins,
      specks: position.specks + quote.specks,
      spent: position.spent + quote.coins,
      returned: position.returned,
    }
  }

  if (quote.specks > position.specks) return null
  return {
    coins: position.coins + quote.coins,
    specks: position.specks - quote.specks,
    spent: position.spent,
    returned: position.returned + quote.coins,
  }
}

/** What the holding is worth at a price, in whole coins, rounded down. */
export function valueAt(position: Position, price: number): number {
  return Math.floor((position.specks * price) / SPECKS)
}

/**
 * Up or down, in coins, against everything ever put in.
 *
 * Realised and unrealised together, deliberately: a player who sold at the top
 * and one still holding at the top are in the same place, and a figure that
 * only counted one of them would tell the second of those two they had made
 * nothing. It is the number a scoreboard would use, so it is the number shown.
 */
export function profitAt(position: Position, price: number): number {
  return position.returned + valueAt(position, price) - position.spent
}

/** What the whole position is worth if it were closed at this price. */
export function worthAt(position: Position, price: number): number {
  return position.coins + valueAt(position, price)
}
