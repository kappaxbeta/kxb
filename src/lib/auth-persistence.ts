/**
 * How long a sign-in outlives the browser window.
 *
 * Two answers, and the cookie is the whole mechanism:
 *
 *   - **kept** - the auth cookies carry `@supabase/ssr`'s own max-age, which is
 *     400 days (the ceiling browsers will honour). You stay signed in across
 *     restarts until the refresh token is actually revoked.
 *   - **not kept** - the same cookies are written with no max-age and no
 *     expiry, which makes them *session* cookies: the browser drops them when
 *     it closes and the next visit starts signed out.
 *
 * Nothing here changes the token's own lifetime, and that is deliberate. How
 * long a refresh token is good for is the auth server's business, set on the
 * Supabase project; what a browser is willing to keep on disk is ours. Trying
 * to express "log me out at the end of the day" by shortening a token would
 * mean a session that dies mid-use, which is the bug this is meant to fix
 * rather than a smaller version of the feature.
 *
 * Kept is the default, including for anybody who signed in before this existed:
 * the absence of the cookie reads as "yes". That matches what the app did
 * before - the library's 400-day max-age was unconditional - so nobody is
 * signed out by this shipping.
 */

/** The choice, remembered on the device rather than on the account. */
export const KEEP_SIGNED_IN_COOKIE = 'kxb.keep'

/** Outlives the auth cookies it governs, so it is never the first to go. */
export const KEEP_SIGNED_IN_MAX_AGE = 400 * 24 * 60 * 60

/** The form field, named once so the form and the action cannot drift. */
export const KEEP_SIGNED_IN_FIELD = 'keep'

/**
 * Did this device ask to be remembered?
 *
 * Absent means yes - see above. Only an explicit `'0'` turns it off, so a
 * cookie mangled in transit fails towards staying signed in rather than towards
 * logging somebody out of a tab they are working in.
 */
export function keepsSignedIn(value: string | undefined): boolean {
  return value !== '0'
}

/** What to write for a given answer. */
export function keepCookieValue(keep: boolean): string {
  return keep ? '1' : '0'
}

/**
 * Strip the lifetime off a cookie, making it last as long as the window does.
 *
 * Both fields, because either one alone still persists the cookie: browsers
 * take whichever is present, and `@supabase/ssr` sets `maxAge`. Anything else
 * on the options - path, sameSite, secure, domain - is left exactly as the
 * library wrote it, since none of it is about lifetime.
 */
export function forSession<T extends { maxAge?: number; expires?: Date }>(
  options: T,
): T {
  const rest = { ...options }
  delete rest.maxAge
  delete rest.expires
  return rest
}
