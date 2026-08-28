'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { leaveAsGuest } from '@/domain/guests/actions'
import { useLocale } from '@/app/i18n/locale-context'
import { railDict } from '@/app/i18n/rail'

/**
 * The way out, for somebody who was let in.
 *
 * A member leaves a space by signing out, which is a thing they can do because
 * they have an account to sign back into. A guest has neither: the anonymous
 * session behind them is not something anybody can return to, so "sign out"
 * would have been a button that silently destroyed the only proof they were
 * ever admitted and then left them staring at a page they no longer had access
 * to, with no way to say what had happened.
 *
 * So the exit is its own act and says what it does. `leaveAsGuest` deletes the
 * admission and the anonymous account together - see the note there for why
 * both, and why leaving a *match* deliberately does not call this.
 *
 * `router.replace`, not `location.href`: this is a navigation, and a full
 * document load here would be a white flash on the way out of a 3D room that is
 * still holding a WebGL context. Replace rather than push, because the space
 * behind them no longer exists as far as their session is concerned, and Back
 * should not offer to take them there.
 */
export function GuestExit() {
  const t = railDict(useLocale()).exit
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="w-full rounded-lg border border-line px-3 py-2 text-xs text-ink-muted transition hover:border-accent/60 hover:text-ink"
      >
        {t.leaveSpace}
      </button>
    )
  }

  return (
    <div className="space-y-2 rounded-lg border border-line bg-surface-raised/40 p-3">
      {/*
        Said plainly, because it is true and irreversible. A visitor who leaves
        and then wants back in needs a fresh link - there is no account to sign
        into and nothing to remember them by.
      */}
      <p className="text-xs text-ink-muted">{t.warning}</p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => setConfirming(false)}
          className="flex-1 rounded-lg border border-line px-3 py-2 text-xs text-ink-muted transition hover:text-ink disabled:opacity-50"
        >
          {t.stay}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await leaveAsGuest()
              // Either way they are going: a failure here means the account
              // outlived the visit, which the reaper collects, and standing
              // them back in a room they just left would be the worse answer.
              router.replace(result.ok ? '/g/left' : '/')
            })
          }
          className="flex-1 rounded-lg bg-accent px-3 py-2 text-xs font-medium transition disabled:opacity-50"
        >
          {pending ? t.leaving : t.leave}
        </button>
      </div>
    </div>
  )
}
