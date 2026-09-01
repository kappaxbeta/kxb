'use client'

import { useSyncExternalStore } from 'react'
import type { BlueprintView, ThingView } from '@/domain/thingiverse/queries'
import type { SummonMatch } from '@/domain/thingiverse/summon'
import type { ThingTuning } from '@/domain/thingiverse/thing-events'

/**
 * The thingiverse, published out of the scene for the rail to render.
 *
 * The same seam `door-store` and `here-store` are, and it carries the most of
 * any of them - which is worth justifying, because the rule this folder follows
 * is that behaviour crosses these stores and data mostly does not.
 *
 * It has to here. The shelf and what is standing in the room are read by the
 * *page*, which is a server component under `/t/[slug]`, and edited from two
 * places at once: a panel floating over the world, and a tab in a rail that the
 * layout renders three route segments above it. Threading either list from the
 * page to the rail would mean lifting it into the layout, where it would be
 * fetched on every workspace page whether or not a world is on screen - and
 * fetched again, differently, for each room.
 *
 * So the scene stays the owner: it is handed the world's furniture with the
 * blocks, it applies every optimistic change, and it publishes the result here.
 * The rail is a second view of one state, not a second copy of it.
 *
 * Ephemeral by construction, like the door: walk out of the world and there is
 * nothing to summon into, so the tab empties rather than going stale.
 */

export interface ThingiverseState {
  /** The workspace, so an action has something to address. */
  slug: string
  /** The world these things stand in. Null is the lounge. */
  worldId: string | null
  /** What may be summoned: yours, and the space's public ones. */
  shelf: BlueprintView[]
  /** What is standing here, with each one's blueprint resolved. */
  things: ThingView[]
  /** The thing the rail is showing controls for, if any. */
  selectedId: string | null
  /** Whether this person may change anything here at all. */
  canBuild: boolean
  /**
   * Whether the next thing summoned stays when its owner leaves.
   *
   * A preference of this browser's rather than a fact about the world - see
   * `keepDefault` in `use-things`. It rides here because the control that sets
   * it is in the rail and the state is the scene's.
   */
  keepDefault: boolean
  /** Something is in flight. The rail disables its buttons rather than lying. */
  busy: boolean
  /** Why the last thing was refused, in this reader's language. */
  error: string | null
}

/**
 * The actions, kept out of the snapshot for the reason `DoorActions` gives:
 * `useSyncExternalStore` compares snapshots by identity, and a bag of closures
 * the hook rebuilds every render would spin the rail forever. They are read at
 * click time, when the latest set is the right set anyway.
 */
export interface ThingiverseActions {
  /** Open the preview holding this, ready to place. */
  summon: (match: SummonMatch) => void
  /** Answer `/thingiverse ball` - resolve the words and open the preview. */
  ask: (query: string) => void
  /** Pick up something that is already standing here, to put it down elsewhere. */
  carry: (id: string) => void
  select: (id: string | null) => void
  move: (id: string, cell: { x: number; y: number; z: number }) => void
  turn: (id: string) => void
  resize: (id: string, scale: number) => void
  tune: (id: string, tuning: ThingTuning) => void
  /** Make one furniture, or make it a loan. */
  setKeep: (id: string, keep: boolean) => void
  /** And the same choice for whatever gets summoned next. */
  chooseKeep: (keep: boolean) => void
  dismiss: (id: string) => void
  /** Share one of yours with the space, or take it back. */
  share: (blueprintId: string, visibility: 'private' | 'public') => void
  /** Whether this *kind* of thing falls. See `setFalls`. */
  setFalls: (blueprintId: string, falls: boolean) => void
  hand: (blueprintId: string, ownerId: string) => void
  rename: (blueprintId: string, name: string) => void
  retire: (blueprintId: string) => void
}

let actions: ThingiverseActions | null = null
let current: ThingiverseState | null = null
const listeners = new Set<() => void>()

function announce() {
  for (const listener of listeners) listener()
}

/**
 * Report the world's furniture.
 *
 * Called from the scene on every render, so the equality check is what keeps a
 * still room from re-rendering the rail sixty times a second. The lists are
 * compared by identity rather than by content, which is exact here because the
 * hook that owns them only ever replaces them - `setThings(current => ...)`
 * never mutates, so an unchanged list is the same array.
 */
