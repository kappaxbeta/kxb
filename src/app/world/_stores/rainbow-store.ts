'use client'

import { useSyncExternalStore } from 'react'

/**
 * The rainbow switch, published by the scene and pressed from the rail.
 *
 * The same arrangement as `party-store`, for the same reasons, and that file is
 * where they are written down: the control belongs in the Room tab, the channel
 * belongs to the scene, so the scene publishes a function and the rail calls it.
 * A broadcast rather than a row, too - a rainbow is a thing that is happening in
 * a room, not a thing a space *is*, so it starts when somebody says so, is seen
 * by everybody standing there, and is gone after a reload.
 *
 * Kept as its own store rather than folded into the party's. The two switches
 * are independent - a room can be pink, rainbow, both or neither - and sharing
 * one record would mean either publishing an object where the party publishes a
 * boolean, or a scene that has to remember to republish the party every time it
 * changes the rainbow.
 */

export interface RainbowState {
  /** Whether the world is glass right now. */
  on: boolean
  /** Whether this viewer may change that. Owners and admins only. */
  canSet: boolean
}

export interface RainbowActions {
  set: (on: boolean) => void
}

const OFF: RainbowState = { on: false, canSet: false }

let state: RainbowState = OFF
let actions: RainbowActions | null = null

const listeners = new Set<() => void>()

/**
 * The scene publishing itself, and taking it back on unmount.
 *
 * Called with `null` to clear, which every scene must do: a stale `set` left
 * behind after a canvas unmounts is a button in the rail that broadcasts into a
 * channel nobody is listening on.
 */
export function publishRainbow(next: { state: RainbowState; actions: RainbowActions } | null) {
  state = next?.state ?? OFF
  actions = next?.actions ?? null
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const snapshot = () => state

/** The server has no scene and no rainbow. */
const serverSnapshot = () => OFF

export function useRainbowSwitch(): RainbowState & { set: ((on: boolean) => void) | null } {
  const current = useSyncExternalStore(subscribe, snapshot, serverSnapshot)
  return { ...current, set: current.canSet && actions ? actions.set : null }
}
