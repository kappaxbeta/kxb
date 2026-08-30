import type { Metadata } from 'next'
import { Shop } from '@/app/skins/shop'
import { BUCK_BUNDLES } from '@/domain/skins/bucks'
import { shopFor } from '@/domain/skins/queries'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Skins',
  description: 'Looks for your XP character, bound to your account.',
}

/**
 * The shop.
 *
 * Deliberately outside `/t/[slug]`: a skin belongs to the person, not to a
 * space, and putting the shelf inside one would say the opposite - as well as
 * asking somebody with two spaces which of them they are buying a hat in.
 *
 * It renders for a signed-out visitor too. A price list is not a secret and
 * the shop window is the point; what a guest cannot do is buy, and the cards
 * say so where the button would be rather than hiding the shelf behind a
 * sign-up wall.
 */
export default async function SkinsPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>
}) {
  const { checkout } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  /*
   * A guest session is a browser, not an account, and a skin is bound to an
   * account - so an anonymous visitor is shown the shelf as a stranger would
   * see it rather than a pocket of vouchers that could never be spent.
   */
  const shopper = user && !user.is_anonymous ? user.id : null

  return (
    <Shop
      view={await shopFor(supabase, shopper)}
      // Spread because the table is `readonly` and the prop crosses to a
      // client component, which cannot keep the narrowing.
      bundles={[...BUCK_BUNDLES]}
      checkout={checkout ?? null}
    />
  )
}
