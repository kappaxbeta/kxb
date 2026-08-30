import 'server-only'
import type Stripe from 'stripe'
import type { Client } from '@/es/store'
import { mintPromoCode } from '@/domain/promo/mint'

/**
 * The two grants the webhook makes: a bought skin, and the subscriber's
 * monthly voucher. Both run under the service role, because a webhook has no
 * session - the trust was established by the Stripe signature upstream.
 */

/**
 * A paid skin checkout, turned into ownership.
 *
 * The metadata is ours (set in startSkinCheckout) and the session arrives
 * verified. `payment_status` is checked because a SEPA checkout "completes"
 * before the money moves - the async_payment_succeeded event re-enters here
 * when it does. A duplicate grant is a no-op rather than an error, which is
 * what makes redeliveries harmless.
 */
export async function grantPurchasedSkin(
  supabase: Client,
  session: Stripe.Checkout.Session,
): Promise<boolean> {
  const skinId = session.metadata?.skinId
  const userId = session.metadata?.userId
  if (!skinId || !userId) return false

  if (session.payment_status !== 'paid') {
    // Not a failure - the money is still in flight and a later event returns.
    return true
  }

  const { error } = await supabase
    .from('skin_ownership')
    .upsert({ user_id: userId, skin_id: skinId, via: 'purchase' }, { ignoreDuplicates: true })

  if (error) {
    // Throwing is correct here, unlike the voucher below: the customer has
    // paid and holds nothing, so a 500 makes Stripe redeliver until the grant
    // lands.
    throw new Error(`skin grant failed for ${userId} / ${skinId}: ${error.message}`)
  }

  return true
}

/**
 * The subscription's skin perk: whoever pays gets one voucher free, monthly.
 *
 * Called from the webhook on `invoice.paid` - the one moment "who pays" is a
 * fact rather than a guess, because the invoice just settled. Grant-per-paid-
 * invoice *is* the monthly cadence: a subscription bills monthly, so no clock
 * of our own to drift, and a paused subscription correctly stops granting.
 *
 * Idempotent twice over. The webhook's event-id claim stops a redelivered
 * event, and the unique `stripe_invoice_id` column stops the same invoice
 * arriving under two event ids (which Stripe permits itself) - the second
 * insert conflicts and one month stays one voucher.
 *
 * The payer is resolved through user_entitlements, the read model that maps a
 * Stripe customer to an account. A customer with no row yet (the entitlement
 * sync lagging the very first invoice) simply gets no voucher this month -
 * logged, not thrown, because failing the webhook over a perk would make
 * Stripe retry a *payment* event for the sake of a costume.
 */
export async function grantSubscriptionVoucher(
  supabase: Client,
  invoice: Stripe.Invoice,
): Promise<void> {
  const invoiceId = invoice.id
  if (!invoiceId) return

  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
  if (!customerId) return

  const { data: entitlement } = await supabase
    .from('user_entitlements')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()

  if (!entitlement) {
    console.warn(`[skins] no account for customer ${customerId}; skipping voucher grant`)
    return
  }

  const { error } = await supabase.from('skin_vouchers').insert({
    code: mintPromoCode('SKIN'),
    owner_id: entitlement.user_id,
    created_by: entitlement.user_id,
    source: 'subscription',
    stripe_invoice_id: invoiceId,
    // Granted straight into the pocket: a subscriber's monthly voucher has no
    // in-flight phase, because there is nobody to redeem it from.
    redeemed_at: new Date().toISOString(),
  })

  if (error && error.code !== '23505') {
    console.warn(`[skins] voucher grant for invoice ${invoiceId} failed: ${error.message}`)
  }
}
