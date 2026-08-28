/**
 * Commands against the subscription aggregate.
 *
 * There are no Zod schemas here, unlike the other slices, and that is
 * deliberate rather than an omission: none of these commands come from a
 * browser. They are built in the Stripe webhook route from an event whose
 * signature has already been verified against STRIPE_WEBHOOK_SECRET, so the
 * payload is as trustworthy as the secret is.
 *
 * The one command a *user* can trigger - starting a subscription - does not
 * appear here at all. Clicking "subscribe" creates a Stripe Checkout session
 * and nothing else; the subscription only becomes a fact in our log when Stripe
 * tells us the session completed. A user cannot talk themselves into a paid
 * workspace by POSTing at a Server Action.
 *
 * The two exceptions are the tier-change bookings at the bottom, and they are
 * exceptions only in the narrow sense that matters: they record an *intention*
 * that Stripe has already accepted as a subscription schedule. The action calls
 * Stripe first and records second, so a forged POST that got past the owner
 * check would still have to have moved money's future to say anything. Whether
 * the tier actually changes is decided by `ChangeSubscriptionTier`, which only
 * the webhook can send.
 */

import type { Tier } from '@/domain/billing/tiers'

export type StartSubscription = {
  type: 'StartSubscription'
  stripeCustomerId: string
  stripeSubscriptionId: string
  priceId: string
  amountCents: number
  currency: string
  tier: Tier
}

export type RecordPaymentSucceeded = {
  type: 'RecordPaymentSucceeded'
  invoiceId: string
  amountCents: number
  periodEnd: string | null
}

export type RecordPaymentFailed = {
  type: 'RecordPaymentFailed'
  invoiceId: string | null
  reason: string
}

export type SuspendSubscription = { type: 'SuspendSubscription'; reason: string }

export type CancelSubscription = {
  type: 'CancelSubscription'
  effectiveAt: string | null
}

/** Book a move to another tier, effective at the end of the paid period. */
export type ScheduleTierChange = {
  type: 'ScheduleTierChange'
  to: Tier
  effectiveAt: string
}

/** Call off a booked move. */
export type CancelTierChange = { type: 'CancelTierChange' }

/**
 * Stripe swapped the price. From the webhook only.
 *
 * This is the command that actually moves a space between xo and xp, and the
 * reason it is separate from `ScheduleTierChange` is that only one of the two
 * can be trusted with that. A booking is somebody's stated intention; this is a
 * price Stripe is now charging.
 */
export type ChangeSubscriptionTier = {
  type: 'ChangeSubscriptionTier'
  to: Tier
  priceId: string
  amountCents: number
}

export type BillingCommand =
  | StartSubscription
  | RecordPaymentSucceeded
  | RecordPaymentFailed
  | SuspendSubscription
  | CancelSubscription
  | ScheduleTierChange
  | CancelTierChange
  | ChangeSubscriptionTier
