import type { Country } from './countries/index'

/**
 * The people registry: kxb users who have founded in a country and are
 * willing to be asked about it.
 *
 * Empty on purpose, like the blog was: the section on every country hub
 * exists first, so being listed is a one-line entry here rather than a
 * feature request. When this becomes real account-backed data it moves to
 * the app's database and this file becomes the seed; until then, an entry
 * is added by hand and every entry is somebody who asked to be listed.
 *
 * What an entry is not: an endorsement, a directory of advisers, or a place
 * for anybody who did not ask to appear. Public handle and a public link
 * only - the registry must never know more about a person than their own
 * profile page says.
 */
export interface Helper {
  /** Display name or handle, as they asked to appear. */
  name: string
  /** The country they can be asked about - a roster slug. */
  country: Country['slug']
  /** One line, theirs: what they run or what they can be asked. */
  note: string
  /** A public profile or site to reach them through. */
  href?: string
}

export const HELPERS: Helper[] = [
  {
    name: 'Kappa',
    country: 'de',
    note: 'Runs kxb.team - the Germany guide is the route he walked.',
    href: 'https://x.com/kxbteam',
  },
]

export function helpersFor(country: string): Helper[] {
  return HELPERS.filter((helper) => helper.country === country)
}
