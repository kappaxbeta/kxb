/**
 * `@kxb/maumau/table` - a hand of Mau-Mau, as numbers.
 *
 * ---------------------------------------------------------------------------
 * What this is, in one line
 * ---------------------------------------------------------------------------
 * The whole game - two to four seats, a pile, a discard, sevens that stack, a
 * jack that wishes and a Mau you can be caught for not saying - with no
 * browser, no renderer, no network and no randomness of its own. `bun test`
 * plays a full four-handed game in well under a millisecond, which is the only
 * reason any rule below is trustworthy.
 *
 * ---------------------------------------------------------------------------
 * There is no `step`, and that is the difference from a fight
 * ---------------------------------------------------------------------------
 * `@kxb/boxing`'s rules are a function of *time*: `stepFight` is called sixty
 * times a second and a punch is seventy milliseconds of startup. Nothing here
 * is. A table changes when somebody does something and at no other moment, so
 * the whole of it is `legal` and `apply` and there is no clock in the package
 * at all.
 *
 * That is what makes this game's netcode small enough to be a paragraph rather
 * than a file: there is no interpolation, no prediction and no reconciliation,
 * because there is nothing continuous to interpolate. See `../net/wire.ts`.
 *
 * ---------------------------------------------------------------------------
 * `apply` never shuffles, and `legal` never sees a hand it should not
 * ---------------------------------------------------------------------------
 * Two rules that keep this file honest and are easy to break by accident:
 *
 * **Randomness is injected.** `apply` takes a `shuffle` for the one moment it
 * needs one - refilling an empty pile from the discard - and has none of its
 * own. The deal is not in this file at all; it is in `../net/arbiter.ts`, for
 * the reason `cards.ts` gives: the only source allowed to order a pack is one
 * no client can reproduce.
 *
 * **Legality is public.** `follows` below decides whether a card may be played
 * from the top card, the wish, what is owed and the house - every one of which
 * every player can see. That is not a stylistic choice: the client greys out
 * the cards you cannot play, and it does that by calling the same function the
 * authority refuses you with. One predicate, two callers, no drift.
 *
 * ---------------------------------------------------------------------------
 * A turn is exactly one action
 * ---------------------------------------------------------------------------
 * Play a card, or draw. That is the whole move list, and drawing always ends
 * your turn - including the common house rule where you keep drawing until
 * something is playable, which this deliberately does not have.
 *
 * The reason is the network rather than the game. "Draw until playable" is a
 * turn made of an unknown number of round trips, during which the client has to
 * decide whether it is still your go; every version of that either asks the
 * authority in a loop or lets the client decide when to stop, and the second is
 * a client deciding a rule. One action, one ask, one answer.
 *
 * The exception that proves it is `catch`, which is not a turn: it is out of
 * turn by definition, because the whole point is catching somebody in the
 * moment they were not paying attention.
 */

import { rankOf, suitOf, type Card, type Suit } from './cards'
import { MIN_PLAYERS, type House } from './house'

export type Phase = 'playing' | 'over'

/**
 * Everything about a hand in progress, including what nobody may see.
 *
 * **This object never leaves the authority.** `hands` is every hand, in full,
 * and a `Table` that reached a client would be the whole game visible in a
 * console. What a client gets is a `Seen` - the bottom of this file - and the
 * two types are deliberately not related by inheritance, so that widening one
 * cannot quietly widen the other.
 */
export interface Table {
  house: House
  /**
   * Who is playing, in turn order.
   *
   * Fixed for the length of a hand. Somebody who disconnects keeps their seat
   * and their cards, because the alternative - collapsing the seat - changes
   * whose turn it is and what the direction means halfway through, and a player
   * whose train went into a tunnel is back in forty seconds.
   */
  seats: string[]
  /** Every hand, by seat. Secret, and the reason `Seen` exists. */
  hands: Record<string, Card[]>
  /** Face down. The *last* entry is the next card drawn. */
  pile: Card[]
  /** Face up. The last entry is the top card. */
  discard: Card[]
  /** Index into `seats`. */
  turn: number
  direction: 1 | -1
  /**
   * Cards owed by whoever is to act, from sevens.
   *
   * On the table rather than on the player, because it is owed by *the seat*
   * and it moves: a seven answered with a seven passes four to the next person,
   * who never played anything.
   */
  owed: number
  /** What the top card counts as, after a jack. Null the rest of the time. */
  wish: Suit | null
  /** Seats with one card who said so. See `House.mau`. */
  said: string[]
  phase: Phase
  /** Who emptied their hand. Null until somebody does. */
  winner: string | null
  /** Hands won, across the whole sitting. Survives a deal; see `../net/arbiter`. */
  wins: Record<string, number>
}

