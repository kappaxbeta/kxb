'use client'

import { useSyncExternalStore } from 'react'

/**
 * Whether a bad connection is drawn as a glitch in this space, while you are
 * standing in it - and a way to see what that looks like without one.
 *
 * The durable answer is the `glitch` capability on the tenant, read by the
 * page and handed to the scene as a prop. This is the *live* half, on exactly
 * the terms of `stamina-store`: an owner flipping the switch in the rail must
 * see the room change at once, and the action deliberately does not
 * revalidate, because revalidating the layout tears down the WebGL context
 * everybody in the room is looking through. The rail writes the log *and*
 * rings this bell; the next page load agrees with both.
 *
 * The preview is the second thing here, and it is local only. A glitch that
 * needs a bad link to appear is a feature nobody can check they have switched
 * on, so the rail's test button puts *your own* body at full strength for a
 * few seconds - yours and not the peers', because making the people around
 * you look broken to check a switch is a strange thing to do to them, and the
 * mirror camera is right there. Nothing goes on the wire: what the person
 * next to you sees is unchanged, which is what a *test* should be. Read from
 * the frame loop as a plain function rather than a hook, because that is
 * where the strength is decided and a hook has no business there.
 */

let override: boolean | null = null
let previewUntil = 0
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

/** The rail flipped it. Whoever is drawing a world, take this instead. */
export function setGlitchNow(on: boolean): void {
  override = on
  notify()
}

/** Forget it, on leaving the space. The server's answer is authoritative again. */
export function clearGlitch(): void {
  if (override === null && previewUntil === 0) return
  override = null
  previewUntil = 0
  notify()
}

/** How long the test button holds your body at full glitch, in ms. */
export const GLITCH_PREVIEW_MS = 6000

/** Glitch your own body, for a moment, on this client only. */
export function previewGlitch(now: number = performance.now()): void {
  previewUntil = now + GLITCH_PREVIEW_MS
}

/** Whether the test button's moment is still running. For frame loops. */
export function glitchPreviewing(now: number = performance.now()): boolean {
  return now < previewUntil
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function snapshot(): boolean | null {
  return override
}

function onServer(): boolean | null {
  return null
}

/** What the rail last said, or null if it has not. */
export function useGlitchOverride(): boolean | null {
  return useSyncExternalStore(subscribe, snapshot, onServer)
}
