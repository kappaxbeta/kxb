import type { BillingCommand } from '@/domain/billing/commands'
import { type BillingEvent, SUBSCRIPTION_STREAM_TYPE } from '@/domain/billing/events'
import { FALLBACK_TIER, type Tier } from '@/domain/billing/tiers'
import { DomainError } from '@/es/errors'
import type { Decider } from '@/es/types'

/**
 * Subscription state.
 *
 * The status ladder is the whole aggregate, and its shape comes from SEPA
 * rather than from Stripe:
 *
 *   none      - no subscription yet
 *   pending   - started, first debit still in flight. Writable.
 *   active    - money has actually arrived. Writable.
 *   past_due  - a debit bounced and Stripe is retrying. Still writable.
 *   suspended - Stripe gave up, or a settled payment was reversed. Read-only.
 *   canceled  - ended deliberately. Read-only.
 *
 * `pending` exists because a SEPA debit takes days. Treating "not yet paid" as
 * "not allowed in" would lock every new customer out for a working week.
 *
 * `past_due` exists because the first failure is usually a bank hiccup, not a
 * refusal. Suspending on it would punish people for their bank's timing.
 */
export type SubscriptionStatus =
  | 'none'
  | 'pending'
  | 'active'
  | 'past_due'
  | 'suspended'
  | 'canceled'

export interface BillingState {
  status: SubscriptionStatus
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  amountCents: number | null
  currency: string | null
  currentPeriodEnd: string | null
  lastFailureReason: string | null
  /** Which half of the product this space bought. Null before it bought either. */
  tier: Tier | null
  /** A booked move to another tier, and when it lands. Null when none is booked. */
  pendingTier: Tier | null
  pendingTierAt: string | null
}

export const initialBillingState: BillingState = {
  status: 'none',
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  amountCents: null,
  currency: null,
  currentPeriodEnd: null,
  lastFailureReason: null,
  tier: null,
  pendingTier: null,
  pendingTierAt: null,
}

/**
 * May this workspace still record new events?
 *
 * The single question the rest of the app asks billing. Exported as a function
 * over status rather than a boolean on state so the write path can ask it about
 * a read-model row without replaying the stream.
 */
export function isWritable(status: SubscriptionStatus): boolean {
  return status === 'pending' || status === 'active' || status === 'past_due'
}

/**
 * Fold one event into state. Pure, total, never throws.
 */
export function evolve(state: BillingState, event: BillingEvent): BillingState {
  switch (event.type) {
    case 'SubscriptionStarted':
      return {
        ...state,
        status: 'pending',
        stripeCustomerId: event.data.stripeCustomerId,
        stripeSubscriptionId: event.data.stripeSubscriptionId,
        amountCents: event.data.amountCents,
        currency: event.data.currency,
        /**
         * `?? FALLBACK_TIER` is for the events written before tiers existed.
         *
         * `FALLBACK_TIER` and not `DEFAULT_TIER`, which is now `free`. This
         * event *is* a subscription starting - somebody is paying - and the
         * only thing missing is which tier, because the field did not exist
         * yet. Resolving that to free would clamp every historical space to two
         * seats the moment this line ran. The original argument still holds at
         * the other end: it must not resolve to xp either, or the XP suite goes
         * out to all of them at once.
         *
         * The alternative - looking the price id up in `prices.ts` - is not
         * available here and deliberately so: `evolve` is pure and has to stay
         * that way, and `prices.ts` reads the environment. The read model does
         * the richer job with the price to hand; this keeps the fold total.
         */
        tier: event.data.tier ?? FALLBACK_TIER,
      }

    case 'PaymentSucceeded':
      // Deliberately reachable from `suspended`: a workspace that pays up comes
      // straight back to life, with no separate "reinstate" command to forget
      // to call. The transition is still visible in the log.
      return {
        ...state,
        status: 'active',
        currentPeriodEnd: event.data.periodEnd,
        lastFailureReason: null,
      }

    case 'PaymentFailed':
      return { ...state, status: 'past_due', lastFailureReason: event.data.reason }

    case 'SubscriptionSuspended':
      return { ...state, status: 'suspended', lastFailureReason: event.data.reason }

    case 'SubscriptionCanceled':
      // A booked plan change dies with the subscription. Leaving it set would
      // make a cancelled space claim it was moving to xp next month.
      return { ...state, status: 'canceled', pendingTier: null, pendingTierAt: null }

    case 'SubscriptionTierChangeScheduled':
      return {
        ...state,
        pendingTier: event.data.to,
        pendingTierAt: event.data.effectiveAt,
      }

    case 'SubscriptionTierChangeCanceled':
      return { ...state, pendingTier: null, pendingTierAt: null }

    case 'SubscriptionTierChanged':
      // Clears the booking as well as moving the tier. The two always resolve
      // together: a change that has landed is no longer pending, and a change
      // Stripe made without us booking it (a plan edited in the dashboard) has
      // nothing to clear.
      return {
        ...state,
        tier: event.data.to,
        amountCents: event.data.amountCents,
        pendingTier: null,
        pendingTierAt: null,
      }

    default:
      return state
  }
}

