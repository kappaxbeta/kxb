'use client'

import { useSyncExternalStore } from 'react'

import {
  dropped,
  emptyPocket,
  holding,
  inHand,
  nextInHand,
  pocketed,
  type Pocket,
} from '@/domain/thingiverse/pocket'

/**
 * What you are carrying, shared between the three places that care.
 *
 * A module store on the same terms as `face-store`, and read in the same three
 * directions at once: the **panel** on L draws it and lives in the HUD, outside
 * the Canvas; the **key handler** that takes and puts lives in the scene; and
 * the thing that decides what a press of G means needs to know what is in your
 * hand while running inside a frame loop. Three surfaces, one fact, and no
 * ancestor common to all of them worth threading a provider through.
 *
 * Unlike `thing-life-store` beside it, this one *is* subscribable - the panel
 * genuinely renders from it, and a chip that did not update when you picked
 * something up would be the whole feature missing.
 *
 * Ephemeral by construction, like every other store here. See the note at the
 * top of `@/domain/thingiverse/pocket` for why a pocket that survived the room
 * is a different feature with three questions in it nobody has answered.
 */

let pocket: Pocket = emptyPocket()
const listeners = new Set<() => void>()

function changed(next: Pocket): void {
  if (next === pocket) return
  pocket = next
  for (const listener of listeners) listener()
}

/** Take something off a table. Refused, unchanged, when your pockets are full. */
export function putInPocket(item: string): boolean {
  const before = pocket
  changed(pocketed(pocket, item))
  return pocket !== before
}

/** Put down whatever is at this index. */
export function takeFromPocket(at: number): void {
  changed(dropped(pocket, at))
}

/** Pick which one is in your hand. */
export function holdInPocket(at: number | null): void {
  changed(holding(pocket, at))
}

/** Step to the next one, which is how you change hands without opening the panel. */
export function nextInPocket(): void {
  changed(nextInHand(pocket))
}

/** Forget it, on leaving the room. */
export function emptyPockets(): void {
  changed(emptyPocket())
}

/**
 * What is in your hand, read without subscribing.
 *
 * For the frame loop and the key handler, neither of which renders - and a
 * `useSyncExternalStore` in either would be a subscription that exists only to
 * re-render something that does not read it.
 */
export function heldNow(): string | undefined {
  return inHand(pocket)
}

/** And which one it is, for putting it down again. */
export function heldIndex(): number | null {
  return pocket.holding
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function snapshot(): Pocket {
  return pocket
}

/** What you are carrying, for whoever draws it. */
export function usePocket(): Pocket {
  return useSyncExternalStore(subscribe, snapshot, emptyPocket)
}
