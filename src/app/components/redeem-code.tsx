'use client'

import { useState, useTransition } from 'react'
import { normaliseCode } from '@/domain/promo/application'
import { redeemCode } from '@/domain/promo/actions'
import type { RedeemSource } from '@/domain/promo/application'
import { useRefusal } from '@/app/i18n/use-refusal'
import { billingDict } from '@/app/i18n/billing'
import { useLocale } from '@/app/i18n/locale-context'

/**
 * "Got a code?" - the same form in both of the places a signed-in person can
 * redeem one.
 *
 * One component rather than two, because the two doors it appears at look
 * identical to a visitor and would drift apart the moment they were separate
 * files: a copy that forgot to normalise, or that reported an error in a
 * different colour, is exactly the kind of difference that makes a person think
 * the code works in one place and not the other.
 *
 * What differs is only `source` and `slug`, which are recorded rather than
 * enforced. Both go to the same action, which asks the same database function.
 */
export function RedeemCode({
  source,
  slug = null,
  tenantId = null,
  /** Folded away until asked for. See below. */
  collapsed = true,
}: {
  source: RedeemSource
  slug?: string | null
  tenantId?: string | null
  collapsed?: boolean
}) {
  const locale = useLocale()
  const t = billingDict(locale).redeem
  const refusal = useRefusal()
  const [open, setOpen] = useState(!collapsed)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [granted, setGranted] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  /**
   * Normalised as they type, not on submit.
   *
   * The server normalises too - it has to, since a form is a public endpoint -
   * so this buys nothing in correctness. What it buys is that the field shows
   * the code the way the poster prints it, so somebody comparing the two can
   * see they match. A field that quietly accepts "cafe 24" and then reports
   * "that code is not one of ours" reads as a broken code rather than a typo.
   */
  const clean = normaliseCode(code)

  function submit() {
    if (!clean || isPending) return
    setError(null)

    startTransition(async () => {
      const result = await redeemCode({
        code: clean,
        source,
        slug,
        tenantId,
        // The campaign tag as it stands in this tab, so a redemption made after
        // clicking through from a tagged link is attributed to it.
        search: typeof window === 'undefined' ? null : window.location.search,
      })

      if (result.ok) setGranted(result.grant.until)
      else setError(refusal(result.error))
    })
  }

  /**
   * The success state stays put rather than disappearing into a page refresh.
   *
   * The action revalidates, so everything around this is about to re-render
   * with the new seat - and in the middle of that, a form that simply vanished
   * would leave somebody unsure whether their code was taken. Saying the date
   * out loud is the confirmation.
   */
  if (granted) {
    return (
      <p className="rounded-lg border border-accent/50 bg-surface-raised px-4 py-3 text-sm">
        {t.acceptedLead}{' '}
        <span className="font-medium">
          {new Date(granted).toLocaleDateString(locale)}
        </span>
        {t.acceptedTail}
      </p>
    )
  }

  /**
   * Collapsed by default on the surfaces that are also selling a subscription.
   *
   * An open code box next to a price is an invitation to go and look for a code
   * instead of paying, and most people do not have one. Behind a link, it is
   * there for the person who does.
   */
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-ink-muted underline underline-offset-4 transition hover:text-ink"
      >
        {t.gotACode}
      </button>
    )
  }

  return (
    <div className="space-y-2">
      <label htmlFor={`redeem-${source}`} className="block text-sm font-medium">
        {t.heading}
      </label>

      <div className="flex gap-2">
        <input
          id={`redeem-${source}`}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit()
          }}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={40}
          placeholder={t.placeholder}
          className="w-full rounded-lg border border-line bg-surface-raised px-3 py-2 font-mono text-sm uppercase outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={submit}
          // Disabled on shape, not on emptiness: a half-typed code is not
          // submittable, and the button saying so is quieter than a refusal.
          disabled={!clean || isPending}
          className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? t.checking : t.redeem}
        </button>
      </div>

      <div className="min-h-5">
        {error ? (
          <p role="alert" className="text-sm text-red-500">
            {error}
          </p>
        ) : (
          <p className="text-xs text-ink-muted">
            {t.note}
          </p>
        )}
      </div>
    </div>
  )
}
