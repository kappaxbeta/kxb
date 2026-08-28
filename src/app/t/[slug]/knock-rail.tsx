'use client'

import Image from 'next/image'
import { useCallback, useEffect, useState, useTransition } from 'react'
import { admitGuest, refuseGuest } from '@/domain/guests/actions'
import type { KnockView } from '@/domain/guests/queries'
import { avatarShotUrl } from '@/domain/lounge/avatars'
import { useLocale } from '@/app/i18n/locale-context'
import { railDict } from '@/app/i18n/rail'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * Somebody at the door.
 *
 * In the rail rather than in the lounge, and that is the decision this file is
 * really about. A knock arrives while the space is being *used* - somebody is
 * reading the board, writing a page, halfway through a match - and a doorbell
 * that only rings in one room is one that mostly does not ring. The rail is on
 * every page under /t/[slug], so wherever anybody happens to be, they can
 * answer.
 *
 * Shown to every member, not only owners and admins, which is deliberately
 * wider than the guest-links panel below it. Handing out a way in is an
 * administrative act; answering a door somebody has already been sent to is
 * not, and making it one would leave visitors waiting out their ten minutes in
 * front of a room full of people who could see them.
 *
 * Renders nothing at all when nobody is waiting - no heading, no empty state.
 * A permanent "nobody at the door" panel would be a piece of furniture that is
 * right 99% of the time and therefore never read on the occasion it is wrong.
 */

/**
 * How often to look.
 *
 * Slow on purpose. This runs on every page in the space for every member, so
 * the cost is per-person-per-page and worth being frugal with; a knock lives ten
 * minutes, so eight seconds of latency on noticing one is nothing to the person
 * waiting. Realtime would be the obvious upgrade and is not worth a table
 * subscription for a doorbell that rings a few times a week.
 */
const POLL_MS = 8000

export function KnockRail({ slug }: { slug: string }) {
  const refusal = useRefusal()
  const t = railDict(useLocale()).visitors
  const [knocks, setKnocks] = useState<KnockView[]>([])
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  /**
   * A route handler, not the Server Action this used to call.
   *
   * `src/app/api/t/[slug]/knocks/route.ts` has the reason, and it is worth
   * knowing from this side too: a Server Action that refreshes the session
   * writes cookies, and Next answers a cookie-writing action by re-rendering
   * the whole page it was called from. On a timer, on every page in the space,
   * that is the doorbell quietly rebuilding whatever anybody is working on
   * every eight seconds.
   */
  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/t/${encodeURIComponent(slug)}/knocks`)
      if (!response.ok) return
      setKnocks((await response.json()) as KnockView[])
    } catch {
      // A failed poll is not worth telling anybody about - the next one is
      // eight seconds away, and an error banner in the rail on a flaky
      // connection would be the most visible thing on every page.
    }
  }, [slug])

  useEffect(() => {
    let live = true

    /**
     * Nothing while the tab is in the background.
     *
     * A doorbell nobody is looking at does not need to ring on schedule, and a
     * space left open in a tab all afternoon was polling all afternoon. Coming
     * back asks immediately, so the first thing a returning tab shows is
     * current rather than however old the last answer was.
     */
    const tick = async () => {
      if (!live || document.hidden) return
      await refresh()
    }

    const wake = () => {
      if (!document.hidden) void tick()
    }

    void tick()
    const timer = setInterval(tick, POLL_MS)
    document.addEventListener('visibilitychange', wake)

    return () => {
      live = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', wake)
    }
  }, [refresh])

  const answer = (
    guestId: string,
    action: () => Promise<{ ok: boolean; error?: string }>,
  ) => {
    setError(null)
    // Dropped from the list before the round trip. The two answers are both
    // final and neither has anything to show afterwards, so leaving the row
    // sitting there mid-request reads as the button not having worked.
    setKnocks((current) => current.filter((knock) => knock.guestId !== guestId))

    start(async () => {
      const result = await action()
      if (!result.ok) setError(refusal(result.error ?? t.thatDidNotWork))
      // Either way, re-read: a failure usually means somebody else answered
      // first, and the list should say so rather than argue.
      await refresh()
    })
  }

  if (knocks.length === 0) return null

  return (
    <div className="space-y-2 border-t border-line pt-3">
      <h2 className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-400">
        {t.atTheDoor}
      </h2>

      {error && (
        <p role="alert" className="px-3 text-[10px] text-red-400">
          {error}
        </p>
      )}

      <ul className="space-y-1 px-2">
        {knocks.map((knock) => (
          <li
            key={knock.guestId}
            className="rounded-lg border border-line bg-surface-raised/60 p-2"
          >
            <div className="flex items-center gap-2">
              {/* The animal they picked, which with the name is everything the
                  person deciding has to go on. */}
              {knock.avatar && (
                <span className="relative size-7 shrink-0 overflow-hidden rounded-full border border-line bg-surface">
                  <Image
                    src={avatarShotUrl(knock.avatar)}
                    alt=""
                    fill
                    sizes="28px"
                    className="object-contain p-0.5"
                  />
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink">
                {knock.displayName}
              </span>
            </div>

            <div className="mt-2 flex gap-1">
              <button
                type="button"
                disabled={pending}
                onClick={() => answer(knock.guestId, () => admitGuest(slug, knock.guestId))}
                className="flex-1 rounded-md bg-accent px-2 py-1 text-[11px] font-medium text-white transition hover:opacity-90 disabled:opacity-40"
              >
                {t.letIn}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => answer(knock.guestId, () => refuseGuest(slug, knock.guestId))}
                className="rounded-md border border-line px-2 py-1 text-[11px] text-ink-muted transition hover:text-ink disabled:opacity-40"
              >
                {t.notNow}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
