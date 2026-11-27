/**
 * The things a silent hand can say, and how each language says them.
 *
 * This is the answer to "translate it automatically into the other person's
 * version", and the answer is that **nothing is translated at the moment it is
 * sent**. What travels between two people is a *meaning* - `'thanks'` - and each
 * screen draws that meaning in whatever language its own reader has chosen. The
 * German player signs it, the Bulgarian player reads Благодаря, and no service
 * was called, no sentence was guessed at, and nothing arrives late.
 *
 * That is not a shortcut around a real translator, it is the same decision the
 * pen already made one door along: `_ink/words.ts` keys its spells by meaning
 * rather than spelling precisely so that nobody downstream has to care how the
 * word was written. A machine translator would be the wrong tool here twice
 * over - it would be slower than the gesture, and it would be *unreliable* in a
 * mode whose entire promise is that somebody who cannot hear the room can still
 * be understood in it. A short phrasebook that is always right beats an
 * unlimited one that is sometimes wrong, when being wrong means a stranger
 * misreads you.
 *
 * The cost of that decision is the honest one: **only these phrases cross a
 * language.** Anything else you spell arrives spelled, exactly as you made it,
 * which is what fingerspelling has always been for. See `signing.ts`.
 *
 * ## Spelling them
 *
 * Two letters each, taken from the English word, and it does not matter that
 * they are English: they are a *shortcut on your fingers*, no more the language
 * of the message than `Ctrl-S` is the language of a document. A German player
 * learns that `th` is the thank-you hand and reads Danke on their own screen.
 *
 * Two letters is enough because a phrase only counts when it is the whole of
 * what you have signed - see `signing.ts` on the open hand - so unlike the pen
 * there is nothing here that can go off in the middle of a longer word.
 */

import type { Letter } from '@/app/world/_hand/alphabet'
import type { Locale } from '@/domain/i18n/locale'

export type Phrase =
  | 'hello'
  | 'yes'
  | 'no'
  | 'thanks'
  | 'sorry'
  | 'please'
  | 'help'
  | 'wait'
  | 'come'
  | 'stop'
  | 'again'
  | 'bye'
  | 'good'
  | 'name'

export interface Signed {
  phrase: Phrase
  /** The letters, in the order they are signed. */
  letters: Letter[]
}

/**
 * The book. Fourteen phrases, and the shortness of the list is the design.
 *
 * Every one of them is something you need *while standing in a room with
 * somebody*, which is a much smaller set than "things people say". A phrasebook
 * that tried to be a language would be one nobody finishes learning, and the
 * hands are the slow part - a fifteenth entry costs everybody who uses this
 * another thing to remember, forever.
 */
export const PHRASES: Signed[] = [
  { phrase: 'hello', letters: ['h', 'e'] },
  { phrase: 'yes', letters: ['y', 'e'] },
  { phrase: 'no', letters: ['n', 'o'] },
  { phrase: 'thanks', letters: ['t', 'h'] },
  { phrase: 'sorry', letters: ['s', 'r'] },
  { phrase: 'please', letters: ['p', 'l'] },
  { phrase: 'help', letters: ['h', 'p'] },
  { phrase: 'wait', letters: ['w', 'a'] },
  { phrase: 'come', letters: ['c', 'm'] },
  { phrase: 'stop', letters: ['s', 't'] },
  { phrase: 'again', letters: ['a', 'g'] },
  { phrase: 'bye', letters: ['b', 'y'] },
  { phrase: 'good', letters: ['g', 'd'] },
  { phrase: 'name', letters: ['n', 'm'] },
]

/**
 * What each phrase says, per language.
 *
 * Written out here rather than in `src/app/i18n`, against the grain of every
 * other dictionary in the app, and for one reason: these are not labels on a
 * surface, they are *the message*. A caption in a settings page can be missing
 * and leave an English word on a German page; a phrase missing here is a person
 * who said something and was not understood. Keeping the table beside the
 * spellings means adding a phrase is one edit, and `Record<Phrase, ...>` makes
 * a language you forgot a type error rather than a silent gap.
 *
 * The wordings are informal on purpose. Everybody in a room here is on first
 * name terms - German gets `du`, not `Sie`.
 */
const WORDING: Record<Phrase, Record<Locale, string>> = {
  hello: { en: 'Hello', de: 'Hallo', bg: 'Здравей' },
  yes: { en: 'Yes', de: 'Ja', bg: 'Да' },
  no: { en: 'No', de: 'Nein', bg: 'Не' },
  thanks: { en: 'Thanks', de: 'Danke', bg: 'Благодаря' },
  sorry: { en: 'Sorry', de: 'Entschuldigung', bg: 'Извинявай' },
  please: { en: 'Please', de: 'Bitte', bg: 'Моля' },
  help: { en: 'Help!', de: 'Hilfe!', bg: 'Помощ!' },
  wait: { en: 'Wait', de: 'Warte', bg: 'Чакай' },
  come: { en: 'Come with me', de: 'Komm mit', bg: 'Ела с мен' },
  stop: { en: 'Stop', de: 'Stopp', bg: 'Спри' },
  again: { en: 'Again', de: 'Nochmal', bg: 'Пак' },
  bye: { en: 'Bye', de: 'Tschüss', bg: 'Чао' },
  good: { en: 'Nice one', de: 'Sehr gut', bg: 'Браво' },
  name: { en: "What's your name?", de: 'Wie heißt du?', bg: 'Как се казваш?' },
}

/**
 * The phrase these letters are, if they are one.
 *
 * The *whole* run, not its tail - which is the difference between this and
 * `spellOf` next door, and the reason two letters is a safe length here. See
 * the note at the top.
 */
export function phraseOf(letters: readonly Letter[]): Phrase | null {
  const hit = PHRASES.find(
    (signed) =>
      signed.letters.length === letters.length &&
      signed.letters.every((letter, index) => letter === letters[index]),
  )
  return hit?.phrase ?? null
}

export function wordingOf(phrase: Phrase, locale: Locale): string {
  return WORDING[phrase][locale]
}

/** How a phrase is spelled, for the chart that teaches it. */
export function spellingOf(phrase: Phrase): Letter[] {
  return PHRASES.find((signed) => signed.phrase === phrase)?.letters ?? []
}
