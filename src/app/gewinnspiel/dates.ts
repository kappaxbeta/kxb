import type { ContestLocale } from '@/app/gewinnspiel/locales'

/**
 * A date, written out, in six languages, by us.
 *
 * ---------------------------------------------------------------------------
 * Why this exists rather than `toLocaleDateString`
 * ---------------------------------------------------------------------------
 * The contest conditions used to carry one hand-written line per language per
 * date, and the argument for that is still in `contest.ts`: a legal deadline
 * rendered by `toLocaleDateString` depends on the server's locale and on
 * whichever ICU the runtime happens to ship, and this one has to read the same
 * for everybody who was ever shown it. Written out, it can be proof-read;
 * formatted, it can only be trusted.
 *
 * That objection is to *ICU*, not to formatting. Everything below is in this
 * file, in the repository, reviewable in a diff, and produces the same twelve
 * characters on a laptop, in CI and on a box in Falkenstein. What it buys is
 * that an operator can move the closing date without a deploy and without
 * asking six translators for a sentence - and that the six languages cannot
 * disagree, because they are all reading one date out of one row.
 *
 * ---------------------------------------------------------------------------
 * Six languages, six sets of rules, none of them guessed
 * ---------------------------------------------------------------------------
 * Each language gets its own function rather than a template with a month
 * table, because the differences are not in the words:
 *
 *   de  1. September 2026        - ordinal dot, capitalised month
 *   en  1 September 2026         - bare number
 *   fr  1er septembre 2026       - "1er" for the first only, lower-case month
 *   es  1 de septiembre de 2026  - two prepositions
 *   pl  1 września 2026          - genitive month, which is a different word
 *                                  from the nominative "wrzesień"
 *   bg  1 септември 2026 г.      - the "г." for година is not decoration
 *
 * A shared template would have needed four exceptions and would have got the
 * Polish genitive wrong, which is the kind of mistake a German reviewer cannot
 * see.
 */

/** `2026-09-30` in, `[2026, 9, 30]` out. Nothing here parses anything else. */
function parts(iso: string): { year: number; month: number; day: number } {
  const [year, month, day] = iso.split('-').map((piece) => Number(piece))
  return { year: year ?? 0, month: month ?? 1, day: day ?? 1 }
}

/**
 * The months, indexed one to twelve, in the form the date line needs.
 *
 * Polish is the genitive - "1 września", not "1 wrzesień" - because that is
 * what a Polish date says. The nominative is never used here, which is why it
 * is not in the file at all: half a table is an invitation to reach for the
 * wrong half.
 */
const MONTHS: Record<ContestLocale, readonly string[]> = {
  de: [
    '', 'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
  ],
  en: [
    '', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ],
  fr: [
    '', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
  ],
  es: [
    '', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ],
  pl: [
    '', 'stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
    'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia',
  ],
  bg: [
    '', 'януари', 'февруари', 'март', 'април', 'май', 'юни',
    'юли', 'август', 'септември', 'октомври', 'ноември', 'декември',
  ],
}

/** How each language puts the three pieces together. */
const WRITERS: Record<ContestLocale, (day: number, month: string, year: number) => string> = {
  de: (day, month, year) => `${day}. ${month} ${year}`,
  en: (day, month, year) => `${day} ${month} ${year}`,
  // "1er" on the first of the month and a bare number on every other day. The
  // one ordinal in French dates, and the one exception in this file.
  fr: (day, month, year) => `${day === 1 ? '1er' : day} ${month} ${year}`,
  es: (day, month, year) => `${day} de ${month} de ${year}`,
  pl: (day, month, year) => `${day} ${month} ${year}`,
  bg: (day, month, year) => `${day} ${month} ${year} г.`,
}

/**
 * The date, in that language, as the conditions print it.
 *
 * An unparseable date comes back as the ISO string rather than as an
 * exception or an invented day. This draws a legal document: showing
 * `2026-09-30` is ugly and correct, and a page that throws is a page nobody can
 * read the rules on.
 */
export function writtenDate(iso: string, locale: ContestLocale): string {
  const { year, month, day } = parts(iso)
  const name = MONTHS[locale][month]
  if (!name || !year || !day) return iso
  return WRITERS[locale](day, name, year)
}
