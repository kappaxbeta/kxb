/**
 * `@kxb/xp/words` - what a level says, in more than one language.
 *
 * ---------------------------------------------------------------------------
 * The key is the fallback
 * ---------------------------------------------------------------------------
 * A level writes what it wants to say and that sentence *is* the key:
 *
 *     log(t('the gate is locked'))
 *
 * A document with no `words` block prints "the gate is locked", which is what
 * it printed before this file existed. A document that lists a German for that
 * exact sentence prints the German to a German reader. Nothing in between ever
 * shows a reader `gate.locked.message` or an empty string, which is the failure
 * mode of every design where the key is an identifier: the day a translation is
 * missing, the player reads a variable name.
 *
 * It also means the feature costs an author nothing until they want it. There
 * is no step where a level has to be "prepared for translation" - wrapping a
 * string in `t()` changes nothing at all until somebody adds a language.
 *
 * ---------------------------------------------------------------------------
 * Two letters or two letters and a region
 * ---------------------------------------------------------------------------
 * The locale codes are the document's, not the app's. `LOCALES` in
 * `src/domain/i18n/locale` is what *this product* renders in; a level is a file
 * that outlives the product it was written in, and refusing `fr` here would
 * mean an author cannot write French until we ship French. So any well-formed
 * BCP-47-ish tag is accepted and the runtime asks for the one it wants.
 *
 * A reader on `de-CH` gets `de-CH` if the level wrote one, `de` if it did not,
 * and the key if it wrote neither. Three steps, no further: a chain that walked
 * on to some other language would show a Swiss reader Portuguese, which is
 * further from the key than the key is.
 *
 * ---------------------------------------------------------------------------
 * Display only
 * ---------------------------------------------------------------------------
 * `t` is not deterministic across clients - two people in one room read
 * different languages, so it returns different strings to each of them. That is
 * the whole point and it is also the one hazard: a script that compares `t(x)`
 * against a literal, or emits a signal named by one, has written a rule that
 * fires for the German player and not the English one. The script API says so
 * where it is exposed. Use it on the way to a screen and nowhere else.
 */

/** One language's answers, by the sentence they replace. */
export type XpPhrases = Readonly<Record<string, string>>

/** Every language a level has been given, by locale code. */
export type XpWords = Readonly<Record<string, XpPhrases>>

/**
 * How many languages, and how many phrases in each.
 *
 * Generous rather than tight, because the cost is a `jsonb` column and the
 * thing being bounded is a person typing. They exist so a broken generator
 * cannot write a hundred-megabyte document, not to tell an author their level
 * is too talkative.
 */
export const MAX_LOCALES = 20
export const MAX_PHRASES = 500
/** A key is a sentence, so it is allowed to be one. */
export const MAX_PHRASE_KEY = 200
export const MAX_PHRASE_TEXT = 1000

/**
 * A locale code, loosely: `de`, `de-CH`, `pt-BR`.
 *
 * Deliberately not a list of real languages. See the note above - the document
 * outlives our list, and a level written in Welsh is not a level with a bug in
 * it.
 */
const CODE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/

export function isLocaleCode(value: string): boolean {
  return CODE.test(value)
}

/**
 * A code in the shape everybody writes it in: `pt-BR`, `zh-Hant`, `de`.
 *
 * Not cosmetic. The lookup is an exact string match against the code a reader's
 * browser reports, and browsers report `pt-BR`; a panel that lowercased what an
 * author typed would build a table nothing ever matches. So the language goes
 * lowercase, a two-letter region goes uppercase, and a four-letter script goes
 * Titlecase - which is BCP-47's own convention rather than an invention here.
 *
 * Applied on both sides of the lookup, so a document written `pt-br` by hand
 * still answers a `pt-BR` reader.
 */
export function canonicalLocale(code: string): string {
  return code
    .trim()
    .split('-')
    .map((part, at) => {
      if (at === 0) return part.toLowerCase()
      if (part.length === 2) return part.toUpperCase()
      if (part.length === 4) return part[0]!.toUpperCase() + part.slice(1).toLowerCase()
      return part.toLowerCase()
    })
    .join('-')
}

