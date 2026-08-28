import type { Metadata } from 'next'
import { openPlace } from '@/app/t/[slug]/visit'
import { HomeGame } from '@/app/world/home/home-scene'
import { homeDict } from '@/app/i18n/home'
import { readLocale } from '@/app/i18n/preference'

/** The tab. `generateMetadata` because a static export cannot be two languages. */
export async function generateMetadata(): Promise<Metadata> {
  const t = homeDict(await readLocale()).meta
  return { title: t.house, description: t.houseBody }
}

export const dynamic = 'force-dynamic'

/**
 * A member's house.
 *
 * Yours by default, somebody else's with `?of=<userId>`. Everything that
 * decides which - and whether you get past their front door - lives in
 * `openPlace`, so the three homestead pages cannot drift apart on it.
 */
export default async function TenantHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { slug } = await params
  const visit = await openPlace(slug, 'home', searchParams)

  /**
   * Remounted when whose place this is changes.
   *
   * Walking from your own house to a colleague's is a client-side navigation
   * within the same route segment, so React reuses the scene component - and
   * both the furniture and the front door are seeded by lazy `useState`
   * initialisers that only run on mount. Without a key you arrive at their
   * address still looking at your own room, already admitted, with no knock
   * ever sent. A different homestead is a different world, and a fresh instance
   * is the honest representation of that.
   */
  return (
    <HomeGame
      key={visit.owner.userId}
      place="home"
      slug={visit.slug}
      initial={visit.initial}
      avatar={visit.avatar}
      presence={visit.presence}
      owner={visit.owner}
      agents={visit.agents}
    />
  )
}
