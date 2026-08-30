/**
 * KXB bucks: the one currency a skin is bought with.
 *
 * A buck *is* a `skin_vouchers` row - the table predates the name and the two
 * are the same object, so nothing here invents a second ledger. What the name
 * changed is the shape of the shop: money no longer buys a skin directly, it
 * buys bucks, and bucks buy anything on the shelf. That collapses two
 * currencies into one, which is the whole reason to do it: "a skin costs a
 * buck, a super skin costs two, your plan posts you one a month" is a sentence
 * somebody can hold in their head, and "€3 or two vouchers depending which
 * shelf" is not.
 *
 * The row's three states carry the whole lifecycle and are unchanged: no owner
 * is a code in flight, an owner is a buck in a wallet, and `spent_at` is a buck
 * that bought something.
 */

import 'server-only'
import type Stripe from 'stripe'
import { mintPromoCode } from '@/domain/promo/mint'
import type { Client } from '@/es/store'

/**
 * What money buys.
 *
 * Priced so the bundle is the obvious choice without making a single buck feel
 * like a punishment: €3 is what one skin used to cost, and the discount arrives
 * at three. The ids are what travel in Stripe metadata, so they are stable
 * strings rather than array positions - a reordered list must not turn a
 * five-buck purchase into a one-buck grant.
 */
export interface BuckBundle {
  id: string
  bucks: number
  cents: number
  /** What the shop says under the price. Empty for the plain single. */
  note: string
}

export const BUCK_BUNDLES: readonly BuckBundle[] = [
  { id: 'b1', bucks: 1, cents: 300, note: '' },
  { id: 'b3', bucks: 3, cents: 800, note: 'save €1' },
  { id: 'b5', bucks: 5, cents: 1200, note: 'save €3' },
] as const

export function bundleById(id: string): BuckBundle | null {
  return BUCK_BUNDLES.find((bundle) => bundle.id === id) ?? null
}

/**
 * Put paid-for bucks in somebody's wallet.
 *
 * Idempotent through the session id paired with a position in the bundle: a
 * redelivered session mints fresh codes, so the codes cannot be what collides -
 * the numbering is. One row per buck, so the wallet counts by counting and a
 * bundle is not a special kind of row.
 *
 * Inserted as one statement, so a retry that collides on the index takes the
 * whole batch down rather than half-granting it.
 */
export async function grantPurchasedBucks(
  supabase: Client,
  session: Stripe.Checkout.Session,
): Promise<boolean> {
  const userId = session.metadata?.userId
  const bucks = Number(session.metadata?.bucks ?? 0)

  if (!userId || !Number.isInteger(bucks) || bucks < 1 || bucks > 50) {
    console.warn(`[bucks] session ${session.id} carried no usable grant`)
    return false
  }

  const now = new Date().toISOString()
  const rows = Array.from({ length: bucks }, (_, index) => ({
    code: mintPromoCode('SKIN'),
    owner_id: userId,
    created_by: userId,
    source: 'purchase' as const,
    stripe_session_id: session.id,
    stripe_session_seq: index + 1,
    // Straight into the wallet: nobody has to redeem what they just bought.
    redeemed_at: now,
  }))

  const { error } = await supabase.from('skin_vouchers').insert(rows)

  if (error && error.code !== '23505') {
    console.warn(`[bucks] grant for session ${session.id} failed: ${error.message}`)
    return false
  }

  return true
}
