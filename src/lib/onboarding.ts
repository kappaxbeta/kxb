/**
 * Whether this person has already been shown around.
 *
 * Free of `server-only` and of any `next/headers` import, for the same reason
 * `last-space.ts` is: the name and the parsing rule are shared, and neither the
 * server action that writes the cookie nor the server component that reads it
 * should have to import the other's runtime.
 *
 * A preference, not a capability. Nothing is granted by holding it and nothing
 * is protected by lacking it - the worst a forged or missing value can do is
 * show somebody a tour they have already seen, or not show it to somebody who
 * can open it from the sidebar whenever they like. It is still httpOnly because
 * no client code has a reason to read it.
 */
export const TOUR_COOKIE = 'unkown_tour'

/**
 * The tour this cookie means.
 *
 * Stored as the value rather than as a bare `1`, so that a materially different
 * tour later can be shown once to everybody by bumping this - without either
 * clearing cookies for the whole install or leaving the code unable to tell
 * "seen the old one" from "seen this one". Compared for equality, so any
 * unrecognised value counts as unseen.
 */
export const TOUR_VERSION = 'v1'

/** A year. The tour is a first-run thing; nobody needs reminding annually. */
export const TOUR_MAX_AGE = 60 * 60 * 24 * 365

/** Whether a cookie value stands for "has seen the current tour". */
export function hasSeenTour(value: string | undefined): boolean {
  return value?.trim() === TOUR_VERSION
}
