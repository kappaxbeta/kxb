import type { Metadata } from 'next'
import { contestCopy } from '@/app/gewinnspiel/copy'
import { contestFacts } from '@/app/gewinnspiel/facts'
import { POSTER_URL } from '@/app/gewinnspiel/intro'
import {
  CONTEST_LANGUAGE_HREFS,
  contestHref,
  type ContestLocale,
} from '@/app/gewinnspiel/locales'
import { readContestSettings } from '@/domain/contest/settings'

/**
 * The unfurl card, per language, built once.
 *
 * ---------------------------------------------------------------------------
 * Why this page has its own card at all
 * ---------------------------------------------------------------------------
 * Without it the page inherits the root layout's Open Graph block, and what
 * that says is the front page's pitch - which for a month would sit underneath
 * a post about a build contest advertising something else entirely. A link in a
 * post is read as a promise about what is on the other end of it, and the
 * fallback card was making the wrong one.
 *
 * The picture is the same one the announcement post carries, and the same one
 * the page draws at the top. Same image on the post and on the page it points
 * at is what makes the two read as one thing rather than as a link somebody
 * dropped in. `POSTER_URL` is imported from `intro.tsx` rather than repeated
 * here for exactly that reason: two string literals in two files is how "the
 * same picture" stops being true six months later. The note on why the file has
 * a new name is over there too.
 */
export async function contestMetadata(locale: ContestLocale): Promise<Metadata> {
  /*
    Async now, because the card quotes the same facts the page does - the poster
    alt text names the prizes. `generateMetadata` has always been allowed to
    await; what changed is that there is something worth awaiting.
  */
  // The card quotes no bucks, so the offer is not read here: `meta` is a title,
  // a description and a poster, and none of the four names what the code gives.
  const { meta } = contestCopy(locale, contestFacts(await readContestSettings(), locale))
  return {
    title: meta.title,
    description: meta.description,
    alternates: {
      canonical: contestHref(locale),
      languages: CONTEST_LANGUAGE_HREFS,
    },
    openGraph: {
      type: 'article',
      title: meta.ogTitle,
      description: meta.ogDescription,
      url: contestHref(locale),
      locale,
      images: [{ url: POSTER_URL, width: 1600, height: 900, alt: meta.posterAlt }],
    },
    twitter: { card: 'summary_large_image' },
    /*
      Same reasoning as the English terms and privacy notice: a courtesy
      translation should not compete with the binding German version in search.
      `follow` stays on - the links out of these pages are the same links, and
      there is no reason to strand them.

      This is the one place the four translations differ from the original in
      how they are *published* rather than in what they say, which is why it is
      keyed off the same fact everything else is: German binds.
    */
    ...(locale === 'de' ? {} : { robots: { index: false, follow: true } }),
  }
}
