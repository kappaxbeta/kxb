import { permanentRedirect } from 'next/navigation'

/**
 * Where the thingiverse used to be.
 *
 * It is the first tab of `/browse` now - see `ThingiverseWorkbench` - and this
 * route stays as the door people already have. It was a row in the navigation
 * and a row in the account menu for as long as the feature has existed, which
 * means it is in browser histories, in bookmarks and in at least one link
 * somebody has already sent somebody else. A route that is simply deleted turns
 * every one of those into a 404 with nothing to say.
 *
 * `permanentRedirect` rather than `redirect`: this is not a temporary detour
 * while something moves, it is where the surface lives now, and a 308 is what
 * lets a browser stop asking. The child route `/thingiverse/clips` is untouched
 * and keeps working - a redirect here only claims this segment.
 *
 * No gate of its own, deliberately. `/browse` runs the membership, feature and
 * tier checks the moment it renders, and duplicating them here would be two
 * places to keep one rule - the second of which would eventually disagree and
 * refuse somebody the page on the other end would have shown.
 */
export default async function ThingiversePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  permanentRedirect(`/t/${slug}/browse`)
}
