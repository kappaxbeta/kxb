/**
 * `@kxb/maumau/cards` - a deck, and what a card is on the wire.
 *
 * ---------------------------------------------------------------------------
 * A card is a two- or three-character string, and that is not a shortcut
 * ---------------------------------------------------------------------------
 * `'h7'`, `'sA'`, `'d10'`. The obvious alternative is `{ suit, rank }`, and the
 * reason it is not that is where these end up: a hand is a `jsonb` array in
 * `xp_arbiter_state`, compared, shuffled and searched inside a plpgsql
 * function. `'h7' = any(hand)` is one expression in both languages. An array of
 * objects is a `jsonb_array_elements` and a pair of `->>`s on one side and a
 * `.find` with two comparisons on the other, and the two implementations of the
 * same rule are the thing this game most needs to keep identical.
 *
 * The encoding is a suit letter and then the rank verbatim, which makes it
 * sortable, greppable in a log, and readable in a `select state from
 * xp_arbiter_state` by somebody debugging at two in the morning.
 *
 * ---------------------------------------------------------------------------
 * Thirty-two cards, because that is the game
 * ---------------------------------------------------------------------------
 * Mau-Mau is played in Germany with a Skat deck: sevens up to aces, thirty-two
 * cards. That is not a variant to be configured - it is what makes the game
 * work. Five of the eight ranks do something (7, 8, 9, J, A), so nearly every
 * card is a decision, and a hand of five is a hand you can hold in your head.
 *
 * The full fifty-two is here anyway because the art has it and because a longer
 * deck is the honest answer to four players wanting a longer game: it adds
 * 2, 3, 4, 5 and 6, all of which are plain. It changes the *pace* and not the
 * rules, which is the only kind of option worth having.
 *
 * ---------------------------------------------------------------------------
 * No jokers
 * ---------------------------------------------------------------------------
 * The pack ships two and neither is dealt. A joker in Mau-Mau is a second wild
 * card competing with the jack for the same job, and a game with two wilds is a
 * game where the last card is almost never a problem. They stay in the box.
 */

/**
 * The four suits, in the order the atlas rows happen to be in.
 *
 * That coincidence is load-bearing exactly once - `../art/deck.ts` derives a
 * row index from this array rather than repeating the order - and nowhere else.
 * Nothing in the rules cares which suit is first.
 */
export const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'] as const
export type Suit = (typeof SUITS)[number]

/** One letter per suit, for the wire. `c` is clubs; `s` is spades. */
export const SUIT_LETTER: Record<Suit, string> = {
  hearts: 'h',
  diamonds: 'd',
  clubs: 'c',
  spades: 's',
}

const SUIT_OF_LETTER: Record<string, Suit> = {
  h: 'hearts',
  d: 'diamonds',
  c: 'clubs',
  s: 'spades',
}

/**
 * The ranks of a Skat deck, low to high.
 *
 * The order is the order they are dealt out of `deckOf`, which matters only for
 * the test that asserts a fresh deck is the same fresh deck every time. The
 * game never compares two ranks - there is no such thing as a higher card in
 * Mau-Mau - so this is a list and not a scale.
 */
export const SHORT_RANKS = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const

/** ...and the twenty extra a full pack adds, all of them plain. */
export const LONG_RANKS = ['2', '3', '4', '5', '6', ...SHORT_RANKS] as const

export type Rank = (typeof LONG_RANKS)[number]

/** Which pack is on the table. `short` is the real game; see the header. */
export const DECKS = ['short', 'full'] as const
export type Deck = (typeof DECKS)[number]

export const ranksOf = (deck: Deck): readonly Rank[] => (deck === 'full' ? LONG_RANKS : SHORT_RANKS)

/**
 * A card, as it travels.
 *
 * Typed as a plain `string` rather than a union of all fifty-two, deliberately.
 * Every card in this game arrives from somewhere - a `jsonb` column, a client's
 * ask - so the union would be a lie that `isCard` has to check at runtime
 * anyway, and a nominal type would put a cast at every boundary that reads one.
 */
export type Card = string

export const card = (suit: Suit, rank: Rank): Card => `${SUIT_LETTER[suit]}${rank}`

/**
 * Read a card that came from outside.
 *
 * Returns `null` rather than throwing, because every caller is a reader of
 * untrusted input and a thrown error inside a `filter` is a whole hand lost to
 * one bad entry.
 */
export function readCard(value: unknown): Card | null {
  if (typeof value !== 'string' || value.length < 2 || value.length > 3) return null
  const suit = SUIT_OF_LETTER[value[0]!]
  if (!suit) return null
  const rank = value.slice(1)
  if (!(LONG_RANKS as readonly string[]).includes(rank)) return null
  return value
}

export const isCard = (value: unknown): value is Card => readCard(value) !== null

/**
 * The suit of a card, or `null` if it is not one.
 *
 * Both halves are wanted at once often enough - "is this a card, and if so what
 * suit" - that a separate `isCard` guard before every read would be noise. A
 * caller that has already checked can assert; nothing in this package has to.
 */
export const suitOf = (value: Card): Suit | null => SUIT_OF_LETTER[value[0]!] ?? null

export const rankOf = (value: Card): Rank | null => {
  const rank = value.slice(1)
  return (LONG_RANKS as readonly string[]).includes(rank) ? (rank as Rank) : null
}

export const readSuit = (value: unknown): Suit | null =>
  typeof value === 'string' && (SUITS as readonly string[]).includes(value) ? (value as Suit) : null

/**
 * A fresh pack, in a fixed order, unshuffled.
 *
 * **It is not shuffled here, and that is the most important line in this file.**
 * Shuffling is the one act in this game that decides who wins, and the only
 * source of randomness allowed to do it is the one no client can reproduce -
 * see `../net/arbiter.ts`. A `deckOf` that shuffled would be a convenience that
 * puts the deal one careless import away from being computable by everybody at
 * the table.
 */
export function deckOf(deck: Deck = 'short'): Card[] {
  const cards: Card[] = []
  for (const suit of SUITS) for (const rank of ranksOf(deck)) cards.push(card(suit, rank))
  return cards
}

/** How many cards a pack has. `short` 32, `full` 52. */
export const sizeOf = (deck: Deck): number => SUITS.length * ranksOf(deck).length

/**
 * A card as somebody would say it out loud.
 *
 * English, and it stays English: this string reaches a log, a test failure and
 * a screen reader, and the game's *visible* words are the app's business - the
 * platform has a whole per-surface dictionary for that, see
 * `src/app/i18n/`. A package that shipped German here would be a package with
 * an opinion about a locale it cannot see.
 */
export const nameOf = (value: Card): string => {
  const suit = suitOf(value)
  const rank = rankOf(value)
  return suit && rank ? `${rank} of ${suit}` : value
}
