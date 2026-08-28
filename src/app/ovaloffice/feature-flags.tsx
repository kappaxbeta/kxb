'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import {
  clearFeatureOverride,
  setFeatureOverride,
  setGlobalFlag,
} from '@/domain/flags/actions'
import type { FeatureFlagRow, FeatureOverrideRow } from '@/domain/flags/queries'
import type { FeatureScope } from '@/domain/flags/keys'

/**
 * Feature flags.
 *
 * The global default on the left, the exceptions underneath. That layout is the
 * mental model made visible: a flag is one value, and an override is a named
 * subject held apart from it - not a second, parallel setting.
 *
 * Turning a global off is confirmed, turning one on is not. The asymmetry is
 * deliberate: switching `billing` off makes the entire product free for
 * everyone with no override, and that is not a click anybody should be able to
 * make by aiming badly.
 */
export function FeatureFlags({ flags }: { flags: FeatureFlagRow[] }) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function toggleGlobal(flag: FeatureFlagRow) {
    const next = !flag.enabled

    if (!next) {
      const consequence =
        flag.key === 'billing'
          ? 'Every space becomes free and fully writable, and anyone can create spaces without paying.'
          : `${flag.label} disappears for everyone without an override.`
      if (!confirm(`Turn ${flag.label} off globally?\n\n${consequence}`)) return
    }

    setError(null)
    startTransition(async () => {
      const result = await setGlobalFlag(flag.key, next)
      if (!result.ok) setError(result.error)
    })
  }

  function removeOverride(override: FeatureOverrideRow) {
    setError(null)
    startTransition(async () => {
      const result = await clearFeatureOverride(
        override.flagKey,
        override.scope,
        override.scopeId,
      )
      if (!result.ok) setError(result.error)
    })
  }

  return (
    <section>
      <h2 className="text-sm font-semibold">Feature flags</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        The global switch decides for everyone. An override decides for one space or
        one person, and a person’s override wins over their space’s.
      </p>

      <div className="mt-3 min-h-5">
        {error && (
          <p role="alert" className="text-sm text-red-500">
            {error}
          </p>
        )}
      </div>

      <ul className="space-y-3">
        {flags.map((flag) => (
          <li key={flag.key} className="rounded-lg border border-border bg-secondary">
            <div className="flex flex-wrap items-start justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{flag.label}</span>
                  <span className="font-mono text-xs text-muted-foreground">{flag.key}</span>
                  {/* A valued flag reads as a plain switch here, which is how an
                      admin comes away thinking they turned a limit on without
                      ever seeing the number. The number is edited on the Access
                      tab; this says what it currently is, and where. */}
                  {flag.valueInt !== null && flag.enabled && (
                    <Link
                      href="/ovaloffice/access"
                      className="rounded bg-card px-1.5 py-0.5 font-mono text-xs text-primary hover:underline"
                    >
                      {flag.valueInt}
                    </Link>
                  )}
                </div>
                {flag.description && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{flag.description}</p>
                )}
              </div>

              <button
                type="button"
                onClick={() => toggleGlobal(flag)}
                disabled={isPending}
                aria-pressed={flag.enabled}
                className={`rounded-lg border px-3 py-1.5 text-sm transition disabled:opacity-50 ${
                  flag.enabled
                    ? 'border-primary text-primary'
                    : 'border-border text-muted-foreground'
                }`}
              >
                {flag.enabled ? 'On globally' : 'Off globally'}
              </button>
            </div>

            {flag.overrides.length > 0 && (
              <ul className="border-t border-border px-3 py-2">
                {flag.overrides.map((override) => (
                  <li
                    key={`${override.scope}:${override.scopeId}`}
                    className="flex flex-wrap items-center gap-2 py-1 text-xs"
                  >
                    <span className="rounded bg-card px-1.5 py-0.5 font-mono text-muted-foreground">
                      {override.scope}
                    </span>
                    {/* The id is the fallback when the workspace or account has
                        been deleted - the override is dead but still listed, so
                        it can be found and removed. */}
                    <span className="flex-1 truncate">
                      {override.subject ?? (
                        <span className="text-muted-foreground">
                          {override.scopeId} <em>(deleted)</em>
                        </span>
                      )}
                      {override.note && (
                        <span className="ml-2 text-muted-foreground">— {override.note}</span>
                      )}
                    </span>
                    <span className={override.enabled ? 'text-primary' : 'text-muted-foreground'}>
                      {override.enabled ? 'on' : 'off'}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeOverride(override)}
                      disabled={isPending}
                      className="text-muted-foreground transition hover:text-red-500 disabled:opacity-50"
                    >
                      remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      <AddOverride flags={flags} onError={setError} />
    </section>
  )
}

/**
 * Adding an exception.
 *
 * The subject is typed, not picked from a list, because the lists in question
 * are every account and every workspace in the system and an admin adding an
 * override already knows which one they mean. The action resolves the email or
 * slug to an id and refuses anything it cannot find, so a typo is a message
 * rather than an override attached to nobody.
 */
function AddOverride({
  flags,
  onError,
}: {
  flags: FeatureFlagRow[]
  onError: (error: string | null) => void
}) {
  const [scope, setScope] = useState<FeatureScope>('user')
  const [isPending, startTransition] = useTransition()

  async function handleSubmit(formData: FormData) {
    onError(null)

    const result = await setFeatureOverride({
      key: String(formData.get('key') ?? ''),
      scope,
      subject: String(formData.get('subject') ?? ''),
      enabled: formData.get('enabled') === 'on',
      note: String(formData.get('note') ?? ''),
    })

    if (!result.ok) onError(result.error)
  }

  return (
    <form
      action={(formData) => startTransition(() => handleSubmit(formData))}
      className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5"
    >
      <select
        name="key"
        aria-label="Feature"
        className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm"
      >
        {flags.map((flag) => (
          <option key={flag.key} value={flag.key}>
            {flag.label}
          </option>
        ))}
      </select>

      <select
        value={scope}
        onChange={(event) => setScope(event.target.value as FeatureScope)}
        aria-label="Scope"
        className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm"
      >
        <option value="user">for user</option>
        <option value="tenant">for space</option>
      </select>

      <input
        name="subject"
        required
        placeholder={scope === 'user' ? 'email address' : 'space slug'}
        aria-label={scope === 'user' ? 'Email address' : 'Space slug'}
        className="min-w-48 flex-1 rounded-lg border border-border bg-card px-2 py-1.5 text-sm"
      />

      <label className="flex items-center gap-1.5 text-sm">
        <input name="enabled" type="checkbox" defaultChecked />
        on
      </label>

      <input
        name="note"
        placeholder="why (optional)"
        aria-label="Note"
        className="min-w-40 flex-1 rounded-lg border border-border bg-card px-2 py-1.5 text-sm"
      />

      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg border border-border px-3 py-1.5 text-sm transition hover:bg-secondary disabled:opacity-50"
      >
        Add override
      </button>
    </form>
  )
}
