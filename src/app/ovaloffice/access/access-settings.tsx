'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  clearFeatureOverride,
  setFeatureOverride,
  setFlagValue,
  setGlobalFlag,
} from '@/domain/flags/actions'
import type { FeatureKey, FeatureScope } from '@/domain/flags/keys'
import type { FeatureOverrideRow } from '@/domain/flags/queries'
import { ErrorNote } from '@/app/components/error-note'

/**
 * The settings that decide who gets in, and how many of everything they get.
 *
 * All of them are ordinary feature flags underneath - the same rows the overview
 * page edits - so nothing here is a parallel mechanism. What this adds is
 * consequence: each switch is rendered next to a sentence saying what it does to
 * the front page and to the people already queueing, because "open registration:
 * off" on its own does not tell an admin that forty people are about to be told
 * to wait.
 *
 * ---------------------------------------------------------------------------
 * One card per valued flag, rather than one card that knows about seats
 * ---------------------------------------------------------------------------
 * This screen used to name `seat_limit` at six call sites - the toggle, the
 * number, the override list, the clear button, and both forms' bounds. That was
 * right while a seat cap was the only number the installation imposed. It is
 * wrong now: `docs/product/pricing.md` §10 puts five more numbers behind the
 * same mechanism, and an admin page that can adjust exactly one of them makes
 * "adjustable without a deploy" untrue for the other five.
 *
 * So the cards are generated from the registry. A new valued flag in
 * `flags/keys.ts` gets a card here with its own unit and its own bounds, and
 * nobody has to remember this file exists. The bounds in particular were worth
 * moving: they were written as literal 1 and 10000 in two inputs, which is
 * `seat_limit`'s range, and a `match_limit` input inheriting it would have
 * offered ten thousand concurrent battles.
 */

const BUTTON =
  'rounded-lg border border-border px-3 py-1.5 text-sm transition hover:bg-secondary disabled:opacity-50'

/** Everything one limit card needs, assembled by the page from flag + registry. */
export interface LimitSetting {
  key: FeatureKey
  label: string
  /** "people per space" - the registry's own words, used in the badge. */
  unit: string
  min: number
  max: number
  /** Whether an override attaches to a space or to a person. */
  scope: FeatureScope
  enabled: boolean
  value: number
  overrides: FeatureOverrideRow[]
}

/**
 * What switching one on actually does, in a sentence.
 *
 * Keyed here rather than in the registry, and that is the deliberate half of
 * this file. `flags/keys.ts` is imported by client components across the app
 * and has no business carrying backoffice prose - but a generic sentence built
 * from the unit ("every space is capped at 12 people per space") reads like a
 * machine wrote it, and the seat one in particular says something an admin
 * genuinely needs and could not infer: that pending invitations count.
 *
 * Anything without an entry falls back to the generic sentence, which is fine.
 * A new flag gets a working card immediately and better words when somebody has
 * them.
 */
const CONSEQUENCE: Partial<Record<FeatureKey, (value: number) => string>> = {
  seat_limit: (n) =>
    `Every space holds ${n} people, counting pending invitations. Inviting past it is refused, and the admin doing the inviting is who gets told — not their guest.`,
  guest_limit: (n) =>
    `${n} strangers may stand in a space at once. A guest leaving frees a place, and the link that brought them keeps working.`,
  xo_place_limit: (n) =>
    `No space may hold more than ${n} rooms. The tier already sets this per space — this is the ceiling above whatever they bought.`,
  xp_place_limit: (n) =>
    `No space may hold more than ${n} XP places. The tier already sets this per space — this is the ceiling above it.`,
  project_limit: (n) => `No space may edit more than ${n} XPs at a time.`,
  match_limit: (n) =>
    `No space may have more than ${n} battles open at once. Concurrency, not a monthly allowance.`,
  free_space_limit: (n) =>
    `One account may own ${n} spaces it is not paying for. Paid spaces are never capped, and being a member of other people's spaces is never capped either.`,
}

