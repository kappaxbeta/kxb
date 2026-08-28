'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { startDestination } from '@/lib/telegram/deep-link'
import { useLaunchState } from '@/lib/telegram/use-telegram'
import { settle } from '@/lib/telegram/webapp'

/**
 * The first thing that runs inside the Mini App, and the only thing on /tg.
 *
 * Telegram opens one configured URL no matter which link was tapped, and says
 * which one in `?startapp=`. So this route is a switchboard: read the payload,
 * work out where it means, and get out of the way.
 *
 * `replace` rather than `push`, so Telegram's back button does not walk
 * somebody from the room they just entered onto a spinner that immediately
 * sends them back into it.
 */
export function Enter() {
  const router = useRouter()

  /**
   * `ready` is the whole reason this is not a plain `useLaunch()`.
   *
   * The launch is read after hydration, so the first render has no answer and
   * "no start param" is indistinguishable from "not looked yet". Acting on the
   * first one would bounce every single visitor to the home page a frame before
   * their token arrived - the bug would be invisible in development, where the
   * two renders happen close enough together to look like one.
   */
  const { ready, launch } = useLaunchState()

  /**
   * Read from the fragment only, and not from the SDK as well.
   *
   * `initDataUnsafe.start_param` is the same value by another route and was
   * worth reaching for until the ordering became clear: the script is loaded by
   * `TelegramShell`, which only loads it once the fragment has already said we
   * are in Telegram. So there is no case where the SDK has a start param and
   * the URL does not - the fallback could not run, and a fallback that cannot
   * run is worse than none, because it reads as coverage.
   */
  const start = launch?.startParam ?? null
  const destination = startDestination(start)

  useEffect(() => {
    if (!ready) return

    // The sheet is at half height and showing a placeholder until this runs -
    // done before the routing decision so the transition is a full-height
    // container the whole way, rather than a jump once the room loads.
    settle()

    if (destination) {
      router.replace(destination)
      return
    }

    // Opened from the menu button or an attachment rather than from a link.
    // There is nothing wrong and nowhere specific to be, so this is the front
    // door rather than an error.
    if (!start) router.replace('/')
  }, [ready, start, destination, router])

  /**
   * Derived rather than held in state, which is what keeps this route honest.
   *
   * There is exactly one thing that can go wrong here - a payload arrived and
   * meant nothing - and it is a function of the URL, not an event. Storing it
   * would mean a `setState` inside the effect above, a second render on every
   * visit, and a piece of state that can disagree with the address bar.
   */
  const problem =
    ready && start && !destination
      ? 'That link could not be read. Ask whoever sent it for a new one.'
      : null

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface p-6">
      <div className="w-full max-w-sm space-y-3 text-center">
        {problem ? (
          <>
            <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full border border-line bg-surface-raised text-2xl">
              🔒
            </div>
            <h1 className="text-lg font-semibold text-ink">This link didn&rsquo;t work</h1>
            <p className="text-sm text-ink-muted">{problem}</p>
          </>
        ) : (
          // Deliberately almost nothing. This page is on screen for one frame
          // in the ordinary case, and a logo that animates in is a flash of
          // branding between the chat and the room rather than a loading state.
          <p className="text-sm text-ink-muted" role="status">
            Opening&hellip;
          </p>
        )}
      </div>
    </div>
  )
}
