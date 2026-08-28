'use client'

import { useEffect } from 'react'
import {
  MIN_SESSION_SECONDS,
  elapsedSeconds,
  type PlayedSession,
  type SessionOutcome,
} from '@/domain/xps/sessions'

/**
 * The half of a session that happens in the browser: a clock, and one send.
 *
 * docs/xp/creator.md §18.6. Mounted beside a level that is really being played -
 * a room, a match - and not beside one being *tried*: the editor's preview
 * mounts the same runtime and writes nothing, because practice is not takings
 * and §18.6 says so in as many words about the `local` adapter.
 *
 * ---------------------------------------------------------------------------
 * Beside the scene rather than inside it
 * ---------------------------------------------------------------------------
 * This needs two facts - which world, and which instance - and nothing else
 * from the runtime. Threading it through `XpScene` would put a ledger inside
 * the component whose whole property is that it has no branch on *which* XP is
 * loaded, and would make every call site of the scene declare a position on
 * something only two of them have an opinion about. A sibling element renders
 * nothing, costs one effect, and leaves the scene alone.
 *
 * ---------------------------------------------------------------------------
 * Why the send is a beacon
 * ---------------------------------------------------------------------------
 * Sessions end by the tab closing far more often than by anybody navigating
 * politely, and an ordinary `fetch` in a cleanup is cancelled when the document
 * goes. `sendBeacon` is the one send the browser promises to deliver after the
 * page is gone; `keepalive` is the fallback for the same reason `track()` uses
 * it, and it is second because it is a promise about a request the page may no
 * longer be around to hold.
 *
 * Nothing is awaited and nothing is shown. See the route for why that is the
 * strong form of Section 9's rule rather than a way around it.
 */

/** Where the beacon lands. Same origin, so the session cookie rides along. */
const ENDPOINT = '/api/xp/sessions'

export function PlaySession({
  xpRef,
  instance,
}: {
  /** As `domain/xps/ref.ts` spells it: `sidestep`, or `p-<uuid>-v3`. */
  xpRef: string
  /** The room or match id, when this is being played with other people in it. */
  instance?: string
}) {
  useEffect(() => {
    /**
     * Two clocks, on purpose.
     *
     * `performance.now()` measures how long, because it is monotonic and does
     * not move when the system clock is corrected - the same argument
     * `localHost` makes about a match timer nobody trusts after NTP steps.
     * `Date` says *when*, because a monotonic clock cannot: it counts from an
     * origin only this document knows.
     */
    let startedAtMs = performance.now()
    let startedAt = new Date().toISOString()
    let sent = false

    const report = (outcome: SessionOutcome) => {
      if (sent) return
      const seconds = elapsedSeconds(startedAtMs, performance.now())

      /**
       * A glance is not a session, and it is dropped here as well as on the
       * server.
       *
       * Not belt and braces: React mounts an effect twice in development, so
       * without this every level would report a zero-second session on the
       * first teardown - a row the route would refuse anyway, arriving as a
       * request per mount for nothing.
       */
      if (seconds < MIN_SESSION_SECONDS) return
      sent = true

      const played: PlayedSession = {
        ref: xpRef,
        instance: instance ?? null,
        startedAt,
        seconds,
        outcome,
      }
      const body = JSON.stringify(played)

      // A typed Blob rather than the string: `sendBeacon` posts text/plain
      // otherwise, and the route reads JSON.
      const beacon =
        typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function'
          ? navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }))
          : false
      if (beacon) return

      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {
        // The ledger never breaks the game it is measuring.
      })
    }

    /**
     * `pagehide`, not `beforeunload`.
     *
     * The same choice `local.ts` makes about saying goodbye, for the same
     * reason: `beforeunload` does not fire reliably on mobile or when a tab is
     * discarded, which is most of how a session on a phone actually ends.
     */
    const leaving = () => report('left')
    window.addEventListener('pagehide', leaving)

    /**
     * A page restored from the back/forward cache is a new session.
     *
     * `pagehide` fired and the row is written, and then the same document comes
     * back with somebody standing in the level again. Without this the clock
     * would still be running from before the tab was hidden and the second
     * session would be reported as hours long - or, because the send has
     * already latched, not at all.
     */
    const restored = (event: PageTransitionEvent) => {
      if (!event.persisted) return
      startedAtMs = performance.now()
      startedAt = new Date().toISOString()
      sent = false
    }
    window.addEventListener('pageshow', restored)

    return () => {
      window.removeEventListener('pagehide', leaving)
      window.removeEventListener('pageshow', restored)
      /**
       * Walking out of the level, which is the polite half of the same event.
       *
       * `left` for both, and `finished` is deliberately unreachable today:
       * nothing in the runtime has an end yet - "end the match" is still open
       * work in docs/xp/backlog.md §0.3 - and a session reported as finished
       * because the tab closed would be a lie in the one column a payout rule
       * might eventually read. The constraint keeps all three of §18.6's words
       * so that the day a match can end, only the caller changes.
       */
      report('left')
    }
  }, [xpRef, instance])

  return null
}
