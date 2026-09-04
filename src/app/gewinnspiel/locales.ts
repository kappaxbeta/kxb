/**
 * The five languages this one page speaks, and nowhere else.
 *
 * Deliberately not `PublicLocale` from `@/app/i18n/locales`. That type is the
 * site's promise: two languages, a landing page and four legal documents in
 * each, and every route that grows a third has to grow a third of everything.
 * The contest is a single page with a single deadline, aimed at people who saw
 * one post, and it can afford to be readable in a language the rest of the site
 * is not - so the list lives here and stops here.
 *
 * If a seventh language is ever wanted: add it to `CONTEST_LOCALES`, write
 * `copy/<code>.tsx`, and add the one line to the barrel in `copy.ts`. The
 * `Record<ContestLocale, …>` types make anything left out a build error rather
 * than a page that silently falls back to German.
 *
 * German first, and that ordering is load-bearing in two places: it is the
 * binding version of the document (§ 16), and it is the order the chooser
 * draws.
 *
 * Bulgarian is the one entry that overlaps the site's own locales - there is a
 * `/bg` landing page, and nothing under it. That asymmetry is described in
 * `i18n/locales`; here it only means the back link has somewhere better to go
 * than the English front page. See `document.tsx`.
 */
export const CONTEST_LOCALES = ['de', 'en', 'fr', 'es', 'pl', 'bg'] as const

export type ContestLocale = (typeof CONTEST_LOCALES)[number]

/**
 * What each language calls itself.
 *
 * Endonyms, always. A chooser that offers "German, English, French" is only
 * usable by somebody who already reads English, which is the one group that
 * does not need it. Somebody arriving with only Polish is looking for the word
 * "Polski".
 */
export const CONTEST_LANGUAGE_NAME: Record<ContestLocale, string> = {
  de: 'Deutsch',
  en: 'English',
  fr: 'Français',
  es: 'Español',
  pl: 'Polski',
  bg: 'Български',
}

/**
 * German sits at the bare path because it is the binding text.
 *
 * Same shape as the other legal documents: `/gewinnspiel` is the original and
 * `/gewinnspiel/<code>` is a translation of it. Changing this would move a URL
 * that has already gone out in a post.
 */
export function contestHref(locale: ContestLocale): string {
  return locale === 'de' ? '/gewinnspiel' : `/gewinnspiel/${locale}`
}

/** Every language of this page, for `alternates.languages` in the metadata. */
export const CONTEST_LANGUAGE_HREFS: Record<ContestLocale, string> = Object.fromEntries(
  CONTEST_LOCALES.map((locale) => [locale, contestHref(locale)]),
) as Record<ContestLocale, string>

/**
 * The four translations, for `generateStaticParams` and for the chooser.
 *
 * German is not a param - it is the page one level up - so this is the list of
 * everything `[lang]` is allowed to be.
 */
export const CONTEST_TRANSLATIONS = CONTEST_LOCALES.filter(
  (locale): locale is Exclude<ContestLocale, 'de'> => locale !== 'de',
)

/**
 * Turns whatever a browser calls a language into one of ours, or null.
 *
 * Given `de-AT` or `pl-PL` we want `de` and `pl`; given `it-IT` we want nothing
 * rather than a guess. Used by the client-side hint only - the page itself is
 * never chosen for anybody, it is only offered. See `hint.tsx`.
 */
export function matchContestLocale(tag: string | undefined | null): ContestLocale | null {
  const base = (tag ?? '').toLowerCase().split('-')[0]
  return (CONTEST_LOCALES as readonly string[]).includes(base) ? (base as ContestLocale) : null
}
