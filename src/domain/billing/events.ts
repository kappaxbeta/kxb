import type { DomainEvent } from '@/es/types'
import type { Tier } from '@/domain/billing/tiers'
import { uuidv5 } from '@/lib/uuid'

/**
 * The subscription aggregate's events.
 *
 * These are the only events in the system written by something other than a
 * person: they come from Stripe webhooks, so their `actor_id` is NULL. That is
 * why the billing migration made the column nullable - "the system did this" is
 * a fact worth being able to state.
 *
 * Payloads carry Stripe's identifiers but never a payment instrument. No IBAN,
 * no mandate reference, nothing that would make this log a target. Stripe holds
 * those; we hold a customer id that is useless without our secret key.
 */

export type SubscriptionStarted = DomainEvent<
  'SubscriptionStarted',
  {
    stripeCustomerId: string
    stripeSubscriptionId: string
    priceId: string
    amountCents: number
    currency: string
    /**
     * Which half of the product this bought.
     *
     * Recorded alongside `priceId` rather than derived from it at read time,
     * and the redundancy is the point. A price id is a pointer into somebody
     * else's system: prices get archived, replaced, renamed, and the mapping
     * in `prices.ts` is a snapshot of what the environment says *today*. If
     * this were derived, then retiring a price would silently rewrite what
     * every historical subscription is recorded as having bought.
     *
     * Optional, because events written before tiers existed do not have it.
     * Readers fall back to the price mapping and then to DEFAULT_TIER; see
     * `evolve`.
     */
    tier?: Tier
  }
>

export type PaymentSucceeded = DomainEvent<
  'PaymentSucceeded',
  { invoiceId: string; amountCents: number; periodEnd: string | null }
>

export type PaymentFailed = DomainEvent<
  'PaymentFailed',
  { invoiceId: string | null; reason: string }
>

/**
 * Stripe gave up retrying, or a settled debit was clawed back. This is what
 * makes a workspace read-only.
 */
export type SubscriptionSuspended = DomainEvent<
  'SubscriptionSuspended',
  { reason: string }
>

export type SubscriptionCanceled = DomainEvent<
  'SubscriptionCanceled',
  { effectiveAt: string | null }
>

/**
 * A move between xo and xp has been booked, and will happen at `effectiveAt`.
 *
 * Two events rather than one because a tier change is two facts separated by up
 * to a month, and collapsing them would lose the more useful of the two. This
 * is "the owner decided" - it happens the moment they click, and it is what the
 * billing page reads to say "you move to xp on the 25th". `SubscriptionTierChanged`
 * below is "Stripe actually billed it", which arrives when the period rolls
 * over and is what changes what the space can do.
 *
 * Written from a Server Action rather than a webhook, so unlike its neighbours
 * this one does have a human behind it and carries an `actor_id`.
 */
export type SubscriptionTierChangeScheduled = DomainEvent<
  'SubscriptionTierChangeScheduled',
  { from: Tier; to: Tier; effectiveAt: string }
>

/** The booked move was called off before it landed. */
export type SubscriptionTierChangeCanceled = DomainEvent<
  'SubscriptionTierChangeCanceled',
  { was: Tier }
>

/**
 * The space is now on a different tier, as of this moment.
 *
 * Comes from the webhook when Stripe swaps the price at renewal, not from the
 * action that booked it. That ordering is the whole reason the schedule lives
 * in Stripe: if this event were written optimistically when the owner clicked,
 * a schedule that failed to execute - a card that stopped working in the
 * meantime, a subscription cancelled first - would leave a space recorded as xp
 * that Stripe is still billing at the xo price.
 */
export type SubscriptionTierChanged = DomainEvent<
  'SubscriptionTierChanged',
  { from: Tier | null; to: Tier; priceId: string; amountCents: number }
>

export type BillingEvent =
  | SubscriptionStarted
  | PaymentSucceeded
  | PaymentFailed
  | SubscriptionSuspended
  | SubscriptionCanceled
  | SubscriptionTierChangeScheduled
  | SubscriptionTierChangeCanceled
  | SubscriptionTierChanged

export const SUBSCRIPTION_STREAM_TYPE = 'subscription'

/** Human-readable labels for the event log viewer. */
export const BILLING_EVENT_LABELS: Record<BillingEvent['type'], string> = {
  SubscriptionStarted: 'subscription started',
  PaymentSucceeded: 'payment received',
  PaymentFailed: 'payment failed',
  SubscriptionSuspended: 'subscription suspended',
  SubscriptionCanceled: 'subscription canceled',
  SubscriptionTierChangeScheduled: 'plan change booked',
  SubscriptionTierChangeCanceled: 'plan change called off',
  SubscriptionTierChanged: 'plan changed',
}

/**
 * A workspace's subscription stream id, derived from its tenant id.
 *
 * It cannot simply *be* the tenant id: append_events() checks stream versions
 * with `max(version) where stream_id = ?`, so two stream types sharing an id
 * would share one version sequence and collide on every write.
 *
 * Deriving it (UUIDv5, which is just a namespaced hash) rather than storing it
 * means a webhook can find the right stream from Stripe metadata alone, with no
 * database lookup and no risk of pointing at the wrong workspace because a
 * lookup row was missing.
 */
const SUBSCRIPTION_NAMESPACE = '9f4d2c61-8f3a-4b7e-9c15-2a6de3b70f84'

export function subscriptionStreamId(tenantId: string): string {
  return uuidv5(tenantId, SUBSCRIPTION_NAMESPACE)
}
