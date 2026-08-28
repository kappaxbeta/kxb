import 'server-only'
import { asSubscriptionStatus } from '@/lib/supabase/types'
import { isWritable, type SubscriptionStatus } from '@/domain/billing/aggregate'
import { asTier, type Tier } from '@/domain/billing/tiers'
import type { Client } from '@/es/store'

export interface SubscriptionView {
  status: SubscriptionStatus
  amountCents: number | null
  currency: string | null
  currentPeriodEnd: string | null
  lastFailureReason: string | null
  /** Derived, not stored: the one question the write path asks. */
  writable: boolean
  /**
   * Which tier this space's own subscription bought. Null when it has none.
   *
   * Not the same as `context.tenant.tier`, and the two are deliberately kept
   * apart. That one is "what may this space do", which a promo grant or a
   * grandfathered account seat can answer on its own. This one is "what is this
   * space paying for", which only a subscription can answer - and it is the one
   * the billing page has to show, because it is the only one anybody can change
   * from here.
   */
  tier: Tier | null
  /** A booked move to another tier, and when it lands. Null when none is booked. */
  pendingTier: Tier | null
  pendingTierAt: string | null
  /** Still live, still writable, but not renewing. */
  cancelAtPeriodEnd: boolean
}

/**
 * A workspace with no subscription row yet reads as `none`.
 *
 * `none` is writable, which is not an oversight. A workspace is created before
 * anyone has been near Stripe, and locking it at that moment would mean the
 * owner cannot even see what they are being asked to pay for. Charging is a
 * prompt, not a gate, until a subscription exists and then fails.
 */
const UNSUBSCRIBED: SubscriptionView = {
  status: 'none',
  amountCents: null,
  currency: null,
  currentPeriodEnd: null,
  lastFailureReason: null,
  writable: true,
  tier: null,
  pendingTier: null,
  pendingTierAt: null,
  cancelAtPeriodEnd: false,
}

export async function getSubscription(
  supabase: Client,
  tenantId: string,
): Promise<SubscriptionView> {
  const { data, error } = await supabase
    .from('subscriptions_read_model')
    // One string literal, not a concatenation: supabase-js infers the row type
    // from the literal, and `'a, b' + 'c'` widens it to `string` and takes the
    // whole result down to GenericStringError with it.
    .select(
      'status, amount_cents, currency, current_period_end, last_failure_reason, tier, pending_tier, pending_tier_at, cancel_at_period_end',
    )
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load subscription: ${error.message}`)
  }
  if (!data) return UNSUBSCRIBED

  return {
    status: asSubscriptionStatus(data.status),
    amountCents: data.amount_cents,
    currency: data.currency,
    currentPeriodEnd: data.current_period_end,
    lastFailureReason: data.last_failure_reason,
    writable: isWritable(asSubscriptionStatus(data.status)),
    tier: asTier(data.tier),
    pendingTier: asTier(data.pending_tier),
    pendingTierAt: data.pending_tier_at,
    cancelAtPeriodEnd: data.cancel_at_period_end === true,
  }
}

/**
 * Payment history, straight from Stripe.
 *
 * Not from our event log, and not cached. The log records what our product
 * decided; the invoice list records what a bank actually did, including things
 * that never passed through us - a subscription created by hand in the
 * dashboard, a refund issued by support, a chargeback. Showing a customer their
 * payments from a mirror means eventually showing them something their bank
 * statement disagrees with.
 *
 * Keyed by email rather than by workspace, because that is how a person thinks
 * about "what have I paid" when they own several.
 */
export interface PaymentView {
  id: string
  /** ISO date. */
  paidAt: string
  amountCents: number
  currency: string
  /** paid | open | void | uncollectible | draft */
  status: string
  /** Invoice number, when Stripe assigned one. */
  number: string | null
  /** Hosted invoice page, so people can get their own receipt. */
  invoiceUrl: string | null
  pdfUrl: string | null
}

export async function listPaymentsForEmail(email: string): Promise<PaymentView[]> {
  const { stripe } = await import('@/lib/stripe')

  const customers = await stripe().customers.list({
    email: email.trim().toLowerCase(),
    limit: 20,
  })

  const payments: PaymentView[] = []

  for (const customer of customers.data) {
    const invoices = await stripe().invoices.list({ customer: customer.id, limit: 100 })

    for (const invoice of invoices.data) {
      // Drafts are not payments - they are Stripe's scratch space before an
      // invoice is finalised, and showing them reads as a phantom charge.
      if (invoice.status === 'draft') continue

      payments.push({
        id: invoice.id ?? `${customer.id}-${invoice.created}`,
        paidAt: new Date(
          (invoice.status_transitions?.paid_at ?? invoice.created) * 1000,
        ).toISOString(),
        amountCents: invoice.amount_paid || invoice.amount_due,
        currency: invoice.currency,
        status: invoice.status ?? 'unknown',
        number: invoice.number ?? null,
        invoiceUrl: invoice.hosted_invoice_url ?? null,
        pdfUrl: invoice.invoice_pdf ?? null,
      })
    }
  }

  // Newest first. Stripe pages per customer, so a person with two customer
  // records would otherwise get two interleaved runs.
  payments.sort((a, b) => b.paidAt.localeCompare(a.paidAt))

  return payments
}