export function publishThingiverse(
  state: ThingiverseState,
  next: ThingiverseActions,
): void {
  actions = next

  if (
    current &&
    current.slug === state.slug &&
    current.worldId === state.worldId &&
    current.shelf === state.shelf &&
    current.things === state.things &&
    current.selectedId === state.selectedId &&
    current.canBuild === state.canBuild &&
    current.keepDefault === state.keepDefault &&
    current.busy === state.busy &&
    current.error === state.error
  ) {
    return
  }

  current = state
  announce()
}

/**
 * Stop reporting, on unmount.
 *
 * Guarded on the slug and the world for the reason `clearDoor` is: two scenes
 * overlap for a moment during a client-side navigation, and the arriving one
 * publishes before the departing one cleans up. Without the guard, walking from
 * the lounge into a room would empty the tab until the next render.
 */
export function clearThingiverse(slug: string, worldId: string | null): void {
  if (current?.slug !== slug || current?.worldId !== worldId) return
  current = null
  actions = null
  announce()
}

export function thingiverseActions(): ThingiverseActions | null {
  return actions
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The world's furniture right now, read outside React. */
export function thingiverseNow(): ThingiverseState | null {
  return current
}

function serverSnapshot(): ThingiverseState | null {
  return null
}

/** What is on the shelf and in the room. Null when no world is on screen. */
export function useThingiverse(): ThingiverseState | null {
  return useSyncExternalStore(subscribe, thingiverseNow, serverSnapshot)
}

/**
 * `/thingiverse ball`, on its way from the chat box to the scene.
 *
 * A bell rather than a field on the state above, and the same shape
 * `summon-store` uses for `/battle`: the chat dock is a sibling of the rail and
 * knows nothing about what is on screen, so all it can honestly do is repeat
 * the words somebody typed. Whoever is drawing a world hears them.
 *
 * Separate from `ThingiverseActions.ask` because the two ends are different:
 * `ask` is the scene's own implementation, and this is the channel the chat
 * uses to reach it without importing it.
 */
const askers = new Set<(query: string) => void>()

/** Somebody typed `/thingiverse ball`, or `/xo ball`. Whoever draws a world, listen. */
export function callThingiverse(query: string): void {
  for (const asker of askers) asker(query)
}

/** Hear the call. Returns the unsubscribe, for an effect's cleanup. */
export function onThingiverse(listener: (query: string) => void): () => void {
  askers.add(listener)
  return () => {
    askers.delete(listener)
  }
}

/**
 * `/vehicle`, on the same wire as `/thingiverse`.
 *
 * A third bell rather than a query on the first, because the sentence means
 * something different: `/thingiverse ball` asks for a thing to *place*, and
 * `/vehicle kart` asks for one to be already in - summoned, entered, hands on
 * the wheel, one sentence. Bare `/vehicle` is the other end of the same verb:
 * put it away.
 */
const drivers = new Set<(query: string) => void>()

/** Somebody typed `/vehicle kart`, or a bare `/vehicle`. Whoever draws a world. */
export function callVehicle(query: string): void {
  for (const driver of drivers) driver(query)
}

export function onVehicle(listener: (query: string) => void): () => void {
  drivers.add(listener)
  return () => {
    drivers.delete(listener)
  }
}

/**
 * `/clip`, on the same wire.
 *
 * A second bell rather than a query on the first, because it is a different
 * request: `/thingiverse` asks for a *thing*, and this asks about your body -
 * what it can do, and which of those to do now.
 *
 * Its own set of listeners for the same reason the two are separate calls: a
 * scene that draws things but has no body in it (a still, a shot server) should
 * hear one and not the other.
 *
 * The word was not carried at first, on the argument that the answer is a menu
 * rather than a search - which was true of the menu and wrong about people.
 * `/clip wink` was typed, matched nothing, and went into the room's chat as a
 * line of text, which is the worst of the three things that could have
 * happened. It carries the word now: named, the body does it; unnamed or
 * unknown, the menu opens and says what there is.
 */
const clippers = new Set<(name: string) => void>()

/** Somebody typed `/clip`, or `/clip wink`. Whoever has a body on screen. */
export function callClip(name = ''): void {
  for (const clipper of clippers) clipper(name)
}

export function onClip(listener: (name: string) => void): () => void {
  clippers.add(listener)
  return () => {
    clippers.delete(listener)
  }
}

