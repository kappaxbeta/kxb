'use client'

import Link from 'next/link'
import { useSyncExternalStore } from 'react'
import {
  CONTEST_LANGUAGE_NAME,
  contestHref,
  matchContestLocale,
  type ContestLocale,
} from '@/app/gewinnspiel/locales'

/**
 * "This page is also available in Polski."
 *
 * ---------------------------------------------------------------------------
 * Offered, never chosen
 * ---------------------------------------------------------------------------
 * The browser's language is a hint about a person, not a fact about them, and
 * acting on it is how somebody who deliberately opened the German conditions -
 * the binding ones - ends up reading a translation because their laptop was
 * bought in France. So nothing here redirects and nothing here rewrites the
 * page: it draws one line with one link, above a chooser that was already
 * showing all five languages anyway. If the guess is wrong, the cost is a
 * sentence.
 *
 * ---------------------------------------------------------------------------
 * Why the client, and not `headers()`
 * ---------------------------------------------------------------------------
 * Reading `Accept-Language` on the server would do the same job, and this note
 * used to argue that doing so would opt five static routes into per-request
 * rendering for one sentence. That half of the argument is spent: the routes
 * are `force-dynamic` now, because the facts on them are a row the build cannot
 * read.
 *
 * The other half still stands on its own, which is why nothing here changed.
 * `navigator.languages` is the browser's own ordered list, rather than whatever
 * the OS put in the header, and it is the reader's answer to "which of these do
 * you read" rather than a proxy for it.
 */

/**
 * The first of the reader's languages that this page speaks, as a locale code,
 * or `''` for none.
 *
 * A string rather than a `ContestLocale | null` because `useSyncExternalStore`
 * compares snapshots by identity and is called on every render: `''` is the one
 * "nothing" that is stable, where a fresh object or array would loop forever.
 */
function readPreferredLocale(): string {
  // `languages` is the ordered list the person actually configured; `language`
  // is the single fallback for browsers that do not have it.
  const wanted = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const tag of wanted) {
    const matched = matchContestLocale(tag)
    // The first *recognised* language wins, and the loop stops there. Carrying
    // on down the list would mean telling somebody whose first language is
    // German that the page is also available in English, which they did not
    // ask about.
    if (matched) return matched
  }
  return ''
}

/** Nothing to subscribe to: a browser does not change its language list mid-visit. */
const subscribe = () => () => {}

export function LanguageHint({
  current,
  /** `{language}` is replaced with the endonym of whatever was matched. */
  template,
}: {
  current: ContestLocale
  template: string
}) {
  /*
    The server has no navigator, so its snapshot is "no preference" and the
    first paint draws nothing - which is also the right answer for anybody
    whose browser wants a language this page does not have. `useSyncExternalStore`
    rather than useState in an effect: this is a read of an external system, and
    the third argument is how React is told what the server saw instead of
    hoping the first render guesses it.
  */
  const preferred = useSyncExternalStore(subscribe, readPreferredLocale, () => '')

  // Not `!preferred` alone: the commonest case by far is a reader whose
  // language is the one they are already looking at, and offering somebody the
  // page they are on is noise.
  if (!preferred || preferred === current) return null
  const offer = preferred as ContestLocale

  const [before, after] = template.split('{language}')
  return (
    <p className="text-sm text-ink-muted">
      {before}
      <Link
        href={contestHref(offer)}
        hrefLang={offer}
        lang={offer}
        className="text-accent hover:underline"
      >
        {CONTEST_LANGUAGE_NAME[offer]}
      </Link>
      {after}
    </p>
  )
}
