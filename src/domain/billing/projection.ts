import {
  type BillingEvent,
  SUBSCRIPTION_STREAM_TYPE,
} from '@/domain/billing/events'
import { tierForPriceOrDefault } from '@/domain/billing/prices'
import type { Tier } from '@/domain/billing/tiers'
import type { Projection } from '@/es/projection'
import type { Client } from '@/es/store'
import type { StoredEvent } from '@/es/types'
import type { SubscriptionStatusName } from '@/lib/supabase/types'

/**
 * Folds the subscription stream into one row per workspace.
 *
 * This is an untrusted, async read model like the others - but note that the
 * write path reads `status` from it to decide whether a workspace may record
 * events. That looks like the mistake the tenants migration went out of its way
 * to avoid (authorization state in a user-writable table), so it is worth being
 * precise about why it is not:
 *
 *   - Membership decides *who* may act, and is enforced by RLS. Forging it
 *     would let you into another tenant's data, so it lives in a table only the
 *     database writes.
 *
 *   - Billing decides whether an otherwise-authorised member may write. Forging
 *     it gets you a free workspace, not somebody else's. It is a commercial
 *     control, not a security boundary, and the money is reconciled against
 *     Stripe regardless of what this table says.
 *
 * Worth keeping honest: if the day comes that billing status gates access to
 * *other people's* data, it stops being a read model and moves into the trigger
 * alongside membership.
 */
export const billingProjection: Projection<BillingEvent> = {
  name: 'subscriptions_read_model',
  streamTypes: [SUBSCRIPTION_STREAM_TYPE],

  async handle(supabase: Client, event: StoredEvent<BillingEvent>): Promise<void> {
    switch (event.type) {
      case 'SubscriptionStarted':
        await upsert(supabase, {
          tenant_id: event.tenantId,
          status: 'pending',
          stripe_customer_id: event.data.stripeCustomerId,
          stripe_subscription_id: event.data.stripeSubscriptionId,
          amount_cents: event.data.amountCents,
          currency: event.data.currency,
          current_period_end: null,
          last_failure_reason: null,
          /**
           * The event's own tier first, then the price mapping.
           *
           * Unlike `evolve`, this side may read `prices.ts` - the projector
           * runs on a server - so a `SubscriptionStarted` from before tiers
           * existed still lands on the right row rather than on DEFAULT_TIER.
           * The legacy EUR 20 price maps to xp there, which is the whole
           * grandfather rule and the reason this is worth the extra lookup.
           */
          tier: event.data.tier ?? (await tierForPriceOrDefault(supabase, event.data.priceId)),
          pending_tier: null,
          pending_tier_at: null,
          cancel_at_period_end: false,
          created_at: event.createdAt,
          updated_at: event.createdAt,
          version: event.version,
        })
        return

      case 'PaymentSucceeded':
        await patch(supabase, event, {
          status: 'active',
          current_period_end: event.data.periodEnd,
          last_failure_reason: null,
        })
        return

      case 'PaymentFailed':
        await patch(supabase, event, {
          status: 'past_due',
          last_failure_reason: event.data.reason,
        })
        return

      case 'SubscriptionSuspended':
        await patch(supabase, event, {
          status: 'suspended',
          last_failure_reason: event.data.reason,
        })
        return

      case 'SubscriptionCanceled':
        await patch(supabase, event, {
          status: 'canceled',
          pending_tier: null,
          pending_tier_at: null,
          cancel_at_period_end: false,
        })
        return

      case 'SubscriptionTierChangeScheduled':
        await patch(supabase, event, {
          pending_tier: event.data.to,
          pending_tier_at: event.data.effectiveAt,
        })
        return

      case 'SubscriptionTierChangeCanceled':
        await patch(supabase, event, { pending_tier: null, pending_tier_at: null })
        return

      case 'SubscriptionTierChanged':
        // Deliberately does not touch `status`. A plan change is orthogonal to
        // whether the space is paid up: a past_due space that moves to xo at
        // renewal is still past_due, and marking it active here would clear a
        // failed payment nobody has fixed.
        await patch(supabase, event, {
          tier: event.data.to,
          amount_cents: event.data.amountCents,
          pending_tier: null,
          pending_tier_at: null,
        })
        return

      default:
        return
    }
  },
}

type SubscriptionRow = {
  tenant_id: string
  status: SubscriptionStatusName
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  amount_cents: number | null
  currency: string | null
  current_period_end: string | null
  last_failure_reason: string | null
  tier: Tier | null
  pending_tier: Tier | null
  pending_tier_at: string | null
  cancel_at_period_end: boolean
  created_at: string
  updated_at: string
  version: number
}

async function upsert(supabase: Client, row: SubscriptionRow): Promise<void> {
  const { error } = await supabase
    .from('subscriptions_read_model')
    .upsert(row, { onConflict: 'tenant_id' })

  if (error) {
    throw new Error(
      `billing projection failed to upsert ${row.tenant_id}: ${error.message}`,
    )
  }
}

async function patch(
  supabase: Client,
  event: StoredEvent<BillingEvent>,
  changes: Partial<SubscriptionRow>,
): Promise<void> {
  const { error } = await supabase
    .from('subscriptions_read_model')
    .update({
      ...changes,
      updated_at: event.createdAt,
      version: event.version,
    })
    .eq('tenant_id', event.tenantId)

  if (error) {
    throw new Error(
      `billing projection failed to update ${event.tenantId}: ${error.message}`,
    )
  }
}