/**
 * Decide what happened.
 *
 * Almost every command here originates from a Stripe webhook, which means two
 * unusual properties compared with the other deciders:
 *
 *   - Commands arrive out of order. Stripe does not guarantee delivery
 *     sequence, so `invoice.paid` can land after `invoice.payment_failed` for a
 *     later cycle. The rules below are therefore written to be order-tolerant
 *     rather than assuming a tidy progression.
 *
 *   - Commands repeat. Stripe retries until it gets a 2xx. The webhook route
 *     dedupes by event id, and returning `[]` for a redundant command is the
 *     second line of defence.
 */
export function decide(state: BillingState, command: BillingCommand): BillingEvent[] {
  switch (command.type) {
    case 'StartSubscription': {
      // Already started with this exact Stripe subscription: a redelivery.
      if (state.stripeSubscriptionId === command.stripeSubscriptionId) return []

      if (state.status !== 'none' && state.status !== 'canceled') {
        throw new DomainError(
          'This space already has an active subscription',
          'subscription_exists',
        )
      }

      return [
        {
          type: 'SubscriptionStarted',
          data: {
            stripeCustomerId: command.stripeCustomerId,
            stripeSubscriptionId: command.stripeSubscriptionId,
            priceId: command.priceId,
            amountCents: command.amountCents,
            currency: command.currency,
            tier: command.tier,
          },
        },
      ]
    }

    case 'RecordPaymentSucceeded': {
      if (state.status === 'none') {
        throw new DomainError('No subscription to bill', 'subscription_missing')
      }
      return [
        {
          type: 'PaymentSucceeded',
          data: {
            invoiceId: command.invoiceId,
            amountCents: command.amountCents,
            periodEnd: command.periodEnd,
          },
        },
      ]
    }

    case 'RecordPaymentFailed': {
      if (state.status === 'none') {
        throw new DomainError('No subscription to bill', 'subscription_missing')
      }
      // Already suspended: a further failed retry changes nothing.
      if (state.status === 'suspended') return []

      return [
        {
          type: 'PaymentFailed',
          data: { invoiceId: command.invoiceId, reason: command.reason },
        },
      ]
    }

    case 'SuspendSubscription': {
      if (state.status === 'none') return []
      if (state.status === 'suspended') return []
      return [{ type: 'SubscriptionSuspended', data: { reason: command.reason } }]
    }

    case 'CancelSubscription': {
      if (state.status === 'none') return []
      if (state.status === 'canceled') return []
      return [
        { type: 'SubscriptionCanceled', data: { effectiveAt: command.effectiveAt } },
      ]
    }

    case 'ScheduleTierChange': {
      if (!isWritable(state.status)) {
        throw new DomainError(
          'This space has no live subscription to change',
          'subscription_missing',
        )
      }

      const from = state.tier ?? FALLBACK_TIER
      if (from === command.to) {
        throw new DomainError(`This space is already on ${command.to}`, 'tier_unchanged')
      }

      // Re-booking the same move is a double click, not a change. Re-booking a
      // *different* move is allowed and simply replaces the first, because the
      // schedule in Stripe has been replaced too - see `scheduleTierChange`.
      if (state.pendingTier === command.to) return []

      return [
        {
          type: 'SubscriptionTierChangeScheduled',
          data: { from, to: command.to, effectiveAt: command.effectiveAt },
        },
      ]
    }

    case 'CancelTierChange': {
      if (!state.pendingTier) return []
      return [
        { type: 'SubscriptionTierChangeCanceled', data: { was: state.pendingTier } },
      ]
    }

    case 'ChangeSubscriptionTier': {
      if (state.status === 'none') {
        throw new DomainError('No subscription to change', 'subscription_missing')
      }

      /**
       * Already there: a redelivery, or one of the several `customer.subscription.updated`
       * events Stripe sends around a renewal.
       *
       * This is the guard that matters most in this file. That webhook fires
       * for any change to a subscription - a card updated, a tax rate applied,
       * the period rolling over - so without it every one of them would append
       * a "plan changed" event saying the plan had changed to what it already
       * was, and the billing history would be unreadable within a month.
       */
      if (state.tier === command.to) return []

      return [
        {
          type: 'SubscriptionTierChanged',
          data: {
            from: state.tier,
            to: command.to,
            priceId: command.priceId,
            amountCents: command.amountCents,
          },
        },
      ]
    }

    default: {
      const exhaustive: never = command
      throw new DomainError(`Unknown command: ${JSON.stringify(exhaustive)}`)
    }
  }
}

export const billingDecider: Decider<BillingState, BillingCommand, BillingEvent> = {
  streamType: SUBSCRIPTION_STREAM_TYPE,
  initialState: initialBillingState,
  evolve,
  decide,
}
