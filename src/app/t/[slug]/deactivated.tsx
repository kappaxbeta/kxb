'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { startCheckout } from '@/domain/billing/actions'
import { claimFreeMonth } from '@/domain/promo/actions'
import { PAID_TIERS, type Tier, tierPricePerMonth } from '@/domain/billing/tiers'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { workspaceDict } from '@/app/i18n/workspace'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * What a workspace looks like when its subscription has lapsed.
 *
 * Shown instead of the workspace's pages, not as a banner over them. A banner
 * invites people to keep working and discover, one failed save at a time, that
 * nothing is being recorded. A wall says it once.
 *
 * The renewal button is *here* rather than only on the billing page, and that
 * is the load-bearing detail: this screen replaces the workspace's children in
 * the layout, so the billing page is behind the same wall. Without a Stripe
 * hand-off on this screen, the only route out of the deactivated state would be
 * locked inside the deactivated state.
 *
 * Nothing has been deleted. Every task, event and block is exactly where it
 * was - the log is append-only, so "deactivated" is a fact about billing, not
 * an operation on data. Paying resumes it with no restore step.
 *
 * ---------------------------------------------------------------------------
 * The free month
 * ---------------------------------------------------------------------------
 * `freeMonth` is the layout's answer to "may this person be offered a month on
 * us" - see `mayClaimPausedMonth`, and the migration behind it for why somebody
 * who has already paid for xo once is nonetheless allowed one.
 *
 * It is the primary button when it is there, and the two prices go quiet
 * behind it. That is the deliberate part: this screen is read by somebody who
 * stopped paying, which means the €5 has already lost an argument with them
 * once. Leading with it again is leading with the thing that did not work.
 */
export function WorkspaceDeactivated({
  slug,
  name,
  isOwner,
  paidThrough,
  freeMonth = false,
}: {
  slug: string
  name: string
  isOwner: boolean
  paidThrough: string | null
  freeMonth?: boolean
}) {
  const refusal = useRefusal()
  const [error, setError] = useState<string | null>(null)
  const [granted, setGranted] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  /**
   * *Which* button is working, as opposed to whether one is.
   *
   * `isPending` is one flag for the whole component, which is right for
   * disabling - two of these must never run at once - and wrong for labelling.
   * Without this, claiming the free month makes the price buttons announce
   * "Opening Stripe…", which is both untrue and the single most alarming thing
   * this screen could say to somebody who just clicked a button that promised
   * no card.
   */
  const locale = useLocale()
  const t = workspaceDict(locale).paused
  const [acting, setActing] = useState<'claim' | 'checkout' | null>(null)

  function renew(tier: Tier) {
    setError(null)
    setActing('checkout')
    startTransition(async () => {
      // Redirects to Stripe on success, so anything returned is a failure.
      const result = await startCheckout(slug, tier)
      if (result && !result.ok) setError(refusal(result.error))
      setActing(null)
    })
  }

  function claim() {
    setError(null)
    setActing('claim')
    startTransition(async () => {
      // 'space' is the source the redemption is filed under: claimed from
      // inside a space that had gone read-only, which is what tells a returning
      // customer apart from a new one afterwards.
      const result = await claimFreeMonth({ source: 'space', slug })
      if (result.ok) setGranted(result.grant.until)
      else setError(refusal(result.error))
      setActing(null)
    })
  }

  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <div className="rounded-2xl border border-amber-500/50 bg-surface-raised p-8">
        <h2 className="text-lg font-semibold">{fill(t.heading, { name })}</h2>

        <p className="mt-3 text-sm text-ink-muted">
          {t.body}
          {paidThrough && (
            <>
              {fill(t.paidThrough, {
                date: new Date(paidThrough).toLocaleDateString(locale),
              })}
            </>
          )}
        </p>

        <p className="mt-3 text-sm text-ink-muted">
          <span className="font-medium text-ink">{t.nothingDeleted}</span>
          {t.nothingDeletedRest}
        </p>

        <div className="mt-6 min-h-5">
          {error && (
            <p role="alert" className="text-sm text-red-500">
              {error}
            </p>
          )}
        </div>

        {granted ? (
          /*
            The action revalidates this layout, so this space is already on its
            way back and the wall is about to be replaced by the space itself.
            This is the bridge across that render, and it exists for the same
            reason `RedeemCode` keeps its own: a button that simply vanished
            would leave somebody unsure whether anything happened. Saying the
            date out loud is the confirmation.
          */
          <p className="rounded-lg border border-accent/50 bg-surface px-4 py-3 text-sm">
            {fill(t.welcomeBack, {
              name,
              date: new Date(granted).toLocaleDateString(locale),
            })}
          </p>
        ) : isOwner ? (
          <div className="space-y-4">
            {/*
              The month on us, when there is one to offer.

              Above the prices rather than beside them, because it is not a
              third plan - it is the same xo, with the first month paid for by
              us, and a row of three buttons would read as a choice between
              three products.
            */}
            {freeMonth && (
              <div className="space-y-3">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={claim}
                  className="w-full rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {isPending && acting === 'claim' ? t.claiming : t.claim}
                </button>

                {/*
                  Every question somebody about to click that has, in the order
                  they have it. "No card" first because it is the one they do
                  not believe, and what happens on day 31 second because the
                  reason they do not believe it is that they expect to be
                  charged then.
                */}
                <p className="text-xs text-ink-muted">{t.claimNote}</p>
              </div>
            )}

            {/*
              Two buttons, because there are now two plans and this screen is
              behind the same wall as the billing page - see the note above. An
              owner who lapsed on xp should be able to come back on xo rather than
              being offered only the price they stopped paying.

              They lose the accent fill while the free month is on the screen.
              Two primary buttons is no emphasis at all, and the one that should
              win here is the one that asks for nothing.
            */}
            <div className="flex flex-wrap justify-center gap-2">
              {PAID_TIERS.map((tier) => (
                <button
                  key={tier}
                  type="button"
                  disabled={isPending}
                  onClick={() => renew(tier)}
                  className={`rounded-lg px-5 py-2.5 text-sm font-medium transition disabled:opacity-50 ${
                    tier === 'xp' && !freeMonth
                      ? 'bg-accent text-white hover:opacity-90'
                      : 'border border-line hover:bg-surface'
                  }`}
                >
                  {isPending && acting === 'checkout'
                    ? t.openingStripe
                    : fill(t.restart, { tier, price: tierPricePerMonth(tier) })}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink-muted">{t.ownerOnly}</p>
        )}

        <p className="mt-6 text-xs text-ink-muted">
          <Link href="/tenants" className="text-accent hover:underline">
            {t.backToSpaces}
          </Link>
        </p>
      </div>
    </div>
  )
}
