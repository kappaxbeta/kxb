'use client'

import { useState, useTransition } from 'react'
import {
  cancelSubscription,
  cancelTierChange,
  openBillingPortal,
  resumeSubscription,
  scheduleTierChange,
  startCheckout,
} from '@/domain/billing/actions'
import type { Entitlement } from '@/domain/billing/entitlement'
import type { PaymentView, SubscriptionView } from '@/domain/billing/queries'
import {
  PAID_TIERS,
  type Tier,
  tierPricePerMonth,
} from '@/domain/billing/tiers'
import { RedeemCode } from '@/app/components/redeem-code'
import { billingDict } from '@/app/i18n/billing'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * Billing status and the two buttons that hand off to Stripe.
 *
 * The copy here does more work than the code. SEPA's multi-day settlement means
 * the honest status after checkout is "we have your mandate, the money is on its
 * way" - and saying that plainly prevents the support ticket that a green
 * "Subscribed!" would generate when the first debit bounces a week later.
 */

/**
 * The colour each state wears. The words moved to the dictionary; a hue is not
 * a language, and keeping them together would have meant "Active" being green
 * in English and uncoloured in German.
 */
const STATUS_TONE: Record<
  SubscriptionView['status'],
  'neutral' | 'good' | 'warn' | 'bad'
> = {
  none: 'neutral',
  pending: 'neutral',
  active: 'good',
  past_due: 'warn',
  suspended: 'bad',
  canceled: 'bad',
}

const TONE_CLASS = {
  neutral: 'border-line',
  good: 'border-accent/50',
  warn: 'border-amber-500/60',
  bad: 'border-red-500/60',
} as const

