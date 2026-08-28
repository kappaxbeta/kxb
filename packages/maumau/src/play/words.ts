/**
 * `@kxb/maumau` in English and German.
 *
 * ---------------------------------------------------------------------------
 * Why the words are in the package and not in `src/app/i18n/`
 * ---------------------------------------------------------------------------
 * Every other dictionary in this project is a surface of the app - the rail,
 * the store, the editor - and belongs there because the app is what draws it. A
 * game package is the other case: it draws itself, it names no app, and the
 * whole claim `@kxb/boxing` makes about being liftable out is a claim about
 * *everything* it needs travelling with it. A game whose German lived in
 * `src/app/i18n/maumau.ts` would be a game that loses its German the moment it
 * is dropped into another project.
 *
 * So the dictionary is here and the *choice* is the app's: the frame adapter
 * reads `useLocale()` and passes one of these in, which is the same escape
 * hatch `src/app/xp/_runtime/games/boxing.tsx` uses for the audio port. See
 * `FrameProps` - the platform has no locale field, deliberately, and one file
 * is allowed to know both sides.
 *
 * ---------------------------------------------------------------------------
 * German first, and this once that is not a preference
 * ---------------------------------------------------------------------------
 * Mau-Mau is a German game. The specials have German names that English has no
 * word for - a *Bube* wishes, and "jack" is only what the card is called - and
 * a player who knows the game will read "wish a suit" as a translation of
 * something. So the German is written first and the English is written to match
 * it, rather than the other way round, and where the two disagree about how a
 * rule is *said* the German is the one that is right.
 *
 * ---------------------------------------------------------------------------
 * Phrases, not slots - especially for the suits
 * ---------------------------------------------------------------------------
 * The trap this project has already paid for once: German articles do not
 * survive being assembled out of a template. "Hearts was asked for" wants
 * *"Herz wurde gewünscht"*, and the same sentence with clubs wants *"Kreuz
 * wurde gewünscht"* - which happens to work, and then `wishes` needs *"Ich
 * wünsche mir Karo"* and the accusative shows up. Every string below is
 * complete, and the two that genuinely take a value take it at the end where no
 * article can be attached to it.
 *
 * ---------------------------------------------------------------------------
 * `refusals` is keyed by the English sentence
 * ---------------------------------------------------------------------------
 * The same shape an XP's `words` block uses, and for the same reason: the
 * sentence a rule refuses with is written in `../rules/table.ts`, in English,
 * and is the *identity* of that refusal as well as its text. Keying by it means
 * a refusal that has no German falls through to something a player can still
 * read, rather than to a blank - and it means adding a rule does not silently
 * add an untranslated string in a language nobody checked.
 */

import { SUITS, type Suit } from '../rules/cards'

/**
 * The two this game is written in.
 *
 * A subset of `@/domain/i18n/locale`'s `LOCALES` rather than a copy of it, and
 * the difference is the point: the app may grow a third locale whenever it
 * likes, and a game package is not a thing that gets translated by somebody
 * adding a route. `tongueFor` below is the join, so growing that list does not
 * break this build.
 */
export const TONGUES = ['en', 'de'] as const
export type Tongue = (typeof TONGUES)[number]

/**
 * The nearest tongue this game has, for whatever the reader's locale is.
 *
 * English for anything unrecognised, which is the honest fallback: a player
 * whose language this game has not been translated into gets a game they can
 * read, rather than a blank or a refusal. It is deliberately *not* an error -
 * the app's locale list is the app's business, and a package that failed to
 * compile when somebody added a route would be a package holding the app
 * hostage to its own translation status.
 */
export const tongueFor = (locale: string | null | undefined): Tongue =>
  (TONGUES as readonly string[]).includes(locale ?? '') ? (locale as Tongue) : 'en'

export interface Words {
  /** What the game is called. The same in both, which is the point of it. */
  title: string
  /** The four suits, as a player says them. */
  suits: Record<Suit, string>

  lobby: {
    /** Above the empty table. */
    waiting: string
    /** With a count: `${n}` seats taken. Complete sentences, one per case. */
    alone: string
    ready: string
    full: string
    sit: string
    stand: string
    /** Said before the cards come out. See `Sitting.ready`. */
    imReady: string
    /** ...and taking it back, which is the same button pressed again. */
    notReady: string
    /** Followed by "2 / 4". A label, so no grammar has to agree with a number. */
    readyCount: string
    /** Under the deal button, when it is not everybody's turn to press it yet. */
    waitingForReady: string
    deal: string
    dealAgain: string
    /** Shown while the authority has not answered yet. */
    asking: string
    /** No arbiter at all - see `../net/arbiter.ts`. */
    noDealer: string
  }

