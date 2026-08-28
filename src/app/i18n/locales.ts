/**
 * Two *public* locales, and only the landing page and the legal pages have them.
 *
 * Everything behind a login is left alone on purpose. Those pages are not
 * crawled, so a locale in their URL buys nothing and would cost a rewrite of
 * every `<Link>` in the app plus a rule in `proxy.ts` - which is the one place
 * the Supabase session is refreshed and the last place worth adding a second
 * concern to. When the app itself is translated it should read the locale off
 * the member's profile instead; see `settings/profile`.
 *
 * English is unprefixed. `/` is the URL that gets pasted into Discords and
 * unfurled by Slack, and redirecting it to `/en` would put a hop in front of
 * the most-shared link on the site and move the canonical off the bare domain
 * for no gain. German lives at `/de` and the two point at each other with
 * `alternates`, which is what actually tells a crawler they are the same page.
 *
 * Bulgarian is a third locale but not a third site: it is chosen in settings
 * and read behind the login, and has no route here. Everything in this file
 * therefore answers for it in English, by way of `publicLocale`. That is not a
 * gap to be filled in later without thinking - a `/bg` landing page is a page
 * somebody has to write, an `hreflang` entry is a promise to a crawler that the
 * page exists, and neither follows from a dictionary being translated.
 *
 * The primitives - `LOCALES`, `Locale`, `isLocale`, `localeFromPath` - live in
 * `@/domain/i18n/locale` and are re-exported here, because two server actions
 * need them and `src/domain` may not import `@/app/*`. Everything below that is
 * route-shaped (an href, a metadata block) and has no reason to leave the app.
 */
export {
  DEFAULT_LOCALE,
  isLocale,
  isPublicLocale,
  LOCALES,
  type Locale,
  localeFromPath,
  publicLocale,
  type PublicLocale,
} from '@/domain/i18n/locale'
import {
  DEFAULT_LOCALE,
  type Locale,
  publicLocale,
  type PublicLocale,
} from '@/domain/i18n/locale'

/**
 * Where a locale's landing page lives. English is the bare root, and a locale
 * the site is not published in gets English rather than a URL that 404s.
 */
export function landingHref(locale: Locale): string {
  const published = publicLocale(locale)
  return published === DEFAULT_LOCALE ? '/' : `/${published}`
}

/**
 * A public page's path in a given locale: `/events` -> `/de/events`.
 *
 * Every link *between* translated public pages goes through this, so the German
 * landing page cannot hand somebody the English booking form. Paths that are
 * not translated - the app behind the login, an event door - are passed through
 * unchanged by their callers rather than being special-cased here; this
 * function's only job is the prefix. A locale with no public pages at all is
 * the same case one step further along, and gets the English path.
 */
export function localePath(locale: Locale, path: string): string {
  const published = publicLocale(locale)
  if (published === DEFAULT_LOCALE) return path
  return path === '/' ? `/${published}` : `/${published}${path}`
}

/**
 * The `hreflang` block a landing page carries.
 *
 * Each page is its own canonical - `/de` is a translation, not a duplicate of
 * `/`, and pointing its canonical at the English page would ask a crawler to
 * drop it from the index. What makes them a pair is `languages`, which both
 * carry identically.
 *
 * `x-default` points at English rather than at a locale-picker, because there
 * is no picker: an unmatched language should get the canonical page, not a
 * choice it did not ask for.
 */
export function landingAlternates(locale: PublicLocale) {
  return {
    canonical: landingHref(locale),
    languages: {
      en: '/',
      de: '/de',
      'x-default': '/',
    },
  }
}
