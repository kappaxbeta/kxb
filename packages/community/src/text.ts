/**
 * The two languages the handbook is written in, and how a reader gets one.
 *
 * ---------------------------------------------------------------------------
 * Why a document per language rather than a dictionary of slots
 * ---------------------------------------------------------------------------
 * The app's landing page is translated key-by-key: one dictionary in English,
 * one in German, the same shape, and a compiler that will not let German go
 * missing an entry. That is right for marketing copy, where the two languages
 * are the same claim twice and the risk is that one of them silently drifts.
 *
 * This is the other case. A country guide is a document about that country's
 * law, and its German version is not a translation of the English one - it is
 * the version a German reader acts on, written with the words the forms
 * actually use. `Gewerbeanmeldung` has no English name; `Fragebogen zur
 * steuerlichen Erfassung` has no English name; the Finanzamt will not accept a
 * translated one. Slotting those into an English sentence produces prose that
 * is wrong in both languages, which is exactly what `src/app/legal/shell.tsx`
 * says about templating a privacy notice.
 *
 * So a `Text<T>` is a whole document per language, and `pick` chooses one. The
 * price is that a guide can be written in English and not yet in German, and
 * the whole point of the shape is that this is *visible*: `pick` says which
 * language it actually answered in, and the page tells the reader, rather than
 * quietly serving them English under a German heading.
 */

/** The languages the handbook is written in. Not the app's locale list. */
export const LANGS = ['en', 'de'] as const

export type Lang = (typeof LANGS)[number]

/** English is what a reader gets when their language has not been written yet. */
export const FALLBACK: Lang = 'en'

export function isLang(value: string): value is Lang {
  return (LANGS as readonly string[]).includes(value)
}

/**
 * A document that exists in English and may exist in German.
 *
 * English is required. That is not a statement about which language matters -
 * the German guide is the one Germans act on - but about what the fallback can
 * promise: something has to be there when the asked-for language is not, and a
 * type where both sides are optional is a type where a reader can get nothing.
 */
export type Text<T> = { en: T } & Partial<Record<Lang, T>>

/**
 * The document, and the language it turned out to be in.
 *
 * Callers get both because the second half is the part a page has to show. A
 * reader on `/de/community` who is handed English prose has been told nothing
 * about why, and will reasonably read it as the site being broken. Handed the
 * same prose with a line saying this chapter has not been translated yet, they
 * know where they stand - and so does whoever is looking for something to
 * write.
 */
export function pick<T>(text: Text<T>, lang: Lang): { doc: T; lang: Lang; translated: boolean } {
  const wanted = text[lang]
  if (wanted) return { doc: wanted, lang, translated: true }
  return { doc: text.en, lang: FALLBACK, translated: false }
}

/** Which languages a document has actually been written in. */
export function langsOf<T>(text: Text<T>): Lang[] {
  return LANGS.filter((l) => text[l] !== undefined)
}
