'use client'

import { useCallback, useEffect, useRef } from 'react'
import { play } from '@/lib/audio/engine'

/**
 * A door sound when the room's roster changes.
 *
 * Presence hands out the whole roster on every sync rather than a join or a
 * leave event, so "somebody arrived" is something this has to work out by
 * comparing two lists. Three rules fall out of that, and each of them is a bug
 * if it is missed:
 *
 *   The first roster is a baseline, not four arrivals. Walking into a room
 *   where four people are already standing is one event - you arriving - and
 *   they should not each ring a bell at you.
 *
 *   A sync in which nothing changed is silent. Realtime re-sends the roster on
 *   reconnects and on its own schedule, and a chime every time the channel
 *   cleared its throat would be constant.
 *
 *   Three people arriving in one sync is one chime. It is a door, not a
 *   turnstile, and three overlapping copies of the same 200ms blip is a chord
 *   nobody chose. The catalogue's `minGapMs` would swallow the extras anyway;
 *   deciding it here means the intent is written down rather than implied by a
 *   number in another file.
 */
export function useRosterChime(): (userIds: readonly string[]) => void {
  /** Null until the first roster. That null is the baseline rule. */
  const known = useRef<Set<string> | null>(null)

  return useCallback((userIds: readonly string[]) => {
    const next = new Set(userIds)
    const previous = known.current
    known.current = next

    if (!previous) return

    // `some`, not a count: one chime per direction per sync.
    if (userIds.some((id) => !previous.has(id))) {
      play('arrive')
      return
    }

    // Only when nobody arrived. A sync that is one person in and one person out
    // is a room that changed, and the arrival is the more useful half to hear -
    // it is the one that means somebody is now standing behind you.
    for (const id of previous) {
      if (!next.has(id)) {
        play('depart')
        return
      }
    }
  }, [])
}

/**
 * The same thing, for rooms that hand out their roster as state.
 *
 * The lounge is told about its roster through a callback, so it uses
 * `useRosterChime` directly. The homestead rooms - café, house, garden - keep
 * theirs in `room.peers` instead, and an effect is the honest way to watch a
 * value rather than an event. Both ends run the same comparison, which is the
 * only part worth not having twice.
 */
export function useRoomChime(peers: readonly { userId: string }[]): void {
  const chime = useRosterChime()

  useEffect(() => {
    chime(peers.map((peer) => peer.userId))
  }, [peers, chime])
}
