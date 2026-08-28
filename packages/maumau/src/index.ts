/**
 * `@kxb/maumau` - Mau-Mau for two to four, and the authority it is played
 * against.
 *
 * ---------------------------------------------------------------------------
 * What this is, and what it is not
 * ---------------------------------------------------------------------------
 * A game that *integrates* `@kxb/xp` as an SDK, the same way `@kxb/boxing`
 * does. It is not an XP: there is no document, no level, nothing the editor can
 * open and nothing the runtime loads. It imports the ports in `@kxb/xp/host` -
 * an identity, a transport, an authority - and in exchange gets four people
 * round a table against our Supabase, or against four `memoryHost`s in a test.
 *
 * ---------------------------------------------------------------------------
 * The one thing that makes this different from the fighting game
 * ---------------------------------------------------------------------------
 * **A hand is a secret**, and that single fact decides every design in the
 * package:
 *
 * | | boxing | this |
 * |---|---|---|
 * | who decides | the defender, on their own client | the arbiter, and nobody else |
 * | what is on the socket | five message types on three schedules | one nudge carrying a number |
 * | what a client predicts | its own punches, because it must | nothing, because it need not |
 * | randomness | none | the platform's, never the seeded stream |
 *
 * A fighting game gives authority to the client because the alternative loses
 * to lag. A card game cannot, because the alternative loses the game: whoever
 * holds the deck can read every hand, and a client trusted not to look is a
 * client that did not need the secret kept.
 *
 * `docs/xp/server-authority.md` §4 was opened for exactly this and §5 names
 * what was missing - *"Poker is no longer blocked on §4. It is blocked on a
 * hand"*: several secret values, drawn from a pile and discarded to another,
 * both outliving the deal. That is what `./net/arbiter.ts` adds.
 *
 * ---------------------------------------------------------------------------
 * The surface
 * ---------------------------------------------------------------------------
 * | Import | What it answers |
 * |---|---|
 * | `@kxb/maumau` | the table: its state, its rules, one move |
 * | `@kxb/maumau/cards` | what a card is, and what a pack is |
 * | `@kxb/maumau/house` | which Mau-Mau - the rules a table agrees on |
 * | `@kxb/maumau/arbiter` | the whole game, at the tier no client may reach |
 * | `@kxb/maumau/net` | play one over an `XpHost` |
 * | `@kxb/maumau/wire` | the one message, and how to read it |
 * | `@kxb/maumau/art` | which cell of the sheet draws which card |
 * | `@kxb/maumau/play` | the table, drawn |
 *
 * Everything except `./net` and `./arbiter` is pure: values in, values out, no
 * browser, no network, no clock. `bun test packages/maumau` plays whole hands
 * in microseconds, which is the only reason the rules can be trusted.
 */

export {
  DECKS,
  LONG_RANKS,
  SHORT_RANKS,
  SUITS,
  SUIT_LETTER,
  card,
  deckOf,
  isCard,
  nameOf,
  rankOf,
  ranksOf,
  readCard,
  readSuit,
  sizeOf,
  suitOf,
  type Card,
  type Deck,
  type Rank,
  type Suit,
} from './rules/cards'

/**
 * The house rules, from the root as well as `./house`.
 *
 * Because agreeing them is something a *host* does before anything is dealt -
 * a document's `frame.settings`, a room's choice - rather than something the
 * rules do. A caller that only wants to know how many cards are dealt should
 * not have to reach for the module that knows what a jack does.
 */
export {
  HOUSE,
  MAX_PLAYERS,
  MIN_PLAYERS,
  handCap,
  readHouse,
  sameHouse,
  type House,
} from './rules/house'

export {
  apply,
  catchable,
  deal,
  facing,
  follows,
  legal,
  myTurn,
  playableIn,
  seatAfter,
  seatAt,
  seatOf,
  seenBy,
  topOf,
  type Move,
  type Phase,
  type Seen,
  type Table,
} from './rules/table'
