import { SPECKS } from './units'

/**
 * The market maker: a pool of coins on one side, xoin on the other.
 *
 * ---------------------------------------------------------------------------
 * Why a pool and not an order book
 * ---------------------------------------------------------------------------
 * An order book needs two people who want opposite things at the same moment.
 * A space with four members does not have that and never will, so a book there
 * is a screen showing nothing, and the first trade anybody tries to make sits
 * unfilled until they close the tab. A pool always has a price and always
 * fills, which is the only version of this that works at the size these spaces
 * actually are.
 *
 * It is also the version that can be *checked*. The whole safety argument for
 * this feature rests on one sentence - the market can never pay out coins that
 * were not paid in - and with a constant product that sentence is arithmetic
 * rather than a policy somebody has to remember to enforce.
 *
 * ---------------------------------------------------------------------------
 * The invariant, stated once
 * ---------------------------------------------------------------------------
 * Selling computes the pool's new coin balance as `ceil(k / newFloat)`, which
 * is at least 1 for any positive `k`. So a sale always leaves at least one coin
 * behind, and no sequence of sales can take out more than was put in. There is
 * no branch here that pays a player from anywhere but `reserves.coins`, and
 * there must never be one: `docs/product/economy.md` §6.2 is the argument, and
 * `pool.test.ts` is the thing that will notice.
 *
 * Nothing in this file knows what time it is. The xoin side of the market moves
 * with the clock (see `drift.ts`) and the caller passes the float in, so the
 * arithmetic can be tested against numbers rather than against a schedule.
 */

/**
 * What is actually stored for a market.
 *
 * `coins` is the pool's own balance and only a trade changes it.
 *
 * `specks` is *not* the xoin side of the market. It is the part of that side
 * that trading is responsible for - the opening float, plus everything sold
 * back in, minus everything bought out. The rest of the float is mined and
 * moods, which are a function of the clock and are therefore not worth writing
 * down. `floatAt` in `price.ts` is where the two are added up, and it is the
 * only thing that should be adding them up.
 */
export interface Reserves {
  coins: number
  specks: number
}

/**
 * What a market opens with, and why these two numbers rather than any others.
 *
 * The ratio is the opening price: 200 coins against 400 xoin is half a coin a
 * xoin. That is deliberately cheap - `OPENING_COINS` in the economy is 100, so
 * a player who has never earned anything can still take a position worth
 * watching, and losing it is a lesson rather than a wipeout.
 *
 * The depth is the more consequential half. 200 coins is shallow, and shallow
 * is right: it means a single member buying twenty coins' worth visibly moves
 * the price, which is the entire drama on offer. A deep pool would be a stable
 * price, and a stable price is a savings account.
 */
export const OPENING_COINS = 200
export const OPENING_SPECKS = 400 * SPECKS

/** Below this the market is treated as sold out. One whole xoin. */
export const FLOOR_SPECKS = SPECKS

/**
 * The house's cut, in basis points, off the coin side of every trade.
 *
 * One percent, and it is the reason this feature is a drain rather than a
 * merry-go-round. `docs/product/economy.md` §6.1 names "a faucet with no drain"
 * as the failure to watch for in a space; a market with no fee would be neither
 * - coins would circle between members forever and the space's bank would never
 * see one.
 *
 * It also settles wash trading without a rule about it. Buying and immediately
 * selling the same position costs the fee on both legs plus the price impact of
 * both, every time, so there is no loop here that ends up ahead. See
 * `MIN_TRADE` for what integer coins do to that promise at small sizes.
 */
export const FEE_BPS = 100

/**
 * The smallest trade the market will take, in coins.
 *
 * This number is not a policy, it is arithmetic made visible. A coin is an
 * integer, so a one percent fee on anything under a hundred coins is a fraction
 * of a coin - and a fee that rounds to nothing is a market where buying and
 * immediately selling is free, which is the loop the fee exists to close.
 *
 * The fee therefore rounds *up*, which makes small trades proportionally
 * expensive: one coin on ten is ten percent. That is the correct signal and it
 * is also why there is a floor here rather than only a rounding rule - without
 * one, a two-coin trade would pay fifty percent, and a player would have found
 * that out by paying it.
 *
 * Ten, against an opening purse of a hundred: a player can still take ten
 * positions with what they start with, and nobody can accidentally hand the
 * bank most of a trade.
 */
