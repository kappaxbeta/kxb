'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type Stripe from 'stripe'
import { env } from '@/lib/env'
import { stripe, subscriptionPeriodEnd } from '@/lib/stripe'
import { syncUserEntitlement } from '@/domain/billing/entitlement'
import { priceForTier } from '@/domain/billing/prices'
import {
  asPaidTier,
  asTier,
  FALLBACK_TIER,
  type PaidTier,
  type Tier,
} from '@/domain/billing/tiers'
import { billingDecider } from '@/domain/billing/aggregate'
import { subscriptionStreamId } from '@/domain/billing/events'
import { billingProjection } from '@/domain/billing/projection'
import type { BillingCommand } from '@/domain/billing/commands'
import { executeCommand } from '@/es/command'
import { runProjection } from '@/es/projection'
import type { Client } from '@/es/store'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasRole, requireTenant, type TenantContext } from '@/lib/tenant'

/**
 * Billing actions.
 *
 * There is deliberately no "activate my subscription" action. Everything here
 * either sends the user to Stripe or reads back from it; the only thing that
 * writes a payment fact into our log is the webhook, whose payloads are signed.
 * A Server Action is a public POST endpoint, so an action that marked a
 * workspace paid would be a free-workspace button for anyone who found it.
 */

export type ActionResult = { ok: false; error: string }

/**
 * One sentence, used by both paths that would take money for xp.
 *
 * Says "not yet" rather than "not allowed", because that is what is true and
 * because the reader is somebody trying to give us money. See the `xp_sales`
 * flag in domain/flags/keys.ts.
 */
const XP_NOT_ON_SALE =
  'xp is not on sale yet. xo is €5/month, and xp opens soon.'

/**
 * Options every Checkout session shares.
 *
 * Extracted after the account checkout shipped without `managed_payments` and
 * failed with "the product tax code is missing" - a bug that existed only
 * because the same configuration was written twice. One object means adding an
 * option can no longer fix one flow and leave the other broken.
 *
 * `managed_payments: { enabled: false }` is doing real work. Stripe enables
 * Managed Payments by default, and it refuses any line item whose product has
 * no tax code. The alternative fix is to set a tax code on the product in the
 * dashboard (SaaS is `txcd_10103001`), which is worth doing if you want Managed
 * Payments - this opts out of it instead.
 */
async function checkoutBase(email: string, supabase: Client, tier: PaidTier) {
  return {
    // Only `mode` needs to stay a string literal. `as const` on the whole
    // object would freeze line_items readonly, which Stripe's types reject.
    mode: 'subscription' as const,
    managed_payments: { enabled: false },
    automatic_tax: { enabled: true },
    line_items: [{ price: await priceForTier(supabase, tier), quantity: 1 }],
    customer_email: email,
  }
}

/**
 * Put a space on xo or xp.
 *
 * Uses Stripe Checkout rather than collecting the IBAN ourselves. That is not
 * laziness: taking bank details directly drags the app into SEPA mandate
 * handling and a far wider PCI/GDPR surface, for a worse form than Stripe's.
 * The IBAN never touches this server.
 *
 * `tier` arrives from a form, which means it arrives from the internet, so it
 * is parsed rather than trusted. `asPaidTier` returning null is a refusal and
 * not a fallback to xo: a request naming a tier we do not sell is a bug or an
 * attack, and quietly selling them the cheap one would hide both. It rejects
 * `free` as well as nonsense, which is the same refusal for the same reason -
 * there is no price to build a session on, and leaving free out of the type is
 * what makes that a compile error rather than a throw in front of a customer.
 */
