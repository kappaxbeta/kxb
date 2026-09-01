/**
 * The stance.
 *
 * One sentence, and the only line of copy the product repeats verbatim on more
 * than one surface: it is the headline of the landing page and the headline of
 * the front door. That is deliberate rather than lazy. Somebody arriving at
 * /signup off a link has never seen the landing page, and the position is worth
 * saying to them too - it names the category this is not, which is the entire
 * comparison a stranger would otherwise make and we would otherwise lose.
 *
 * Its own module because two dictionaries need it and a headline that says one
 * thing in one place and something slightly different in the other is worse
 * than either version. `landing.ts` reads it here; so does the auth form, which
 * is a Client Component - hence a file with nothing in it but strings, rather
 * than reaching into the landing dictionary and shipping all three locales of
 * every landing string to the sign-in page.
 *
 * Split in two because the second clause is set in the accent and breathes. See
 * the `<h1>` on the landing page for why it is an `inline-block` there: the
 * break has to fall on the divider or the stance and its punchline end up on
 * different lines with a widow between them.
 */
import type { Locale } from '@/domain/i18n/locale'

export interface Stance {
  /** What this is not. Set in ink. */
  lead: string
  /** What it is. Set in the accent, and the half that glows. */
  accent: string
}

export const STANCE: Record<Locale, Stance> = {
  en: { lead: 'Not here to chat <3', accent: 'here to play.' },
  de: { lead: 'Nicht hier zum Reden <3', accent: 'zum Spielen.' },
  bg: { lead: 'Не сме тук да си говорим <3', accent: 'тук сме да играем.' },
}

export function stance(locale: Locale): Stance {
  return STANCE[locale]
}
