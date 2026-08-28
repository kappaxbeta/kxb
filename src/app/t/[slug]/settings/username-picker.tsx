'use client'

import { useOptimistic, useState, useTransition } from 'react'
import { setUsername } from '@/domain/profile/username-actions'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { settingsDict } from '@/app/i18n/settings'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * Pick what people call you.
 *
 * Sits next to the avatar picker and is the other half of the same idea: both
 * are about *you* rather than about this workspace, both follow your account
 * into every workspace you belong to, and both are the only things on an
 * owner-gated settings page that every member can change.
 *
 * Unlike the avatar, this one can be refused - a handle can already be taken -
 * so it is not optimistic in the same way. The optimism here covers only the
 * round trip: the new name shows while the write is in flight and snaps back if
 * the server says no, rather than the field sitting inert behind a spinner.
 */
export function UsernamePicker({ initialUsername }: { initialUsername: string }) {
  const refusal = useRefusal()
  const t = settingsDict(useLocale()).username
  const [saved, setSaved] = useState(initialUsername)
  const [error, setError] = useState<string | null>(null)
  /** A free handle near the one that was refused, offered as one click. */
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [isPending, startTransition] = useTransition()

  const [shown, showOptimistically] = useOptimistic(saved)

  function save(next: string) {
    setError(null)
    setSuggestion(null)
    setDone(false)

    startTransition(async () => {
      showOptimistically(next)

      const result = await setUsername(next)
      if (result.ok) {
        setSaved(result.username)
        setDone(true)
      } else {
        // `saved` is untouched, so leaving the transition drops the optimistic
        // value and the old handle comes back on its own.
        setError(refusal(result.error))
        setSuggestion(result.suggestion ?? null)
      }
    })
  }

  function submit(formData: FormData) {
    const next = String(formData.get('username') ?? '').trim().toLowerCase()
    if (!next || next === shown) return
    save(next)
  }

  return (
    <div className="space-y-4 rounded-xl border border-line bg-surface-raised/40 p-6">
      <div>
        <h2 className="text-base font-semibold text-ink">{t.title}</h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">{t.body}</p>
      </div>

      {error && (
        <div className="space-y-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs font-medium text-red-500">
          <p>✕ {error}</p>

          {/*
            A way out, not just a refusal.

            "jane is already taken" used to be the end of the road, and for a
            common handle the way forward was to guess again - once per round
            trip. The server works out the first free one on the way back (see
            `freeHandleNear`), so accepting it is one click.
          */}
          {suggestion && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => save(suggestion)}
              className="rounded-lg border border-red-500/40 px-3 py-1.5 font-mono text-red-400 transition hover:bg-red-500/15 disabled:opacity-50"
            >
              {fill(t.takeInstead, { name: suggestion })}
            </button>
          )}
        </div>
      )}

      {done && !error && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs font-medium text-emerald-500">
          ✓ {fill(t.nowCalled, { name: shown })}
        </div>
      )}

      <form action={submit} className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <input
            name="username"
            key={shown}
            defaultValue={shown}
            required
            minLength={2}
            maxLength={32}
            pattern="[A-Za-z0-9][A-Za-z0-9_\-]*[A-Za-z0-9]"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-label={t.label}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-sm outline-none focus:border-accent"
          />
          <p className="mt-1.5 text-xs text-ink-muted">{t.rules}</p>
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg border border-line px-4 py-2 text-sm transition hover:bg-surface disabled:opacity-50"
        >
          {t.save}
        </button>
      </form>
    </div>
  )
}
