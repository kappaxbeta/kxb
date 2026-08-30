import type { NextRequest } from 'next/server'
import type Stripe from 'stripe'
import { billingDecider } from '@/domain/billing/aggregate'
import type { BillingCommand } from '@/domain/billing/commands'
import { subscriptionStreamId } from '@/domain/billing/events'
import { billingProjection } from '@/domain/billing/projection'
import { tierForPrice, tierForPriceOrDefault } from '@/domain/billing/prices'
import { grantPurchasedSkin, grantSubscriptionVoucher } from '@/domain/skins/grants'
import { grantPurchasedBucks } from '@/domain/skins/bucks'
import { executeCommand } from '@/es/command'
import { runProjection } from '@/es/projection'
import type { Client } from '@/es/store'
import { env } from '@/lib/env'
import { stripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Stripe webhook receiver.
 *
 * This is the only unauthenticated write path in the application, so the order
 * of operations matters more than usual:
 *
 *   1. Read the *raw* body. Not req.json() - the signature is computed over the
 *      exact bytes Stripe sent, and any reserialization invalidates it.
 *   2. Verify the signature. Everything downstream treats the payload as
 *      trusted, and this is the only thing that earns that trust.
 *   3. Claim the event id. Stripe delivers at least once and retries on any
 *      non-2xx, so without this a redelivered `invoice.paid` records a second
 *      payment that never happened.
 *   4. Only then touch the domain.
 *
 * Failure handling is deliberately asymmetric. A signature failure returns 400
 * and Stripe gives up, which is right - it was never a real event. Anything
 * that fails *after* verification returns 500 so Stripe retries, because a
 * dropped payment event is worse than a duplicate one (and step 3 makes
 * duplicates harmless).
 */

/** Which tenant this Stripe object belongs to, per the metadata we set. */
function tenantIdFrom(metadata: Stripe.Metadata | null | undefined): string | null {
  const value = metadata?.tenantId
  return typeof value === 'string' && value.length > 0 ? value : null
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 })
  }

  const rawBody = await request.text()

  let event: Stripe.Event
  try {
    event = stripe().webhooks.constructEvent(
      rawBody,
      signature,
      env.stripeWebhookSecret(),
    )
  } catch (error) {
    // Either someone is poking at the endpoint, or the secret is wrong. Both
    // are worth a 400 rather than a retry.
    const message = error instanceof Error ? error.message : 'unknown error'
    return new Response(`Signature verification failed: ${message}`, { status: 400 })
  }

  const supabase = createAdminClient() as unknown as Client

  // Step 3. The primary key is the lock: a redelivery loses the insert race
  // against its own earlier delivery and exits here.
  const { error: claimError } = await supabase
    .from('stripe_webhook_events')
    .insert({ id: event.id, type: event.type })

  if (claimError) {
    if (claimError.code === '23505') {
      return Response.json({ received: true, deduplicated: true })
    }
    return new Response(`Could not record webhook: ${claimError.message}`, {
      status: 500,
    })
  }

  try {
    const handled = await handle(supabase, event)
    return Response.json({ received: true, handled })
  } catch (error) {
    // Release the claim so Stripe's retry gets a real second attempt rather
    // than being deduplicated into a no-op.
    await supabase.from('stripe_webhook_events').delete().eq('id', event.id)

    const message = error instanceof Error ? error.message : 'unknown error'
    return new Response(`Webhook handler failed: ${message}`, { status: 500 })
  }
}

/**
 * Translate a Stripe event into a domain command.
 *
 * Note how little happens here: no business rules, no status arithmetic. This
 * layer's whole job is "which of our commands does this Stripe event mean". The
 * decider then decides whether it is allowed and what it implies, which keeps
 * the rules unit-testable without a Stripe account.
 */
