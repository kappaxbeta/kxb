import type { Quote } from '@kxb/xoin'
import type { EarnReason, SpendReason } from '@/domain/bank/reasons'

/**
 * What a fill does to a purse, as data rather than as control flow.
 *
 * ---------------------------------------------------------------------------
 * Why this is not just written out inside the action
 * ---------------------------------------------------------------------------
 * Because the property that matters is arithmetic, and arithmetic buried in an
 * `if` between two awaits cannot be checked without a database. The property:
 * **what leaves a player's purse across a buy is exactly `quote.coins`, and
 * what arrives across a sale is exactly `quote.coins`** - with the fee its own
 * line in both directions rather than folded into the trade.
 *
 * Getting that wrong is silent. A fee counted twice on a sale takes a coin
 * nobody notices until somebody totals a statement; a fee left out of a buy
 * hands the house's cut to the pool forever. Neither throws, neither fails a
 * type check, and both are one sign away.
 *
 * ---------------------------------------------------------------------------
 * Two movements, and the sale's shape is deliberate
 * ---------------------------------------------------------------------------
 * A sale credits the *gross* and then pays the fee out of it. That nets to the
 * same coins as crediting the net would, and it says more: the statement shows
 * what the market paid and what the house took, which is what somebody
 * reconciling a bad trade actually wants to see.
 *
 * Crediting the net and separately charging the fee would be worse than untidy
 * - it would take a coin the player never received.
 */

/**
 * A discriminated union rather than a direction and a reason side by side.
 *
 * The three movements a trade can make go to three different *places* - the
 * mint, the mint, and the space's bank - and each has exactly one reason that
 * belongs to it. Modelling that as `{ direction, reason }` made every call site
 * cast a widened reason back to the one it already knew, which is a type
 * apologising for itself. This way the caller switches once and the compiler
 * knows what it has.
 */
export type PurseMovement =
  | { kind: 'spend'; amount: number; reason: Extract<SpendReason, 'xoin-buy'> }
  | { kind: 'earn'; amount: number; reason: Extract<EarnReason, 'xoin-sell'> }
  | { kind: 'bank'; amount: number; reason: Extract<SpendReason, 'xoin-fee'> }

export function movementsFor(quote: Quote): PurseMovement[] {
  const trade: PurseMovement =
    quote.side === 'buy'
      ? { kind: 'spend', amount: quote.coins - quote.fee, reason: 'xoin-buy' }
      : { kind: 'earn', amount: quote.coins + quote.fee, reason: 'xoin-sell' }

  // A fee that rounded to nothing is not a movement. `MIN_TRADE` makes this
  // unreachable for a real trade, and it is still checked, because a zero-coin
  // line on a statement is a line that means nothing happened.
  if (quote.fee <= 0) return [trade]

  return [trade, { kind: 'bank', amount: quote.fee, reason: 'xoin-fee' }]
}

/** What the player is left with across the whole fill: negative is coins out. */
export function netFor(quote: Quote): number {
  return movementsFor(quote).reduce(
    (total, movement) => total + (movement.kind === 'earn' ? movement.amount : -movement.amount),
    0,
  )
}