export async function startCheckout(
  slug: string,
  rawTier: string,
): Promise<ActionResult | never> {
  const tier = asPaidTier(rawTier)
  if (!tier) return { ok: false, error: 'Pick xo or xp' }

  const context = await requireTenant(slug)
  const { tenant, user } = context

  // Paying is an owner's decision - it commits somebody's bank account.
  if (!hasRole(context, ['owner'])) {
    return { ok: false, error: 'Only an owner can set up billing' }
  }

  /**
   * xp is not on sale yet.
   *
   * Checked on the server as well as hidden in the UI, because the UI hiding it
   * is a rendering decision and this is a Server Action - a public POST
   * endpoint that will happily be called with `tier=xp` by anybody who reads
   * the other button. See the note at the top of this file.
   */
  if (tier === 'xp' && !context.features.xp_sales) {
    return { ok: false, error: XP_NOT_ON_SALE }
  }

  // Stripe needs an address to send a receipt to, and to match this purchase to
  // the entitlement lookup afterwards - which is keyed on email.
  if (!user.email) {
    return { ok: false, error: 'Your account has no email address' }
  }

  /**
   * Already paying: send them to change plan, not to buy a second subscription.
   *
   * The decider would refuse the resulting `StartSubscription` with
   * `subscription_exists`, but by then the customer has been charged - the
   * webhook fires after Checkout has taken the money, and a domain rule that
   * throws at that point produces a paid invoice with no subscription attached
   * and a refund to process by hand. Checking here costs one query and means
   * the second purchase never starts.
   */
  const live = await liveSubscription(context)
  if (live) {
    return {
      ok: false,
      error:
        live.tier === tier
          ? `This space is already on ${tier}`
          : `This space is on ${live.tier}. Change plan instead of subscribing again.`,
    }
  }

  const origin = env.appUrl()

  const session = await stripe().checkout.sessions.create({
    ...(await checkoutBase(user.email, context.supabase, tier)),
    // This metadata is how the webhook knows which workspace a payment belongs
    // to, and it is the only link between Stripe and our tenant ids. It must be
    // set on the subscription too - the session is transient, but invoices and
    // disputes months later resolve through the subscription.
    metadata: { tenantId: tenant.id },
    subscription_data: { metadata: { tenantId: tenant.id } },
    success_url: `${origin}/t/${slug}/billing?checkout=success`,
    cancel_url: `${origin}/t/${slug}/billing?checkout=canceled`,
  })

  if (!session.url) {
    return { ok: false, error: 'Stripe did not return a checkout URL' }
  }

  redirect(session.url)
}

/** This space's subscription, as our read model has it, when it is still live. */
async function liveSubscription(
  context: TenantContext,
): Promise<{ stripeSubscriptionId: string | null; tier: Tier } | null> {
  const { data } = await context.supabase
    .from('subscriptions_read_model')
    .select('stripe_subscription_id, status, tier')
    .eq('tenant_id', context.tenant.id)
    .maybeSingle()

  if (!data) return null
  if (!['pending', 'active', 'past_due'].includes(data.status)) return null

  return {
    stripeSubscriptionId: data.stripe_subscription_id,
    tier: asTier(data.tier) ?? FALLBACK_TIER,
  }
}

/**
 * Send an owner to Stripe's billing portal to update their mandate or cancel.
 *
 * Cancellation is not a command we expose ourselves. If we cancelled locally,
 * Stripe would keep billing; letting Stripe own it means the webhook tells us,
 * and the log records what actually happened rather than what we intended.
 */
export async function openBillingPortal(slug: string): Promise<ActionResult | never> {
  const context = await requireTenant(slug)
  const { tenant } = context

  if (!hasRole(context, ['owner'])) {
    return { ok: false, error: 'Only an owner can manage billing' }
  }

  const { data, error } = await context.supabase
    .from('subscriptions_read_model')
    .select('stripe_customer_id')
    .eq('tenant_id', tenant.id)
    .maybeSingle()

  if (error) {
    return { ok: false, error: `Could not load billing details: ${error.message}` }
  }
  if (!data?.stripe_customer_id) {
    return { ok: false, error: 'This space has no subscription yet' }
  }

  const session = await stripe().billingPortal.sessions.create({
    customer: data.stripe_customer_id,
    return_url: `${env.appUrl()}/t/${slug}/billing`,
  })

  redirect(session.url)
}


// ---------------------------------------------------------------------------
// Changing plan
// ---------------------------------------------------------------------------
/**
 * Move a space between xo and xp, at the end of the paid period.
 *
 * Both directions wait, and that is the decision worth defending. Stripe will
 * happily swap a price immediately and prorate the difference, and every
 * product that does it fields the same support email: an invoice with four
 * lines on it, two of them negative, for an amount nobody can reconcile against
 * the price they clicked. Waiting until the period rolls over means the next
 * invoice says €10 and nothing else.
 *
 * It also makes downgrades honest in the other direction. Somebody who paid for
 * a month of xp keeps xp for the month they paid for - dropping them to xo the
 * instant they click would be charging for a month and delivering a week of it,
 * which is the same argument `cancel_at_period_end` already makes for cancelling.
 *
 * ---------------------------------------------------------------------------
 * Why a Stripe subscription schedule rather than a date in our database
 * ---------------------------------------------------------------------------
 * A `pending_tier` column plus a nightly job that applies it would be less code
 * and would be wrong in a specific, expensive way: the job and Stripe's renewal
 * are two clocks. Whichever ran second would bill a month at the old price and
 * serve it at the new one, or the reverse. Handing the schedule to Stripe means
 * the swap and the invoice are the same event, and our read model learns about
 * it from the webhook like every other billing fact.
 */
