import type { Metadata } from 'next'
import { CafeRoute } from '@/app/t/[slug]/cafe/cafe-route'
import { requireTenant } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Café' }
}

/**
 * Where coins come from.
 *
 * `docs/product/economy.md` §6. The café is the faucet - a shift is the main
 * way coins are created - so it needs an address that does not depend on what
 * is on a space's shelf. See `CafeRoute` for why this route came back after
 * being deliberately removed.
 *
 * ---------------------------------------------------------------------------
 * The gate is the door's, not this page's
 * ---------------------------------------------------------------------------
 * `requireTenant` with the same surface the cartridge uses, and **no
 * `requireFeature`**. That is deliberate: `openHomesteadFrame` already refuses
 * a space with the café switched off, and it refuses with a *sentence*. A
 * `notFound()` here would turn "switched off for this space" into "there is no
 * such page", which is the less useful of the two things to tell somebody who
 * followed a link that said "go and earn".
 *
 * Guests come through on an event link, exactly as they do into the cartridge -
 * `surface: 'cafe'` is what admits them, and leaving it off would make this
 * address stricter than the shelf beside it for no reason anybody could see.
 */
export default async function CafePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  // Establishes the membership and writes the session cookies the scene's own
  // server actions will need. The frame is opened on the client, because the
  // scene is a canvas and this page is its host rather than its data source.
  await requireTenant(slug, { guests: 'event', surface: 'cafe' })

  return <CafeRoute slug={slug} />
}
