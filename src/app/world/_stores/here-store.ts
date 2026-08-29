'use client'

import { useSyncExternalStore } from 'react'
import type { PlaceId } from '@kxb/peepz-world/places'

/**
 * Who is standing in the room with you, published out of the scene.
 *
 * The sidebar wants to list the people you are actually sharing a world with,
 * and the only thing that knows them is the presence channel inside the scene -
 * which lives several routes below the layout and can never render *above* it.
 * A module-level store is the seam: the scene writes, the rail reads, and
 * neither imports the other.
 *
 * Deliberately not a context. A provider would have to hang off the tenant
 * layout and thread through every scene as a prop, and the value changes on
 * presence sync - a few times a minute - so there is nothing to be gained by
 * putting it through React's tree.
 *
 * Ephemeral by construction: nobody persists it, nothing rehydrates it, and a
 * scene that unmounts takes its roster with it. "Who is online" here means
 * "who is in this room", which is the only sense of online this app can
 * actually answer - see the note in 20260727010000_lounge_presence.sql about
 * where the durable/ephemeral line is drawn.
 */

export interface HerePerson {
  userId: string
  name: string
  /** The avatar model id, so the rail can show the same face the world does. */
  avatar: string
}

export interface Here {
  /** The room being reported, or null when you are not in one. */
  place: PlaceId | null
  /** Everybody else in it. Never includes you - you know you are here. */
  people: HerePerson[]
}

/**
 * One shared empty value rather than a fresh object per read.
 *
 * `useSyncExternalStore` compares snapshots by identity and will loop forever
 * if the getter keeps handing back new objects, so both the initial state and
 * the server snapshot have to be this exact reference.
 */
const NOBODY: Here = { place: null, people: [] }

let current: Here = NOBODY
const listeners = new Set<() => void>()

function announce() {
  for (const listener of listeners) listener()
}

/** Same roster, in the same order? Then there is nothing to re-render for. */
function unchanged(a: HerePerson[], b: HerePerson[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (person, index) =>
        person.userId === b[index].userId &&
        person.name === b[index].name &&
        person.avatar === b[index].avatar,
    )
  )
}

/**
 * Report the room you are in.
 *
 * Called from a presence sync, which fires on every join and every leave -
 * including the ones that change nothing about the list. The equality check is
 * what keeps a quiet room from re-rendering the sidebar on a timer.
 */
export function publishHere(place: PlaceId, people: HerePerson[]): void {
  if (current.place === place && unchanged(current.people, people)) return
  current = { place, people }
  announce()
}

/**
 * Leave, on unmount.
 *
 * Guarded on the place, because two scenes overlap for a moment during a
 * client-side navigation: the one you are arriving at mounts and publishes
 * before the one you are leaving runs its cleanup. Without the guard the
 * departing scene would wipe the arriving one's roster and the rail would sit
 * empty until the next sync.
 */
export function leaveHere(place: PlaceId): void {
  if (current.place !== place) return
  current = NOBODY
  announce()
}

/**
 * Whether there is a world on screen at all, which is a different question.
 *
 * `place` names one of the four rooms, and a great deal is not one of them: an
 * arena being built, a match being fought, a world being visited from the
 * discovery page. None of those can be a `PlaceId` - the union is the four
 * places the travel bar knows, and widening it so the radio could ask this
 * would put arenas into the door, the knock and the place validator.
 *
 * So: a count, raised by any mounted scene. A count and not a boolean because
 * two scenes overlap for a moment during a client-side navigation, exactly as
 * `leaveHere` describes - a boolean would be cleared by the departing one and
 * the world would read as gone while a new one was drawing.
 */
let scenes = 0

/**
 * Which world the scene on screen is, when it says.
 *
 * Null for the lounge - the same convention the chat column uses, and the same
 * one `roomOf` reads. Undefined-but-mounted is a scene that did not say, which
 * is every scene that is not a room: the café and the house are places rather
 * than rooms, and neither has a conversation of its own.
 *
 * Kept beside the count and not folded into it, because the two are asked by
 * different callers - the radio wants "is a world drawing", the chat wants
 * "which one".
 */
let sceneWorld: string | null = null

/**
 * A scene is drawing. Returns the leave, for an effect's cleanup.
 *
 * `worldId` is the room this scene is, if it is one. Passing it is what lets the
 * chat tell "said here" from "said into another room from here" - see the bubble
 * note in `<ChatDock>`.
 */
export function enterScene(worldId: string | null = null): () => void {
  scenes += 1
  sceneWorld = worldId
  if (scenes === 1) announce()
  return () => {
    scenes -= 1
    if (scenes === 0) {
      sceneWorld = null
      announce()
    }
  }
}

/** Is any scene mounted? Read outside React. */
export function inSceneNow(): boolean {
  return scenes > 0
}

/** Which room the scene on screen is, or null for the lounge and everything else. */
export function sceneWorldNow(): string | null {
  return sceneWorld
}

/** Is any scene mounted? The radio's gate: music belongs to a world. */
export function useInScene(): boolean {
  return useSyncExternalStore(subscribe, inSceneNow, notInScene)
}

function notInScene(): boolean {
  return false
}

/**
 * Watch the room. Returns the unsubscribe.
 *
 * Exported rather than kept private because it is half of the store's actual
 * contract - `useHere` is the other half - and because a test that cannot see
 * *when* the store wakes its readers cannot check the thing the equality guard
 * above exists for.
 */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The room right now, read outside React. */
export function hereNow(): Here {
  return current
}

function serverSnapshot(): Here {
  return NOBODY
}

/** The room you are in, as the sidebar sees it. */
export function useHere(): Here {
  return useSyncExternalStore(subscribe, hereNow, serverSnapshot)
}
