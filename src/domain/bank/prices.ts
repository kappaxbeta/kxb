import type { Tier } from '@/domain/billing/tiers'

/**
 * Every number a coin can buy, in one file.
 *
 * `docs/product/economy.md` §7-§10 is the argument; this is the table. It is
 * constants rather than rows for exactly the reason `tiers.ts` gives about its
 * own numbers: a price that moves changes what the game *is*, has to agree with
 * the copy on three surfaces, and wants a commit and a review rather than a
 * text field an operator can nudge at two in the morning.
 *
 * The split from `tiers.ts` is worth stating because both files are tables of
 * numbers and they answer different questions. **`tiers.ts` says how many you
 * get. This says what the next one costs.** A tier is bought with euros and
 * grants an allowance; a price here is paid in coins and lifts it by one. The
 * two never meet: no amount of coins moves a space between tiers, and euros
 * never buy coins.
 *
 * ---------------------------------------------------------------------------
 * Pure, and nothing here is ever sent by a browser
 * ---------------------------------------------------------------------------
 * Importable from a Client Component, so the editor can show a price next to
 * the button that charges it. That is the *only* thing a client does with these
 * - it displays them. Every charge is issued by a server action that looked the
 * number up here, and no browser-facing schema accepts a cost. `homestead`
 * already made that rule for its shop; this extends it to the rest.
 */

// ---------------------------------------------------------------------------
// Battle
// ---------------------------------------------------------------------------

/**
 * What a round costs and pays.
 *
 * The stake is the only one of these that is not created or destroyed: it moves
 * from the player to whoever owns the level. That is the first time authoring
 * pays anything at all, and it pays per play rather than per sale - which is
 * why it is one coin and not ten. A level that is fun a hundred times should
 * earn more than one that was bought once and never opened.
 *
 * Ten for a win against three for a loss is a deliberate 3:1. A round that is
 * roughly even money would make playing a coin-flip nobody can get ahead of,
 * and a loss that cost nothing would make entering free - the stake alone is
 * too small to be felt.
 */
export const BATTLE_STAKE = 1
export const BATTLE_WIN = 10
export const BATTLE_KILL = 1
export const BATTLE_LOSS = 3
export const REVIVE = 1

/**
 * Breaking something that had health, in battle mode.
 *
 * ---------------------------------------------------------------------------
 * One coin, and the rule that stops it printing them
 * ---------------------------------------------------------------------------
 * A thing with health is a target, and knocking one over should pay like a
 * knockout does. The obvious version of that is a coin printer, and it is worth
 * spelling out why: a blueprint's price may be **zero**, so *summon a free
 * crate, smash it, take a coin* is a loop with no cost, no second player and no
 * match length to slow it down. That is strictly worse than anything else in
 * this economy - the win/loss pair at least needs somebody else in the room.
 *
 * So a thing only pays if it cost **more than this** to summon:
 *
 *     pays 1 coin  ⟺  priceOfThing(spec) > THING_KILL
 *
 * Which makes the loop always negative. Summoning a 2-coin crate to earn 1 is a
 * coin lost, every time, forever. Free scenery pays nothing at all, which is
 * also the right answer for a room full of decorative barrels.
 *
 * It is the same shape as `BATTLE_KILL` being smaller than `BATTLE_LOSS`, and
 * for the same reason: the arithmetic does the policing, so nothing has to
 * detect a farm or rate-limit anybody.
 */
export const THING_KILL = 1

/**
 * What somebody has the first time they open a homestead here.
 *
 * The café's own `initialState()` carries 120, and that number is a *tutorial*
 * decision - the smallest layout that can complete an order, with enough left
 * to buy the second thing you will want. It was the right number when the café
 * was a self-contained game and its coins bought café furniture.
 *
 * It is not the right number now, because that balance is the opening position
 * in an economy: it pays stakes, tolls, revives and quota extras. So the
 * economy names it, and the café keeps its own for the standalone game. 100 is
 * a round hundred - a hundred battle stakes, fifty healing drinks, or a third
 * of a submission - which is enough to find out what things cost without being
 * enough to skip earning any.
 */
export const OPENING_COINS = 100

/**
 * The voucher's parked default, and *not* what one is worth.
 *
 * Vouchers are a valued feature flag - off by default, and the amount is the
 * operator's. This constant only records the number the brief named, so the
 * migration that parks the flag has something to park. `voucher.ts` reads the
 * flag and never this.
 *
 * A hundred times the opening balance, which is why it is a decision somebody
 * has to make per space rather than a price this file gets to set.
 */
export const VOUCHER_COINS = 10_000

// ---------------------------------------------------------------------------
// The catalogue
// ---------------------------------------------------------------------------

/**
 * Putting a level in front of a reviewer, and being told yes.
 *
 * The fee is a spam control and its size is the argument: 300 is a real cost
 * against a queue a human reads. **It is not refunded on rejection**, and that
 * is the entire mechanism rather than a harshness - a refund on rejection makes
 * submitting free and the queue unbounded again.
 *
 * The reward is a floor, not a price. "This is good" and "this is
 * extraordinary" should not pay the same, and only a person can tell the
 * difference, so the reviewer names the amount and this is the least it can be.
 */
