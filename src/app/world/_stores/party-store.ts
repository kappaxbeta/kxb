'use client'

import { useSyncExternalStore } from 'react'

/**
 * The party switch, published by the scene and pressed from the rail.
 *
 * Exactly the arrangement `chat-store` explains, and for exactly its reason:
 * the control belongs in the Room tab - it is a thing you do to the room, next
 * to the front door and the room list - and the *channel* belongs to the scene,
 * which is the only subscriber to the lounge topic and must stay the only one.
 * So the scene publishes a function, the rail calls it, and nobody else touches
 * a socket.
 *
 * Deliberately not a workspace setting. A party is a thing that is happening,
 * not a thing a space *is*: it wants to start when somebody says so, be seen by
 * everybody standing there, and be gone by tomorrow morning. That makes it a
 * broadcast rather than a row - no migration, no projection, nothing to clean
 * up, and a page reload leaves it behind, which is the right behaviour for a
 * light show.
 *
 * The absent case is the common one: no scene mounted, or a scene with no
 * presence channel. `useParty` then reports a switch that cannot be thrown, and
 * the rail draws nothing rather than a dead control.
 */

export interface PartyState {
  /** Whether the lights are on right now. */
  on: boolean
  /** Whether this viewer may change that. Owners and admins only. */
  canSet: boolean
}

export interface PartyActions {
  set: (on: boolean) => void
}

const OFF: PartyState = { on: false, canSet: false }

let state: PartyState = OFF
let actions: PartyActions | null = null

const listeners = new Set<() => void>()

function announce() {
  for (const listener of listeners) listener()
}

/**
 * The scene publishing itself, and taking it back on unmount.
 *
 * Called with `null` to clear, which every scene must do: a stale `set` left
 * behind after a canvas unmounts is a button in the rail that broadcasts into a
 * channel nobody is listening on.
 */
export function publishParty(next: { state: PartyState; actions: PartyActions } | null) {
  state = next?.state ?? OFF
  actions = next?.actions ?? null
  announce()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function snapshot(): PartyState {
  return state
}

/** The server has no scene and no party. */
function serverSnapshot(): PartyState {
  return OFF
}

export function useParty(): PartyState & { set: ((on: boolean) => void) | null } {
  const current = useSyncExternalStore(subscribe, snapshot, serverSnapshot)
  return { ...current, set: current.canSet && actions ? actions.set : null }
}
