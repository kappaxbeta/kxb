import type { EarnReason, SpendReason } from '@/domain/bank/reasons'
import type { DomainEvent } from '@/es/types'

/**
 * One member's café, house and garden - and the single purse behind all three.
 *
 * ---------------------------------------------------------------------------
 * What is in the log, and what is deliberately not
 * ---------------------------------------------------------------------------
 * In: what was built, what was bought, what was sold, and every coin earned.
 * These are the facts a member expects to survive closing the tab, and the
 * facts another member expects to see when they open theirs.
 *
 * Out: where anybody is standing. The café ticks sixty times a second and a
 * position is stale before it is written - appending it would produce a stream
 * nobody will ever replay, at a rate that would dwarf every other aggregate in
 * the app combined. Presence already carries "who is here" over a realtime
 * channel without touching Postgres, and that is the right home for it.
 *
 * Also out: which stations hold which ingredients, whether the café is serving,
 * and how impatient the current customers are. All of it is gone in seconds and
 * none of it is worth a schema - the same call `SavedCafe` already made when
 * this was a browser snapshot.
 *
 * The one exception is `HomesteadAccessSet`, and the exception proves the rule.
 * Who is *currently* standing in your kitchen is ephemeral and lives on the
 * channel; the standing answer to "may people come in at all" is a setting you
 * expect to still be true tomorrow, so it is an event like any other.
 *
 * ---------------------------------------------------------------------------
 * One stream, not three - and one per member, not per workspace
 * ---------------------------------------------------------------------------
 * The café, the house and the garden share a purse, and a shared balance is the
 * textbook reason to put things in one aggregate: with a stream each, the same
 * 200 coins could be spent in two places at once and both writes would succeed,
 * because neither stream saw the other. One stream makes "can I afford this" a
 * single-stream invariant that optimistic concurrency actually protects.
 *
 * Since 20260730000000 each *member* has their own set within a workspace, so
 * the stream id is derived from (tenant, user) rather than the tenant alone.
 * Nothing in this file changed for that, which is the point: the aggregate was
 * never about who owns the house, only about keeping one purse honest.
 *
 * A side effect worth noticing: contention all but disappeared. Two colleagues
 * decorating simultaneously now write to different streams and cannot collide
 * at all, where before one of them retried.
 */

export const HOMESTEAD_STREAM_TYPE = 'homestead'

/** Which of the three rooms an event is about. */
export type PlaceId = 'cafe' | 'home' | 'outdoor'

/**
 * A member's homestead began.
 *
 * Carries the whole opening layout rather than leaving the client to overlay a
 * starting plan from code. The alternative is tempting - `initialState()`
 * already knows where the first crates go - and it is wrong for the usual
 * reason: code changes. A tenant who founded a café in July and never touched
 * the corner crate would find it had silently become something else in August,
 * because the read model was only ever half the story.
 *
 * Exactly one of these per workspace; the decider refuses a second.
 */
export type HomesteadFounded = DomainEvent<
  'HomesteadFounded',
  {
    coins: number
    /** Opening furniture per place: tile -> prop, exactly as placed. */
    layout: Record<string, { tile: string; propId: string; rotY: number }[]>
  }
>

/**
 * Something was bought and put down.
 *
 * The price is recorded rather than derived on replay. That looks redundant -
 * the catalogue knows what a stove costs - and it is the whole point: the
 * catalogue is code, and code changes. Re-pricing a stove next month must not
 * retroactively change what a workspace paid for one last month, or every
 * balance in the app silently drifts the moment somebody edits a number.
 */
export type PropPlaced = DomainEvent<
  'PropPlaced',
  {
    place: PlaceId
    /** `"x,z"`, the same key the grid uses. */
    tile: string
    propId: string
    rotY: number
    /** True when it went onto a worktop rather than onto the floor. */
    onSurface: boolean
    price: number
  }
>

