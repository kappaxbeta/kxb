import 'server-only'
import Stripe from 'stripe'
import { env } from '@/lib/env'

/**
 * The Stripe client.
 *
 * `server-only` at the top is load-bearing: importing this from a Client
 * Component would be a build error rather than a secret key shipped to a
 * browser. It is the cheapest guard in the codebase and the most expensive
 * mistake it prevents.
 *
 * Constructed lazily so that merely importing this module does not throw when
 * STRIPE_SECRET_KEY is unset - which is the normal state of a fresh clone, and
 * should not stop the rest of the app from running.
 */
let client: Stripe | null = null

export function stripe(): Stripe {
  if (!client) {
    client = new Stripe(env.stripeSecretKey(), {
      // Pinned deliberately. Stripe ships breaking changes behind versioned
      // APIs; letting the account default float means an unrelated dashboard
      // change can alter webhook payloads under a running deployment.
      apiVersion: '2026-06-24.dahlia',
      appInfo: { name: 'unkown.t', version: '0.1.0' },
    })
  }
  return client
}

/** EUR 20.00 -> "€20.00", for the billing UI. */
export function formatMoney(amountCents: number, currency: string): string {
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amountCents / 100)
}

/**
 * When this subscription's paid period ends, as a unix timestamp.
 *
 * Lives on the subscription *item* in recent API versions rather than on the
 * subscription itself, so this checks both instead of assuming one shape. That
 * matters more than it looks: the field silently moved, so code reading only
 * the old location gets `undefined` rather than an error, and a plan change
 * scheduled for `undefined` is a plan change that happens immediately.
 *
 * Here rather than in `entitlement.ts`, where it started, because three callers
 * now need it - the entitlement sync, the plan scheduler, and the cancel
 * action - and a second copy that checked only one location would be a bug
 * nobody found until a renewal.
 */
export function subscriptionPeriodEnd(subscription: Stripe.Subscription): number | null {
  const fromItem = subscription.items.data[0] as
    | { current_period_end?: number }
    | undefined
  if (typeof fromItem?.current_period_end === 'number') {
    return fromItem.current_period_end
  }

  const legacy = subscription as unknown as { current_period_end?: number }
  return typeof legacy.current_period_end === 'number' ? legacy.current_period_end : null
}