export async function scheduleTierChange(
  slug: string,
  rawTier: string,
): Promise<ActionResult | { ok: true; effectiveAt: string }> {
  const tier = asPaidTier(rawTier)
  if (!tier) return { ok: false, error: 'Pick xo or xp' }

  const context = await requireTenant(slug)

  if (!hasRole(context, ['owner'])) {
    return { ok: false, error: 'Only an owner can change the plan' }
  }

  // Moving *up* to xp is a sale. Moving down to xo is not, and stays available
  // whatever this flag says - somebody must always be able to leave a plan.
  if (tier === 'xp' && !context.features.xp_sales) {
    return { ok: false, error: XP_NOT_ON_SALE }
  }

  const live = await liveSubscription(context)
  if (!live?.stripeSubscriptionId) {
    return { ok: false, error: 'This space has no subscription to change' }
  }
  if (live.tier === tier) {
    return { ok: false, error: `This space is already on ${tier}` }
  }

  let effectiveAt: string

  try {
    const subscription = await stripe().subscriptions.retrieve(live.stripeSubscriptionId)

    if (subscription.cancel_at_period_end) {
      return {
        ok: false,
        error: 'This subscription is ending. Resume it before changing plan.',
      }
    }

    const periodEnd = subscriptionPeriodEnd(subscription)
    if (periodEnd === null) {
      // Without a period end there is nothing to schedule *to*, and guessing
      // would mean a change landing at an arbitrary moment. Better to say so.
      return {
        ok: false,
        error: 'Stripe has not set a billing period for this subscription yet',
      }
    }

    await applySchedule(subscription, await priceForTier(context.supabase, tier))
    effectiveAt = new Date(periodEnd * 1000).toISOString()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    return { ok: false, error: `Stripe refused the change: ${message}` }
  }

  // Recorded only after Stripe has accepted it. The other order would let a
  // failed schedule leave the billing page promising a move that will never
  // happen - see the note on `SubscriptionTierChangeScheduled`.
  const recorded = await record(context, { type: 'ScheduleTierChange', to: tier, effectiveAt })
  if (!recorded.ok) return recorded

  revalidatePath(`/t/${slug}/billing`)
  return { ok: true, effectiveAt }
}

/**
 * Put the new price on the subscription, starting when the current phase ends.
 *
 * `from_subscription` mints a schedule whose first phase is exactly what is
 * running now, which is what makes this safe: the current phase is copied
 * rather than described, so nothing about the live subscription is restated
 * here and there is nothing to get wrong. A second phase with no end date then
 * carries on forever at the new price.
 *
 * A subscription may only have one schedule, so a second plan change reuses the
 * existing one instead of creating another - which is also what makes changing
 * your mind work: booking xp and then booking xo overwrites phase two rather
 * than queuing both.
 *
 * `end_behavior: 'release'` hands the subscription back to normal billing when
 * the schedule runs out, rather than cancelling it. The default is `release`,
 * but it is stated because the alternative silently ends the subscription and
 * this is not a place to rely on a default.
 */
async function applySchedule(
  subscription: Stripe.Subscription,
  newPrice: string,
): Promise<void> {
  const existing =
    typeof subscription.schedule === 'string'
      ? subscription.schedule
      : subscription.schedule?.id

  const schedule = existing
    ? await stripe().subscriptionSchedules.retrieve(existing)
    : await stripe().subscriptionSchedules.create({
        from_subscription: subscription.id,
      })

  const current = schedule.phases[0]
  if (!current) {
    throw new Error('Stripe returned a schedule with no current phase')
  }

  await stripe().subscriptionSchedules.update(schedule.id, {
    end_behavior: 'release',
    phases: [
      {
        items: current.items.map((item) => ({
          price: typeof item.price === 'string' ? item.price : item.price.id,
          quantity: item.quantity ?? 1,
        })),
        start_date: current.start_date,
        end_date: current.end_date,
      },
      { items: [{ price: newPrice, quantity: 1 }] },
    ],
  })
}

/**
 * Call off a booked plan change.
 *
 * Releases the schedule, which is Stripe's word for "stop managing this
 * subscription and leave it running as it is". The subscription keeps its
 * current price and renews normally, which is precisely what "never mind" means
 * here.
 */