export type Move =
  | { kind: 'play'; card: Card; wish?: Suit; mau?: boolean }
  | { kind: 'draw' }
  /**
   * "Mau!", said after the card is down.
   *
   * The `mau` flag on a play says it *with* the card and is the safe way: one
   * ask, no race, nobody can be quicker than you. This is the other way, and it
   * is the one the game is actually played with - you put the card down and
   * then you say it, and somebody at the table may be faster.
   *
   * Both exist because they are different promises. The flag is for a player
   * who planned it; this is for the one who remembered a second later, which is
   * most of them. Without it, forgetting to arm a toggle *before* playing was
   * unrecoverable - the turn had already moved on.
   */
  | { kind: 'mau' }
  | { kind: 'catch'; who: string }

/** The card everybody is looking at. */
export const topOf = (discard: readonly Card[]): Card | null =>
  discard.length > 0 ? discard[discard.length - 1]! : null

/**
 * What the top card counts as.
 *
 * The wish when there is one, and the top card's own suit otherwise. Every
 * legality question goes through this rather than through `suitOf(top)`, which
 * is the bug it exists to prevent: a jack wished into hearts is still a jack of
 * clubs, and a rule that read the card would let the next player follow with
 * clubs and quietly undo the strongest move in the game.
 */
export const facing = (discard: readonly Card[], wish: Suit | null): Suit | null => {
  if (wish) return wish
  const top = topOf(discard)
  return top ? suitOf(top) : null
}

/**
 * May this card be played onto that top card?
 *
 * Public in every argument, which is the whole design - see the header. Returns
 * the reason it may not, so the authority refuses with a sentence and the
 * client can put the same sentence in a tooltip.
 */
export function follows(
  card: Card,
  discard: readonly Card[],
  wish: Suit | null,
  owed: number,
  house: House,
): string | null {
  const rank = rankOf(card)
  const suit = suitOf(card)
  if (!rank || !suit) return 'not a card'

  const top = topOf(discard)
  if (!top) return 'nothing to play on'

  /**
   * A debt is answered with a seven or not at all.
   *
   * Checked before anything else, because while two are owed the top card's
   * suit is irrelevant: a matching eight is still not an answer. Refusing here
   * rather than in the suit test is what makes the message say what is actually
   * wrong.
   */
  if (owed > 0) {
    return rank === '7' && house.sevens ? null : 'you owe cards - play a seven or draw'
  }

  if (rank === 'J') {
    // The jack goes on anything, except the thing everybody's grandmother has a
    // saying about.
    return house.jackOnJack && rankOf(top) === 'J' ? 'no jack on a jack' : null
  }

  if (suit === facing(discard, wish)) return null
  /**
   * Rank matches the top card's *rank*, and never the wish.
   *
   * A wish names a suit and nothing else. Following a wished jack by rank would
   * mean answering "hearts, please" with another jack, which is the jack-on-jack
   * rule arriving through the side door.
   */
  if (!wish && rank === rankOf(top)) return null

  /**
   * Two fixed sentences, and neither of them names the suit.
   *
   * `${wish} was asked for` is the obvious wording and it cannot be
   * translated: German wants *"Herz wurde gewünscht"*, and a sentence
   * assembled around a suit name is a sentence whose article is wrong in half
   * the cases. The wish is drawn beside the pile anyway - see `Words.table.
   * wished` - so the refusal says what is wrong and the table says what was
   * asked for.
   */
  return wish ? 'follow the suit that was asked for' : 'that follows nothing'
}

/**
 * Who acts after this seat, given what was just played.
 *
 * `by` is how many places to move: one normally, two for an eight, zero for an
 * ace. Written as a helper rather than inline because it is the one piece of
 * arithmetic in the file that is easy to get wrong in a way tests do not catch
 * - a negative modulo in JavaScript is negative.
 */
export const seatAfter = (turn: number, direction: 1 | -1, seats: number, by = 1): number =>
  seats === 0 ? 0 : (((turn + direction * by) % seats) + seats) % seats

export const seatAt = (table: Table): string | null => table.seats[table.turn] ?? null

