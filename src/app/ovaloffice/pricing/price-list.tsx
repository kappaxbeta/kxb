'use client'

import { useState, useTransition } from 'react'
import {
  draftFromLimits,
  LimitFields,
  limitsFromDraft,
  NO_LIMITS,
  type LimitDraft,
  type LimitsDraft,
} from '@/app/ovaloffice/pricing/limit-fields'
import { deleteTierPrice, saveTierPrice } from '@/domain/billing/tier-actions'
import type { StoredPrice } from '@/domain/billing/tier-admin'
import { PAID_TIERS, type LimitKey, type TierLimits } from '@/domain/billing/tiers'

/**
 * The prices, which is what checkout actually charges.
 *
 * The half of this page that costs money to get wrong. A tier row is what the
 * page *quotes*; a row here is the Stripe price a Checkout session is built
 * against and the join key a webhook arrives with. The two are edited side by
 * side precisely because changing one alone is the mistake - a tier at €12 with
 * a €10 price still on sale advertises a number nobody is charged.
 *
 * Every row is also a grandfather clause waiting to happen. `sold` is the whole
 * mechanism: exactly one price per tier carries it, the rest are honoured
 * forever and offered to nobody, and the `limits` below are what *that* price
 * promised - merged over its tier, so an old customer keeps what they bought
 * and still receives every limit added since.
 */

export function PriceList({
  prices,
  effective,
}: {
  prices: StoredPrice[]
  /** Each tier's limits after the merge, so an override says what it overrides. */
  effective: Record<string, TierLimits>
}) {
  const [adding, setAdding] = useState(false)

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Stripe prices</h3>
        <button
          type="button"
          onClick={() => setAdding((open) => !open)}
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition"
        >
          {adding ? 'Cancel' : 'Add a price'}
        </button>
      </div>

      <p className="mt-1 text-sm text-muted-foreground">
        Which Stripe price grants which tier, and what it sold. Exactly one per tier
        is on sale — marking a new one retires the old, which is what grandfathering
        is. Until a tier has a price here, checkout falls back to the id baked into
        the build.
      </p>

      {adding && (
        <div className="mt-3">
          <PriceForm
            effective={effective}
            onDone={() => setAdding(false)}
            price={null}
          />
        </div>
      )}

      {prices.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          No prices yet. Every checkout is using the STRIPE_PRICE_XO / STRIPE_PRICE_XP
          variables from the build.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {prices.map((price) => (
            <li key={`${price.provider}:${price.priceId}`}>
              <PriceForm price={price} effective={effective} onDone={() => {}} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function PriceForm({
  price,
  effective,
  onDone,
}: {
  /** Null when this is the form that adds one. */
  price: StoredPrice | null
  effective: Record<string, TierLimits>
  onDone: () => void
}) {
  const [priceId, setPriceId] = useState(price?.priceId ?? '')
  const [tier, setTier] = useState<string>(price?.tier ?? PAID_TIERS[0])
  const [sold, setSold] = useState(price?.sold ?? false)
  const [note, setNote] = useState(price?.note ?? '')
  const [limits, setLimits] = useState<LimitsDraft>(() =>
    draftFromLimits(price?.limits ?? {}),
  )
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  function change(key: LimitKey, field: LimitDraft) {
    setSaved(false)
    setLimits((current) => ({ ...current, [key]: field }))
  }

  /** Any edit puts the "Saved." out of date. See the same wrapper in the tier editor. */
  function edit<T>(setter: (value: T) => void): (value: T) => void {
    return (value) => {
      setSaved(false)
      setter(value)
    }
  }

  function submit() {
    setError(null)
    setSaved(false)

    const parsed = limitsFromDraft(limits)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }

    startTransition(async () => {
      const result = await saveTierPrice({
        provider: 'stripe',
        priceId: priceId.trim(),
        tier,
        sold,
        note: note.trim() || null,
        limits: parsed.limits,
      })

      if (!result.ok) {
        setError(result.error)
        return
      }

      setSaved(true)
      onDone()
    })
  }

  function remove() {
    if (!price) return

    /*
     * Asked because the wrong answer is expensive and looks like the right one.
     * Deleting does not cancel a subscription - it makes `grantForPrice` answer
     * "not one of ours", and a paying space goes read-only. Retiring is the
     * checkbox above, and it is what is nearly always meant.
     */
    if (
      !confirm(
        `Forget ${price.priceId}?\n\nAnybody subscribed on it loses their tier and their space goes read-only. To stop selling it while honouring it, untick "on sale" instead.`,
      )
    ) {
      return
    }

    setError(null)
    startTransition(async () => {
      const result = await deleteTierPrice(price.provider, price.priceId)
      if (!result.ok) setError(result.error)
    })
  }

  return (
    <div className="rounded-lg border border-border bg-secondary p-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={priceId}
          disabled={isPending || Boolean(price)}
          onChange={(event) => edit(setPriceId)(event.target.value)}
          placeholder="price_1AbC…"
          className="w-64 rounded border border-border bg-card px-2 py-1 font-mono text-sm disabled:opacity-70"
          aria-label="Stripe price id"
        />

        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">grants</span>
          <select
            value={tier}
            disabled={isPending}
            onChange={(event) => edit(setTier)(event.target.value)}
            className="rounded border border-border bg-card px-2 py-1 text-sm disabled:opacity-50"
          >
            {PAID_TIERS.map((paid) => (
              <option key={paid} value={paid}>
                {paid}
              </option>
            ))}
          </select>
        </label>

        <label
          className="flex items-center gap-2 text-sm"
          title="New checkouts are built against this one. Exactly one price per tier carries it."
        >
          <input
            type="checkbox"
            checked={sold}
            disabled={isPending}
            onChange={(event) => edit(setSold)(event.target.checked)}
            className="size-4 accent-current"
          />
          <span>on sale</span>
        </label>

        {price && (
          <span className="text-xs text-muted-foreground">
            added {new Date(price.createdAt).toLocaleDateString()}
          </span>
        )}
      </div>

      <input
        value={note}
        disabled={isPending}
        onChange={(event) => edit(setNote)(event.target.value)}
        placeholder="Why this row exists — the sentence that explains a grandfather clause"
        className="mt-2 w-full rounded border border-border bg-card px-2 py-1 text-sm disabled:opacity-50"
        aria-label="Note"
      />

      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
          What this price sold {countStated(limits) > 0 && `(${countStated(limits)} overridden)`}
        </summary>
        <p className="mt-1 mb-2 text-xs text-muted-foreground">
          Only what differs from the tier. Everything left inheriting follows the tier
          as it is today — which is why a grandfathered customer still gets limits
          added after they bought.
        </p>
        <LimitFields
          draft={limits}
          onChange={change}
          effective={effective[tier] ?? NO_LIMITS}
          inheritLabel={`from ${tier}`}
          disabled={isPending}
        />
      </details>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className="rounded-lg border border-primary px-3 py-1.5 text-sm text-primary transition disabled:opacity-50"
        >
          {isPending ? 'Saving…' : price ? 'Save' : 'Add'}
        </button>

        {price && (
          <button
            type="button"
            onClick={remove}
            disabled={isPending}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition disabled:opacity-50"
          >
            Forget
          </button>
        )}

        {error && (
          <p role="alert" className="text-sm text-red-500">
            {error}
          </p>
        )}
        {saved && !error && <p className="text-sm text-muted-foreground">Saved.</p>}
      </div>
    </div>
  )
}

function countStated(draft: LimitsDraft): number {
  return Object.values(draft).filter((field) => field.mode !== 'inherit').length
}