/** Sold back. `refund` is recorded for the same reason `price` is. */
export type PropRemoved = DomainEvent<
  'PropRemoved',
  {
    place: PlaceId
    tile: string
    /** True when only the decoration on top was sold, not the thing under it. */
    onSurface: boolean
    refund: number
  }
>

/** Picked up and put down elsewhere. Free, so it moves no coins. */
export type PropMoved = DomainEvent<
  'PropMoved',
  { place: PlaceId; from: string; to: string; rotY: number }
>

/**
 * Floor or garden bought.
 *
 * Carries every tile in one event rather than one event per square, because the
 * café buys a whole strip per click and a player who extends the room twice
 * should not produce fourteen events.
 */
export type GroundBought = DomainEvent<
  'GroundBought',
  { place: PlaceId; tiles: string[]; cost: number }
>

/**
 * Ground sold back, shrinking a room.
 *
 * The counterpart to `GroundBought`, and `refund` is recorded for the same
 * reason `cost` is: what a square was worth on the day it was sold must not
 * change when somebody edits the pricing curve next month.
 *
 * The refund is deliberately the exact price the square last cost - see the
 * decider. Anything more would make buy-then-sell a way to print coins, and
 * anything less would make trying out a layout quietly expensive.
 */
export type GroundSold = DomainEvent<
  'GroundSold',
  { place: PlaceId; tiles: string[]; refund: number }
>

/**
 * A customer paid.
 *
 * One event each, which is the decision that makes the balance exactly
 * derivable rather than approximately. A busy café serves a few customers a
 * minute; the log handles that without noticing, and closing the tab mid-shift
 * keeps everything already earned.
 */
export type CustomerServed = DomainEvent<
  'CustomerServed',
  { payment: number; dish: string }
>

/**
 * Who may walk into your café, house and garden.
 *
 * - `open` - anyone in the workspace, no asking.
 * - `knock` - they have to ask, and you have to be there to answer.
 * - `closed` - nobody, and there is no knock to ignore.
 *
 * One setting for all three places rather than one each. They are one
 * homestead - you walk between them through doors - and a house you can be
 * thrown out of by walking into the garden is not a coherent thing to have
 * built. If per-place ever becomes worth it, this event grows a `place` field
 * and the absent one means "all three", which is why the field is not here now.
 *
 * `closed` is not a way to hide. A colleague can still *see* your homestead in
 * the neighbours list and can still read what is in it - the read model is
 * membership-scoped on purpose, see 20260730000000. What the door controls is
 * whether they can stand in it with you.
 */
export type DoorMode = 'open' | 'knock' | 'closed'

/**
 * The default for a homestead that has never set one.
 *
 * `knock` rather than `open`, because the first time somebody walks into your
 * house unannounced is the moment you find out the default was wrong, and by
 * then they are already standing in your kitchen. The recoverable mistake is
 * the one where a visitor has to wait.
 */
export const DEFAULT_DOOR: DoorMode = 'knock'

/**
 * The door was set.
 *
 * Recorded rather than stored as a mutable column for the ordinary reason: the
 * question "was it open when Sam got in" is one you can only answer from a log.
 */
export type HomesteadAccessSet = DomainEvent<
  'HomesteadAccessSet',
  { mode: DoorMode }
>

/**
 * Coins spent on something that is not homestead furniture.
 *
 * ---------------------------------------------------------------------------
 * Why the room's shop spends this purse and does not grow its own
 * ---------------------------------------------------------------------------
 * Because there is one lot of play money in this product and a second would be
 * a second economy: two balances, two places to earn, and the immediate
 * question of whether they exchange. The coins a café earns are *the* coins,
 * and a bench in a lounge that costs four of them is worth four sandwiches -
 * which is a sentence somebody can reason about.
 *
 * ---------------------------------------------------------------------------
 * What `cost` is trusted on, and what it is not
 * ---------------------------------------------------------------------------
 * `BuyGround` prices from this aggregate's own state and says, correctly, that
 * a client which can name its own price can buy the whole map for nothing. That
 * rule is kept here in the way that matters: **no browser-facing schema accepts
 * a cost.** The price lives on a thingiverse blueprint, which this aggregate
 * cannot see, so a server action reads the stored blueprint and issues the
 * command - the same shape as `ServeCustomer`, where the exact number also
 * comes from outside and the aggregate holds a bound rather than a derivation.
 *
 * The bound here is `MAX_PRICE`, and affordability. Within that, the resolver
 * is the authority, and the resolver is server code reading a row.
 *
 * `what` is recorded so a purse can be explained afterwards - "four coins, the
 * counter, a patty" - which is the one thing a balance that only ever goes down
 * cannot tell you on its own.
 */
