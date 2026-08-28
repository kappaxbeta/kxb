/**
 * `?src=` - the tag on a link we posted somewhere.
 *
 * Its own file, and that is the whole reason this is not in `track.ts`. That
 * module hashes addresses with `node:crypto` and salts them with the service
 * role key, so importing it from a component puts both in the client bundle -
 * or, more likely, fails the build. The demo's join button needs to read this
 * tag in the browser, so the parsing lives where both sides can reach it and
 * `track.ts` imports it like anybody else.
 *
 * ---------------------------------------------------------------------------
 * Why a tag at all, when there is a referrer
 * ---------------------------------------------------------------------------
 * A referrer answers "which site was this person on", and the channels a launch
 * actually runs on do not send one: a video app strips it on the way out, a
 * link pasted into a chat arrives as direct, a QR code has nothing to strip. So
 * the three sources worth measuring are precisely the three that land in the
 * report as `direct`, indistinguishable from somebody typing the domain.
 *
 * The tag is also a different question. The referrer says which site; the tag
 * says which *post*, which is the one a person deciding where to spend next
 * week is actually asking.
 */

/** The prefix that keeps a campaign out of the hostnames' namespace. */
const PREFIX = 'src:'

/**
 * A campaign tag, as it is stored.
 *
 * The value goes in `page_views.referrer_host` next to real hostnames, and that
 * is deliberate - see the note in `track.ts` - but a bare `tiktok` sitting
 * beside `tiktok.com` is two rows for one channel that nobody can tell apart
 * six months later. A colon cannot occur in a hostname, so the prefix separates
 * the two namespaces as a fact rather than as a convention.
 *
 * Deliberately strict. This arrives in a query string, which is
 * attacker-controlled, and ends up written to a table and rendered in a report.
 * Anything that is not a short lowercase slug is not a campaign - it is
 * somebody trying their luck, and it is dropped rather than trimmed into
 * something that looks legitimate.
 */
export function campaignSource(raw: string | null | undefined): string | null {
  const slug = raw?.trim().toLowerCase()
  if (!slug || !/^[a-z0-9][a-z0-9-]{0,31}$/.test(slug)) return null
  return `${PREFIX}${slug}`
}

/** The slug back out of a stored value, for rebuilding a tagged link. */
export function campaignSlug(source: string | null): string | null {
  return source?.startsWith(PREFIX) ? source.slice(PREFIX.length) : null
}

/**
 * The campaign in a query string, if it carries one.
 *
 * Takes the search string rather than a parsed value so that every caller - the
 * beacon, which has `location.search`, and the join route, which has a whole
 * URL - reaches the same parser instead of each writing their own.
 */
export function campaignFrom(search: string | null | undefined): string | null {
  if (!search) return null
  try {
    const query = search.includes('?') ? search.slice(search.indexOf('?')) : search
    return campaignSource(new URLSearchParams(query).get('src'))
  } catch {
    return null
  }
}
