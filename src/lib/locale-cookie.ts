/**
 * The name and lifetime of the language cookie, on their own.
 *
 * Split out of `@/app/i18n/preference` because the proxy needs both and cannot
 * import that module: it is `server-only` and it reaches for `next/headers`,
 * neither of which survives the middleware runtime. The same split, for the
 * same reason, as `@/lib/last-space` next door.
 *
 * `preference` re-exports these, so app code still has one import path and the
 * cookie's name is still written down exactly once.
 */
export const LOCALE_COOKIE = 'unkown_locale'

/** A year: a chosen language is a standing fact about a person, not a session. */
export const LOCALE_MAX_AGE = 365 * 24 * 60 * 60