  table: {
    yourTurn: string
    /** Followed by a name. The name goes last in both languages. */
    waitingFor: string
    draw: string
    /** With the number owed - complete except for the digits at the end. */
    drawOwed: string
    /** The button on the card that takes you to one. */
    sayMau: string
    /** The one everybody else presses. */
    catchThem: string
    caught: string
    /** Above the suit picker. */
    wishWhich: string
    /** After a jack. Followed by the suit name. */
    wished: string
    pile: string
    /** How many cards somebody is holding. */
    cards: string
    oneCard: string
    /** The reversal, drawn as a direction. */
    order: string
  }

  over: {
    /** Followed by a name. */
    won: string
    youWon: string
    /** The score line. */
    hands: string
  }

  /** Keyed by the English sentence `../rules/table.ts` refuses with. */
  refusals: Record<string, string>
}

/**
 * The English.
 *
 * The refusal keys are *identical* to their values here, which is what makes
 * this half of the table verifiable at a glance: an entry whose key and value
 * differ is a typo, and `words.test.ts` says so.
 */
export const EN: Words = {
  title: 'Mau-Mau',
  suits: { hearts: 'Hearts', diamonds: 'Diamonds', clubs: 'Clubs', spades: 'Spades' },

  lobby: {
    waiting: 'Waiting for players',
    alone: 'You are the only one sitting down',
    ready: 'Ready when you are',
    full: 'The table is full',
    sit: 'Sit down',
    stand: 'Stand up',
    imReady: "I'm ready",
    notReady: 'Not yet',
    readyCount: 'Ready',
    waitingForReady: 'The hand starts when everybody is ready.',
    deal: 'Deal',
    dealAgain: 'Deal again',
    asking: 'Asking the dealer…',
    noDealer: 'This table has no dealer, so nobody can hold the deck.',
  },

  table: {
    yourTurn: 'Your turn',
    waitingFor: 'Waiting for',
    draw: 'Draw a card',
    drawOwed: 'Take what you owe:',
    sayMau: 'Say Mau!',
    catchThem: 'They did not say Mau!',
    caught: 'Caught — two cards',
    wishWhich: 'Which suit?',
    wished: 'Asked for:',
    pile: 'Face down',
    cards: 'cards',
    oneCard: 'one card',
    order: 'Order of play',
  },

  over: {
    won: 'This hand went to',
    youWon: 'You won this hand',
    hands: 'hands',
  },

  refusals: {
    'not your turn': 'not your turn',
    'the hand is over': 'the hand is over',
    'you are not at this table': 'you are not at this table',
    'that card is not in your hand': 'that card is not in your hand',
    'you owe cards - play a seven or draw': 'you owe cards - play a seven or draw',
    'no jack on a jack': 'no jack on a jack',
    'that follows nothing': 'that follows nothing',
    'follow the suit that was asked for': 'follow the suit that was asked for',
    'nothing to play on': 'nothing to play on',
    'not a card': 'not a card',
    'name a suit': 'name a suit',
    'only a jack names a suit': 'only a jack names a suit',
    'you cannot catch yourself': 'you cannot catch yourself',
    'they are not at this table': 'they are not at this table',
    'they are not on their last card': 'they are not on their last card',
    'you are not on your last card': 'you are not on your last card',
    'you have already said it': 'you have already said it',
    'they said it': 'they said it',
    'this table does not play Mau': 'this table does not play Mau',
    'this table is full': 'this table is full',
    'this table was opened with different rules': 'this table was opened with different rules',
    'wait for this hand to finish': 'wait for this hand to finish',
    'this hand is not finished': 'this hand is not finished',
    'a table needs two': 'a table needs two',
    'not everybody is ready': 'not everybody is ready',
    'nothing has been dealt': 'nothing has been dealt',
    'there is no table': 'there is no table',
    'that is not a move': 'that is not a move',
    'this table has no dealer': 'this table has no dealer',
  },
}

/**
 * ...and the German, which is the one the game was written in.
 *
 * `Bube`, `Herz`, `Karo`, `Kreuz`, `Pik` are the card names every German player
 * uses and are not translations of the English ones - `Kreuz` is "cross", not
 * "clubs", and rendering it as "Klee" because the pip is a clover would be
 * correct about the picture and wrong about the game.
 *
 * "Mau" itself is untranslated in both directions, because it is not a word in
 * either language. It is what you say.
 */
