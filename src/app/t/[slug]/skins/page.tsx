import type { Metadata } from 'next'
import { Shop } from '@/app/skins/shop'
import { BUCK_BUNDLES } from '@/domain/skins/bucks'
import { shopFor } from '@/domain/skins/queries'
import { requireTenant } from '@/lib/tenant'
import { readLocale } from '@/app/i18n/preference'
import { workspaceDict } from '@/app/i18n/workspace'

export async function generateMetadata(): Promise<Metadata> {
  return { title: workspaceDict(await readLocale()).titles.skins }
}

export const dynamic = 'force-dynamic'

/**
 * The shop, inside the space.
 *
 * The same shelf as `/skins` and deliberately the same component: a skin is
 * bound to the account rather than to a space, so there is exactly one shop
 * and this is a second door onto it, not a second copy of it. What the door
 * buys is context - the rail stays up, the space you were in is still around
 * you, and buying a hat does not read as leaving the building.
 *
 * Guests get the shelf and no wallet, as they do everywhere else: `shopFor`
 * is handed a null shopper for an anonymous session, because a skin needs an
 * account to be bound to and a pocket of vouchers that could never be spent
 * is a worse answer than an honest shop window.
 *
 * Not gated on the `skin_shop` flag. The flag closes the *till* - browsing,
 * checkout, redemption - and `ShopView.open` already carries that state into
 * the page; a 404 here would also take away the wardrobe, and somebody who
 * owns a skin must always be able to reach the place they change it.
 */
export default async function SpaceSkinsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const { supabase, user } = await requireTenant(slug, { guests: true })

  const shopper = user.is_anonymous ? null : user.id

  return (
    <div className="mx-auto w-full max-w-5xl">
      <Shop
        view={await shopFor(supabase, shopper)}
        bundles={[...BUCK_BUNDLES]}
        checkout={null}
      />
    </div>
  )
}