export const SUBMISSION_FEE = 300
export const ACCEPTED_REWARD_MIN = 1_000

// ---------------------------------------------------------------------------
// One more than the plan holds
// ---------------------------------------------------------------------------

/**
 * The things a space can buy one more of.
 *
 * Seats and guests are deliberately absent and should stay absent. They are
 * *people*, and a plan that let a space buy its way past its seat cap with play
 * money would be a pricing page that does not mean anything - the euros would
 * be optional.
 *
 * ---------------------------------------------------------------------------
 * Rooms are here, and the argument against them is worth keeping
 * ---------------------------------------------------------------------------
 * This list held only content for a while - things a member makes, which cost
 * storage and nothing else and are therefore honest to sell for play money -
 * and rooms were excluded on the grounds that `rooms/capacity.ts` makes: a room
 * cap is a real limit on a real box rather than a paywall, and a box does not
 * get bigger for coins.
 *
 * That argument is still true and rooms are sold anyway, which is a product
 * decision rather than a refutation. What makes it safe is the ceiling: the
 * `xo_place_limit` flag is a platform ceiling and `resolveLimit` applies it
 * *after* everything else, so coins can lift a space above its tier and still
 * cannot lift it above what the installation will tolerate. The commercial
 * control and the capacity valve stay separate, which is the whole reason
 * `limits.ts` has three rungs.
 *
 * The practical consequence, and it should be checked before a busy release:
 * a space that buys thirty rooms is thirty realtime channels this box has to
 * serve, and the only thing standing in front of that is a flag nobody has
 * switched on yet.
 */
export const PURCHASABLE = [
  'privateXps',
  'publicXps',
  'blueprints',
  'clips',
  'vehicles',
  'xoPlaces',
] as const

export type Purchasable = (typeof PURCHASABLE)[number]

/**
 * What one more costs, per tier. `null` means it cannot be bought at all.
 *
 * Two shapes in here look like mistakes and are not.
 *
 * **Public is cheaper than private on free and xo.** A published level is
 * content the platform wants and other people can play; a private one is
 * storage nobody else benefits from. Charging more for the one that gives
 * nothing back is the right way round.
 *
 * **A vehicle costs more on the cheaper tier.** Five times more on free than on
 * xp. Everything else on this table gets cheaper as you pay more, and so does
 * this - it is just that the gap is enormous, because a vehicle is the most
 * expensive thing in the runtime to build and to have moving in a room. The
 * price is a signal about cost rather than a paywall, and the inversion says
 * what the tiers already say: this is what you are buying when you pay.
 *
 * `teamXps` is absent from this table and from `Purchasable`. The brief priced
 * private and public and never priced team, so it is capped by the tier and not
 * purchasable - see open question 1. Inventing a number here would be inventing
 * a product decision in a constants file.
 */
export const EXTRA_PRICES: Record<Purchasable, Record<Tier, number | null>> = {
  /**
   * Free holds no private XPs at all, so there is no "one more" to price -
   * `null` here is the tier's story rather than a gap. Free is public by
   * default, and paying is what buys privacy.
   */
  privateXps: { free: null, xo: 200, xp: 50 },
  publicXps: { free: 100, xo: 50, xp: null },
  blueprints: { free: 60, xo: 30, xp: 30 },
  clips: { free: 1_000, xo: 200, xp: 50 },
  vehicles: { free: 50_000, xo: 20_000, xp: 10_000 },
  /**
   * **Inferred, not specified.** A room was named as purchasable without a
   * price, so these are chosen to sit where a room belongs on this table rather
   * than invented freely: dearer than a blueprint, because a room is capacity
   * on a shared box and a blueprint is a row; far cheaper than a vehicle,
   * because a room is what a group needs to have two conversations and pricing
   * it out of reach is how a space stops growing.
   *
   * They follow the same slope as everything else here - cheaper as the plan
   * gets dearer - and they are the numbers most likely to be wrong. Changing
   * them is a one-line edit and no migration.
   */
  xoPlaces: { free: 500, xo: 250, xp: 100 },
}

/**
 * What the next one costs this space, or `null` if it cannot be bought.
 *
 * `null` covers two different situations on purpose, because the caller does
 * the same thing in both: a tier where the thing is unlimited has no next one
 * to sell, and a tier where it is forbidden has no next one to sell either.
 * Either way there is no button.
 */
export function extraPrice(tier: Tier, what: Purchasable): number | null {
  return EXTRA_PRICES[what][tier]
}

// ---------------------------------------------------------------------------
// Bounds
// ---------------------------------------------------------------------------

/**
 * The most anything on this page may ever cost, as a guard rather than a price.
 *
 * Every charge is issued from a constant above or from a price an owner typed
 * into an editor, and it is the second kind this exists for: a remix price and
 * a needs price are *somebody's number*, and a stray zero on the end of one is
 * a purse emptied by a typo. Same argument as `MAX_TRANSFER` next door, and the
 * same shape - the guard that matters is affordability, and this only makes a
 * mistyped amount a refusal rather than a disaster.
 *
 * Set above the most expensive constant here (a vehicle on free) so that a real
 * price is never refused by it.
 */
export const MAX_PRICE = 100_000
