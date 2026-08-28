'use client'

import { useState, useTransition, type ReactNode } from 'react'
import {
  draftFromLimits,
  LimitFields,
  limitsFromDraft,
  NO_LIMITS,
  type LimitDraft,
  type LimitsDraft,
} from '@/app/ovaloffice/pricing/limit-fields'
import { saveTier } from '@/domain/billing/tier-actions'
import type { StoredTier } from '@/domain/billing/tier-admin'
import type { LimitKey, TierLimits } from '@/domain/billing/tiers'

/**
 * The tier table, edited.
 *
 * One card per row and one Save per card, because a tier is the unit somebody
 * thinks in: they came here to change what xo costs or what it holds, and a
 * page-wide Save would make that edit carry two other rows they never looked
 * at.
 *
 * There is no "add a tier" button. `Tier` is a union in code and `readTierTable`
 * filters rows down to it, so a fourth row would be written, stored, and then
 * ignored by every reader in the product - a button that appears to work and
 * does nothing. A fourth tier is a code change, and this page is for the
 * numbers on the three that exist.
 */

export function TierEditor({
  tiers,
  effective,
}: {
  tiers: StoredTier[]
  /** What each tier resolves to after the merge, for the inherited fields. */
  effective: Record<string, TierLimits>
}) {
  return (
    <ul className="space-y-4">
      {tiers.map((row) => (
        // Keyed on the timestamp as well as the id, so a saved row is
        // remounted from the server's answer rather than left holding a draft
        // that may have been cleaned up on the way in.
        <li key={`${row.id}:${row.updatedAt}`}>
          <TierCard row={row} effective={effective[row.id] ?? null} />
        </li>
      ))}
    </ul>
  )
}

function TierCard({ row, effective }: { row: StoredTier; effective: TierLimits | null }) {
  const [label, setLabel] = useState(row.label)
  const [tagline, setTagline] = useState(row.tagline)
  const [cents, setCents] = useState(String(row.cents))
  const [sold, setSold] = useState(row.sold)
  const [shown, setShown] = useState(row.shownOnLanding)
  const [limits, setLimits] = useState<LimitsDraft>(() => draftFromLimits(row.limits))
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  function change(key: LimitKey, field: LimitDraft) {
    setSaved(false)
    setLimits((current) => ({ ...current, [key]: field }))
  }

  /**
   * Any edit puts the "Saved." out of date.
   *
   * Worth the wrapper rather than a `setSaved(false)` in six handlers, because
   * the one that gets forgotten is the one that leaves a card reading "Saved."
   * over a field somebody has since changed - which is the single most
   * expensive thing this page could lie about.
   */
  function edit<T>(setter: (value: T) => void): (value: T) => void {
    return (value) => {
      setSaved(false)
      setter(value)
    }
  }

  function submit() {
    setError(null)
    setSaved(false)

    const amount = Number(cents.trim())
    if (!cents.trim() || !Number.isInteger(amount) || amount < 0) {
      setError('The price is a whole number of cents.')
      return
    }

    const parsed = limitsFromDraft(limits)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }

    startTransition(async () => {
      const result = await saveTier({
        id: row.id,
        cents: amount,
        sold,
        shownOnLanding: shown,
        label: label.trim(),
        tagline: tagline.trim(),
        limits: parsed.limits,
      })

      if (!result.ok) setError(result.error)
      else setSaved(true)
    })
  }

  return (
    <section className="rounded-lg border border-border bg-secondary p-3">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h3 className="font-mono text-sm font-semibold">{row.id}</h3>
          {row.isBase && (
            <span className="rounded bg-card px-1.5 py-0.5 text-xs text-muted-foreground">
              the base every other tier inherits from
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          saved {new Date(row.updatedAt).toLocaleString()}
        </span>
      </header>

      <div className="mt-3 grid gap-2 sm:grid-cols-[8rem_1fr]">
        <Field label="Name">
          <input
            value={label}
            disabled={isPending}
            onChange={(event) => edit(setLabel)(event.target.value)}
            className="w-full rounded border border-border bg-card px-2 py-1 text-sm disabled:opacity-50"
          />
        </Field>
        <Field label="Tagline">
          <input
            value={tagline}
            disabled={isPending}
            onChange={(event) => edit(setTagline)(event.target.value)}
            className="w-full rounded border border-border bg-card px-2 py-1 text-sm disabled:opacity-50"
          />
        </Field>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Cents / month</span>
          <input
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={cents}
            disabled={isPending}
            onChange={(event) => edit(setCents)(event.target.value)}
            className="w-24 rounded border border-border bg-card px-2 py-1 text-sm disabled:opacity-50"
          />
          {/* Cents rather than euros in the field, because money is an integer
              here and a euro field would invite 4.99 into a column that cannot
              hold it. The euros are printed instead, which is the check an
              operator actually wants after typing four digits. */}
          <span className="font-mono text-sm">{euros(cents)}</span>
        </label>

        <Toggle
          checked={sold}
          disabled={isPending}
          onChange={edit(setSold)}
          label="On sale"
          hint="May somebody choose this plan today. Off is grandfathering: honoured, never offered."
        />

        <Toggle
          checked={shown}
          disabled={isPending}
          onChange={edit(setShown)}
          label="On the landing page"
          hint="The shop window only. A tier can be buyable by anybody holding the link and still not belong on the page."
        />
      </div>

      <div className="mt-4">
        <h4 className="text-xs font-semibold text-muted-foreground">What it holds</h4>
        <p className="mt-1 mb-2 text-xs text-muted-foreground">
          {row.isBase
            ? 'Free states every limit; the other tiers are merged over it. “From code” falls back to the compiled constants.'
            : 'Only what differs from free. Leave a limit inheriting and it follows free — which is how a new limit reaches every tier at once.'}
        </p>
        <LimitFields
          draft={limits}
          onChange={change}
          effective={effective ?? NO_LIMITS}
          inheritLabel={row.isBase ? 'from code' : 'from free'}
          disabled={isPending}
        />
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className="rounded-lg border border-primary px-3 py-1.5 text-sm text-primary transition disabled:opacity-50"
        >
          {isPending ? 'Saving…' : 'Save'}
        </button>
        {error && (
          <p role="alert" className="text-sm text-red-500">
            {error}
          </p>
        )}
        {saved && !error && <p className="text-sm text-muted-foreground">Saved.</p>}
      </div>
    </section>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="contents">
      <span className="self-center text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  hint: string
  disabled?: boolean
}) {
  return (
    <label className="flex items-center gap-2 text-sm" title={hint}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-current"
      />
      <span>{label}</span>
    </label>
  )
}

/** "€5.00" for a field holding cents, or a dash while it holds nothing. */
function euros(cents: string): string {
  const amount = Number(cents.trim())
  if (!cents.trim() || !Number.isFinite(amount)) return '—'
  return `€${(amount / 100).toFixed(2)}`
}
