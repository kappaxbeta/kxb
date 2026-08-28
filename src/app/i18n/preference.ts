import 'server-only'
import { cookies, headers } from 'next/headers'
import {
  DEFAULT_LOCALE,
  isLocale,
  type Locale,
  localeFromAcceptLanguage,
} from '@/domain/i18n/locale'
import { LOCALE_COOKIE, LOCALE_MAX_AGE } from '@/lib/locale-cookie'

/**
 * Which language the app itself is in, for somebody who is past the front page.
 *
 * The public pages answer this from the URL - `/de/events` is German because it
 * says so, which is what a crawler needs. Behind the login there is no such
 * segment and there is deliberately not going to be one (see the note at the
 * top of `locales.ts`), so the preference has to be carried some other way.
 *
 * It is a cookie *here* - and, since `profile_locales`, a row as well. The two
 * are not rivals and the split is the point:
 *
 *  - The cookie has to work for people who have no profile. A guest in a demo
 *    lounge, a visitor on a link, somebody halfway through sign-up and anybody
 *    reading a public `/xp` all render app copy, and none of them have a row.
 *  - A render may not write a cookie, but it may read one, and reading is all
 *    the common path needs. Asking the database on every layout that prints a
 *    word would be a query per page for an answer that never changes.
 *  - So the row is read exactly once per browser, in the proxy, which is the
 *    one layer that can both see a session and set a cookie - and after that
 *    this function is a cookie read again. See the note in `proxy.ts`.
 *
 * Which is why nothing below knows about the account: by the time a request
 * gets here, the account's answer is already in the jar.
 *
 * Not httpOnly: client components need the same answer the server rendered
 * with, and the alternative is threading a locale prop through every 3D HUD in
 * the app. It is a display preference somebody set themselves - there is
 * nothing here to hide from page scripts.
 */
export { LOCALE_COOKIE, LOCALE_MAX_AGE } from '@/lib/locale-cookie'

/**
 * The locale for this request: what was chosen, else what the browser asked for.
 *
 * Layouts call this once and hand the answer down - to their own copy, and to
 * `LocaleProvider` for the client half of the tree. Pages that render below a
 * layout which already provides it should take it as a prop rather than call
 * again; the cost is small but the risk is not, because two calls in one render
 * can only ever agree, and a prop makes it obvious where the value came from.
 */
export async function readLocale(): Promise<Locale> {
  const jar = await cookies()
  const chosen = jar.get(LOCALE_COOKIE)?.value

  // Validated rather than trusted: this cookie is readable and writable by page
  // scripts, so its contents are an input like any other.
  if (chosen && isLocale(chosen)) return chosen

  const header = await headers()
  return localeFromAcceptLanguage(header.get('accept-language'))
}

/**
 * Remember a chosen language.
 *
 * Only ever called from a Server Action - a render may not set cookies - and
 * only with a value that has already been through `isLocale`.
 */
export async function writeLocale(locale: Locale): Promise<void> {
  const jar = await cookies()
  jar.set(LOCALE_COOKIE, locale, {
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: LOCALE_MAX_AGE,
  })
}

export { DEFAULT_LOCALE }