/**
 * May this seat make this move, right now?
 *
 * `null` for yes, a sentence for no. Every refusal in the game comes from here
 * and from nowhere else, which is what lets `../net/arbiter.ts` be a
 * transcription of state changes with one guard at the top.
 */
export function legal(table: Table, seat: string, move: Move): string | null {
  if (table.phase !== 'playing') return 'the hand is over'
  if (!table.seats.includes(seat)) return 'you are not at this table'

  const hand = table.hands[seat] ?? []

  /**
   * Saying it, and catching somebody who did not - the two moves that are not
   * turns.
   *
   * Checked before `seatAt`, and that ordering is the rule: both arrive from
   * somebody who is by definition not playing, and testing whose turn it is
   * before testing the move kind would refuse every one that ever mattered.
   *
   * They are also each other's race, which is the game: the authority holds a
   * lock, so exactly one of "Mau!" and "you did not say Mau!" gets there first
   * and the other is refused by the state the first one left.
   */
  if (move.kind === 'mau') {
    if (!table.house.mau) return 'this table does not play Mau'
    if (hand.length !== 1) return 'you are not on your last card'
    if (table.said.includes(seat)) return 'you have already said it'
    return null
  }

  if (move.kind === 'catch') {
    if (!table.house.mau) return 'this table does not play Mau'
    if (move.who === seat) return 'you cannot catch yourself'
    if (!table.seats.includes(move.who)) return 'they are not at this table'
    const theirs = table.hands[move.who] ?? []
    if (theirs.length !== 1) return 'they are not on their last card'
    if (table.said.includes(move.who)) return 'they said it'
    return null
  }

  if (seatAt(table) !== seat) return 'not your turn'

  if (move.kind === 'draw') return null

  if (!hand.includes(move.card)) return 'that card is not in your hand'

  const refusal = follows(move.card, table.discard, table.wish, table.owed, table.house)
  if (refusal) return refusal

  /**
   * A jack has to name a suit, and only a jack may.
   *
   * The second half is not pedantry. A wish riding along on an ordinary card
   * would be a client setting the table's `wish` field with a seven, and the
   * next player would be told hearts were asked for by a card that never asked.
   */
  if (rankOf(move.card) === 'J') {
    if (!move.wish) return 'name a suit'
  } else if (move.wish) {
    return 'only a jack names a suit'
  }

  return null
}

/**
 * Make the move. The caller has already checked it is legal.
 *
 * Returns a new table rather than mutating one - the opposite of
 * `@kxb/boxing`'s `stepFight`, and for the opposite reason. That runs sixty
 * times a second and allocation is the cost that matters; this runs when
 * somebody puts a card down, perhaps once every four seconds, and being able to
 * compare before and after is worth more than the garbage.
 *
 * `shuffle` is used for exactly one thing: refilling an exhausted pile from the
 * discard. It is injected because randomness in this game belongs to the
 * authority alone - see the header, and `../net/arbiter.ts` for the one that is
 * real.
 */