async function handle(supabase: Client, event: Stripe.Event): Promise<boolean> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object

      // A skin purchase, not a subscription: our metadata says so, and there
      // is no tenant and no subscription to expand - the grant is the whole
      // of what the event means.
      if (session.metadata?.kind === 'skin') {
        return grantPurchasedSkin(supabase, session)
      }

      // Bucks, the same shape: a one-off payment with no tenant and no
      // subscription, whose whole meaning is the grant.
      if (session.metadata?.kind === 'bucks') {
        return grantPurchasedBucks(supabase, session)
      }

      const tenantId = tenantIdFrom(session.metadata)
      if (!tenantId) return false

      // Expand to read the price off the subscription; Checkout does not embed
      // it in the session.
      const subscriptionId =
        typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription?.id
      if (!subscriptionId) return false

      const subscription = await stripe().subscriptions.retrieve(subscriptionId)
      const item = subscription.items.data[0]

      return dispatch(supabase, tenantId, {
        type: 'StartSubscription',
        stripeCustomerId:
          typeof session.customer === 'string'
            ? session.customer
            : (session.customer?.id ?? ''),
        stripeSubscriptionId: subscriptionId,
        priceId: item?.price.id ?? '',
        amountCents: item?.price.unit_amount ?? 0,
        currency: item?.price.currency ?? 'eur',
        // Which half of the product they just bought. `OrDefault` rather than a
        // refusal because by this point the money has moved: a session we
        // created, on a price we no longer recognise, is a misconfigured
        // deployment, and the recoverable failure is to give them the cheaper
        // tier and let support fix it - not to drop a paid subscription on the
        // floor.
        tier: await tierForPriceOrDefault(supabase, item?.price.id),
      })
    }

    // The delayed half of a skin purchase: a SEPA checkout completes with the
    // money still in flight, and this is the event that says it landed.
    // grantPurchasedSkin checks payment_status either way, so both events can
    // share it.
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object
      if (session.metadata?.kind !== 'skin') return false
      return grantPurchasedSkin(supabase, session)
    }

    case 'invoice.paid': {
      const invoice = event.data.object
      const tenantId = tenantIdFrom(invoice.metadata) ?? (await tenantForInvoice(invoice))
      if (!tenantId) return false

      // The paying subscriber's monthly skin voucher rides on the same event,
      // after the payment is recorded. Its own idempotency (the invoice id is
      // unique on the voucher row) makes it safe under redelivery, and its own
      // error handling keeps a perk from failing a payment.
      const handled = await dispatch(supabase, tenantId, {
        type: 'RecordPaymentSucceeded',
        invoiceId: invoice.id ?? '',
        amountCents: invoice.amount_paid,
        periodEnd: invoice.period_end
          ? new Date(invoice.period_end * 1000).toISOString()
          : null,
      })

      await grantSubscriptionVoucher(supabase, invoice)
      return handled
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object
      const tenantId = tenantIdFrom(invoice.metadata) ?? (await tenantForInvoice(invoice))
      if (!tenantId) return false

      return dispatch(supabase, tenantId, {
        type: 'RecordPaymentFailed',
        invoiceId: invoice.id ?? null,
        // SEPA return codes arrive here: insufficient funds, account closed,
        // mandate revoked. Worth surfacing verbatim - "AC04 account closed"
        // tells the customer what to fix in a way "payment failed" does not.
        reason:
          invoice.last_finalization_error?.message ??
          'The direct debit was returned by the bank',
      })
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object
      const tenantId = tenantIdFrom(subscription.metadata)
      if (!tenantId) return false

      // `unpaid` is Stripe's terminal state after it exhausts retries. That is
      // the point at which a workspace goes read-only.
      if (subscription.status === 'unpaid') {
        return dispatch(supabase, tenantId, {
          type: 'SuspendSubscription',
          reason: 'Stripe stopped retrying the direct debit',
        })
      }

      /**
       * The plan moved.
       *
       * This is where a booked upgrade or downgrade actually lands: the
       * schedule reaches its second phase at the period end, Stripe swaps the
       * price, and this event is how we hear about it. It also catches a plan
       * edited by hand in the Stripe dashboard, which is the case that makes
       * reading the price here rather than trusting our own booking worthwhile.
       *
       * Fires on every other change too - a card updated, a tax rate applied -
       * so the decider drops it when the tier is already what it says. See
       * `ChangeSubscriptionTier`.
       */
      const item = subscription.items.data[0]
      const tier = await tierForPrice(supabase, item?.price.id)
      if (!tier) return false

      return dispatch(supabase, tenantId, {
        type: 'ChangeSubscriptionTier',
        to: tier,
        priceId: item?.price.id ?? '',
        amountCents: item?.price.unit_amount ?? 0,
      })
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object
      const tenantId = tenantIdFrom(subscription.metadata)
      if (!tenantId) return false

      return dispatch(supabase, tenantId, {
        type: 'CancelSubscription',
        effectiveAt: subscription.ended_at
          ? new Date(subscription.ended_at * 1000).toISOString()
          : null,
      })
    }

    case 'charge.dispute.created': {
      // A SEPA reversal. This can arrive up to 8 weeks after a payment that
      // already succeeded - which is exactly why "paid" is a point in a stream
      // rather than a boolean somewhere.
      const dispute = event.data.object
      const tenantId = await tenantForCharge(dispute)
      if (!tenantId) return false

      return dispatch(supabase, tenantId, {
        type: 'SuspendSubscription',
        reason: 'A settled payment was reversed by the payer’s bank',
      })
    }

    default:
      // Stripe sends far more than we subscribe to. Acknowledging the rest with
      // a 200 stops it retrying events we will never care about.
      return false
  }
}

/** Fall back to the subscription's metadata when an invoice carries none. */
async function tenantForInvoice(invoice: Stripe.Invoice): Promise<string | null> {
  const parent = invoice.parent
  const subscriptionRef =
    parent?.type === 'subscription_details'
      ? parent.subscription_details?.subscription
      : null
  if (!subscriptionRef) return null

  const id = typeof subscriptionRef === 'string' ? subscriptionRef : subscriptionRef.id
  const subscription = await stripe().subscriptions.retrieve(id)
  return tenantIdFrom(subscription.metadata)
}

async function tenantForCharge(dispute: Stripe.Dispute): Promise<string | null> {
  const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge.id
  const charge = await stripe().charges.retrieve(chargeId)
  return tenantIdFrom(charge.metadata)
}

/**
 * Run a billing command and catch the read model up.
 *
 * The tenant id came from Stripe metadata that we set ourselves when creating
 * the Checkout session, and the payload's signature has been verified, so this
 * is the "establish the tenant from a verified source" step the admin client
 * demands before it will be used.
 */
async function dispatch(
  supabase: Client,
  tenantId: string,
  command: BillingCommand,
): Promise<boolean> {
  await executeCommand({
    supabase,
    decider: billingDecider,
    tenantId,
    streamId: subscriptionStreamId(tenantId),
    command,
    // No actorId: this event has no human behind it. That is what the nullable
    // actor_id column is for.
    metadata: { source: 'stripe-webhook' },
  })

  await runProjection(supabase, billingProjection, tenantId)
  return true
}