/** The language part of a code, which is what a reader falls back to. */
export function baseOf(code: string): string {
  const dash = code.indexOf('-')
  return dash < 0 ? code : code.slice(0, dash)
}

/**
 * The function a level says things through.
 *
 * Built once per reader rather than per call, because it is called from inside
 * a frame: the two lookups are resolved here and what comes back closes over
 * the one table that matters.
 *
 * A key that is not a string comes back as itself stringified rather than
 * throwing. It is reached from a sandbox where anything can be passed, and a
 * level that crashes because somebody wrote `t(3)` is worse than one that
 * prints `3`.
 */
export function translator(
  words: XpWords | undefined,
  locale: string,
): (key: string) => string {
  if (!words) return (key) => String(key)

  /*
   * Both sides through `canonicalLocale`, because a document is a file somebody
   * may have written by hand: `pt-br` typed into a JSON file has to answer the
   * `pt-BR` a browser reports, and neither spelling is wrong enough to refuse.
   */
  const table: Record<string, XpPhrases> = {}
  for (const code of Object.keys(words)) table[canonicalLocale(code)] = words[code]!

  const wanted = canonicalLocale(locale)
  const exact = table[wanted]
  const base = table[baseOf(wanted)]
  if (!exact && !base) return (key) => String(key)

  return (key) => {
    const name = String(key)
    return exact?.[name] ?? base?.[name] ?? name
  }
}

/** Whether the block says anything, so a parser can leave it off when it does not. */
export function isEmptyWords(words: XpWords): boolean {
  return Object.keys(words).every((code) => Object.keys(words[code]!).length === 0)
}

/**
 * Every phrase a level looks likely to say, for an editor to offer.
 *
 * Three sources: the title, the description, and every `t('…')` in the level's
 * scripts. That last one is a **regex over source**, and calling it anything
 * more would be a lie - a key built at runtime (`t('door ' + n)`) is invisible
 * to it, and so is one inside a string a script builds.
 *
 * Which is exactly why nothing here ever *removes* a row. The list an editor
 * shows is this plus whatever the block already holds: a phrase this cannot see
 * is a phrase somebody typed in by hand, and a panel that offered to tidy it
 * away would delete the translation of the one sentence the author had to work
 * hardest to find.
 *
 * In document order, then source order, so the list does not reshuffle itself
 * between two saves.
 */
export function phrasesIn(document: {
  name: string
  blurb?: string
  scripts?: Readonly<Record<string, string>>
  words?: XpWords
}): string[] {
  const found: string[] = []
  const seen = new Set<string>()
  const add = (phrase: string) => {
    if (phrase.length === 0 || phrase.length > MAX_PHRASE_KEY || seen.has(phrase)) return
    seen.add(phrase)
    found.push(phrase)
  }

  add(document.name)
  if (document.blurb) add(document.blurb)

  for (const source of Object.values(document.scripts ?? {})) {
    for (const [, quote, body] of source.matchAll(CALL)) {
      // Only what the quoting says it is. An escape inside the literal means
      // the source and the key differ, and guessing which is a guess about
      // somebody's string - so those are left to be typed in by hand.
      if (body.includes('\\')) continue
      if (quote === '`' && body.includes('${')) continue
      add(body)
    }
  }

  for (const table of Object.values(document.words ?? {})) {
    for (const key of Object.keys(table)) add(key)
  }

  return found
}

/**
 * `t('…')`, `t("…")` or `t(`…`)`, with whatever spacing somebody used.
 *
 * Deliberately not matching `something.t(...)` or `notT(...)`: the lookbehind
 * is what stops a method called `t` on somebody's own object turning up in a
 * translation table.
 */
const CALL = /(?<![\w.$])t\s*\(\s*(['"`])((?:[^\\]|\\.)*?)\1\s*\)/g
