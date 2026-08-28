import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { workspaceDict } from '@/app/i18n/workspace'
import { readLocale } from '@/app/i18n/preference'

/**
 * The board's old address.
 *
 * It moved to the workspace root - see ../page.tsx - and this stays behind
 * rather than 404ing, because /t/[slug]/dashboard is in people's bookmarks, in
 * the sidebar of any tab opened before the change, and in whatever links have
 * already been pasted into a chat. A redirect costs one file and nothing at
 * runtime; a dead link costs somebody the page they were trying to reach.
 *
 * `pinboard.tsx` still lives in this folder and is imported from the root page.
 * A directory without a `page.tsx` is not a route in Next, so the component
 * could sit here alone - it keeps its `page.tsx` only for this redirect.
 */
/** The tab. `generateMetadata`, because a static export cannot be two languages. */
export async function generateMetadata(): Promise<Metadata> {
  return { title: workspaceDict(await readLocale()).titles.dashboard }
}

export default async function DashboardRedirect({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  redirect(`/t/${slug}`)
}
