/**
 * The one cookie that stops a visit being counted.
 *
 * It exists because the person who builds this site is also its most frequent
 * visitor - several browsers, several profiles, one person checking whether a
 * change landed - and every one of those visits is a row that looks exactly
 * like a stranger's. The hash rotates daily and is deliberately not linkable
 * across days (see `track.ts`), so there is no way to subtract these afterwards
 * from what was already written. The only place the distinction can be made is
 * before the insert, and the only thing that survives a browser restart to make
 * it is a cookie.
 *
 * ---------------------------------------------------------------------------
 * Why a cookie and not localStorage
 * ---------------------------------------------------------------------------
 * The check has to run where the row is written, which is the beacon endpoint
 * on the server. A value in localStorage would have to be read by the page and
 * *sent* with the beacon - which means the browser asking not to be counted,
 * and a client that can ask not to be counted is a client that can be wrong,
 * silently, when a script fails to load or a page fires the beacon before it
 * has read anything. A cookie rides along with the request itself, so the
 * suppression happens in the same place the decision to store is made.
 *
 * httpOnly, because no page script has any business reading it, and the only
 * thing that sets or clears it is /notme.
 *
 * ---------------------------------------------------------------------------
 * It is offered to everybody, not just to us
 * ---------------------------------------------------------------------------
 * /notme is a public page and the privacy notice links it. A cookie whose whole
 * purpose is to make measurement stop is the textbook "strictly necessary for a
 * service the user expressly requested" case under § 25(2) no. 2 TDDDG - it
 * carries no identifier, it is set only by an explicit click, and its effect is
 * that less is stored, never more.
 */

export const ANALYTICS_OPT_OUT_COOKIE = 'unkown_dnt'

/**
 * The only value that counts as opted out.
 *
 * Compared exactly rather than treated as truthy, so that clearing the cookie
 * by writing it empty - which is how some clients "delete" one - reads as
 * counting me again rather than as a value we do not recognise.
 */
const OPT_OUT_VALUE = '1'

/**
 * Five years.
 *
 * The point of this cookie is to be forgotten about. A one-year expiry would
 * mean a browser silently rejoining the numbers a year later, at a moment
 * nobody would connect to the change in them.
 */
export const ANALYTICS_OPT_OUT_MAX_AGE = 5 * 365 * 24 * 60 * 60

export function isOptedOut(value: string | undefined | null): boolean {
  return value === OPT_OUT_VALUE
}

/** What to write, when somebody asks not to be counted. */
export function optOutCookie(): { value: string; options: Record<string, unknown> } {
  return {
    value: OPT_OUT_VALUE,
    options: {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: ANALYTICS_OPT_OUT_MAX_AGE,
    },
  }
}
