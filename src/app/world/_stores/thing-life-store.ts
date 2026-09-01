'use client'

import type { Claim } from '@/domain/thingiverse/live'

/**
 * The way in to the machines, for whoever is holding the keyboard.
 *
 * ---------------------------------------------------------------------------
 * Why a module store rather than a prop or a context
 * ---------------------------------------------------------------------------
 * The two ends are on opposite sides of the Canvas and always will be. The
 * machines are stepped by a frame loop, which can only live *inside* it; the
 * keys are handled by the scene, which lives outside it and must, because a
 * `keydown` listener belongs to the document rather than to a WebGL context.
 * There is a common ancestor - `LoungeScene` - but threading a callback up out
 * of the Canvas to it means a `setState` during the first frame, which is a
 * re-render of the whole scene to deliver a function that never changes.
 *
 * So: the same arrangement `face-store` and `stamina-store` already use for the
 * same shape of problem. One fact, two sides of a boundary, no provider worth
 * building.
 *
 * ---------------------------------------------------------------------------
 * No `useSyncExternalStore`, and that is the difference from its neighbours
 * ---------------------------------------------------------------------------
 * Nothing renders from this. The value is a function that input handlers call,
 * and a subscription would exist only to re-render components that do not read
 * it. A plain module variable and two functions is the whole of what is needed.
 *
 * Ephemeral by construction, like every other store here: a claim sent while
 * nothing is published is dropped, which is exactly right - it means no scene
 * is mounted, so there is nothing for it to have happened to.
 */

let claiming: ((claim: Claim) => void) | null = null
let reading: ((id: string) => ReadonlyMap<string, string>) | null = null
let me = ''

/**
 * Say where claims go, or that they go nowhere.
 *
 * Called by `useThingLife` on mount and again with `null` on unmount. The null
 * matters: a stale function from a torn-down scene would push into a queue
 * nobody drains, which is a leak that only shows up after somebody walks
 * between rooms a few times.
 */
export function publishClaims(
  next: ((claim: Claim) => void) | null,
  slots?: (id: string) => ReadonlyMap<string, string>,
  conn?: string,
): void {
  claiming = next
  reading = next === null ? null : (slots ?? null)
  me = next === null ? '' : (conn ?? '')
}

/**
 * What is on a thing right now, for whoever is deciding what a key means.
 *
 * The empty map when no scene is listening, rather than null, so the caller can
 * hand it straight to `reachFor` without a branch - and "a table with nothing
 * on it" is the right reading of "there is no room mounted" anyway.
 */
export function slotsOn(id: string): ReadonlyMap<string, string> {
  return reading?.(id) ?? EMPTY
}

/** This tab, so a claim can be answered. See `Pulse.gave`. */
export function myConn(): string {
  return me
}

const EMPTY: ReadonlyMap<string, string> = new Map()

/**
 * Tell whoever is running the machines what you just did.
 *
 * Silently nothing when no scene is listening. That is deliberate and is not
 * swallowing an error: every caller is an input handler that fires whether or
 * not there is a machine anywhere near it, and making them all ask first would
 * put the same null check in five places.
 */
export function claimThing(claim: Claim): void {
  claiming?.(claim)
}
