'use client'

import { useCallback, useRef, useState } from 'react'
import {
  buyGround,
  moveProp,
  placeProp,
  removeProp,
  sellGround,
  serveCustomer,
} from '@/domain/homestead/actions'
import type { PlaceId } from '@/domain/homestead/events'

/**
 * Mirror what just happened locally into the workspace's event log.
 *
 * The scenes already apply every change to their own state immediately - that is
 * how they stayed playable at sixty frames a second when the save was a blob in
 * localStorage - so this is deliberately *not* a state container. It is a
 * one-way tap: the client remains the thing you are looking at, and each action
 * goes off to be recorded.
 *
 * That makes every change optimistic by construction, which is the right
 * trade here. A placement that has to wait for a round trip before the sofa
 * appears is a placement that feels broken, and the failure it is guarding
 * against - the decider refusing a purchase the client already thought was
 * affordable - is rare and recoverable by reloading.
 *
 * ---------------------------------------------------------------------------
 * Why there is no rollback
 * ---------------------------------------------------------------------------
 * When the server refuses, this reports the reason and leaves the local scene
 * alone. Undoing the move would mean the furniture jumping back under the
 * player's hands a second after they put it down, and the honest recovery -
 * reload and see the room as the log has it - is one the message asks for
 * explicitly. Silent divergence is the thing to avoid, not divergence.
 */
export interface HomesteadSync {
  place: (tile: string, propId: string, rotY: number) => void
  remove: (tile: string) => void
  move: (from: string, to: string, rotY: number) => void
  buy: (tiles: string[]) => void
  /** Sell ground back, shrinking a room. The mirror of `buy`. */
  sell: (tiles: string[]) => void
  serve: (dish: string, payment: number) => void
  /** The most recent refusal, for the HUD to show. Null once acknowledged. */
  error: string | null
  clearError: () => void
}

/**
 * `slug` is optional, and the absence is load-bearing rather than legacy.
 *
 * Every place lives inside a workspace now, so there is no signed-out prototype
 * left to be offline for. What passes `undefined` today is a *visitor*: the
 * homestead stream is derived from the session's own user, so a command fired
 * in somebody else's café would put the coins in your own purse. Handing the
 * hook no slug is a much stronger guarantee than disabling every button,
 * because it leaves no code path that can fire a command at all.
 */
export function useHomesteadSync(
  slug: string | undefined,
  place: PlaceId,
): HomesteadSync {
  const [error, setError] = useState<string | null>(null)

  /**
   * Server actions are serialised through a promise chain rather than fired in
   * parallel.
   *
   * They all land on one stream, and `executeCommand` resolves a collision by
   * re-reading and retrying. Firing four placements at once turns a
   * comfortable sequence of appends into four commands racing for the same
   * version, most of which retry - so the queue is not caution, it is the
   * faster path as well as the calmer one.
   */
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  const send = useCallback(
    (run: () => Promise<{ ok: boolean; error?: string }>) => {
      if (!slug) return
      queue.current = queue.current
        .then(run)
        .then((result) => {
          if (result && !result.ok && result.error) setError(result.error)
        })
        .catch(() => {
          setError('Lost contact with the space. Reload to see the real room.')
        })
    },
    [slug],
  )

  return {
    place: useCallback(
      (tile, propId, rotY) =>
        send(() => placeProp(slug!, { place, tile, propId, rotY })),
      [send, slug, place],
    ),
    remove: useCallback(
      (tile) => send(() => removeProp(slug!, { place, tile })),
      [send, slug, place],
    ),
    move: useCallback(
      (from, to, rotY) => send(() => moveProp(slug!, { place, from, to, rotY })),
      [send, slug, place],
    ),
    buy: useCallback(
      (tiles) => {
        if (tiles.length === 0) return
        send(() => buyGround(slug!, { place, tiles }))
      },
      [send, slug, place],
    ),
    sell: useCallback(
      (tiles) => {
        if (tiles.length === 0) return
        send(() => sellGround(slug!, { place, tiles }))
      },
      [send, slug, place],
    ),
    serve: useCallback(
      (dish, payment) => send(() => serveCustomer(slug!, { dish, payment })),
      [send, slug],
    ),
    error,
    clearError: useCallback(() => setError(null), []),
  }
}