export function apply(
  table: Table,
  seat: string,
  move: Move,
  shuffle: (cards: Card[]) => Card[],
): Table {
  const next: Table = {
    ...table,
    hands: { ...table.hands },
    pile: [...table.pile],
    discard: [...table.discard],
    said: [...table.said],
    wins: { ...table.wins },
  }

  if (move.kind === 'mau') {
    // Not a turn, so nothing else moves. `settleMau` is what decides whether it
    // sticks, from the hand rather than from the asking.
    settleMau(next, seat, true)
    return next
  }

  if (move.kind === 'catch') {
    draw(next, move.who, 2, shuffle)
    // No turn change, and no `said` bookkeeping: they were not in it, which is
    // why the catch was legal in the first place.
    return next
  }

  if (move.kind === 'draw') {
    /**
     * A debt is paid in full, or one card is taken. Either way the turn ends.
     *
     * `owed` is cleared whatever was actually drawn, including when the pile
     * could not cover it. A debt that survived an exhausted pile would be a
     * debt the next player inherits without anybody having played a seven.
     */
    draw(next, seat, next.owed > 0 ? next.owed : 1, shuffle)
    next.owed = 0
    settleMau(next, seat, false)
    next.turn = seatAfter(next.turn, next.direction, next.seats.length)
    return next
  }

  const hand = [...(next.hands[seat] ?? [])]
  const at = hand.indexOf(move.card)
  if (at >= 0) hand.splice(at, 1)
  next.hands[seat] = hand
  next.discard.push(move.card)

  const rank = rankOf(move.card)

  /**
   * The wish is replaced on every play, not only by a jack.
   *
   * Which is what clears it: a wish is an instruction about the *next* card,
   * and once that card is down the instruction has been obeyed. Leaving it set
   * would make one jack rule the rest of the hand.
   */
  next.wish = rank === 'J' ? (move.wish ?? null) : null

  settleMau(next, seat, move.mau === true)

  if (hand.length === 0) {
    next.phase = 'over'
    next.winner = seat
    next.wins[seat] = (next.wins[seat] ?? 0) + 1
    return next
  }

  if (rank === '7' && next.house.sevens) {
    next.owed += 2
    next.turn = seatAfter(next.turn, next.direction, next.seats.length)
    return next
  }

  if (rank === '8' && next.house.eights) {
    next.turn = seatAfter(next.turn, next.direction, next.seats.length, 2)
    return next
  }

  if (rank === '9' && next.house.nines) {
    /**
     * Turn round, *then* move on - except at two, where turning round is
     * nothing and the card would be wasted.
     *
     * Reversing a two-seat ring is arithmetically the identity: `+1` and `-1`
     * are the same step modulo two, so a nine played head-to-head would pass
     * play on exactly like a queen. That is not a rule anybody agreed to; it is
     * the modulo showing through. At two seats it skips instead, which returns
     * the turn to whoever played it and is what every table means by "reverse"
     * when there are only two of them.
     */
    if (next.seats.length <= MIN_PLAYERS) {
      next.turn = seatAfter(next.turn, next.direction, next.seats.length, 2)
      return next
    }
    next.direction = next.direction === 1 ? -1 : 1
    next.turn = seatAfter(next.turn, next.direction, next.seats.length)
    return next
  }

  if (rank === 'A' && next.house.aces) {
    // Another go: the turn does not move at all.
    return next
  }

  next.turn = seatAfter(next.turn, next.direction, next.seats.length)
  return next
}

/**
 * Take cards off the pile, refilling it from the discard if it runs out.
 *
 * The refill leaves the top card where it is - it is the card everybody is
 * playing on, and shuffling it back in would change what follows what in the
 * middle of somebody's turn.
 */
function draw(table: Table, seat: string, count: number, shuffle: (cards: Card[]) => Card[]): void {
  const hand = [...(table.hands[seat] ?? [])]

  for (let taken = 0; taken < count; taken++) {
    if (table.pile.length === 0) {
      const top = table.discard.pop()
      /**
       * Nothing to refill from means nothing to draw, and the turn still ends.
       *
       * Reachable only with a hand size the cap in `./house` is meant to
       * prevent, so this is a floor rather than a rule: the alternative is a
       * throw inside the one function every move goes through, which would take
       * a table down rather than quietly give somebody a card fewer.
       */
      if (!top) break
      table.pile = shuffle(table.discard)
      table.discard = [top]
      if (table.pile.length === 0) break
    }
    const card = table.pile.pop()
    if (!card) break
    hand.push(card)
  }

  table.hands[seat] = hand
}

/**
 * Who is on one card and said so, after a move.
 *
 * A single place, called by both `play` and `draw`, because the failure it
 * prevents is the one this rule always has: a player who says Mau, then draws
 * two, then plays back down to one is *not* still covered by the thing they
 * said three turns ago. Membership of `said` is recomputed from the hand every
 * time rather than being a flag somebody remembers to clear.
 */
function settleMau(table: Table, seat: string, declared: boolean): void {
  const size = (table.hands[seat] ?? []).length
  const said = table.said.filter((who) => who !== seat)
  if (size === 1 && declared && table.house.mau) said.push(seat)
  table.said = said
}

/**
 * A fresh table, dealt.
 *
 * The pack arrives already shuffled, because this file is not allowed to
 * shuffle one - see the header. `wins` is carried across from the last hand so
 * that a sitting keeps a score; everything else starts again.
 */