export const MIN_TRADE = 10

/** The side a trade is on. Named, because `boolean` at a call site says nothing. */
export type Side = 'buy' | 'sell'

/**
 * A price offered for a specific size, at a specific moment.
 *
 * Every field is settled: this is what would happen, not an estimate to be
 * refined later. The caller shows it, the player accepts it, and the authority
 * re-computes it at its own epoch before writing anything - see `accepts`.
 */
export interface Quote {
  side: Side
  /** Coins the player parts with (buy) or takes home (sell). Always after fee. */
  coins: number
  /** Specks the player takes home (buy) or parts with (sell). */
  specks: number
  /** The space's bank's share, already excluded from `coins`. */
  fee: number
  /**
   * What this trade really costs the player, per whole xoin - fee and impact
   * both. The all-in number, from the side of the person pressing the button:
   * for a buy it is what left their purse divided by what arrived, and for a
   * sale it is what arrived divided by what left.
   *
   * Display only. Nothing settles from it; `coins` and `specks` are the trade.
   */
  price: number
}

/**
 * The price of doing nothing: coins per whole xoin at the current ratio.
 *
 * A float, and the only float in this package. It is what the ticker draws and
 * what a chart plots; no trade is ever settled from it, because a trade of any
 * size moves the ratio it is computed from. That gap between the quoted spot
 * and what you actually get is slippage, and it is a feature - it is how a
 * shallow pool tells you that you are the market.
 */
export function spotPrice(coins: number, float: number): number {
  if (float <= 0) return 0
  return (coins * SPECKS) / float
}

/**
 * Spending `spend` coins.
 *
 * Rounding goes to the pool on both lines - the fee rounds down so the player
 * is never charged a fraction of a coin they did not agree to, and the specks
 * paid out round down so the pool is never short. A trade too small to move a
 * speck is refused rather than taking the coins for nothing.
 */
export function quoteBuy(reserves: Reserves, float: number, spend: number): Quote | null {
  if (!Number.isFinite(spend) || spend < MIN_TRADE || float < FLOOR_SPECKS) return null

  const fee = Math.ceil((spend * FEE_BPS) / 10_000)
  const into = spend - fee
  if (into <= 0) return null

  const k = reserves.coins * float
  const nextFloat = Math.ceil(k / (reserves.coins + into))
  const specks = float - nextFloat
  if (specks <= 0) return null

  return { side: 'buy', coins: spend, specks, fee, price: (spend * SPECKS) / specks }
}

/**
 * Selling `specks` back.
 *
 * The mirror, with the fee taken off what comes out rather than what goes in,
 * so the percentage a player pays is the same on both legs of a round trip.
 */
export function quoteSell(reserves: Reserves, float: number, specks: number): Quote | null {
  if (!Number.isFinite(specks) || specks <= 0 || float < FLOOR_SPECKS) return null

  const k = reserves.coins * float
  const nextCoins = Math.ceil(k / (float + specks))
  const gross = reserves.coins - nextCoins
  if (gross < MIN_TRADE) return null

  const fee = Math.ceil((gross * FEE_BPS) / 10_000)
  const coins = gross - fee
  if (coins <= 0) return null

  return { side: 'sell', coins, specks, fee, price: (coins * SPECKS) / specks }
}

/**
 * The part of a quote that moves the book.
 *
 * Narrower than `Quote` on purpose, and the reason is replay. A read model
 * folding a `Traded` event has four numbers and no `price` - the price was a
 * thing shown to a player once, not a thing the book remembers - and asking it
 * to invent one so that `settle` would accept it is how a fake zero ends up in
 * an aggregate.
 */
