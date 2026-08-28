'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { applyLoungeEdits } from '@/domain/lounge/actions'
import { MAX_BLOCKS_PER_EDIT } from '@/domain/lounge/events'

/**
 * Buffers world edits and flushes them as batches.
 *
 * This is the client half of the fix described in src/domain/lounge/events.ts.
 * Building drags across dozens of cells per second; sending one Server Action
 * per block would be hopeless for three separate reasons:
 *
 *   1. Next dispatches Server Actions one at a time per client, so they queue.
 *   2. Each one is a full load -> fold -> decide -> append -> project cycle.
 *   3. The round trip is far longer than the gap between two placements.
 *
 * So edits go into a local buffer, the scene renders from local state
 * immediately, and the buffer drains on an interval. The world you see is
 * always your own intent; the log catches up behind you.
 *
 * The tradeoff is honest and worth stating: if the tab closes mid-interval,
 * the last few hundred milliseconds of building are lost. For a creative
 * sandbox that is an acceptable trade for a usable frame rate. For anything
 * where the last edit matters, flush on every action and accept the latency.
 */

const FLUSH_INTERVAL_MS = 600

export interface PendingEdit {
  place: { x: number; y: number; z: number; model: string }[]
  remove: { x: number; y: number; z: number }[]
}

export interface EditBuffer {
  queuePlace: (block: { x: number; y: number; z: number; model: string }) => void
  queueRemove: (position: { x: number; y: number; z: number }) => void
  pending: number
  error: string | null
  saving: boolean
}

/**
 * `worldId` omitted means the workspace's own lounge.
 *
 * `persist: false` is the public demo, and it is a real mode rather than a
 * test seam: there is no workspace, no session and no stream to append to, so
 * every flush would be a Server Action that fails on the membership check and
 * a red banner over a world the visitor is being invited to enjoy. Switching it
 * off here rather than at each call site is the point - the scene goes on
 * queueing edits exactly as it always has, and the one thing that changes is
 * whether anything drains the queue. That keeps the demo honest about being the
 * same builder, and keeps "does this write?" a single answer in a single place.
 */
export function useEditBuffer(
  slug: string,
  worldId?: string,
  { persist = true }: { persist?: boolean } = {},
): EditBuffer {
  // A ref, not state: the render loop writes to this many times per second and
  // none of those writes should trigger a React render. The scene is already
  // rendering the optimistic world from its own state.
  const buffer = useRef<PendingEdit>({ place: [], remove: [] })
  const inFlight = useRef(false)

  const [pending, setPending] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const queuePlace = useCallback(
    (block: { x: number; y: number; z: number; model: string }) => {
      // Dropped rather than buffered when nothing will drain it. A demo left
      // open while somebody paints for ten minutes would otherwise grow an
      // array of every block they ever touched, for nobody.
      if (!persist) return
      buffer.current.place.push(block)
      setPending(buffer.current.place.length + buffer.current.remove.length)
    },
    [persist],
  )

  const queueRemove = useCallback(
    (position: { x: number; y: number; z: number }) => {
      if (!persist) return
      buffer.current.remove.push(position)
      setPending(buffer.current.place.length + buffer.current.remove.length)
    },
    [persist],
  )

  useEffect(() => {
    if (!persist) return

    const timer = setInterval(async () => {
      // Never overlap flushes. Two in-flight batches could reach the same chunk
      // stream at once and lose the optimistic-concurrency race against each
      // other, turning ordinary building into retry storms.
      if (inFlight.current) return
      if (buffer.current.place.length === 0 && buffer.current.remove.length === 0) {
        return
      }

      // Take at most one command's worth and leave the rest for the next tick,
      // so a paint-bucket drag does not exceed the server's per-edit cap.
      const batch: PendingEdit = {
        place: buffer.current.place.splice(0, MAX_BLOCKS_PER_EDIT),
        remove: buffer.current.remove.splice(0, MAX_BLOCKS_PER_EDIT),
      }

      inFlight.current = true
      setSaving(true)

      try {
        const result = await applyLoungeEdits(slug, batch, worldId)
        if (result.ok) {
          setError(null)
        } else {
          setError(result.error)
          // The server refused. Do NOT put the batch back - a rejected edit
          // will be rejected again, and retrying forever would wedge the
          // buffer. The optimistic world is now ahead of the log; reloading
          // reconciles it, which the banner tells the player to do.
        }
      } catch {
        setError('Lost contact with the server. Your last changes may not be saved.')
      } finally {
        inFlight.current = false
        setSaving(false)
        setPending(buffer.current.place.length + buffer.current.remove.length)
      }
    }, FLUSH_INTERVAL_MS)

    return () => clearInterval(timer)
  }, [slug, worldId, persist])

  return { queuePlace, queueRemove, pending, error, saving }
}
