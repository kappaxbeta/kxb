import type { Metadata } from 'next'
import { DE } from '@/app/i18n/landing'
import { landingAlternates } from '@/app/i18n/locales'
import { Landing, landingTerms } from '@/app/landing'

/**
 * The front page in German.
 *
 * A folder rather than a `[locale]` segment at the root, and that is the whole
 * routing decision. A dynamic segment here would sit alongside `t`, `e`, `g`,
 * `s`, `v`, `w` and `world`; static segments win the match so those routes
 * would still resolve, but every unmatched top-level path - a typo, a dead
 * bookmark, a crawler guessing - would fall into it and have to be turned away
 * by hand. Two locales do not need that, and the cost of a third is this file
 * again with two words changed.
 *
 * `/` is left unprefixed on purpose: it is the URL that gets pasted into
 * Discords and unfurled by Slack, and a redirect to `/en` would put a hop in
 * front of the most-shared link on the site for no gain. See `i18n/locales.ts`.
 */
export const metadata: Metadata = {
  title: DE.meta.title,
  description: DE.meta.description,
  alternates: landingAlternates('de'),
}

export default async function HomeDe() {
  return <Landing {...(await landingTerms())} dict={DE} locale="de" />
}
