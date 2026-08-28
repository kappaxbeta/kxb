'use client'

import { useSyncExternalStore } from 'react'

/**
 * The match you are standing in, published out of the match room.
 *
 * The rail wants to show what you are playing and offer the way out of it, and
 * the only thing that knows either is the match room - which lives several
 * routes below the tenant layout and can never render *above* it. A
 * module-level store is the seam: the room writes, the rail reads, and neither
 * imports the other.
 *
 * The same seam and the same argument as `@/app/world/here-store`, deliberately
 * copied rather than generalised. Two stores of six lines each are cheaper to
 * read than one abstraction that has to explain both.
 *
 * ---------------------------------------------------------------------------
 * Data crosses, behaviour does not
 * ---------------------------------------------------------------------------
 * Only plain values are published. It would be easy to put `walkOut` and
 * `endMatch` in here as callbacks and have the rail call them, and it would be
 * wrong: a function in a module store outlives the render that made it, closes
 * over state that has since moved on, and turns "which component owns this
 * action" into a question nobody can answer from either file.
 *
 * It is also unnecessary. `leaveBattle` and `cancelBattle` are server actions
 * taking a slug and a battle id, both of which are here, so the rail calls them
 * itself. The store carries what to *show*; the caller decides what to *do*.
 *
 * Ephemeral by construction. Nothing persists it, nothing rehydrates it, and a
 * match room that unmounts clears it on the way out - which is what makes "am I
 * in a match" answerable by whether this is null rather than by parsing a URL.
 */

export interface CurrentMatch {
  /** The space, for the actions the rail calls. */
  slug: string
  battleId: string
  /** What the match is called. */
  name: string
  /** The level being played. */
  xpName: string
  /** Freestyle, and the rest. The level's own preset. */
  preset: string
  /** Waiting, live, over - whatever the battle says. */
  status: string
  /** Are you a player, or watching? Decides whether Leave has anything to do. */
  joined: boolean
  /**
   * May you end it for everybody, *right now*?
   *
   * Read by both of the controls that do something to everybody else - End and
   * Restart - because it is the same question: the decider asks whoever set the
   * match up, whoever runs the space, or anybody left in it once the host has
   * gone, and it asks it of both commands. A second flag saying the same thing
   * is a second thing to keep in step.
   *
   * Resolved by the match room rather than published as its parts. The rule -
   * the host keeps the whistle while they are in the lobby, and it passes to
   * everybody once they have gone - belongs to that component, and a rail
   * deciding it again from `isHost` and `staff` would be the same rule written
   * twice in a file with no reason to know it. Already false once the match is
   * over, so nothing downstream re-derives that either.
   */
  canEnd: boolean
  /**
   * Who the match is between, for the rail's "who is here".
   *
   * ---------------------------------------------------------------------------
   * Because a match is not a place, and the rail only knew about places
   * ---------------------------------------------------------------------------
   * `here-store` answers "who is in the room with you" and is written by the
   * world scenes; its `PlaceId` is the four rooms of a world. A battle is none
   * of them, so somebody standing in a match - with an opponent, in a ring, both
   * names on the scoreboard in front of them - was told *"go into a place to see
   * who is there"*.
   *
   * The roster is published here rather than by teaching `here-store` about
   * matches, because the two answer genuinely different questions: that one is
   * presence, live off a channel and gone when you look away; this is *who the
   * match is between*, which is durable, comes off the battle, and is true of
   * somebody who has stepped out for a moment.
   */
  people: { userId: string; name: string; side: string | null }[]
  /**
   * Whoever is reading, so a roster can mark one of its rows "you".
   *
   * Carried rather than looked up again in the rail: the match room already has
   * it, and a second read is a second place that can disagree about who the
   * viewer is.
   */
  me: string
}

let current: CurrentMatch | null = null
const listeners = new Set<() => void>()

function announce() {
  for (const listener of listeners) listener()
}

/**
 * Same match, in the same state? Then there is nothing to re-render for.
 *
 * `useSyncExternalStore` compares snapshots by identity, so publishing a fresh
 * object on every poll of the match - which is every few seconds - would wake
 * the whole rail each time for a status that has not moved.
 */
function unchanged(a: CurrentMatch | null, b: CurrentMatch | null): boolean {
  if (a === null || b === null) return a === b

  return (
    a.slug === b.slug &&
    a.battleId === b.battleId &&
    a.name === b.name &&
    a.xpName === b.xpName &&
    a.preset === b.preset &&
    a.status === b.status &&
    a.joined === b.joined &&
    a.canEnd === b.canEnd &&
    a.me === b.me &&
    /**
     * The roster, by value.
     *
     * The match is polled every few seconds and publishes a fresh array each
     * time, so comparing by identity here would wake the whole rail on every
     * poll - which is the thing this function exists to prevent.
     */
    a.people.length === b.people.length &&
    a.people.every(
      (person, index) =>
        person.userId === b.people[index]?.userId &&
        person.name === b.people[index]?.name &&
        person.side === b.people[index]?.side,
    )
  )
}

/** Called by the match room. Pass null on the way out. */
export function publishMatch(next: CurrentMatch | null): void {
  if (unchanged(current, next)) return
  current = next
  announce()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function snapshot(): CurrentMatch | null {
  return current
}

/**
 * Null on the server, always.
 *
 * There is no match during a server render - the room that publishes one is a
 * client component that has not run yet - and returning anything else would
 * hydrate a rail showing a match nobody is in.
 */
function serverSnapshot(): null {
  return null
}

/** The match being played right now, or null. */
export function useCurrentMatch(): CurrentMatch | null {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot)
}
