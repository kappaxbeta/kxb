'use client'

import { useCallback, useEffect, useState } from 'react'
import { CRASH_ALT, CrashScreen, HomeLink } from '@/app/components/crash-screen'

/**
 * The screen for "your connection went, not our app".
 *
 * ---------------------------------------------------------------------------
 * Why this is not the 500 screen
 * ---------------------------------------------------------------------------
 * It used to be. Somebody standing in the lounge lost their connection for a
 * second, a Server Action's fetch threw `TypeError: network error`, React
 * handed it to the error boundary, and the world was replaced by a red card
 * apologising for a bug that had not happened. Three things were wrong with
 * that: it blamed us for their wifi, it offered a button they had to find and
 * press to recover from something that fixes itself, and it filed a crash
 * report for every commuter going through a tunnel.
 *
 * So this screen says something true, waits, and lets go on its own.
 *
 * ---------------------------------------------------------------------------
 * Why it retries on a schedule rather than just on `online`
 * ---------------------------------------------------------------------------
 * `navigator.onLine` answers "is there a network interface", not "can you
 * reach anything". A phone that holds one bar, a train's captive wifi, a
 * laptop waking from sleep - all of them stay "online" throughout, so an
 * `online` event that never fires would leave this card up forever. The event
 * is still listened for, because when it does fire it is the best signal there
 * is; the timer is what covers the rest.
 */

/**
 * How long to wait before each automatic attempt.
 *
 * Backing off rather than hammering: the first retry is quick because most
 * blips are, and by the fourth we are clearly waiting on something bigger than
 * a dropped packet. The array's length is also the cap - after the last one
 * this stops trying by itself and leaves the button, because a card retrying
 * forever is a page that quietly re-fetches all night in a tab nobody closed.
 */
const SCHEDULE_MS = [3_000, 8_000, 20_000, 45_000]

/**
 * How long since the last attempt before this counts as a *new* bad patch.
 *
 * The count lives at module scope, not in state, and it has to: a retry that
 * fails re-renders this same boundary, and a counter in `useState` would be
 * remounted back to zero by exactly the event it is supposed to be counting.
 * Module scope then has the opposite problem - a tunnel this morning would
 * still be spending this evening's retries - which is what the clock is for.
 */
const EPISODE_MS = 5 * 60_000

let attempts = 0
let lastAttempt = 0

/**
 * Waiting for the connection to come back.
 *
 * Rendered by the error boundaries in place of the crash screen when the error
 * was a failed fetch - see `isNetworkError`.
 */
export function ConnectionHold({ retry }: { retry: () => void }) {
  // Read once, on mount, so the render below never depends on a clock - a
  // countdown recomputed from `Date.now()` while rendering would disagree with
  // itself between the server's pass and the browser's.
  const [round, setRound] = useState(() => {
    if (Date.now() - lastAttempt > EPISODE_MS) attempts = 0
    return attempts
  })

  const exhausted = round >= SCHEDULE_MS.length
  const wait = exhausted ? 0 : SCHEDULE_MS[round]

  /** Seconds left on the current attempt, for the line under the heading. */
  const [left, setLeft] = useState(() => Math.ceil((SCHEDULE_MS[attempts] ?? 0) / 1000))

  const again = useCallback(
    (fresh: boolean) => {
      attempts = fresh ? 0 : attempts + 1
      lastAttempt = Date.now()
      setRound(attempts)
      setLeft(Math.ceil((SCHEDULE_MS[attempts] ?? 0) / 1000))
      retry()
    },
    [retry],
  )

  /**
   * The two signals worth jumping the queue for.
   *
   * `online` is the browser saying the interface came back. `visibilitychange`
   * is somebody returning to a tab they left - which on a phone is nearly
   * always a tab that was suspended while the network changed underneath it,
   * so the countdown they come back to is measuring a wait that is already
   * over. Both count as a fresh episode: an actual transition back is far
   * better evidence than four timers running out.
   *
   * Outside the schedule's effect, and that is the point: these keep listening
   * after the timers have given up. The card in that state promises the page
   * will pick up by itself the moment there is a line again, and this is what
   * makes that true rather than a nice sentence.
   */
  useEffect(() => {
    const wake = () => {
      if (document.visibilityState !== 'visible') return
      again(true)
    }

    window.addEventListener('online', wake)
    document.addEventListener('visibilitychange', wake)

    return () => {
      window.removeEventListener('online', wake)
      document.removeEventListener('visibilitychange', wake)
    }
  }, [again])

  useEffect(() => {
    if (exhausted) return

    const tick = setInterval(() => {
      setLeft((seconds) => (seconds > 0 ? seconds - 1 : 0))
    }, 1_000)

    const timer = setTimeout(() => again(false), wait)

    return () => {
      clearInterval(tick)
      clearTimeout(timer)
    }
  }, [again, exhausted, wait])

  return (
    <CrashScreen
      /* A numeral, like the 404 and the 500, because the three screens are one
         family and the odd one out would read as a different app's page. 408 is
         the closest true thing: the request timed out on the way. */
      code="408"
      tag="Still here"
      title={exhausted ? 'Still no connection' : 'Waiting for your connection'}
      /* The one who naps through it. Amber rather than the 500's red: nothing
         is broken, and a red card teaches people to distrust a green one. */
      avatar="koala-front"
      hue={40}
      body={
        exhausted ? (
          <>
            <p>
              We have tried a few times and the connection has not come back.
              Nothing is lost - this page will pick up where it left off the
              moment there is a line again.
            </p>
            <p className="mt-3">
              Worth checking whether anything else on this device can reach the
              internet.
            </p>
          </>
        ) : (
          <>
            <p>
              Your device could not reach us just now. This is almost always a
              moment of bad signal rather than anything wrong with the app.
            </p>
            <p className="mt-3" aria-live="polite">
              {left > 0
                ? `Trying again in ${left}s. Nothing to do - it will carry on by itself.`
                : 'Trying again…'}
            </p>
          </>
        )
      }
    >
      <button type="button" onClick={() => again(true)} className={CRASH_ALT}>
        Try now
      </button>
      <HomeLink />
    </CrashScreen>
  )
}