export function deal(
  seats: readonly string[],
  pack: readonly Card[],
  house: House,
  wins: Record<string, number> = {},
): Table {
  if (seats.length < MIN_PLAYERS) throw new Error('a table needs two')

  const pile = [...pack]
  const hands: Record<string, Card[]> = {}
  for (const seat of seats) hands[seat] = []
  // Round by round rather than seat by seat, which changes nothing about a
  // shuffled pack and everything about reading a test that uses a stacked one.
  for (let round = 0; round < house.hand; round++) {
    for (const seat of seats) {
      const card = pile.pop()
      if (card) hands[seat]!.push(card)
    }
  }

  /**
   * The first card up cannot be a jack.
   *
   * A hand that opens on a wild card opens with a wish nobody made, so the
   * first player may follow with anything and the card is wasted. Buried and
   * redrawn, which is what a dealer does with it.
   */
  let top = pile.pop()
  const buried: Card[] = []
  while (top && rankOf(top) === 'J' && pile.length > 0) {
    buried.push(top)
    top = pile.pop()
  }
  if (buried.length > 0) pile.unshift(...buried)

  return {
    house,
    seats: [...seats],
    hands,
    pile,
    discard: top ? [top] : [],
    turn: 0,
    direction: 1,
    /**
     * A seven face up at the start owes nothing.
     *
     * The specials are all *played* effects - somebody chose that card - and the
     * dealer chose nothing. A table that opened by making the first player draw
     * two would be punishing them for sitting down first.
     */
    owed: 0,
    wish: null,
    said: [],
    phase: 'playing',
    winner: null,
    wins: { ...wins },
  }
}

// ---------------------------------------------------------------------------
// What one player is allowed to know
// ---------------------------------------------------------------------------

/**
 * The table, from one seat.
 *
 * Your hand in full and everybody else's as a count, which is the sentence
 * `XpArbiter.view` is written around and the reason this game needs an
 * authority at all. Everything else here is public and always was: the top
 * card, the wish, what is owed, whose turn it is, how many cards are face down.
 *
 * **It carries no `pile`.** A count and not the cards, and that is not an
 * oversight to be optimised away later: the order of the pile is who draws
 * what for the rest of the hand, and a client that had it would know the next
 * six cards.
 */
export interface Seen {
  house: House
  seats: string[]
  turn: number
  direction: 1 | -1
  owed: number
  wish: Suit | null
  /** The card everybody is playing on, or null before the deal. */
  top: Card | null
  /** How many are face down, including nothing left to draw. */
  pile: number
  /** How many cards each seat holds. Every seat, this one included. */
  counts: Record<string, number>
  said: string[]
  phase: Phase
  winner: string | null
  wins: Record<string, number>
  /** Whose view this is. */
  me: string
  /** ...and their cards, which is the one secret in here. */
  hand: Card[]
}

export function seenBy(table: Table, me: string): Seen {
  const counts: Record<string, number> = {}
  for (const seat of table.seats) counts[seat] = (table.hands[seat] ?? []).length

  return {
    house: table.house,
    seats: [...table.seats],
    turn: table.turn,
    direction: table.direction,
    owed: table.owed,
    wish: table.wish,
    top: topOf(table.discard),
    pile: table.pile.length,
    counts,
    said: [...table.said],
    phase: table.phase,
    winner: table.winner,
    wins: { ...table.wins },
    me,
    hand: [...(table.hands[me] ?? [])],
  }
}

/** Whose turn it is, from a view. */
export const seatOf = (seen: Seen): string | null => seen.seats[seen.turn] ?? null

export const myTurn = (seen: Seen): boolean => seen.phase === 'playing' && seatOf(seen) === seen.me

/**
 * Which of my cards I could actually put down.
 *
 * The client's version of `legal`, and it calls the same `follows` the
 * authority refuses with, from a `Seen` that has every input it needs. That is
 * the payoff of keeping legality public: the greyed-out cards in the hand and
 * the refusal from the server can not disagree, because there is one function.
 */
export const playableIn = (seen: Seen): Card[] =>
  myTurn(seen)
    ? seen.hand.filter((card) => follows(card, seen.top ? [seen.top] : [], seen.wish, seen.owed, seen.house) === null)
    : []

/** Whether this player still owes the table a "Mau!". */
export const owesMau = (seen: Seen): boolean =>
  seen.house.mau &&
  seen.phase === 'playing' &&
  seen.hand.length === 1 &&
  !seen.said.includes(seen.me)

/**
 * Anybody at this table who can be caught for not saying Mau, right now.
 *
 * From a view, so the button that does it can be drawn without asking
 * anybody - a count of one and an absence from `said` are both public. The
 * authority checks it again, as it checks everything.
 */
export const catchable = (seen: Seen): string[] =>
  seen.house.mau && seen.phase === 'playing'
    ? seen.seats.filter(
        (seat) => seat !== seen.me && seen.counts[seat] === 1 && !seen.said.includes(seat),
      )
    : []
