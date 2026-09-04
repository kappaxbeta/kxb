/**
 * Every way a coin can move, as a closed set.
 *
 * `docs/product/economy.md` §5 is the argument; this is the list. It is the
 * first file in this folder because it is the one the other five agree about:
 * a movement without a reason cannot be written, and a reason not on this list
 * does not compile.
 *
 * ---------------------------------------------------------------------------
 * Why a balance is not enough
 * ---------------------------------------------------------------------------
 * A purse that only goes up and down explains nothing. The question an operator
 * actually asks is not "how many coins does this space have" - it is "where did
 * they come from", and that question has no answer at all unless every write
 * carried one at the time. It cannot be reconstructed afterwards from the
 * amounts, because ten coins arriving looks identical whether it was a won
 * battle, a loan or somebody minting them.
 *
 * That is also why this is an enum rather than a free-text note. A string field
 * would be right on the day it was added and would hold fourteen spellings of
 * "battle" by the time anyone tried to total it up.
 *
 * ---------------------------------------------------------------------------
 * Pure, and importable from a Client Component
 * ---------------------------------------------------------------------------
 * The same constraint `tiers.ts` works under and for the same reason: the rail
 * that draws a purse wants to label the last few movements, and a reason that
 * could only be named on the server would have to be threaded through as a
 * pre-rendered string. Nothing here touches a database or a session.
 */

/**
 * Coins arriving.
 *
 * `transfer-in` and `bank-grant-in` are the only two whose counterpart is
 * another account rather than the mint - see `MINTS` below, which is the list
 * that actually matters.
 */
export const EARN_REASONS = [
  /** A café shift. The original earner, and still the main one. */
  'served',
  /** Somebody else entered a battle on a level this account owns. */
  'battle-stake',
  'battle-win',
  'battle-kill',
  /** Somebody remixed a level this account owns, or holds a share of. */
  'remix',
  /** A submission was accepted into the catalogue. */
  'accepted',
  /** Handed over by another member. */
  'transfer-in',
  /** Paid out of the space's bank by an owner. */
  'bank-grant-in',
  /** Lent by the space's bank. See §7.3 - not currently recovered. */
  'loan',
  /** Played for, and worth `VOUCHER_COINS`. */
  'voucher',
  /**
   * Put there by an operator.
   *
   * The correction path, and the only movement in this economy with no game
   * behind it at all. It exists because the alternative was worse: a bug that
   * loses somebody's coins - and there has already been one - left the
   * backoffice able to *see* the damage and unable to repair it.
   *
   * It mints, and it is on `MINTS` for that reason rather than hidden among the
   * transfers. An operator making somebody whole and an operator quietly
   * inflating a space look identical from the balance alone; the reason and the
   * audit row are what tell them apart.
   */
  'operator',
] as const

/** Coins leaving. */
export const SPEND_REASONS = [
  /** Entering a battle. Goes to the level's owner, never to the mint. */
  'battle-stake',
  /** Being defeated. */
  'battle-loss',
  'revive',
  /** Eating, healing - anything a space's needs made necessary. */
  'needs',
  /**
   * Standing in a room that charges at the door.
   *
   * Its own reason rather than a flavour of `needs`, because the two are
   * different bargains and an owner tunes them for different reasons. A need is
   * a *consequence* - you got hungry, food costs something. A door charge is a
   * *toll*, paid before anything has happened to you, and it is the one charge
   * in this product that can stop somebody getting in at all. Keeping it
   * separate is what lets the backoffice see a space that has quietly put a
   * price on every door.
   */
  'room-entry',
  /** One more XP, blueprint, clip or vehicle than the tier allows. */
  'quota',
  /**
   * Starting a show on the channel, and opening an episode that charges.
   *
   * One reason for both, because they are the same bargain from a member's
   * side - *this show costs coins* - and separating them would put two lines
   * in a purse history that a reader has to join back together. Where the
   * coins go differs and is not this field's business: starting a show burns
   * them, an episode's price lands in the channel's bank. See `BURNS`, which
   * is where that distinction is actually recorded.
   */
  'channel',
  /** Remixing somebody else's level. */
  'remix',
  /** Putting a level in front of a reviewer. Not refunded on rejection. */
  'submission',
  /** Handed to another member. */
  'transfer-out',
  /** Paid into the space's bank. */
  'bank-grant-out',
  /** Bought inside the homestead - furniture, ground, a summoned thing. */
  'homestead',
] as const

export type EarnReason = (typeof EARN_REASONS)[number]
export type SpendReason = (typeof SPEND_REASONS)[number]
export type CoinReason = EarnReason | SpendReason

/**
 * The reasons that change how many coins exist in the world.
 *
 * Everything else moves coins between two accounts and nets to zero. This list
 * is short on purpose, and it is the list to look at first when the totals in
 * the backoffice stop making sense: an economy can only be inflated through one
 * of these, so a number that grew came through here.
 *
 * `battle-stake`, `remix` and both transfers are conspicuously absent. Each has
 * a payer *and* a payee, which is what makes them the safe kind of movement -
 * the amount that leaves one purse is the amount that arrives in another, and a
 * bug that loses a coin is visible as a balance that does not add up rather
 * than as an economy that quietly doubles.
 */
export const MINTS = [
  'served',
  'battle-win',
  'battle-kill',
  'accepted',
  'voucher',
  'operator',
] as const satisfies readonly EarnReason[]

/** The reasons that destroy coins outright, rather than paying somebody. */
export const BURNS = [
  'battle-loss',
  'revive',
  'quota',
  'submission',
] as const satisfies readonly SpendReason[]

const MINT_SET: ReadonlySet<string> = new Set(MINTS)
const BURN_SET: ReadonlySet<string> = new Set(BURNS)

/** Does this movement create coins that did not exist? */
export function isMint(reason: EarnReason): boolean {
  return MINT_SET.has(reason)
}

/** Does this movement destroy them? */
export function isBurn(reason: SpendReason): boolean {
  return BURN_SET.has(reason)
}

/**
 * What a person reads on their own statement.
 *
 * Deliberately in the second person and deliberately vague about the
 * counterparty, because the counterparty is not always somebody this reader may
 * be told about: a stake paid to a level's owner should not name that owner to
 * a stranger who has never been in their space. The event carries the id; this
 * carries the sentence.
 */
export const REASON_LABELS: Record<EarnReason | SpendReason, string> = {
  served: 'served a customer',
  'battle-stake': 'battle stake',
  'battle-win': 'won a battle',
  'battle-kill': 'a knockout',
  'battle-loss': 'lost a battle',
  revive: 'revived',
  needs: 'food and healing',
  'room-entry': 'a door charge',
  quota: 'one more than the plan holds',
  channel: 'a show, or an episode of one',
  remix: 'a remix',
  accepted: 'accepted into the catalogue',
  submission: 'submitted for review',
  'transfer-in': 'a gift',
  'transfer-out': 'handed over',
  'bank-grant-in': 'paid out of the bank',
  'bank-grant-out': 'paid into the bank',
  loan: 'a loan from the space',
  voucher: 'a voucher',
  operator: 'put right by us',
  homestead: 'spent at home',
}