export type Fill = Pick<Quote, 'side' | 'coins' | 'specks' | 'fee'>

/**
 * The pool after a quote is taken.
 *
 * Both sides move together and neither is written without the other, which is
 * why this is one function rather than a pair the caller has to remember to
 * call in order. The fee has already left: it is not in `coins` on either
 * branch, because it is on its way to the space's bank rather than into the
 * market.
 */
export function settle(reserves: Reserves, quote: Fill): Reserves {
  return quote.side === 'buy'
    ? {
        coins: reserves.coins + (quote.coins - quote.fee),
        specks: reserves.specks - quote.specks,
      }
    : {
        coins: reserves.coins - (quote.coins + quote.fee),
        specks: reserves.specks + quote.specks,
      }
}

/**
 * The pool before a fill, given the pool after it.
 *
 * ---------------------------------------------------------------------------
 * Not "settle with the side flipped", which is the bug this exists to stop
 * ---------------------------------------------------------------------------
 * `settle` is deliberately asymmetric about the fee: a buy puts `coins - fee`
 * in, because the fee never entered the pool, and a sale takes `coins + fee`
 * out, because it left through the pool on its way to the bank. Undoing a buy
 * by settling a sale of the same figures therefore removes two fees that were
 * only ever charged once, and the pool quietly loses coins every time a trade
 * is reversed.
 *
 * That is a slow leak in the one number the whole feature promises cannot leak,
 * so the inverse is written out rather than derived. `pool.test.ts` pins the
 * round trip.
 */
export function unsettle(reserves: Reserves, fill: Fill): Reserves {
  return fill.side === 'buy'
    ? {
        coins: reserves.coins - (fill.coins - fill.fee),
        specks: reserves.specks + fill.specks,
      }
    : {
        coins: reserves.coins + (fill.coins + fill.fee),
        specks: reserves.specks - fill.specks,
      }
}

/**
 * Whether a quote computed a moment ago is still one a player would accept.
 *
 * The reason this exists at all: a player quotes a price in their browser, the
 * epoch turns over while their finger is moving, and the authority prices the
 * same order differently. Refusing every such trade would make the market
 * unusable in exactly the moments it is most interesting; filling it silently
 * at the new price would be taking a number off somebody after showing them a
 * different one.
 *
 * So the order carries the worst outcome its player agreed to, and the
 * authority fills anything at least that good. A tolerance rather than an
 * equality, and the direction is what makes it safe: a buy accepts fewer specks
 * than quoted only down to the floor the player set, and a sale accepts fewer
 * coins the same way. Movement in the player's favour always fills.
 */
export function accepts(fresh: Quote, agreed: { specks?: number; coins?: number }): boolean {
  if (fresh.side === 'buy') return agreed.specks === undefined || fresh.specks >= agreed.specks
  return agreed.coins === undefined || fresh.coins >= agreed.coins
}

/**
 * How far this trade moved the price against itself, as a fraction.
 *
 * ---------------------------------------------------------------------------
 * The fee is deliberately not in here
 * ---------------------------------------------------------------------------
 * The obvious implementation compares `quote.price` to spot, and it is wrong
 * for one reason: `price` is all-in, the desk already shows the fee on its own
 * line, and a reader adding the two up would be counting the fee twice. At the
 * minimum trade size the fee is a tenth of the trade, so that is not a rounding
 * quibble - it would roughly triple the number a player sees.
 *
 * So this measures the pool and only the pool: what the coins that actually
 * reached the reserves bought, against what they would have bought at spot.
 * That is the number the *size* is responsible for, which is what a slippage
 * figure is for - the fee is a price list, the impact is a consequence.
 */
export function slippage(quote: Quote, spot: number): number {
  if (spot <= 0 || quote.specks <= 0) return 0
  const intoPool = quote.side === 'buy' ? quote.coins - quote.fee : quote.coins + quote.fee
  const poolPrice = (intoPool * SPECKS) / quote.specks
  return quote.side === 'buy' ? poolPrice / spot - 1 : 1 - poolPrice / spot
}
