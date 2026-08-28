import { redirect } from 'next/navigation'

/**
 * /settings itself is no longer a page - it is the pair below it.
 *
 * Kept as a redirect rather than deleted because the old path is linked from
 * outside this route (the backoffice event console, and anything anyone
 * bookmarked). Your profile is the half every member can actually change, so
 * that is where an unqualified "settings" lands.
 */
export default async function SettingsIndex({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  redirect(`/t/${slug}/settings/profile`)
}
