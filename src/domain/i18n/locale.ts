/**
 * The locales, as a domain-layer fact.
 *
 * Split out of `@/app/i18n/locales` rather than left there, because two server
 * actions - the contact/event throttle replies and the sign-up gate - need to
 * know which language a submission was made in, and `src/domain` may not import
 * `@/app/*` (see the lint rule). Everything here is pure and request-shaped
 * rather than route-shaped: no `<Link>` hrefs, no React. Those stay in
 * `@/app/i18n/locales`, which re-exports this module so app code has one
 * import path.
 *
 * Three of them, and they are not all the same kind of thing. English and
 * German are *the site*: they have URLs (`/` and `/de`), an `hreflang` pair
 * between them, and legal pages written under German law. Bulgarian is *the
 * app*: it is a language somebody picks in settings and reads the product in,
 * with no public route of its own. See `PublicLocale` below for the seam, and
 * the note at the top of `@/app/i18n/locales` for why the app has no locale in
 * its URLs at all.
 */
export const LOCALES = ['en', 'de', 'bg'] as const

export type Locale = (typeof LOCALES)[number]

/**
 * Typed as the literal rather than as `Locale`, because it is the answer
 * `publicLocale` falls back to and that function promises a `PublicLocale`. A
 * widened annotation here would make the fallback unprovable and push a cast
 * into the one place that exists to avoid one.
 */
export const DEFAULT_LOCALE = 'en' satisfies Locale

/**
 * The locales the public site is published in.
 *
 * Narrower than `Locale` on purpose, and narrower than "the public site" too:
 * the front page is published in every locale, and this is everything *below*
 * it. The booking form, the sign-in pages and the legal documents are indexed
 * pages with addresses - `/de/events` is German because the URL says so - and
 * adding a language to that set is a decision about routes, sitemaps and
 * `hreflang`, not about a dictionary. Bulgarian has a front page and none of
 * those, so its copy below the front page is English.
 *
 * The line falls where it does because of what each page is *for*. A landing
 * page is what a link opens onto and is worth having in any language somebody
 * can then read the app in; an enquiry form in a language nobody here answers
 * enquiries in is a worse experience than the English one, not a better one.
 *
 * The type is what keeps that from being a guess. The public *tables* are keyed
 * by it - the dictionaries, the `hreflang` block, the legal shell's two-way
 * link - so a locale with no page cannot get an entry in one by accident, while
 * the *functions* that read them stay total and take any `Locale` through
 * `publicLocale()`. Narrow data, wide doors: a caller holding a member's chosen
 * language should get a link, not a type error it can only fix by casting.
 *
 * If Bulgarian ever gets a `/bg` route, widening this type is what lists every
 * table that has to grow a column.
 */
export type PublicLocale = Extract<Locale, 'en' | 'de'>

export function isPublicLocale(locale: Locale): locale is PublicLocale {
  return locale === 'en' || locale === 'de'
}

/**
 * The public site's answer for somebody whose app is in a language it is not
 * published in.
 *
 * English rather than nothing: a reader who has set the app to Bulgarian and
 * then clicks through to the pricing page should get a page, and English is the
 * one every public page is guaranteed to have. This is the same promise the
 * settings panel already prints - what is not translated stays in English.
 */
export function publicLocale(locale: Locale): PublicLocale {
  return isPublicLocale(locale) ? locale : DEFAULT_LOCALE
}

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value)
}

/**
 * The locale a submitted form came from, read back off the path it recorded.
 *
 * The contact and event forms already post the page's own path so the enquiry
 * can be filed against it. That string is therefore the one piece of locale a
 * server action can trust without a new hidden field and without reading a
 * header the proxy would have to be taught to forward.
 */
export function localeFromPath(path: string | null | undefined): Locale {
  const first = path?.split('/').filter(Boolean)[0]
  return first && isLocale(first) ? first : DEFAULT_LOCALE
}

/**
 * The best locale for a browser's `Accept-Language`, or English.
 *
 * This is what a signed-in member gets before they have ever expressed a
 * preference. The app behind the login has no `/de` in its URLs - see the note
 * in `@/app/i18n/locales` for why - so there is no path segment to read a
 * locale off, and until somebody picks one in settings the browser's own list
 * is the only statement of intent that exists. Ignoring it would mean handing a
 * German landing page's reader an English app one click later.
 *
 * Quality values are honoured because they are the half of the header that
 * carries the *ranking*: `de;q=0.9, en;q=0.8` and `en;q=0.8, de;q=0.9` are the
 * same preference written two ways, and only a sort tells them apart. A tag is
 * matched on its primary subtag, so `de-AT` and `de-CH` are German - we do not
 * ship regional copy, and refusing a Swiss reader their language over a suffix
 * would be a bug they cannot fix.
 *
 * Anything unparseable is English, which is also what an absent header gets.
 * There is no throwing here on purpose: this runs on every request that renders
 * a word, and a malformed header is a reason to fall back, not to 500.
 */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE

  const ranked = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';')
      const q = params.find((p) => p.trim().startsWith('q='))
      const weight = q ? Number.parseFloat(q.trim().slice(2)) : 1
      return {
        primary: tag.trim().toLowerCase().split('-')[0],
        weight: Number.isFinite(weight) ? weight : 0,
      }
    })
    .filter((entry) => entry.primary.length > 0 && entry.weight > 0)
    .sort((a, b) => b.weight - a.weight)

  for (const { primary } of ranked) {
    // `*` means "anything", which is a statement of no preference rather than
    // of a language, so it falls through to the default like an absent header.
    if (isLocale(primary)) return primary
  }

  return DEFAULT_LOCALE
}
