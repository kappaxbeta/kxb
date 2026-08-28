/**
 * `@kxb/maumau/house` - which Mau-Mau, out of the several everybody thinks is
 * the only one.
 *
 * ---------------------------------------------------------------------------
 * Why this is settings at all, when boxing's frame data is not
 * ---------------------------------------------------------------------------
 * `@kxb/boxing` has no settings and says why: a document that could retune a
 * punch is a document that can make a match unfair. That argument is right
 * there and wrong here, and the difference is worth stating rather than
 * assuming, because it is the reason this file exists.
 *
 * A punch window is *asymmetric*. Making a jab faster helps whoever is
 * throwing it, which is one player, and the other one did not agree. A house
 * rule is symmetric: sevens stack for everybody or for nobody, and the whole
 * table plays the same game. There is no setting below that one seat benefits
 * from.
 *
 * Which is also why they are **pinned at the deal and refused afterwards**. Not
 * because changing them mid-game would be unfair - it would be *incoherent*:
 * turning stacking off with six cards of penalty owed is a state the rules have
 * no answer for.
 *
 * ---------------------------------------------------------------------------
 * The defaults are the game as it is actually played
 * ---------------------------------------------------------------------------
 * Every one of these is on. Mau-Mau with the specials switched off is a game of
 * matching colours with no decisions in it, and a package whose defaults are
 * the boring version is a package everybody has to configure before it is any
 * good. The switches exist so a table can argue about the two that tables
 * genuinely argue about - the nine and the ace - not so the game can be turned
 * into snap.
 */

import { DECKS, type Deck } from './cards'

export interface House {
  /** Short pack or full. See `./cards` - `short` is the game. */
  deck: Deck
  /** How many each player is dealt. */
  hand: number
  /**
   * A seven makes the next player draw two, and a seven answers a seven.
   *
   * The stacking half is not separable. A seven that could not be answered is a
   * card with no counterplay, which is the one thing everybody who has played
   * this game agrees the seven is not.
   */
  sevens: boolean
  /** An eight skips the next player. */
  eights: boolean
  /**
   * A nine turns the play around.
   *
   * The first thing a table argues about, and it earns its keep from three
   * seats up. At two it is deliberately made into a skip - see
   * `../rules/table.ts`. The alternative is worse than it looks: reversing a
   * two-seat ring is arithmetically nothing at all, so a nine would be an
   * ordinary card that a player who had counted on it has just wasted.
   */
  nines: boolean
  /**
   * An ace gives you another turn.
   *
   * The second thing a table argues about, and the reason it is a switch rather
   * than a default nobody questions: with the short pack four of the thirty-two
   * cards are aces, and a player holding two of them plays three cards in a
   * row.
   */
  aces: boolean
  /**
   * A jack may not be played on a jack.
   *
   * *Bube auf Bube ist Sauerei.* Without it the wish is meaningless - the
   * player after you simply names a suit of their own, and the card that is
   * supposed to be the strongest in the deck cancels itself.
   */
  jackOnJack: boolean
  /**
   * You must say Mau on the card that takes you to one, and can be caught if
   * you do not.
   *
   * The catch costs two. Off, the declaration is decoration; on, it is the only
   * thing in the game that punishes not paying attention.
   */
  mau: boolean
}

export const HOUSE: House = {
  deck: 'short',
  hand: 5,
  sevens: true,
  eights: true,
  nines: true,
  aces: true,
  jackOnJack: true,
  mau: true,
}

/**
 * Fewest and most who can sit down. Both are hard - see `../net/arbiter`.
 *
 * Five is a pack decision rather than a rules one. Nothing in the game breaks
 * at six; `handCap` does - a short pack dealt six ways leaves a pile of four,
 * and the first stacked seven empties it. So the cap is the largest table the
 * thirty-two cards can actually seat, and a sixth player is refused at the door
 * with a sentence rather than at the deal with a hand nobody can draw from.
 */
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 5

/**
 * The largest hand that can be dealt, given a pack and a full table.
 *
 * Four players at eight cards out of thirty-two is a deal that leaves one card
 * face up and nothing at all to draw from, so the first player who cannot
 * follow ends the hand by exhausting a pile that never existed. The cap is one
 * share of the pack *counting the pile as a player*, taken off the pack minus
 * the card that goes face up, which guarantees the simple property worth
 * having: **the pile starts at least as big as a hand.**
 *
 * The `- 1` is that face-up card and it is not cosmetic: without it three
 * players get eight each, and the pile they are left to draw from is seven.
 *
 * Not larger, and the reason is the reshuffle rather than arithmetic. A pile
 * that runs out is refilled from the discard, so the pack does not have to
 * cover the whole game - only enough of it that the first few turns are not
 * already scraping.
 */
export const handCap = (deck: Deck, seats: number): number =>
  Math.max(2, Math.floor(((deck === 'full' ? 52 : 32) - 1) / (Math.max(seats, MIN_PLAYERS) + 1)))

/**
 * Read a house from outside, filling in whatever was not said.
 *
 * Every field is optional and every absent one becomes the default, which is
 * what makes `frame.settings` of `{}` - or of `null`, or of a document written
 * before this game had options - a table playing the real game rather than a
 * refusal. The one thing that is clamped rather than defaulted is the hand,
 * because a hand of nine hundred is a deal that never terminates.
 */
export function readHouse(payload: unknown, seats = MAX_PLAYERS): House {
  const wire = (typeof payload === 'object' && payload !== null ? payload : {}) as Record<
    string,
    unknown
  >

  const deck = (DECKS as readonly string[]).includes(wire.deck as string)
    ? (wire.deck as Deck)
    : HOUSE.deck

  const asked = typeof wire.hand === 'number' && Number.isFinite(wire.hand) ? wire.hand : HOUSE.hand
  const hand = Math.max(2, Math.min(handCap(deck, seats), Math.floor(asked)))

  const flag = (value: unknown, fallback: boolean) =>
    typeof value === 'boolean' ? value : fallback

  return {
    deck,
    hand,
    sevens: flag(wire.sevens, HOUSE.sevens),
    eights: flag(wire.eights, HOUSE.eights),
    nines: flag(wire.nines, HOUSE.nines),
    aces: flag(wire.aces, HOUSE.aces),
    jackOnJack: flag(wire.jackOnJack, HOUSE.jackOnJack),
    mau: flag(wire.mau, HOUSE.mau),
  }
}

/**
 * Whether two houses are the same game.
 *
 * For the same job `boxing`'s `join` does with hp and damage: the first ask
 * pins the rules and a later one that disagrees is refused by name rather than
 * silently played under somebody else's. Written as a field walk rather than a
 * `JSON.stringify` comparison because key order is not a rule difference.
 */
export const sameHouse = (a: House, b: House): boolean =>
  a.deck === b.deck &&
  a.hand === b.hand &&
  a.sevens === b.sevens &&
  a.eights === b.eights &&
  a.nines === b.nines &&
  a.aces === b.aces &&
  a.jackOnJack === b.jackOnJack &&
  a.mau === b.mau
