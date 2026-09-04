'use server'

/**
 * Buying bucks, as an action a button can call.
 *
 * Separate from `bucks.ts` only because that module is `server-only` and this
 * one is imported by the shop, which runs in the browser. The bundle table
 * stays there with the grant it has to agree with; what crosses is this
 * function and the ids it accepts.
 */

import { redirect } from 'next/navigation'
import { bundleById } from '@/domain/skins/bucks'
import { resolveFeatures } from '@/domain/flags/queries'
import { requireUser } from '@/lib/auth'
import { env } from '@/lib/env'
import { stripe } from '@/lib/stripe'
import { isAppShell, NOT_FOR_SALE_IN_APP } from '@/lib/app-shell'

/**
 * Buy bucks through Stripe Checkout.
 *
 * A one-off `mode: 'payment'`, like the skin purchase it replaces, and for the
 * same reasons: bucks are not a subscription, the price is read from the table
 * above rather than from the form, and the grant happens in the webhook so an
 * abandoned checkout grants nothing.
 *
 * Deliberately not gated on `skin_shop` being open for a *guest* reason: it is
 * gated, but the refusal says the shop is shut rather than pretending the
 * button does not exist, because somebody who arrived on a link mid-purchase
 * deserves a sentence.
 */
export async function startBucksCheckout(
  bundleId: string,
): Promise<{ ok: false; error: string } | never> {
  // Nothing is sold inside the installed app - see `isAppShell`. Checked here
  // and not only in the UI, because a Server Action is a public POST endpoint
  // and a hidden button is a rendering decision.
  if (await isAppShell()) return { ok: false, error: NOT_FOR_SALE_IN_APP }

  const { user, supabase } = await requireUser()

  const features = await resolveFeatures(supabase, null)
  if (!features.skin_shop) return { ok: false, error: 'The skin shop is not open.' }

  if (!user.email) {
    return { ok: false, error: 'Bucks are bound to an account. Create one to buy.' }
  }

  const bundle = bundleById(bundleId)
  if (!bundle) return { ok: false, error: 'That is not one of the bundles.' }

  const origin = env.appUrl()

  /**
   * The catalogue product, when there is one.
   *
   * One product for every bundle rather than one per size: three bundles are
   * three amounts of the same thing, and how many bucks were bought is in the
   * metadata below. Without it Stripe invents a product per session from the
   * name, which charges correctly and reports as a pile of one-off products.
   */
  const product = env.stripeProductBucks()

  const session = await stripe().checkout.sessions.create({
    mode: 'payment',
    // Same two flags the tier checkout carries, and for the reason recorded
    // there: Managed Payments refuses a line item with no tax code.
    managed_payments: { enabled: false },
    customer_email: user.email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'eur',
          unit_amount: bundle.cents,
          ...(product
            ? { product }
            : {
                product_data: {
                  name: bundle.bucks === 1 ? '1 KXB buck' : `${bundle.bucks} KXB bucks`,
                },
              }),
        },
      },
    ],
    // How the webhook knows what to grant and to whom. The count rides along
    // rather than being looked up again, so a bundle repriced between checkout
    // and callback still delivers what was actually paid for.
    metadata: {
      kind: 'bucks',
      bundleId: bundle.id,
      bucks: String(bundle.bucks),
      userId: user.id,
    },
    success_url: `${origin}/skins?checkout=bucks`,
    cancel_url: `${origin}/skins?checkout=canceled`,
  })

  if (!session.url) {
    return { ok: false, error: 'Stripe did not return a checkout URL' }
  }

  redirect(session.url)
}

