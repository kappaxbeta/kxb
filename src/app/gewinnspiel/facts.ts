import { CONTEST_CODE_PATH_PREFIX, TIMEZONE } from '@/app/gewinnspiel/contest'
import { writtenDate } from '@/app/gewinnspiel/dates'
import type { ContestLocale } from '@/app/gewinnspiel/locales'
import type { ContestSettings } from '@/domain/contest/settings'

/**
 * The contest, in one language, as a page can print it.
 *
 * The seam between the row an operator edits and the six copy files that quote
 * it. Each copy file takes one of these and never sees a locale key, an ISO
 * date or a settings object - `de.tsx` reads `f.end` and gets
 * "30. September 2026", because the language it is written in was decided
 * before it was called.
 *
 * That is the whole reason this type is flat rather than being the settings
 * object with a locale beside it. A copy file that could reach for
 * `settings.endsOn` could also reach for `CONTEST.end.fr` by accident, and the
 * one mistake this page cannot survive is a German clause carrying a French
 * date. Here there is nothing to get wrong: there is one date and it is in the
 * language of the file quoting it.
 *
 * Pure, and importable from a Client Component. The row is read on the server
 * and handed in.
 */
export interface ContestFacts {
  /** Written out in this language: "30. September 2026". */
  start: string
  end: string
  draw: string
  /** "MESZ (Berlin)" and its five siblings. Prose, so still in the repo. */
  timezone: string
  /** Euro amounts, best first. */
  prizes: readonly number[]
  /** Bare, without the `#`. */
  hashtag: string
  /** Bare, without the `@`. */
  handle: string
  /** The code that makes entering free, and the one URL a post has to carry. */
  code: string
  codePath: string
  minAge: number
  /**
   * Bucks the code hands over, or 0.
   *
   * Read off the promo code rather than off the contest row - see
   * `readContestBucks` for why the document must quote the thing that is
   * authoritative rather than a second copy of it. Zero means the clause about
   * them is not drawn at all.
   */
  bucks: number
}

/**
 * Settings plus a language, in the shape the prose wants.
 *
 * Called once per render, in `document.tsx` and in `contestMetadata`. Cheap
 * enough to do twice - it is six string builds - and doing it at the two entry
 * points rather than threading one object through both is what keeps the copy
 * files ignorant of where any of it came from.
 */
export function contestFacts(
  settings: ContestSettings,
  locale: ContestLocale,
  bucks = 0,
): ContestFacts {
  return {
    start: writtenDate(settings.startsOn, locale),
    end: writtenDate(settings.endsOn, locale),
    draw: writtenDate(settings.drawsOn, locale),
    timezone: TIMEZONE[locale],
    prizes: settings.prizes,
    hashtag: settings.hashtag,
    handle: settings.handle,
    code: settings.code,
    codePath: `${CONTEST_CODE_PATH_PREFIX}${settings.code}`,
    minAge: settings.minAge,
    bucks,
  }
}