export type CoinsSpent = DomainEvent<
  'CoinsSpent',
  {
    /**
     * Summoning a thing, or taking an item off one.
     *
     * Optional since the economy, because the economy spends this purse on
     * things that are neither: a battle stake, an extra blueprint, a
     * submission. Absent means "not a purchase in a room", and every event
     * written before this was widened has it - so nothing in the log became
     * ambiguous when it did.
     */
    on?: 'thing' | 'item'
    /** What it was: a blueprint's name, an item's word, or what was paid for. */
    what: string
    cost: number
    /**
     * Why the coins left, from the closed set in `bank/reasons.ts`.
     *
     * Optional, and the absence is not laziness - it is what makes this a
     * widening rather than a rewrite. Every `CoinsSpent` in the log predates
     * the economy and was a homestead purchase, so an event with no reason
     * *is* `homestead` and is read as one (see `spendReasonOf`). Backfilling
     * the column would mean rewriting immutable history to record something
     * already implied by it.
     */
    reason?: SpendReason
    /**
     * What could not be taken, because the purse was short.
     *
     * Only ever set by a battle loss, and it is the whole of how §7.5 handles
     * going broke: a player at zero who loses is charged what they have and no
     * more. Recording the gap keeps the *fact* without keeping the *debt* - a
     * balance that has to be paid off before the game is fun again turns one
     * bad round into a punishment that lasts.
     */
    shortfall?: number
  }
>

/**
 * Coins arriving from outside the homestead.
 *
 * The counterpart to the widened `CoinsSpent`, and the reason it is a new event
 * rather than a reuse of `CustomerServed`: that one is a café's till and folds
 * into `served` and `earned` as well as the balance. A won battle is not a
 * customer, and counting it as one would put battle winnings in the number a
 * café's leaderboard is ranked on.
 *
 * ---------------------------------------------------------------------------
 * `from` is what says whether this was minted
 * ---------------------------------------------------------------------------
 * Absent means the coins were created - a win, a knockout, a voucher, a
 * catalogue acceptance. Present means somebody paid, and their purse has the
 * matching `CoinsSpent`. That distinction is the only way to answer "is this
 * space printing money", which is the question `docs/product/economy.md` §13
 * builds a whole backoffice view around.
 *
 * It is deliberately *not* `CoinsReceived` with a new reason. That event is one
 * half of a member-to-member transfer and its `from` is always another member;
 * widening it would make `from` mean two things and would put every battle
 * payout into the list a person reads as "gifts".
 */
export type CoinsEarned = DomainEvent<
  'CoinsEarned',
  {
    amount: number
    reason: EarnReason
    /** What it was for: a level's name, a match. Shown on a statement. */
    what?: string
    /** Who paid, when anybody did. Absent means minted - see above. */
    from?: string
    /**
     * Whose purse this is.
     *
     * Required, unlike `CoinsReceived.owner`, because this event has no history
     * to be compatible with. See that field for the full argument: the actor on
     * a cross-stream append is whoever was signed in, not whose stream it is,
     * and almost every `CoinsEarned` is written by somebody else's session -
     * a battle payout is appended by whichever client reported the result.
     */
    owner: string
  }
>