export async function cancelTierChange(
  slug: string,
): Promise<ActionResult | { ok: true }> {
  const context = await requireTenant(slug)

  if (!hasRole(context, ['owner'])) {
    return { ok: false, error: 'Only an owner can change the plan' }
  }

  const live = await liveSubscription(context)
  if (!live?.stripeSubscriptionId) {
    return { ok: false, error: 'This space has no subscription' }
  }

  try {
    const subscription = await stripe().subscriptions.retrieve(live.stripeSubscriptionId)
    const scheduleId =
      typeof subscription.schedule === 'string'
        ? subscription.schedule
        : subscription.schedule?.id

    // No schedule in Stripe is not an error. It means the change already landed
    // or was never made, and either way there is nothing left to call off - the
    // command below is a no-op when nothing is pending, so our side converges
    // on the same answer.
    if (scheduleId) await stripe().subscriptionSchedules.release(scheduleId)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    return { ok: false, error: `Stripe refused the change: ${message}` }
  }

  const recorded = await record(context, { type: 'CancelTierChange' })
  if (!recorded.ok) return recorded

  revalidatePath(`/t/${slug}/billing`)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Cancelling
// ---------------------------------------------------------------------------
/**
 * Stop this space's subscription renewing, or undo that.
 *
 * Sets `cancel_at_period_end` rather than deleting the subscription. Someone
 * who paid through the 25th keeps every page and block until the 25th - taking
 * access away the moment they click cancel would be charging for a month and
 * delivering three weeks of it.
 *
 * It is also what makes cancelling reversible. Until the period ends this is a
 * flag on a live subscription, so resuming is a flag flip rather than a new
 * purchase, with no gap in service and no second Checkout.
 *
 * ---------------------------------------------------------------------------
 * Which subscription? *This space's*, and only this space's.
 * ---------------------------------------------------------------------------
 * This used to look the customer up by email and cancel every subscription of
 * ours on the account. That was defensible when a subscription was an account
 * seat and they were interchangeable. It is not defensible now: an account can
 * hold an xo space and an xp space, and "cancel" on one of their billing pages
 * meant cancelling both. The subscription id comes off this tenant's own row.
 */
async function setCancelAtPeriodEnd(
  slug: string,
  cancel: boolean,
): Promise<ActionResult | { ok: true }> {
  const context = await requireTenant(slug)
  const { user } = context

  if (!hasRole(context, ['owner'])) {
    return { ok: false, error: 'Only an owner can manage billing' }
  }

  const live = await liveSubscription(context)
  if (!live?.stripeSubscriptionId) {
    return { ok: false, error: 'This space has no subscription' }
  }

  try {
    const subscription = await stripe().subscriptions.retrieve(live.stripeSubscriptionId)

    if (subscription.cancel_at_period_end === cancel) {
      return {
        ok: false,
        error: cancel
          ? 'This subscription is already ending'
          : 'This subscription is not cancelled',
      }
    }

    await stripe().subscriptions.update(live.stripeSubscriptionId, {
      cancel_at_period_end: cancel,
    })

    // Refresh the account mirror straight away. Without this the picker would
    // still read "renews on the 25th" immediately after cancelling, until
    // tonight's job caught up.
    if (user.email) {
      await syncUserEntitlement(
        createAdminClient() as unknown as typeof context.supabase,
        user.id,
        user.email,
      )
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    return { ok: false, error: `Stripe refused the change: ${message}` }
  }

  revalidatePath('/tenants')
  revalidatePath(`/t/${slug}/billing`)
  return { ok: true }
}

export async function cancelSubscription(slug: string): Promise<ActionResult | { ok: true }> {
  return setCancelAtPeriodEnd(slug, true)
}

export async function resumeSubscription(slug: string): Promise<ActionResult | { ok: true }> {
  return setCancelAtPeriodEnd(slug, false)
}

/**
 * Append a billing command for this space.
 *
 * The webhook has its own copy of this - see `dispatch` in the route - and the
 * duplication is deliberate rather than a missed extraction: that one runs as
 * the service role against a tenant id it recovered from signed Stripe
 * metadata, this one runs as a signed-in owner against a tenant the session
 * already proved they belong to. Sharing a helper would mean one function whose
 * safety depends on which caller reached it.
 */
async function record(
  context: TenantContext,
  command: BillingCommand,
): Promise<ActionResult | { ok: true }> {
  try {
    await executeCommand({
      supabase: context.supabase,
      decider: billingDecider,
      tenantId: context.tenant.id,
      streamId: subscriptionStreamId(context.tenant.id),
      command,
      // Unlike every other billing event, this one has a person behind it - an
      // owner clicked a button. `actor_id` is nullable precisely so "the system
      // did this" can be stated; here it should not be.
      metadata: { actorId: context.user.id, source: 'billing-action' },
    })

    await runProjection(context.supabase, billingProjection, context.tenant.id)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    return { ok: false, error: message }
  }

  return { ok: true }
}