/** The reassurance shown when a cap is off. Off means unlimited, everywhere. */
function unlimitedSentence(unit: string): string {
  return `No limit on ${unit}.`
}

export function AccessSettings({
  registrationOpen,
  limits,
  pendingCount,
}: {
  registrationOpen: boolean
  limits: LimitSetting[]
  pendingCount: number
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function act(run: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null)
    startTransition(async () => {
      const result = await run()
      if (!result.ok) setError(result.error ?? 'That did not work')
      else router.refresh()
    })
  }

  function toggleRegistration() {
    const next = !registrationOpen

    // Closing is confirmed, opening is not - the same asymmetry the feature
    // flag list uses, and for the same reason. Closing the door is the click
    // with consequences for people who are not in the room.
    if (!next) {
      const warning =
        'New sign-ups will be refused and sent to the waiting list at /waitlist.\n\n' +
        'Existing accounts can still sign in, and invitations still work.'
      if (!confirm(`Close registration?\n\n${warning}`)) return
    }

    act(() => setGlobalFlag('open_registration', next))
  }

  return (
    <section className="space-y-4">
      <ErrorNote>{error}</ErrorNote>

      {/* ---------------------------------------------------------------- */}
      {/* The door                                                          */}
      {/* ---------------------------------------------------------------- */}
      <div className="rounded-xl border border-border bg-secondary/40 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              Registration
              <span
                className={`ml-2 rounded px-2 py-0.5 text-xs ${
                  registrationOpen
                    ? 'bg-emerald-500/20 text-emerald-500'
                    : 'bg-amber-500/20 text-amber-500'
                }`}
              >
                {registrationOpen ? 'open' : 'by invitation'}
              </span>
            </p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {registrationOpen ? (
                <>
                  Anybody can create an account. The landing page shows{' '}
                  <em>Open registration</em> and points at /signup.
                </>
              ) : (
                <>
                  Sign-up is refused unless the person holds an invitation.
                  Everyone else lands on the waiting list — {pendingCount} waiting
                  now. The landing page shows <em>Invitation only</em>.
                </>
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={toggleRegistration}
            disabled={isPending}
            aria-pressed={registrationOpen}
            className={`rounded-lg border px-3 py-1.5 text-sm transition disabled:opacity-50 ${
              registrationOpen ? 'border-primary text-primary' : 'border-border text-muted-foreground'
            }`}
          >
            {registrationOpen ? 'Open' : 'Invitation only'}
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* The caps                                                          */}
      {/* ---------------------------------------------------------------- */}
      {limits.map((limit) => (
        <LimitCard key={limit.key} limit={limit} disabled={isPending} onRun={act} />
      ))}
    </section>
  )
}

/**
 * One ceiling, and the subjects excused from it.
 *
 * The number is hidden while the flag is off, because a cap nobody is enforcing
 * is not worth editing - and showing an editable number beside an "Off" badge is
 * how an admin comes away believing they set a limit.
 */
function LimitCard({
  limit,
  disabled,
  onRun,
}: {
  limit: LimitSetting
  disabled: boolean
  onRun: (run: () => Promise<{ ok: boolean; error?: string }>) => void
}) {
  const { key, label, unit, min, max, enabled, value } = limit
  const describe = CONSEQUENCE[key]

  return (
    <div className="rounded-xl border border-border bg-secondary/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {label}
            <span
              className={`ml-2 rounded px-2 py-0.5 text-xs ${
                enabled ? 'bg-amber-500/20 text-amber-500' : 'bg-card px-2 text-muted-foreground'
              }`}
            >
              {enabled ? `${value} ${unit}` : 'unlimited'}
            </span>
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {enabled
              ? (describe?.(value) ?? `Capped at ${value} ${unit}.`)
              : unlimitedSentence(unit)}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onRun(() => setGlobalFlag(key, !enabled))}
          disabled={disabled}
          aria-pressed={enabled}
          className={`rounded-lg border px-3 py-1.5 text-sm transition disabled:opacity-50 ${
            enabled ? 'border-primary text-primary' : 'border-border text-muted-foreground'
          }`}
        >
          {enabled ? 'On' : 'Off'}
        </button>
      </div>

      {enabled && (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          <form
            action={(formData) => {
              const next = Number(formData.get('value'))
              onRun(() => setFlagValue(key, next))
            }}
            className="flex flex-wrap items-center gap-2"
          >
            <label htmlFor={`${key}-value`} className="text-sm">
              Default for everyone
            </label>
            <input
              id={`${key}-value`}
              name="value"
              type="number"
              min={min}
              max={max}
              defaultValue={value}
              className="w-24 rounded-lg border border-border bg-card px-2 py-1.5 text-sm"
            />
            <button type="submit" disabled={disabled} className={BUTTON}>
              Save
            </button>
          </form>

          <LimitOverrides limit={limit} disabled={disabled} onRun={onRun} />
        </div>
      )}
    </div>
  )
}

