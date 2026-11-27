import type { XoinMode } from '@kxb/xoin'
import type { DomainEvent } from '@/es/types'

/**
 * A space's market: one stream, holding the book, the mode and every position.
 *
 * `docs/product/xoin.md` is the argument. This is the log.
 *
 * ---------------------------------------------------------------------------
 * Why the holdings are in here rather than in a purse of their own
 * ---------------------------------------------------------------------------
 * The thing that has to be impossible is selling xoin you do not have, and that
 * is the same problem the purse solves in `homestead/events.ts`: it is a
 * single-stream invariant or it is nothing. Every trade in a space lands on this
 * one stream, so the decider folds every position from the same history it folds
 * the reserves from, and optimistic concurrency on that stream is what stands
 * between two simultaneous sales and a holding that goes negative.
 *
 * Split the holdings into a stream per member and the reserves stop agreeing
 * with the positions: the pool would be paying out against a fold it cannot see,
 * and the check would have to become "read the other stream and hope". So the
 * book and the people holding it are one aggregate, deliberately.
 *
 * ---------------------------------------------------------------------------
 * Why not the tenant stream
 * ---------------------------------------------------------------------------
 * The radio's argument, and harder here. `executeCommand` folds a whole stream
 * to find its expected version, so a trade on the tenant stream would replay
 * every invitation and role change in the space's history - and, worse, would
 * hand a ConcurrencyError to somebody accepting an invitation because a market
 * ticked. A market is the busiest writer a space has.
 *
 * ---------------------------------------------------------------------------
 * Nothing here carries a price a browser chose
 * ---------------------------------------------------------------------------
 * `docs/product/economy.md` §7 states the rule for battle and it holds twice
 * over here: the amounts on `Traded` are computed on the server from the
 * reserves this stream already holds, and no browser-facing schema accepts one.
 * The client says a side and a size; everything else is arithmetic it does not
 * get a vote in. See `tradeInMarket`.
 */
export const XOIN_STREAM_TYPE = 'xoin'

/**
 * A space turned a market on for the first time.
 *
 * Carries the mode it opened in rather than assuming one, because "the market
 * exists" and "the market is playing for real coins" are separate decisions and
 * a space may well make the second one later. The opening reserves are not on
 * the event: they are constants in `@kxb/xoin`, and putting them in the log
 * would mean a market opened last week and one opened today could disagree
 * about what the opening ratio *was* after somebody edited a number.
 *
 * The market's birthday is this event's own `created_at`, stamped by Postgres -
 * the same rule the radio's anchor follows, and for the same reason: every
 * client subtracts from it to find the epoch, so it has to be a clock they all
 * agree on rather than the browser of whoever opened it.
 */
export type MarketOpened = DomainEvent<'MarketOpened', { mode: XoinMode }>

/**
 * An owner or admin changed what the market is.
 *
 * A whole event rather than a column, because this is the single most
 * consequential setting in the feature - it is the difference between a game
 * and somebody's coins - and "who switched this space onto real money, and
 * when" is a question that has no answer at all unless it was written down at
 * the time.
 */
export type ModeSet = DomainEvent<'ModeSet', { mode: XoinMode }>

/**
 * A fill.
 *
 * `coins` is always from the *player's* side: what left their purse on a buy,
 * what arrived in it on a sale, in both cases after the fee. `fee` is the
 * space's bank's share and is never part of `coins`, so the two never have to be
 * disentangled by a reader later.
 *
 * `by` is the account, in the data rather than left to `actor_id`. Two reasons,
 * and the second is the one that bites: this append is made by the server with
 * the service role, which has no `auth.uid()` to be stamped with - so an event
 * relying on the actor would project to nobody at all. See `actor-id` in the
 * homestead projection for the same story from the other direction.
 */
export type Traded = DomainEvent<
  'Traded',
  {
    side: 'buy' | 'sell'
    by: string
    coins: number
    specks: number
    fee: number
    /**
     * The float the trade was priced against.
     *
     * Recorded and never re-derived. The float is a function of the clock, so a
     * reader working it out later would get a different number than the one the
     * player was shown - and "what was the price when I pressed the button" is
     * the first question anybody asks about a trade they regret.
     */
    float: number
  }
>

/**
 * A fill that could not be paid for, given back.
 *
 * ---------------------------------------------------------------------------
 * Why this exists at all
 * ---------------------------------------------------------------------------
 * A trade is two writes on two streams - the market's book and somebody's purse
 * - and there is no transaction across them. `docs/product/xoin.md` §5.1 sets
 * the ordering so that the *first* write is always the one whose failure means
 * nothing happened, which leaves exactly one hole: a sale that changed the book
 * and then could not credit the purse.
 *
 * The player is owed coins and holds no xoin. Rather than leave them owed, the
 * book is put back the way it was and the position returned, which is the only
 * compensation that cannot itself fail for want of money.
 *
 * It is an event and not a silent rollback because a market that quietly undoes
 * fills is a market nobody can audit. This is rare - it needs a purse to stay
 * busy through every retry - and when it happens somebody should be able to
 * find it.
 */
export type TradeReversed = DomainEvent<
  'TradeReversed',
  { by: string; coins: number; specks: number; fee: number; side: 'buy' | 'sell'; why: string }
>

export type XoinEvent = MarketOpened | ModeSet | Traded | TradeReversed
