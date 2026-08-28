'use client'

import { useSyncExternalStore } from 'react'
import type { Knock } from '@/app/world/_presence/room-presence'
import type { DoorMode } from '@/domain/homestead/events'

/**
 * Your own front door, published out of the scene for the rail to render.
 *
 * The same seam as `here-store`, and for the same reason: the control belongs
 * beside the roster in the sidebar, the sidebar is a layout several routes
 * above the scene, and only the scene is joined to the presence channel that
 * knows who is knocking. A module-level store lets the scene write and the rail
 * read without either importing the other.
 *
 * Ephemeral by construction. Walk out of your own homestead and there is no
 * door to answer, so the section disappears rather than going stale.
 */

export interface DoorControl {
  slug: string
  /** The setting as the server last recorded it. The rail owns it after that. */
  mode: DoorMode
  /** People waiting to be let in. Only ever non-empty for the owner. */
  knocks: Knock[]
}

/**
 * The actions, kept out of the snapshot on purpose.
 *
 * `useSyncExternalStore` compares snapshots by identity, and these are
 * closures that `useRoom` rebuilds on most renders - putting them in the
 * snapshot would hand back a new object every time and spin the rail forever.
 * They are read at click time instead, when the latest set is the right set
 * anyway.
 */
export interface DoorActions {
  admit: (userId: string) => void
  refuse: (userId: string) => void
  eject: (userId: string) => void
}

let actions: DoorActions | null = null
let current: DoorControl | null = null
const listeners = new Set<() => void>()

function announce() {
  for (const listener of listeners) listener()
}

function sameKnocks(a: Knock[], b: Knock[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (knock, index) =>
        knock.userId === b[index].userId && knock.name === b[index].name,
    )
  )
}

/**
 * Report the door you are standing behind.
 *
 * Called from the scene on every render, so the equality check is what keeps a
 * quiet homestead from re-rendering the rail sixty times a second.
 */
export function publishDoor(control: DoorControl, next: DoorActions): void {
  actions = next

  if (
    current &&
    current.slug === control.slug &&
    current.mode === control.mode &&
    sameKnocks(current.knocks, control.knocks)
  ) {
    return
  }

  current = control
  announce()
}

/**
 * Stop reporting, on unmount.
 *
 * Guarded on the slug for the reason `leaveHere` is: two scenes overlap for a
 * moment during a client-side navigation, and the arriving one publishes before
 * the departing one cleans up. Without the guard, walking from your café to
 * your home would blank the door panel until the next render.
 */
export function clearDoor(slug: string): void {
  if (current?.slug !== slug) return
  current = null
  actions = null
  announce()
}

export function doorActions(): DoorActions | null {
  return actions
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The door right now, read outside React. */
export function doorNow(): DoorControl | null {
  return current
}

function serverSnapshot(): DoorControl | null {
  return null
}

/** Your front door, as the rail sees it. Null when it is not yours to answer. */
export function useDoor(): DoorControl | null {
  return useSyncExternalStore(subscribe, doorNow, serverSnapshot)
}
