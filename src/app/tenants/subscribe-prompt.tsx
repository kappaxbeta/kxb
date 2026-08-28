'use client'

import { useState, useTransition } from 'react'
import { fill } from '@/app/i18n/fill'
import { spacesDict } from '@/app/i18n/spaces'
import { DEFAULT_LOCALE, type Locale } from '@/domain/i18n/locale'
import { RedeemCode } from '@/app/components/redeem-code'
import type { Entitlement } from '@/domain/billing/entitlement'
import { PAID_TIERS, tierPricePerMonth } from '@/domain/billing/tiers'
import { claimFreeMonth } from '@/domain/promo/actions'
import { billingDict } from '@/app/i18n/billing'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * What a space costs, on the workspace picker.
 *
 * ---------------------------------------------------------------------------
 * This used to be a Subscribe button, and losing the button is the point
 * ---------------------------------------------------------------------------
 * The old flow sold a seat here: you paid €20, and that bought the *right* to
 * make a space. It could not survive tiers, because the thing being bought is
 * now a property of a space - xo or xp - and there is no space yet to have one.
 *
 * So the order inverted. Making a space is free, it is read-only until it has a
 * plan, and the plan is chosen on its own billing page where the choice has
 * something to attach to. What is left for this panel is the honest job of
 * saying what that will cost before somebody starts, rather than after.
 *
 * The two people this is shown to still need different sentences: someone who
 * has never paid, and someone with spaces already waiting for a plan. Telling
 * the second one what a space costs is not useful - they know - so they get
 * told what to do about the ones they have.
 */
export function SubscribePrompt({
  entitlement,
  /**
   * The prices, without the box or the sentences around them.
   *
   * For the last panel of the first-run tour, which has already said what a
   * space costs in its own words. Dropping the paragraph rather than repeating
   * it keeps that sentence written in exactly one place per surface - and it is
   * still the right split now that this component has both languages too.
   */
  bare = false,
  /**
   * The reader's language. A prop for the reason `CreateTenantForm` gives:
   * both callers sit outside a workspace, so there is no shell to read it from.
   */
  locale = DEFAULT_LOCALE,
  /**
   * Whether a code would get this account anywhere.
   *
   * Decided on the server - it needs the redemption rows and the Stripe mirror -
   * and passed down rather than asked for here, so the box is absent rather
   * than present-and-doomed. Defaults to false: a caller that has not thought
   * about it should not be advertising an offer it has not checked.
   */
  canRedeem = false,
  /**
   * Whether this account can still take its free month, with no code at all.
   *
   * A separate question from `canRedeem`, and asked separately because the two
   * are about to diverge: `canRedeem` is true while *any* tier is still open,
   * so an xo customer who has never tried xp keeps their code box. This one is
   * about xo specifically, which is the only tier given away without a code.
   *
   * Same default and the same reasoning: a caller that has not checked should
   * not be advertising a month it has not established this account can have.
   */
  canClaim = false,
}: {
  entitlement: Entitlement
  bare?: boolean
  locale?: Locale
  canRedeem?: boolean
  canClaim?: boolean
}) {
  const refusal = useRefusal()
  const t = spacesDict(locale).plan
  const waiting = entitlement.unpaid > 0
  const [error, setError] = useState<string | null>(null)
  const [granted, setGranted] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function claim() {
    setError(null)
    startTransition(async () => {
      const result = await claimFreeMonth({ source: 'picker' })
      if (result.ok) setGranted(result.grant.until)
      else setError(refusal(result.error))
    })
  }

  return (
    <section
      className={bare ? '' : 'mt-8 rounded-lg border border-accent/40 bg-surface-raised p-5'}
    >
      {!bare && (
        <>
          <h2 className="text-sm font-semibold">
            {waiting ? t.waitingTitle : t.costTitle}
          </h2>

          <p className="mt-2 text-sm text-ink-muted">
            {waiting ? (
              <>
                {entitlement.unpaid === 1
                  ? t.waitingOne
                  : fill(t.waitingMany, { n: entitlement.unpaid })}{' '}
                {t.waitingTail}
              </>
            ) : (
              t.costBody
            )}
          </p>
        </>
      )}

      <ul className="mt-3 space-y-2">
        {PAID_TIERS.map((tier) => (
          <li
            key={tier}
            className="flex flex-wrap items-baseline gap-x-2 text-sm text-ink-muted"
          >
            <span className="font-mono font-semibold text-ink">{tier}</span>
            <span className="font-mono text-ink">{tierPricePerMonth(tier)}</span>
            <span>— {billingDict(locale).tiers[tier].tagline}</span>
          </li>
        ))}
      </ul>

      <p className="mt-2 text-xs text-ink-muted">{t.unlimited}</p>

      {entitlement.grantUntil && entitlement.granted && (
        <p className="mt-2 text-xs text-ink-muted">
          {fill(t.grantLine, {
            tier: entitlement.grantTier ? ` (${entitlement.grantTier})` : '',
            when: new Date(entitlement.grantUntil).toLocaleDateString(locale),
          })}
        </p>
      )}

      {/*
        The month on us.

        Above the code box and below the prices, which is the one position that
        is honest about what it is: not a third plan, and not a discount for
        people who know a password. Somebody reading down the panel learns what
        xo costs, then that their first month of it is free, then - if they are
        the rare person holding a code - where to type it.

        Gone the moment it is taken. The grant line above already says when the
        month runs out, so leaving a spent button here would be two sentences
        about the same month disagreeing about whether it has started.
      */}
      {canClaim && !granted && (
        <div className="mt-4 border-t border-line pt-4">
          <button
            type="button"
            disabled={isPending}
            onClick={claim}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? t.claiming : t.claim}
          </button>

          <div className="mt-2 min-h-5">
            {error ? (
              <p role="alert" className="text-sm text-red-500">
                {error}
              </p>
            ) : (
              <p className="text-xs text-ink-muted">{t.claimNote}</p>
            )}
          </div>
        </div>
      )}

      {granted && (
        <p className="mt-4 rounded-lg border border-accent/50 px-4 py-3 text-sm">
          {fill(t.claimed, { when: new Date(granted).toLocaleDateString(locale) })}
        </p>
      )}

      {/*
        Below the prices, and folded away.

        Above them, the code box would read as the cheaper of two options and
        send people off to look for a code instead of paying. Below, it is where
        the person who actually holds one will look, and invisible to everyone
        else.

        Only for somebody who could still use it: `canRedeem` is false once this
        account has had a free month of every tier it is eligible for, and a
        field that is only ever going to refuse is worse than no field.
      */}
      {canRedeem && (
        <div className="mt-4 border-t border-line pt-4">
          <RedeemCode source="picker" />
        </div>
      )}
    </section>
  )
}
