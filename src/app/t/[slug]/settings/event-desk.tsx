'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { setSpaceCapability } from '@/domain/tenants/actions'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { settingsDict } from '@/app/i18n/settings'
import { useRefusal } from '@/app/i18n/use-refusal'
import { ErrorNote } from '@/app/components/error-note'

export interface DeskSwitch {
  key: string
  label: string
  /** What the staff have it set to. Absent in the log reads as on. */
  on: boolean
  /**
   * Does the event's ceiling allow this at all?
   *
   * A switch the ceiling forbids is shown and disabled rather than hidden, and
   * that is the decision this whole component is built around. Hiding it would
   * leave a host looking for a control that is not there and concluding the
   * product is broken; showing it greyed out with a reason says "this event did
   * not buy that", which is a sentence they can act on - by asking us.
   */
  allowed: boolean
}

/**
 * The controls a host reaches for on the day.
 *
 * Only half of each answer, and deliberately the half that belongs to the
 * space. The other half is the event's ceiling, set in the backoffice, and a
 * visitor may do something only when both say yes - which is why a switch can
 * read "on" here and still not let anybody post.
 *
 * Owner and admin only, and re-checked in the action: hiding a control hides
 * nothing, because a Server Action is a public endpoint.
 */
export function EventDesk({
  slug,
  switches,
  phase,
  closesAt,
}: {
  slug: string
  switches: DeskSwitch[]
  phase: 'upcoming' | 'running' | 'ended'
  closesAt: string
}) {
  const refusal = useRefusal()
  const locale = useLocale()
  const t = settingsDict(locale).event
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  function flip(key: string, next: boolean) {
    setError(null)
    setBusy(key)
    startTransition(async () => {
      const result = await setSpaceCapability(slug, key, next)
      setBusy(null)
      if (!result.ok) {
        setError(refusal(result.error))
        return
      }
      router.refresh()
    })
  }

  return (
    <section className="space-y-4 rounded-xl border border-line bg-surface-raised/40 p-5">
      <div>
        <h2 className="font-semibold text-ink">{t.desk}</h2>
        <p className="mt-1 text-sm text-ink-muted">
          {phase === 'running'
            ? fill(t.running, { when: new Date(closesAt).toLocaleString(locale) })
            : phase === 'upcoming'
              ? fill(t.upcoming, { when: new Date(closesAt).toLocaleString(locale) })
              : t.ended}
        </p>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      <ul className="space-y-2">
        {switches.map((entry) => (
          <li
            key={entry.key}
            className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm">{entry.label}</span>
              {!entry.allowed && (
                <span className="block text-xs text-ink-muted">
                  {t.notPartOf}
                </span>
              )}
            </span>

            <button
              type="button"
              role="switch"
              aria-checked={entry.allowed && entry.on}
              disabled={!entry.allowed || pending}
              onClick={() => flip(entry.key, !entry.on)}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs transition disabled:opacity-40 ${
                entry.allowed && entry.on
                  ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200'
                  : 'border-line text-ink-muted'
              }`}
            >
              {busy === entry.key ? '…' : entry.allowed && entry.on ? t.on : t.off}
            </button>
          </li>
        ))}
      </ul>

      <p className="text-xs text-ink-muted">{t.perRoom}</p>
    </section>
  )
}