/**
 * What a `CoinsSpent` was for, including the ones written before reasons.
 *
 * One function rather than `event.data.reason ?? 'homestead'` at each call
 * site, because that default is a *fact about the log* - every event without a
 * reason is a homestead purchase, because reasons arrived at the same moment
 * the purse started paying for anything else - and a fact about the log should
 * be written down once, next to the field it explains.
 */
export function spendReasonOf(data: CoinsSpent['data']): SpendReason {
  return data.reason ?? 'homestead'
}

/**
 * How much one person may hand another at once.
 *
 * Generous - a few shifts' takings - and bounded anyway, because the guard that
 * actually matters is affordability and this one only exists to make a mistyped
 * amount a refusal rather than a purse emptied by a stray zero.
 */
export const MAX_TRANSFER = 100_000

/**
 * Coins handed to somebody else, and coins handed to you.
 *
 * ---------------------------------------------------------------------------
 * Two events on two streams, because there are two purses
 * ---------------------------------------------------------------------------
 * A homestead is per member per workspace (see `homesteadStreamId`), so a
 * transfer is not one write - it is a debit on one stream and a credit on
 * another, and nothing in this codebase can make those atomic. That is worth
 * stating rather than hiding, because the failure it admits is real: if the
 * credit fails after the debit lands, the coins are gone.
 *
 * That is the direction to fail in, and it is chosen rather than accepted. The
 * other order - credit first - fails by *minting*: a credit that lands and a
 * debit that does not is money created out of a network error, and money that
 * can be created by retrying is not money. Losing a transfer is a support
 * conversation; printing one is a broken economy.
 *
 * `transfer` is the same id on both halves, so the two ends of one movement can
 * be found in the log afterwards - which is the only way to answer "where did
 * my coins go" once they are gone.
 */
export type CoinsSent = DomainEvent<
  'CoinsSent',
  { to: string; amount: number; transfer: string }
>

export type CoinsReceived = DomainEvent<
  'CoinsReceived',
  {
    from: string
    amount: number
    transfer: string
    /**
     * Whose purse this is - the recipient, and the owner of the stream this
     * event sits on.
     *
     * It looks redundant next to `from` and it is the opposite: it is the only
     * thing that makes this event attributable at all. `events.actor_id` is
     * `auth.uid()`, forced by RLS in `append_events`, so on the credit half of
     * a transfer the actor is the **sender** - they are the one signed in, even
     * though the write lands on somebody else's stream. A projection reading
     * the actor to decide whose purse to move therefore moved the wrong one.
     *
     * The stream id cannot be used instead: it is `uuidv5(tenant:user)`, which
     * is a hash and does not come apart. So the owner travels in the data, the
     * way every cross-stream append in this codebase has to.
     *
     * Optional because events written before this was understood do not have
     * it, and history is immutable. Those transfers were misattributed when
     * they were written and stay misattributed on a replay - see the note in
     * `projection.ts`. Nothing can be done about that from here; what matters
     * is that no new one joins them.
     */
    owner?: string
  }
>

export type HomesteadEvent =
  | HomesteadFounded
  | PropPlaced
  | PropRemoved
  | PropMoved
  | GroundBought
  | GroundSold
  | CustomerServed
  | HomesteadAccessSet
  | CoinsSpent
  | CoinsEarned
  | CoinsSent
  | CoinsReceived

export const HOMESTEAD_EVENT_LABELS: Record<HomesteadEvent['type'], string> = {
  HomesteadFounded: 'homestead founded',
  PropPlaced: 'furniture placed',
  PropRemoved: 'furniture sold',
  PropMoved: 'furniture moved',
  GroundBought: 'ground bought',
  GroundSold: 'ground sold',
  CustomerServed: 'customer served',
  CoinsSpent: 'coins spent',
  CoinsEarned: 'coins earned',
  CoinsSent: 'coins sent',
  CoinsReceived: 'coins received',
  HomesteadAccessSet: 'door setting changed',
}
