import type { XoinMode } from '@kxb/xoin'

/**
 * What can be asked of a market.
 *
 * ---------------------------------------------------------------------------
 * A trade names a side and a size, and nothing else it could profit from
 * ---------------------------------------------------------------------------
 * `docs/product/economy.md` §7 is the rule: prices come from the server and no
 * browser-facing schema accepts an amount. `RecordTrade` is where that is made
 * true for this feature - the caller says which way and how much, and every
 * coin figure on the resulting event is computed by the decider from reserves
 * it folded itself.
 *
 * The two fields that look like exceptions are not:
 *
 *   - `float` is the clock's contribution to the price, and it *is* supplied.
 *     It has to be: the float is a function of when the market opened and what
 *     time it is now, and a decider that read a clock would stop being a pure
 *     fold of its history. It is computed by the server action from the read
 *     model, never sent by a browser - see `tradeInMarket`.
 *   - `agreed` is the *worst* outcome the player accepted, which can only make
 *     a trade refuse. A caller who lies about it lies themselves out of a fill.
 */
export type XoinCommand =
  | { type: 'OpenMarket'; mode: XoinMode }
  | { type: 'SetMode'; mode: XoinMode }
  | {
      type: 'RecordTrade'
      side: 'buy' | 'sell'
      by: string
      /** Coins to spend on a buy; specks to sell on a sale. */
      size: number
      /** From `floatAt`, at the server's own clock. */
      float: number
      /** Least the player will take: specks on a buy, coins on a sale. */
      agreed?: { specks?: number; coins?: number }
    }
  | {
      type: 'ReverseTrade'
      by: string
      side: 'buy' | 'sell'
      coins: number
      specks: number
      fee: number
      why: string
    }
