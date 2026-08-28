'use client'

import { useSyncExternalStore } from 'react'

/**
 * The ways out of being stuck, published out of the scene for the rail.
 *
 * The same seam as `here-store` and `door-store`, for the same reason: the
 * controls belong in the rail beside the world, the rail is a layout several
 * routes above the scene, and only the scene owns the things they move. A
 * module-level store lets the scene write and the rail read without either
 * importing the other.
 *
 * Why the rail rather than the HUD over the world: being stuck is exactly the
 * situation in which the HUD is hardest to use. The mouse is captured while you
 * are playing, so an in-world button has to be reached by letting go of the
 * pointer first - and letting go is the thing anybody does the moment the game
 * stops responding. The rail is what is under the cursor when they do.
 *
 * Two of them, because a world has two things that get stuck and they are the
 * same problem twice: a person built into a corner, and a ball kicked somewhere
 * nobody can reach. Both are *offered* rather than detected - see `watchStuck`,
 * which decides when to ask and never when to move anything.
 *
 * Ephemeral by construction. Walk out of a world and there is nothing to be
 * stuck in, so the buttons disappear rather than going stale.
 *
 * ---------------------------------------------------------------------------
 * In `lib` rather than beside the lounge, which is where it started
 * ---------------------------------------------------------------------------
 * It moved when the XP runtime needed to publish here too. `src/app/xp` is
 * forbidden from importing `@/app/world/*` - the creator owns its own renderer
 * (docs/xp-creator.md 1.3) - and the rule is right, but *copying* this would
 * have been the one shape that cannot work: the rail reads one store, so two
 * copies is a button that only ever sees whichever scene got there first.
 *
 * The resolution is that this was never part of anybody's renderer. It is the
 * contract between **a scene and the rail**, and the rail belongs to neither
 * the lounge nor the creator - so it lives where both may reach it and the
 * import rule stays intact rather than excepted.
 */

export interface StuckWays {
  /** Put the body back where it came in. Always there while a world is drawn. */
  unstick: () => void
  /**
   * Ask the room to put the ball back on the centre spot.
   *
   * Null for every world that has no ball, and for a match whose ball is going
   * about its business - the offer appears when the ball has stopped going
   * anywhere at all, and not before.
   */
  ball: (() => void) | null
}

/** Who published, so a scene on its way out cannot clear the arriving one's. */
let key: string | null = null
let current: StuckWays | null = null
const listeners = new Set<() => void>()

function announce() {
  for (const listener of listeners) listener()
}

/**
 * Offer this world's ways out.
 *
 * Two callbacks rather than an object, and the snapshot is built here from
 * them: `useSyncExternalStore` compares snapshots by identity, so a caller
 * handing in a fresh object every render would be a fresh snapshot every render
 * and a rail that never stops re-rendering. Comparing the callbacks - which the
 * scene memoises - is what makes a re-publish free.
 */
export function publishStuck(
  scene: string,
  unstick: () => void,
  ball: (() => void) | null,
): void {
  if (key === scene && current?.unstick === unstick && current.ball === ball) return
  key = scene
  current = { unstick, ball }
  announce()
}

/**
 * Stop offering them, on unmount.
 *
 * Guarded on the key for the reason `clearDoor` is: two scenes overlap for a
 * moment during a client-side navigation, and the arriving one publishes before
 * the departing one cleans up. Without the guard, walking from the lounge into a
 * room would take the buttons away until the next render.
 */
export function clearStuck(scene: string): void {
  if (key !== scene) return
  key = null
  current = null
  announce()
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The ways out right now, read outside React. */
export function stuckNow(): StuckWays | null {
  return current
}

function serverSnapshot(): StuckWays | null {
  return null
}

/**
 * The ways out of being stuck, as the rail sees them.
 *
 * Null when there is no world on screen, which is what the rail renders on: a
 * button offering to move somebody who is not standing anywhere is a button
 * about nothing.
 */
export function useStuck(): StuckWays | null {
  return useSyncExternalStore(subscribe, stuckNow, serverSnapshot)
}
