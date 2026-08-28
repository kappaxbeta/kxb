'use client'

import { useEffect, useSyncExternalStore } from 'react'

/**
 * Whether this client can currently reach anybody.
 *
 * Two unrelated things can break the same way from where the user sits, so both
 * report here rather than each growing its own indicator:
 *
 *  - The device is offline. `navigator.onLine` and the window's online/offline
 *    events, read below.
 *  - The device is online but the realtime channel is not. A room whose
 *    subscription errored or timed out looks exactly like an empty room -
 *    nobody arrives, nothing you do reaches anyone - and that is the failure
 *    worth telling somebody about, because unlike being offline there is no
 *    other sign of it anywhere on the machine.
 *
 * A module-level store rather than context: the thing that reports (a room deep
 * in the tree) and the thing that renders (the favicon, in the root layout) are
 * on opposite sides of the app, and a provider spanning both would re-render
 * every page in between on a state most of them do not read.
 */

let realtimeDown = false
const listeners = new Set<() => void>()

function announce() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Report that the realtime channel is up or down.
 *
 * Counted rather than set, because two rooms can be mounted at once - the
 * lounge behind a battle, say - and the healthy one flipping this back to false
 * on the broken one's behalf is how an indicator ends up permanently green.
 */
let downCount = 0

function reportDown(down: boolean) {
  downCount = Math.max(0, downCount + (down ? 1 : -1))
  const next = downCount > 0
  if (next === realtimeDown) return
  realtimeDown = next
  announce()
}

/**
 * Declare, for as long as this component is mounted, that its channel is down.
 *
 * A hook and not a setter so the report cannot outlive the room that made it:
 * navigating away from a broken room clears it, which a bare `setDown(true)`
 * in a `.subscribe()` callback would not.
 */
export function useReportConnection(down: boolean) {
  useEffect(() => {
    if (!down) return
    reportDown(true)
    return () => reportDown(false)
  }, [down])
}

/** True when the browser itself says there is no network. */
function subscribeOnline(listener: () => void) {
  window.addEventListener('online', listener)
  window.addEventListener('offline', listener)
  return () => {
    window.removeEventListener('online', listener)
    window.removeEventListener('offline', listener)
  }
}

const both = (listener: () => void) => {
  const drop = [subscribe(listener), subscribeOnline(listener)]
  return () => {
    for (const stop of drop) stop()
  }
}

/**
 * Whether to show the disconnected state.
 *
 * The server snapshot is `false` on purpose. There is no way to know a client's
 * network from the server, and guessing "offline" would render every first
 * paint in the alarm state and then correct itself - a red flash on a page that
 * was fine all along.
 */
export function useConnectionLost(): boolean {
  return useSyncExternalStore(
    both,
    () => realtimeDown || navigator.onLine === false,
    () => false,
  )
}

/**
 * The message shapes a browser uses when a request never reached anybody.
 *
 * Every one of these is a `TypeError` from `fetch`, and every browser words it
 * differently - which is why this is a list rather than a check for one string.
 * The one that started this file's second half was WebKit's `network error`,
 * filed in the backoffice as a crash on /t/[slug]/lounge with no stack under
 * it, because that is all a failed fetch has to give.
 *
 * Deliberately narrow. Anything vaguer - `Connection closed`, say, which Next
 * also throws when the *server* dies mid-stream - would quietly turn real
 * outages into "your wifi, probably", which is the failure mode this whole
 * mechanism has to avoid. A pattern earns its place here only if the server
 * cannot be the cause.
 */
const NETWORK_MESSAGES = [
  'failed to fetch', // Chromium
  'networkerror', // Firefox: "NetworkError when attempting to fetch resource."
  'network error', // WebKit
  'network request failed',
  'network connection was lost', // iOS, mid-request
  'load failed', // Safari
  'fetch failed', // undici, when a Server Component is the one fetching
  'connection appears to be offline',
  'err_internet_disconnected',
  'failed to fetch rsc payload', // Next's router, on a navigation or refresh
]

/** Did this fail because the request never left the building? */
export function isNetworkError(error: unknown): boolean {
  if (!error) return false
  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase()
  return NETWORK_MESSAGES.some((pattern) => message.includes(pattern))
}

/** What a caller shows when the connection, not the server, said no. */
export const OFFLINE_NOTE = 'No connection - that did not reach the server.'

/**
 * Call a Server Action as if a dead connection were an ordinary refusal.
 *
 * Every action in this app answers `{ ok, error }`, and every caller is written
 * for that. What none of them were written for is the call *rejecting*: a
 * Server Action is a fetch, a fetch on a dropped connection throws a TypeError,
 * and a TypeError thrown inside `startTransition(async …)` is not an unhandled
 * rejection somewhere off to the side - React hands it to the nearest error
 * boundary. So a moment of bad wifi while somebody was standing in the lounge
 * replaced the entire world with the 500 screen, and the world is where they
 * were, with their position, their pointer lock and everything they had not
 * saved yet in it.
 *
 * This makes that case say what it is, in the panel the button was in, and
 * leaves the scene standing. Anything that is not a network failure is
 * rethrown untouched - a real bug still reaches the boundary, and so do
 * `redirect()` and `notFound()`, which are throws too.
 */
export async function attempt<T>(
  run: () => Promise<T>,
): Promise<T | { ok: false; error: string }> {
  try {
    return await run()
  } catch (error) {
    if (!isNetworkError(error)) throw error
    return { ok: false, error: OFFLINE_NOTE }
  }
}
