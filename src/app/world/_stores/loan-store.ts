'use client'

import { useSyncExternalStore } from 'react'

/**
 * Whether the next thing you summon stays behind you.
 *
 * A preference of this browser's, not a fact about the world - so it lives in
 * `localStorage`, beside the radio's and the block picker's, and never in the
 * log. What *is* in the log is each thing's own answer, because the sweep that
 * acts on it has to work for a tab that was closed rather than left. See
 * `ThingSummoned.keep`.
 *
 * ---------------------------------------------------------------------------
 * Why this is a store and not a `useState` in the hook that reads it
 * ---------------------------------------------------------------------------
 * Because the value comes out of storage, and storage does not exist on the
 * server. A lazy `useState` initialiser reading it would make the first client
 * render disagree with the server's - a hydration mismatch, on a preference.
 * An effect that reads it and calls `setState` is the other obvious shape and
 * is a cascading render, which the lint rule says so about.
 *
 * `useSyncExternalStore` is the shape React provides for exactly this: a server
 * snapshot that is always "things stay", a client snapshot read from storage,
 * and no render in between that has to be right about both.
 */

const KEY = 'kxb:thingiverse:loans'

/**
 * The value is a *word*, not a boolean.
 *
 * So a stray entry from some other build, or a half-written value, reads as
 * neither and falls back to the safe answer - which is that things stay, and
 * nobody loses anything they meant to keep.
 */
function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== 'loan'
  } catch {
    // Private mode, storage denied. See `storage-denied` in the world's notes:
    // the accessor itself throws in some browsers, so this cannot be a
    // truthiness check on the result.
    return true
  }
}

const listeners = new Set<() => void>()

/**
 * Cached, because `getSnapshot` must be cheap and must not change identity for
 * an unchanged value - it is called on every render of every subscriber, and a
 * `localStorage` read per render of a scene is a synchronous disk hit sixty
 * times a second.
 */
let current: boolean | null = null

function snapshot(): boolean {
  if (current === null) current = read()
  return current
}

/** The server has no storage and no preference. Things stay. */
function onServer(): boolean {
  return true
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Set it, for this browser and from now on. */
export function chooseLoans(keep: boolean): void {
  current = keep
  try {
    window.localStorage.setItem(KEY, keep ? 'keep' : 'loan')
  } catch {
    // A preference that cannot be written is one that lasts for this visit,
    // which is better than an error nobody can act on.
  }
  for (const listener of listeners) listener()
}

/** Whether the next thing summoned stays when its owner leaves. */
export function useKeepDefault(): boolean {
  return useSyncExternalStore(subscribe, snapshot, onServer)
}
