import type { DomainEvent } from '@/es/types'

/**
 * The space's own account.
 *
 * `docs/product/economy.md` §3. There are three kinds of account in this product
 * and this is the middle one. A **purse** belongs to one member *in one space*
 * and pays for what they do there. A **wallet** belongs to an account and
 * outlives every space it ever earned in. A **bank** belongs to the space
 * itself: owners spend it, house rules and door charges feed it, and loans come
 * out of it.
 *
 * The bank is the only one of the three that is not somebody's money. That is
 * why it is a separate aggregate rather than another purse with a flag on it -
 * "may this person spend this" is a membership question here and an identity
 * question everywhere else.
 *
 * ---------------------------------------------------------------------------
 * Why a space needs an account at all
 * ---------------------------------------------------------------------------
 * Without one, a space's economy is a set of sinks. An owner switches hunger
 * on, prices a sandwich at four coins, and those coins go nowhere - which makes
 * every rule they tune a tax rather than a trade, and makes "the owner can lend
 * you some" impossible to mean literally.
 *
 * With one, the arrangement closes: the person who set the prices holds the
 * takings, and can hand them back. That is the difference between a space with
 * settings and a space with an economy, and it is worth a stream.
 *
 * ---------------------------------------------------------------------------
 * One stream per space, and the invariant it is here to protect
 * ---------------------------------------------------------------------------
 * The same argument the homestead makes about a purse, one level up: "the bank
 * cannot pay out more than it holds" is only enforceable if every movement is
 * on one stream, where optimistic concurrency can see them. Two owners paying
 * two members at the same moment on two streams would both succeed against a
 * balance that only covered one.
 *
 * ---------------------------------------------------------------------------
 * Every movement here has a counterparty. None of them mint
 * ---------------------------------------------------------------------------
 * Worth stating because it is the property that makes this aggregate safe: a
 * bank only ever receives from a purse or pays into one. It is not a source of
 * coins, so no bug in this file can inflate the economy - the worst it can do
 * is lose a movement, which shows up as two balances that do not add up. See
 * `MINTS` in `reasons.ts` for the short list of things that can.
 */

export const BANK_STREAM_TYPE = 'bank'

/**
 * Coins arrived from a member's purse.
 *
 * `reason` is the member's own, not the bank's, and that is the point: it is
 * the same word that appears on their statement, so the two halves of one
 * movement can be lined up afterwards without a join table that knows how to
 * translate between two vocabularies.
 *
 * `amount` is recorded rather than derived, for the reason `PropPlaced` gives
 * about `price`: the blueprint that priced a sandwich is a row somebody can
 * edit, and re-pricing it next month must not retroactively change what this
 * space took last month.
 */
export type CoinsBanked = DomainEvent<
  'CoinsBanked',
  {
    /** The member whose purse it came out of. */
    from: string
    amount: number
    /**
     * The member's own reason: `needs` when a house rule charged for something
     * they consumed, `room-entry` when a door charged them for going through
     * it, `bank-grant-out` when they simply paid in, `channel` when they
     * opened an episode of one of the space's shows that charges to read.
     */
    reason: 'needs' | 'room-entry' | 'bank-grant-out' | 'channel'
    /** What was paid for. "a sandwich", "a bandage", the room's name. */
    what?: string
    /** The same id on both halves, so a movement can be found from either end. */
    transfer: string
  }
>

/**
 * Coins left for a member's purse.
 *
 * Two reasons, and they are genuinely different acts even though the money
 * moves identically. A grant is an owner deciding to pay somebody. A loan is
 * the space catching somebody who cannot afford to keep playing - §7.3 - and it
 * is recorded separately so that "how much has this space lent" is a question
 * with an answer.
 *
 * Neither is currently repaid. That is open question 5 rather than an oversight,
 * and it is why `loan` is its own reason instead of a grant with a nicer label:
 * when repayment is decided, the events that need finding will be findable.
 */
export type CoinsWithdrawn = DomainEvent<
  'CoinsWithdrawn',
  {
    /** The member whose purse it went into. */
    to: string
    amount: number
    reason: 'bank-grant-in' | 'loan'
    transfer: string
  }
>

export type BankEvent = CoinsBanked | CoinsWithdrawn

export const BANK_EVENT_LABELS: Record<BankEvent['type'], string> = {
  CoinsBanked: 'coins banked',
  CoinsWithdrawn: 'coins paid out',
}
