'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { PeepPicker, PeepPortrait } from '@/app/components/peep-picker'
import { chooseAvatar } from '@/domain/profile/avatar-actions'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { workspaceDict } from '@/app/i18n/workspace'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * "You're in. Who are you?"
 *
 * A real window - fixed over the workspace rather than a panel inside it -
 * because the rail behind it is a menu for a space this person has been a
 * member of for four seconds. Dimming it and asking one question is the honest
 * shape of the moment; laying the question out as a page section invites
 * navigating away from it, which is exactly the outcome the door exists to
 * prevent.
 *
 * Not modal in the trapping sense, though. Escape and the close button both
 * work and both mean "the penguin is fine", because the answer is genuinely
 * optional and changeable in Settings forever after.
 */
export function PeepWindow({
  slug,
  tenantName,
  initialAvatar,
}: {
  slug: string
  tenantName: string
  initialAvatar: string
}) {
  const refusal = useRefusal()
  const router = useRouter()
  const t = workspaceDict(useLocale()).welcome
  const [avatar, setAvatar] = useState(initialAvatar)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  /**
   * Saved on click, not on the way out.
   *
   * Which is what makes closing this window safe from any direction - the
   * button, Escape, or a browser Back. There is no unsaved state in here to
   * lose, so nothing has to ask "are you sure".
   */
  function pick(next: string) {
    if (next === avatar) return

    const previous = avatar
    setAvatar(next)
    setError(null)

    startTransition(async () => {
      const result = await chooseAvatar(next)
      if (!result.ok) {
        setAvatar(previous)
        setError(refusal(result.error))
      }
    })
  }

  /**
   * Into the space itself, not into a surface of it.
   *
   * This pointed at `/tasks`, which has been a 404 since the tasks flag was
   * withdrawn - that route calls `requireFeature(context, 'tasks')` and the
   * flag's fallback is `false` on purpose. So the very first thing a new member
   * did here, answering the one question the door asks, ended on a not-found
   * page. `createTenant` already made this correction for the owner's side of
   * the same moment; this is the member's.
   */
  function enter() {
    router.replace(`/t/${slug}`)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Welcome to ${tenantName}`}
      // Escape closes it. Focus starts here so that keypress lands somewhere,
      // and the outline is suppressed because the ring belongs on the thing you
      // tabbed to, not on the backdrop that happened to be focused first.
      tabIndex={-1}
      autoFocus
      onKeyDown={(event) => {
        if (event.key === 'Escape') enter()
      }}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm outline-none"
    >
      <div className="enter my-auto w-full max-w-lg rounded-2xl border border-line bg-surface-raised p-6 shadow-2xl sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs tracking-widest text-accent uppercase">{t.youreIn}</p>
            <h1 className="font-pixel mt-2 text-2xl leading-tight sm:text-3xl">
              {fill(t.heading, { space: tenantName })}
            </h1>
          </div>
          <button
            type="button"
            onClick={enter}
            aria-label={t.close}
            className="rounded-full border border-line px-2.5 py-1 text-sm text-ink-muted transition hover:bg-surface hover:text-ink"
          >
            ✕
          </button>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          {t.body}
        </p>

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs font-medium text-red-500"
          >
            ✕ {error}
          </div>
        )}

        <div className="mt-5 flex flex-col items-center gap-4 sm:flex-row sm:items-end">
          <PeepPortrait avatar={avatar} />
          <p className="text-sm text-ink-muted">
            {t.youAreLead}
            <span className="text-ink capitalize">{avatar}</span>
            {t.youAreTail}
          </p>
        </div>

        <div className="mt-5">
          <PeepPicker selected={avatar} onSelect={pick} />
        </div>

        <button
          type="button"
          onClick={enter}
          disabled={isPending}
          className="mt-6 w-full rounded-full bg-accent px-6 py-3 font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? t.saving : fill(t.enter, { space: tenantName })}
        </button>
      </div>
    </div>
  )
}
