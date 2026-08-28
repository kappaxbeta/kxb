'use client'

import { useRouter } from 'next/navigation'
import { spacesDict } from '@/app/i18n/spaces'
import type { Locale } from '@/domain/i18n/locale'
import { useState, useTransition } from 'react'
import { attempt } from '@/app/components/connection'
import { resolveJoinCode } from '@/domain/guests/actions'
import { JOIN_CODE_LENGTH } from '@/domain/guests/application'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * Six characters, and the door they open.
 *
 * Uppercased as it is typed, because the column holds one case and somebody
 * watching their own letters appear in the shape they were told is somebody who
 * knows the field understood them. The value is *not* stripped of spaces and
 * hyphens here - `normaliseJoinCode` does that on the server, and doing it
 * twice would mean the field fighting anybody who paste a code with a hyphen in
 * it halfway through editing.
 *
 * `router.push` rather than a redirect from the action, so the failure case
 * lands here with a sentence instead of on the door with a 404. The door is
 * where the link's own rules are applied - knock, expiry, destination - and
 * this is only the thing that finds it.
 */
export function JoinForm({ initial, locale }: { initial: string; locale: Locale }) {
  const refusal = useRefusal()
  const t = spacesDict(locale).join
  const router = useRouter()
  const [code, setCode] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (pending) return

    setError(null)
    start(async () => {
      const result = await attempt(() => resolveJoinCode(code))
      if (!result.ok) {
        setError(refusal(result.error))
        return
      }
      router.push(result.path)
    })
  }

  return (
    <form onSubmit={submit} className="mt-6">
      <label htmlFor="join-code" className="sr-only">
        {t.label}
      </label>
      <input
        id="join-code"
        value={code}
        onChange={(event) => setCode(event.target.value.toUpperCase())}
        // `characters` rather than `words`: this is six symbols, and a phone
        // keyboard that capitalises sentences would fight the uppercasing.
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        autoComplete="off"
        autoFocus
        placeholder={t.placeholder}
        // Room for a hyphen and the spaces people type when reading in threes.
        maxLength={JOIN_CODE_LENGTH + 4}
        aria-invalid={error !== null}
        aria-describedby={error ? 'join-error' : undefined}
        className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-center font-mono text-2xl uppercase tracking-[0.35em] text-ink placeholder:text-ink-muted/40 focus:border-accent focus:outline-none"
      />

      <button
        type="submit"
        disabled={pending || code.trim().length === 0}
        className="mt-3 w-full rounded-xl border border-accent/60 bg-accent/10 px-4 py-2.5 text-sm text-accent transition hover:bg-accent/20 disabled:opacity-40"
      >
        {pending ? t.looking : t.go}
      </button>

      {/* Reserved rather than conditional, so the button does not jump when a
          wrong code comes back. */}
      <div className="mt-3 min-h-5">
        {error && (
          <p id="join-error" role="alert" className="text-sm text-amber-200">
            {error}
          </p>
        )}
      </div>
    </form>
  )
}
