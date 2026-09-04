'use server'

import { revalidatePath } from 'next/cache'
import { boughtExtras, buyExtra } from '@/domain/bank/extras'
import { extraPrice, PURCHASABLE, type Purchasable } from '@/domain/bank/prices'
import { economyOn } from '@/domain/bank/purse'
import { requireTenant, writeBlockedReason } from '@/lib/tenant'
import { tierLimit } from '@/domain/billing/tiers'

/**
 * Buying one more than the plan holds, from a page.
 *
 * `docs/product/economy.md` §8. The action half of `extras.ts`, which owns the
 * charge-then-record ordering and knows nothing about sessions or paths.
 *
 * ---------------------------------------------------------------------------
 * Anybody in the space may buy
 * ---------------------------------------------------------------------------
 * Not just owners, and that is deliberate. They are spending *their own* coins
 * on something the **space** keeps, so narrowing it to owners would mean the
 * person who actually hit the wall has to go and ask somebody else to fix it -
 * and the wall is usually hit at the moment somebody is trying to make
 * something.
 *
 * What stops that being a hole is that a purchase can only ever *add* capacity.
 * There is nothing here anybody can take away from the space, and the coins are
 * the buyer's.
 */

export type BuyExtraResult =
  | { ok: true; bought: number }
  | { ok: false; error: string }

/** What a space holds, what it has bought, and what one more would cost. */
export interface ExtraOffer {
  what: Purchasable
  /** The tier's own allowance, before anything bought. */
  included: number | null
  bought: number
  /** `null` when this tier cannot buy one - unlimited already, or never. */
  price: number | null
}

export type OffersResult =
  | { ok: true; offers: ExtraOffer[]; purse: number; on: boolean }
  | { ok: false; error: string }

/**
 * The shelf, for a space's settings page.
 *
 * Returns every purchasable thing including the ones this tier cannot buy, with
 * a `null` price to say so. A surface that only received the buyable ones could
 * not explain *why* a row is missing, and "your plan already has unlimited of
 * these" is the most useful thing this page can tell somebody.
 */
export async function readExtras(slug: string): Promise<OffersResult> {
  const context = await requireTenant(slug)
  const { supabase, tenant, user } = context

  const [bought, on, purse] = await Promise.all([
    boughtExtras(supabase, tenant.id),
    economyOn(supabase, tenant.id),
    supabase
      .from('homestead_read_model')
      .select('coins')
      .eq('tenant_id', tenant.id)
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  return {
    ok: true,
    on,
    purse: purse.data?.coins ?? 0,
    offers: PURCHASABLE.map((what) => ({
      what,
      included: tierLimit(tenant.tier, what),
      bought: bought[what] ?? 0,
      price: extraPrice(tenant.tier, what),
    })),
  }
}

/** Pay for one more. */
export async function buyOneMore(
  slug: string,
  what: Purchasable,
): Promise<BuyExtraResult> {
  const context = await requireTenant(slug)

  // A lapsed subscription or an archived space stops this like any other write.
  // Buying capacity for a space that cannot be written to is money for nothing.
  const blocked = writeBlockedReason(context)
  if (blocked) return { ok: false, error: blocked }

  // Not `PURCHASABLE.includes` on a widened string: the parameter is typed, and
  // the only caller that could pass something else is a hand-posted request,
  // which `extraPrice` answers with `null` and a refusal anyway.
  return buyExtra(
    context.supabase,
    context.tenant.id,
    context.user.id,
    context.tenant.tier,
    what,
  ).then((result) => {
    if (result.ok) revalidatePath(`/t/${slug}/settings/space`)
    return result
  })
}