export const DE: Words = {
  title: 'Mau-Mau',
  suits: { hearts: 'Herz', diamonds: 'Karo', clubs: 'Kreuz', spades: 'Pik' },

  lobby: {
    waiting: 'Warten auf Mitspieler',
    alone: 'Du sitzt allein am Tisch',
    ready: 'Es kann losgehen',
    full: 'Der Tisch ist voll',
    sit: 'Platz nehmen',
    stand: 'Aufstehen',
    imReady: 'Bereit',
    notReady: 'Doch nicht',
    readyCount: 'Bereit',
    waitingForReady: 'Es geht los, sobald alle bereit sind.',
    deal: 'Geben',
    dealAgain: 'Neu geben',
    asking: 'Der Geber wird gefragt …',
    noDealer: 'An diesem Tisch gibt niemand, also kann auch niemand die Karten halten.',
  },

  table: {
    yourTurn: 'Du bist dran',
    waitingFor: 'Am Zug ist',
    draw: 'Karte ziehen',
    /** The number lands after the colon, so no article has to agree with it. */
    drawOwed: 'Strafkarten ziehen:',
    sayMau: 'Mau sagen!',
    catchThem: 'Mau vergessen!',
    caught: 'Erwischt — zwei Karten',
    wishWhich: 'Welche Farbe?',
    wished: 'Gewünscht:',
    pile: 'Verdeckt',
    cards: 'Karten',
    oneCard: 'eine Karte',
    order: 'Spielrichtung',
  },

  over: {
    won: 'Diese Runde geht an',
    youWon: 'Du hast diese Runde gewonnen',
    hands: 'Runden',
  },

  refusals: {
    'not your turn': 'Du bist nicht dran',
    'the hand is over': 'Die Runde ist vorbei',
    'you are not at this table': 'Du sitzt nicht an diesem Tisch',
    'that card is not in your hand': 'Diese Karte hast du nicht',
    'you owe cards - play a seven or draw':
      'Du musst ziehen — leg eine Sieben oder nimm die Strafkarten',
    'no jack on a jack': 'Bube auf Bube ist Sauerei',
    'that follows nothing': 'Die Karte passt nicht',
    'follow the suit that was asked for': 'Es wurde eine andere Farbe gewünscht',
    'nothing to play on': 'Es liegt nichts zum Anlegen',
    'not a card': 'Das ist keine Karte',
    'name a suit': 'Wünsch dir eine Farbe',
    'only a jack names a suit': 'Nur ein Bube darf sich etwas wünschen',
    'you cannot catch yourself': 'Dich selbst kannst du nicht erwischen',
    'they are not at this table': 'Die Person sitzt nicht an diesem Tisch',
    'they are not on their last card': 'Da ist noch mehr als eine Karte',
    'you are not on your last card': 'Du hast noch mehr als eine Karte',
    'you have already said it': 'Du hast es schon gesagt',
    'they said it': 'Mau wurde gesagt',
    'this table does not play Mau': 'An diesem Tisch wird Mau nicht gespielt',
    'this table is full': 'Der Tisch ist voll',
    'this table was opened with different rules': 'Dieser Tisch wurde mit anderen Regeln eröffnet',
    'wait for this hand to finish': 'Warte, bis die Runde vorbei ist',
    'this hand is not finished': 'Die Runde läuft noch',
    'a table needs two': 'Zu zweit geht es los',
    'not everybody is ready': 'Es sind noch nicht alle bereit',
    'nothing has been dealt': 'Es wurde noch nicht gegeben',
    'there is no table': 'Es gibt keinen Tisch',
    'that is not a move': 'Das ist kein Zug',
    'this table has no dealer': 'An diesem Tisch gibt niemand',
  },
}

export const WORDS: Record<Tongue, Words> = { en: EN, de: DE }

/**
 * A refusal, said in this language - or said as it arrived.
 *
 * The fallthrough is deliberate and is the reason `refusals` is a map rather
 * than a closed union. A rule added to `../rules/table.ts` without a line here
 * reaches the player in English, which is a small wart; the alternatives are a
 * blank box or a build that breaks when somebody writes a rule, and both are
 * worse than a sentence in the wrong language.
 */
export const say = (words: Words, refusal: string): string =>
  words.refusals[refusal] ?? refusal

/** The suit a jack asked for, in this language. */
export const suitName = (words: Words, suit: Suit): string => words.suits[suit]

/** Every suit, in the order the picker draws them. */
export const suitList = (words: Words): { suit: Suit; label: string }[] =>
  SUITS.map((suit) => ({ suit, label: words.suits[suit] }))
