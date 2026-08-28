import type { Metadata } from 'next'
import { BillingPanel } from '@/app/t/[slug]/billing/billing-panel'
import { readEntitlementRefreshingIfInactive } from '@/domain/billing/entitlement'
import { createAdminClient } from '@/lib/supabase/admin'
import { listPaymentsForEmail } from '@/domain/billing/queries'
import { mayRedeem } from '@/domain/promo/redeem'
import { hasRole, requireTenant } from '@/lib/tenant'
import { billingDict } from '@/app/i18n/billing'
import { readLocale } from '@/app/i18n/preference'

/** The tab. `generateMetadata`, because a static export cannot be two languages. */
export async function generateMetadata(): Promise<Metadata> {
  return { title: billingDict(await readLocale()).title }
}

export const dynamic = 'force-dynamic'

export default async function BillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ checkout?: string }>
}) {
  const { slug } = await params
  const { checkout } = await searchParams

  // One call, not two. requireTenant resolves the slug, checks membership,
  // loads the workspace and reads its subscription - four round trips - so
  // calling it twice doubled the page's latency for identical data.
  const context = await requireTenant(slug)
  const { user, tenant } = context

  if (tenant.role !== 'owner') {
    return <>{billingDict(await readLocale()).goToDashboard}</>
  }

  // Straight from Stripe rather than our log: this has to agree with their bank
  // statement, including subscriptions that never went through our Checkout.
  const [payments, entitlement, canRedeem] = await Promise.all([
    user.email ? listPaymentsForEmail(user.email) : Promise.resolve([]),
    // The account-level truth. The per-workspace subscription row below only
    // exists for workspaces bought through our Checkout, so on its own it
    // reports "no subscription" for anyone set up directly in Stripe.
    readEntitlementRefreshingIfInactive(
      context.supabase,
      createAdminClient() as unknown as typeof context.supabase,
      user.id,
      user.email,
    ),
    // Whether to offer the code box at all. The same question the picker asks,
    // through the same function, so the offer cannot appear in one place and
    // not the other for the same account.
    mayRedeem(context.supabase, user.id),
  ])

  return (
    <BillingPanel
      slug={slug}
      tenantId={tenant.id}
      subscription={context.subscription}
      isOwner={hasRole(context, ['owner'])}
      payments={payments}
      entitlement={entitlement}
      canRedeem={canRedeem}
      // Whether the €10 plan can be bought at all. The panel only decides what
      // to render from it; `startCheckout` and `scheduleTierChange` check the
      // same flag themselves, because a Server Action is a public endpoint and
      // a hidden button is not a rule.
      xpOnSale={context.features.xp_sales}
      // Stripe bounces back here after Checkout. `success` means the mandate was
      // accepted, NOT that money has moved - the debit is still days away. The
      // panel is careful to say so rather than showing a green tick over an
      // unsettled payment.
      checkout={checkout === 'success' ? 'success' : checkout === 'canceled' ? 'canceled' : null}
    />
  )
}
