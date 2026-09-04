import type { ContestLocale } from '@/app/gewinnspiel/locales'

/**
 * What is left of the contest in the repository, and why it is only this much.
 *
 * Every fact a second pair of eyes wants to change - the dates, the amounts,
 * the code on the poster, the handle, the age floor - used to be in this file.
 * It is now one row in `contest_settings`, read through
 * `@/domain/contest/settings` and turned into one language's worth of prose by
 * `facts.ts`. The migration that moved it makes the argument at length; the
 * short version is that *running* a campaign should not be a deploy, while
 * *rendering* a legal deadline should never be handed to ICU.
 *
 * So both halves survived. The words below are the half that is language, not
 * data: an abbreviation a German reader knows and a Polish one does not is a
 * translation decision, and it belongs in a file translators can read next to
 * the prose that uses it.
 *
 * ---------------------------------------------------------------------------
 * READ BEFORE THE FIRST POST GOES OUT
 * ---------------------------------------------------------------------------
 * 1. The code in `contest_settings.code` must exist as a live promo code in
 *    /ovaloffice/promos, granting a paid tier, with an expiry *after* the draw.
 *    The whole "free to enter" construction in § 5 rests on it: if the code is
 *    dead, entering costs money, and a prize draw you have to buy your way into
 *    is a different thing in law than the one this document describes. The
 *    Gewinnspiel page in the backoffice checks all four of those and says so -
 *    it is the one screen where the promise and the thing that keeps it are
 *    visible together.
 * 2. Moving a date after the announcement has gone out is an amendment under
 *    § 12 of the conditions, not an edit. It is now one form field rather than
 *    a commit, which makes it easier to do and no less of an amendment: say so
 *    on this page and on the account named in `handle`.
 * 3. The zone below is part of the deadline, not decoration. "30 September"
 *    without an hour and a zone is unenforceable against somebody in another
 *    country.
 */

/**
 * Named in the deadline itself. Germany is on CEST in September.
 *
 * The abbreviation differs by language - a German reader knows MESZ and a
 * Polish one does not - but the instant does not, which is why Berlin is spelt
 * out beside it in every version.
 *
 * Still a constant, and still here, because it is the one part of a date that
 * is a *word*. If a contest is ever run in another season this is a two-line
 * edit; it is not something to put a text box in front of an operator for, and
 * a mistyped "CEST" on the German page would be a translation bug nobody could
 * see from the form that caused it.
 */
export const TIMEZONE = {
  de: 'MESZ (Berlin)',
  en: 'CEST (Berlin)',
  fr: 'CEST (heure de Berlin)',
  es: 'CEST (hora de Berlín)',
  pl: 'CEST (czas berliński)',
  bg: 'CEST (берлинско време)',
} as const satisfies Record<ContestLocale, string>

/**
 * Where a code is spent, minus the code.
 *
 * /code/[code] works signed-in and signed-out from one URL - see the route - so
 * this prefix and the code together are the only thing any post needs to carry.
 * A prefix rather than a whole path because the code is now the operator's and
 * the route is ours, and gluing them together is `contestFacts`' job.
 */
export const CONTEST_CODE_PATH_PREFIX = '/code/'