export function BillingPanel({
  slug,
  tenantId,
  subscription,
  isOwner,
  checkout,
  payments,
  entitlement,
  canRedeem,
  xpOnSale,
}: {
  slug: string
  /** Recorded against a redemption made from here. Provenance, not scope. */
  tenantId: string
  subscription: SubscriptionView
  isOwner: boolean
  checkout: 'success' | 'canceled' | null
  payments: PaymentView[]
  entitlement: Entitlement
  /** Whether a promo code would still get this account anywhere. */
  canRedeem: boolean
  /** Whether the xp plan is buyable yet. See the `xp_sales` flag. */
  xpOnSale: boolean
}) {
  const refusal = useRefusal()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const locale = useLocale()
  const t = billingDict(locale)
  const [tab, setTab] = useState<'status' | 'history'>('status')

  const status = t.status[subscription.status]
  const tone = STATUS_TONE[subscription.status]

  /**
   * Run a billing action and surface anything it refuses.
   *
   * Checkout redirects on success and never returns, so for those the only
   * thing that can arrive here is a failure. The plan-change actions do return
   * on success, which is why this tolerates `ok: true` rather than typing the
   * result as a refusal - they revalidate the page and the new state simply
   * renders.
   */
  function run(action: () => Promise<{ ok: boolean; error?: string } | void>) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (result && !result.ok) setError(refusal(result.error ?? t.somethingWrong))
    })
  }

  return (
    <div className="max-w-2xl">
      {checkout === 'success' && (
        <p className="mb-6 rounded-lg border border-accent/50 bg-surface-raised px-4 py-3 text-sm">
          {t.checkoutDone}
        </p>
      )}
      {checkout === 'canceled' && (
        <p className="mb-6 rounded-lg border border-line px-4 py-3 text-sm text-ink-muted">
          {t.checkoutCancelled}
        </p>
      )}

      <div
        role="tablist"
        aria-label={t.title}
        className="mb-4 flex gap-1 rounded-lg border border-line p-1"
      >
        <BillingTab
          active={tab === 'status'}
          onClick={() => setTab('status')}
          label={t.tabs.status}
        />
        <BillingTab
          active={tab === 'history'}
          onClick={() => setTab('history')}
          label={
            t.tabs.history +
            (payments.length > 0 ? fill(t.historyCount, { n: payments.length }) : '')
          }
        />
      </div>

      {tab === 'history' ? (
        <PaymentHistory payments={payments} />
      ) : (
      <>
      <AccountStatus
        entitlement={entitlement}
        slug={slug}
        tenantId={tenantId}
        canRedeem={canRedeem}
      />
      <section className={`rounded-lg border bg-surface-raised p-5 ${TONE_CLASS[tone]}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">
            {status.label}
            {subscription.tier && (
              <span className="ml-2 rounded bg-surface px-1.5 py-0.5 font-mono text-xs text-ink-muted">
                {subscription.tier}
              </span>
            )}
          </h2>
          {subscription.tier && (
            <span className="font-mono text-sm text-ink-muted">
              {tierPricePerMonth(subscription.tier)}
            </span>
          )}
        </div>

        <p className="mt-2 text-sm text-ink-muted">{status.detail}</p>

        {subscription.lastFailureReason && (
          <p className="mt-3 rounded border border-line bg-surface px-3 py-2 text-sm">
            <span className="text-ink-muted">{t.bankSaid}</span>
            {subscription.lastFailureReason}
          </p>
        )}

        {subscription.currentPeriodEnd && subscription.status === 'active' && (
          <p className="mt-3 text-xs text-ink-muted">
            {fill(t.paidThrough, {
              date: new Date(subscription.currentPeriodEnd).toLocaleDateString(locale),
            })}
          </p>
        )}

        <div className="mt-4 min-h-5">
          {error && (
            <p role="alert" className="text-sm text-red-500">
              {error}
            </p>
          )}
        </div>

        {isOwner ? (
          subscription.status === 'none' || subscription.status === 'canceled' ? (
            <PickTier
              slug={slug}
              isPending={isPending}
              xpOnSale={xpOnSale}
              run={run}
            />
          ) : (
            <ChangeTier
              slug={slug}
              subscription={subscription}
              isPending={isPending}
              xpOnSale={xpOnSale}
              run={run}
            />
          )
        ) : (
          <p className="text-sm text-ink-muted">
            {t.ownerOnly}
          </p>
        )}
      </section>
      </>
      )}

      <p className="mt-6 text-xs text-ink-muted">
        {t.stripeNote}
      </p>
    </div>
  )
}


function BillingTab({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex-1 rounded-md px-3 py-1.5 text-sm transition ${
        active ? 'bg-surface-raised font-medium' : 'text-ink-muted hover:text-ink'
      }`}
    >
      {label}
    </button>
  )
}

type Run = (action: () => Promise<{ ok: boolean; error?: string } | void>) => void

/**
 * The first choice: xo or xp.
 *
 * Both cards are always shown, with what each includes, rather than a single
 * "Subscribe" button and a plan picker on Stripe's side. Somebody deciding
 * between two prices should be able to see what the €5 difference buys without
 * leaving the page they are on, and Stripe's hosted picker cannot say
 * "the XP editor" in our words.
 */
function PickTier({
  slug,
  isPending,
  xpOnSale,
  run,
}: {
  slug: string
  isPending: boolean
  /** Is the xp plan buyable yet? See the `xp_sales` flag. */
  xpOnSale: boolean
  run: Run
}) {
  const locale = useLocale()
  const t = billingDict(locale)
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {PAID_TIERS.map((tier) => {
        /*
          xp before launch: shown, priced, and not buyable.

          Shown rather than hidden, because the reader is deciding between two
          plans and needs to know the second one is coming - a page that
          offered only xo would read as "this is all there is", and the xo
          card's own copy says "the XP suite" is what it excludes. A card that
          explains the gap is more honest than an absence.
        */
        const soon = tier === 'xp' && !xpOnSale
        return (
          <div
            key={tier}
            className={`flex flex-col rounded-lg border bg-surface p-4 ${
              soon ? 'border-dashed border-line' : 'border-line'
            }`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-sm font-semibold">{tier}</span>
              <span className="font-mono text-sm text-ink-muted">
                {tierPricePerMonth(tier)}
              </span>
            </div>
            <p className="mt-1 text-sm text-ink-muted">{t.tiers[tier].tagline}</p>
            <ul className="mt-3 flex-1 space-y-1 text-xs text-ink-muted">
              {t.tiers[tier].includes.map((line) => (
                <li key={line}>· {line}</li>
              ))}
            </ul>
            {soon ? (
              <p className="mt-4 rounded-lg border border-line px-4 py-2 text-center text-sm text-ink-muted">
                {t.plan.comingSoon}
              </p>
            ) : (
              <button
                type="button"
                disabled={isPending}
                onClick={() => run(() => startCheckout(slug, tier))}
                className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {isPending ? t.plan.openingStripe : fill(t.plan.choose, { tier })}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Moving between plans, and stopping.
 *
 * Everything here lands at the end of the paid period rather than now, and the
 * copy says so on every button. That is not hedging - it is the single fact
 * that stops this being confusing. Somebody who reads "Move to xp" and expects
 * the XP editor to appear immediately has been misled by the button, and will
 * be back on this page in thirty seconds wondering what broke.
 */
function ChangeTier({
  slug,
  subscription,
  isPending,
  xpOnSale,
  run,
}: {
  slug: string
  subscription: SubscriptionView
  isPending: boolean
  xpOnSale: boolean
  run: Run
}) {
  const locale = useLocale()
  const t = billingDict(locale)
  const [confirming, setConfirming] = useState(false)

  const current = subscription.tier
  // The move up to xp disappears while xp is not on sale; the move down to xo
  // never does, because somebody must always be able to leave a plan.
  const upgrade: Tier | null = current === 'xo' ? 'xp' : null
  const other: Tier | null =
    current === 'xo' ? (xpOnSale ? 'xp' : null) : current === 'xp' ? 'xo' : null

  const endOfPeriod = subscription.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString(locale, {
        day: 'numeric',
        month: 'long',
      })
    : t.plan.endOfPeriod

  // A booked change owns this section: offering a second move beside it would
  // ask somebody to reason about two futures at once.
  if (subscription.pendingTier) {
    const when = subscription.pendingTierAt
      ? new Date(subscription.pendingTierAt).toLocaleDateString(locale, {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : endOfPeriod

    return (
      <div className="rounded-lg border border-line bg-surface p-4">
        <p className="text-sm">
          {fill(t.plan.movingTo, {
            tier: subscription.pendingTier,
            when,
            price: tierPricePerMonth(subscription.pendingTier),
          })}
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          {fill(t.plan.nothingChanges, { tier: current ?? '' })}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => cancelTierChange(slug))}
            className="rounded-lg border border-line px-3 py-1.5 text-sm transition hover:bg-surface-raised disabled:opacity-50"
          >
            {isPending ? t.plan.working : fill(t.plan.stayOn, { tier: current ?? '' })}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => openBillingPortal(slug))}
            className="rounded-lg border border-line px-3 py-1.5 text-sm transition hover:bg-surface-raised disabled:opacity-50"
          >
            {t.plan.manage}
          </button>
        </div>
      </div>
    )
  }

  // Winding down. Changing plan is refused server-side while this is set - a
  // subscription that ends on the 25th has no next period to move into - so the
  // only thing offered is the way back.
  if (subscription.cancelAtPeriodEnd) {
    return (
      <div className="rounded-lg border border-amber-500/60 bg-surface p-4">
        <p className="text-sm">{fill(t.plan.endsOn, { date: endOfPeriod })}</p>
        <p className="mt-1 text-xs text-ink-muted">{t.plan.endsNote}</p>
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(() => resumeSubscription(slug))}
          className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? t.plan.resuming : t.plan.resume}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/*
        On xo, with xp not yet on sale: say so where the upgrade button would
        have been. Silence here reads as "xo is all there is", which is the one
        thing this card must not imply while the xo card itself lists "the XP
        suite" as the thing it does not include.
      */}
      {upgrade && !xpOnSale && (
        <p className="rounded-lg border border-dashed border-line bg-surface px-4 py-3 text-sm text-ink-muted">
          {fill(t.plan.xpSoon, { price: tierPricePerMonth('xp') })}
        </p>
      )}

      {other && (
        <div className="rounded-lg border border-line bg-surface p-4">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-medium">
              {other === 'xp' ? t.plan.moveUp : t.plan.moveDown}
            </span>
            <span className="font-mono text-sm text-ink-muted">
              {tierPricePerMonth(other)}
            </span>
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            {t.tiers[other].tagline} {other === 'xo' && t.plan.suiteGoes}
          </p>
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => scheduleTierChange(slug, other))}
            className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {isPending
              ? t.plan.working
              : fill(t.plan.switchOn, { tier: other, when: endOfPeriod })}
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(() => openBillingPortal(slug))}
          className="rounded-lg border border-line px-4 py-2 text-sm transition hover:bg-surface disabled:opacity-50"
        >
          {isPending ? t.plan.openingStripe : t.plan.manage}
        </button>

        {confirming ? (
          <>
            <span className="text-sm text-ink-muted">
              {fill(t.plan.keepUntil, { date: endOfPeriod })}
            </span>
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(() => cancelSubscription(slug))}
              className="rounded-lg border border-red-500/60 px-3 py-1.5 text-sm text-red-500 transition hover:bg-red-500/10 disabled:opacity-50"
            >
              {isPending ? t.plan.cancelling : t.plan.yesCancel}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-sm text-ink-muted hover:text-ink"
            >
              {t.plan.keepIt}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="text-sm text-ink-muted underline-offset-2 hover:text-ink hover:underline"
          >
            {t.plan.cancel}
          </button>
        )}
      </div>
    </div>
  )
}

const PAYMENT_TONE: Record<string, string> = {
  paid: 'text-emerald-600',
  open: 'text-amber-600',
  uncollectible: 'text-red-500',
  void: 'text-ink-muted',
}

/**
 * Every invoice Stripe has for this email, newest first.
 *
 * Deliberately shows non-paid rows too. An `open` invoice is the thing a
 * customer needs to see when they are wondering why the workspace went
 * read-only, and hiding anything that is not a clean payment turns this from a
 * record into marketing.
 */
function PaymentHistory({ payments }: { payments: PaymentView[] }) {
  const locale = useLocale()
  const t = billingDict(locale).payments

  if (payments.length === 0) {
    return (
      <section className="rounded-lg border border-line bg-surface-raised p-5">
        <p className="text-sm text-ink-muted">
          {t.empty}
        </p>
      </section>
    )
  }

  return (
    <section className="overflow-hidden rounded-lg border border-line bg-surface-raised">
      <ul className="divide-y divide-line">
        {payments.map((payment) => (
          <li key={payment.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="font-mono text-xs text-ink-muted">
              {new Date(payment.paidAt).toLocaleDateString(locale)}
            </span>
            <span className="text-sm font-medium">
              {/*
                Formatted in the reader's locale, which moves the symbol and the
                separators: €12.00 in English, 12,00 € in German. The currency
                itself is Stripe's and is never guessed at.
              */}
              {new Intl.NumberFormat(locale, {
                style: 'currency',
                currency: payment.currency.toUpperCase(),
              }).format(payment.amountCents / 100)}
            </span>
            <span
              className={`text-xs ${PAYMENT_TONE[payment.status] ?? 'text-ink-muted'}`}
            >
              {payment.status}
            </span>
            {payment.number && (
              <span className="font-mono text-xs text-ink-muted">{payment.number}</span>
            )}
            <span className="ml-auto flex gap-3 text-xs">
              {payment.invoiceUrl && (
                <a
                  href={payment.invoiceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent hover:underline"
                >
                  {t.receipt}
                </a>
              )}
              {payment.pdfUrl && (
                <a
                  href={payment.pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-ink-muted hover:text-ink hover:underline"
                >
                  {t.pdf}
                </a>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}


/** The colour, for the same reason `STATUS_TONE` is separate. */
const ENTITLEMENT_TONE: Record<Entitlement['status'], keyof typeof TONE_CLASS> = {
  none: 'neutral',
  active: 'good',
  trialing: 'good',
  past_due: 'warn',
  canceled: 'bad',
  expired: 'bad',
}

/**
 * The account, as opposed to this one space.
 *
 * Since tiers, a subscription belongs to a space and the card below is where it
 * is bought, changed and cancelled. What is left for this section is the things
 * that are genuinely facts about the *person*: how many spaces they own, a
 * redeemed free month, and a legacy account seat if they still hold one.
 *
 * It stays above the space's own card, and stays first, because it is the one
 * that explains a page that otherwise makes no sense: an account set up by hand
 * in the Stripe dashboard has no `subscriptions_read_model` row at all, and
 * without this section its owner would be looking at a billing page that says
 * they have never paid.
 */
function AccountStatus({
  entitlement,
  slug,
  tenantId,
  canRedeem,
}: {
  entitlement: Entitlement
  slug: string
  tenantId: string
  canRedeem: boolean
}) {
  const locale = useLocale()
  const t = billingDict(locale).account
  const tone = ENTITLEMENT_TONE[entitlement.status]

  return (
    <section className={`mb-4 rounded-lg border bg-surface-raised p-5 ${TONE_CLASS[tone]}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">
          {fill(t.heading, { status: t.states[entitlement.status] })}
        </h2>
        <span className="font-mono text-sm text-ink-muted">
          {entitlement.used === 1
            ? t.oneSpace
            : fill(t.manySpaces, { n: entitlement.used })}
          {entitlement.unpaid > 0 && fill(t.withoutPlan, { n: entitlement.unpaid })}
        </span>
      </div>

      {entitlement.currentPeriodEnd ? (
        <p className="mt-2 text-sm text-ink-muted">
          {entitlement.cancelAtPeriodEnd
            ? t.cancelledEnds
            : entitlement.active
              ? t.renews
              : t.wasValid}{' '}
          <span className="font-medium text-ink">
            {new Date(entitlement.currentPeriodEnd).toLocaleDateString(locale, {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </span>
          .
        </p>
      ) : entitlement.grantUntil ? (
        /*
          A redeemed month, said in its own words.

          The branch above is about a Stripe period and cannot describe this:
          there is no renewal, no card, and nothing to cancel. Falling through to
          "no active subscription" - which is technically true - would tell
          somebody whose space is working perfectly well that it should not be.
        */
        <p className="mt-2 text-sm text-ink-muted">
          {entitlement.granted ? t.freeMonth : t.freeMonthEnded}
          {entitlement.grantTier && (
            <span className="font-mono"> ({entitlement.grantTier})</span>
          )}
          {entitlement.granted ? t.runsUntil : t.endedOn}
          <span className="font-medium text-ink">
            {new Date(entitlement.grantUntil).toLocaleDateString(locale, {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </span>
          .{' '}
          {entitlement.granted ? t.grantedNote : t.lapsedNote}
        </p>
      ) : (
        <p className="mt-2 text-sm text-ink-muted">
          {t.noAccountPlan}
        </p>
      )}

      <p className="mt-2 text-xs text-ink-muted">
        {entitlement.canCreate ? t.canCreate : t.atLimit}
      </p>

      {/*
        The code box, inside the space rather than only on the picker.

        This is where an owner ends up when their space has gone read-only, and
        it is the page that told them why - so it has to be the page that can do
        something about it. `canRedeem` is decided on the server and is false
        once this account has had its month, which is why the box is absent
        rather than present and certain to refuse.

        `source: 'space'` is what makes that story readable afterwards: a
        redemption from here is a different event from one on the way in, and
        the backoffice splits them.
      */}
      {canRedeem && (
        <div className="mt-4 border-t border-line pt-4">
          <RedeemCode source="space" slug={slug} tenantId={tenantId} />
        </div>
      )}
    </section>
  )
}
