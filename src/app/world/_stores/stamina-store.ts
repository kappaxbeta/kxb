'use client'

import { useSyncExternalStore } from 'react'

/**
 * Whether running costs anything in this space, while you are standing in it.
 *
 * The durable answer is a capability on the tenant, read by the page and handed
 * to the scene as a prop. This is the *live* half: an owner or admin flipping
 * the switch in the rail should see the bar appear immediately, in the world
 * they are standing in, without the page they are standing on being re-rendered
 * around them.
 *
 * That is not a nicety. The action deliberately does not revalidate - see
 * `setStamina` - because revalidating the layout while a scene is mounted tears
 * down the WebGL context for everybody looking through it. So the switch writes
 * the log *and* rings this bell, the scene hears it, and the next page load
 * agrees with both.
 *
 * `null` means "nobody has said", and the scene keeps whatever it was given by
 * the server - which is what makes the seam safe to mount beside a scene that
 * already has an answer.
 */

let override: boolean | null = null
const listeners = new Set<() => void>()

/** The rail flipped it. Whoever is drawing a world, take this instead. */
export function setStaminaNow(on: boolean): void {
  override = on
  for (const listener of listeners) listener()
}

/** Forget it, on leaving the space. The server's answer is authoritative again. */
export function clearStamina(): void {
  if (override === null) return
  override = null
  for (const listener of listeners) listener()
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
export function useStaminaOverride(): boolean | null {
  return useSyncExternalStore(subscribe, snapshot, onServer)
}
