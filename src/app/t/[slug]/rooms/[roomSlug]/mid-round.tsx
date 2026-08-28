'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { attempt } from '@/app/components/connection'
import { reopenRound } from '@/domain/rooms/actions'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { workspaceDict } from '@/app/i18n/workspace'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * A room whose round has already started, seen from outside it.
 *
 * ---------------------------------------------------------------------------
 * Why the button is here and not only inside
 * ---------------------------------------------------------------------------
 * This page used to say that anybody in the room could reopen it and that it
 * was one button - which was true, and useless to the one person reading it,
 * because they were the person who could not get in to press it. A table nobody
 * is left at is a room that stays shut until somebody walks past the sidebar
 * and thinks to look.
 *
 * `reopenRound` was already any member's to call - see `atTable`, which checks
 * membership and the write block and deliberately not the role - so there was
 * never a rule to relax here. The button is simply where the person who wants
 * it is standing.
 *
 * It *is* an interruption, and the copy says so rather than hiding it: pressing
 * this opens the door on a hand somebody else is playing. That is the honest
 * shape of the control - the alternative is a knock, which is a feature and a
 * notification channel and a person who has to answer it, on a page nobody
 * should be on for more than a minute.
 *
 * ---------------------------------------------------------------------------
 * What happens after
 * ---------------------------------------------------------------------------
 * `router.refresh()`. The door is a server render - `admitToRoom` reads the
 * round off the read model - so refreshing is what turns this page into the
 * room. Nothing is pushed: the URL is already the room's, and this page was
 * only ever what that URL rendered while the round was on.
 */
export function MidRound({
  slug,
  roomId,
  roomName,
}: {
  slug: string
  roomId: string
  roomName: string
}) {
  const refusal = useRefusal()
  const t = workspaceDict(useLocale()).rooms
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function reopen() {
    setError(null)
    startTransition(async () => {
      const result = await attempt(() => reopenRound(slug, roomId))
      if (!result.ok) {
        setError(refusal(result.error))
        return
      }
      router.refresh()
    })
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-muted">
        {t.roundLabel}
      </p>
      <h1 className="mt-2 text-2xl font-medium">
        {fill(t.roundStarted, { name: roomName })}
      </h1>
      <p className="mt-3 text-sm text-ink-muted">{t.roundBody}</p>

      {error && (
        <p role="alert" className="mt-4 text-sm text-rose-300">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={reopen}
          disabled={pending}
          className="rounded-lg border border-accent/60 bg-accent/15 px-4 py-2 text-sm transition hover:border-accent disabled:opacity-40"
        >
          {pending ? t.opening : t.openTheDoor}
        </button>

        <Link
          href={`/t/${slug}/rooms`}
          className="text-sm text-accent hover:underline"
        >
          ← Rooms
        </Link>
      </div>
    </main>
  )
}
