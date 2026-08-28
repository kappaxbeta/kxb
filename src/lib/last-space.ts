/**
 * Which space you were in last.
 *
 * Deliberately free of `server-only` and of any `next/headers` import: the
 * cookie is *written* by the proxy, which runs in a different runtime, and
 * *read* by server components. Keeping the name and the parsing rule here means
 * the two halves cannot drift apart, and neither half can be tempted to import
 * the other's runtime.
 *
 * A preference, not a capability - nothing is granted by holding it. It is
 * still httpOnly because no client code has any reason to read it, and
 * membership is proved again on the way out (see `resolveLastSpace`), so a
 * stale or forged value can only ever cost you the picker you would have got
 * anyway.
 */
export const LAST_SPACE_COOKIE = 'unkown_last_space'

/** Half a year. Long enough that the picker is a thing you choose to visit. */
export const LAST_SPACE_MAX_AGE = 60 * 60 * 24 * 180

/**
 * The workspace slug a path is inside, if it is inside one.
 *
 * Matches the slug rule from `slugSchema` rather than taking whatever the
 * segment happens to be, so a request for `/t/../../etc` or a slug with a
 * newline in it never reaches the cookie - the value is written back into a
 * `Location` header later, and the cheapest place to refuse rubbish is before
 * storing it.
 */
export function spaceSlugFromPath(pathname: string): string | null {
  const segment = /^\/t\/([^/?#]+)/.exec(pathname)?.[1]
  if (!segment) return null

  const slug = decodeURIComponent(segment).toLowerCase()
  if (slug.length < 2 || slug.length > 40) return null
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug)) return null

  return slug
}