/**
 * Per-subject exceptions to the default.
 *
 * The same override table the feature flag list edits, narrowed to one flag and
 * to one scope. The scope is not a choice offered here, and that is the point:
 * a cap on a space is a property of the room rather than of whoever walks into
 * it, and `tenant_feature_limit()` ignores user overrides for exactly that
 * reason - while `account_feature_limit()` ignores tenant ones. Offering both
 * would be offering a setting the database declines to honour, so the registry
 * says which one applies and this renders that.
 */
function LimitOverrides({
  limit,
  disabled,
  onRun,
}: {
  limit: LimitSetting
  disabled: boolean
  onRun: (run: () => Promise<{ ok: boolean; error?: string }>) => void
}) {
  const { key, scope, min, max, value, overrides } = limit
  const subjects = overrides.filter((override) => override.scope === scope)

  const isUser = scope === 'user'
  const subjectLabel = isUser ? 'email address' : 'space slug'

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        {isUser ? 'People with a different limit' : 'Spaces with a different limit'}
      </p>

      {subjects.length > 0 && (
        <ul className="space-y-1">
          {subjects.map((override) => (
            <li
              key={override.scopeId}
              className="flex flex-wrap items-center gap-2 rounded-lg bg-card px-2.5 py-1.5 text-sm"
            >
              <span className="flex-1 truncate">
                {override.subject ?? (
                  <span className="text-muted-foreground">
                    {override.scopeId} <em>(deleted)</em>
                  </span>
                )}
              </span>
              <span className="font-mono text-xs">
                {override.enabled ? (override.valueInt ?? value) : 'unlimited'}
              </span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onRun(() => clearFeatureOverride(key, scope, override.scopeId))}
                className="text-xs text-muted-foreground transition hover:text-red-500 disabled:opacity-50"
              >
                remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        action={(formData) => {
          const subject = String(formData.get('subject') ?? '')
          const raw = String(formData.get('value') ?? '').trim()
          // Blank means "no limit for this subject", which is the override
          // turning the flag *off* for one of them rather than setting a number.
          const unlimited = raw === ''

          onRun(() =>
            setFeatureOverride({
              key,
              scope,
              subject,
              enabled: !unlimited,
              value: unlimited ? null : Number(raw),
              note: '',
            }),
          )
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <input
          name="subject"
          required
          placeholder={subjectLabel}
          aria-label={isUser ? 'Email address' : 'Space slug'}
          className="min-w-40 flex-1 rounded-lg border border-border bg-card px-2 py-1.5 text-sm"
        />
        <input
          name="value"
          type="number"
          min={min}
          max={max}
          placeholder="number"
          aria-label={`Limit for this ${isUser ? 'person' : 'space'}`}
          className="w-24 rounded-lg border border-border bg-card px-2 py-1.5 text-sm"
        />
        <button type="submit" disabled={disabled} className={BUTTON}>
          Set
        </button>
        <span className="text-xs text-muted-foreground">leave blank for unlimited</span>
      </form>
    </div>
  )
}
