import type { Metadata } from 'next'
import { openPlace } from '@/app/t/[slug]/visit'
import { CafeGame } from '@/app/world/cafe/cafe-scene'

export const metadata: Metadata = {
  title: 'Café',
  description: "A member's café. Run the lunch service, spend the takings.",
}

export const dynamic = 'force-dynamic'

/**
 * A member's café.
 *
 * Shares one purse with their house and garden, which is why all three come off
 * a single `homestead` stream: a balance split across three streams could be
 * spent twice at once and neither write would notice.
 *
 * What is recorded is what was built and what was earned. Where anybody is
 * standing, what is in the oven and how impatient the current customers are all
 * stay in the browser - see src/domain/homestead/events.ts for why.
 *
 * Yours by default, somebody else's with `?of=<userId>` - see `openPlace`.
 */
export default async function TenantCafePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { slug } = await params
  const visit = await openPlace(slug, 'cafe', searchParams)

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
    <CafeGame
      key={visit.owner.userId}
      slug={visit.slug}
      initial={visit.initial}
      avatar={visit.avatar}
      presence={visit.presence}
      owner={visit.owner}
      agents={visit.agents}
    />
  )
}
